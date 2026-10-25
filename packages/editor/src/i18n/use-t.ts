import { useCallback } from 'react'
import { getLocale, useLocale } from './locale'
import { formatMessage, type MessageCatalog, type MessageKey, type MessageVars } from './messages'

/** Translates `key` in the active locale, for code outside React: commands, shortcut tables, toasts. */
export function translate<Catalog extends MessageCatalog>(
  catalog: Catalog,
  key: MessageKey<Catalog>,
  vars?: MessageVars,
): string {
  return formatMessage(catalog, getLocale(), key, vars)
}

/** `t(key, vars?)` for a component; it re-renders when the locale changes. */
export function useT<Catalog extends MessageCatalog>(catalog: Catalog) {
  const locale = useLocale()
  return useCallback(
    (key: MessageKey<Catalog>, vars?: MessageVars) => formatMessage(catalog, locale, key, vars),
    [catalog, locale],
  )
}
