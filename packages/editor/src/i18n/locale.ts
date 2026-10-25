import { useSyncExternalStore } from 'react'
import { createStore } from 'zustand/vanilla'
import { LOCALES, type Locale } from './messages'

/** Each language is named in itself, so a person who cannot read the current one still finds theirs. */
export const LOCALE_NAMES: Record<Locale, string> = { en: 'English', sv: 'Svenska' }

const STORAGE_KEY = 'pascal-locale'

/** Swedish browsers get Swedish; everyone else English. */
export function detectLocale(language: string | undefined): Locale {
  return language?.toLowerCase().startsWith('sv') ? 'sv' : 'en'
}

export function resolveInitialLocale(stored: string | null, language: string | undefined): Locale {
  return LOCALES.find((locale) => locale === stored) ?? detectLocale(language)
}

function readStoredLocale(): string | null {
  try {
    return globalThis.localStorage?.getItem(STORAGE_KEY) ?? null
  } catch {
    return null
  }
}

function writeStoredLocale(locale: Locale) {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, locale)
  } catch {
    // Private windows and blocked storage keep the choice for this visit only.
  }
}

/** English until `hydrateLocale` runs, so the server's markup and the first client render agree. */
export const localeStore = createStore<{ locale: Locale }>(() => ({ locale: 'en' }))

/** The active locale, for code outside React and for formatters that default to it. */
export const getLocale = (): Locale => localeStore.getState().locale

export function setLocale(locale: Locale) {
  localeStore.setState({ locale })
  writeStoredLocale(locale)
}

/** Applies the stored choice, or the browser's language, once the page is on the client. */
export function hydrateLocale() {
  const locale = resolveInitialLocale(
    readStoredLocale(),
    typeof navigator === 'undefined' ? undefined : navigator.language,
  )
  if (locale !== getLocale()) localeStore.setState({ locale })
}

export function useLocale(): Locale {
  return useSyncExternalStore(localeStore.subscribe, getLocale, getLocale)
}
