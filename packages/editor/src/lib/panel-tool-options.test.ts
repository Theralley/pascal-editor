import { expect, test } from 'bun:test'
import type { ToolHint } from '@pascal-app/core'
import { definitionText } from '../i18n'
import { createToolHintsStore, localizeToolHint } from './panel-tool-options'

test('tool hints share subscriptions, react to visibility and chip state, and unsubscribe', () => {
  let visible = false
  let value = 'auto'
  let subscriptions = 0
  let cleanups = 0
  const subscribe = (_listener: () => void) => {
    subscriptions++
    return () => {
      cleanups++
    }
  }
  const store = createToolHintsStore([
    {
      key: 'P',
      label: 'Placement',
      visible: { subscribe, value: () => visible },
      chip: { subscribe, value: () => value, cycle: () => {}, labels: { auto: 'Auto' } },
    },
  ])
  const cleanup = store.subscribe(() => {})
  expect(subscriptions).toBe(1)
  const hidden = store.getSnapshot()
  visible = true
  expect(store.getSnapshot()).not.toBe(hidden)
  const shown = store.getSnapshot()
  value = 'roof'
  expect(store.getSnapshot()).not.toBe(shown)
  expect(store.getSnapshot()).toBe(store.getSnapshot())
  cleanup()
  expect(cleanups).toBe(1)
})

test("a localized hint carries the definition's text in its label and chip, and keeps its behaviour", () => {
  const definition = {
    translations: {
      sv: { Type: 'Typ', 'Type: Hinged': 'Typ: Svängd', 'Door type — click to cycle': 'Dörrtyp' },
    },
  }
  let cycled = 0
  const hint: ToolHint = {
    key: 'O',
    label: 'Type',
    chip: {
      subscribe: () => () => {},
      value: () => 'hinged',
      cycle: () => cycled++,
      labels: { hinged: 'Type: Hinged', double: 'Type: Double' },
      tooltip: 'Door type — click to cycle',
    },
  }
  const sv = localizeToolHint(definition as never, hint, (def, text) =>
    definitionText(def, text, 'sv'),
  )
  expect(sv.label).toBe('Typ')
  expect(sv.chip?.labels).toEqual({ hinged: 'Typ: Svängd', double: 'Type: Double' })
  expect(sv.chip?.tooltip).toBe('Dörrtyp')
  sv.chip?.cycle()
  expect(cycled).toBe(1)
})
