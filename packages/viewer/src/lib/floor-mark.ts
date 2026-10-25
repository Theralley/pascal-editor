import {
  BufferGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Mesh,
  MeshBasicMaterial,
  type Object3D,
  PlaneGeometry,
} from 'three'

/** The `userData` key an opening's system leaves its {@link FloorMarkSpec} under. */
export const FLOOR_MARK_SPEC_KEY = 'floorMark'
export const FLOOR_MARK_NAME = 'floor-mark'
export const FLOOR_MARK_HIT_NAME = 'floor-mark-hit'

/** The mark clears the floor by this much so it does not fight the slab's top face. */
export const FLOOR_MARK_LIFT = 0.015
const FLOOR_MARK_HALF_WIDTH = 0.012

// Transparent, so the node batch never packs it; it is a line on the floor, not geometry to merge.
const markMaterial = new MeshBasicMaterial({
  color: '#475569',
  transparent: true,
  opacity: 0.9,
  depthWrite: false,
  side: DoubleSide,
  toneMapped: false,
})
// The same idiom as an opening's hit box: not drawn, still the target of a pointer ray.
const hitMaterial = new MeshBasicMaterial({ visible: false })

const noRaycast = () => {}

/** A flat ribbon along each polyline of `[x, z]` points, lying in the XZ plane at height 0. */
export function floorMarkGeometry(
  polylines: readonly (readonly (readonly [number, number])[])[],
  halfWidth = FLOOR_MARK_HALF_WIDTH,
): BufferGeometry {
  const positions: number[] = []
  for (const line of polylines) {
    for (let i = 1; i < line.length; i++) {
      const [ax, az] = line[i - 1]!
      const [bx, bz] = line[i]!
      const length = Math.hypot(bx - ax, bz - az)
      if (length < 1e-6) continue
      const nx = (-(bz - az) / length) * halfWidth
      const nz = ((bx - ax) / length) * halfWidth
      positions.push(
        ax - nx,
        0,
        az - nz,
        ax + nx,
        0,
        az + nz,
        bx + nx,
        0,
        bz + nz,
        ax - nx,
        0,
        az - nz,
        bx + nx,
        0,
        bz + nz,
        bx - nx,
        0,
        bz - nz,
      )
    }
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  return geometry
}

/**
 * What an opening's system leaves on its mesh for the Low wall mode to draw: plain data in the
 * opening's own frame (`y` above its origin), so a door that is not shown as a mark pays nothing
 * and keeps its bounds. `hit` is the flat pick plane, centred at `center`.
 */
export type FloorMarkSpec = {
  polylines: readonly (readonly (readonly [number, number])[])[]
  hit: { center: readonly [number, number]; width: number; depth: number }
  y: number
}

/** A spec whose pick plane covers everything the polylines draw, with a floor of `minDepth` across. */
export function floorMarkSpec(
  polylines: FloorMarkSpec['polylines'],
  y: number,
  minDepth = 0.3,
): FloorMarkSpec {
  let minX = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let minZ = Number.POSITIVE_INFINITY
  let maxZ = Number.NEGATIVE_INFINITY
  for (const line of polylines) {
    for (const [x, z] of line) {
      minX = Math.min(minX, x)
      maxX = Math.max(maxX, x)
      minZ = Math.min(minZ, z)
      maxZ = Math.max(maxZ, z)
    }
  }
  const centerZ = (minZ + maxZ) / 2
  const depth = Math.max(maxZ - minZ, minDepth)
  return {
    polylines,
    hit: { center: [(minX + maxX) / 2, centerZ], width: maxX - minX, depth },
    y,
  }
}

export function floorMarkSpecOf(object: Object3D): FloorMarkSpec | undefined {
  return object.userData[FLOOR_MARK_SPEC_KEY] as FloorMarkSpec | undefined
}

/**
 * The two meshes of an opening's floor mark: the drawn lines and a flat plane a pointer ray can
 * reach (a click on it reaches the opening's own handlers, which are on the opening's group).
 */
export function createFloorMark(spec: FloorMarkSpec): Mesh[] {
  const lines = new Mesh(floorMarkGeometry(spec.polylines), markMaterial)
  lines.name = FLOOR_MARK_NAME
  lines.position.y = spec.y
  lines.raycast = noRaycast
  lines.renderOrder = 1

  const hit = new Mesh(new PlaneGeometry(spec.hit.width, spec.hit.depth), hitMaterial)
  hit.name = FLOOR_MARK_HIT_NAME
  hit.rotation.x = -Math.PI / 2
  hit.position.set(spec.hit.center[0], spec.y, spec.hit.center[1])
  return [lines, hit]
}
