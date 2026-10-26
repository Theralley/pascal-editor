import { afterEach, describe, expect, test } from 'bun:test'
import { renderCurrentMarkup } from '../test-utils/render-current-markup'
import { definitionText, useDefinitionText } from './definition-text'
import { setLocale } from './locale'

const definition = { translations: { sv: { Door: 'Dörr', Cancel: 'Avbryt' } } }

afterEach(() => setLocale('en'))

describe('definitionText', () => {
  test('looks the English source text up in the locale, else keeps it', () => {
    const cases = [
      { locale: 'sv', text: 'Door', expected: 'Dörr' },
      { locale: 'sv', text: 'Window', expected: 'Window' },
      { locale: 'en', text: 'Door', expected: 'Door' },
      { locale: 'sv', text: 'constructor', expected: 'constructor' },
    ] as const
    for (const { locale, text, expected } of cases)
      expect(definitionText(definition, text, locale)).toBe(expected)
  })

  test('a definition without translations, or none at all, keeps the text', () => {
    expect(definitionText({}, 'Door', 'sv')).toBe('Door')
    expect(definitionText(undefined, 'Door', 'sv')).toBe('Door')
  })

  test('reads the active locale when none is given', () => {
    expect(definitionText(definition, 'Door')).toBe('Door')
    setLocale('sv')
    expect(definitionText(definition, 'Door')).toBe('Dörr')
  })
})

describe('useDefinitionText', () => {
  function Label() {
    const defText = useDefinitionText()
    return <span>{defText(definition, 'Cancel')}</span>
  }

  test('follows the active locale', () => {
    expect(renderCurrentMarkup(<Label />)).toBe('<span>Cancel</span>')
    setLocale('sv')
    expect(renderCurrentMarkup(<Label />)).toBe('<span>Avbryt</span>')
  })
})
