import { type MessageKey, translate } from './../../../i18n'
import type { CatalogCategory } from './../../../store/use-editor'
import { messages } from './messages'

export type FurnishToolConfig = {
  id: 'item'
  iconSrc: string
  labelKey: MessageKey<typeof messages>
  /** `labelKey` in the active language, read when a host renders it. */
  readonly label: string
  catalogCategory: CatalogCategory
}

const furnishTool = (
  iconSrc: string,
  labelKey: MessageKey<typeof messages>,
  catalogCategory: CatalogCategory,
): FurnishToolConfig => ({
  id: 'item',
  iconSrc,
  labelKey,
  get label() {
    return translate(messages, labelKey)
  },
  catalogCategory,
})

export const furnishTools: FurnishToolConfig[] = [
  furnishTool('/icons/couch.webp', 'furnish.furniture', 'furniture'),
  furnishTool('/icons/appliance.webp', 'furnish.appliance', 'appliance'),
  furnishTool('/icons/kitchen.webp', 'furnish.kitchen', 'kitchen'),
  furnishTool('/icons/bathroom.webp', 'furnish.bathroom', 'bathroom'),
  furnishTool('/icons/tree.webp', 'furnish.outdoor', 'outdoor'),
]
