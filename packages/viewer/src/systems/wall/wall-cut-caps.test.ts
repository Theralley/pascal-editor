import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import {
  DoorNode,
  LevelNode,
  sceneRegistry,
  useLiveNodeOverrides,
  useScene,
  WallNode,
  WindowNode,
} from '@pascal-app/core'
import {
  BoxGeometry,
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
import { buildWallCapGeometry, WALL_CUT_CAPS_NAME, WallCutCaps } from './wall-cut-caps'
import { presentWallsLowForCapture } from './wall-cutout'
import { WallCutoutCache, type WallCutoutViewerState } from './wall-cutout-cache'

const sceneBefore = useScene.getState()

type Standing = { base?: number; height?: number; children?: (DoorNode | WindowNode)[] }

/** A level with one 4 m wall along x, 0.2 m thick, its mesh registered with a built geometry. */
function level({ base = 0, height = 2.5, children = [] }: Standing = {}) {
  const wall = WallNode.parse({
    start: [0, 0],
    end: [4, 0],
    thickness: 0.2,
    children: children.map((child) => child.id),
  })
  const node = LevelNode.parse({ children: [wall.id] })
  const root = new Group()
  sceneRegistry.nodes.set(node.id, root)
  sceneRegistry.byType.level!.add(node.id)
  const mesh = new Mesh(new BoxGeometry(4, height, 0.2).translate(2, height / 2, 0), [
    new MeshBasicMaterial(),
  ])
  mesh.geometry.clearGroups()
  mesh.geometry.addGroup(0, mesh.geometry.getIndex()!.count, 0)
  mesh.position.y = base
  const collision = new Mesh(mesh.geometry)
  collision.name = 'collision-mesh'
  mesh.add(collision)
  root.add(mesh)
  sceneRegistry.nodes.set(wall.id, mesh)
  sceneRegistry.byType.wall!.add(wall.id)
  root.updateMatrixWorld(true)
  useScene.setState({
    nodes: {
      [node.id]: node,
      [wall.id]: { ...wall, parentId: node.id },
      ...Object.fromEntries(children.map((child) => [child.id, { ...child, parentId: wall.id }])),
    },
  })
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
    expect(up).toBeGreaterThanOrEqual(0)
    total += up / 2
  }
  return total
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

  test('moving the cut moves the cap and builds nothing; nothing changing builds nothing', () => {
    const { root } = level()
    const caps = new WallCutCaps()
    caps.update(true, 0.25, 'solid')
    const cap = capsOf(root)!
    const geometry = cap.geometry
    caps.update(true, 0.9, 'solid')
    caps.update(true, 0.9, 'solid')
    expect(capsOf(root)).toBe(cap)
    expect(cap.geometry).toBe(geometry)
    expect(cap.position.y).toBe(0.9)
    caps.dispose()
  })

  test('a live override on the wall does not remake the cap every frame, a rebuild does', () => {
    const { wall, root } = level()
    const caps = new WallCutCaps()
    caps.update(true, 0.25, 'solid')
    const geometry = capsOf(root)!.geometry
    useLiveNodeOverrides.getState().set(wall.id, { end: [6, 0] })
    caps.update(true, 0.25, 'solid')
    caps.update(true, 0.25, 'solid')
    expect(capsOf(root)!.geometry).toBe(geometry)
    caps.markWall(wall.id)
    caps.update(true, 0.25, 'solid')
    expect(capsOf(root)!.geometry).not.toBe(geometry)
    expect(area(capsOf(root)!)).toBeCloseTo(6 * 0.2, 5)
    caps.dispose()
  })

  test('a doorway the cut passes through stays open, a window above the cut leaves the cap whole', () => {
    const door = DoorNode.parse({ position: [1, 1.05, 0], width: 1, height: 2.1 })
    const window = WindowNode.parse({ position: [3, 1.5, 0], width: 1, height: 1 })
    const { root } = level({ children: [door, window] })
    const caps = new WallCutCaps()
    caps.update(true, 0.25, 'solid')
    expect(area(capsOf(root)!)).toBeCloseTo((4 - 1) * 0.2, 5)
    // The window's sill is at 1.0 m: a cut above it passes through the window's opening too.
    caps.update(true, 1.2, 'solid')
    expect(area(capsOf(root)!)).toBeCloseTo((4 - 1 - 1) * 0.2, 5)
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

describe('buildWallCapGeometry', () => {
  test('is nothing for no walls', () => {
    expect(buildWallCapGeometry([], { junctionData: new Map() } as never)).toBeNull()
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
