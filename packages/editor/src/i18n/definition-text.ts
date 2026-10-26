import { useCallback } from 'react'
import { getLocale, useLocale } from './locale'
import type { Locale } from './messages'

type Translatable = { translations?: Readonly<Record<string, Readonly<Record<string, string>>>> }

/** A definition's visible text in `locale`; the English source when it has no entry. */
export function definitionText(
  def: Translatable | undefined,
  text: string,
  locale: Locale = getLocale(),
): string {
  return def?.translations?.[locale]?.[text] ?? text
}

/** `definitionText` for a component; it re-renders when the locale changes. */
export function useDefinitionText() {
  const locale = useLocale()
  return useCallback(
    (def: Translatable | undefined, text: string) => definitionText(def, text, locale),
    [locale],
  )
}
