import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { LevelNode, sceneRegistry, useScene, WallNode } from '@pascal-app/core'
import { Group, type Mesh, Raycaster, Vector3 } from 'three'
import { buildWallCapGeometry, WALL_CUT_CAPS_NAME, WallCutCaps } from './wall-cut-caps'

const sceneBefore = useScene.getState()

function level(walls: WallNode[]) {
  const node = LevelNode.parse({ children: walls.map((wall) => wall.id) })
  const root = new Group()
  sceneRegistry.nodes.set(node.id, root)
  sceneRegistry.byType.level!.add(node.id)
  useScene.setState({
    nodes: {
      [node.id]: node,
      ...Object.fromEntries(walls.map((wall) => [wall.id, { ...wall, parentId: node.id }])),
    },
  })
  return { node, root }
}

const capsOf = (root: Group) => root.getObjectByName(WALL_CUT_CAPS_NAME) as Mesh | undefined

beforeEach(() => {
  sceneRegistry.clear()
  useScene.setState({ nodes: {}, materials: {} })
})

afterEach(() => {
  sceneRegistry.clear()
  useScene.setState(sceneBefore)
})

describe('WallCutCaps', () => {
  test("a cap is the walls' footprint, flat and facing up, at the cut, and takes no part in picking", () => {
    const wall = WallNode.parse({ start: [0, 0], end: [4, 0], thickness: 0.2 })
    const { root } = level([wall])
    const caps = new WallCutCaps()
    caps.update(true, 0.25, 'solid')
    const cap = capsOf(root)!
    expect(cap).toBeDefined()
    root.updateMatrixWorld(true)
    const hits = new Raycaster(new Vector3(2, 5, 0), new Vector3(0, -1, 0)).intersectObject(cap)
    // The cap does not take part in picking: the stub's collision mesh does.
    expect(hits).toHaveLength(0)
    const position = cap.geometry.getAttribute('position')
    const index = cap.geometry.getIndex()!
    let area = 0
    for (let i = 0; i < index.count; i += 3) {
      const [a, b, c] = [0, 1, 2].map((k) => index.getX(i + k))
      const ax = position.getX(a!)
      const az = position.getZ(a!)
      const up =
        (position.getZ(b!) - az) * (position.getX(c!) - ax) -
        (position.getX(b!) - ax) * (position.getZ(c!) - az)
      expect(up).toBeGreaterThanOrEqual(0)
      area += up / 2
    }
    expect(area).toBeCloseTo(4 * 0.2, 5)
    for (let i = 0; i < position.count; i++) expect(position.getY(i)).toBe(0)
    expect(cap.position.y).toBe(0.25)
    caps.dispose()
  })

  test('moving the cut moves the cap and builds nothing again; walls changing rebuild it', () => {
    const wall = WallNode.parse({ start: [0, 0], end: [4, 0] })
    const { root } = level([wall])
    const caps = new WallCutCaps()
    caps.update(true, 0.25, 'solid')
    const cap = capsOf(root)!
    const geometry = cap.geometry
    caps.update(true, 0.9, 'solid')
    expect(capsOf(root)).toBe(cap)
    expect(cap.geometry).toBe(geometry)
    expect(cap.position.y).toBe(0.9)

    const longer = { ...useScene.getState().nodes[wall.id]!, end: [6, 0] } as WallNode
    useScene.setState({ nodes: { ...useScene.getState().nodes, [wall.id]: longer } })
    caps.update(true, 0.9, 'solid')
    expect(capsOf(root)).toBe(cap)
    expect(cap.geometry).not.toBe(geometry)
    caps.dispose()
  })

  test('the caps are taken away when the walls come up, and a curtain wall has none', () => {
    const curtain = WallNode.parse({ start: [0, 0], end: [4, 0], wallType: 'curtain' })
    const { root } = level([curtain])
    const caps = new WallCutCaps()
    caps.update(true, 0.25, 'solid')
    expect(capsOf(root)).toBeUndefined()

    const wall = WallNode.parse({ start: [0, 1], end: [4, 1] })
    const second = level([wall])
    caps.update(true, 0.25, 'solid')
    expect(capsOf(second.root)).toBeDefined()
    caps.update(false, 0.25, 'solid')
    expect(capsOf(second.root)).toBeUndefined()
    caps.dispose()
  })
})

describe('buildWallCapGeometry', () => {
  test('is nothing for no walls', () => {
    expect(buildWallCapGeometry([], { junctionData: new Map() } as never)).toBeNull()
  })
})
