import { describe, expect, test } from 'bun:test'
import { nextProjectNumber } from './next-project-number'

describe('nextProjectNumber', () => {
  test.each([
    [[], 1],
    [['Project #1', 'Project #4'], 5],
    [['Projekt #7'], 8],
    [['Project #2', 'Projekt #9', 'Villa'], 10],
    [['Villa', 'Garage'], 3],
    [['Projekt #x', 'Project #3 extra'], 3],
  ] as const)('%j gives %i', (names, expected) => {
    expect(nextProjectNumber([...names])).toBe(expected)
  })
})
