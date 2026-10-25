import { afterEach, describe, expect, test } from 'bun:test'
import { renderCurrentMarkup } from '../../../../../test-utils/render-current-markup'
import { setLocale } from '../../../../../i18n'
import { SettingsPanel } from '.'

describe('Settings in the active language', () => {
  afterEach(() => setLocale('en'))

  test('shows English labels by default', () => {
    const html = renderCurrentMarkup(<SettingsPanel />)
    expect(html).toContain('Preferences')
    expect(html).toContain('Keyboard shortcuts')
    expect(html).not.toContain('Kortkommandon')
  })

  test('shows Swedish labels when the locale is sv', () => {
    setLocale('sv')
    const html = renderCurrentMarkup(<SettingsPanel />)
    for (const label of ['Projektets enheter', 'Kortkommandon', 'Spara bygge', 'Riskzon'])
      expect(html).toContain(label)
    expect(html).not.toContain('Keyboard shortcuts')
  })

  test('offers each language by its own name, with the active one pressed', () => {
    setLocale('sv')
    const html = renderCurrentMarkup(<SettingsPanel />)
    expect(html).toContain('English')
    expect(html).toMatch(/aria-pressed="true"[^>]*>(?:<[^>]+>)*Svenska/)
  })
})
