import {
  BufferGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
} from 'three'
import { hideFromScene } from './scene-visibility'

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
 * The two meshes of an opening's floor mark, `y` above the opening's own origin: the drawn lines
 * and a flat hit plane `hitWidth` by `hitDepth` that a pointer ray can reach (a click on it
 * reaches the opening's own handlers, which are on the opening's group). Both start held off the
 * scene layer: the Low wall mode lets them through (`OpeningDisplaySystem`).
 */
export function createFloorMark({
  polylines,
  hitWidth,
  hitDepth,
  y,
}: {
  polylines: readonly (readonly (readonly [number, number])[])[]
  hitWidth: number
  hitDepth: number
  y: number
}): Mesh[] {
  const lines = new Mesh(floorMarkGeometry(polylines), markMaterial)
  lines.name = FLOOR_MARK_NAME
  lines.position.y = y
  lines.raycast = noRaycast
  lines.renderOrder = 1

  const hit = new Mesh(new PlaneGeometry(hitWidth, hitDepth), hitMaterial)
  hit.name = FLOOR_MARK_HIT_NAME
  hit.rotation.x = -Math.PI / 2
  hit.position.y = y

  for (const mesh of [lines, hit]) hideFromScene(mesh, 'floor-mark-off')
  return [lines, hit]
}
