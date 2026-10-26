import { nodeRegistry } from '@pascal-app/core'
import { definitionText, getLocale, type Locale } from '../i18n'

/**
 * The name a new node of `kind` starts with, "Slab 2" or "Bjälklag 2" in the active language.
 * Only the moment of creation decides the language; an existing node keeps the name it has.
 */
export function numberedNodeName(kind: string, n: number, locale: Locale = getLocale()): string {
  const definition = nodeRegistry.get(kind)
  const label = definition?.presentation?.label ?? kind
  return `${definitionText(definition, label, locale)} ${n}`
}
