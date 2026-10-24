import { beforeEach, describe, expect, test } from 'bun:test'
import { Client } from '@modelcontextprotocol/client'
import { InMemoryTransport, McpServer } from '@modelcontextprotocol/server'
import type { SceneGraph } from '@pascal-app/core/clone-scene-graph'
import type { createSceneOperations } from '../../operations'
import { registerDuplicateScene } from './duplicate-scene'
import {
  createTestSceneOperations,
  InMemorySceneStore,
  parseToolText,
  type StoredTextContent,
} from './test-utils'

const emptyGraph: SceneGraph = { nodes: {}, rootNodeIds: [] }

async function connect(operations: ReturnType<typeof createSceneOperations>) {
  const server = new McpServer({ name: 'test', version: '0.0.0' })
  registerDuplicateScene(server, operations)
  const [srvT, cliT] = InMemoryTransport.createLinkedPair()
  const client = new Client({ name: 'test-client', version: '0.0.0' })
  await Promise.all([server.connect(srvT), client.connect(cliT)])
  return client
}

describe('duplicate_scene', () => {
  let client: Client
  let store: InMemorySceneStore

  beforeEach(async () => {
    store = new InMemorySceneStore()
    client = await connect(createTestSceneOperations({ store }).operations)
  })

  test('copies a scene into a new one that records its origin', async () => {
    await store.save({ id: 'house', name: 'House', graph: emptyGraph })

    const result = await client.callTool({ name: 'duplicate_scene', arguments: { id: 'house' } })
    expect(result.isError).toBeFalsy()
    const parsed = parseToolText(result.content as StoredTextContent[])
    expect(parsed.id).not.toBe('house')
    expect(parsed.name).toBe('Copy of House')
    expect(parsed.version).toBe(1)
    expect(parsed.forkedFrom).toEqual({ id: 'house', version: 1, name: 'House' })
    expect((await store.load('house'))?.version).toBe(1)
    expect(await store.load(parsed.id as string)).not.toBeNull()
  })

  test('uses the given name', async () => {
    await store.save({ id: 'house', name: 'House', graph: emptyGraph })

    const result = await client.callTool({
      name: 'duplicate_scene',
      arguments: { id: 'house', name: 'My version' },
    })
    expect(parseToolText(result.content as StoredTextContent[]).name).toBe('My version')
  })

  test('reports a missing source and a stale expectedVersion as errors', async () => {
    await store.save({ id: 'house', name: 'House', graph: emptyGraph })

    const missing = await client.callTool({ name: 'duplicate_scene', arguments: { id: 'ghost' } })
    expect(missing.isError).toBe(true)
    const stale = await client.callTool({
      name: 'duplicate_scene',
      arguments: { id: 'house', expectedVersion: 42 },
    })
    expect(stale.isError).toBe(true)
    expect(await store.list()).toHaveLength(1)
  })

  test('answers duplicate_unavailable when the store cannot copy', async () => {
    const copyless = new InMemorySceneStore()
    ;(copyless as { duplicate?: unknown }).duplicate = undefined
    await copyless.save({ id: 'house', name: 'House', graph: emptyGraph })
    const limited = await connect(createTestSceneOperations({ store: copyless }).operations)

    const result = await limited.callTool({ name: 'duplicate_scene', arguments: { id: 'house' } })
    expect(result.isError).toBe(true)
    expect(JSON.stringify(result.content)).toContain('duplicate_unavailable')
  })
})
