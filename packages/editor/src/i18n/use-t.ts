import { useMemo } from 'react'
import { getLocale, useLocale } from './locale'
import {
  formatMessage,
  formatRichMessage,
  type MessageCatalog,
  type MessageKey,
  type MessageTags,
  type MessageVars,
} from './messages'

/** Translates `key` in the active locale, for code outside React: commands, shortcut tables, toasts. */
export function translate<Catalog extends MessageCatalog>(
  catalog: Catalog,
  key: MessageKey<Catalog>,
  vars?: MessageVars,
): string {
  return formatMessage(catalog, getLocale(), key, vars)
}

/**
 * `t(key, vars?)` for a component; it re-renders when the locale changes. `t.rich(key, tags, vars?)`
 * fills `<name>…</name>` spans of the message with elements.
 */
export function useT<Catalog extends MessageCatalog>(catalog: Catalog) {
  const locale = useLocale()
  return useMemo(() => {
    const t = (key: MessageKey<Catalog>, vars?: MessageVars) =>
      formatMessage(catalog, locale, key, vars)
    t.locale = locale
    t.rich = (key: MessageKey<Catalog>, tags: MessageTags, vars?: MessageVars) =>
      formatRichMessage(catalog, locale, key, tags, vars)
    return t
  }, [catalog, locale])
}
