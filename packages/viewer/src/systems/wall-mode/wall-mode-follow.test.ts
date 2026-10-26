import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import {
  nodeRegistry,
  sceneRegistry,
  useLiveNodeOverrides,
  useLiveTransforms,
  useScene,
  WallNode,
} from '@pascal-app/core'
import {
  BoxGeometry,
  Group,
  type Material,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  Raycaster,
} from 'three'
import { ClippingGroup } from 'three/webgpu'
import { createStore, type StoreApi } from 'zustand/vanilla'
import { isDisplayCut, setDisplayCutHeight } from '../../lib/display-cut'
import { SCENE_LAYER, SHADOW_ONLY_LAYER } from '../../lib/layers'
import { hideFromScene } from '../../lib/scene-visibility'
import {
  isWallModeAffected,
  subscribeWallModeAffected,
  WallModeFollowCache,
  type WallModeFollowViewerState,
} from './wall-mode-follow'

const sceneBefore = useScene.getState()
let viewerStore: StoreApi<WallModeFollowViewerState>
let cache: WallModeFollowCache
let camera: PerspectiveCamera
let restoreRegistry: () => void

function setMode(wallMode: WallModeFollowViewerState['wallMode']) {
  viewerStore.setState({ wallMode })
}

/** A camera at `x` looking along the x axis towards the origin. */
function placeCamera(x: number, targetX = 0) {
  camera.position.set(x, 3, 0)
  camera.lookAt(targetX, 3, 0)
  camera.updateMatrixWorld()
}

/**
 * One wall centred on (2, 0) under a level, and a node of `kind` built at x = 10 (outside). The
 * node sits at the origin, as a block with world-space vertices does: only its mesh is out there.
 */
function addScene(
  kind: string,
  extra: Record<string, unknown> = {},
  { clip = false, y = 0 }: { clip?: boolean; y?: number } = {},
) {
  const building = new Group()
  const level = new Group()
  const wall = WallNode.parse({ start: [0, 0], end: [4, 0], parentId: 'level_a' })
  const material = new MeshBasicMaterial({ color: '#336699' })
  const mesh = new Mesh(new BoxGeometry(1, 1, 1), material)
  mesh.position.set(10, y, 0)
  const group = new Group()
  group.add(mesh)
  // A follower is rendered in a clip group that clips nothing until the cut passes through it.
  const clipGroup = new ClippingGroup()
  clipGroup.enabled = false
  clipGroup.userData.followerClip = true
  if (clip) {
    clipGroup.add(group)
    level.add(clipGroup)
  } else level.add(group)
  building.add(level)
  building.updateMatrixWorld(true)
  sceneRegistry.nodes.set('level_a', level)
  sceneRegistry.nodes.set(wall.id, new Mesh())
  sceneRegistry.byType.wall!.add(wall.id)
  const id = `${kind}_a`
  sceneRegistry.nodes.set(id, group)
  sceneRegistry.byType[kind] ??= new Set()
  sceneRegistry.byType[kind]!.add(id)
  useScene.setState({
    nodes: {
      level_a: { id: 'level_a', type: 'level', children: [wall.id, id] },
      [wall.id]: wall,
      [id]: { id, type: kind, parentId: 'level_a', children: [], ...extra },
    },
  } as never)
  return { id, building, group, mesh, material, level, clipGroup }
}

const shown = (mesh: Mesh) => mesh.layers.isEnabled(SCENE_LAYER)

beforeEach(() => {
  restoreRegistry = nodeRegistry._snapshot()
  nodeRegistry._register({
    kind: 'gable',
    schemaVersion: 1,
    capabilities: {
      followsWallMode: {
        appliesTo: (node: { followsWallMode?: boolean }) => node.followsWallMode !== false,
      },
    },
  } as never)
  nodeRegistry._register({ kind: 'plain', schemaVersion: 1, capabilities: {} } as never)
  nodeRegistry._register({
    kind: 'column',
    schemaVersion: 1,
    capabilities: {
      followsWallMode: {
        appliesTo: (node: { role?: string }) => node.role !== 'ornament',
        modes: ['down', 'low'],
      },
    },
  } as never)
  sceneRegistry.clear()
  useScene.setState({ nodes: {}, materials: {} })
  viewerStore = createStore<WallModeFollowViewerState>(() => ({
    wallMode: 'up',
    geometryRevision: 0,
    wallCutHeight: 0.25,
  }))
  cache = new WallModeFollowCache(viewerStore)
  camera = new PerspectiveCamera()
  placeCamera(20)
})

afterEach(() => {
  cache.dispose()
  sceneRegistry.clear()
  useScene.setState(sceneBefore)
  restoreRegistry()
})

describe('WallModeFollowCache', () => {
  test.each([
    ['up', 20, true],
    ['down', 20, false],
    ['down', -20, false],
    ['low', 20, false],
    ['translucent', 20, true],
    ['cutaway', 20, false],
    ['cutaway', -20, true],
  ] as const)(
    'a kind that follows wall mode in %s with the camera at x=%d is shown: %s',
    (mode, cameraX, expected) => {
      const { mesh } = addScene('gable')
      placeCamera(cameraX)
      setMode(mode)
      cache.update(camera)
      expect(shown(mesh)).toBe(expected)
    },
  )

  test('a hidden node is neither drawn, picked nor shadowed', () => {
    const { mesh, group } = addScene('gable')
    setMode('down')
    cache.update(camera)
    expect(shown(mesh)).toBe(false)
    expect(mesh.layers.isEnabled(SHADOW_ONLY_LAYER)).toBe(false)
    const raycaster = new Raycaster(
      camera.position.clone().set(20, 0, 0),
      camera.position.clone().set(-1, 0, 0),
    )
    raycaster.layers.set(SCENE_LAYER)
    group.updateMatrixWorld(true)
    expect(raycaster.intersectObject(group, true)).toHaveLength(0)
    setMode('up')
    cache.update(camera)
    expect(raycaster.intersectObject(group, true).length).toBeGreaterThan(0)
  })

  test('walls up shows it again, and the cutaway follows the camera across the building', () => {
    const { mesh } = addScene('gable')
    setMode('down')
    cache.update(camera)
    setMode('up')
    cache.update(camera)
    expect(shown(mesh)).toBe(true)
    setMode('cutaway')
    cache.update(camera)
    expect(shown(mesh)).toBe(false)
    placeCamera(-20)
    cache.update(camera)
    expect(shown(mesh)).toBe(true)
  })

  test('keeps other holds on the mesh', () => {
    const { mesh } = addScene('gable')
    hideFromScene(mesh, 'isolated')
    setMode('down')
    cache.update(camera)
    setMode('up')
    cache.update(camera)
    expect(shown(mesh)).toBe(false)
  })

  test('a kind without the capability is untouched in every mode', () => {
    const { mesh } = addScene('plain')
    for (const mode of ['down', 'translucent', 'cutaway', 'up'] as const) {
      setMode(mode)
      cache.update(camera)
      expect(shown(mesh)).toBe(true)
    }
  })

  test('a node opted out per node is untouched, and one opted out later is shown again', () => {
    const off = addScene('gable', { followsWallMode: false })
    setMode('down')
    cache.update(camera)
    expect(shown(off.mesh)).toBe(true)
    sceneRegistry.clear()
    cache.dispose()
    const { id, mesh } = addScene('gable')
    cache.update(camera)
    expect(shown(mesh)).toBe(false)
    useScene.setState({
      nodes: {
        ...useScene.getState().nodes,
        [id]: { ...useScene.getState().nodes[id as never], followsWallMode: false },
      },
    } as never)
    cache.update(camera)
    expect(shown(mesh)).toBe(true)
    expect(isWallModeAffected(id)).toBe(false)
  })

  test('a rebuilt node is hidden again when the geometry revision moves', () => {
    const { group, mesh } = addScene('gable')
    setMode('down')
    cache.update(camera)
    const rebuilt = new Mesh(new BoxGeometry(), new MeshBasicMaterial())
    group.remove(mesh)
    group.add(rebuilt)
    viewerStore.setState({ geometryRevision: 1 })
    cache.update(camera)
    expect(shown(rebuilt)).toBe(false)
  })

  test('the cutaway judges a node from where its meshes stand, not from its origin', () => {
    const { mesh } = addScene('gable')
    setMode('cutaway')
    cache.update(camera)
    expect(shown(mesh)).toBe(false)
    placeCamera(-20)
    cache.update(camera)
    expect(shown(mesh)).toBe(true)
  })

  test('moving the building changes no cutaway decision', () => {
    const { building, mesh } = addScene('gable')
    setMode('cutaway')
    cache.update(camera)
    expect(shown(mesh)).toBe(false)
    building.position.set(100, 0, 0)
    building.updateMatrixWorld(true)
    placeCamera(120, 100)
    cache.update(camera)
    expect(shown(mesh)).toBe(false)
    placeCamera(80, 100)
    cache.update(camera)
    expect(shown(mesh)).toBe(true)
  })

  test('the building centre comes from the scene, before any wall is mounted', () => {
    const { mesh } = addScene('gable')
    sceneRegistry.byType.wall!.clear()
    setMode('cutaway')
    cache.update(camera)
    expect(shown(mesh)).toBe(false)
  })

  test('never touches a material', () => {
    const { mesh, material } = addScene('gable')
    const painted = [new MeshBasicMaterial(), new MeshBasicMaterial()]
    for (const mode of ['down', 'translucent', 'cutaway', 'up'] as const) {
      setMode(mode)
      cache.update(camera)
      expect(mesh.material).toBe(material)
    }
    mesh.material = painted
    for (const mode of ['down', 'up'] as const) {
      setMode(mode)
      cache.update(camera)
      expect(mesh.material as Material[]).toBe(painted)
    }
  })

  test('a capture of whole walls sees the node, then it is hidden again', () => {
    const { mesh } = addScene('gable')
    setMode('down')
    cache.update(camera)
    cache.beforeCapture(undefined)
    expect(shown(mesh)).toBe(false)
    cache.beforeCapture({ wholeWalls: true })
    expect(shown(mesh)).toBe(true)
    cache.afterCapture()
    expect(shown(mesh)).toBe(false)
  })

  test('a capture of low walls leaves the followers down, an export still sees them', () => {
    const { mesh } = addScene('gable')
    setMode('low')
    cache.update(camera)
    expect(shown(mesh)).toBe(false)
    cache.beforeCapture({ wholeWalls: true, wallsLow: true })
    expect(shown(mesh)).toBe(false)
    cache.afterCapture()
    cache.beforeCapture({ exporting: true, wallsLow: true })
    expect(shown(mesh)).toBe(true)
    cache.afterCapture()
    expect(shown(mesh)).toBe(false)
  })

  test('a capture of low walls from a live view that shows the node takes it down, then gives it back', () => {
    const { mesh } = addScene('gable')
    setMode('up')
    cache.update(camera)
    expect(shown(mesh)).toBe(true)
    cache.beforeCapture({ wholeWalls: true, wallsLow: true })
    expect(shown(mesh)).toBe(false)
    cache.afterCapture()
    expect(shown(mesh)).toBe(true)
  })

  test('announces when the mode starts and stops hiding a node', () => {
    const { id } = addScene('gable')
    const events: Array<[string, boolean]> = []
    const unsubscribe = subscribeWallModeAffected((nodeId) =>
      events.push([nodeId, isWallModeAffected(nodeId)]),
    )
    setMode('down')
    cache.update(camera)
    setMode('up')
    cache.update(camera)
    unsubscribe()
    expect(events).toEqual([
      [id, true],
      [id, false],
    ])
  })

  test('does no work on a static camera in the cutaway', () => {
    const { mesh } = addScene('gable')
    setMode('cutaway')
    cache.update(camera)
    hideFromScene(mesh, 'isolated')
    cache.update(camera)
    expect(shown(mesh)).toBe(false)
  })

  test('an export sees the node, and a capture whose end is missed heals on the next pass', () => {
    const { mesh } = addScene('gable')
    setMode('down')
    cache.update(camera)
    cache.beforeCapture({ exporting: true })
    expect(shown(mesh)).toBe(true)
    cache.afterCapture()
    expect(shown(mesh)).toBe(false)
    cache.beforeCapture({ exporting: true })
    viewerStore.setState({ geometryRevision: 1 })
    cache.update(camera)
    expect(shown(mesh)).toBe(false)
  })

  test('a block dragged across the building centre flips the cutaway decision', () => {
    const { id, group, mesh } = addScene('gable')
    setMode('cutaway')
    cache.update(camera)
    expect(shown(mesh)).toBe(false)
    group.position.set(-20, 0, 0)
    useLiveTransforms.getState().set(id, { position: [-20, 0, 0], rotation: 0 })
    cache.update(camera)
    expect(shown(mesh)).toBe(true)
    useLiveTransforms.getState().clearAll()
  })

  test('a node turned by something above it is judged from where it ended up', () => {
    const { id, group, mesh } = addScene('gable')
    setMode('cutaway')
    cache.update(camera)
    expect(shown(mesh)).toBe(false)
    group.rotation.y = Math.PI
    group.updateMatrixWorld(true)
    useLiveTransforms.getState().set(id, { position: [0, 0, 0], rotation: Math.PI })
    cache.update(camera)
    expect(shown(mesh)).toBe(true)
    useLiveTransforms.getState().clearAll()
  })

  test('moving the walls and the follower together live changes no decision', () => {
    const { id, group, mesh } = addScene('gable')
    const wallId = Object.keys(useScene.getState().nodes).find((key) => key.startsWith('wall_'))!
    mesh.position.set(-6, 0, 0)
    setMode('cutaway')
    placeCamera(-20, 0)
    cache.update(camera)
    expect(shown(mesh)).toBe(false)
    group.position.set(20, 0, 0)
    useLiveTransforms.getState().set(id, { position: [20, 0, 0], rotation: 0 })
    useLiveNodeOverrides.getState().set(wallId as never, { start: [20, 0], end: [24, 0] } as never)
    placeCamera(0, 40)
    cache.update(camera)
    expect(shown(mesh)).toBe(false)
    useLiveTransforms.getState().clearAll()
    useLiveNodeOverrides.getState().clearAll()
  })
})

describe('followers in Low', () => {
  const clipped = (clipGroup: ClippingGroup) => clipGroup.enabled
  const capsOf = (level: Group) => level.getObjectByName('follower-cut-caps') as Mesh | undefined

  test.each([
    ['wholly under the cut', -1, 'as built'],
    ['the cut passes through it', 0, 'clipped'],
    ['wholly over the cut', 1, 'hidden'],
  ] as const)('a column %s is %s', (_name, y, outcome) => {
    const { mesh, clipGroup, id } = addScene('column', {}, { clip: true, y })
    setMode('low')
    cache.update(camera)
    expect(shown(mesh)).toBe(outcome !== 'hidden')
    expect(clipped(clipGroup)).toBe(outcome === 'clipped')
    expect(isWallModeAffected(id)).toBe(outcome !== 'as built')
  })

  test('the slider reclassifies it, and the plane stands where its level does', () => {
    const { mesh, clipGroup, level } = addScene('column', {}, { clip: true, y: 0 })
    setMode('low')
    cache.update(camera)
    expect(clipped(clipGroup)).toBe(true)
    expect(clipGroup.clippingPlanes[0]!.constant).toBeCloseTo(0.25, 6)
    level.position.y = 5
    level.updateMatrixWorld(true)
    cache.update(camera)
    expect(clipGroup.clippingPlanes[0]!.constant).toBeCloseTo(5.25, 6)
    viewerStore.setState({ wallCutHeight: 1 })
    cache.update(camera)
    expect(clipped(clipGroup)).toBe(false)
    expect(shown(mesh)).toBe(true)
    viewerStore.setState({ wallCutHeight: -1 })
    cache.update(camera)
    expect(shown(mesh)).toBe(false)
    viewerStore.setState({ wallCutHeight: 0.25 })
    cache.update(camera)
    expect(clipped(clipGroup)).toBe(true)
    expect(shown(mesh)).toBe(true)
  })

  test('clipping writes no material, and a pick above the cut goes through the stub', () => {
    const { mesh, material, group } = addScene('column', {}, { clip: true, y: 0 })
    setMode('low')
    cache.update(camera)
    expect(mesh.material).toBe(material)
    expect(isDisplayCut(mesh)).toBe(true)
    group.updateMatrixWorld(true)
    // The wall system owns the display-cut height; here it is the slider's.
    setDisplayCutHeight(0.25)
    const from = (y: number) =>
      new Raycaster(camera.position.clone().set(20, y, 0), camera.position.clone().set(-1, 0, 0))
    expect(from(0.1).intersectObject(group, true).length).toBeGreaterThan(0)
    expect(from(0.4).intersectObject(group, true)).toHaveLength(0)
    setDisplayCutHeight(0)
  })

  test('what is hosted on a clipped column is clipped, picked below the cut and capped with it', () => {
    const { group, level } = addScene('column', {}, { clip: true, y: 0 })
    const hosted = new Mesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial())
    hosted.position.set(10, 0, 3)
    group.add(hosted)
    level.updateMatrixWorld(true)
    setMode('low')
    cache.update(camera)
    expect(isDisplayCut(hosted)).toBe(true)
    const cap = capsOf(level)!
    expect(cap).toBeDefined()
    const position = cap.geometry.getAttribute('position')
    const zs = new Set<number>()
    for (let i = 0; i < position.count; i++) zs.add(Math.round(position.getZ(i) * 10) / 10)
    expect(zs.has(3.5) || zs.has(2.5)).toBe(true)
  })

  test('the cap is the section of the stub, stands at the cut and goes when the column does not straddle', () => {
    const { level } = addScene('column', {}, { clip: true, y: 0 })
    setMode('low')
    cache.update(camera)
    const cap = capsOf(level)!
    expect(cap.position.y).toBeCloseTo(0.25, 6)
    viewerStore.setState({ wallCutHeight: 2 })
    cache.update(camera)
    expect(capsOf(level)).toBeUndefined()
  })

  test('an ornament column is untouched, and a column has no cutaway', () => {
    const ornament = addScene('column', { role: 'ornament' }, { clip: true, y: 1 })
    setMode('low')
    cache.update(camera)
    expect(shown(ornament.mesh)).toBe(true)
    expect(clipped(ornament.clipGroup)).toBe(false)
    sceneRegistry.clear()
    cache.dispose()
    const column = addScene('column', {}, { clip: true, y: 0 })
    setMode('cutaway')
    cache.update(camera)
    expect(shown(column.mesh)).toBe(true)
    setMode('down')
    cache.update(camera)
    expect(shown(column.mesh)).toBe(false)
  })

  test('a low capture clips at its own cutHeight and gives the live view back', () => {
    const { clipGroup, mesh } = addScene('column', {}, { clip: true, y: 0 })
    setMode('up')
    cache.update(camera)
    expect(clipped(clipGroup)).toBe(false)
    cache.beforeCapture({ wholeWalls: true, wallsLow: true, cutHeight: 0.25 })
    expect(clipped(clipGroup)).toBe(true)
    cache.afterCapture()
    expect(clipped(clipGroup)).toBe(false)
    expect(shown(mesh)).toBe(true)
    setMode('low')
    cache.update(camera)
    expect(clipped(clipGroup)).toBe(true)
    cache.beforeCapture({ wholeWalls: true, wallsLow: true, cutHeight: 1 })
    expect(clipped(clipGroup)).toBe(false)
    expect(shown(mesh)).toBe(true)
    cache.afterCapture()
    expect(clipped(clipGroup)).toBe(true)
  })

  test('a capture of whole walls puts the clip and the cap away and brings them back', () => {
    const { clipGroup, level } = addScene('column', {}, { clip: true, y: 0 })
    setMode('low')
    cache.update(camera)
    cache.beforeCapture({ wholeWalls: true })
    expect(clipped(clipGroup)).toBe(false)
    expect(capsOf(level)!.visible).toBe(false)
    cache.afterCapture()
    expect(clipped(clipGroup)).toBe(true)
    expect(capsOf(level)!.visible).toBe(true)
  })

  test('a plane refreshed after a capture moves the levels follows them', () => {
    const { clipGroup, level } = addScene('column', {}, { clip: true, y: 0 })
    setMode('low')
    cache.update(camera)
    level.position.y = 3
    level.updateMatrixWorld(true)
    WallModeFollowCache.refreshPlanes()
    expect(clipGroup.clippingPlanes[0]!.constant).toBeCloseTo(3.25, 6)
  })
})
