import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { nodeRegistry, sceneRegistry } from '@pascal-app/core'
import { BoxGeometry, Group, Mesh, MeshBasicMaterial } from 'three'
import { createStore, type StoreApi } from 'zustand/vanilla'
import { createFloorMark, FLOOR_MARK_HIT_NAME, FLOOR_MARK_NAME } from '../../lib/floor-mark'
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

const shown = (mesh: Mesh) => mesh.layers.isEnabled(SCENE_LAYER)

function setView(view: Partial<OpeningDisplayViewerState>) {
  viewerStore.setState(view)
}

/** An opening of `kind`: a hit-box root with a frame and a cutout proxy, and floor marks when it has them. */
function addOpening(kind: 'door' | 'window', id = `${kind}_a`) {
  const root = new Mesh(new BoxGeometry(1, 2, 0.1), new MeshBasicMaterial({ visible: false }))
  const frame = new Mesh(new BoxGeometry(1, 2, 0.1), new MeshBasicMaterial())
  const cutout = new Mesh(new BoxGeometry(1, 2, 0.1), new MeshBasicMaterial())
  cutout.name = 'cutout'
  root.add(frame, cutout)
  const marks =
    kind === 'door'
      ? createFloorMark({
          polylines: [
            [
              [0, 0],
              [1, 0],
            ],
          ],
          hitWidth: 1,
          hitDepth: 0.3,
          y: -1,
        })
      : []
  root.add(...marks)
  sceneRegistry.nodes.set(id, root)
  sceneRegistry.byType[kind] ??= new Set()
  sceneRegistry.byType[kind]!.add(id)
  const [lines, hit] = marks
  return { id, root, frame, cutout, lines, hit }
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
  viewerStore = createStore<OpeningDisplayViewerState>(() => ({
    wallMode: 'up',
    openingDisplay: 'marks',
  }))
  cache = new OpeningDisplayCache(viewerStore)
})

afterEach(() => {
  cache.dispose()
  sceneRegistry.clear()
  restoreRegistry()
})

describe('OpeningDisplayCache', () => {
  test('a door is built with its marks held off and stays as built in every wall mode but low', () => {
    const { frame, cutout, lines, hit } = addOpening('door')
    for (const wallMode of ['up', 'cutaway', 'down', 'translucent'] as const) {
      setView({ wallMode })
      cache.update()
      expect(shown(frame)).toBe(true)
      expect(shown(cutout)).toBe(true)
      expect(shown(lines!)).toBe(false)
      expect(shown(hit!)).toBe(false)
    }
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
    (openingDisplay, kind, partsShown, marksShown) => {
      const { frame, cutout, root, lines, hit } = addOpening(kind)
      setView({ wallMode: 'low', openingDisplay })
      cache.update()
      expect(shown(frame)).toBe(partsShown)
      expect(shown(cutout)).toBe(partsShown)
      expect(shown(root)).toBe(partsShown)
      if (lines && hit) {
        expect(shown(lines)).toBe(marksShown)
        expect(shown(hit)).toBe(marksShown)
      }
    },
  )

  test('a hidden opening is neither picked nor shadowed, and a mark keeps its own place', () => {
    const { frame, hit } = addOpening('door')
    setView({ wallMode: 'low', openingDisplay: 'marks' })
    cache.update()
    expect(frame.layers.isEnabled(SHADOW_ONLY_LAYER)).toBe(false)
    expect(hit!.name).toBe(FLOOR_MARK_HIT_NAME)
    expect(hit!.parent?.layers.isEnabled(SCENE_LAYER)).toBe(false)
    expect(shown(hit!)).toBe(true)
  })

  test('leaving low or choosing full gives the opening back and holds the marks off', () => {
    const { frame, cutout, lines } = addOpening('door')
    setView({ wallMode: 'low', openingDisplay: 'marks' })
    cache.update()
    setView({ wallMode: 'up' })
    cache.update()
    expect(shown(frame)).toBe(true)
    expect(shown(cutout)).toBe(true)
    expect(shown(lines!)).toBe(false)
    setView({ wallMode: 'low', openingDisplay: 'hidden' })
    cache.update()
    expect(shown(frame)).toBe(false)
    setView({ openingDisplay: 'full' })
    cache.update()
    expect(shown(frame)).toBe(true)
  })

  test('switching between marks and hidden while low moves only the marks', () => {
    const { frame, lines } = addOpening('door')
    setView({ wallMode: 'low', openingDisplay: 'marks' })
    cache.update()
    expect(shown(lines!)).toBe(true)
    setView({ openingDisplay: 'hidden' })
    cache.update()
    expect(shown(lines!)).toBe(false)
    expect(shown(frame)).toBe(false)
    setView({ openingDisplay: 'marks' })
    cache.update()
    expect(shown(lines!)).toBe(true)
  })

  test('parts the opening is rebuilt with are held too, and marks stay what they were built as', () => {
    const { root, lines } = addOpening('door')
    setView({ wallMode: 'low', openingDisplay: 'marks' })
    cache.update()
    for (const child of [...root.children]) if (child.name !== 'cutout') root.remove(child)
    const rebuilt = new Mesh(new BoxGeometry(1, 2, 0.1), new MeshBasicMaterial())
    const [freshLines, freshHit] = createFloorMark({
      polylines: [
        [
          [0, 0],
          [1, 0],
        ],
      ],
      hitWidth: 1,
      hitDepth: 0.3,
      y: -1,
    })
    root.add(rebuilt, freshLines!, freshHit!)
    expect(shown(rebuilt)).toBe(true)
    expect(shown(freshLines!)).toBe(false)
    cache.update()
    expect(shown(rebuilt)).toBe(false)
    expect(shown(freshLines!)).toBe(true)
    expect(shown(freshHit!)).toBe(true)
    expect(lines!.name).toBe(FLOOR_MARK_NAME)
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
    test.each([
      [{ exporting: true }, 'marks'],
      [{ wholeWalls: true }, 'marks'],
      [{ finished: true }, 'marks'],
    ] as const)('%j shows the openings as built, whatever low says', (event) => {
      const { frame, lines } = addOpening('door')
      setView({ wallMode: 'low', openingDisplay: 'marks' })
      cache.update()
      cache.beforeCapture(event)
      expect(shown(frame)).toBe(true)
      expect(shown(lines!)).toBe(false)
      cache.afterCapture()
      expect(shown(frame)).toBe(false)
      expect(shown(lines!)).toBe(true)
    })

    test('a capture of low walls follows the person low setting, or its own openings', () => {
      const { frame, lines } = addOpening('door')
      cache.beforeCapture({ wholeWalls: true, wallsLow: true })
      expect(shown(frame)).toBe(false)
      expect(shown(lines!)).toBe(true)
      cache.afterCapture()
      expect(shown(frame)).toBe(true)
      expect(shown(lines!)).toBe(false)

      cache.beforeCapture({ wholeWalls: true, wallsLow: true, openings: 'hidden' })
      expect(shown(frame)).toBe(false)
      expect(shown(lines!)).toBe(false)
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

  test('a plain scene without openings costs the system nothing and hides nothing', () => {
    const group = new Group()
    const mesh = new Mesh()
    group.add(mesh)
    sceneRegistry.nodes.set('wall_a', group)
    setView({ wallMode: 'low', openingDisplay: 'hidden' })
    cache.update()
    expect(shown(mesh)).toBe(true)
  })
})
