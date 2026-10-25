import { hiddenWallPointerEventsHeld } from '@pascal-app/core'
import type { Intersection, Material, Mesh, Object3D, Raycaster } from 'three'
import { positionWorld, uniform } from 'three/tsl'
import type { Node, NodeMaterial } from 'three/webgpu'

/**
 * Presentation-only cut: everything an object draws above a height over its root is hidden, in the
 * material (so the cut costs nothing to move) and in the pick (so a click lands on what is seen).
 * The scene is not touched, and the meshes wear masked clones of their materials while the cut is
 * on (the scene's materials are shared and cached, so a cut never writes to them).
 *
 * The height is a world coordinate worked out per object from its root, so a level that is lifted
 * (an exploded stack) cuts at its own height, and a merged mesh cuts where the walls it holds do.
 */

const state = { height: 0 }
const roots = new WeakMap<Object3D, Object3D>()

/** A cut limit no object is ever above: what an object with no root is drawn under. */
const NO_LIMIT = 1e9

/** Sets the height (m over the root) the cut stands at. Only the uniform changes: no geometry, no material. */
export function setDisplayCutHeight(height: number): void {
  if (Number.isFinite(height)) state.height = height
}

export function getDisplayCutHeight(): number {
  return state.height
}

/** The cut of `object` stands over `root` (a level): its limit follows the root wherever it is lifted to. */
export function setDisplayCutRoot(object: Object3D, root: Object3D | null): void {
  if (root) roots.set(object, root)
  else roots.delete(object)
}

/** The root `object` is cut over, if any. */
export function getDisplayCutRoot(object: Object3D): Object3D | null {
  return roots.get(object) ?? null
}

/** `to` (a copy of `from`, a deletion's ghost) and every part of it cut where the part of `from` it copies does. */
export function shareDisplayCutRootDeep(from: Object3D, to: Object3D): void {
  shareDisplayCutRoot(from, to)
  const count = Math.min(from.children.length, to.children.length)
  for (let i = 0; i < count; i++) shareDisplayCutRootDeep(from.children[i]!, to.children[i]!)
}

/** `to` (a proxy that draws `from` in another scene) cuts where `from` does. */
export function shareDisplayCutRoot(from: Object3D, to: Object3D): void {
  const root = roots.get(from)
  if (root) roots.set(to, root)
  else roots.delete(to)
}

/** The world Y above which `object` is cut away. */
export function displayCutLimitY(object: Object3D): number {
  const root = roots.get(object)
  return root ? root.matrixWorld.elements[13]! + state.height : NO_LIMIT
}

const limit = uniform(0).onObjectUpdate(({ object }) =>
  object ? displayCutLimitY(object as Object3D) : NO_LIMIT,
)
const cutMask = positionWorld.y.lessThanEqual(limit as never) as Node<'bool'>

type Clone = { clone: Material; version: number }
const clones = new WeakMap<Material, Clone>()
const sources = new WeakMap<Material, Material>()
const arrays = new WeakMap<Material[], Material[]>()

function maskedClone(material: Material): Material {
  const clone = material.clone() as unknown as NodeMaterial
  clone.maskNode = clone.maskNode ? (clone.maskNode as Node<'bool'>).and(cutMask) : cutMask
  clone.maskShadowNode = clone.maskShadowNode
    ? (clone.maskShadowNode as Node<'bool'>).and(cutMask)
    : cutMask
  return clone as unknown as Material
}

/** The clone of `material` that draws only what is under the cut. Remade when the source is. */
export function cutMaterial(material: Material): Material {
  const known = clones.get(material)
  if (known && known.version === material.version) return known.clone
  known?.clone.dispose()
  const clone = maskedClone(material)
  clones.set(material, { clone, version: material.version })
  sources.set(clone, material)
  material.addEventListener('dispose', () => {
    const entry = clones.get(material)
    if (!entry) return
    clones.delete(material)
    entry.clone.dispose()
  })
  return clone
}

/** The material a clone was cut from; any other material is its own. */
export function uncutMaterial(material: Material): Material {
  return sources.get(material) ?? material
}

/** `cutMaterial` over an array, the same array back while nothing it holds was remade. */
export function cutMaterials(materials: Material[]): Material[] {
  const next = materials.map(cutMaterial)
  const known = arrays.get(materials)
  if (known && known.length === next.length && known.every((m, i) => m === next[i])) return known
  arrays.set(materials, next)
  return next
}

/** Whether `mesh` is under the cut now: what is drawn on it from here on is cut too. */
export function isDisplayCut(mesh: Mesh): boolean {
  return originals.has(mesh)
}

/** A material meant for a mesh that is under the cut (a paint preview), cut like the rest of it. */
export function cutLike(mesh: Mesh, material: Material | Material[]): Material | Material[] {
  if (!isDisplayCut(mesh)) return material
  return Array.isArray(material) ? cutMaterials(material) : cutMaterial(material)
}

export function uncutMaterials(materials: Material[]): Material[] {
  return materials.map(uncutMaterial)
}

type RaycastFn = Mesh['raycast']
const originals = new WeakMap<Mesh, { own: boolean; raycast: RaycastFn }>()
const scratch: Intersection[] = []

/**
 * A pick sees a mesh as it is drawn: what a ray hits above the cut is dropped, on the mesh's own
 * geometry (an opening keeps its true place). A tool that tracks the cursor along the whole wall
 * holds the full height for as long as it runs (`hiddenWallPointerEventsHeld`).
 */
function cutRaycast(this: Mesh, raycaster: Raycaster, intersects: Intersection[]): void {
  const original = originals.get(this)!.raycast
  if (hiddenWallPointerEventsHeld()) {
    original.call(this, raycaster, intersects)
    return
  }
  scratch.length = 0
  original.call(this, raycaster, scratch)
  const limit = displayCutLimitY(this) + 1e-6
  for (const hit of scratch) if (hit.point.y <= limit) intersects.push(hit)
  scratch.length = 0
}

/** Puts the cut on (or takes it off) how `mesh` is picked. Idempotent. */
export function setDisplayCutRaycast(mesh: Mesh, on: boolean): void {
  const entry = originals.get(mesh)
  if (on) {
    if (entry) return
    originals.set(mesh, { own: Object.hasOwn(mesh, 'raycast'), raycast: mesh.raycast })
    mesh.raycast = cutRaycast
    return
  }
  if (!entry) return
  originals.delete(mesh)
  if (entry.own) mesh.raycast = entry.raycast
  else delete (mesh as { raycast?: RaycastFn }).raycast
}
