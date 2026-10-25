// @ts-expect-error — bun:test is provided by the Bun runtime; viewer does not
// depend on @types/bun so the import type is unresolved at compile time.
import { describe, expect, test } from 'bun:test'
import {
  calculateLevelMiters,
  DoorNode,
  sceneRegistry,
  WallNode,
  WindowNode,
} from '@pascal-app/core'
import {
  BoxGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  Raycaster,
  Vector3,
} from 'three'
import { generateExtrudedWall } from '../../systems/wall/wall-system'
import { cutBakedWalls, GLB_WALL_CAPS_NAME } from './glb-wall-cut'

function bakedLevel() {
  const level = new Group()
  level.userData = { pascalId: 'level_1', kind: 'level' }
  level.position.y = 3
  const wall = new Group()
  wall.userData = { pascalId: 'wall_1', kind: 'wall' }
  const geometry = new BoxGeometry(4, 2.5, 0.2).translate(2, 1.25, 0)
  const material = new MeshBasicMaterial()
  const body = new Mesh(geometry, material)
  const door = new Group()
  door.userData = { pascalId: 'door_1', kind: 'door' }
  const doorMesh = new Mesh(new BoxGeometry(1, 2, 0.1).translate(1, 1, 0), new MeshBasicMaterial())
  door.add(doorMesh)
  wall.add(body, door)
  level.add(wall)
  level.updateMatrixWorld(true)
  return { level, wall, body, doorMesh, material }
}

const shoot = (root: Group, from: Vector3, direction: Vector3) =>
  new Raycaster(from, direction.normalize()).intersectObject(root, true)

describe('cutBakedWalls', () => {
  test('cuts the wall, not what is hosted on it, caps the level at the cut, and puts everything back', () => {
    const { level, wall, body, doorMesh, material } = bakedLevel()
    const doorMaterial = doorMesh.material
    const cut = cutBakedWalls([{ object: wall, level }], 0.25, new MeshBasicMaterial())

    expect(body.material).not.toBe(material)
    expect((body.material as { maskNode?: unknown }).maskNode).toBeDefined()
    expect(doorMesh.material).toBe(doorMaterial)

    const cap = level.getObjectByName(GLB_WALL_CAPS_NAME) as Mesh
    level.updateMatrixWorld(true)
    expect(cap.position.y).toBe(0.25)
    const position = cap.geometry.getAttribute('position')
    let area = 0
    const index = cap.geometry.getIndex()!
    for (let i = 0; i < index.count; i += 3) {
      const [p, q, r] = [0, 1, 2].map((k) => index.getX(i + k))
      const up =
        (position.getZ(q!) - position.getZ(p!)) * (position.getX(r!) - position.getX(p!)) -
        (position.getX(q!) - position.getX(p!)) * (position.getZ(r!) - position.getZ(p!))
      expect(up).toBeGreaterThanOrEqual(0)
      area += up / 2
    }
    expect(area).toBeCloseTo(4 * 0.2, 5)

    // A ray from above lands on the stub at the level's cut, as on the wall; the door's own hitbox is untouched.
    const down = new Vector3(0, -1, 0)
    const top = shoot(level as unknown as Group, new Vector3(3, 9, 0.05), down)
    expect(top[0]?.object).toBe(wall)
    expect(top[0]?.point.y).toBeCloseTo(3.25, 5)
    expect(
      shoot(level as unknown as Group, new Vector3(1.5, 9, 0), down).some(
        (h) => h.object === doorMesh,
      ),
    ).toBe(true)

    cut.setHeight(0.5)
    expect(cap.position.y).toBe(0.5)

    cut.dispose()
    expect(body.material).toBe(material)
    expect(level.getObjectByName(GLB_WALL_CAPS_NAME)).toBeUndefined()
    const restored = shoot(level as unknown as Group, new Vector3(3, 9, 0.05), down)
    expect(restored.find((hit) => hit.object === body)?.point.y).toBeCloseTo(5.5, 5)
  })

  test('a wall the bake marked as one the cut leaves whole stays whole', () => {
    const { level, wall, body, material } = bakedLevel()
    wall.userData.displayCut = false
    const cut = cutBakedWalls([{ object: wall, level }], 0.25, new MeshBasicMaterial())
    expect(body.material).toBe(material)
    expect(level.getObjectByName(GLB_WALL_CAPS_NAME)).toBeUndefined()
    cut.dispose()
  })
})

/** The area of the cap on a level, every triangle facing up. */
function capArea(level: Group): number {
  const cap = level.getObjectByName(GLB_WALL_CAPS_NAME) as Mesh | undefined
  if (!cap) return 0
  const position = cap.geometry.getAttribute('position')
  const index = cap.geometry.getIndex()!
  let area = 0
  for (let i = 0; i < index.count; i += 3) {
    const [p, q, r] = [0, 1, 2].map((k) => index.getX(i + k))
    const up =
      (position.getZ(q!) - position.getZ(p!)) * (position.getX(r!) - position.getX(p!)) -
      (position.getX(q!) - position.getX(p!)) * (position.getZ(r!) - position.getZ(p!))
    expect(up).toBeGreaterThanOrEqual(-1e-6)
    area += up / 2
  }
  return area
}

describe('cutBakedWalls caps', () => {
  test('a baked wall with a door and a window is capped as the live one is, at any cut', () => {
    const wall = WallNode.parse({ start: [0, 0], end: [4, 0], thickness: 0.2 })
    const door = DoorNode.parse({ wallId: wall.id, position: [1, 1.05, 0], width: 1, height: 2.1 })
    const window = WindowNode.parse({ wallId: wall.id, position: [3, 1.5, 0], width: 1, height: 1 })
    sceneRegistry.nodes.set(wall.id, new Mesh())
    const geometry = generateExtrudedWall(wall, [door, window], calculateLevelMiters([wall]))
    sceneRegistry.nodes.delete(wall.id)

    const level = new Group()
    level.userData = { pascalId: 'level_1', kind: 'level' }
    level.position.y = 3
    const object = new Group()
    object.userData = { pascalId: wall.id, kind: 'wall', displayCut: true }
    object.add(new Mesh(geometry, new MeshBasicMaterial()))
    level.add(object)
    level.updateMatrixWorld(true)

    const cut = cutBakedWalls([{ object, level }], 0.25, new MeshBasicMaterial())
    expect(capArea(level)).toBeCloseTo((4 - 1) * 0.2, 4)
    // The window's sill is at 1.0 m: a cut above it passes through the window too.
    cut.setHeight(1.2)
    expect(capArea(level)).toBeCloseTo((4 - 1 - 1) * 0.2, 4)
    // A cut above the wall's top leaves no plate floating over it.
    cut.setHeight(2.8)
    expect(level.getObjectByName(GLB_WALL_CAPS_NAME)).toBeUndefined()
    cut.setHeight(0.25)
    expect(capArea(level)).toBeCloseTo((4 - 1) * 0.2, 4)
    cut.dispose()
    expect(level.getObjectByName(GLB_WALL_CAPS_NAME)).toBeUndefined()
  })

  test('a wall shorter than the cut has no cap', () => {
    const { level, wall } = bakedLevel()
    const cut = cutBakedWalls([{ object: wall, level }], 2.7, new MeshBasicMaterial())
    expect(level.getObjectByName(GLB_WALL_CAPS_NAME)).toBeUndefined()
    cut.dispose()
  })

  test('a bake that was not stamped is judged by what its wall draws: glass stays whole, the stamp wins', () => {
    for (const [stamp, transparent, cutExpected] of [
      [undefined, true, false],
      [undefined, false, true],
      [true, true, true],
      [false, false, false],
    ] as const) {
      const { level, wall, body } = bakedLevel()
      body.material = new MeshBasicMaterial({ transparent, opacity: transparent ? 0.3 : 1 })
      if (stamp !== undefined) wall.userData.displayCut = stamp
      const cut = cutBakedWalls([{ object: wall, level }], 0.25, new MeshBasicMaterial())
      expect(level.getObjectByName(GLB_WALL_CAPS_NAME) !== undefined).toBe(cutExpected)
      cut.dispose()
    }
  })

  test('an unstamped wall in exported glass (transmission, opaque) stays whole', () => {
    const { level, wall, body } = bakedLevel()
    body.material = new MeshPhysicalMaterial({ transmission: 1 })
    const cut = cutBakedWalls([{ object: wall, level }], 0.25, new MeshBasicMaterial())
    expect(level.getObjectByName(GLB_WALL_CAPS_NAME)).toBeUndefined()
    cut.dispose()
  })
})
