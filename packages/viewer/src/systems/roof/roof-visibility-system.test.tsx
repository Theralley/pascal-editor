import { afterEach, beforeEach, expect, test } from 'bun:test'
import { type AnyNode, type AnyNodeId, emitter, sceneRegistry, useScene } from '@pascal-app/core'
import { create } from '@react-three/test-renderer'
import { createElement } from 'react'
import { Object3D } from 'three'
import { SCENE_LAYER } from '../../lib/layers'
import { isRoofHidden, liveRoofs } from '../../lib/roof-visibility'
import useViewer from '../../store/use-viewer'
import { RoofVisibilitySystem } from './roof-visibility-system'

const roofNode = (id: string, children: string[] = []) =>
  ({
    object: 'node',
    id,
    type: 'roof',
    parentId: null,
    visible: true,
    metadata: {},
    children,
  }) as unknown as AnyNode

function addRoof(id: string) {
  const roof = new Object3D()
  roof.layers.set(SCENE_LAYER)
  sceneRegistry.nodes.set(id, roof)
  useScene.setState({
    nodes: { ...useScene.getState().nodes, [id]: roofNode(id) } as Record<AnyNodeId, AnyNode>,
  })
  return roof
}

const shown = (object: Object3D) => object.layers.isEnabled(SCENE_LAYER)

beforeEach(() => useScene.setState({ nodes: {} as Record<AnyNodeId, AnyNode> }))
afterEach(() => {
  liveRoofs.update(true)
  sceneRegistry.clear()
  useViewer.setState({ showRoofs: true })
})

test('roofs go with the toggle, a roof built while they are off is held, and a capture sees them all', async () => {
  const first = addRoof('roof_a')
  const renderer = await create(createElement(RoofVisibilitySystem))
  try {
    await renderer.advanceFrames(1, 1 / 60)
    expect(shown(first)).toBe(true)

    useViewer.setState({ showRoofs: false })
    await renderer.advanceFrames(1, 1 / 60)
    expect(shown(first)).toBe(false)
    expect(isRoofHidden('roof_a')).toBe(true)

    // Drawn, or remounted, while the roofs are off.
    const mesh = new Object3D()
    mesh.layers.set(SCENE_LAYER)
    first.add(mesh)
    const second = addRoof('roof_b')
    await renderer.advanceFrames(1, 1 / 60)
    expect([shown(mesh), shown(second)]).toEqual([false, false])

    emitter.emit('thumbnail:before-capture', { exporting: true })
    expect([shown(first), shown(mesh), shown(second)]).toEqual([true, true, true])
    emitter.emit('thumbnail:after-capture', undefined)
    expect([shown(first), shown(mesh), shown(second)]).toEqual([false, false, false])

    useViewer.setState({ showRoofs: true })
    await renderer.advanceFrames(1, 1 / 60)
    expect([shown(first), shown(mesh), shown(second)]).toEqual([true, true, true])
    expect(isRoofHidden('roof_a')).toBe(false)
  } finally {
    await renderer.unmount()
  }
})

test('a capture that never reports its end does not leave the roofs shown', async () => {
  const roof = addRoof('roof_a')
  useViewer.setState({ showRoofs: false })
  const renderer = await create(createElement(RoofVisibilitySystem))
  try {
    await renderer.advanceFrames(1, 1 / 60)
    emitter.emit('thumbnail:before-capture', { exporting: true })
    expect(shown(roof)).toBe(true)
    await renderer.advanceFrames(1, 1 / 60)
    expect(shown(roof)).toBe(false)
  } finally {
    await renderer.unmount()
  }
})

test.each([
  ['an export', { exporting: true }, true],
  ['a capture of whole walls', { wholeWalls: true }, true],
  ['the finished-house picture', { finished: true }, true],
  ["the person's own snapshot", undefined, false],
  ['an evidence crop', {}, false],
])('%s shows the roofs: %p', async (_, event, lifted) => {
  const roof = addRoof('roof_a')
  useViewer.setState({ showRoofs: false })
  const renderer = await create(createElement(RoofVisibilitySystem))
  try {
    await renderer.advanceFrames(1, 1 / 60)
    emitter.emit('thumbnail:before-capture', event)
    expect(shown(roof)).toBe(lifted)
    emitter.emit('thumbnail:after-capture', undefined)
    expect(shown(roof)).toBe(false)
  } finally {
    await renderer.unmount()
  }
})

test('a roof mounted as another object unregisters is held too', async () => {
  const other = new Object3D()
  sceneRegistry.nodes.set('chair', other)
  const first = addRoof('roof_a')
  useViewer.setState({ showRoofs: false })
  const renderer = await create(createElement(RoofVisibilitySystem))
  try {
    await renderer.advanceFrames(1, 1 / 60)
    sceneRegistry.nodes.delete('chair')
    const second = addRoof('roof_b')
    await renderer.advanceFrames(1, 1 / 60)
    expect([shown(first), shown(second)]).toEqual([false, false])
  } finally {
    await renderer.unmount()
  }
})
