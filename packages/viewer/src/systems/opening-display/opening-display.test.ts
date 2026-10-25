import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { nodeRegistry, sceneRegistry, useScene } from '@pascal-app/core'
import { Box3, BoxGeometry, Group, Mesh, MeshBasicMaterial } from 'three'
import { createStore, type StoreApi } from 'zustand/vanilla'
import {
  FLOOR_MARK_HIT_NAME,
  FLOOR_MARK_NAME,
  FLOOR_MARK_SPEC_KEY,
  floorMarkSpec,
} from '../../lib/floor-mark'
import { SCENE_LAYER, SHADOW_ONLY_LAYER } from '../../lib/layers'
import {
  isOpeningDisplayAffected,
  OpeningDisplayCache,
  type OpeningDisplayViewerState,
  subscribeOpeningDisplayAffected,
} from './opening-display'

let viewerStore: StoreApi<OpeningDisplayViewerState>
let cache: OpeningDisplayCache
let restoreRegistry: () => void

function setView(view: Partial<OpeningDisplayViewerState>) {
  viewerStore.setState(view)
}

const sceneBefore = useScene.getState()
const shown = (mesh: Mesh) => mesh.layers.isEnabled(SCENE_LAYER)
const markOf = (root: Mesh, name: string) => root.getObjectByName(name) as Mesh | undefined

/** An opening of `kind` on a wall: a hit-box root with a frame and a cutout proxy; a door also leaves its mark spec. */
function addOpening(
  kind: 'door' | 'window',
  extra: Record<string, unknown> = {},
  host: Record<string, unknown> = {},
) {
  const id = `${kind}_${Object.keys(useScene.getState().nodes).length}`
  const root = new Mesh(new BoxGeometry(1, 2, 0.1), new MeshBasicMaterial({ visible: false }))
  const frame = new Mesh(new BoxGeometry(1, 2, 0.1), new MeshBasicMaterial())
  const cutout = new Mesh(new BoxGeometry(1, 2, 0.1), new MeshBasicMaterial())
  cutout.name = 'cutout'
  root.add(frame, cutout)
  if (kind === 'door') {
    root.userData[FLOOR_MARK_SPEC_KEY] = floorMarkSpec(
      [
        [
          [-0.5, 0],
          [0.5, 0],
        ],
        [
          [-0.5, 0],
          [-0.5, 0.9],
        ],
      ],
      -1,
    )
  }
  sceneRegistry.nodes.set(id, root)
  sceneRegistry.byType[kind] ??= new Set()
  sceneRegistry.byType[kind]!.add(id)
  const nodes = useScene.getState().nodes
  useScene.setState({
    nodes: {
      ...nodes,
      wall_a: { id: 'wall_a', type: 'wall', ...host },
      [id]: { id, type: kind, parentId: 'wall_a', ...extra },
    },
  } as never)
  return { id, root, frame, cutout }
}

const marksShown = (root: Mesh) => {
  const lines = markOf(root, FLOOR_MARK_NAME)
  const hit = markOf(root, FLOOR_MARK_HIT_NAME)
  return Boolean(lines && hit && shown(lines) && shown(hit))
}

beforeEach(() => {
  restoreRegistry = nodeRegistry._snapshot()
  nodeRegistry._register({
    kind: 'door',
    schemaVersion: 1,
    capabilities: { lowWallOpening: { floorMark: true } },
  } as never)
  nodeRegistry._register({
    kind: 'window',
    schemaVersion: 1,
    capabilities: { lowWallOpening: {} },
  } as never)
  sceneRegistry.clear()
  useScene.setState({ nodes: {} } as never)
  viewerStore = createStore<OpeningDisplayViewerState>(() => ({
    wallMode: 'up',
    openingDisplay: 'marks',
  }))
  cache = new OpeningDisplayCache(viewerStore)
})

afterEach(() => {
  cache.dispose()
  sceneRegistry.clear()
  useScene.setState(sceneBefore)
  restoreRegistry()
})

describe('OpeningDisplayCache', () => {
  test('an opening is as built in every wall mode but low, and carries no mark', () => {
    const { root, frame, cutout } = addOpening('door')
    const box = new Box3().setFromObject(root)
    for (const wallMode of ['up', 'cutaway', 'down', 'translucent'] as const) {
      setView({ wallMode })
      cache.update()
      expect(shown(frame)).toBe(true)
      expect(shown(cutout)).toBe(true)
      expect(markOf(root, FLOOR_MARK_NAME)).toBeUndefined()
    }
    // Bounds, which the action menu, box select and framing read, stay the door's own.
    expect(new Box3().setFromObject(root).equals(box)).toBe(true)
  })

  test.each([
    ['marks', 'door', false, true],
    ['marks', 'window', false, false],
    ['hidden', 'door', false, false],
    ['hidden', 'window', false, false],
    ['full', 'door', true, false],
    ['full', 'window', true, false],
  ] as const)(
    'low with openings %s leaves a %s with its parts shown: %s and its marks shown: %s',
    (openingDisplay, kind, partsShown, marks) => {
      const { frame, cutout, root } = addOpening(kind)
      setView({ wallMode: 'low', openingDisplay })
      cache.update()
      expect(shown(frame)).toBe(partsShown)
      expect(shown(cutout)).toBe(partsShown)
      expect(shown(root)).toBe(partsShown)
      expect(marksShown(root)).toBe(marks)
    },
  )

  test('the mark is a pick target on the scene layer, and the hidden parts are not', () => {
    const { frame, root } = addOpening('door')
    setView({ wallMode: 'low', openingDisplay: 'marks' })
    cache.update()
    const hit = markOf(root, FLOOR_MARK_HIT_NAME)!
    expect(frame.layers.isEnabled(SHADOW_ONLY_LAYER)).toBe(false)
    expect(hit.parent).toBe(root)
    expect(shown(hit)).toBe(true)
    expect(shown(root)).toBe(false)
  })

  test('leaving low or choosing full gives the opening back and takes the marks off', () => {
    const { root, frame, cutout } = addOpening('door')
    setView({ wallMode: 'low', openingDisplay: 'marks' })
    cache.update()
    setView({ wallMode: 'up' })
    cache.update()
    expect(shown(frame)).toBe(true)
    expect(shown(cutout)).toBe(true)
    expect(markOf(root, FLOOR_MARK_NAME)).toBeUndefined()
    setView({ wallMode: 'low', openingDisplay: 'hidden' })
    cache.update()
    expect(shown(frame)).toBe(false)
    setView({ openingDisplay: 'full' })
    cache.update()
    expect(shown(frame)).toBe(true)
  })

  test('switching between marks and hidden while low moves only the marks', () => {
    const { root, frame } = addOpening('door')
    setView({ wallMode: 'low', openingDisplay: 'marks' })
    cache.update()
    expect(marksShown(root)).toBe(true)
    setView({ openingDisplay: 'hidden' })
    cache.update()
    expect(marksShown(root)).toBe(false)
    expect(shown(frame)).toBe(false)
    setView({ openingDisplay: 'marks' })
    cache.update()
    expect(marksShown(root)).toBe(true)
    expect(root.children.filter((child) => child.name === FLOOR_MARK_NAME)).toHaveLength(1)
  })

  test('parts the opening is rebuilt with are held too, and its mark follows the new spec', () => {
    const { root } = addOpening('door')
    setView({ wallMode: 'low', openingDisplay: 'marks' })
    cache.update()
    for (const child of [...root.children]) if (child.name !== 'cutout') root.remove(child)
    const rebuilt = new Mesh(new BoxGeometry(1, 2, 0.1), new MeshBasicMaterial())
    root.add(rebuilt)
    expect(shown(rebuilt)).toBe(true)
    cache.update()
    expect(shown(rebuilt)).toBe(false)
    expect(root.children.filter((child) => child.name === FLOOR_MARK_NAME)).toHaveLength(1)
  })

  test('a scripted opening whose model loads below its root after the hold is held when it loads', () => {
    const { root } = addOpening('door', { source: { artifact: 'a', manifest: {} } })
    const model = new Group()
    root.add(model)
    setView({ wallMode: 'low', openingDisplay: 'marks' })
    cache.update()
    const loaded = new Mesh(new BoxGeometry(1, 2, 0.1), new MeshBasicMaterial())
    const inner = new Group()
    inner.add(loaded)
    model.add(inner)
    expect(shown(loaded)).toBe(true)
    cache.update()
    expect(shown(loaded)).toBe(false)
    expect(marksShown(root)).toBe(true)
  })

  describe('what it leaves as built', () => {
    test.each([
      ['a draft a tool is placing', { metadata: { isTransient: true } }, {}],
      ['a new node being moved', { metadata: { isNew: true } }, {}],
      ['an opening on a roof face', { roofSegmentId: 'roofseg_a' }, {}],
      ['an opening on a curtain wall', {}, { wallType: 'curtain' }],
    ])('%s', (_label, extra, host) => {
      const { frame, root } = addOpening('door', extra, host)
      setView({ wallMode: 'low', openingDisplay: 'marks' })
      cache.update()
      expect(shown(frame)).toBe(true)
      expect(markOf(root, FLOOR_MARK_NAME)).toBeUndefined()
    })

    test('a node picked up for a move comes back as built, and is hidden again when it lands', () => {
      const { id, frame } = addOpening('window')
      setView({ wallMode: 'low', openingDisplay: 'hidden' })
      cache.update()
      expect(shown(frame)).toBe(false)
      const nodes = useScene.getState().nodes
      useScene.setState({
        nodes: {
          ...nodes,
          [id]: { ...nodes[id as keyof typeof nodes], metadata: { isTransient: true } },
        },
      } as never)
      cache.update()
      expect(shown(frame)).toBe(true)
      useScene.setState({ nodes } as never)
      cache.update()
      expect(shown(frame)).toBe(false)
    })
  })

  test('the batch hears when an opening starts and stops being hidden', () => {
    const { id } = addOpening('door')
    const events: [string, boolean][] = []
    const unsubscribe = subscribeOpeningDisplayAffected((nodeId) =>
      events.push([nodeId, isOpeningDisplayAffected(nodeId)]),
    )
    setView({ wallMode: 'low', openingDisplay: 'marks' })
    cache.update()
    cache.update()
    setView({ wallMode: 'up' })
    cache.update()
    unsubscribe()
    expect(events).toEqual([
      [id, true],
      [id, false],
    ])
  })

  describe('captures', () => {
    test.each([{ exporting: true }, { wholeWalls: true }, { finished: true }] as const)(
      '%j shows the openings as built, whatever low says',
      (event) => {
        const { root, frame } = addOpening('door')
        setView({ wallMode: 'low', openingDisplay: 'marks' })
        cache.update()
        cache.beforeCapture(event)
        expect(shown(frame)).toBe(true)
        expect(markOf(root, FLOOR_MARK_NAME)).toBeUndefined()
        cache.afterCapture()
        expect(shown(frame)).toBe(false)
        expect(marksShown(root)).toBe(true)
      },
    )

    test('a capture of low walls follows the person low setting, or its own openings', () => {
      const { root, frame } = addOpening('door')
      cache.beforeCapture({ wholeWalls: true, wallsLow: true })
      expect(shown(frame)).toBe(false)
      expect(marksShown(root)).toBe(true)
      cache.afterCapture()
      expect(shown(frame)).toBe(true)
      expect(markOf(root, FLOOR_MARK_NAME)).toBeUndefined()

      cache.beforeCapture({ wholeWalls: true, wallsLow: true, openings: 'hidden' })
      expect(shown(frame)).toBe(false)
      expect(markOf(root, FLOOR_MARK_NAME)).toBeUndefined()
      cache.afterCapture()

      cache.beforeCapture({ wholeWalls: true, wallsLow: true, openings: 'full' })
      expect(shown(frame)).toBe(true)
      cache.afterCapture()
    })

    test('an export is whole even when the capture also says low', () => {
      const { frame } = addOpening('door')
      cache.beforeCapture({ exporting: true, wholeWalls: true, wallsLow: true })
      expect(shown(frame)).toBe(true)
      cache.afterCapture()
    })

    test('a capture that never reported its end is undone by the next frame', () => {
      const { frame } = addOpening('door')
      setView({ wallMode: 'low', openingDisplay: 'hidden' })
      cache.update()
      cache.beforeCapture({ wholeWalls: true })
      expect(shown(frame)).toBe(true)
      cache.update()
      expect(shown(frame)).toBe(false)
    })

    test('the batch is not told about a capture that lifts and restores', () => {
      addOpening('door')
      setView({ wallMode: 'low', openingDisplay: 'hidden' })
      cache.update()
      const events: string[] = []
      const unsubscribe = subscribeOpeningDisplayAffected((nodeId) => events.push(nodeId))
      cache.beforeCapture({ exporting: true })
      cache.afterCapture()
      unsubscribe()
      expect(events).toEqual([])
    })
  })

  test('a plain scene without openings hides nothing', () => {
    const group = new Group()
    const mesh = new Mesh()
    group.add(mesh)
    sceneRegistry.nodes.set('wall_a', group)
    setView({ wallMode: 'low', openingDisplay: 'hidden' })
    cache.update()
    expect(shown(mesh)).toBe(true)
  })
})
