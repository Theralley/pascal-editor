import { Database } from 'bun:sqlite'
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import type { SceneGraph } from '@pascal-app/core/clone-scene-graph'
import {
  resolveDefaultDatabasePath,
  SqliteSceneStore,
  type SqliteSceneStoreOptions,
} from './sqlite-scene-store'
import {
  SceneInvalidError,
  SceneNotFoundError,
  SceneTooLargeError,
  SceneVersionConflictError,
} from './types'

function makeGraph(overrides: Partial<SceneGraph> = {}): SceneGraph {
  return {
    nodes: {
      site_abc: {
        object: 'node',
        id: 'site_abc',
        type: 'site',
        parentId: null,
        visible: true,
        metadata: {},
      },
      building_def: {
        object: 'node',
        id: 'building_def',
        type: 'building',
        parentId: 'site_abc',
        visible: true,
        metadata: {},
      },
    } as SceneGraph['nodes'],
    rootNodeIds: ['site_abc'] as SceneGraph['rootNodeIds'],
    ...overrides,
  }
}

async function mkTmpRoot(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'pascal-sqlite-test-'))
}

async function rmrf(p: string): Promise<void> {
  await fs.rm(p, { recursive: true, force: true })
}

function createStore(rootDir: string, opts: Partial<SqliteSceneStoreOptions> = {}) {
  return new SqliteSceneStore({
    databasePath: path.join(rootDir, 'pascal.db'),
    ...opts,
  })
}

describe('resolveDefaultDatabasePath', () => {
  test('respects PASCAL_DB_PATH when set', () => {
    expect(resolveDefaultDatabasePath({ PASCAL_DB_PATH: '/tmp/custom.db' })).toBe('/tmp/custom.db')
  })

  test('resolves PASCAL_DATA_DIR to pascal.db', () => {
    expect(resolveDefaultDatabasePath({ PASCAL_DATA_DIR: '/tmp/pascal-data' })).toBe(
      path.join('/tmp/pascal-data', 'pascal.db'),
    )
  })

  test('falls back to XDG_DATA_HOME on Unix', () => {
    if (process.platform === 'win32') return
    expect(resolveDefaultDatabasePath({ XDG_DATA_HOME: '/xdg/share' })).toBe(
      path.join('/xdg/share', 'pascal', 'data', 'pascal.db'),
    )
  })

  test('falls back to homedir + .pascal/data/pascal.db', () => {
    if (process.platform === 'win32') return
    expect(resolveDefaultDatabasePath({}).endsWith(path.join('.pascal', 'data', 'pascal.db'))).toBe(
      true,
    )
  })
})

describe('SqliteSceneStore', () => {
  let rootDir: string
  let store: SqliteSceneStore

  beforeEach(async () => {
    rootDir = await mkTmpRoot()
    store = createStore(rootDir)
  })

  afterEach(async () => {
    store.close()
    await rmrf(rootDir)
  })

  test('backend is "sqlite"', () => {
    expect(store.backend).toBe('sqlite')
  })

  test('round-trips a saved scene through a reopened database', async () => {
    const graph = makeGraph()
    const saved = await store.save({ id: 'kitchen', name: 'Kitchen', graph })

    expect(saved.id).toBe('kitchen')
    expect(saved.version).toBe(1)
    expect(saved.nodeCount).toBe(2)
    expect(saved.sizeBytes).toBe(Buffer.byteLength(JSON.stringify(graph), 'utf8'))

    store.close()
    store = createStore(rootDir)

    const loaded = await store.load('kitchen')
    expect(loaded).not.toBeNull()
    expect(loaded!.graph).toEqual(graph)
    expect(loaded!.name).toBe('Kitchen')
  })

  // `GraphSchema` strips any key it doesn't name, so a field missing from it
  // is dropped on load without an error — the save looks like it worked.
  test('round-trips collections, materials and installed plugins', async () => {
    const graph = makeGraph({
      collections: {
        collection_1: { id: 'collection_1', name: 'Refs', nodeIds: ['site_abc'] },
      } as SceneGraph['collections'],
      materials: {
        mat_1: { id: 'mat_1', name: 'Oak', material: { preset: 'wood' } },
      } as SceneGraph['materials'],
      installedPlugins: ['pascal:trees'],
    })
    await store.save({ id: 'full', name: 'Full', graph })

    store.close()
    store = createStore(rootDir)

    expect((await store.load('full'))?.graph).toEqual(graph)
  })

  // Nothing validates a graph on the way in, and `parseGraph` throws on a
  // shape mismatch, so a strict read schema would make an odd stored value
  // permanently unloadable rather than merely odd.
  test('loads a stored scene whose material does not match the strict schema', async () => {
    const graph = makeGraph({
      materials: {
        mat_1: { id: 'mat_1', material: { texture: { url: 'ftp://host/a.png' } } },
      } as unknown as SceneGraph['materials'],
    })
    await store.save({ id: 'odd', name: 'Odd', graph })

    expect((await store.load('odd'))?.graph).toEqual(graph)
  })

  test('stores optional metadata verbatim', async () => {
    await store.save({
      id: 'meta-test',
      name: 'Meta',
      graph: makeGraph(),
      projectId: 'proj-1',
      ownerId: 'user-42',
      thumbnailUrl: 'https://example.com/t.png',
    })

    const loaded = await store.load('meta-test')
    expect(loaded?.projectId).toBe('proj-1')
    expect(loaded?.ownerId).toBe('user-42')
    expect(loaded?.thumbnailUrl).toBe('https://example.com/t.png')
  })

  test('generates ids for new scenes and rejects explicit slug collisions', async () => {
    const a = await store.save({ name: 'A', graph: makeGraph() })
    const b = await store.save({ name: 'B', graph: makeGraph() })
    expect(a.id).not.toBe(b.id)

    await store.save({ id: 'kitchen', name: 'K1', graph: makeGraph() })
    await expect(store.save({ id: 'kitchen', name: 'K2', graph: makeGraph() })).rejects.toThrow(
      SceneInvalidError,
    )
  })

  test('sanitizes explicit ids', async () => {
    const meta = await store.save({ id: '../My Kitchen!', name: 'Kitchen', graph: makeGraph() })
    expect(meta.id).toBe('my-kitchen')
    expect(await store.load('my-kitchen')).not.toBeNull()
  })

  test('increments version and preserves createdAt on overwrite', async () => {
    const first = await store.save({ id: 'bump', name: 'Bump', graph: makeGraph() })
    await new Promise((resolve) => setTimeout(resolve, 5))
    const second = await store.save({
      id: 'bump',
      name: 'Bump 2',
      graph: makeGraph(),
      expectedVersion: 1,
    })

    expect(second.version).toBe(2)
    expect(second.createdAt).toBe(first.createdAt)
    expect(second.updatedAt >= first.updatedAt).toBe(true)
  })

  test('enforces optimistic locking for save, rename, and delete', async () => {
    await store.save({ id: 'locked', name: 'Locked', graph: makeGraph() })

    await expect(
      store.save({ id: 'locked', name: 'Locked', graph: makeGraph(), expectedVersion: 99 }),
    ).rejects.toThrow(SceneVersionConflictError)
    await expect(store.rename('locked', 'New', { expectedVersion: 99 })).rejects.toThrow(
      SceneVersionConflictError,
    )
    await expect(store.delete('locked', { expectedVersion: 99 })).rejects.toThrow(
      SceneVersionConflictError,
    )
  })

  test('expectedVersion=0 creates a brand-new explicit id', async () => {
    const meta = await store.save({
      id: 'fresh',
      name: 'Fresh',
      graph: makeGraph(),
      expectedVersion: 0,
    })
    expect(meta.version).toBe(1)
  })

  test('lists newest first and supports project, owner, and limit filters', async () => {
    await store.save({ id: 'a', name: 'A', graph: makeGraph(), projectId: 'p1', ownerId: 'u1' })
    await new Promise((resolve) => setTimeout(resolve, 5))
    await store.save({ id: 'b', name: 'B', graph: makeGraph(), projectId: 'p2', ownerId: 'u1' })
    await new Promise((resolve) => setTimeout(resolve, 5))
    await store.save({ id: 'c', name: 'C', graph: makeGraph(), projectId: 'p1', ownerId: 'u2' })

    expect((await store.list()).map((m) => m.id)).toEqual(['c', 'b', 'a'])
    expect((await store.list({ projectId: 'p1' })).map((m) => m.id)).toEqual(['c', 'a'])
    expect((await store.list({ ownerId: 'u1' })).map((m) => m.id)).toEqual(['b', 'a'])
    expect((await store.list({ limit: 2 })).map((m) => m.id)).toEqual(['c', 'b'])
  })

  test('rename writes a revision row and delete cascades revisions', async () => {
    await store.save({ id: 'rev', name: 'Rev', graph: makeGraph() })
    await store.rename('rev', 'Renamed', { expectedVersion: 1 })

    const dbPath = path.join(rootDir, 'pascal.db')
    const db = new Database(dbPath)
    try {
      const beforeDelete = db
        .query('SELECT COUNT(*) AS count FROM scene_revisions WHERE scene_id = ?')
        .get('rev') as { count: number }
      expect(beforeDelete.count).toBe(2)
    } finally {
      db.close()
    }

    expect(await store.delete('rev', { expectedVersion: 2 })).toEqual({
      deleted: true,
      hidden: false,
    })

    const reopened = new Database(dbPath)
    try {
      const afterDelete = reopened
        .query('SELECT COUNT(*) AS count FROM scene_revisions WHERE scene_id = ?')
        .get('rev') as { count: number }
      expect(afterDelete.count).toBe(0)
    } finally {
      reopened.close()
    }
  })

  test('duplicate copies the graph into a private scene that records its origin', async () => {
    await store.save({ id: 'src', name: 'Source', ownerId: 'alice', graph: makeGraph() })
    const saved = await store.save({
      id: 'src',
      name: 'Source',
      projectId: 'proj',
      thumbnailUrl: 'https://example.test/t.webp',
      graph: makeGraph(),
      expectedVersion: 1,
    })

    const copy = await store.duplicate('src', { ownerId: 'bob', expectedVersion: 2 })

    expect(copy.id).not.toBe('src')
    expect(copy).toMatchObject({
      name: 'Copy of Source',
      projectId: null,
      thumbnailUrl: null,
      ownerId: 'bob',
      version: 1,
      nodeCount: saved.nodeCount,
      graphHash: saved.graphHash,
      forkedFrom: { id: 'src', version: 2, name: 'Source' },
    })
    expect((await store.load(copy.id))?.graph).toEqual(makeGraph())
    expect(await store.load('src')).toMatchObject({
      version: 2,
      forkedFrom: null,
      projectId: 'proj',
    })
    expect((await store.list()).find((meta) => meta.id === copy.id)?.forkedFrom).toEqual({
      id: 'src',
      version: 2,
      name: 'Source',
    })
    expect(await store.duplicate('src', { name: 'Mine' })).toMatchObject({ name: 'Mine' })

    await store.delete('src')
    expect((await store.load(copy.id))?.forkedFrom).toEqual({ id: 'src', version: 2, name: null })
  })

  test('duplicate rejects a stale version or graph, a missing source and a bad name', async () => {
    const saved = await store.save({ id: 'src', name: 'Source', graph: makeGraph() })

    await expect(store.duplicate('src', { expectedVersion: 9 })).rejects.toBeInstanceOf(
      SceneVersionConflictError,
    )
    await expect(store.duplicate('src', { expectedGraphHash: 'stale' })).rejects.toBeInstanceOf(
      SceneVersionConflictError,
    )
    await expect(
      store.duplicate('src', { expectedGraphHash: saved.graphHash }),
    ).resolves.toBeDefined()
    await expect(store.duplicate('ghost')).rejects.toBeInstanceOf(SceneNotFoundError)
    await expect(store.duplicate('src', { name: ' ' })).rejects.toBeInstanceOf(SceneInvalidError)
    expect(await store.list()).toHaveLength(2)
  })

  test('duplicate caps the default name and starts a history of its own', async () => {
    const longName = 'x'.repeat(200)
    await store.save({ id: 'src', name: longName, graph: makeGraph() })

    const copy = await store.duplicate('src')

    expect(copy.name).toHaveLength(200)
    expect(copy.name.startsWith('Copy of ')).toBe(true)
    const db = new Database(path.join(rootDir, 'pascal.db'))
    try {
      const revisions = db
        .query('SELECT version FROM scene_revisions WHERE scene_id = ?')
        .all(copy.id)
      expect(revisions).toEqual([{ version: 1 }])
    } finally {
      db.close()
    }
  })

  test('opens a database made before scenes recorded their origin, even when several processes open it at once', async () => {
    const dbPath = path.join(rootDir, 'legacy.db')
    const legacy = new Database(dbPath)
    legacy.exec(`
      CREATE TABLE scenes (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        project_id TEXT,
        owner_id TEXT,
        thumbnail_url TEXT,
        version INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        size_bytes INTEGER NOT NULL,
        node_count INTEGER NOT NULL,
        graph_json TEXT NOT NULL
      );
      CREATE TABLE scene_revisions (
        scene_id TEXT NOT NULL,
        version INTEGER NOT NULL,
        graph_json TEXT NOT NULL,
        author_kind TEXT NOT NULL,
        author_id TEXT,
        created_at TEXT NOT NULL,
        PRIMARY KEY (scene_id, version)
      );
    `)
    legacy
      .query(`INSERT INTO scenes VALUES ('old', 'Old', NULL, NULL, NULL, 3, 't', 't', 10, 2, ?)`)
      .run(JSON.stringify(makeGraph()))
    legacy.close()

    // Each process migrates on its own connection, so the race is only real across processes.
    const script = `
      const { SqliteSceneStore } = await import(process.argv[1])
      const store = new SqliteSceneStore({ databasePath: process.argv[2] })
      const scene = await store.load('old')
      const copy = await store.duplicate('old')
      store.close()
      console.log(JSON.stringify({ name: scene.name, version: scene.version, forkedFrom: copy.forkedFrom }))
    `
    const modulePath = path.join(import.meta.dir, 'sqlite-scene-store.ts')
    const children = Array.from({ length: 4 }, () =>
      Bun.spawn([process.execPath, '-e', script, modulePath, dbPath], {
        stdout: 'pipe',
        stderr: 'pipe',
      }),
    )
    for (const child of children) {
      expect(await child.exited).toBe(0)
      expect(JSON.parse(await new Response(child.stdout).text())).toEqual({
        name: 'Old',
        version: 3,
        forkedFrom: { id: 'old', version: 3, name: 'Old' },
      })
    }
    const reopened = new SqliteSceneStore({ databasePath: dbPath })
    try {
      expect(await reopened.list()).toHaveLength(5)
    } finally {
      reopened.close()
    }
  })

  test('appends and lists scene events in order', async () => {
    const graph = makeGraph()
    const meta = await store.save({ id: 'live', name: 'Live', graph })
    const first = await store.appendSceneEvent({
      sceneId: meta.id,
      version: meta.version,
      kind: 'save_scene',
      graph,
    })
    const updatedGraph = makeGraph({
      nodes: {
        ...graph.nodes,
        wall_new: {
          object: 'node',
          id: 'wall_new',
          type: 'wall',
          parentId: 'building_def',
          visible: true,
          metadata: {},
          children: [],
          start: [0, 0],
          end: [1, 0],
          thickness: 0.1,
          height: 2.5,
          frontSide: 'unknown',
          backSide: 'unknown',
        },
      } as SceneGraph['nodes'],
    })
    const second = await store.appendSceneEvent({
      sceneId: meta.id,
      version: meta.version,
      kind: 'create_wall',
      graph: updatedGraph,
    })

    expect(second.eventId).toBeGreaterThan(first.eventId)
    expect((await store.listSceneEvents('live')).map((event) => event.kind)).toEqual([
      'save_scene',
      'create_wall',
    ])
    const afterFirst = await store.listSceneEvents('live', { afterEventId: first.eventId })
    expect(afterFirst).toHaveLength(1)
    expect(afterFirst[0]!.eventId).toBe(second.eventId)
    expect(afterFirst[0]!.graph.nodes.wall_new).toBeDefined()
  })

  test('validates name and scene size', async () => {
    await expect(store.save({ name: '', graph: makeGraph() })).rejects.toThrow(SceneInvalidError)
    await expect(store.save({ name: 'x'.repeat(201), graph: makeGraph() })).rejects.toThrow(
      SceneInvalidError,
    )

    const tinyStore = createStore(rootDir, {
      databasePath: path.join(rootDir, 'tiny.db'),
      maxSceneBytes: 100,
    })
    try {
      await expect(tinyStore.save({ id: 'big', name: 'Big', graph: makeGraph() })).rejects.toThrow(
        SceneTooLargeError,
      )
    } finally {
      tinyStore.close()
    }
  })

  test('load returns null for missing scenes and errors on corrupt graph rows', async () => {
    expect(await store.load('missing')).toBeNull()

    const db = new Database(path.join(rootDir, 'pascal.db'), { create: true })
    try {
      db.exec(`
        CREATE TABLE IF NOT EXISTS scenes (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          project_id TEXT,
          owner_id TEXT,
          thumbnail_url TEXT,
          version INTEGER NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          size_bytes INTEGER NOT NULL,
          node_count INTEGER NOT NULL,
          graph_json TEXT NOT NULL
        );
      `)
      db.query(
        `INSERT INTO scenes (
           id, name, version, created_at, updated_at, size_bytes, node_count, graph_json
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run('bad', 'Bad', 1, '2024-01-01T00:00:00.000Z', '2024-01-01T00:00:00.000Z', 2, 0, '{}')
    } finally {
      db.close()
    }

    await expect(store.load('bad')).rejects.toThrow(SceneInvalidError)
  })
})
