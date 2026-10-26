import { type AnyNode, nodeRegistry } from '@pascal-app/core'
import { definitionText, type Locale } from '../i18n'

/**
 * A node's human label, the same in the baked artifact (`extras.label`) and the
 * viewer's breadcrumb: an explicit name wins, items fall back to their catalog
 * asset name, other kinds to a type word. The type word is English unless the
 * caller names a `locale`; the baked artifact names none.
 */
export function nodeDisplayLabel(node: AnyNode, locale?: Locale): string {
  if (node.name) return node.name
  const typeWord = (english: string) => {
    if (!locale) return english
    const definition = nodeRegistry.get(node.type)
    const label = definition?.presentation?.label
    const translated = label ? definitionText(definition, label, locale) : label
    return translated && translated !== label
      ? translated
      : definitionText(definition, english, locale)
  }
  switch (node.type) {
    case 'item':
      return (node as { asset?: { name?: string } }).asset?.name || typeWord('Item')
    case 'wall':
      return typeWord('Wall')
    case 'door':
      return typeWord('Door')
    case 'window':
      return typeWord('Window')
    case 'cabinet':
    case 'cabinet-module':
      return typeWord('Cabinet')
    case 'slab':
      return typeWord('Slab')
    case 'ceiling':
      return typeWord('Ceiling')
    case 'roof':
      return typeWord('Roof')
    case 'fence':
      return typeWord('Fence')
    case 'column':
      return typeWord('Column')
    case 'stair':
      return typeWord('Stairs')
    default:
      return typeWord(node.type)
  }
}
