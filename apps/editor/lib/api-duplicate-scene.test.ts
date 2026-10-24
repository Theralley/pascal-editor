import { afterAll, beforeAll, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { NextRequest } from 'next/server'

/**
 * Store and operations come from relative source imports, as in api-put-empty-guard.test.ts:
 * scene-store-server.test.ts leaves '@pascal-app/mcp/*' mocked for every file after it.
 *
 * `POST /api/scenes/[id]/duplicate` against a real SQLite store in a temp directory. Sorts before
 * scene-store-server.test.ts for the same module-mock reason as api-put-empty-guard.test.ts.
 */

const tempDir = mkdtempSync(join(tmpdir(), 'scenes-duplicate-'))
const SOURCE_ID = 'duplicate-source'
const GRAPH = {
  nodes: { n1: { id: 'n1', type: 'qa:box' } },
  rootNodeIds: ['n1'],
}

let POST: typeof import('../app/api/scenes/[id]/duplicate/route')['POST']
let restoreEnv: () => void

beforeAll(async () => {
  const saved = {
    PASCAL_DB_PATH: process.env.PASCAL_DB_PATH,
    PASCAL_SCENE_API_TOKEN: process.env.PASCAL_SCENE_API_TOKEN,
  }
  restoreEnv = () => {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
  process.env.PASCAL_DB_PATH = join(tempDir, 'pascal.db')
  delete process.env.PASCAL_SCENE_API_TOKEN

  const storeServer = await import('./scene-store-server')
  storeServer.__resetSceneStoreForTests()
  const { SqliteSceneStore } = await import('../../../packages/mcp/src/storage/sqlite-scene-store')
  const { createSceneOperations } = await import(
    '../../../packages/mcp/src/operations/scene-operations'
  )
  const store = new SqliteSceneStore({ env: process.env })
  storeServer.__setSceneStoreForTests(store, createSceneOperations({ store }))
  await store.save({ id: SOURCE_ID, name: 'Source', graph: GRAPH as never })

  const { setSceneShared } = await import('./scene-sharing')
  const { writeSceneThumbnail } = await import('./scene-thumbnails')
  await setSceneShared(SOURCE_ID, true)
  await writeSceneThumbnail(SOURCE_ID, new Uint8Array([1, 2, 3]))

  POST = (await import('../app/api/scenes/[id]/duplicate/route')).POST
})

afterAll(async () => {
  const storeServer = await import('./scene-store-server')
  const store = await storeServer.getSceneStore()
  ;(store as unknown as { close?: () => void }).close?.()
  storeServer.__resetSceneStoreForTests()
  restoreEnv()
  rmSync(tempDir, { recursive: true, force: true })
})

function duplicateRequest(id: string, body?: unknown, ifMatch?: number): NextRequest {
  return new NextRequest(`http://127.0.0.1:3000/api/scenes/${id}/duplicate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      host: '127.0.0.1:3000',
      ...(ifMatch === undefined ? {} : { 'If-Match': `"${ifMatch}"` }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

const paramsFor = (id: string) => ({ params: Promise.resolve({ id }) })

test('copies the scene and its thumbnail, but not its share', async () => {
  const response = await POST(
    duplicateRequest(SOURCE_ID, { name: 'My version' }, 1),
    paramsFor(SOURCE_ID),
  )

  expect(response.status).toBe(201)
  const copy = (await response.json()) as {
    id: string
    name: string
    version: number
    projectId: string | null
    thumbnailUrl: string | null
    forkedFrom: { id: string; version: number }
    graph?: unknown
  }
  expect(response.headers.get('Location')).toBe(`/project/${copy.id}`)
  expect(copy).toMatchObject({
    name: 'My version',
    version: 1,
    projectId: null,
    forkedFrom: { id: SOURCE_ID, version: 1 },
  })
  expect(copy.graph).toBeUndefined()
  expect(copy.thumbnailUrl).toMatch(new RegExp(`^/api/scenes/${copy.id}/thumbnail\\?t=`))

  const { isSceneShared } = await import('./scene-sharing')
  const { readSceneThumbnail } = await import('./scene-thumbnails')
  expect(await isSceneShared(copy.id)).toBe(false)
  expect(await isSceneShared(SOURCE_ID)).toBe(true)
  expect(await readSceneThumbnail(copy.id)).toEqual(new Uint8Array([1, 2, 3]))
})

test('names the copy after the source when no body is sent', async () => {
  const response = await POST(duplicateRequest(SOURCE_ID), paramsFor(SOURCE_ID))

  expect(response.status).toBe(201)
  expect(((await response.json()) as { name: string }).name).toBe('Copy of Source')
})

test('answers 404 for a missing source and 409 for a stale version or graph', async () => {
  expect((await POST(duplicateRequest('ghost'), paramsFor('ghost'))).status).toBe(404)
  expect((await POST(duplicateRequest(SOURCE_ID, {}, 9), paramsFor(SOURCE_ID))).status).toBe(409)
  const stale = await POST(
    duplicateRequest(SOURCE_ID, { expectedGraphHash: 'stale' }),
    paramsFor(SOURCE_ID),
  )
  expect(stale.status).toBe(409)
})

test('rejects a malformed body', async () => {
  const response = await POST(duplicateRequest(SOURCE_ID, { name: '' }), paramsFor(SOURCE_ID))

  expect(response.status).toBe(400)
})

test('answers 501 duplicate_unavailable when the store cannot copy', async () => {
  const storeServer = await import('./scene-store-server')
  const { createSceneOperations } = await import(
    '../../../packages/mcp/src/operations/scene-operations'
  )
  const store = await storeServer.getSceneStore()
  const operations = await storeServer.getSceneOperations()
  const copyless = Object.create(store) as typeof store
  copyless.duplicate = undefined
  storeServer.__setSceneStoreForTests(copyless, createSceneOperations({ store: copyless }))
  try {
    const response = await POST(duplicateRequest(SOURCE_ID), paramsFor(SOURCE_ID))

    expect(response.status).toBe(501)
    expect(((await response.json()) as { error: string }).error).toBe('duplicate_unavailable')
  } finally {
    storeServer.__setSceneStoreForTests(store, operations)
  }
})
