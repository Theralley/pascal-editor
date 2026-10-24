import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { sceneRegistry, useScene } from '@pascal-app/core'
import { Group, Mesh } from 'three'
import {
  HIDDEN_FOLLOWER_SELECTION_EPSILON,
  hiddenFollowerOutrankedOnRay,
  hiddenFollowerPointerSuppressed,
} from './hidden-follower-pointer'

const sceneBefore = useScene.getState()

beforeEach(() => {
  sceneRegistry.clear()
})

afterEach(() => {
  sceneRegistry.clear()
  useScene.setState(sceneBefore)
})

describe('hiddenFollowerOutrankedOnRay', () => {
  test.each([
    ['nothing else on the ray', 5, [], false],
    [
      'a selectable well behind',
      5,
      [{ distance: 5 + HIDDEN_FOLLOWER_SELECTION_EPSILON + 1, hosted: false }],
      false,
    ],
    ['a selectable in front', 5, [{ distance: 4, hosted: false }], true],
    ['a selectable at about the same depth', 5, [{ distance: 5.2, hosted: false }], true],
    ['something hosted, however deep', 5, [{ distance: 9, hosted: true }], true],
  ] as const)('%s', (_name, own, hits, expected) => {
    expect(hiddenFollowerOutrankedOnRay(own, hits)).toBe(expected)
  })
})

describe('hiddenFollowerPointerSuppressed', () => {
  function rig() {
    const self = new Group()
    const selfMesh = new Mesh()
    self.add(selfMesh)
    const other = new Group()
    const otherMesh = new Mesh()
    other.add(otherMesh)
    sceneRegistry.nodes.set('block_a', self)
    sceneRegistry.nodes.set('item_a', other)
    useScene.setState({
      nodes: { block_a: { id: 'block_a', type: 'block' }, item_a: { id: 'item_a', type: 'item' } },
    } as never)
    return { selfMesh, otherMesh }
  }
  const call = (event: unknown, extra: { hidden?: boolean; hoverHighlightMode?: string } = {}) =>
    hiddenFollowerPointerSuppressed({
      nodeId: 'block_a',
      hidden: true,
      hoverHighlightMode: 'default',
      event,
      ...extra,
    })

  test('a visible node never yields', () => {
    const { selfMesh } = rig()
    expect(call({ distance: 3, object: selfMesh, intersections: [] }, { hidden: false })).toBe(
      false,
    )
  })

  test('a hidden node yields to a selectable in front and keeps events with nothing in front', () => {
    const { selfMesh, otherMesh } = rig()
    const own = { distance: 5, object: selfMesh }
    expect(call({ ...own, intersections: [{ distance: 2, object: otherMesh }, own] })).toBe(true)
    expect(call({ ...own, intersections: [own, { distance: 9, object: otherMesh }] })).toBe(false)
  })

  test('an event without ray data stays transparent, and delete hover keeps every event', () => {
    const { selfMesh } = rig()
    expect(call({})).toBe(true)
    expect(
      call({ distance: 3, object: selfMesh, intersections: [] }, { hoverHighlightMode: 'delete' }),
    ).toBe(false)
  })
})
