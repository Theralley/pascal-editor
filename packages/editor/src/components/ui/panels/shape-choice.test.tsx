import { afterEach, describe, expect, test } from 'bun:test'
import { renderCurrentMarkup } from '../../../test-utils/render-current-markup'
import { setLocale } from '../../../i18n'
import { ShapeChoice } from './shape-choice'

describe('ShapeChoice in the active language', () => {
  afterEach(() => setLocale('en'))

  test('offers the two outline shapes in English', () => {
    const html = renderCurrentMarkup(<ShapeChoice label="Cut opening" onPick={() => {}} />)
    expect(html).toContain('Rectangle')
    expect(html).toContain('Polygon')
  })

  test('offers them in Swedish when the locale is sv', () => {
    setLocale('sv')
    const html = renderCurrentMarkup(<ShapeChoice label="Gör öppning" onPick={() => {}} />)
    expect(html).toContain('Rektangel')
    expect(html).not.toContain('Rectangle')
  })
})
