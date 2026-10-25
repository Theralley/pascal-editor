// @ts-expect-error — bun:test is provided by the Bun runtime.
import { expect, test } from 'bun:test'
import { DoorNode } from '@pascal-app/core'
import { Box3, type Mesh, Raycaster, Vector3 } from 'three'
import {
  createFloorMark,
  FLOOR_MARK_HIT_NAME,
  FLOOR_MARK_LIFT,
  FLOOR_MARK_NAME,
  type FloorMarkSpec,
  floorMarkSpecOf,
} from '../../lib/floor-mark'
import { SCENE_LAYER } from '../../lib/layers'
import { hideFromScene } from '../../lib/scene-visibility'
import { buildDoorPreviewMesh, doorFloorMarkSpec } from './door-system'

function built(patch: Partial<DoorNode>) {
  const door = buildDoorPreviewMesh(DoorNode.parse(patch))
  door.updateMatrixWorld(true)
  return { door, spec: floorMarkSpecOf(door) as FloorMarkSpec }
}

test('a door leaves its mark as data, so its children and bounds are the door and nothing more', () => {
  const { door, spec } = built({ width: 0.9, frameDepth: 0.1 })
  expect(spec).toBeDefined()
  expect(door.children.some((child) => child.name === FLOOR_MARK_NAME)).toBe(false)
  const box = new Box3().setFromObject(door)
  expect(box.max.z - box.min.z).toBeLessThan(0.3)
  expect(box.max.x - box.min.x).toBeCloseTo(0.9, 1)
})

test('the mark lies a hair above the floor under the opening, whatever datum the wall resolves it to', () => {
  const raised = doorFloorMarkSpec(DoorNode.parse({ position: [0, 1.3, 0], height: 2 }))
  expect(raised.y).toBeCloseTo(FLOOR_MARK_LIFT - 1.3, 9)
  // The stored sill is what it follows: the mesh's own height above the wall base does not enter.
  const { door, spec } = built({ position: [0, 1.05, 0], height: 2.1 })
  door.position.y += 0.4
  expect(spec.y).toBeCloseTo(FLOOR_MARK_LIFT - 1.05, 9)
})

test.each([
  ['hinged', 'inward', true],
  ['hinged', 'outward', true],
  ['double', 'inward', true],
  ['sliding', 'inward', false],
  ['garage-sectional', 'inward', false],
] as const)('a %s door swinging %s draws its swing arc: %s', (doorType, swingDirection, swings) => {
  const { spec } = built({ doorType, swingDirection, width: 0.9, frameDepth: 0.1 })
  const side = swingDirection === 'inward' ? 1 : -1
  const reach = side * (spec.hit.center[1] + (side * spec.hit.depth) / 2)
  if (swings) {
    expect(reach).toBeGreaterThan(0.4)
    expect(Math.abs(spec.hit.center[1])).toBeGreaterThan(0.15)
  } else {
    expect(reach).toBeLessThan(0.3)
  }
})

test('a frameless opening and a scripted door are only a footprint', () => {
  const opening = doorFloorMarkSpec(DoorNode.parse({ openingKind: 'opening', width: 0.9 }))
  expect(opening.polylines).toHaveLength(1)
  const scripted = doorFloorMarkSpec(DoorNode.parse({}), { width: 1, depth: 0.2, swings: false })
  expect(scripted.polylines).toHaveLength(1)
  expect(scripted.hit.width).toBeCloseTo(1, 9)
})

test('with the door held back, a ray onto its footprint or its swing arc reaches the mark, which hangs off the door that owns the handlers', () => {
  const { door, spec } = built({ width: 0.9, frameDepth: 0.1, swingDirection: 'inward' })
  door.traverse((object) => {
    if ((object as Mesh).isMesh) hideFromScene(object, 'opening-low')
  })
  door.add(...createFloorMark(spec))
  door.updateMatrixWorld(true)
  const down = (x: number, z: number) => {
    const ray = new Raycaster(new Vector3(x, 5, z), new Vector3(0, -1, 0))
    ray.layers.set(SCENE_LAYER)
    return ray.intersectObject(door, true)[0]?.object
  }
  expect(down(0.2, 0)?.name).toBe(FLOOR_MARK_HIT_NAME)
  expect(down(0.1, 0.6)?.name).toBe(FLOOR_MARK_HIT_NAME)
  expect(down(0.1, 0.6)?.parent).toBe(door)
  expect(down(0.9, 0)).toBeUndefined()
})
