import { afterEach, describe, expect, test } from 'bun:test'
import { setLocale } from '@pascal-app/editor'
import { blockErrorText } from './error-text'

describe('the edit errors a person reads', () => {
  afterEach(() => setLocale('en'))

  test.each([
    ['Select an edge to bevel', 'Select an edge to bevel', 'Markera en kant att fasa'],
    ['Edge not found: edge_a', 'Edge not found: edge_a', 'Edge not found: edge_a'],
  ])('%s', (error, english, swedish) => {
    expect(blockErrorText(error)).toBe(english)
    setLocale('sv')
    expect(blockErrorText(error)).toBe(swedish)
  })
})
