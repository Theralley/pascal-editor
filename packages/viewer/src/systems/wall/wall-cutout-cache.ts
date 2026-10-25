// New kind-specific modules belong in nodes; viewer must not depend on nodes.
// This extends the existing viewer-owned wall cutout and material implementation.
import {
  type AnyNodeId,
  getEffectiveNode,
  getLibraryMaterialsVersion,
  sceneRegistry,
  useLiveNodeOverrides,
  useLiveTransforms,
  useScene,
  type WallNode,
} from '@pascal-app/core'
import { type Camera, type Material, Matrix4, type Mesh, type Object3D, Vector3 } from 'three'
import {
  cutMaterial,
  cutMaterials,
  getDisplayCutRoot,
  setDisplayCutHeight,
  setDisplayCutRaycast,
  setDisplayCutRoot,
  uncutMaterial,
} from '../../lib/display-cut'
import { getMaterialTextureVersion } from '../../lib/materials'
import { hasMaterialsForGroups } from '../../lib/pointer-events'
import useViewer, { type WallMode } from '../../store/use-viewer'
import { wallCutApplies } from './wall-cut-eligibility'
import { getWallFinishRefs } from './wall-finish-data'
import { resolveWallMaterialVariant, type WallMaterialVariant } from './wall-material-variant'
import {
  getHoverHighlightMaterials,
  getMaterialsForWall,
  getSelectionHighlightMaterials,
  type WallMaterials,
  type WallMaterialsResolver,
} from './wall-materials'

const WALL_COLLISION_MESH = 'collision-mesh'

let registered = new Set<Object3D>()
let registeredRevision = -1

/** Every object a node is registered under: where a wall's own parts end and hosted nodes begin. */
function registeredObjects(): ReadonlySet<Object3D> {
  if (registeredRevision !== sceneRegistry.revision) {
    registered = new Set(sceneRegistry.nodes.values())
    registeredRevision = sceneRegistry.revision
  }
  return registered
}

/**
 * The meshes a wall carries as its own (mouldings, scripted finishes), not its collision mesh and
 * not the nodes hosted on it, which are registered themselves and are not the wall's to cut.
 */
export function wallParts(wallMesh: Object3D): Mesh[] {
  const parts: Mesh[] = []
  forEachWallPart(wallMesh, (part) => parts.push(part))
  return parts
}

/** `wallParts`, without making a list: for what is looked at every frame. */
export function forEachWallPart(wallMesh: Object3D, visit: (part: Mesh) => void): void {
  const hosted = registeredObjects()
  const walk = (object: Object3D) => {
    for (const child of object.children) {
      if (hosted.has(child) || child.name === WALL_COLLISION_MESH) continue
      if ((child as Mesh).isMesh && (child as Mesh).material) visit(child as Mesh)
      walk(child)
    }
  }
  walk(wallMesh)
}

function countDescendants(object: Object3D): number {
  let count = object.children.length
  for (const child of object.children) count += countDescendants(child)
  return count
}

export function sameMaterialArray(a: Material | Material[], b: Material[]): boolean {
  return Array.isArray(a) && a.length === b.length && a.every((material, i) => material === b[i])
}

/** Materialize a resolved variant from the wall's cached material set. */
function materialsForVariant(variant: WallMaterialVariant, materials: WallMaterials) {
  switch (variant) {
    case 'visible':
      return materials.visible
    case 'invisible':
      return materials.invisible
    case 'translucent':
      return materials.translucent
    case 'delete-visible':
      return materials.deleteVisible
    case 'delete-invisible':
      return materials.deleteInvisible
    case 'delete-translucent':
      return materials.deleteTranslucent
    case 'selection-visible':
      return getSelectionHighlightMaterials(materials.visible)
    case 'selection-invisible':
      return getSelectionHighlightMaterials(materials.invisible)
    case 'selection-translucent':
      return getSelectionHighlightMaterials(materials.translucent)
    case 'hover-invisible':
      return getHoverHighlightMaterials(materials.invisible)
    default: {
      const exhaustive: never = variant
      return exhaustive
    }
  }
}

type Variant = { key: WallMaterialVariant; materials: Material[] }
type CachedWall = {
  mesh: Mesh
  node: WallNode
  normal: Vector3
  matrix: Matrix4
  geometry: Mesh['geometry']
  negativeFacing: boolean | undefined
  hidden: boolean | undefined
  variantKey: string | undefined
  assignedMaterials: Material | Material[] | undefined
  visibleVariant: Variant
  hiddenVariant: Variant
  /** Finish refs the material palette was built for; the geometry's groups index them. */
  paletteKey: string
}

function wallPaletteKey(mesh: Mesh): string {
  return getWallFinishRefs(mesh.geometry).join('|')
}

// About 0.06 degrees: retain the previous side at edge-on poses without
// introducing a perceptible delay when an orbit crosses a wall's plane.
export const WALL_FACING_HYSTERESIS = 0.001

export function wallHiddenFromFacing(
  node: Pick<WallNode, 'frontSide' | 'backSide'>,
  mode: WallMode,
  negativeFacing: boolean,
): boolean {
  if (mode === 'up' || mode === 'low') return false
  if (mode === 'down') return true
  if (node.frontSide === 'interior' && node.backSide === 'interior') return true
  return negativeFacing
    ? node.frontSide === 'exterior' && node.backSide !== 'exterior'
    : node.backSide === 'exterior' && node.frontSide !== 'exterior'
}

export function wallFacingNegative(dot: number, previous: boolean | undefined): boolean {
  if (previous === undefined) return dot < 0
  return previous ? dot < WALL_FACING_HYSTERESIS : dot < -WALL_FACING_HYSTERESIS
}

export type WallCutoutViewerState = Pick<
  ReturnType<typeof useViewer.getState>,
  | 'wallMode'
  | 'wallCutHeight'
  | 'shading'
  | 'textures'
  | 'colorPreset'
  | 'sceneTheme'
  | 'selection'
  | 'previewSelectedIds'
  | 'hoveredId'
  | 'hoverHighlightMode'
> & { nodesRevealing?: readonly string[] }

const NOT_REVEALING: readonly string[] = []

/**
 * The walls the cutaway must leave in view because something on them is playing: a wall that is
 * moving in, going out or being edited, a wall that hosts an opening that is, and the walls under a
 * node that is (a facade part). The person's wall mode is not touched: these are stamped visible
 * for as long as they play, and the next frame after hides them again as the view wants.
 */
export function wallsInPlay(
  nodes: ReturnType<typeof useScene.getState>['nodes'],
  revealing: readonly string[],
): Set<string> {
  const walls = new Set<string>()
  if (revealing.length === 0) return walls
  const down = (id: string, depth: number) => {
    const node = nodes[id as AnyNodeId]
    if (!node) return
    if (node.type === 'wall') walls.add(id)
    if (depth >= 4) return
    for (const child of (node as { children?: readonly string[] }).children ?? [])
      down(child, depth + 1)
  }
  for (const id of revealing) {
    // The wall itself, or an opening in it: the host stands visible while the opening plays.
    for (
      let node = nodes[id as AnyNodeId], guard = 0;
      node && guard < 16;
      node = node.parentId ? nodes[node.parentId as AnyNodeId] : undefined, guard += 1
    )
      if (node.type === 'wall') walls.add(node.id)
    // What stands under a node that plays rides with it.
    down(id, 0)
  }
  return walls
}

/**
 * The visible variant of a mesh's materials, kept on the object by the system that cuts it away, for
 * whoever must draw a copy of the mesh while the cutaway hides it (a deleted wall's ghost). Not in
 * `userData`: `Object3D.clone` copies that through JSON, which would serialize every material.
 */
export const visibleMaterialsOf = new WeakMap<Object3D, Material[]>()

export type WallCutoutViewerStore = { getState: () => WallCutoutViewerState }

export class WallCutoutCache {
  readonly walls = new Map<string, CachedWall>()
  readonly rebuilt = new Set<string>()
  /** Walls whose palette waits for a preview to give back their groups (see `mayAssign`). */
  private readonly deferred = new Set<string>()
  private viewer: WallCutoutViewerState | undefined
  private nodes: ReturnType<typeof useScene.getState>['nodes'] | undefined
  private materials: ReturnType<typeof useScene.getState>['materials'] | undefined
  private registryRevision = -1
  private wallCount = -1
  private libraryVersion = -1
  private lastCameraPosition = new Vector3()
  private lastCameraTarget = new Vector3()
  private cameraDirection = new Vector3()
  private cameraTarget = new Vector3()
  private lastUpdateTime = 0
  private textureVersion = -1
  private selected = new Set<string>()
  private highlightKey = ''
  private transformed = new Set<string>()
  private overrides = useLiveNodeOverrides.getState().overrides
  /** The reveal's list the walls in play were read from, and the walls it named. */
  private revealing: readonly string[] = NOT_REVEALING
  private inPlay = new Set<string>()

  constructor(
    private readonly viewerStore: WallCutoutViewerStore = useViewer,
    private readonly materialResolver: WallMaterialsResolver = getMaterialsForWall,
  ) {}

  subscribeLiveTransforms(): () => void {
    return useLiveTransforms.subscribe((state, previous) => {
      for (const [id, transform] of state.transforms) {
        if (transform !== previous.transforms.get(id)) this.transformed.add(id)
      }
      for (const id of previous.transforms.keys()) {
        if (!state.transforms.has(id)) this.transformed.add(id)
      }
    })
  }

  update(camera: Camera, time: number): void {
    const viewer = this.viewerStore.getState()
    const scene = useScene.getState()
    const wallIds = sceneRegistry.byType.wall!
    const libraryVersion = getLibraryMaterialsVersion()
    const textureVersion = getMaterialTextureVersion()
    const previous = this.viewer
    setDisplayCutHeight(viewer.wallCutHeight)
    const overrides = useLiveNodeOverrides.getState().overrides
    const overridesChanged = this.overrides !== overrides
    const nodesChanged = this.nodes !== scene.nodes
    const registryChanged =
      this.registryRevision !== sceneRegistry.revision || this.wallCount !== wallIds.size
    let highlightChanged = false
    if (
      !previous ||
      nodesChanged ||
      previous.selection.selectedIds !== viewer.selection.selectedIds ||
      previous.previewSelectedIds !== viewer.previewSelectedIds ||
      previous.hoveredId !== viewer.hoveredId ||
      previous.hoverHighlightMode !== viewer.hoverHighlightMode
    ) {
      this.selected = new Set(
        [...viewer.selection.selectedIds, ...viewer.previewSelectedIds].filter(
          (id) => scene.nodes[id as AnyNodeId]?.type === 'wall',
        ),
      )
      const hovered =
        scene.nodes[viewer.hoveredId as AnyNodeId]?.type === 'wall' ? viewer.hoveredId : null
      const key = `${Array.from(this.selected).sort().join('|')}::${viewer.hoverHighlightMode === 'delete' ? (hovered ?? '') : ''}::${viewer.hoverHighlightMode === 'default' ? (hovered ?? '') : ''}`
      highlightChanged = key !== this.highlightKey
      this.highlightKey = key
    }
    const appearanceChanged =
      !previous ||
      highlightChanged ||
      this.materials !== scene.materials ||
      this.libraryVersion !== libraryVersion ||
      (this.textureVersion !== textureVersion && this.selected.size > 0) ||
      previous.wallMode !== viewer.wallMode ||
      previous.shading !== viewer.shading ||
      previous.textures !== viewer.textures ||
      previous.colorPreset !== viewer.colorPreset ||
      previous.sceneTheme !== viewer.sceneTheme
    const previewId = (state: typeof viewer | undefined) =>
      state && state.hoverHighlightMode !== 'default' && state.hoverHighlightMode !== 'delete'
        ? state.hoveredId
        : null
    const releasedPreview = previewId(previous) === previewId(viewer) ? null : previewId(previous)
    this.viewer = viewer
    // A wall whose play starts or ends, or a node that moves under one, changes only its own stamp.
    const revealing = viewer.nodesRevealing ?? NOT_REVEALING
    const playChanged = new Set<string>()
    if (this.revealing !== revealing || (nodesChanged && revealing.length > 0)) {
      const next = wallsInPlay(scene.nodes, revealing)
      for (const id of next) if (!this.inPlay.has(id)) playChanged.add(id)
      for (const id of this.inPlay) if (!next.has(id)) playChanged.add(id)
      this.inPlay = next
      this.revealing = revealing
    }
    // A texture that arrives while the walls are low reaches the clones they wear: the materials the
    // resolver gave are the same objects, so only the clones are remade, not every wall's palette.
    const recut =
      this.textureVersion !== textureVersion &&
      this.selected.size === 0 &&
      !appearanceChanged &&
      viewer.wallMode === 'low'
    if (recut) {
      this.textureVersion = textureVersion
      this.partsStale = true
      for (const wall of this.walls.values()) {
        wall.variantKey = undefined
        this.apply(wall, viewer.wallMode, false)
      }
    }
    // After the stamps are current: a deferred wall is applied with the walls in play it stands among.
    for (const id of this.deferred.size > 0 ? Array.from(this.deferred) : []) {
      this.deferred.delete(id)
      const wall = this.walls.get(id)
      if (wall) this.apply(wall, viewer.wallMode, false)
    }
    const invalidated =
      overridesChanged ||
      appearanceChanged ||
      nodesChanged ||
      registryChanged ||
      this.rebuilt.size > 0 ||
      this.transformed.size > 0 ||
      releasedPreview !== null ||
      playChanged.size > 0

    const cutaway = viewer.wallMode === 'cutaway'
    // What a wall carries (mouldings, scripted finishes) is re-dressed by its own renderer at any time.
    if (!invalidated && !cutaway) {
      this.cutParts(viewer.wallMode === 'low')
      return
    }

    camera.getWorldDirection(this.cameraDirection)
    this.cameraTarget.copy(this.cameraDirection).add(camera.position)
    const cameraChanged =
      cutaway &&
      time - this.lastUpdateTime > 0.1 &&
      (camera.position.distanceTo(this.lastCameraPosition) > 0.5 ||
        this.cameraTarget.distanceTo(this.lastCameraTarget) > 0.3)
    if (!(invalidated || cameraChanged)) {
      this.cutParts(viewer.wallMode === 'low')
      return
    }

    if (registryChanged || nodesChanged) {
      for (const [id, wall] of this.walls) {
        if (
          !wallIds.has(id) ||
          sceneRegistry.nodes.get(id) !== wall.mesh ||
          scene.nodes[id as AnyNodeId]?.type !== 'wall'
        )
          this.walls.delete(id)
      }
    }

    if (invalidated) {
      const changedPaths = new Map<string, boolean>()
      const pathChanged = (id: string): boolean => {
        const cached = changedPaths.get(id)
        if (cached !== undefined) return cached
        const node = scene.nodes[id as AnyNodeId]
        const changed =
          this.transformed.has(id) ||
          (nodesChanged && this.nodes?.[id as AnyNodeId] !== node) ||
          !!(node?.parentId && pathChanged(node.parentId))
        changedPaths.set(id, changed)
        return changed
      }
      const visited = new Set<Object3D>()
      for (const id of wallIds) {
        const node = scene.nodes[id as AnyNodeId]
        if (node?.type !== 'wall') continue
        let wall = this.walls.get(id)
        const added = !wall
        if (!wall) {
          const mesh = sceneRegistry.nodes.get(id) as Mesh | undefined
          if (!mesh) continue
          wall = {
            mesh,
            node,
            normal: new Vector3(),
            matrix: new Matrix4().makeScale(0, 0, 0),
            geometry: mesh.geometry,
            negativeFacing: undefined,
            hidden: undefined,
            variantKey: undefined,
            assignedMaterials: undefined,
            visibleVariant: { key: 'visible', materials: [] },
            hiddenVariant: { key: 'invisible', materials: [] },
            paletteKey: '',
          }
          this.walls.set(id, wall)
        }
        const changed = pathChanged(id)
        const rebuilt = this.rebuilt.has(id)
        if (added || changed || rebuilt) this.refreshNormal(wall, visited)
        const overrideChanged = this.overrides.get(id) !== overrides.get(id)
        wall.node = getEffectiveNode(node)
        const repaletted = rebuilt && wallPaletteKey(wall.mesh) !== wall.paletteKey
        const refresh =
          added || appearanceChanged || overrideChanged || (nodesChanged && changed) || repaletted
        if (refresh) this.refreshAppearance(wall)
        if (
          added ||
          appearanceChanged ||
          overrideChanged ||
          changed ||
          rebuilt ||
          releasedPreview === id ||
          playChanged.has(id) ||
          cameraChanged
        ) {
          this.apply(wall, viewer.wallMode, refresh)
        }
      }
    } else {
      for (const wall of this.walls.values()) this.apply(wall, viewer.wallMode, false)
    }
    this.cutParts(viewer.wallMode === 'low')
    this.rebuilt.clear()
    this.transformed.clear()
    this.overrides = overrides
    this.nodes = scene.nodes
    this.materials = scene.materials
    this.registryRevision = sceneRegistry.revision
    this.wallCount = wallIds.size
    this.libraryVersion = libraryVersion
    this.textureVersion = getMaterialTextureVersion()
    if (appearanceChanged || cameraChanged) {
      this.lastCameraPosition.copy(camera.position)
      this.lastCameraTarget.copy(this.cameraTarget)
      this.lastUpdateTime = time
    }
  }

  /**
   * A rebuilt wall whose finish palette changed must swap materials in the same
   * frame: its new groups already index the new palette.
   */
  handleRebuilt(id: string): void {
    this.rebuilt.add(id)
    const wall = this.walls.get(id)
    const viewer = this.viewer
    if (!(wall && viewer) || wall.mesh !== sceneRegistry.nodes.get(id)) return
    if (wallPaletteKey(wall.mesh) === wall.paletteKey) return
    const node = useScene.getState().nodes[id as AnyNodeId]
    if (node?.type !== 'wall') return
    wall.node = getEffectiveNode(node)
    this.refreshAppearance(wall)
    this.apply(wall, viewer.wallMode, true)
  }

  private refreshAppearance(wall: CachedWall): void {
    const viewer = this.viewer!
    const scene = useScene.getState()
    const node = wall.node
    const deleted = viewer.hoverHighlightMode === 'delete' && viewer.hoveredId === node.id
    // Painted parts stay readable while their wall is selected for editing.
    const selectionHighlighted =
      !deleted && this.selected.has(node.id) && !(node.faceRegions?.length ?? 0)
    const finishRefs = getWallFinishRefs(wall.mesh.geometry)
    wall.paletteKey = finishRefs.join('|')
    const materials = this.materialResolver(
      node,
      viewer.shading,
      viewer.textures,
      viewer.colorPreset,
      viewer.sceneTheme,
      scene.materials,
      finishRefs,
    )
    const variant = (hidden: boolean): Variant => {
      const key = resolveWallMaterialVariant({
        translucentMode: viewer.wallMode === 'translucent',
        hidden,
        deleteHighlighted: deleted,
        selectionHighlighted,
        hoverHighlighted: viewer.hoverHighlightMode === 'default' && viewer.hoveredId === node.id,
      })
      return { key, materials: materialsForVariant(key, materials) }
    }
    wall.visibleVariant = variant(false)
    wall.hiddenVariant = variant(true)
    // The plain visible palette (no selection or hover tint): what the wall wears when a capture sees it.
    visibleMaterialsOf.set(wall.mesh, materials.visible)
  }

  private refreshNormal(wall: CachedWall, visited: Set<Object3D>): void {
    const update = (object: Object3D): void => {
      if (visited.has(object)) return
      if (object.parent) update(object.parent)
      object.updateWorldMatrix(false, false)
      visited.add(object)
    }
    update(wall.mesh)
    if (wall.matrix.equals(wall.mesh.matrixWorld) && wall.geometry === wall.mesh.geometry) return
    wall.matrix.copy(wall.mesh.matrixWorld)
    wall.geometry = wall.mesh.geometry
    wall.normal.setFromMatrixColumn(wall.matrix, 2).normalize()
  }

  private apply(wall: CachedWall, mode: WallMode, refresh: boolean): void {
    if (mode === 'cutaway') {
      wall.negativeFacing = wallFacingNegative(
        wall.normal.dot(this.cameraDirection),
        wall.negativeFacing,
      )
    }
    // A wall in play is seen whatever the cutaway says; `mode` itself is the person's, untouched.
    const hidden =
      wallHiddenFromFacing(wall.node, mode, wall.negativeFacing ?? false) &&
      !(mode === 'cutaway' && this.inPlay.has(wall.node.id))
    wall.hidden = hidden
    // The wall batch and pointer handlers consume this boolean, including
    // false on stamp lift; translucent walls must continue receiving events.
    const stamp = mode !== 'translucent' && hidden
    if (wall.mesh.userData.wallHidden !== stamp) wall.mesh.userData.wallHidden = stamp
    const cut = mode === 'low' && wallCutApplies(wall.node)
    this.setCut(wall, cut)
    const variant = hidden ? wall.hiddenVariant : wall.visibleVariant
    // The cut wears a masked clone of the variant, so selection, hover and delete still show.
    const materials = cut ? cutMaterials(variant.materials) : variant.materials
    const variantKey = cut ? `${variant.key}:cut` : variant.key
    // Non-highlight hover (a paint preview) owns a temporary material until its
    // restore callback runs — unless the rebuilt geometry now draws a finish that
    // array has no entry for (a click just added one): then the new palette goes
    // on and the preview is dropped, rather than leaving groups with no material.
    const viewer = this.viewer!
    if (
      viewer.hoveredId === wall.node.id &&
      viewer.hoverHighlightMode !== 'default' &&
      viewer.hoverHighlightMode !== 'delete' &&
      hasMaterialsForGroups(wall.mesh)
    ) {
      if (refresh) wall.variantKey = undefined
      return
    }
    if (wall.variantKey !== variantKey || refresh) {
      if (wall.mesh.material !== materials && !sameMaterialArray(wall.mesh.material, materials)) {
        if (!this.mayAssign(wall, materials)) {
          wall.variantKey = undefined
          return
        }
        wall.mesh.material = materials
      }
      wall.variantKey = variantKey
      wall.assignedMaterials = wall.mesh.material
    } else if (wall.mesh.material !== wall.assignedMaterials) {
      if (!this.mayAssign(wall, wall.assignedMaterials!)) return
      wall.mesh.material = wall.assignedMaterials!
    }
  }

  private partsCut = false
  /** A source material was remade: the parts wear their clones again even if they look dressed. */
  private partsStale = false
  private readonly partLists = new WeakMap<
    Object3D,
    { revision: number; count: number; parts: Mesh[] }
  >()
  /** What a part was last dressed in: while it still wears that, there is nothing to do. */
  private readonly dressed = new WeakMap<Mesh, Material | Material[]>()

  /**
   * The meshes a wall carries as its own, cut like the wall (or given back): its mouldings and
   * finishes, not the nodes hosted on it (openings, items), which are registered themselves. A
   * renderer may set their materials again at any time, so each is checked, but only against what
   * it was dressed in: nothing is traversed or remade while nothing changed.
   */
  private cutParts(on: boolean): void {
    if (!on && !this.partsCut) return
    this.partsCut = on
    const force = this.partsStale
    this.partsStale = false
    const revision = sceneRegistry.revision
    for (const wall of this.walls.values()) {
      const root = on && wallCutApplies(wall.node) ? this.cutRootOf(wall) : null
      let list = this.partLists.get(wall.mesh)
      // A mesh that arrives later inside a child (a scripted finish loading) is counted too.
      const count = countDescendants(wall.mesh)
      if (!list || list.revision !== revision || list.count !== count) {
        list = { revision, count, parts: wallParts(wall.mesh) }
        this.partLists.set(wall.mesh, list)
      }
      for (const part of list.parts) this.dressPart(part, root, force)
    }
  }

  private dressPart(part: Mesh, root: Object3D | null, force: boolean): void {
    const material = part.material
    if (root && !force && getDisplayCutRoot(part) === root && this.dressed.get(part) === material)
      return
    if (!root && !this.dressed.has(part) && getDisplayCutRoot(part) === null) return
    setDisplayCutRoot(part, root)
    setDisplayCutRaycast(part, root !== null)
    // From the source, always: a clone of a clone would nest its mask a level deeper every frame.
    let next: Material | Material[]
    if (Array.isArray(material)) {
      const source = material.map(uncutMaterial)
      next = root ? cutMaterials(source) : source
      if (sameMaterialArray(material, next)) next = material
    } else {
      const source = uncutMaterial(material)
      next = root ? cutMaterial(source) : source
    }
    if (next !== material) part.material = next
    if (root) this.dressed.set(part, part.material)
    else this.dressed.delete(part)
  }

  private cutRootOf(wall: CachedWall): Object3D | null {
    return (
      (sceneRegistry.nodes.get(wall.node.parentId as AnyNodeId) as Object3D | undefined) ??
      wall.mesh.parent
    )
  }

  /** Puts the cut on how a wall is picked (its drawn mesh and its collision mesh), or takes it off. */
  private setCut(wall: CachedWall, on: boolean): void {
    const root = on ? this.cutRootOf(wall) : null
    for (const mesh of [wall.mesh, wall.mesh.getObjectByName(WALL_COLLISION_MESH)]) {
      if (!mesh) continue
      setDisplayCutRoot(mesh, root)
      setDisplayCutRaycast(mesh as Mesh, root !== null)
    }
  }

  /**
   * A paint preview spread over several walls (a room, all matching) regroups
   * each wall's faces onto its own longer array, but only the hovered wall is
   * known here as a preview's owner. A palette that cannot draw the groups the
   * mesh wears now waits for the preview's restore to put them back: the mesh
   * would otherwise keep groups with no material, and every raycast over it
   * throws on `material.side`.
   */
  private mayAssign(wall: CachedWall, materials: Material | Material[]): boolean {
    if (hasMaterialsForGroups(wall.mesh, materials) || !hasMaterialsForGroups(wall.mesh)) {
      this.deferred.delete(wall.node.id)
      return true
    }
    this.deferred.add(wall.node.id)
    return false
  }
}
