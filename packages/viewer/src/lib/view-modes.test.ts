// @ts-expect-error — bun:test is provided by the Bun runtime; viewer does not
// depend on @types/bun so the import type is unresolved at compile time.
import { describe, expect, test } from 'bun:test'
import type { WallMode } from '../store/use-viewer'
import { LEVEL_MODE_OPTIONS, stepWallMode, WALL_MODE_OPTIONS } from './view-modes'

describe('view modes', () => {
  test('the wall list offers every wall mode the viewer draws, once', () => {
    expect(WALL_MODE_OPTIONS.map((option) => option.value).sort()).toEqual([
      'cutaway',
      'down',
      'low',
      'translucent',
      'up',
    ])
  })

  test('the level list offers the three picks and not the one left by hand', () => {
    expect(LEVEL_MODE_OPTIONS.map((option) => option.value)).toEqual([
      'stacked',
      'exploded',
      'solo',
    ])
  })

  test.each<[WallMode, 'up' | 'down', WallMode]>([
    ['down', 'up', 'low'],
    ['low', 'up', 'cutaway'],
    ['cutaway', 'up', 'up'],
    ['up', 'up', 'up'],
    ['up', 'down', 'cutaway'],
    ['cutaway', 'down', 'low'],
    ['low', 'down', 'down'],
    ['down', 'down', 'down'],
    ['translucent', 'up', 'up'],
    ['translucent', 'down', 'low'],
  ])('%s stepped %s is %s', (mode, direction, expected) => {
    expect(stepWallMode(mode, direction)).toBe(expected)
  })
})
