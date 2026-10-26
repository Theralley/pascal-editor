import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { type AnyNode, type AnyNodeId, nodeRegistry, registerNode } from '@pascal-app/core'
import { z } from 'zod'
import { nodeDisplayLabel } from './node-display-label'

const KIND = 'fixture-named-kind'

let restoreRegistry: () => void = () => {}

beforeAll(() => {
  restoreRegistry = nodeRegistry._snapshot()
  registerNode({
    kind: KIND,
    schemaVersion: 1,
    schema: z.object({}),
    category: 'furnish',
    defaults: () => ({}),
    capabilities: {},
    renderer: { kind: 'parametric', module: async () => ({ default: () => null }) },
    tree: { label: (node: AnyNode) => `${node.name} (shown)` },
  } as never)
})

afterAll(() => restoreRegistry())

const named = {
  object: 'node',
  id: 'fixture_a',
  type: KIND,
  name: 'Base Cabinet',
} as unknown as AnyNode
const nodes = { [named.id]: named } as Record<AnyNodeId, AnyNode>

describe('nodeDisplayLabel', () => {
  test('a named node reads its kind tree label when the caller passes a locale and the scene', () => {
    expect(nodeDisplayLabel(named, 'sv', nodes)).toBe('Base Cabinet (shown)')
  })

  test('English keeps the stored name even with the scene', () => {
    expect(nodeDisplayLabel(named, 'en', nodes)).toBe('Base Cabinet')
  })

  test('without the scene or a locale the stored name stands, as the baked artifact needs', () => {
    expect(nodeDisplayLabel(named)).toBe('Base Cabinet')
    expect(nodeDisplayLabel(named, 'sv')).toBe('Base Cabinet')
  })
})
