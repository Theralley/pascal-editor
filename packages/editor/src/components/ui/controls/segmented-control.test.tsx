import { describe, expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { arrowTarget, SegmentedControl } from './segmented-control'

const options = [
  { label: 'Up', value: 'up' },
  { label: 'Cutaway', value: 'cutaway' },
  { label: 'Down', value: 'down' },
]

describe('SegmentedControl', () => {
  test('a named control is a radio group whose selected option is the one in the tab order', () => {
    const markup = renderToStaticMarkup(
      <SegmentedControl aria-label="Walls" onChange={() => {}} options={options} radio value="cutaway" />,
    )
    expect(markup).toContain('role="radiogroup"')
    expect(markup).toContain('aria-label="Walls"')
    expect(markup.match(/role="radio"/g)).toHaveLength(3)
    expect(markup).toMatch(/aria-checked="true"[^>]*tabindex="0"[^>]*>(<span[^>]*>)?Cutaway/)
    expect(markup.match(/tabindex="-1"/g)).toHaveLength(2)
  })

  test('with nothing selected the first option that can be chosen takes the tab stop', () => {
    const markup = renderToStaticMarkup(
      <SegmentedControl
        aria-label="Levels"
        mixed
        onChange={() => {}}
        options={[{ ...options[0]!, disabled: true }, options[1]!, options[2]!]}
        radio
        value="up"
      />,
    )
    expect(markup).not.toContain('aria-checked="true"')
    expect(markup).toMatch(/tabindex="0"[^>]*>(<span[^>]*>)?Cutaway/)
  })

  test('a control that is not a radio group keeps its options as toggle buttons', () => {
    const markup = renderToStaticMarkup(
      <SegmentedControl aria-label="Speed" onChange={() => {}} options={options} value="up" />,
    )
    expect(markup).not.toContain('radiogroup')
    expect(markup).toContain('role="group"')
    expect(markup).toContain('aria-pressed="true"')
  })

  test.each([
    [0, 'ArrowRight', 1],
    [2, 'ArrowRight', 0],
    [0, 'ArrowLeft', 2],
    [1, 'ArrowDown', 2],
    [1, 'ArrowUp', 0],
    [1, 'Enter', null],
  ])('from option %i, %s goes to %p', (from, key, expected) => {
    expect(arrowTarget(options, from, key)).toBe(expected)
  })

  test('arrow keys skip an option that cannot be chosen', () => {
    const withGap = [options[0]!, { ...options[1]!, disabled: true }, options[2]!]
    expect(arrowTarget(withGap, 0, 'ArrowRight')).toBe(2)
    expect(arrowTarget(withGap, 2, 'ArrowLeft')).toBe(0)
  })
})
