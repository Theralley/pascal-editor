import { describe, expect, test } from 'bun:test'
import { defaultLevelName, levelDisplayName } from './level-display-name'

describe('levelDisplayName', () => {
  const cases: [string, { name?: string; level: number }, string, string][] = [
    ['ground', { level: 0 }, 'Ground floor', 'Bottenvåning'],
    ['floor', { name: '  ', level: 2 }, 'Floor 2', 'Våning 2'],
    ['basement', { level: -1 }, 'Basement', 'Källare'],
    ['deep basement', { level: -2 }, 'Basement 2', 'Källare 2'],
    ['old level name', { name: 'Level 1', level: 1 }, 'Floor 1', 'Våning 1'],
    ['stored english default', { name: 'Floor 1', level: 1 }, 'Floor 1', 'Våning 1'],
    ['custom name', { name: 'Attic', level: 2 }, 'Attic', 'Attic'],
    ['level number that moved', { name: 'Level 3', level: 1 }, 'Level 3', 'Level 3'],
  ]
  test.each(cases)('%s', (_label, level, en, sv) => {
    expect(levelDisplayName(level, 'en')).toBe(en)
    expect(levelDisplayName(level, 'sv')).toBe(sv)
  })

  test('defaultLevelName reads by place', () => {
    expect([-2, -1, 0, 1].map((n) => defaultLevelName(n, 'sv'))).toEqual([
      'Källare 2',
      'Källare',
      'Bottenvåning',
      'Våning 1',
    ])
  })
})
