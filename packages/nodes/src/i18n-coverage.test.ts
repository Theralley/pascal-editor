import { describe, expect, test } from 'bun:test'
import type { AnyNode, AnyNodeDefinition, ToolHint } from '@pascal-app/core'
import { prettifyEnumValue, prettifyKey, setLocale } from '@pascal-app/editor'
import { builtinPlugin } from './index'

/**
 * Kinds whose definition text has no Swedish yet. A kind translated in full leaves this list: the
 * test below fails for a pending kind that no longer needs it, so the list can only shrink.
 */
const PENDING = new Set([
  'shelf',
  'block',
  'spawn',
  'separator',
  'floor-opening',
  'fence',
  'fence-gate',
  'fence-opening',
  'slab',
  'ceiling',
  'window',
  'cabinet',
  'cabinet-module',
  'item',
  'procedural-item',
  'imported-mesh',
  'column',
  'elevator',
  'unit',
  'stair',
  'stair-segment',
  'zone',
  'site',
  'building',
  'level',
  'guide',
  'scan',
  'measurement',
  'construction-dimension',
  'structural-grid',
])

/** Nodes that feed a kind's callbacks (slots, quick actions, measurement, notices); `{}` when absent. */
const SAMPLE_NODES: Record<string, object[]> = {
  'lean-to-extension': [{ id: 'leanto_a' }],
  'roof-segment': [{ id: 'rseg_a' }],
  'box-vent': [{ id: 'bvent_a' }],
  'ridge-vent': [{ id: 'rvent_a' }],
  'turbine-vent': [{ id: 'tvent_a' }],
  'solar-panel': [{ id: 'solarpanel_a' }],
  'duct-segment': [
    {
      path: [
        [0, 0, 0],
        [1, 0, 0],
      ],
    },
  ],
  lineset: [
    {
      path: [
        [0, 0, 0],
        [1, 0, 0],
      ],
    },
  ],
  'liquid-line': [
    {
      path: [
        [0, 0, 0],
        [1, 0, 0],
      ],
    },
  ],
  'pipe-segment': [
    {
      path: [
        [0, 0, 0],
        [1, 0, 0],
      ],
    },
  ],
  wall: [
    { id: 'wall_a', start: [0, 0], end: [4, 0] },
    { id: 'wall_b', start: [0, 0], end: [4, 0], curveOffset: 0.5 },
    { id: 'wall_c', start: [0, 0], end: [4, 0], wallType: 'curtain' },
    { id: 'wall_d', start: [0, 0], end: [4, 0], underpinning: { rim: 0.2, stem: 0.3 } },
  ],
}

/** Visible text the callbacks cannot produce from a sample: paint role labels, room-only options. */
const COMPUTED_TEXT: Record<string, string[]> = {
  wall: ['Face', 'Room', 'Outside face', 'Inside face'],
}

const EMPTY_GEOMETRY_CONTEXT = {
  resolve: () => undefined,
  children: [],
  parent: null,
  siblings: [],
}

const hintTexts = (hints: readonly ToolHint[] = []) =>
  hints.flatMap((hint) => [
    hint.label,
    ...Object.values(hint.chip?.labels ?? {}),
    ...(hint.chip?.tooltip ? [hint.chip.tooltip] : []),
  ])

const sampleNodes = (definition: AnyNodeDefinition): AnyNode[] =>
  (SAMPLE_NODES[definition.kind] ?? [{}]).map((input) => {
    const parsed = definition.schema.safeParse({ id: `${definition.kind}_sample`, ...input })
    if (!parsed.success)
      throw new Error(`Add SAMPLE_NODES for ${definition.kind}: ${parsed.error.message}`)
    return parsed.data as AnyNode
  })

type Entry = [id: string, text: string]

/** Text built by the definition's callbacks, each under a stable identity. */
function callbackTexts(definition: AnyNodeDefinition): Entry[] {
  return sampleNodes(definition).flatMap((node) => {
    const nodes = { [node.id]: node } as Record<string, AnyNode>
    const at = (id: string) => `${node.id}:${id}`
    const measurement = definition.measurement
    const report = measurement?.quickMeasure?.(node as never, EMPTY_GEOMETRY_CONTEXT as never)
    const notice = definition.placementNotice?.(node as never, { nodes })
    const panelModel = definition.extensions?.['pascal:editor/panel-model'] as
      | {
          multiControls?: (context: { selection: AnyNode[]; nodes: object }) => {
            id: string
            label: string
            options: { value: string; label: string }[]
          }[]
        }
      | undefined
    const entries: Entry[] = [
      ...(definition.capabilities?.slots?.(node as never) ?? []).map(
        (slot): Entry => [at(`slot:${slot.slotId}`), slot.label],
      ),
      ...(definition.quickActions?.({ node: node as never, nodes }) ?? []).flatMap(
        (action): Entry[] => [
          [at(`action:${action.id}`), action.label],
          ...(action.title ? [[at(`action-title:${action.id}`), action.title] as Entry] : []),
        ],
      ),
      ...(definition.tree?.label
        ? [[at('tree'), definition.tree.label(node, nodes)] as Entry]
        : []),
      ...(measurement?.features(node as never, EMPTY_GEOMETRY_CONTEXT as never) ?? []).map(
        (feature): Entry => [at(`feature:${feature.id}`), feature.label],
      ),
      ...(report
        ? [
            [at('report:title'), report.title] as Entry,
            [at('report:kind'), report.kindLabel] as Entry,
            ...report.metrics.map((metric): Entry => [at(`metric:${metric.key}`), metric.label]),
            ...(report.note ? [[at('report:note'), report.note] as Entry] : []),
          ]
        : []),
      ...(notice
        ? [
            [at('notice:line'), notice.line] as Entry,
            ...(notice.detail ? [[at('notice:detail'), notice.detail] as Entry] : []),
          ]
        : []),
      ...(panelModel?.multiControls?.call(panelModel, { selection: [node], nodes }) ?? []).flatMap(
        (control): Entry[] => [
          [at(`control:${control.id}`), control.label],
          ...control.options.map((o): Entry => [at(`option:${control.id}:${o.value}`), o.label]),
        ],
      ),
    ]
    return entries
  })
}

/**
 * The English texts a callback did not translate itself. The two outputs are paired by identity
 * and must have the same shape; a pair that reads the same in both languages is untranslated.
 */
export function untranslatedCallbackTexts(english: Entry[], swedish: Entry[]): string[] {
  const swedishById = new Map(swedish)
  const englishIds = new Set(english.map(([id]) => id))
  const reshaped = [
    ...english.filter(([id]) => !swedishById.has(id)).map(([id]) => `${id} (missing in sv)`),
    ...swedish.filter(([id]) => !englishIds.has(id)).map(([id]) => `${id} (only in sv)`),
  ]
  if (reshaped.length > 0) return reshaped
  // A decimal comma alone ("1.5 m" vs "1,5 m") is not a translation.
  const words = (text: string | undefined) => text?.replace(/\d+(?:[.,]\d+)?/g, '#')
  return english
    .filter(([id, text]) => words(swedishById.get(id)) === words(text))
    .map(([, text]) => text)
}

/** Every string the editor renders from this definition, in English. */
function visibleDefinitionTexts(definition: AnyNodeDefinition): string[] {
  return [
    ...(definition.presentation
      ? [definition.presentation.label, definition.presentation.description ?? '']
      : []),
    ...hintTexts(definition.toolHints),
    ...Object.values(definition.affordanceHints ?? {}).flatMap(hintTexts),
    ...(definition.toolOptions ?? []).flatMap((option) => [
      option.label,
      ...option.choices.flatMap((choice) => [choice.label, choice.description ?? '']),
    ]),
    ...(definition.parametrics?.groups.flatMap((group) => [
      group.label,
      ...group.fields.flatMap((field) => {
        // The generic inspector prettifies the key; a custom field draws its own label.
        if (field.kind === 'custom' || field.kind === 'vec3') return []
        return [
          prettifyKey(String(field.key)),
          ...(field.kind === 'enum' ? field.options.map(prettifyEnumValue) : []),
        ]
      }),
    ]) ?? []),
    ...(definition.parametrics?.actions?.map((action) => action.label) ?? []),
    ...(COMPUTED_TEXT[definition.kind] ?? []),
  ].filter((text) => text !== '')
}

/**
 * English strings with no Swedish: not in `translations.sv`, and not translated where they are
 * built (a callback that answers differently under `sv` has translated its own text).
 */
function missingSwedish(definition: AnyNodeDefinition): string[] {
  const missing = new Set(
    visibleDefinitionTexts(definition).filter(
      (text) => definition.translations?.sv?.[text] === undefined,
    ),
  )
  if (!PENDING.has(definition.kind)) {
    setLocale('en')
    const english = callbackTexts(definition)
    setLocale('sv')
    const swedish = callbackTexts(definition)
    setLocale('en')
    for (const text of untranslatedCallbackTexts(english, swedish))
      if (definition.translations?.sv?.[text] === undefined) missing.add(text)
  }
  return [...missing]
}

const definitions = (builtinPlugin.nodes ?? []) as AnyNodeDefinition[]

describe('untranslatedCallbackTexts', () => {
  const list = (...texts: string[]): Entry[] => texts.map((text) => [`id:${text}`, text])

  test('pairs by identity, so a reordered untranslated list fails', () => {
    const english: Entry[] = [
      ['a:action:move', 'Move'],
      ['a:action:delete', 'Delete'],
    ]
    const reordered: Entry[] = [
      ['a:action:delete', 'Delete'],
      ['a:action:move', 'Move'],
    ]
    expect(untranslatedCallbackTexts(english, reordered).sort()).toEqual(['Delete', 'Move'])
  })

  test('a different shape fails, and a translated pair passes', () => {
    expect(untranslatedCallbackTexts(list('Move', 'Delete'), list('Flytta'))).toEqual([
      'id:Move (missing in sv)',
      'id:Delete (missing in sv)',
      'id:Flytta (only in sv)',
    ])
    expect(untranslatedCallbackTexts([['a', 'Move']], [['a', 'Flytta']])).toEqual([])
  })

  test('a text that differs only by its decimal separator is untranslated', () => {
    expect(untranslatedCallbackTexts([['a', 'Raise by 1.5 m']], [['a', 'Raise by 1,5 m']])).toEqual(
      ['Raise by 1.5 m'],
    )
    expect(untranslatedCallbackTexts([['a', 'Raise by 1.5 m']], [['a', 'Höj 1,5 m']])).toEqual([])
  })
})

describe('Swedish definition text', () => {
  test('every built-in kind outside the pending list is translated in full', () => {
    const gaps = Object.fromEntries(
      definitions
        .filter((definition) => !PENDING.has(definition.kind))
        .map((definition) => [definition.kind, missingSwedish(definition)])
        .filter(([, missing]) => (missing as string[]).length > 0),
    )
    expect(gaps).toEqual({})
  })

  test('a kind leaves the pending list once it is translated', () => {
    const done = definitions
      .filter((definition) => PENDING.has(definition.kind))
      .filter((definition) => missingSwedish(definition).length === 0)
      .map((definition) => definition.kind)
    expect(done).toEqual([])
  })

  test('the pending list names only built-in kinds', () => {
    const kinds = new Set(definitions.map((definition) => definition.kind))
    expect([...PENDING].filter((kind) => !kinds.has(kind))).toEqual([])
  })

  test('the reference kinds are translated and not pending', () => {
    for (const kind of ['door', 'wall']) {
      expect(PENDING.has(kind)).toBe(false)
      expect(definitions.some((definition) => definition.kind === kind)).toBe(true)
    }
  })
})
