import { afterAll, beforeAll, expect, test } from 'bun:test'
import {
  type AnyNode,
  type AnyNodeId,
  nodeRegistry,
  registerNode,
  useScene,
} from '@pascal-app/core'
import { setLocale } from '@pascal-app/editor'
import { wallDefinition } from './definition'
import { createWallRectangle } from './rectangle-command'

if (typeof globalThis.requestAnimationFrame === 'undefined') {
  globalThis.requestAnimationFrame = ((callback: FrameRequestCallback) =>
    setTimeout(() => callback(0), 0)) as unknown as typeof requestAnimationFrame
  globalThis.cancelAnimationFrame = ((id: number) =>
    clearTimeout(id)) as typeof cancelAnimationFrame
}

const LEVEL_ID = 'level_test' as AnyNodeId
let restoreRegistry: () => void = () => {}

beforeAll(() => {
  restoreRegistry = nodeRegistry._snapshot()
  nodeRegistry._reset()
  registerNode(wallDefinition as never)
})
afterAll(() => {
  setLocale('en')
  restoreRegistry()
})

test('the rectangle tool names its four walls in the active language', () => {
  useScene.setState({
    nodes: {
      [LEVEL_ID]: {
        id: LEVEL_ID,
        type: 'level',
        object: 'node',
        parentId: null,
        visible: true,
        metadata: {},
        children: [],
        level: 0,
      } as unknown as AnyNode,
    },
    rootNodeIds: [LEVEL_ID],
    dirtyNodes: new Set(),
    collections: {},
  } as never)
  setLocale('sv')
  const names = createWallRectangle(LEVEL_ID, [0, 0], [4, 3]).map((wall) => wall.name)
  expect(names).toEqual(['Vägg 1', 'Vägg 2', 'Vägg 3', 'Vägg 4'])
})
