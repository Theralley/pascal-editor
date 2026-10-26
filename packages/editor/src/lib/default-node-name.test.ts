import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { type AnyNodeDefinition, nodeRegistry, registerNode } from '@pascal-app/core'
import { z } from 'zod'
import { numberedNodeName } from './default-node-name'

let restoreRegistry: () => void = () => {}
beforeAll(() => {
  restoreRegistry = nodeRegistry._snapshot()
  nodeRegistry._reset()
  registerNode({
    kind: 'fixture-slab',
    schemaVersion: 1,
    schema: z.object({}),
    category: 'structure',
    defaults: () => ({}),
    capabilities: {},
    presentation: { label: 'Slab', icon: { kind: 'url', src: '/icons/floor.webp' } },
    translations: { sv: { Slab: 'Bjälklag' } },
  } as unknown as AnyNodeDefinition)
})
afterAll(() => restoreRegistry())

describe('numberedNodeName', () => {
  test('names a new node after its kind in the given language', () => {
    const cases = [
      { kind: 'fixture-slab', locale: 'en', expected: 'Slab 3' },
      { kind: 'fixture-slab', locale: 'sv', expected: 'Bjälklag 3' },
      { kind: 'unregistered', locale: 'sv', expected: 'unregistered 3' },
    ] as const
    for (const { kind, locale, expected } of cases)
      expect(numberedNodeName(kind, 3, locale)).toBe(expected)
  })
})
