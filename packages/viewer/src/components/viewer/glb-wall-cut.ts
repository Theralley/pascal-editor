import {
  BufferGeometry,
  Float32BufferAttribute,
  type Intersection,
  type Material,
  Matrix4,
  Mesh,
  type Object3D,
  Vector3,
} from 'three'
import {
  cutLike,
  setDisplayCutHeight,
  setDisplayCutRaycast,
  setDisplayCutRoot,
} from '../../lib/display-cut'

type BakedWall = { object: Object3D; level: Object3D }

export const GLB_WALL_CAPS_NAME = 'wall-cut-caps'

const BASE_BAND = 0.02
const FACES_DOWN = -0.7

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

const toLevel = new Matrix4()
const a = new Vector3()
const b = new Vector3()
const c = new Vector3()

/**
 * The footprint of a baked wall, read off its base: the faces that look down at the lowest height
 * are the wall standing on the floor, so a doorway (no base there) stays open. In the level's
 * frame, flat at y = 0, facing up.
 */
function pushBaseFootprint(
  mesh: Mesh,
  level: Object3D,
  positions: number[],
  indices: number[],
): number {
  const position = mesh.geometry.getAttribute('position')
  if (!position) return 0
  mesh.updateWorldMatrix(true, false)
  level.updateWorldMatrix(true, false)
  toLevel.copy(level.matrixWorld).invert().multiply(mesh.matrixWorld)
  const index = mesh.geometry.getIndex()
  const count = index ? index.count : position.count
  const vertex = (i: number, into: Vector3) =>
    into.fromBufferAttribute(position, index ? index.getX(i) : i).applyMatrix4(toLevel)
  let lowest = Number.POSITIVE_INFINITY
  for (let i = 0; i < position.count; i++) {
    lowest = Math.min(lowest, a.fromBufferAttribute(position, i).applyMatrix4(toLevel).y)
  }
  let added = 0
  for (let i = 0; i + 2 < count; i += 3) {
    vertex(i, a)
    vertex(i + 1, b)
    vertex(i + 2, c)
    if (Math.max(a.y, b.y, c.y) > lowest + BASE_BAND) continue
    const ux = b.x - a.x
    const uy = b.y - a.y
    const uz = b.z - a.z
    const vx = c.x - a.x
    const vy = c.y - a.y
    const vz = c.z - a.z
    const nx = uy * vz - uz * vy
    const ny = uz * vx - ux * vz
    const nz = ux * vy - uy * vx
    const length = Math.hypot(nx, ny, nz)
    if (length === 0 || ny / length > FACES_DOWN) continue
    const base = positions.length / 3
    // Seen from below the triangle winds one way; from above it winds the other.
    positions.push(a.x, 0, a.z, c.x, 0, c.z, b.x, 0, b.z)
    indices.push(base, base + 1, base + 2)
    added += 1
  }
  return added
}

export type BakedWallCut = {
  setHeight: (height: number) => void
  dispose: () => void
}

/**
 * Cuts the walls of a baked scene (a published GLB) like the live viewer cuts them: their
 * materials wear the mask, a pick sees the stub, and each level gets a cap at the cut built from
 * the walls' bases. Presentation only: `dispose` puts every mesh back as it was.
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
    { positions: number[]; indices: number[]; owners: Object3D[] }
  >()
  for (const { object, level } of walls) {
    // A node the bake marked as one the cut leaves whole (a curtain wall).
    if ((object.userData as { displayCut?: boolean }).displayCut === false) continue
    const footprint = perLevel.get(level) ?? { positions: [], indices: [], owners: [] }
    perLevel.set(level, footprint)
    for (const mesh of ownMeshes(object)) {
      worn.set(mesh, mesh.material)
      setDisplayCutRoot(mesh, level)
      setDisplayCutRaycast(mesh, true)
      mesh.material = cutLike(mesh, mesh.material)
      const added = pushBaseFootprint(mesh, level, footprint.positions, footprint.indices)
      for (let i = 0; i < added; i++) footprint.owners.push(object)
    }
  }
  const caps: Mesh[] = []
  for (const [level, { positions, indices, owners }] of perLevel) {
    if (indices.length === 0) continue
    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
    geometry.setAttribute(
      'normal',
      new Float32BufferAttribute(
        Array.from({ length: positions.length / 3 }, () => [0, 1, 0]).flat(),
        3,
      ),
    )
    geometry.setIndex(indices)
    const cap = new Mesh(geometry, capMaterial)
    cap.name = GLB_WALL_CAPS_NAME
    cap.userData.pascalExport = 'strip'
    cap.castShadow = true
    cap.receiveShadow = true
    // A pick lands on the stub's top as on the wall it belongs to.
    cap.raycast = function raycast(raycaster, intersects) {
      const hits: Intersection[] = []
      Mesh.prototype.raycast.call(this, raycaster, hits)
      for (const hit of hits) {
        const owner = owners[hit.faceIndex ?? -1]
        if (owner) intersects.push({ ...hit, object: owner })
      }
    }
    cap.position.y = height
    level.add(cap)
    caps.push(cap)
  }
  return {
    setHeight: (next) => {
      setDisplayCutHeight(next)
      for (const cap of caps) cap.position.y = next
    },
    dispose: () => {
      for (const cap of caps) {
        cap.removeFromParent()
        cap.geometry.dispose()
      }
      for (const [mesh, material] of worn) {
        setDisplayCutRaycast(mesh, false)
        setDisplayCutRoot(mesh, null)
        mesh.material = material
      }
    },
  }
}
