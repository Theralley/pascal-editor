import { useViewer } from '@pascal-app/viewer'
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { renderCurrentMarkup } from '../../../../../test-utils/render-current-markup'
import { setLocale } from '../../../../../i18n'
import { ZonePanel } from '.'

describe('Zone panel in the active language', () => {
  beforeEach(() => useViewer.getState().setSelection({ levelId: null }))
  afterEach(() => setLocale('en'))

  test('asks for a level in English', () => {
    expect(renderCurrentMarkup(<ZonePanel />)).toContain('Select a level to view and create zones')
  })

  test('asks for a level in Swedish when the locale is sv', () => {
    setLocale('sv')
    const html = renderCurrentMarkup(<ZonePanel />)
    expect(html).toContain('Markera en våning för att se och skapa rum')
    expect(html).not.toContain('Select a level')
  })
})
