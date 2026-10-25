// @ts-expect-error — bun:test is provided by the Bun runtime; viewer does not
// depend on @types/bun so the import type is unresolved at compile time.
import { describe, expect, test } from 'bun:test'
import { BoxGeometry, Group, Mesh, MeshBasicMaterial, Raycaster, Vector3 } from 'three'
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
