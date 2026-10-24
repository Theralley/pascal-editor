import { afterEach, expect, test } from 'bun:test'
import { emitter, nodeRegistry, sceneRegistry, useScene, WallNode } from '@pascal-app/core'
import { WallModeFollowCache } from '@pascal-app/viewer'
import { BoxGeometry, Group, Mesh, MeshStandardMaterial, PerspectiveCamera } from 'three'
import { preparePortableSceneFromViewer, prepareSceneForExport } from './glb-export'

const sceneBefore = useScene.getState()
const restoreRegistry = nodeRegistry._snapshot()

afterEach(() => {
  sceneRegistry.clear()
  useScene.setState(sceneBefore)
})

function hiddenGable() {
  nodeRegistry._register({
    kind: 'gable',
    schemaVersion: 1,
    capabilities: { followsWallMode: {} },
  } as never)
  sceneRegistry.clear()
  const level = new Group()
  const wall = WallNode.parse({ start: [0, 0], end: [4, 0], parentId: 'level_a' })
  const mesh = new Mesh(new BoxGeometry(1, 1, 1), new MeshStandardMaterial())
  mesh.name = 'gable-mesh'
  mesh.position.set(10, 0, 0)
  const group = new Group()
  group.add(mesh)
  level.add(group)
  level.updateMatrixWorld(true)
  sceneRegistry.nodes.set('level_a', level)
  sceneRegistry.nodes.set('gable_a', group)
  sceneRegistry.byType.gable ??= new Set()
  sceneRegistry.byType.gable.add('gable_a')
  const nodes = {
    level_a: { id: 'level_a', type: 'level', children: [wall.id, 'gable_a'] },
    [wall.id]: wall,
    gable_a: { id: 'gable_a', type: 'gable', parentId: 'level_a', children: [] },
  }
  useScene.setState({ nodes } as never)
  const cache = new WallModeFollowCache({
    getState: () => ({ wallMode: 'down', geometryRevision: 0 }),
  })
  cache.update(new PerspectiveCamera())
  return { level, nodes, mesh, cache }
}

test('an export taken while walls are down still holds the hidden follower, which is hidden again after', () => {
  const { level, nodes, mesh, cache } = hiddenGable()
  expect(mesh.layers.isEnabled(0)).toBe(false)
  cache.beforeCapture({ exporting: true })
  const prepared = prepareSceneForExport(level, nodes as never)
  expect(prepared.scene.getObjectByName('gable-mesh')).toBeDefined()
  cache.afterCapture()
  prepared.dispose()
  expect(mesh.layers.isEnabled(0)).toBe(false)
  cache.dispose()
  restoreRegistry()
})

test('model exports ask for the whole building when they open the capture window', async () => {
  const events: unknown[] = []
  const listen = (event: unknown) => events.push(event)
  emitter.on('thumbnail:before-capture', listen as never)
  try {
    await preparePortableSceneFromViewer(new Group(), {}).catch(() => undefined)
  } finally {
    emitter.off('thumbnail:before-capture', listen as never)
  }
  expect(events).toEqual([{ exporting: true }])
})
