// @ts-expect-error — bun:test is provided by the Bun runtime.
import { expect, test } from 'bun:test'
import { DoorNode } from '@pascal-app/core'
import { type Mesh, Raycaster, Vector3 } from 'three'
import { FLOOR_MARK_HIT_NAME, FLOOR_MARK_NAME } from '../../lib/floor-mark'
import { SCENE_LAYER } from '../../lib/layers'
import { hideFromScene, showInScene } from '../../lib/scene-visibility'
import { buildDoorPreviewMesh } from './door-system'

function markOf(patch: Partial<DoorNode>) {
  const door = buildDoorPreviewMesh(DoorNode.parse(patch))
  door.updateMatrixWorld(true)
  return {
    door,
    lines: door.getObjectByName(FLOOR_MARK_NAME) as Mesh,
    hit: door.getObjectByName(FLOOR_MARK_HIT_NAME) as Mesh,
  }
}

/** How far the mark's lines reach from the door's centre across the wall (the swing side). */
function reachAcross(lines: Mesh) {
  lines.geometry.computeBoundingBox()
  const box = lines.geometry.boundingBox!
  return { inward: box.max.z, outward: -box.min.z }
}

test('a door is built with its floor mark held off the scene until the Low wall mode lets it through', () => {
  const { lines, hit } = markOf({})
  expect(lines.layers.isEnabled(SCENE_LAYER)).toBe(false)
  expect(hit.layers.isEnabled(SCENE_LAYER)).toBe(false)
  showInScene(lines, 'floor-mark-off')
  showInScene(hit, 'floor-mark-off')
  expect(lines.layers.isEnabled(SCENE_LAYER)).toBe(true)
  expect(hit.layers.isEnabled(SCENE_LAYER)).toBe(true)
})

test('with the door held back, a pointer ray down onto its footprint reaches the mark, whose ancestor is the door that owns the handlers', () => {
  const { door, hit } = markOf({ width: 0.9 })
  door.traverse((object) => {
    if ((object as Mesh).isMesh && object !== hit && object.name !== FLOOR_MARK_NAME) {
      hideFromScene(object, 'opening-low')
    }
  })
  showInScene(hit, 'floor-mark-off')
  const ray = new Raycaster(new Vector3(0.2, 5, 0), new Vector3(0, -1, 0))
  ray.layers.set(SCENE_LAYER)
  const [first] = ray.intersectObject(door, true)
  expect(first?.object).toBe(hit)
  expect(hit.parent).toBe(door)
  const aside = new Raycaster(new Vector3(0.9, 5, 0), new Vector3(0, -1, 0))
  aside.layers.set(SCENE_LAYER)
  expect(aside.intersectObject(door, true)).toHaveLength(0)
})

test('the mark lies at the floor, below the door centre and not above it', () => {
  const { door, hit } = markOf({ height: 2.1 })
  door.updateMatrixWorld(true)
  const world = new Vector3()
  hit.getWorldPosition(world)
  expect(world.y).toBeGreaterThan(0)
  expect(world.y).toBeLessThan(0.05)
})

test.each([
  ['hinged', 'inward', true],
  ['hinged', 'outward', true],
  ['double', 'inward', true],
  ['sliding', 'inward', false],
  ['garage-sectional', 'inward', false],
] as const)('a %s door swinging %s draws its swing arc: %s', (doorType, swingDirection, swings) => {
  const { lines } = markOf({ doorType, swingDirection, width: 0.9, frameDepth: 0.1 })
  const { inward, outward } = reachAcross(lines)
  const reach = swingDirection === 'inward' ? inward : outward
  const other = swingDirection === 'inward' ? outward : inward
  if (swings) {
    expect(reach).toBeGreaterThan(0.4)
    expect(other).toBeLessThan(0.1)
  } else {
    expect(reach).toBeLessThan(0.1)
  }
})

test('a frameless opening is only a footprint', () => {
  const { lines } = markOf({ openingKind: 'opening', width: 0.9, frameDepth: 0.1 })
  expect(reachAcross(lines).inward).toBeLessThan(0.1)
})
