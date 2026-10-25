import { type Intersection, type Material, Mesh, type Object3D, Vector3 } from 'three'
import {
  cutLike,
  setDisplayCutHeight,
  setDisplayCutRaycast,
  setDisplayCutRoot,
} from '../../lib/display-cut'
import {
  buildCutCapGeometry,
  type PreparedSection,
  prepareSection,
} from '../../lib/display-cut-section'

type BakedWall = { object: Object3D; level: Object3D }

export const GLB_WALL_CAPS_NAME = 'wall-cut-caps'

const isIdentity = (object: Object3D) =>
  Boolean((object.userData as { pascalId?: string }).pascalId)

/** The meshes a baked wall draws itself: its own, not those of the openings and items hosted on it. */
function ownMeshes(wall: Object3D): Mesh[] {
  const meshes: Mesh[] = []
  const walk = (node: Object3D) => {
    if ((node as Mesh).isMesh) meshes.push(node as Mesh)
    for (const child of node.children) if (!isIdentity(child)) walk(child)
  }
  walk(wall)
  return meshes
}

/** The body of a baked wall: of the meshes it draws itself, those of the largest extent (not a moulding). */
function bodyMeshes(meshes: readonly Mesh[]): Mesh[] {
  const bodies = new Map<unknown, { meshes: Mesh[]; volume: number }>()
  for (const mesh of meshes) {
    const position = mesh.geometry?.getAttribute('position')
    if (!position) continue
    const body = bodies.get(position) ?? { meshes: [], volume: 0 }
    if (body.meshes.length === 0) {
      mesh.geometry.computeBoundingBox()
      const size = mesh.geometry.boundingBox!.getSize(new Vector3())
      body.volume = size.x * size.y * size.z
      bodies.set(position, body)
    }
    body.meshes.push(mesh)
  }
  let widest: { meshes: Mesh[]; volume: number } | undefined
  for (const body of bodies.values()) if (!widest || body.volume > widest.volume) widest = body
  return widest?.meshes ?? []
}

/**
 * Whether a baked material is glass: an alpha blend, or the transmission a bake exports glass as
 * (opaque, `transparent` off, with its authored opacity kept in the material's extras).
 */
function seesThrough(mesh: Mesh): boolean {
  const baked = (mesh.userData as { __bakedMaterial?: Material | Material[] }).__bakedMaterial
  return [baked ?? mesh.material].flat().some((material) => {
    const glass = material as Material & { transmission?: number }
    return (
      (glass.transmission ?? 0) > 0 ||
      typeof material.userData?.pascalGlassOpacity === 'number' ||
      (material.transparent && material.opacity < 1)
    )
  })
}

/**
 * Whether the cut applies to a baked wall. A bake says so itself (`displayCut`); one made before
 * it did is judged by what it draws: a wall in glass is a curtain wall, which the cut leaves whole.
 * That is a guess: a glass finish on a wall that is not a curtain wall reads the same.
 */
function cutApplies(object: Object3D, meshes: readonly Mesh[]): boolean {
  const stamped = (object.userData as { displayCut?: boolean }).displayCut
  return stamped ?? !meshes.some(seesThrough)
}

export type BakedWallCut = {
  setHeight: (height: number) => void
  dispose: () => void
}

/**
 * Cuts the walls of a baked scene (a published GLB) like the live viewer cuts them: their
 * materials wear the mask, a pick sees the stub, and each level gets a cap at the cut taken from the
 * section of the walls' drawn bodies, so a doorway, a window the cut passes through and a wall
 * shorter than the cut come out as they do live. Presentation only: `dispose` puts every mesh back
 * as it was.
 */
export function cutBakedWalls(
  walls: readonly BakedWall[],
  height: number,
  capMaterial: Material,
): BakedWallCut {
  setDisplayCutHeight(height)
  const worn = new Map<Mesh, Material | Material[]>()
  const perLevel = new Map<Object3D, { object: Object3D; body: PreparedSection }[]>()
  for (const { object, level } of walls) {
    const own = ownMeshes(object)
    if (!cutApplies(object, own)) continue
    const entries = perLevel.get(level) ?? []
    perLevel.set(level, entries)
    entries.push({ object, body: prepareSection(bodyMeshes(own), level) })
    for (const mesh of own) {
      worn.set(mesh, mesh.material)
      setDisplayCutRoot(mesh, level)
      setDisplayCutRaycast(mesh, true)
      mesh.material = cutLike(mesh, mesh.material)
    }
  }
  const caps = new Map<Object3D, Mesh>()
  const owners = new WeakMap<Mesh, Object3D[]>()
  const capLevels = (at: number) => {
    for (const [level, entries] of perLevel) {
      const built = buildCutCapGeometry(
        entries.map(({ object, body }) => ({
          owner: object,
          solids: body.at(at).solids,
        })),
      )
      let cap = caps.get(level)
      if (!built) {
        if (cap) {
          cap.removeFromParent()
          cap.geometry.dispose()
          caps.delete(level)
        }
        continue
      }
      if (cap) cap.geometry.dispose()
      else {
        cap = new Mesh(built.geometry, capMaterial)
        cap.name = GLB_WALL_CAPS_NAME
        cap.userData.pascalExport = 'strip'
        cap.castShadow = true
        cap.receiveShadow = true
        // A pick lands on the stub's top as on the wall it belongs to.
        cap.raycast = function raycast(raycaster, intersects) {
          const hits: Intersection[] = []
          Mesh.prototype.raycast.call(this, raycaster, hits)
          for (const hit of hits) {
            const owner = owners.get(this as Mesh)?.[hit.faceIndex ?? -1]
            if (owner) intersects.push({ ...hit, object: owner })
          }
        }
        level.add(cap)
        caps.set(level, cap)
      }
      cap.geometry = built.geometry
      owners.set(cap, built.triangleOwners)
      cap.position.y = at
    }
  }
  capLevels(height)
  return {
    setHeight: (next) => {
      setDisplayCutHeight(next)
      capLevels(next)
    },
    dispose: () => {
      for (const cap of caps.values()) {
        cap.removeFromParent()
        cap.geometry.dispose()
      }
      caps.clear()
      for (const [mesh, material] of worn) {
        setDisplayCutRaycast(mesh, false)
        setDisplayCutRoot(mesh, null)
        mesh.material = material
      }
    },
  }
}
