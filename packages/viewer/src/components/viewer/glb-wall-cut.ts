import {
  Box3,
  type Intersection,
  type Material,
  Matrix4,
  Mesh,
  type Object3D,
  Vector2,
  Vector3,
} from 'three'
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
  type Solid,
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

const volume = new Box3()
const size = new Vector3()

/**
 * The body of a baked wall among the meshes it draws itself: the meshes sharing the position
 * attribute of the one with the largest extent in the world (a moulding scaled small is not it).
 * The rest are trims, which are cut and capped as solids of their own.
 */
function splitBody(meshes: readonly Mesh[]): { body: Mesh[]; trims: Mesh[] } {
  let widest: Mesh | undefined
  let most = -1
  for (const mesh of meshes) {
    if (!mesh.geometry?.getAttribute('position')) continue
    volume.setFromObject(mesh).getSize(size)
    if (size.x * size.y * size.z > most) {
      most = size.x * size.y * size.z
      widest = mesh
    }
  }
  const position = widest?.geometry.getAttribute('position')
  const body = meshes.filter((mesh) => mesh.geometry?.getAttribute('position') === position)
  return { body, trims: meshes.filter((mesh) => !body.includes(mesh)) }
}

const toLevel = new Matrix4()
const a = new Vector3()
const b = new Vector3()
const c = new Vector3()

const BASE_BAND = 0.02
const FACES_DOWN = -0.7

/**
 * The footprint of a baked wall, read off its base: the faces that look down at the lowest height
 * are the wall standing on the floor. What a wall is capped from when its section will not close.
 * One solid per triangle, in the level's frame.
 */
function baseFootprint(meshes: readonly Mesh[], level: Object3D): Solid[] {
  const solids: Solid[] = []
  level.updateWorldMatrix(true, false)
  for (const mesh of meshes) {
    const position = mesh.geometry.getAttribute('position')
    if (!position) continue
    mesh.updateWorldMatrix(true, false)
    toLevel.copy(level.matrixWorld).invert().multiply(mesh.matrixWorld)
    const index = mesh.geometry.getIndex()
    const count = index ? index.count : position.count
    const vertex = (i: number, into: Vector3) =>
      into.fromBufferAttribute(position, index ? index.getX(i) : i).applyMatrix4(toLevel)
    let lowest = Number.POSITIVE_INFINITY
    for (let i = 0; i < position.count; i++)
      lowest = Math.min(lowest, a.fromBufferAttribute(position, i).applyMatrix4(toLevel).y)
    for (let i = 0; i + 2 < count; i += 3) {
      vertex(i, a)
      vertex(i + 1, b)
      vertex(i + 2, c)
      if (Math.max(a.y, b.y, c.y) > lowest + BASE_BAND) continue
      const normal = b.clone().sub(a).cross(c.clone().sub(a)).normalize()
      if (!Number.isFinite(normal.y) || normal.y > FACES_DOWN) continue
      solids.push([[new Vector2(a.x, a.z), new Vector2(b.x, b.z), new Vector2(c.x, c.z)]])
    }
  }
  return solids
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
  const perLevel = new Map<
    Object3D,
    {
      object: Object3D
      body: PreparedSection
      trims: PreparedSection
      bodyMeshes: Mesh[]
      footprint?: Solid[]
    }[]
  >()
  for (const { object, level } of walls) {
    const own = ownMeshes(object)
    if (!cutApplies(object, own)) continue
    const entries = perLevel.get(level) ?? []
    perLevel.set(level, entries)
    const { body, trims } = splitBody(own)
    entries.push({
      object,
      body: prepareSection(body, level),
      trims: prepareSection(trims, level),
      bodyMeshes: body,
    })
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
        entries.map((entry) => {
          const section = entry.body.at(at)
          const trims = entry.trims.at(at).solids
          // A body whose section will not close is capped from its base, where it stands across
          // the cut, and not left a hollow stub; a trim never decides that.
          if (!section.complete && entry.body.bounds.min < at && entry.body.bounds.max > at) {
            entry.footprint ??= baseFootprint(entry.bodyMeshes, level)
            return { owner: entry.object, solids: [...entry.footprint, ...trims] }
          }
          return { owner: entry.object, solids: [...section.solids, ...trims] }
        }),
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
