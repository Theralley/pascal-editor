import {
  type AnyNode,
  type AnyNodeId,
  emitter,
  type FollowsWallModeConfig,
  getRegistryVersion,
  nodeRegistry,
  sceneRegistry,
  useScene,
} from '@pascal-app/core'
import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import { Box3, type Camera, Matrix4, type Mesh, type Object3D, Vector3 } from 'three'
import { hideFromScene, showInScene } from '../../lib/scene-visibility'
import useViewer from '../../store/use-viewer'
import { wallFacingNegative, wallHiddenFromFacing } from '../wall/wall-cutout-cache'

/**
 * Wall mode for nodes of kinds that declare `capabilities.followsWallMode`. Walls down and the
 * cutaway hide the node through the scene-visibility owner (`'wall-mode'` hold): off the scene
 * layer it is neither drawn, picked nor shadowed, and no material is ever touched. Walls up shows
 * it. Translucent leaves it shown as built until the display cut gives followers a see-through look.
 * The cutaway decision is `wallHiddenFromFacing`, the one walls use. Walls keep their own `WallCutout`.
 */

const CAMERA_MOVE_DISTANCE = 0.1
const CAMERA_TURN_DOT = 0.9995

export type WallModeFollowViewerState = Pick<
  ReturnType<typeof useViewer.getState>,
  'wallMode' | 'geometryRevision'
>

export type WallModeFollowViewerStore = { getState: () => WallModeFollowViewerState }

const affectedIds = new Set<string>()
const affectedListeners = new Set<(nodeId: string) => void>()

/** Whether the wall mode currently hides this node. */
export function isWallModeAffected(nodeId: string): boolean {
  return affectedIds.has(nodeId)
}

/**
 * Calls back whenever the wall mode starts or stops hiding a node, so a system that caches the
 * node's meshes (the node batch) can release or re-offer it.
 */
export function subscribeWallModeAffected(listener: (nodeId: string) => void): () => void {
  affectedListeners.add(listener)
  return () => {
    affectedListeners.delete(listener)
  }
}

function setAffected(nodeId: string, affected: boolean): void {
  if (affectedIds.has(nodeId) === affected) return
  if (affected) affectedIds.add(nodeId)
  else affectedIds.delete(nodeId)
  for (const listener of affectedListeners) listener(nodeId)
}

function collectMeshes(object: Object3D, out: Mesh[], hostedRoots: ReadonlySet<Object3D>): void {
  if (hostedRoots.has(object)) return
  const mesh = object as Mesh
  if (mesh.isMesh) out.push(mesh)
  for (const child of object.children) collectMeshes(child, out, hostedRoots)
}

function hostedRootsOf(node: AnyNode): Set<Object3D> {
  const roots = new Set<Object3D>()
  for (const childId of (node as { children?: readonly string[] }).children ?? []) {
    const child = sceneRegistry.nodes.get(childId)
    if (child) roots.add(child)
  }
  return roots
}

/** The node's meshes: every one is held, since layers are per object and not inherited. */
function meshesOf(group: Object3D, node: AnyNode | undefined): Mesh[] {
  const meshes: Mesh[] = []
  collectMeshes(group, meshes, node ? hostedRootsOf(node) : new Set())
  return meshes
}

function setHidden(meshes: readonly Mesh[], hidden: boolean): void {
  for (const mesh of meshes) {
    if (hidden) hideFromScene(mesh, 'wall-mode')
    else showInScene(mesh, 'wall-mode')
  }
}

type Follower = { hidden: boolean; negativeFacing: boolean | undefined }

const scratchBox = new Box3()
const scratchMatrix = new Matrix4()
const scratchInverse = new Matrix4()
const scratchNormal = new Vector3()

export class WallModeFollowCache {
  private readonly tracked = new Map<string, Follower>()
  private readonly cameraDirection = new Vector3()
  private readonly lastCameraPosition = new Vector3(NaN, NaN, NaN)
  private readonly lastCameraDirection = new Vector3()
  private nodes: ReturnType<typeof useScene.getState>['nodes'] | undefined
  private viewer: WallModeFollowViewerState | undefined
  private registryVersion = -1
  private followersVersion = -1
  private followers: ReadonlyMap<string, FollowsWallModeConfig> = new Map()
  private readonly levelCentres = new Map<string, readonly [number, number]>()
  private readonly nodeCentres = new Map<
    string,
    { node: AnyNode; revision: number; centre: readonly [number, number] | null }
  >()
  /** Nodes a capture with whole walls has shown, to hide again after it. */
  private shownForCapture: string[] = []

  constructor(private readonly viewerStore: WallModeFollowViewerStore = useViewer) {}

  update(camera: Camera): void {
    const viewer = this.viewerStore.getState()
    const scene = useScene.getState()
    const followers = this.followerKinds()
    const previous = this.viewer
    const nodesChanged = this.nodes !== scene.nodes
    const inputsChanged =
      nodesChanged ||
      this.registryVersion !== this.followersVersion ||
      !previous ||
      previous.wallMode !== viewer.wallMode ||
      previous.geometryRevision !== viewer.geometryRevision

    camera.getWorldDirection(this.cameraDirection)
    const cutaway = viewer.wallMode === 'cutaway'
    const cameraChanged =
      cutaway &&
      (!(camera.position.distanceTo(this.lastCameraPosition) <= CAMERA_MOVE_DISTANCE) ||
        this.cameraDirection.dot(this.lastCameraDirection) < CAMERA_TURN_DOT)
    if (!(inputsChanged || cameraChanged)) return
    if (cameraChanged) {
      this.lastCameraPosition.copy(camera.position)
      this.lastCameraDirection.copy(this.cameraDirection)
    }

    if (nodesChanged) this.levelCentres.clear()
    this.nodes = scene.nodes
    this.viewer = viewer
    this.registryVersion = this.followersVersion
    // Nothing is hidden in the other modes, and nothing needs undoing when nothing was.
    if (viewer.wallMode !== 'down' && !cutaway && this.tracked.size === 0) return

    const seen = new Set<string>()
    for (const [kind, config] of followers) {
      for (const id of sceneRegistry.byType[kind] ?? []) {
        const node = scene.nodes[id as AnyNodeId]
        const group = sceneRegistry.nodes.get(id)
        if (!(node && group) || config.appliesTo?.(node) === false) continue
        seen.add(id)
        const previousFollower = this.tracked.get(id)
        const follower = this.decide(
          node,
          config,
          group,
          viewer,
          previousFollower?.negativeFacing,
          scene.nodes,
        )
        this.tracked.set(id, follower)
        // Holds are per mesh and a rebuild brings fresh meshes, so a pass that saw new inputs
        // re-holds them (idempotent); a camera-only pass acts on a changed decision.
        if (!inputsChanged && previousFollower?.hidden === follower.hidden) continue
        setHidden(meshesOf(group, node), follower.hidden)
        setAffected(id, follower.hidden)
      }
    }
    for (const id of [...this.tracked.keys()]) {
      if (!seen.has(id)) this.release(id)
    }
  }

  /** Shows every followed node again, as built. */
  dispose(): void {
    this.afterCapture()
    for (const id of [...this.tracked.keys()]) this.release(id)
    this.viewer = undefined
    this.nodes = undefined
  }

  /** A capture of whole walls sees every followed node, as it sees every wall. */
  beforeCapture(wholeWalls: boolean): void {
    if (!wholeWalls) return
    for (const [id, follower] of this.tracked) {
      if (!follower.hidden) continue
      const group = sceneRegistry.nodes.get(id)
      if (!group) continue
      setHidden(meshesOf(group, this.nodes?.[id as AnyNodeId]), false)
      this.shownForCapture.push(id)
    }
  }

  afterCapture(): void {
    for (const id of this.shownForCapture.splice(0)) {
      const group = sceneRegistry.nodes.get(id)
      if (group && this.tracked.get(id)?.hidden) {
        setHidden(meshesOf(group, this.nodes?.[id as AnyNodeId]), true)
      }
    }
  }

  private release(id: string): void {
    this.tracked.delete(id)
    this.nodeCentres.delete(id)
    const group = sceneRegistry.nodes.get(id)
    if (group) setHidden(meshesOf(group, this.nodes?.[id as AnyNodeId]), false)
    setAffected(id, false)
  }

  private followerKinds(): ReadonlyMap<string, FollowsWallModeConfig> {
    const version = getRegistryVersion()
    if (version !== this.followersVersion) {
      const kinds = new Map<string, FollowsWallModeConfig>()
      for (const [kind, definition] of nodeRegistry.entries()) {
        const follows = definition.capabilities?.followsWallMode
        if (follows) kinds.set(kind, follows)
      }
      this.followers = kinds
      this.followersVersion = version
    }
    return this.followers
  }

  private decide(
    node: AnyNode,
    config: FollowsWallModeConfig,
    group: Object3D,
    viewer: WallModeFollowViewerState,
    previousNegative: boolean | undefined,
    nodes: Readonly<Record<string, AnyNode>>,
  ): Follower {
    const mode = viewer.wallMode
    if (mode === 'down') return { hidden: true, negativeFacing: undefined }
    if (mode !== 'cutaway') return { hidden: false, negativeFacing: undefined }
    const facing = config.facing
      ? this.declaredFacing(config.facing(node, nodes), group)
      : this.outwardFacing(node, group, viewer.geometryRevision, nodes)
    if (!facing) return { hidden: false, negativeFacing: undefined }
    const negativeFacing = wallFacingNegative(
      facing.worldNormal.dot(this.cameraDirection),
      previousNegative,
    )
    return { hidden: wallHiddenFromFacing(facing, 'cutaway', negativeFacing), negativeFacing }
  }

  private declaredFacing(
    facing: ReturnType<NonNullable<FollowsWallModeConfig['facing']>>,
    group: Object3D,
  ) {
    if (!facing) return undefined
    group.parent?.updateWorldMatrix(true, false)
    const worldNormal = new Vector3(facing.normal[0], 0, facing.normal[1])
    if (group.parent) worldNormal.transformDirection(group.parent.matrixWorld)
    return { frontSide: facing.frontSide, backSide: facing.backSide, worldNormal }
  }

  /**
   * The default: the node is the building's exterior, facing away from the centre of its level's
   * walls. Both centres are in the level's own frame, so moving anything above the level changes
   * nothing; only the outward direction is taken to world space, at the moment of the decision.
   */
  private outwardFacing(
    node: AnyNode,
    group: Object3D,
    revision: number,
    nodes: Readonly<Record<string, AnyNode>>,
  ) {
    const levelId = node.parentId
    const levelObject = levelId ? sceneRegistry.nodes.get(levelId) : undefined
    if (!(levelId && levelObject)) return undefined
    const buildingCentre = this.levelCentre(levelId, nodes)
    const centre = this.nodeCentre(node, group, levelObject, revision)
    if (!(buildingCentre && centre)) return undefined
    const dx = centre[0] - buildingCentre[0]
    const dz = centre[1] - buildingCentre[1]
    const length = Math.hypot(dx, dz)
    if (length < 1e-6) return undefined
    levelObject.updateWorldMatrix(true, false)
    scratchNormal.set(dx / length, 0, dz / length).transformDirection(levelObject.matrixWorld)
    return {
      frontSide: 'exterior' as const,
      backSide: 'interior' as const,
      worldNormal: scratchNormal,
    }
  }

  /** The centre of the node's built meshes in the level's frame, from their geometry. */
  private nodeCentre(node: AnyNode, group: Object3D, levelObject: Object3D, revision: number) {
    const cached = this.nodeCentres.get(node.id)
    if (cached && cached.node === node && cached.revision === revision) return cached.centre
    levelObject.updateWorldMatrix(true, false)
    scratchInverse.copy(levelObject.matrixWorld).invert()
    group.updateWorldMatrix(true, true)
    scratchBox.makeEmpty()
    for (const mesh of meshesOf(group, node)) {
      const geometry = mesh.geometry
      if (!geometry) continue
      geometry.boundingBox ??= (geometry.computeBoundingBox(), geometry.boundingBox)
      if (!geometry.boundingBox || geometry.boundingBox.isEmpty()) continue
      scratchMatrix.multiplyMatrices(scratchInverse, mesh.matrixWorld)
      scratchBox.union(geometry.boundingBox.clone().applyMatrix4(scratchMatrix))
    }
    const centre = scratchBox.isEmpty()
      ? null
      : ([
          (scratchBox.min.x + scratchBox.max.x) / 2,
          (scratchBox.min.z + scratchBox.max.z) / 2,
        ] as const)
    this.nodeCentres.set(node.id, { node, revision, centre })
    return centre
  }

  /** The centre of the level's walls in the level's frame, from the scene's wall nodes. */
  private levelCentre(levelId: string, nodes: Readonly<Record<string, AnyNode>>) {
    const cached = this.levelCentres.get(levelId)
    if (cached) return cached
    const level = nodes[levelId]
    if (!level) return null
    let minX = Infinity
    let maxX = -Infinity
    let minZ = Infinity
    let maxZ = -Infinity
    for (const childId of (level as { children?: readonly string[] }).children ?? []) {
      const wall = nodes[childId]
      if (wall?.type !== 'wall') continue
      for (const [x, z] of [wall.start, wall.end]) {
        minX = Math.min(minX, x)
        maxX = Math.max(maxX, x)
        minZ = Math.min(minZ, z)
        maxZ = Math.max(maxZ, z)
      }
    }
    if (!Number.isFinite(minX)) return null
    const centre = [(minX + maxX) / 2, (minZ + maxZ) / 2] as const
    this.levelCentres.set(levelId, centre)
    return centre
  }
}

/**
 * After GeometrySystem (2), which rebuilds the meshes this holds, and before the node batch (5),
 * which reads {@link isWallModeAffected} to release what this hides.
 */
export const WALL_MODE_FOLLOW_FRAME_PRIORITY = 3

export const WallModeFollowSystem = ({
  viewerStore = useViewer,
}: {
  viewerStore?: WallModeFollowViewerStore
}) => {
  const cache = useMemo(() => new WallModeFollowCache(viewerStore), [viewerStore])

  useFrame((state) => cache.update(state.camera), WALL_MODE_FOLLOW_FRAME_PRIORITY)

  useEffect(() => {
    const before = (event?: { wholeWalls?: boolean }) =>
      cache.beforeCapture(event?.wholeWalls === true)
    const after = () => cache.afterCapture()
    emitter.on('thumbnail:before-capture', before)
    emitter.on('thumbnail:after-capture', after)
    return () => {
      emitter.off('thumbnail:before-capture', before)
      emitter.off('thumbnail:after-capture', after)
      cache.dispose()
    }
  }, [cache])

  return null
}
