import {
  type AnyNode,
  type AnyNodeId,
  emitter,
  type FollowsWallModeConfig,
  getEffectiveNode,
  getRegistryVersion,
  nodeRegistry,
  sceneRegistry,
  useLiveNodeOverrides,
  useLiveTransforms,
  useScene,
} from '@pascal-app/core'
import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import { Box3, type Camera, Matrix4, type Mesh, type Object3D, Plane, Vector3 } from 'three'
import type { ClippingGroup } from 'three/webgpu'
import { setDisplayCutRaycast, setDisplayCutRoot } from '../../lib/display-cut'
import { hideFromScene, showInScene } from '../../lib/scene-visibility'
import useViewer from '../../store/use-viewer'
import { wallFacingNegative, wallHiddenFromFacing } from '../wall/wall-cutout-cache'
import { type CappedFollower, FollowerCutCaps } from './follower-cut-caps'

/**
 * Wall mode for nodes of kinds that declare `capabilities.followsWallMode`. Walls hidden (`down`) and the
 * cutaway hide the node through the scene-visibility owner (`'wall-mode'` hold): off the scene layer it is
 * neither drawn, picked nor shadowed, and no material is ever touched. Walls up shows it. Translucent leaves
 * it shown as built. The cutaway decision is `wallHiddenFromFacing`, the one walls use. Walls keep their own
 * `WallCutout`.
 *
 * Low judges each follower by its extent over its level: wholly over the cut it is hidden like the walls'
 * stubs' neighbours, wholly under it it stands as built, and one the cut passes through is clipped at the cut
 * by the `ClippingGroup` it is rendered in (`FollowerClip`), picked only below the cut, and capped like a
 * wall. The clip cuts everything inside the group, so what is hosted on a clipped follower is clipped with
 * it, picked below the cut only, and capped by the same section. Nothing writes a material.
 */

const CAMERA_MOVE_DISTANCE = 0.1
const CAMERA_TURN_DOT = 0.9995
/** A follower this close to the cut counts as on the side it mostly stands on. */
const CUT_EPS = 1e-4

/** Whether the kind follows `mode` at all (`followsWallMode.modes`; every mode when it names none). */
const followsIn = (config: FollowsWallModeConfig, mode: FollowedMode) =>
  !config.modes || config.modes.includes(mode)

export type WallModeFollowViewerState = Pick<
  ReturnType<typeof useViewer.getState>,
  'wallMode' | 'geometryRevision'
> & { wallCutHeight?: number }

/** The wall modes a kind can name in `followsWallMode.modes`. */
type FollowedMode = 'down' | 'low' | 'cutaway'

/** The default cut height (`wallCutHeight` absent): what the viewer starts with. */
const DEFAULT_CUT_HEIGHT = 0.25

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

/** Every mesh under the object, what is hosted on it too: all of it is inside the clip. */
function allMeshes(object: Object3D, out: Mesh[] = []): Mesh[] {
  if ((object as Mesh).isMesh) out.push(object as Mesh)
  for (const child of object.children) allMeshes(child, out)
  return out
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

/** `straddle`: the cut passes through it, so it is clipped and capped and not hidden. */
type Follower = { hidden: boolean; straddle?: boolean; negativeFacing: boolean | undefined }

/** A follower being clipped: the group that does it, the level it is cut over and the plane now set. */
type Clipped = {
  clip: ClippingGroup
  level: Object3D
  meshes: Mesh[]
  group: Object3D
  constant: number
}

/** The `ClippingGroup` a follower is rendered in (`FollowerClip`), if it is. */
function clipGroupOf(group: Object3D): ClippingGroup | undefined {
  const parent = group.parent as (ClippingGroup & { userData: { followerClip?: boolean } }) | null
  return parent?.isClippingGroup && parent.userData.followerClip ? parent : undefined
}

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
    {
      node: AnyNode
      revision: number
      /** The group's matrix in the level's frame when the centre was taken. */
      placement: Matrix4
      centre: readonly [number, number] | null
    }
  >()
  private live: { transforms: unknown; overrides: unknown } | undefined
  /** Nodes a capture with whole walls has shown, to hide again after it. */
  private shownForCapture: string[] = []
  /** Followers the Low cut passes through now, and the caps they have. */
  private readonly clipped = new Map<string, Clipped>()
  private readonly caps = new FollowerCutCaps()
  private lastCamera: Camera | undefined
  /** While a capture presents the walls low: the height it cuts at, whatever the live mode. */
  private captureCut: number | undefined
  /** Clips and caps a capture of whole walls has put away, to bring back after it. */
  private suspended: (() => void)[] = []
  private static readonly live = new Set<WallModeFollowCache>()

  constructor(private readonly viewerStore: WallModeFollowViewerStore = useViewer) {
    WallModeFollowCache.live.add(this)
  }

  /**
   * Sets every clip plane from where its level stands now. A capture moves the levels after it
   * has announced itself, so it calls this once they are where the picture needs them.
   */
  static refreshPlanes(): void {
    for (const cache of WallModeFollowCache.live) cache.syncPlanes()
  }

  /** The viewer's state, or what a capture presenting the walls low needs in its place. */
  private effectiveViewer(): WallModeFollowViewerState {
    const viewer = this.viewerStore.getState()
    if (this.captureCut === undefined) return viewer
    return { ...viewer, wallMode: 'low', wallCutHeight: this.captureCut }
  }

  private cutHeight(viewer: WallModeFollowViewerState): number {
    return viewer.wallCutHeight ?? DEFAULT_CUT_HEIGHT
  }

  /** Each clipped follower's plane, from its level's place in the world now: levels lift and animate. */
  private syncPlanes(): void {
    const height = this.cutHeight(this.effectiveViewer())
    for (const entry of this.clipped.values()) {
      entry.level.updateWorldMatrix(true, false)
      const constant = entry.level.matrixWorld.elements[13]! + height
      if (entry.constant === constant && entry.clip.clippingPlanes.length > 0) continue
      entry.constant = constant
      entry.clip.clippingPlanes = [new Plane(new Vector3(0, -1, 0), constant)]
    }
  }

  update(camera: Camera): void {
    this.lastCamera = camera
    const viewer = this.effectiveViewer()
    const scene = useScene.getState()
    const followers = this.followerKinds()
    const previous = this.viewer
    const nodesChanged = this.nodes !== scene.nodes
    const inputsChanged =
      nodesChanged ||
      this.registryVersion !== this.followersVersion ||
      !previous ||
      previous.wallMode !== viewer.wallMode ||
      previous.wallCutHeight !== viewer.wallCutHeight ||
      previous.geometryRevision !== viewer.geometryRevision

    // A block dragged or turned live (itself or something above it) moves without a scene write.
    const transforms = useLiveTransforms.getState().transforms
    const overrides = useLiveNodeOverrides.getState().overrides
    const liveChanged =
      !!this.live && (this.live.transforms !== transforms || this.live.overrides !== overrides)
    this.live = { transforms, overrides }
    // A capture that never reported its end must not leave nodes shown.
    if (this.shownForCapture.length > 0 || this.suspended.length > 0) this.afterCapture()
    this.syncPlanes()

    camera.getWorldDirection(this.cameraDirection)
    const cutaway = viewer.wallMode === 'cutaway'
    const cameraChanged =
      cutaway &&
      (!(camera.position.distanceTo(this.lastCameraPosition) <= CAMERA_MOVE_DISTANCE) ||
        this.cameraDirection.dot(this.lastCameraDirection) < CAMERA_TURN_DOT)
    if (!(inputsChanged || cameraChanged || liveChanged)) return
    if (cameraChanged) {
      this.lastCameraPosition.copy(camera.position)
      this.lastCameraDirection.copy(this.cameraDirection)
    }

    if (nodesChanged || liveChanged) this.levelCentres.clear()
    this.nodes = scene.nodes
    this.viewer = viewer
    this.registryVersion = this.followersVersion
    // Nothing is hidden in the other modes: let go of what was, and keep no entries.
    if (viewer.wallMode !== 'down' && viewer.wallMode !== 'low' && !cutaway) {
      for (const id of [...this.tracked.keys()]) this.release(id)
      this.caps.clear()
      return
    }

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
        // re-holds them (idempotent); a camera or live-drag pass acts on a changed decision.
        if (!inputsChanged && previousFollower?.hidden === follower.hidden) continue
        setHidden(meshesOf(group, node), follower.hidden)
        this.applyClip(id, group, node, follower, scene.nodes)
        setAffected(id, follower.hidden || follower.straddle === true)
      }
    }
    for (const id of [...this.tracked.keys()]) {
      if (!seen.has(id)) this.release(id)
    }
    this.syncPlanes()
    this.remakeCaps(viewer)
  }

  /** Clips the follower at the cut while the cut passes through it, and lets go of the clip when it does not. */
  private applyClip(
    id: string,
    group: Object3D,
    node: AnyNode,
    follower: Follower,
    nodes: Readonly<Record<string, AnyNode>>,
  ): void {
    const clip = follower.straddle ? clipGroupOf(group) : undefined
    const level = follower.straddle ? this.levelObjectOf(node, nodes) : undefined
    const before = this.clipped.get(id)
    if (!(clip && level)) {
      if (before) this.unclip(id)
      return
    }
    const meshes = allMeshes(group)
    // The clip cuts all that is in its group, what is hosted on the follower too: they are picked
    // below the cut only, as the follower is.
    if (before) for (const mesh of before.meshes) this.stopFiltering(mesh)
    for (const mesh of meshes) {
      setDisplayCutRoot(mesh, level)
      setDisplayCutRaycast(mesh, true)
    }
    clip.enabled = true
    clip.clipShadows = true
    this.clipped.set(id, { clip, level, meshes, group, constant: before?.constant ?? Number.NaN })
  }

  private levelObjectOf(
    node: AnyNode,
    nodes: Readonly<Record<string, AnyNode>>,
  ): Object3D | undefined {
    for (
      let at: AnyNode | undefined = node;
      at;
      at = at.parentId ? nodes[at.parentId] : undefined
    ) {
      if (at.type === 'level') return sceneRegistry.nodes.get(at.id)
    }
    return undefined
  }

  private stopFiltering(mesh: Mesh): void {
    setDisplayCutRaycast(mesh, false)
    setDisplayCutRoot(mesh, null)
  }

  private unclip(id: string): void {
    const entry = this.clipped.get(id)
    if (!entry) return
    this.clipped.delete(id)
    entry.clip.enabled = false
    entry.clip.clippingPlanes = []
    for (const mesh of entry.meshes) this.stopFiltering(mesh)
  }

  /** The caps of the followers clipped now, at the height they are clipped at. */
  private remakeCaps(viewer: WallModeFollowViewerState): void {
    const followers: CappedFollower[] = []
    for (const [id, entry] of this.clipped)
      followers.push({ id, group: entry.group, meshes: entry.meshes, level: entry.level })
    this.caps.update(followers, this.cutHeight(viewer), useViewer.getState().shading)
  }

  /** Shows every followed node again, as built. */
  dispose(): void {
    this.afterCapture()
    for (const id of [...this.tracked.keys()]) this.release(id)
    this.caps.dispose()
    WallModeFollowCache.live.delete(this)
    this.viewer = undefined
    this.nodes = undefined
  }

  /**
   * A capture of whole walls, or an export, sees every followed node whole: no clip, no cap. A
   * capture of low walls judges the followers by its own `cutHeight` as the live view does by the
   * slider, whatever the live mode is.
   */
  beforeCapture(
    event:
      | { wholeWalls?: boolean; exporting?: boolean; wallsLow?: boolean; cutHeight?: number }
      | undefined,
  ): void {
    if (event?.wallsLow && !event.exporting) {
      this.captureCut = event.cutHeight ?? this.cutHeight(this.viewerStore.getState())
      this.viewer = undefined
      if (this.lastCamera) this.update(this.lastCamera)
      return
    }
    if (!(event?.wholeWalls || event?.exporting)) return
    for (const [id, follower] of this.tracked) {
      if (!follower.hidden) continue
      const group = sceneRegistry.nodes.get(id)
      if (!group) continue
      setHidden(meshesOf(group, this.nodes?.[id as AnyNodeId]), false)
      this.shownForCapture.push(id)
    }
    for (const entry of this.clipped.values()) {
      const { clip } = entry
      clip.enabled = false
      this.suspended.push(() => {
        clip.enabled = true
      })
    }
    this.suspended.push(FollowerCutCaps.hideAll())
  }

  afterCapture(): void {
    if (this.captureCut !== undefined) {
      this.captureCut = undefined
      this.viewer = undefined
      if (this.lastCamera) this.update(this.lastCamera)
    }
    for (const restore of this.suspended.splice(0)) restore()
    for (const id of this.shownForCapture.splice(0)) {
      const group = sceneRegistry.nodes.get(id)
      if (group && this.tracked.get(id)?.hidden) {
        setHidden(meshesOf(group, this.nodes?.[id as AnyNodeId]), true)
      }
    }
  }

  private release(id: string): void {
    this.unclip(id)
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
    if ((mode === 'down' || mode === 'low' || mode === 'cutaway') && !followsIn(config, mode))
      return { hidden: false, negativeFacing: undefined }
    if (mode === 'down') return { hidden: true, negativeFacing: undefined }
    if (mode === 'low') return this.decideLow(node, group, viewer, nodes)
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

  /**
   * Low: by its extent over its level. Wholly over the cut the follower is hidden; wholly under it
   * stands as built; the cut through it clips and caps it. One with no meshes to judge is hidden.
   */
  private decideLow(
    node: AnyNode,
    group: Object3D,
    viewer: WallModeFollowViewerState,
    nodes: Readonly<Record<string, AnyNode>>,
  ): Follower {
    const level = this.levelObjectOf(node, nodes)
    const extent = level ? this.heightsOver(node, group, level) : null
    if (!extent) return { hidden: true, negativeFacing: undefined }
    const height = this.cutHeight(viewer)
    if (extent.min >= height - CUT_EPS) return { hidden: true, negativeFacing: undefined }
    if (extent.max <= height + CUT_EPS) return { hidden: false, negativeFacing: undefined }
    // The cut can only clip a follower that is rendered in a clip group; one that is not is hidden.
    if (!clipGroupOf(group)) return { hidden: true, negativeFacing: undefined }
    return { hidden: false, straddle: true, negativeFacing: undefined }
  }

  /** How low and how high the node's own meshes reach over `level`. */
  private heightsOver(node: AnyNode, group: Object3D, level: Object3D) {
    level.updateWorldMatrix(true, false)
    scratchInverse.copy(level.matrixWorld).invert()
    group.updateWorldMatrix(true, true)
    scratchBox.makeEmpty()
    for (const mesh of meshesOf(group, node)) {
      const geometry = mesh.geometry
      if (!geometry) continue
      if (!geometry.boundingBox) geometry.computeBoundingBox()
      if (!geometry.boundingBox || geometry.boundingBox.isEmpty()) continue
      scratchMatrix.multiplyMatrices(scratchInverse, mesh.matrixWorld)
      scratchBox.union(geometry.boundingBox.clone().applyMatrix4(scratchMatrix))
    }
    return scratchBox.isEmpty() ? null : { min: scratchBox.min.y, max: scratchBox.max.y }
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
    levelObject.updateWorldMatrix(true, false)
    scratchInverse.copy(levelObject.matrixWorld).invert()
    group.updateWorldMatrix(true, false)
    const placement = new Matrix4().multiplyMatrices(scratchInverse, group.matrixWorld)
    if (
      cached &&
      cached.node === node &&
      cached.revision === revision &&
      cached.placement.equals(placement)
    ) {
      return cached.centre
    }
    group.updateWorldMatrix(true, true)
    scratchBox.makeEmpty()
    for (const mesh of meshesOf(group, node)) {
      const geometry = mesh.geometry
      if (!geometry) continue
      if (!geometry.boundingBox) geometry.computeBoundingBox()
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
    this.nodeCentres.set(node.id, { node, revision, placement, centre })
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
      const declared = nodes[childId]
      if (declared?.type !== 'wall') continue
      // Walls moved live (a group move) count where they are, not where they were committed.
      const wall = getEffectiveNode(declared)
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
    const before = (event?: {
      wholeWalls?: boolean
      exporting?: boolean
      wallsLow?: boolean
      cutHeight?: number
    }) => cache.beforeCapture(event)
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
