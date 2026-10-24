import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { nodeRegistry, sceneRegistry, useScene, WallNode } from '@pascal-app/core'
import { Group, type Material, Mesh, MeshBasicMaterial, PerspectiveCamera } from 'three'
import { createStore, type StoreApi } from 'zustand/vanilla'
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
function placeCamera(x: number) {
  camera.position.set(x, 3, 0)
  camera.lookAt(0, 3, 0)
  camera.updateMatrixWorld()
}

/** One wall centred on (2, 0), a level group, and a node of `kind` at x = 10 (outside). */
function addScene(kind: string) {
  const level = new Group()
  const wall = WallNode.parse({ start: [0, 0], end: [4, 0], parentId: 'level_a' })
  const material = new MeshBasicMaterial({ color: '#336699' })
  const mesh = new Mesh(undefined, material)
  const group = new Group()
  group.add(mesh)
  level.add(group)
  level.updateMatrixWorld(true)
  sceneRegistry.nodes.set('level_a', level)
  sceneRegistry.nodes.set(wall.id, new Mesh())
  sceneRegistry.byType.wall!.add(wall.id)
  const id = `${kind}_a`
  sceneRegistry.nodes.set(id, group)
  sceneRegistry.byType[kind] ??= new Set()
  sceneRegistry.byType[kind]!.add(id)
  useScene.setState({
    nodes: {
      [wall.id]: wall,
      [id]: { id, type: kind, parentId: 'level_a', position: [10, 0, 0], children: [] },
    },
  } as never)
  return { id, group, mesh, material }
}

function isPlain(mesh: Mesh, material: Material) {
  return mesh.material === material
}

function isSeeThrough(mesh: Mesh) {
  const material = mesh.material as Material
  return material.transparent === true && material.depthWrite === false
}

beforeEach(() => {
  restoreRegistry = nodeRegistry._snapshot()
  nodeRegistry._register({
    kind: 'gable',
    schemaVersion: 1,
    capabilities: { followsWallMode: {} },
  } as never)
  nodeRegistry._register({ kind: 'plain', schemaVersion: 1, capabilities: {} } as never)
  sceneRegistry.clear()
  useScene.setState({ nodes: {}, materials: {} })
  viewerStore = createStore<WallModeFollowViewerState>(() => ({
    wallMode: 'up',
    shading: 'solid',
    textures: false,
    geometryRevision: 0,
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
    ['up', 20, 'plain'],
    ['down', 20, 'hidden'],
    ['down', -20, 'hidden'],
    ['translucent', 20, 'see-through'],
    ['cutaway', 20, 'hidden'],
    ['cutaway', -20, 'plain'],
  ] as const)(
    'a kind that follows wall mode in %s with the camera at x=%d is %s',
    (mode, cameraX, expected) => {
      const { mesh, material } = addScene('gable')
      placeCamera(cameraX)
      setMode(mode)
      cache.update(camera)
      if (expected === 'plain') expect(isPlain(mesh, material)).toBe(true)
      else {
        expect(isPlain(mesh, material)).toBe(false)
        expect(isSeeThrough(mesh)).toBe(true)
      }
      const translucent = (mesh.material as Material).opacity === 0.35
      expect(translucent).toBe(expected === 'see-through')
    },
  )

  test('walls down hides, and walls up gives the built material back', () => {
    const { mesh, material } = addScene('gable')
    setMode('down')
    cache.update(camera)
    expect(isPlain(mesh, material)).toBe(false)
    setMode('up')
    cache.update(camera)
    expect(isPlain(mesh, material)).toBe(true)
  })

  test('the cutaway follows the camera across the building', () => {
    const { mesh, material } = addScene('gable')
    setMode('cutaway')
    cache.update(camera)
    expect(isPlain(mesh, material)).toBe(false)
    placeCamera(-20)
    cache.update(camera)
    expect(isPlain(mesh, material)).toBe(true)
  })

  test('a kind without the capability is untouched in every mode', () => {
    const { mesh, material } = addScene('plain')
    for (const mode of ['down', 'translucent', 'cutaway', 'up'] as const) {
      setMode(mode)
      cache.update(camera)
      expect(isPlain(mesh, material)).toBe(true)
    }
  })

  test('a rebuilt node is restyled when the geometry revision moves', () => {
    const { group, mesh } = addScene('gable')
    setMode('down')
    cache.update(camera)
    const rebuilt = new Mesh(undefined, new MeshBasicMaterial({ color: '#cc3333' }))
    group.remove(mesh)
    group.add(rebuilt)
    viewerStore.setState({ geometryRevision: 1 })
    cache.update(camera)
    expect(isSeeThrough(rebuilt)).toBe(true)
  })

  test('announces when the mode starts and stops affecting a node', () => {
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
})
