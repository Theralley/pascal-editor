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
  'lean-to-extension',
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
  'roof',
  'roof-segment',
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
  'box-vent',
  'ridge-vent',
  'turbine-vent',
  'cupola',
  'eyebrow-vent',
  'chimney',
  'solar-panel',
  'skylight',
  'dormer',
  'gutter',
  'downspout',
  'duct-segment',
  'duct-fitting',
  'duct-terminal',
  'hvac-equipment',
  'lineset',
  'liquid-line',
  'pipe-segment',
  'pipe-fitting',
  'pipe-trap',
])

/** Nodes that feed a kind's callbacks (slots, quick actions, measurement, notices); `{}` when absent. */
const SAMPLE_NODES: Record<string, object[]> = {
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

/** Text built by the definition's callbacks, in the order the callbacks yield it. */
function callbackTexts(definition: AnyNodeDefinition): string[] {
  return sampleNodes(definition).flatMap((node) => {
    const nodes = { [node.id]: node } as Record<string, AnyNode>
    const measurement = definition.measurement
    const report = measurement?.quickMeasure?.(node as never, EMPTY_GEOMETRY_CONTEXT as never)
    const notice = definition.placementNotice?.(node as never, { nodes })
    const panelModel = definition.extensions?.['pascal:editor/panel-model'] as
      | {
          multiControls?: (context: { selection: AnyNode[]; nodes: object }) => {
            label: string
            options: { label: string }[]
          }[]
        }
      | undefined
    return [
      ...(definition.capabilities?.slots?.(node as never).map((slot) => slot.label) ?? []),
      ...(definition.quickActions?.({ node: node as never, nodes }) ?? []).flatMap((action) => [
        action.label,
        ...(action.title ? [action.title] : []),
      ]),
      ...(definition.tree?.label ? [definition.tree.label(node, nodes)] : []),
      ...(measurement
        ?.features(node as never, EMPTY_GEOMETRY_CONTEXT as never)
        .map((f) => f.label) ?? []),
      ...(report
        ? [
            report.title,
            report.kindLabel,
            ...report.metrics.map((metric) => metric.label),
            ...(report.note ? [report.note] : []),
          ]
        : []),
      ...(notice ? [notice.line, ...(notice.detail ? [notice.detail] : [])] : []),
      ...(panelModel?.multiControls
        ?.call(panelModel, { selection: [node], nodes })
        .flatMap((control) => [control.label, ...control.options.map((o) => o.label)]) ?? []),
    ]
  })
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
    english.forEach((text, index) => {
      if (swedish[index] === text && definition.translations?.sv?.[text] === undefined)
        missing.add(text)
    })
  }
  return [...missing]
}

const definitions = (builtinPlugin.nodes ?? []) as AnyNodeDefinition[]

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
