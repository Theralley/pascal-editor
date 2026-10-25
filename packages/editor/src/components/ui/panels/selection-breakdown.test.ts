import { describe, expect, test } from 'bun:test'
import { formatMessage } from '../../../i18n/messages'
import { messages } from './messages'
import type { PanelT } from './node-display'
import { formatSelectionBreakdown, selectionKind } from './selection-breakdown'

const inLocale =
  (locale: 'en' | 'sv'): PanelT =>
  (key, vars) =>
    formatMessage(messages, locale, key, vars)
const en = inLocale('en')
const sv = inLocale('sv')

describe('formatSelectionBreakdown', () => {
  test('counts per type in first-appearance order, with each noun pluralized', () => {
    expect(formatSelectionBreakdown(['slab', 'stair', 'fence', 'fence'], en)).toBe(
      '1 slab · 1 stair · 2 fences',
    )
  })

  test('names hyphenated kinds', () => {
    expect(formatSelectionBreakdown(['roof-segment', 'roof-segment', 'wall'], en)).toBe(
      '2 roof segments · 1 wall',
    )
  })

  test('skips missing nodes', () => {
    expect(formatSelectionBreakdown(['wall', undefined, null], en)).toBe('1 wall')
  })

  test('empty selection formats to an empty string', () => {
    expect(formatSelectionBreakdown([], en)).toBe('')
  })

  test('a kind the panels do not name reads "label: count" in every language', () => {
    expect(formatSelectionBreakdown(['shelf', 'shelf'], en)).toBe('shelf: 2')
    expect(formatSelectionBreakdown(['shelf', 'shelf'], sv)).toBe('shelf: 2')
  })

  test('a zone that is a room is counted as a room', () => {
    expect(selectionKind({ type: 'zone', spaceRole: 'room' })).toBe('room')
    expect(selectionKind({ type: 'zone' })).toBe('zone')
    expect(selectionKind({ type: 'wall' })).toBe('wall')
  })

  describe('in Swedish', () => {
    test.each([
      [['slab', 'stair', 'fence', 'fence'], '1 bjälklag · 1 trappa · 2 staket'],
      [['door', 'door', 'window', 'window'], '2 dörrar · 2 fönster'],
      [['roof-segment', 'stair', 'stair'], '1 takdel · 2 trappor'],
      [['room', 'room', 'zone'], '2 rum · 1 zon'],
    ])('names %j', (types, expected) => {
      expect(formatSelectionBreakdown(types, sv)).toBe(expected)
    })
  })
})
