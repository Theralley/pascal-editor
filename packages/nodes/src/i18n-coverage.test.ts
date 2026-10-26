import { describe, expect, test } from 'bun:test'
import type { AnyNode, AnyNodeDefinition, ToolHint } from '@pascal-app/core'
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

/** Slot declarations depend on the node, so a kind lists the nodes that show every label. */
const SLOT_SAMPLES: Record<string, object[]> = {
  wall: [{}, { wallType: 'curtain' }, { underpinning: true }],
}

/** Visible text no definition field lists: a callback builds it from a node or a role. */
const COMPUTED_TEXT: Record<string, string[]> = {
  wall: [
    'Face',
    'Room',
    'Wall start',
    'Wall end',
    'Wall centerline',
    'Wall midpoint',
    'Wall arc center',
    'Wall face',
    'Wall height',
    'Wall top',
    'Outside face',
    'Inside face',
  ],
}

const hintTexts = (hints: readonly ToolHint[] = []) =>
  hints.flatMap((hint) => [
    hint.label,
    ...Object.values(hint.chip?.labels ?? {}),
    ...(hint.chip?.tooltip ? [hint.chip.tooltip] : []),
  ])

/** Every string the editor renders from this definition, in English. */
function visibleDefinitionTexts(definition: AnyNodeDefinition): string[] {
  const kind = definition.kind
  const multiControls = definition.extensions?.['pascal:editor/panel-model'] as
    | { multiControls?: (context: { selection: AnyNode[]; nodes: object }) => unknown[] }
    | undefined
  const wall = definition.schema.safeParse({ id: 'wall_a', start: [0, 0], end: [4, 0] })
  const controls =
    kind === 'wall' && wall.success
      ? ((multiControls?.multiControls?.({
          selection: [wall.data as AnyNode],
          nodes: { [wall.data.id]: wall.data },
        }) ?? []) as { label: string; options: { label: string }[] }[])
      : []
  return [
    ...(definition.presentation ? [definition.presentation.label] : []),
    ...hintTexts(definition.toolHints),
    ...Object.values(definition.affordanceHints ?? {}).flatMap(hintTexts),
    ...(definition.toolOptions ?? []).flatMap((option) => [
      option.label,
      ...option.choices.flatMap((choice) => [
        choice.label,
        ...(choice.description ? [choice.description] : []),
      ]),
    ]),
    ...(definition.parametrics?.groups.map((group) => group.label) ?? []),
    ...(definition.parametrics?.actions?.map((action) => action.label) ?? []),
    // A pending kind's slot builders may need real nodes, so only translated kinds are asked.
    ...(PENDING.has(kind) ? [] : (SLOT_SAMPLES[kind] ?? [{}])).flatMap(
      (node) => definition.capabilities?.slots?.(node as never).map((slot) => slot.label) ?? [],
    ),
    ...controls.flatMap((control) => [control.label, ...control.options.map((o) => o.label)]),
    ...(COMPUTED_TEXT[kind] ?? []),
  ]
}

const missingSwedish = (definition: AnyNodeDefinition) =>
  [...new Set(visibleDefinitionTexts(definition))].filter(
    (text) => definition.translations?.sv?.[text] === undefined,
  )

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
