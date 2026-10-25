// @ts-expect-error — bun:test is provided by the Bun runtime; viewer does not
// include Bun ambient types in its production declaration build.
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

// The store only gains its persist API when a storage exists at creation, so one is installed
// before the store module is first evaluated.
const items = new Map<string, string>()
let writes = 0
const target = globalThis as { window?: unknown }
const hadWindow = 'window' in target
const previousWindow = target.window
target.window = {
  localStorage: {
    getItem: (name: string) => items.get(name) ?? null,
    setItem: (name: string, value: string) => {
      writes++
      items.set(name, value)
    },
    removeItem: (name: string) => void items.delete(name),
  },
}
const { default: useViewer } = await import('./use-viewer?with-storage')
if (hadWindow) target.window = previousWindow
else delete target.window

describe('stored viewer preferences', () => {
  const original = useViewer.getState()
  const rehydrateFrom = async (state: Record<string, unknown>) => {
    items.set('viewer-preferences', JSON.stringify({ state, version: 0 }))
    await useViewer.persist.rehydrate()
  }
  beforeEach(() => useViewer.setState(original, true))
  afterEach(() => {
    items.clear()
    useViewer.setState(original, true)
  })

  test('a saved hidden mode stays hidden, a saved low mode and its cut height come back clamped', async () => {
    await rehydrateFrom({ wallMode: 'down' })
    expect(useViewer.getState()).toMatchObject({ wallMode: 'down', wallCutHeight: 0.25 })
    await rehydrateFrom({ wallMode: 'low', wallCutHeight: 0.6 })
    expect(useViewer.getState()).toMatchObject({ wallMode: 'low', wallCutHeight: 0.6 })
    await rehydrateFrom({ wallMode: 'low', wallCutHeight: 40 })
    expect(useViewer.getState().wallCutHeight).toBe(1.5)
    await rehydrateFrom({ wallMode: 'sideways', wallCutHeight: 'tall' })
    expect(useViewer.getState()).toMatchObject({ wallMode: 'up', wallCutHeight: 0.25 })
  })

  test('a unit saved under the old keys becomes the personal default', async () => {
    await rehydrateFrom({ unit: 'imperial', metricNotation: 'millimeters' })
    expect(useViewer.getState()).toMatchObject({
      unit: 'imperial',
      unitDefault: 'imperial',
      metricNotationDefault: 'millimeters',
      unitExplicit: true,
      unitSource: 'personal',
    })
  })

  test('no saved unit, or an invalid one, leaves the locale guess unexplicit', async () => {
    for (const saved of [{}, { unit: 'cubits' }]) {
      await rehydrateFrom(saved)
      expect(useViewer.getState()).toMatchObject({ unitExplicit: false, unitSource: 'guess' })
      expect(['metric', 'imperial']).toContain(useViewer.getState().unit)
    }
  })

  test('the new keys win over a stale unit', async () => {
    await rehydrateFrom({ unit: 'metric', unitDefault: 'imperial' })
    expect(useViewer.getState()).toMatchObject({ unit: 'imperial', unitDefault: 'imperial' })
  })

  test('what was stored for scenes without a project id carries to a scene opened for the first time', async () => {
    await rehydrateFrom({
      projectPreferences: { default: { look: { edges: 'strong' }, showGrid: false } },
    })
    useViewer.getState().setProjectId('scene-1')
    expect(useViewer.getState()).toMatchObject({ edges: 'strong', showGrid: false })

    useViewer.getState().setEdges('off')
    useViewer.getState().setProjectId('scene-2')
    expect(useViewer.getState()).toMatchObject({ edges: 'strong', showGrid: false })
    useViewer.getState().setProjectId('scene-1')
    expect(useViewer.getState().edges).toBe('off')
  })

  test('an override in effect is never what the browser stores', async () => {
    useViewer.getState().setProjectId('scene-1')
    useViewer.getState().setWallMode('cutaway')
    useViewer.getState().overrideView({ wallMode: 'up', showRoofs: false })
    useViewer.getState().setUnit('imperial')

    const stored = JSON.parse(items.get('viewer-preferences') ?? '{}').state
    expect(stored).toMatchObject({ wallMode: 'cutaway', showRoofs: true })
    expect(stored.projectPreferences['scene-1']).toMatchObject({ wallMode: 'cutaway' })
    expect(stored.projectPreferences['scene-1'].showRoofs).toBeUndefined()
  })

  test('a browser-wide wall mode and roofs choice becomes the default of a new project', async () => {
    await rehydrateFrom({ wallMode: 'down', showRoofs: false })
    useViewer.getState().setProjectId('scene-9')
    expect(useViewer.getState()).toMatchObject({ wallMode: 'down', showRoofs: false })
  })

  test('a cut height is stored once it is picked, and a preview never reaches storage', () => {
    useViewer.getState().setProjectId('scene-1')
    useViewer.getState().overrideView({ wallCutHeight: 0.9 })
    const stored = () => JSON.parse(items.get('viewer-preferences') ?? '{}').state
    expect(stored().wallCutHeight).toBe(0.25)
    useViewer.getState().setWallCutHeight(0.6)
    expect(stored().wallCutHeight).toBe(0.6)
    expect(stored().projectPreferences['scene-1'].wallCutHeight).toBe(0.6)
  })

  test('a preview that changes nothing persisted writes nothing to storage', () => {
    useViewer.getState().setProjectId('scene-1')
    useViewer.getState().setWallCutHeight(0.6)
    const before = writes
    for (const height of [0.7, 0.8, 0.9])
      useViewer.getState().overrideView({ wallCutHeight: height })
    expect(writes).toBe(before)
  })
})
