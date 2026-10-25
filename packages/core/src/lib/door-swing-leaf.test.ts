import { expect, test } from 'bun:test'
import { doorSwingLeaves, swingLeafArc, swingLeafPose } from './door-swing-leaf'

const alongX = { center: [0, 0] as const, dir: [1, 0] as const, width: 0.9 }
const near = (actual: readonly number[], expected: readonly number[]) => {
  expect(actual.length).toBe(expected.length)
  for (const [i, value] of expected.entries()) expect(actual[i]).toBeCloseTo(value, 9)
}

for (const [hingesSide, swingSign, hinge, closed, angle] of [
  ['left', 1, [-0.45, 0], [0.9, 0], Math.PI / 2],
  ['left', -1, [-0.45, 0], [0.9, 0], -Math.PI / 2],
  ['right', 1, [0.45, 0], [-0.9, 0], -Math.PI / 2],
  ['right', -1, [0.45, 0], [-0.9, 0], Math.PI / 2],
] as const) {
  test(`a single ${hingesSide}-hinged leaf swinging ${swingSign > 0 ? 'in' : 'out'} is hinged at its own end and closed toward the strike`, () => {
    const leaves = doorSwingLeaves({ ...alongX, doubleLeaf: false, hingesSide, swingSign })
    expect(leaves).toHaveLength(1)
    near(leaves[0]!.hinge, hinge)
    near(leaves[0]!.closed, closed)
    expect(leaves[0]!.angle).toBeCloseTo(angle, 9)
  })
}

test('a double door hangs two half-width leaves that meet perpendicular in the middle', () => {
  const [first, second] = doorSwingLeaves({
    ...alongX,
    doubleLeaf: true,
    hingesSide: 'left',
    swingSign: 1,
  })
  near(first!.hinge, [-0.45, 0])
  near(second!.hinge, [0.45, 0])
  near(first!.closed, [0.45, 0])
  near(second!.closed, [-0.45, 0])
  expect(first!.angle).toBeCloseTo(Math.PI / 2, 9)
  expect(second!.angle).toBeCloseTo(-Math.PI / 2, 9)
  near(swingLeafPose(first!)!.tip, [-0.45, 0.45])
  near(swingLeafPose(second!)!.tip, [0.45, 0.45])
})

test('the pose puts the open tip a quarter turn from the closed tip, sweeping with the sign of the angle', () => {
  const [left] = doorSwingLeaves({ ...alongX, doubleLeaf: false, hingesSide: 'left', swingSign: 1 })
  const pose = swingLeafPose(left!)!
  expect(pose.radius).toBeCloseTo(0.9, 9)
  near(pose.closedTip, [0.45, 0])
  near(pose.tip, [-0.45, 0.9])
  expect(pose.sweepFlag).toBe(1)
  const [right] = doorSwingLeaves({
    ...alongX,
    doubleLeaf: false,
    hingesSide: 'right',
    swingSign: 1,
  })
  expect(swingLeafPose(right!)!.sweepFlag).toBe(0)
})

test('the arc runs from the closed tip to the open tip on a circle about the hinge', () => {
  const [leaf] = doorSwingLeaves({ ...alongX, doubleLeaf: false, hingesSide: 'left', swingSign: 1 })
  const arc = swingLeafArc(leaf!, 8)
  const pose = swingLeafPose(leaf!)!
  expect(arc).toHaveLength(9)
  near(arc[0]!, pose.closedTip)
  near(arc[8]!, pose.tip)
  for (const [x, z] of arc) {
    expect(Math.hypot(x - leaf!.hinge[0], z - leaf!.hinge[1])).toBeCloseTo(0.9, 9)
  }
})

test('a leaf too short to draw has no pose', () => {
  expect(swingLeafPose({ hinge: [0, 0], closed: [0.0004, 0], angle: 1 })).toBeNull()
  expect(swingLeafArc({ hinge: [0, 0], closed: [0, 0], angle: 1 })).toEqual([])
})
