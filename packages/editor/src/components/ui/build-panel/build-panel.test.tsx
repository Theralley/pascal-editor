import { afterEach, describe, expect, test } from 'bun:test'
import { renderCurrentMarkup } from '../../../test-utils/render-current-markup'
import { setLocale } from '../../../i18n'
import { BuildPanelRoomsSection } from './build-panel'

describe('Build panel rooms in the active language', () => {
  afterEach(() => setLocale('en'))

  test('names the wall drawing variants in English', () => {
    const html = renderCurrentMarkup(
      <BuildPanelRoomsSection activeVariant={null} onSelect={() => {}} />,
    )
    for (const text of ['Rooms', 'Rectangle', 'Polygon', 'Pick a shape to start'])
      expect(html).toContain(text)
  })

  test('names them in Swedish when the locale is sv', () => {
    setLocale('sv')
    const html = renderCurrentMarkup(
      <BuildPanelRoomsSection activeVariant="rectangle" onSelect={() => {}} />,
    )
    for (const text of ['Rum', 'Rektangel', 'Klicka på två hörn'])
      expect(html).toContain(text)
    expect(html).not.toContain('Rectangle')
  })
})
