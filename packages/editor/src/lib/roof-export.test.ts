import { afterEach, expect, test } from 'bun:test'
import { sceneRegistry, useScene } from '@pascal-app/core'
import { liveRoofs } from '@pascal-app/viewer'
import { BoxGeometry, Group, Mesh, MeshStandardMaterial } from 'three'
import { prepareSceneForExport } from './glb-export'

const sceneBefore = useScene.getState()

afterEach(() => {
  liveRoofs.update(true)
  sceneRegistry.clear()
  useScene.setState(sceneBefore)
})

function sceneWithRoofs() {
  sceneRegistry.clear()
  const level = new Group()
  const entries = [
    { id: 'roof_a', node: { type: 'roof', metadata: {} } },
    { id: 'item_roof', node: { type: 'item', metadata: { role: 'roof' } } },
    { id: 'item_chair', node: { type: 'item', metadata: {} } },
  ]
  for (const { id } of entries) {
    const group = new Group()
    const mesh = new Mesh(new BoxGeometry(1, 1, 1), new MeshStandardMaterial())
    mesh.name = `${id}-mesh`
    group.add(mesh)
    level.add(group)
    sceneRegistry.nodes.set(id, group)
  }
  level.updateMatrixWorld(true)
  sceneRegistry.nodes.set('level_a', level)
  const nodes = {
    level_a: {
      id: 'level_a',
      type: 'level',
      children: entries.map((entry) => entry.id),
      visible: true,
      metadata: {},
    },
    ...Object.fromEntries(
      entries.map(({ id, node }) => [
        id,
        { id, parentId: 'level_a', children: [], visible: true, ...node },
      ]),
    ),
  }
  useScene.setState({ nodes } as never)
  return { level, nodes }
}

test('an export taken while roofs are off keeps them, and they are hidden again after', () => {
  const { level, nodes } = sceneWithRoofs()
  liveRoofs.update(false)
  const mesh = sceneRegistry.nodes.get('roof_a')?.children[0]
  expect(mesh?.layers.isEnabled(0)).toBe(false)

  const restore = liveRoofs.lift()
  const prepared = prepareSceneForExport(level, nodes as never)
  expect(prepared.scene.getObjectByName('roof_a-mesh')).toBeDefined()
  expect(prepared.scene.getObjectByName('item_roof-mesh')).toBeDefined()
  restore()
  prepared.dispose()
  expect(mesh?.layers.isEnabled(0)).toBe(false)
})

test('the export stamps the roof role on roofs and retained roof geometry, and on nothing else', () => {
  const { level, nodes } = sceneWithRoofs()
  const prepared = prepareSceneForExport(level, nodes as never)
  const role = (id: string) => prepared.scene.getObjectByName(id)?.userData.surfaceRole
  expect([role('roof_a'), role('item_roof'), role('item_chair')]).toEqual([
    'roof',
    'roof',
    undefined,
  ])
  prepared.dispose()
})
