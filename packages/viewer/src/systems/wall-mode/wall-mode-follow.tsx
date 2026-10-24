import {
  type AnyNode,
  type AnyNodeId,
  type FollowsWallModeConfig,
  getRegistryVersion,
  nodeRegistry,
  sceneRegistry,
  useScene,
  type WallModeFacing,
} from '@pascal-app/core'
import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import { type Camera, type Color, type Material, type Mesh, type Object3D, Vector3 } from 'three'
import useViewer from '../../store/use-viewer'
import {
  sameMaterialArray,
  wallFacingNegative,
  wallHiddenFromFacing,
} from '../wall/wall-cutout-cache'
import { createInvisibleWallMaterial, createTranslucentWallMaterial } from '../wall/wall-materials'

/**
 * Wall mode for kinds that declare `capabilities.followsWallMode`: the same hide decision
 * (`wallHiddenFromFacing`) and the same see-through materials walls get, applied to the meshes the
 * kind's geometry builds. Walls keep their own `WallCutout`.
 */

const FOLLOWER_FALLBACK_COLOR = '#e9e7e3'

type FollowerVariant = 'visible' | 'invisible' | 'translucent'

export type WallModeFollowViewerState = Pick<
  ReturnType<typeof useViewer.getState>,
  'wallMode' | 'shading' | 'textures' | 'geometryRevision'
>

export type WallModeFollowViewerStore = { getState: () => WallModeFollowViewerState }

const affectedIds = new Set<string>()
const affectedListeners = new Set<(nodeId: string) => void>()

/** Whether the wall mode currently changes how this node draws (hidden or see-through). */
export function isWallModeAffected(nodeId: string): boolean {
  return affectedIds.has(nodeId)
}

/**
 * Calls back whenever a node starts or stops being drawn differently by the wall mode, so a system
 * that caches the node's meshes (the node batch) can release or re-offer it.
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

type MeshRecord = {
  original: Material | Material[]
  applied: Material | Material[]
  variant: FollowerVariant
  shading: string
}

const meshRecords = new WeakMap<Mesh, MeshRecord>()
const variantMaterials = new WeakMap<Material, Map<string, Material>>()

function variantMaterial(
  source: Material,
  variant: Exclude<FollowerVariant, 'visible'>,
  shading: 'solid' | 'rendered',
): Material {
  const key = `${variant}:${shading}`
  let byKey = variantMaterials.get(source)
  if (!byKey) {
    byKey = new Map()
    variantMaterials.set(source, byKey)
  }
  let material = byKey.get(key)
  if (!material) {
    const color = (source as { color?: Color }).color
    const hex = color ? `#${color.getHexString()}` : FOLLOWER_FALLBACK_COLOR
    material =
      variant === 'invisible'
        ? createInvisibleWallMaterial(hex, shading)
        : createTranslucentWallMaterial(hex, shading)
    byKey.set(key, material)
  }
  return material
}

function applyToMesh(mesh: Mesh, variant: FollowerVariant, shading: 'solid' | 'rendered'): void {
  let record = meshRecords.get(mesh)
  // Someone else assigned a material since: that one is the original now.
  if (
    record &&
    record.applied !== mesh.material &&
    !(Array.isArray(record.applied) && sameMaterialArray(mesh.material, record.applied))
  ) {
    record = undefined
    meshRecords.delete(mesh)
  }
  if (variant === 'visible') {
    if (record) {
      mesh.material = record.original
      meshRecords.delete(mesh)
    }
    return
  }
  if (record && record.variant === variant && record.shading === shading) return
  const original = record?.original ?? mesh.material
  const applied = Array.isArray(original)
    ? original.map((material) => variantMaterial(material, variant, shading))
    : variantMaterial(original, variant, shading)
  mesh.material = applied
  meshRecords.set(mesh, { original, applied, variant, shading })
}

function isPickHitbox(mesh: Mesh): boolean {
  const material = mesh.material
  return !Array.isArray(material) && material?.visible === false
}

function collectMeshes(object: Object3D, out: Mesh[], hostedRoots: ReadonlySet<Object3D>): void {
  if (object.visible === false || hostedRoots.has(object)) return
  const mesh = object as Mesh
  if (mesh.isMesh && mesh.name !== 'cutout' && !isPickHitbox(mesh)) out.push(mesh)
  for (const child of object.children) collectMeshes(child, out, hostedRoots)
}

type Follower = { variant: FollowerVariant; negativeFacing: boolean | undefined }

const worldNormal = new Vector3()

export class WallModeFollowCache {
  private readonly tracked = new Map<string, Follower>()
  private readonly cameraDirection = new Vector3()
  private nodes: ReturnType<typeof useScene.getState>['nodes'] | undefined
  private mode: string | undefined
  private shading: string | undefined
  private textures: boolean | undefined
  private geometryRevision = -1
  private registryVersion = -1
  private followersVersion = -1
  private followers: ReadonlyMap<string, FollowsWallModeConfig> = new Map()
  private centres = new Map<string, readonly [number, number] | null>()

  constructor(private readonly viewerStore: WallModeFollowViewerStore = useViewer) {}

  update(camera: Camera): void {
    const viewer = this.viewerStore.getState()
    const scene = useScene.getState()
    const followers = this.followerKinds()
    const nodesChanged = this.nodes !== scene.nodes
    const inputsChanged =
      nodesChanged ||
      this.mode !== viewer.wallMode ||
      this.shading !== viewer.shading ||
      this.textures !== viewer.textures ||
      this.geometryRevision !== viewer.geometryRevision ||
      this.registryVersion !== this.followersVersion
    if (!inputsChanged && viewer.wallMode !== 'cutaway') return
    if (nodesChanged) this.centres.clear()
    this.nodes = scene.nodes
    this.mode = viewer.wallMode
    this.shading = viewer.shading
    this.textures = viewer.textures
    this.geometryRevision = viewer.geometryRevision
    this.registryVersion = this.followersVersion

    camera.getWorldDirection(this.cameraDirection)
    const shading = viewer.textures && viewer.shading !== 'solid' ? 'rendered' : 'solid'
    const seen = new Set<string>()
    for (const [kind, config] of followers) {
      for (const id of sceneRegistry.byType[kind] ?? []) {
        const node = scene.nodes[id as AnyNodeId]
        const group = sceneRegistry.nodes.get(id)
        if (!(node && group)) continue
        seen.add(id)
        const previous = this.tracked.get(id)
        const { variant, negativeFacing } = this.decide(
          node,
          config,
          group,
          viewer.wallMode,
          previous?.negativeFacing,
          scene.nodes,
        )
        this.tracked.set(id, { variant, negativeFacing })
        setAffected(id, variant !== 'visible')
        if (!inputsChanged && previous?.variant === variant) continue
        const hostedRoots = new Set<Object3D>()
        for (const childId of (node as { children?: readonly string[] }).children ?? []) {
          const child = sceneRegistry.nodes.get(childId)
          if (child) hostedRoots.add(child)
        }
        const meshes: Mesh[] = []
        collectMeshes(group, meshes, hostedRoots)
        for (const mesh of meshes) applyToMesh(mesh, variant, shading)
      }
    }
    for (const id of [...this.tracked.keys()]) {
      if (seen.has(id)) continue
      this.tracked.delete(id)
      setAffected(id, false)
    }
  }

  /** Puts every followed node back as built. */
  dispose(): void {
    const shading = this.shading === 'solid' ? 'solid' : 'rendered'
    for (const id of this.tracked.keys()) {
      const group = sceneRegistry.nodes.get(id)
      if (group) {
        const meshes: Mesh[] = []
        collectMeshes(group, meshes, new Set())
        for (const mesh of meshes) applyToMesh(mesh, 'visible', shading)
      }
      setAffected(id, false)
    }
    this.tracked.clear()
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
    mode: string,
    previousNegative: boolean | undefined,
    nodes: Readonly<Record<string, AnyNode>>,
  ): Follower {
    if (mode === 'translucent') return { variant: 'translucent', negativeFacing: undefined }
    if (mode === 'down') return { variant: 'invisible', negativeFacing: undefined }
    if (mode !== 'cutaway') return { variant: 'visible', negativeFacing: undefined }
    const facing = config.facing ? config.facing(node, nodes) : this.outwardFacing(node, nodes)
    if (!facing) return { variant: 'visible', negativeFacing: undefined }
    group.parent?.updateWorldMatrix(true, false)
    worldNormal.set(facing.normal[0], 0, facing.normal[1])
    if (group.parent) worldNormal.transformDirection(group.parent.matrixWorld)
    const negativeFacing = wallFacingNegative(
      worldNormal.dot(this.cameraDirection),
      previousNegative,
    )
    const hidden = wallHiddenFromFacing(facing, 'cutaway', negativeFacing)
    return { variant: hidden ? 'invisible' : 'visible', negativeFacing }
  }

  /** The default: the node is the building's exterior, facing away from the centre of its level's walls. */
  private outwardFacing(
    node: AnyNode,
    nodes: Readonly<Record<string, AnyNode>>,
  ): WallModeFacing | undefined {
    const position = (node as { position?: readonly number[] }).position
    const levelId = node.parentId
    if (!(position && levelId)) return undefined
    const centre = this.levelCentre(levelId, nodes)
    if (!centre) return undefined
    const dx = position[0]! - centre[0]
    const dz = position[2]! - centre[1]
    const length = Math.hypot(dx, dz)
    if (length < 1e-6) return undefined
    return { frontSide: 'exterior', backSide: 'interior', normal: [dx / length, dz / length] }
  }

  private levelCentre(
    levelId: string,
    nodes: Readonly<Record<string, AnyNode>>,
  ): readonly [number, number] | null {
    const cached = this.centres.get(levelId)
    if (cached !== undefined) return cached
    let minX = Infinity
    let maxX = -Infinity
    let minZ = Infinity
    let maxZ = -Infinity
    for (const id of sceneRegistry.byType.wall ?? []) {
      const wall = nodes[id]
      if (wall?.type !== 'wall' || wall.parentId !== levelId) continue
      for (const [x, z] of [wall.start, wall.end]) {
        minX = Math.min(minX, x)
        maxX = Math.max(maxX, x)
        minZ = Math.min(minZ, z)
        maxZ = Math.max(maxZ, z)
      }
    }
    const centre = Number.isFinite(minX) ? ([(minX + maxX) / 2, (minZ + maxZ) / 2] as const) : null
    this.centres.set(levelId, centre)
    return centre
  }
}

/**
 * After GeometrySystem (2), which rebuilds the meshes this restyles, and before the node batch (5),
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

  useEffect(() => () => cache.dispose(), [cache])

  return null
}
