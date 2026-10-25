import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test'
import {
  calculateLevelMiters,
  DoorNode,
  getWallCurveFrameAt,
  getWallCurveLength,
  LevelNode,
  sceneRegistry,
  useLiveNodeOverrides,
  useScene,
  WallNode,
  WindowNode,
} from '@pascal-app/core'
import {
  BoxGeometry,
  type BufferGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  Raycaster,
  Vector3,
} from 'three'
import { createStore } from 'zustand/vanilla'
import {
  displayCutLimitY,
  getDisplayCutHeight,
  getDisplayCutRoot,
  setDisplayCutHeight,
  setDisplayCutRoot,
} from '../../lib/display-cut'
import { WALL_CUT_CAPS_NAME, WallCutCaps } from './wall-cut-caps'
import { presentWallsLowForCapture } from './wall-cutout'
import { WallCutoutCache, type WallCutoutViewerState } from './wall-cutout-cache'
import { generateExtrudedWall } from './wall-system'

const sceneBefore = useScene.getState()

type Standing = {
  base?: number
  height?: number
  children?: (DoorNode | WindowNode)[]
  /** The wall's own fields, and the geometry its mesh draws (a plain box when not given). */
  wall?: Partial<WallNode>
  geometry?: (wall: WallNode) => BufferGeometry
}

/** A level with one 4 m wall along x, 0.2 m thick, its mesh registered with a built geometry. */
function level({ base = 0, height = 2.5, children = [], wall: fields, geometry }: Standing = {}) {
  const wall = WallNode.parse({
    start: [0, 0],
    end: [4, 0],
    thickness: 0.2,
    ...fields,
    children: children.map((child) => child.id),
  })
  const node = LevelNode.parse({ children: [wall.id] })
  const root = new Group()
  sceneRegistry.nodes.set(node.id, root)
  sceneRegistry.byType.level!.add(node.id)
  useScene.setState({
    nodes: {
      [node.id]: node,
      [wall.id]: { ...wall, parentId: node.id },
      ...Object.fromEntries(children.map((child) => [child.id, { ...child, parentId: wall.id }])),
    },
  })
  // The wall's cutter reads its own registered mesh.
  sceneRegistry.nodes.set(wall.id, new Mesh())
  const mesh = new Mesh(
    geometry?.(wall) ?? new BoxGeometry(4, height, 0.2).translate(2, height / 2, 0),
    [new MeshBasicMaterial()],
  )
  mesh.geometry.clearGroups()
  mesh.geometry.addGroup(
    0,
    mesh.geometry.getIndex()?.count ?? mesh.geometry.getAttribute('position').count,
    0,
  )
  mesh.position.y = base
  const collision = new Mesh(mesh.geometry)
  collision.name = 'collision-mesh'
  mesh.add(collision)
  root.add(mesh)
  sceneRegistry.nodes.set(wall.id, mesh)
  sceneRegistry.byType.wall!.add(wall.id)
  root.updateMatrixWorld(true)
  return { wall, node, root, mesh, collision }
}

const capsOf = (root: Group) => root.getObjectByName(WALL_CUT_CAPS_NAME) as Mesh | undefined

function area(mesh: Mesh): number {
  const position = mesh.geometry.getAttribute('position')
  const index = mesh.geometry.getIndex()!
  let total = 0
  for (let i = 0; i < index.count; i += 3) {
    const [a, b, c] = [0, 1, 2].map((k) => index.getX(i + k))
    const up =
      (position.getZ(b!) - position.getZ(a!)) * (position.getX(c!) - position.getX(a!)) -
      (position.getX(b!) - position.getX(a!)) * (position.getZ(c!) - position.getZ(a!))
    expect(up).toBeGreaterThanOrEqual(-1e-6)
    total += up / 2
  }
  return total
}

/** Whether the cap has a face over the plan point (x, z). */
function covers(mesh: Mesh | undefined, x: number, z: number): boolean {
  if (!mesh) return false
  const position = mesh.geometry.getAttribute('position')
  const index = mesh.geometry.getIndex()!
  for (let i = 0; i < index.count; i += 3) {
    const [a, b, c] = [0, 1, 2].map((k) => index.getX(i + k) as number)
    const side = (p: number, q: number) =>
      (position.getX(q) - position.getX(p)) * (z - position.getZ(p)) -
      (position.getZ(q) - position.getZ(p)) * (x - position.getX(p))
    const signs = [side(a!, b!), side(b!, c!), side(c!, a!)]
    if (signs.every((v) => v >= 0) || signs.every((v) => v <= 0)) return true
  }
  return false
}

beforeEach(() => {
  sceneRegistry.clear()
  useScene.setState({ nodes: {}, materials: {} })
  useLiveNodeOverrides.getState().clearAll()
  setDisplayCutHeight(0)
})

afterEach(() => {
  sceneRegistry.clear()
  useScene.setState(sceneBefore)
})

const store = () =>
  createStore<WallCutoutViewerState>(() => ({
    wallMode: 'low',
    wallCutHeight: 0.25,
    shading: 'solid',
    textures: false,
    colorPreset: 'clay',
    sceneTheme: 'studio',
    selection: { buildingId: null, levelId: null, zoneId: null, selectedIds: [] },
    previewSelectedIds: [],
    hoveredId: null,
    hoverHighlightMode: 'default',
  }))

describe('WallCutCaps', () => {
  test("a cap is the wall's footprint, flat and facing up, at the cut", () => {
    const { root } = level()
    const caps = new WallCutCaps()
    caps.update(true, 0.25, 'solid')
    const cap = capsOf(root)!
    expect(area(cap)).toBeCloseTo(4 * 0.2, 5)
    const position = cap.geometry.getAttribute('position')
    for (let i = 0; i < position.count; i++) expect(position.getY(i)).toBe(0)
    expect(cap.position.y).toBe(0.25)
    caps.dispose()
  })

  test('a pick from above lands on the stub as on the wall it belongs to', () => {
    const { root, collision } = level()
    const cache = new WallCutoutCache(store())
    cache.update(new PerspectiveCamera(), 1)
    const caps = new WallCutCaps()
    caps.update(true, 0.25, 'solid')
    root.updateMatrixWorld(true)
    const hits = new Raycaster(new Vector3(1.5, 5, 0), new Vector3(0, -1, 0)).intersectObject(
      root,
      true,
    )
    // The wall's own top is above the cut and dropped: the first thing hit is the stub's top.
    expect(hits[0]?.object).toBe(collision)
    expect(hits[0]?.point.y).toBeCloseTo(0.25, 5)
    caps.dispose()
  })

  test('moving the cut sections the wall again at the new height; nothing changing builds nothing', () => {
    const { root } = level()
    const caps = new WallCutCaps()
    caps.update(true, 0.25, 'solid')
    const cap = capsOf(root)!
    const geometry = cap.geometry
    caps.update(true, 0.25, 'solid')
    expect(cap.geometry).toBe(geometry)
    caps.update(true, 0.9, 'solid')
    expect(capsOf(root)).toBe(cap)
    expect(cap.geometry).not.toBe(geometry)
    expect(area(cap)).toBeCloseTo(4 * 0.2, 5)
    expect(cap.position.y).toBe(0.9)
    const moved = cap.geometry
    caps.update(true, 0.9, 'solid')
    expect(cap.geometry).toBe(moved)
    caps.dispose()
  })

  test('a live override on the wall does not remake the cap every frame, a rebuild does', () => {
    const { wall, root, mesh } = level()
    const caps = new WallCutCaps()
    caps.update(true, 0.25, 'solid')
    const geometry = capsOf(root)!.geometry
    useLiveNodeOverrides.getState().set(wall.id, { end: [6, 0] })
    caps.update(true, 0.25, 'solid')
    caps.update(true, 0.25, 'solid')
    expect(capsOf(root)!.geometry).toBe(geometry)
    // The wall is rebuilt longer: its mesh draws the new body and the rebuild is announced.
    const longer = { ...wall, end: [6, 0] as [number, number] }
    mesh.geometry = generateExtrudedWall(longer, [], calculateLevelMiters([longer]))
    caps.markWall(wall.id)
    caps.update(true, 0.25, 'solid')
    expect(capsOf(root)!.geometry).not.toBe(geometry)
    expect(area(capsOf(root)!)).toBeCloseTo(6 * 0.2, 5)
    caps.dispose()
  })

  const built = (children: (DoorNode | WindowNode)[]) => (wall: WallNode) =>
    generateExtrudedWall(
      wall,
      children.map((child) => ({ ...child, wallId: wall.id, parentId: wall.id })),
      calculateLevelMiters([wall]),
    )

  test('a doorway the cut passes through stays open, a window above the cut leaves the cap whole', () => {
    const door = DoorNode.parse({ position: [1, 1.05, 0], width: 1, height: 2.1 })
    const window = WindowNode.parse({ position: [3, 1.5, 0], width: 1, height: 1 })
    const children = [door, window]
    const { root } = level({ children, geometry: built(children) })
    const caps = new WallCutCaps()
    caps.update(true, 0.25, 'solid')
    expect(area(capsOf(root)!)).toBeCloseTo((4 - 1) * 0.2, 4)
    // The window's sill is at 1.0 m: a cut above it passes through the window's opening too.
    caps.update(true, 1.2, 'solid')
    expect(area(capsOf(root)!)).toBeCloseTo((4 - 1 - 1) * 0.2, 4)
    // A cut above the door's head and the window's leaves the wall whole.
    caps.update(true, 2.3, 'solid')
    expect(area(capsOf(root)!)).toBeCloseTo(4 * 0.2, 4)
    caps.dispose()
  })

  test('a curved wall with a door: the gap follows the arc', () => {
    const door = DoorNode.parse({ position: [1.5, 1.05, 0], width: 1, height: 2.1 })
    const plain = level({ wall: { curveOffset: 0.8 }, geometry: built([]) })
    const caps = new WallCutCaps()
    caps.update(true, 0.25, 'solid')
    const whole = area(capsOf(plain.root)!)
    caps.dispose()
    sceneRegistry.clear()

    const { root } = level({
      wall: { curveOffset: 0.8 },
      children: [door],
      geometry: built([door]),
    })
    const opened = new WallCutCaps()
    opened.update(true, 0.25, 'solid')
    const cap = capsOf(root)!
    // One door's width of the arc is open, as thick as the wall.
    expect(whole - area(cap)).toBeGreaterThan(0.18)
    expect(whole - area(cap)).toBeLessThan(0.25)
    // The gap is where the door stands on the arc, and the stub is solid a metre further along it.
    const wall = Object.values(useScene.getState().nodes).find((n) => n.type === 'wall') as WallNode
    const at = (distance: number) => {
      const { point } = getWallCurveFrameAt(wall, distance / getWallCurveLength(wall))
      // Under the lintel: what is hit on the way down is the stub's cap, or nothing.
      return new Raycaster(new Vector3(point.x, 5, point.y), new Vector3(0, -1, 0))
        .intersectObject(root, true)
        .filter((hit) => hit.point.y < 1)
    }
    root.updateMatrixWorld(true)
    expect(at(1.5)).toHaveLength(0)
    expect(at(0.5).length).toBeGreaterThan(0)
    opened.dispose()
  })

  test('an arched window cut inside its arch leaves a gap as wide as the chord there', () => {
    const window = WindowNode.parse({
      position: [2, 1.5, 0],
      width: 1,
      height: 1.4,
      openingShape: 'arch',
      archHeight: 0.5,
    })
    const children = [window]
    const { root } = level({ children, geometry: built(children) })
    const caps = new WallCutCaps()
    // The window's head is 2.2 m; the arch starts 0.5 m below it.
    caps.update(true, 1.2, 'solid')
    expect(area(capsOf(root)!)).toBeCloseTo((4 - 1) * 0.2, 3)
    caps.update(true, 2.1, 'solid')
    const gap = 4 - area(capsOf(root)!) / 0.2
    expect(gap).toBeGreaterThan(0.4)
    expect(gap).toBeLessThan(0.95)
    caps.update(true, 2.3, 'solid')
    expect(area(capsOf(root)!)).toBeCloseTo(4 * 0.2, 3)
    caps.dispose()
  })

  test("an opening is measured from the wall's base: a window on a raised wall", () => {
    // Its wall-local bottom is 0.1 (under the 0.25 cut); on a wall standing 0.2 up it is at 0.3, over it.
    const window = WindowNode.parse({ position: [2, 0.6, 0], width: 1, height: 1 })
    const children = [window]
    const { root } = level({ base: 0.2, children, geometry: built(children) })
    const caps = new WallCutCaps()
    caps.update(true, 0.25, 'solid')
    expect(area(capsOf(root)!)).toBeCloseTo(4 * 0.2, 4)
    // Between the sill (0.3) and the head (1.3) the gap is open.
    caps.update(true, 0.8, 'solid')
    expect(area(capsOf(root)!)).toBeCloseTo(3 * 0.2, 4)
    caps.dispose()
  })

  test('a wall standing on steps is capped over the low part only', () => {
    const { root } = level({
      base: 0.6,
      wall: { end: [4, 0] },
      geometry: (wall) =>
        generateExtrudedWall(wall, [], calculateLevelMiters([wall]), 0.6, 0.05, [
          { start: 0, end: 0.5, elevation: 0.05 },
          { start: 0.5, end: 1, elevation: 0.6 },
        ]),
    })
    const caps = new WallCutCaps()
    caps.update(true, 0.25, 'solid')
    const cap = capsOf(root)!
    expect(area(cap)).toBeCloseTo(2 * 0.2, 4)
    const position = cap.geometry.getAttribute('position')
    for (let i = 0; i < position.count; i++) expect(position.getX(i)).toBeLessThanOrEqual(2 + 1e-4)
    caps.dispose()
  })

  test('openings and steps leave gaps by probe, and a cut exactly on a sill, head, step or top agrees', () => {
    const window = WindowNode.parse({ position: [3, 1.5, 0], width: 1, height: 1 })
    const children = [window]
    const { root } = level({ children, geometry: built(children) })
    const caps = new WallCutCaps()
    // The sill is at 1.0 m, the head at 2.0 m, the wall's top at 2.5 m.
    const cases: [number, number][] = [
      [0.9999, 4],
      [1, 3],
      [1.0001, 3],
      [1.9999, 3],
      [2, 3],
      [2.0001, 4],
      [2.4999, 4],
      [2.5, 0],
      [2.5001, 0],
    ]
    for (const [height, length] of cases) {
      caps.update(true, height, 'solid')
      const cap = capsOf(root)
      expect(cap ? area(cap) : 0).toBeCloseTo(length * 0.2, 3)
      expect(covers(cap, 1, 0)).toBe(length > 0)
      expect(covers(cap, 3, 0)).toBe(length === 4)
    }
    caps.dispose()
  })

  test('a step exactly at the cut caps only the part that stands on both sides of it', () => {
    const { root } = level({
      base: 0.6,
      geometry: (wall) =>
        generateExtrudedWall(wall, [], calculateLevelMiters([wall]), 0.6, 0.05, [
          { start: 0, end: 0.5, elevation: 0.05 },
          { start: 0.5, end: 1, elevation: 0.6 },
        ]),
    })
    const caps = new WallCutCaps()
    for (const [height, length] of [
      [0.5999, 2],
      [0.6, 2],
      [0.6001, 4],
    ] as const) {
      caps.update(true, height, 'solid')
      expect(area(capsOf(root)!)).toBeCloseTo(length * 0.2, 3)
      expect(covers(capsOf(root), 1, 0)).toBe(true)
      expect(covers(capsOf(root), 3, 0)).toBe(length === 4)
    }
    caps.dispose()
  })

  test('a wall whose section does not close is capped from its footprint, not left a hollow stub', () => {
    const debug = spyOn(console, 'debug').mockImplementation(() => {})
    const { root } = level({
      geometry: () => {
        const open = new BoxGeometry(4, 2.5, 0.2).translate(2, 1.25, 0)
        const index = open.getIndex()!
        // Without the +x end, the section is a U.
        open.setIndex(Array.from({ length: index.count - 6 }, (_, i) => index.getX(i + 6)))
        return open
      },
    })
    const caps = new WallCutCaps()
    caps.update(true, 0.25, 'solid')
    expect(area(capsOf(root)!)).toBeCloseTo(4 * 0.2, 4)
    expect(debug).toHaveBeenCalled()
    debug.mockRestore()
    caps.dispose()
  })

  test('an update with nothing changed looks at nothing', () => {
    const { root } = level()
    const caps = new WallCutCaps()
    caps.update(true, 0.25, 'solid')
    const geometry = capsOf(root)!.geometry
    const nodes = spyOn(sceneRegistry.nodes, 'get')
    for (let frame = 0; frame < 5; frame++) caps.update(true, 0.25, 'solid')
    expect(nodes).not.toHaveBeenCalled()
    expect(capsOf(root)!.geometry).toBe(geometry)
    nodes.mockRestore()
    caps.dispose()
  })

  test('a wall that does not reach the cut, or starts above it, has no cap', () => {
    const low = level({ height: 0.1 })
    const caps = new WallCutCaps()
    caps.update(true, 0.25, 'solid')
    expect(capsOf(low.root)).toBeUndefined()
    caps.dispose()

    sceneRegistry.clear()
    const raised = level({ base: 0.6, height: 2 })
    const raisedCaps = new WallCutCaps()
    raisedCaps.update(true, 0.25, 'solid')
    expect(capsOf(raised.root)).toBeUndefined()
    // The slider reaches the wall: the cap appears with it.
    raisedCaps.update(true, 1, 'solid')
    expect(capsOf(raised.root)).toBeDefined()
    raisedCaps.dispose()
  })

  test('the caps are taken away when the walls come up, and a curtain wall has none', () => {
    const { root, wall } = level()
    useScene.setState({
      nodes: { ...useScene.getState().nodes, [wall.id]: { ...wall, wallType: 'curtain' } as never },
    })
    const caps = new WallCutCaps()
    caps.update(true, 0.25, 'solid')
    expect(capsOf(root)).toBeUndefined()
    useScene.setState({
      nodes: { ...useScene.getState().nodes, [wall.id]: { ...wall, wallType: 'basic' } as never },
    })
    caps.update(true, 0.25, 'solid')
    expect(capsOf(root)).toBeDefined()
    caps.update(false, 0.25, 'solid')
    expect(capsOf(root)).toBeUndefined()
    caps.dispose()
  })
})

describe('presentWallsLowForCapture', () => {
  test('cuts the walls of a live up view, with a moulding, and gives everything back', () => {
    const { root, mesh } = level()
    const moulding = new Mesh(new BoxGeometry(4, 0.1, 0.2), [new MeshBasicMaterial()])
    mesh.add(moulding)
    const whole = mesh.material
    const wholeMoulding = moulding.material

    const restore = presentWallsLowForCapture(0.3)
    expect((mesh.material as { maskNode?: unknown }[])[0]?.maskNode).toBeDefined()
    expect((moulding.material as { maskNode?: unknown }[])[0]?.maskNode).toBeDefined()
    expect(displayCutLimitY(mesh)).toBeCloseTo(0.3, 5)
    expect(capsOf(root)?.position.y).toBe(0.3)

    restore()
    expect(mesh.material).toBe(whole)
    expect(moulding.material).toBe(wholeMoulding)
    expect(getDisplayCutRoot(mesh)).toBeNull()
    expect(capsOf(root)).toBeUndefined()
  })

  test('a capture taken while the live view is low leaves the live cut and its caps as they were', () => {
    const { root, mesh } = level()
    const live = store()
    const cache = new WallCutoutCache(live)
    const caps = new WallCutCaps()
    const camera = new PerspectiveCamera()
    cache.update(camera, 1)
    caps.update(true, 0.25, 'solid')
    const liveCap = capsOf(root)!
    const liveRoot = getDisplayCutRoot(mesh)
    expect(liveRoot).toBe(root)

    const restore = presentWallsLowForCapture(0.6)
    // One layer of caps in the picture, at the height asked for.
    const visible = root.children.filter(
      (child) => child.name === WALL_CUT_CAPS_NAME && child.visible,
    )
    expect(visible).toHaveLength(1)
    expect((visible[0] as Mesh).position.y).toBe(0.6)
    expect(liveCap.visible).toBe(false)
    restore()

    expect(liveCap.visible).toBe(true)
    expect(getDisplayCutRoot(mesh)).toBe(liveRoot)
    expect(getDisplayCutHeight()).toBeCloseTo(0.25, 5)
    expect(displayCutLimitY(mesh)).toBeCloseTo(0.25, 5)
    cache.update(camera, 1.1)
    expect(displayCutLimitY(mesh)).toBeCloseTo(0.25, 5)
    caps.dispose()
    setDisplayCutRoot(mesh, null)
  })
})
