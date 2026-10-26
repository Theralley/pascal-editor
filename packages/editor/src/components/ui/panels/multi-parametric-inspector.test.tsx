import { afterAll, afterEach, beforeAll, expect, test } from 'bun:test'
import { type AnyNode, type AnyNodeDefinition, type AnyNodeId, nodeRegistry, registerNode, useScene } from '@pascal-app/core'
import { useViewer } from '@pascal-app/viewer'
import { z } from 'zod'
import { setLocale } from '../../../i18n'
import { useInspectorExpanded } from '../../../lib/inspector-expanded'
import { renderCurrentMarkup } from '../../../test-utils/render-current-markup'
import { MultiParametricInspector } from './multi-parametric-inspector'

let restoreRegistry: () => void = () => {}

beforeAll(() => {
  restoreRegistry = nodeRegistry._snapshot()
  nodeRegistry._reset()
  registerNode({
    kind: 'fixture-door',
    schemaVersion: 1,
    schema: z.object({}),
    category: 'structure',
    defaults: () => ({}),
    capabilities: {},
    presentation: { label: 'Door', icon: { kind: 'url', src: '/icons/door.webp' } },
    translations: {
      sv: { Door: 'Dörr', Dimensions: 'Mått', 'Frame depth': 'Karmdjup', Style: 'Stil', Barn: 'Ladugård' },
    },
    parametrics: {
      groups: [
        {
          label: 'Dimensions',
          fields: [
            { key: 'frameDepth', kind: 'number', min: 0, max: 1, step: 0.01 },
            { key: 'style', kind: 'enum', options: ['barn'], display: 'segmented' },
          ],
        },
      ],
    },
  } as unknown as AnyNodeDefinition)
})
afterAll(() => restoreRegistry())
afterEach(() => setLocale('en'))

test('two selected nodes show the kind\'s translated group, field and option labels', () => {
  const door = (id: string) =>
    ({ id, type: 'fixture-door', object: 'node', parentId: null, visible: true, metadata: {}, frameDepth: 0.1, style: 'barn' }) as unknown as AnyNode
  useScene.setState({
    nodes: { door_a: door('door_a'), door_b: door('door_b') },
    rootNodeIds: [],
    dirtyNodes: new Set(),
  } as never)
  useViewer.setState({
    selection: { buildingId: null, levelId: null, zoneId: null, selectedIds: ['door_a', 'door_b'] as AnyNodeId[] },
  } as never)
  useInspectorExpanded.setState({ expanded: true })
  setLocale('sv')
  const html = renderCurrentMarkup(<MultiParametricInspector />)
  for (const text of ['Mått', 'Karmdjup', 'Ladugård']) expect(html).toContain(text)
  expect(html).not.toContain('Frame depth')
})
