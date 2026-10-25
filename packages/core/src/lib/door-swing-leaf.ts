export type SwingPoint = readonly [number, number]

/** A swing leaf: hinged at `hinge`, closed along `closed` (hinge to strike), swung by `angle` radians. */
export type SwingLeaf = {
  hinge: SwingPoint
  closed: SwingPoint
  angle: number
}

/** The plan symbol draws a swing door fully open, whatever its live swing. */
export const DOOR_PLAN_SWING_ANGLE = Math.PI / 2

/**
 * The leaves of a swing door in plan: one hinged at its `hingesSide` end, or, for a double door,
 * two half-width leaves hinged at the opposite ends and meeting in the middle. `dir` is the unit
 * vector along the opening's width and `swingSign` is +1 for a leaf that swings to the +perpendicular
 * (inward) side, -1 for the other.
 */
export function doorSwingLeaves({
  center,
  dir,
  width,
  doubleLeaf,
  hingesSide,
  swingSign,
  swingAngle = DOOR_PLAN_SWING_ANGLE,
}: {
  center: SwingPoint
  dir: SwingPoint
  width: number
  doubleLeaf: boolean
  hingesSide: 'left' | 'right'
  swingSign: 1 | -1
  swingAngle?: number
}): SwingLeaf[] {
  const [cx, cz] = center
  const [dirX, dirZ] = dir
  const halfWidth = width / 2
  if (doubleLeaf) {
    const halfX = dirX * halfWidth
    const halfZ = dirZ * halfWidth
    return [
      { hinge: [cx - halfX, cz - halfZ], closed: [halfX, halfZ], angle: swingAngle * swingSign },
      { hinge: [cx + halfX, cz + halfZ], closed: [-halfX, -halfZ], angle: -swingAngle * swingSign },
    ]
  }
  const hingeTangentSign = hingesSide === 'left' ? 1 : -1
  return [
    {
      hinge: [cx - dirX * halfWidth * hingeTangentSign, cz - dirZ * halfWidth * hingeTangentSign],
      closed: [dirX * width * hingeTangentSign, dirZ * width * hingeTangentSign],
      angle: swingAngle * swingSign * hingeTangentSign,
    },
  ]
}

/**
 * Where a leaf's closed tip and open tip are, and which way its swing arc sweeps (the SVG
 * sweep flag), or `null` for a leaf too short to draw.
 */
export function swingLeafPose(leaf: SwingLeaf): {
  radius: number
  closedTip: SwingPoint
  tip: SwingPoint
  sweepFlag: 0 | 1
} | null {
  const [hX, hZ] = leaf.hinge
  const [closedX, closedZ] = leaf.closed
  const radius = Math.hypot(closedX, closedZ)
  if (radius < 1e-3) return null
  const cos = Math.cos(leaf.angle)
  const sin = Math.sin(leaf.angle)
  return {
    radius,
    closedTip: [hX + closedX, hZ + closedZ],
    tip: [hX + (closedX * cos - closedZ * sin), hZ + (closedX * sin + closedZ * cos)],
    sweepFlag: leaf.angle >= 0 ? 1 : 0,
  }
}

/** The swing arc as a polyline from the closed tip to the open tip, centred on the hinge. */
export function swingLeafArc(leaf: SwingLeaf, segments = 12): SwingPoint[] {
  const pose = swingLeafPose(leaf)
  if (!pose) return []
  const [hX, hZ] = leaf.hinge
  const [closedX, closedZ] = leaf.closed
  const points: SwingPoint[] = []
  for (let i = 0; i <= segments; i++) {
    const angle = (leaf.angle * i) / segments
    const cos = Math.cos(angle)
    const sin = Math.sin(angle)
    points.push([hX + (closedX * cos - closedZ * sin), hZ + (closedX * sin + closedZ * cos)])
  }
  return points
}
