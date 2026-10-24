import {
  type AnyNode,
  type AnyNodeId,
  type FollowsWallModeConfig,
  getRegistryVersion,
  nodeRegistry,
  sceneRegistry,
  useScene,
} from '@pascal-app/core'
import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import {
  Box3,
  type Camera,
  type Color,
  type Material,
  type Mesh,
  type Object3D,
  Vector3,
} from 'three'
import { registerMaterialCacheCleanup } from '../../lib/materials'
import useViewer from '../../store/use-viewer'
import {
  sameMaterialArray,
  wallFacingNegative,
  wallHiddenFromFacing,
} from '../wall/wall-cutout-cache'
import {
  createHighlightedWallMaterial,
  createInvisibleWallMaterial,
  createTranslucentWallMaterial,
  getHoverHighlightMaterials,
  getSelectionHighlightMaterials,
} from '../wall/wall-materials'

/**
 * Wall mode for nodes of kinds that declare `capabilities.followsWallMode`: the same hide decision
 * (`wallHiddenFromFacing`) and the same see-through materials walls get, applied to the meshes the
 * kind's geometry builds. Walls keep their own `WallCutout`.
 *
 * While the mode affects a node this system is the only writer of its meshes' materials, as
 * `WallCutoutCache` is for walls: it composes the built material, the wall-mode variant and the
 * selection / hover / delete tint, and the editor's selection sync leaves the node alone
 * (`isWallModeAffected`). Anything else that swaps a material meanwhile is overwritten on the next
 * pass and never becomes the node's built material.
 */

const FOLLOWER_FALLBACK_COLOR = '#e9e7e3'
const CAMERA_MOVE_DISTANCE = 0.1
const CAMERA_TURN_DOT = 0.9995

type FollowerVariant = 'visible' | 'invisible' | 'translucent'
type Highlight = 'none' | 'selection' | 'hover' | 'delete'
type Shading = 'solid' | 'rendered'

export type WallModeFollowViewerState = Pick<
  ReturnType<typeof useViewer.getState>,
  | 'wallMode'
  | 'shading'
  | 'textures'
  | 'geometryRevision'
  | 'selection'
  | 'previewSelectedIds'
  | 'hoveredId'
  | 'hoverHighlightMode'
>

export type WallModeFollowViewerStore = { getState: () => WallModeFollowViewerState }

const affectedIds = new Set<string>()
const hiddenIds = new Set<string>()
const affectedListeners = new Set<(nodeId: string) => void>()

/** Whether the wall mode currently changes how this node draws (hidden or see-through). */
export function isWallModeAffected(nodeId: string): boolean {
  return affectedIds.has(nodeId)
}

/** Whether the wall mode currently hides this node (see-through nodes keep their pointer events). */
export function isWallModeHidden(nodeId: string): boolean {
  return hiddenIds.has(nodeId)
}

/**
 * Calls back whenever a node starts or stops being drawn differently by the wall mode, so a system
 * that caches or tints the node's meshes (the node batch, the selection tint) can let go or take
 * over. Called before the node's meshes are restyled.
 */
export function subscribeWallModeAffected(listener: (nodeId: string) => void): () => void {
  affectedListeners.add(listener)
  return () => {
    affectedListeners.delete(listener)
  }
}

function setAffected(nodeId: string, variant: FollowerVariant): void {
  const affected = variant !== 'visible'
  if (variant === 'invisible') hiddenIds.add(nodeId)
  else hiddenIds.delete(nodeId)
  if (affectedIds.has(nodeId) === affected) return
  if (affected) affectedIds.add(nodeId)
  else affectedIds.delete(nodeId)
  for (const listener of affectedListeners) listener(nodeId)
}

type MeshRecord = {
  original: Material | Material[]
  applied: Material | Material[]
}

const meshRecords = new WeakMap<Mesh, MeshRecord>()
let variantMaterials = new WeakMap<Material, Map<string, Material>>()
const ownedVariants = new Set<Material>()

// Shared by every follower that wears the same source material; GeometrySystem must not dispose
// them with one node's rebuild, so they are cached materials, released with the material cache.
registerMaterialCacheCleanup(() => {
  for (const material of ownedVariants) material.dispose()
  ownedVariants.clear()
  variantMaterials = new WeakMap()
})

function ownVariant(material: Material): Material {
  material.userData.__pascalCachedMaterial = true
  ownedVariants.add(material)
  return material
}

function variantMaterial(
  source: Material,
  variant: Exclude<FollowerVariant, 'visible'>,
  shading: Shading,
  highlight: Highlight,
): Material {
  const key = `${variant}:${shading}:${highlight}`
  let byKey = variantMaterials.get(source)
  if (!byKey) {
    byKey = new Map()
    variantMaterials.set(source, byKey)
  }
  let material = byKey.get(key)
  if (material) return material
  if (highlight === 'none') {
    const color = (source as { color?: Color }).color
    const hex = color ? `#${color.getHexString()}` : FOLLOWER_FALLBACK_COLOR
    material = ownVariant(
      variant === 'invisible'
        ? createInvisibleWallMaterial(hex, shading)
        : createTranslucentWallMaterial(hex, shading),
    )
  } else {
    const base = variantMaterial(source, variant, shading, 'none')
    material =
      highlight === 'delete'
        ? ownVariant(createHighlightedWallMaterial(base, 'delete'))
        : (highlight === 'selection'
            ? getSelectionHighlightMaterials([base])
            : getHoverHighlightMaterials([base]))[0]!
  }
  byKey.set(key, material)
  return material
}

function applyToMesh(mesh: Mesh, variant: FollowerVariant, shading: Shading, highlight: Highlight) {
  let record = meshRecords.get(mesh)
  if (!record) {
    if (variant === 'visible') return
    record = { original: mesh.material, applied: mesh.material }
  }
  if (variant === 'visible') {
    mesh.material = record.original
    meshRecords.delete(mesh)
    return
  }
  const applied = Array.isArray(record.original)
    ? record.original.map((material) => variantMaterial(material, variant, shading, highlight))
    : variantMaterial(record.original, variant, shading, highlight)
  const unchanged =
    mesh.material === applied ||
    (Array.isArray(applied) &&
      Array.isArray(mesh.material) &&
      sameMaterialArray(mesh.material, applied))
  if (!unchanged) mesh.material = applied
  record.applied = mesh.material
  meshRecords.set(mesh, record)
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

function hostedRootsOf(node: AnyNode): Set<Object3D> {
  const roots = new Set<Object3D>()
  for (const childId of (node as { children?: readonly string[] }).children ?? []) {
    const child = sceneRegistry.nodes.get(childId)
    if (child) roots.add(child)
  }
  return roots
}

type Follower = {
  variant: FollowerVariant
  highlight: Highlight
  negativeFacing: boolean | undefined
}

const scratchNormal = new Vector3()
const scratchPoint = new Vector3()
const scratchBox = new Box3()

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
      previous.shading !== viewer.shading ||
      previous.textures !== viewer.textures ||
      previous.geometryRevision !== viewer.geometryRevision ||
      previous.selection.selectedIds !== viewer.selection.selectedIds ||
      previous.previewSelectedIds !== viewer.previewSelectedIds ||
      previous.hoveredId !== viewer.hoveredId ||
      previous.hoverHighlightMode !== viewer.hoverHighlightMode

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
    // Nothing is restyled in walls up, and nothing needs undoing when nothing was.
    if (viewer.wallMode === 'up' && this.tracked.size === 0) return

    const shading: Shading = viewer.textures && viewer.shading !== 'solid' ? 'rendered' : 'solid'
    const selected = new Set([...viewer.selection.selectedIds, ...viewer.previewSelectedIds])
    const seen = new Set<string>()
    for (const [kind, config] of followers) {
      for (const id of sceneRegistry.byType[kind] ?? []) {
        const node = scene.nodes[id as AnyNodeId]
        const group = sceneRegistry.nodes.get(id)
        if (!(node && group) || config.appliesTo?.(node) === false) continue
        seen.add(id)
        const previousFollower = this.tracked.get(id)
        const decision = this.decide(
          node,
          config,
          group,
          viewer,
          previousFollower?.negativeFacing,
          scene.nodes,
        )
        const highlight = this.highlightOf(id, decision.variant, selected, viewer)
        const follower = { ...decision, highlight }
        this.tracked.set(id, follower)
        // Whoever tints the node lets go before it is restyled, and takes over after it is restored.
        if (follower.variant !== 'visible') setAffected(id, follower.variant)
        if (
          inputsChanged ||
          previousFollower?.variant !== follower.variant ||
          previousFollower.highlight !== follower.highlight
        ) {
          const meshes: Mesh[] = []
          collectMeshes(group, meshes, hostedRootsOf(node))
          for (const mesh of meshes)
            applyToMesh(mesh, follower.variant, shading, follower.highlight)
        }
        if (follower.variant === 'visible') setAffected(id, follower.variant)
      }
    }
    for (const id of [...this.tracked.keys()]) {
      if (seen.has(id)) continue
      this.release(id)
    }
  }

  /** Puts every followed node back as built. */
  dispose(): void {
    for (const id of [...this.tracked.keys()]) this.release(id)
    this.viewer = undefined
    this.nodes = undefined
  }

  private release(id: string): void {
    this.tracked.delete(id)
    this.nodeCentres.delete(id)
    const group = sceneRegistry.nodes.get(id)
    const node = this.nodes?.[id as AnyNodeId]
    if (group) {
      const meshes: Mesh[] = []
      collectMeshes(group, meshes, node ? hostedRootsOf(node) : new Set())
      for (const mesh of meshes) applyToMesh(mesh, 'visible', 'solid', 'none')
    }
    setAffected(id, 'visible')
  }

  private highlightOf(
    id: string,
    variant: FollowerVariant,
    selected: ReadonlySet<string>,
    viewer: WallModeFollowViewerState,
  ): Highlight {
    if (variant === 'visible') return 'none'
    if (viewer.hoveredId === id && viewer.hoverHighlightMode === 'delete') return 'delete'
    if (selected.has(id)) return 'selection'
    if (
      viewer.hoveredId === id &&
      viewer.hoverHighlightMode === 'default' &&
      variant === 'invisible'
    )
      return 'hover'
    return 'none'
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
  ): Omit<Follower, 'highlight'> {
    const mode = viewer.wallMode
    if (mode === 'translucent') return { variant: 'translucent', negativeFacing: undefined }
    if (mode === 'down') return { variant: 'invisible', negativeFacing: undefined }
    if (mode !== 'cutaway') return { variant: 'visible', negativeFacing: undefined }
    const facing = config.facing
      ? this.declaredFacing(config.facing(node, nodes), group)
      : this.outwardFacing(node, group, viewer.geometryRevision, nodes)
    if (!facing) return { variant: 'visible', negativeFacing: undefined }
    const negativeFacing = wallFacingNegative(
      facing.worldNormal.dot(this.cameraDirection),
      previousNegative,
    )
    const hidden = wallHiddenFromFacing(facing, 'cutaway', negativeFacing)
    return { variant: hidden ? 'invisible' : 'visible', negativeFacing }
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
   * walls, judged from where the built node stands (the centre of its meshes), not from its origin.
   */
  private outwardFacing(
    node: AnyNode,
    group: Object3D,
    revision: number,
    nodes: Readonly<Record<string, AnyNode>>,
  ) {
    const levelId = node.parentId
    if (!levelId) return undefined
    const buildingCentre = this.levelCentre(levelId, nodes)
    const centre = this.nodeCentre(node, group, revision)
    if (!(buildingCentre && centre)) return undefined
    const dx = centre[0] - buildingCentre[0]
    const dz = centre[1] - buildingCentre[1]
    const length = Math.hypot(dx, dz)
    if (length < 1e-6) return undefined
    scratchNormal.set(dx / length, 0, dz / length)
    return {
      frontSide: 'exterior' as const,
      backSide: 'interior' as const,
      worldNormal: scratchNormal,
    }
  }

  private nodeCentre(node: AnyNode, group: Object3D, revision: number) {
    const cached = this.nodeCentres.get(node.id)
    if (cached && cached.node === node && cached.revision === revision) return cached.centre
    group.updateWorldMatrix(true, true)
    const meshes: Mesh[] = []
    collectMeshes(group, meshes, hostedRootsOf(node))
    scratchBox.makeEmpty()
    for (const mesh of meshes) scratchBox.expandByObject(mesh)
    const centre = scratchBox.isEmpty()
      ? null
      : ([
          (scratchBox.min.x + scratchBox.max.x) / 2,
          (scratchBox.min.z + scratchBox.max.z) / 2,
        ] as const)
    this.nodeCentres.set(node.id, { node, revision, centre })
    return centre
  }

  /** The centre of the level's walls in world space, from the scene's wall nodes. */
  private levelCentre(levelId: string, nodes: Readonly<Record<string, AnyNode>>) {
    const cached = this.levelCentres.get(levelId)
    if (cached) return cached
    const level = nodes[levelId]
    const levelObject = sceneRegistry.nodes.get(levelId)
    if (!(level && levelObject)) return null
    levelObject.updateWorldMatrix(true, false)
    let minX = Infinity
    let maxX = -Infinity
    let minZ = Infinity
    let maxZ = -Infinity
    for (const childId of (level as { children?: readonly string[] }).children ?? []) {
      const wall = nodes[childId]
      if (wall?.type !== 'wall') continue
      for (const [x, z] of [wall.start, wall.end]) {
        scratchPoint.set(x, 0, z).applyMatrix4(levelObject.matrixWorld)
        minX = Math.min(minX, scratchPoint.x)
        maxX = Math.max(maxX, scratchPoint.x)
        minZ = Math.min(minZ, scratchPoint.z)
        maxZ = Math.max(maxZ, scratchPoint.z)
      }
    }
    if (!Number.isFinite(minX)) return null
    const centre = [(minX + maxX) / 2, (minZ + maxZ) / 2] as const
    this.levelCentres.set(levelId, centre)
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
