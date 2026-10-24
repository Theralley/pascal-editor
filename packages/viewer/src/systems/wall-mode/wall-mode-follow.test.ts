import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { nodeRegistry, sceneRegistry, useScene, WallNode } from '@pascal-app/core'
import {
  BoxGeometry,
  Group,
  type Material,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
} from 'three'
import { createStore, type StoreApi } from 'zustand/vanilla'
import {
  isWallModeAffected,
  isWallModeHidden,
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

/**
 * One wall centred on (2, 0) under a level, and a node of `kind` built at x = 10 (outside). The
 * node sits at the origin, as a block with world-space vertices does: only its mesh is out there.
 */
function addScene(kind: string, extra: Record<string, unknown> = {}) {
  const level = new Group()
  const wall = WallNode.parse({ start: [0, 0], end: [4, 0], parentId: 'level_a' })
  const material = new MeshBasicMaterial({ color: '#336699' })
  const mesh = new Mesh(new BoxGeometry(1, 1, 1), material)
  mesh.position.set(10, 0, 0)
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
      level_a: { id: 'level_a', type: 'level', children: [wall.id, id] },
      [wall.id]: wall,
      [id]: { id, type: kind, parentId: 'level_a', children: [], ...extra },
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
    capabilities: {
      followsWallMode: {
        appliesTo: (node: { followsWallMode?: boolean }) => node.followsWallMode !== false,
      },
    },
  } as never)
  nodeRegistry._register({ kind: 'plain', schemaVersion: 1, capabilities: {} } as never)
  sceneRegistry.clear()
  useScene.setState({ nodes: {}, materials: {} })
  viewerStore = createStore<WallModeFollowViewerState>(() => ({
    wallMode: 'up',
    shading: 'solid',
    textures: false,
    geometryRevision: 0,
    selection: { buildingId: null, levelId: null, zoneId: null, selectedIds: [] },
    previewSelectedIds: [],
    hoveredId: null,
    hoverHighlightMode: 'default',
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

  test('a node opted out per node is untouched', () => {
    const { mesh, material } = addScene('gable', { followsWallMode: false })
    setMode('down')
    cache.update(camera)
    expect(isPlain(mesh, material)).toBe(true)
  })

  test('a node that is opted out later gets its built material back', () => {
    const { id, mesh, material } = addScene('gable')
    setMode('down')
    cache.update(camera)
    expect(isPlain(mesh, material)).toBe(false)
    useScene.setState({
      nodes: {
        ...useScene.getState().nodes,
        [id]: { ...useScene.getState().nodes[id as never], followsWallMode: false },
      },
    } as never)
    cache.update(camera)
    expect(isPlain(mesh, material)).toBe(true)
    expect(isWallModeAffected(id)).toBe(false)
  })

  test('the cutaway judges a node from where its meshes stand, not from its origin', () => {
    const { mesh, material } = addScene('gable')
    setMode('cutaway')
    placeCamera(20)
    cache.update(camera)
    expect(isPlain(mesh, material)).toBe(false)
    placeCamera(-20)
    cache.update(camera)
    expect(isPlain(mesh, material)).toBe(true)
  })

  test('the building centre comes from the scene, before any wall is mounted', () => {
    const { mesh, material } = addScene('gable')
    sceneRegistry.byType.wall!.clear()
    setMode('cutaway')
    cache.update(camera)
    expect(isPlain(mesh, material)).toBe(false)
  })

  test('shares its variant materials as cached materials', () => {
    const { mesh } = addScene('gable')
    setMode('down')
    cache.update(camera)
    expect((mesh.material as Material).userData.__pascalCachedMaterial).toBe(true)
  })

  test('hides what the pointer should yield to, but not a see-through node', () => {
    const { id } = addScene('gable')
    setMode('down')
    cache.update(camera)
    expect(isWallModeHidden(id)).toBe(true)
    setMode('translucent')
    cache.update(camera)
    expect(isWallModeHidden(id)).toBe(false)
    expect(isWallModeAffected(id)).toBe(true)
  })

  describe('material ownership', () => {
    const temp = () => new MeshBasicMaterial({ color: '#ff00ff' })

    // The editor's selection tint, the delete tint and a paint preview swap a material and put the
    // previous one back only if nobody changed it meanwhile.
    test('a temporary material swapped in while affected never becomes the built material', () => {
      const { mesh, material } = addScene('gable')
      setMode('down')
      cache.update(camera)
      const preview = temp()
      const stipple = mesh.material
      mesh.material = preview
      viewerStore.setState({ geometryRevision: 1 })
      cache.update(camera)
      expect(mesh.material).toBe(stipple)
      // The owner of the preview restores only if the mesh still wears it: it does not.
      setMode('up')
      cache.update(camera)
      expect(mesh.material).toBe(material)
    })

    test('a preview that ends while affected leaves the node in the mode, then walls up restores it', () => {
      const { mesh, material } = addScene('gable')
      setMode('down')
      cache.update(camera)
      const stipple = mesh.material
      const preview = temp()
      mesh.material = preview
      // The preview owner restores what it saw before: the stipple.
      if (mesh.material === preview) mesh.material = stipple
      setMode('up')
      cache.update(camera)
      expect(mesh.material).toBe(material)
    })

    test('a node selected in a mode wears the selection tint, and is plain when deselected and walls up', () => {
      const { id, mesh, material } = addScene('gable')
      setMode('down')
      cache.update(camera)
      const plainStipple = mesh.material
      viewerStore.setState({
        selection: { buildingId: null, levelId: null, zoneId: null, selectedIds: [id] },
      } as never)
      cache.update(camera)
      expect(mesh.material).not.toBe(plainStipple)
      expect(isSeeThrough(mesh)).toBe(true)
      viewerStore.setState({
        selection: { buildingId: null, levelId: null, zoneId: null, selectedIds: [] },
      } as never)
      setMode('up')
      cache.update(camera)
      expect(mesh.material).toBe(material)
    })

    test('selecting before the mode changes hands the tint over without keeping it', () => {
      const { id, mesh, material } = addScene('gable')
      const tint = new MeshBasicMaterial({ color: '#8888ff' })
      // The selection sync lets go of an affected node as soon as it is announced.
      const unsubscribe = subscribeWallModeAffected((nodeId) => {
        if (nodeId === id && isWallModeAffected(id)) mesh.material = material
      })
      mesh.material = tint
      setMode('down')
      cache.update(camera)
      unsubscribe()
      setMode('up')
      cache.update(camera)
      expect(mesh.material).toBe(material)
    })

    test('does no work on a static camera in the cutaway', () => {
      const { mesh } = addScene('gable')
      setMode('cutaway')
      cache.update(camera)
      const marker = temp()
      mesh.material = marker
      cache.update(camera)
      expect(mesh.material).toBe(marker)
    })
  })
})
