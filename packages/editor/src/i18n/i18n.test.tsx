import { afterEach, describe, expect, test } from 'bun:test'
import { renderCurrentMarkup } from '../test-utils/render-current-markup'
import {
  detectLocale,
  getLocale,
  hydrateLocale,
  localeStore,
  resolveInitialLocale,
  setLocale,
} from './locale'
import { defineMessages } from './messages'
import { translate, useT } from './use-t'

const messages = defineMessages({
  en: {
    greeting: 'Hello {name}',
    floors: { one: '{count} floor', other: '{count} floors' },
    save: 'Save',
    width: '{n} m',
    needs: 'Needs <link>the add-on</link> now',
  },
  sv: {
    greeting: 'Hej {name}',
    floors: { one: '{count} våning', other: '{count} våningar' },
    save: 'Spara',
    width: '{n} m',
    needs: 'Kräver <link>tillägget</link> nu',
  },
})

// Compile-time fixtures: the type check is the test.
export const incomplete = defineMessages({
  en: { save: 'Save', cancel: 'Cancel' },
  // @ts-expect-error `cancel` is missing from `sv`
  sv: { save: 'Spara' },
})

export const surplus = defineMessages({
  en: { save: 'Save' },
  // @ts-expect-error `cancel` is not a key of `en`
  sv: { save: 'Spara', cancel: 'Avbryt' },
})

afterEach(() => setLocale('en'))

describe('translate', () => {
  test('reads the active locale and interpolates {name}', () => {
    expect(translate(messages, 'greeting', { name: 'Ada' })).toBe('Hello Ada')
    setLocale('sv')
    expect(translate(messages, 'greeting', { name: 'Ada' })).toBe('Hej Ada')
  })

  test('picks the plural form from count', () => {
    const cases = [
      ['en', 1, '1 floor'],
      ['en', 2, '2 floors'],
      ['sv', 1, '1 våning'],
      ['sv', 0, '0 våningar'],
      ['sv', 3, '3 våningar'],
    ] as const
    for (const [locale, count, expected] of cases) {
      setLocale(locale)
      expect(translate(messages, 'floors', { count })).toBe(expected)
    }
  })

  test('leaves a placeholder without a value as written', () => {
    expect(translate(messages, 'greeting', {})).toBe('Hello {name}')
  })

  test('formats a number in the active language', () => {
    expect(translate(messages, 'width', { n: 1.5 })).toBe('1.5 m')
    setLocale('sv')
    expect(translate(messages, 'width', { n: 1.5 })).toBe('1,5 m')
  })

  test('accepts only catalogs made by defineMessages', () => {
    // @ts-expect-error a hand-written catalog has no brand
    translate({ en: { save: 'Save' }, sv: { cancel: 'Avbryt' } }, 'save')
  })
})

describe('useT', () => {
  function Label() {
    const t = useT(messages)
    return <span>{t('save')}</span>
  }

  test('renders the catalog in the active locale', () => {
    expect(renderCurrentMarkup(<Label />)).toBe('<span>Save</span>')
    setLocale('sv')
    expect(renderCurrentMarkup(<Label />)).toBe('<span>Spara</span>')
  })
})

describe('rich messages', () => {
  function Rich() {
    const t = useT(messages)
    return <p>{t.rich('needs', { link: (text) => <a href="#add-on">{text}</a> })}</p>
  }

  test('puts elements inside the sentence', () => {
    expect(renderCurrentMarkup(<Rich />)).toBe('<p>Needs <a href="#add-on">the add-on</a> now</p>')
    setLocale('sv')
    expect(renderCurrentMarkup(<Rich />)).toBe('<p>Kräver <a href="#add-on">tillägget</a> nu</p>')
  })

  test('leaves a tag without an entry as written', () => {
    function Plain() {
      const t = useT(messages)
      return <p>{t.rich('needs', {})}</p>
    }
    expect(renderCurrentMarkup(<Plain />)).toContain('&lt;link&gt;the add-on&lt;/link&gt;')
  })
})

describe('locale store', () => {
  test('tells subscribers when the locale changes', () => {
    const seen: string[] = []
    const stop = localeStore.subscribe((state) => seen.push(state.locale))
    setLocale('sv')
    setLocale('en')
    stop()
    expect(seen).toEqual(['sv', 'en'])
  })
})

describe('locale preference', () => {
  test('defaults from the browser language: Swedish for sv*, English for the rest', () => {
    const cases = [
      ['sv', 'sv'],
      ['sv-SE', 'sv'],
      ['SV-fi', 'sv'],
      ['en-US', 'en'],
      ['nb-NO', 'en'],
      [undefined, 'en'],
    ] as const
    for (const [language, expected] of cases) expect(detectLocale(language)).toBe(expected)
  })

  test('a stored choice beats the browser language; junk is ignored', () => {
    expect(resolveInitialLocale('en', 'sv-SE')).toBe('en')
    expect(resolveInitialLocale('sv', 'en-US')).toBe('sv')
    expect(resolveInitialLocale('de', 'sv-SE')).toBe('sv')
    expect(resolveInitialLocale(null, 'en-US')).toBe('en')
  })

  test('a choice is kept in storage per viewer', () => {
    const items = new Map<string, string>()
    const target = globalThis as { localStorage?: unknown }
    const had = target.localStorage
    target.localStorage = {
      getItem: (name: string) => items.get(name) ?? null,
      setItem: (name: string, value: string) => void items.set(name, value),
    }
    try {
      setLocale('sv')
      expect(getLocale()).toBe('sv')
      expect([...items.values()]).toEqual(['sv'])

      localeStore.setState({ locale: 'en' })
      hydrateLocale()
      expect(getLocale()).toBe('sv')
    } finally {
      target.localStorage = had
    }
  })

  test('storage that throws does not break the choice', () => {
    const target = globalThis as { localStorage?: unknown }
    const had = target.localStorage
    target.localStorage = {
      setItem: () => {
        throw new Error('blocked')
      },
    }
    try {
      setLocale('sv')
      expect(getLocale()).toBe('sv')
    } finally {
      target.localStorage = had
    }
  })
})
