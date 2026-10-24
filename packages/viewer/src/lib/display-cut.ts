import {
  type Intersection,
  type Material,
  Matrix4,
  type Mesh,
  type Object3D,
  type Raycaster,
} from 'three'
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

export function uncutMaterials(materials: Material[]): Material[] {
  return materials.map(uncutMaterial)
}

type RaycastFn = Mesh['raycast']
const originals = new WeakMap<Mesh, { own: boolean; raycast: RaycastFn }>()
const squash = new Matrix4()
const lift = new Matrix4()
const drop = new Matrix4()
const saved = new Matrix4()

/**
 * A pick sees a mesh as it is drawn: the mesh is squeezed to the cut for the ray, so a ray from
 * above lands on the cap at the cut and nothing above it is ever hit. Meshes that stand under the
 * cut already are left as they are.
 */
function cutRaycast(this: Mesh, raycaster: Raycaster, intersects: Intersection[]): void {
  const original = originals.get(this)!.raycast
  if (!this.geometry.boundingBox) this.geometry.computeBoundingBox()
  const box = this.geometry.boundingBox
  if (!box) {
    original.call(this, raycaster, intersects)
    return
  }
  const bottom = this.matrixWorld.elements[13]! + box.min.y
  const top = this.matrixWorld.elements[13]! + box.max.y
  const scale = (displayCutLimitY(this) - bottom) / (top - bottom)
  if (!(scale < 1)) {
    original.call(this, raycaster, intersects)
    return
  }
  if (!(scale > 0)) return
  squash
    .makeTranslation(0, box.min.y, 0)
    .multiply(lift.makeScale(1, scale, 1))
    .multiply(drop.makeTranslation(0, -box.min.y, 0))
  saved.copy(this.matrixWorld)
  this.matrixWorld.multiply(squash)
  try {
    original.call(this, raycaster, intersects)
  } finally {
    this.matrixWorld.copy(saved)
  }
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
