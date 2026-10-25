import { type AnyNode, scriptImages } from '@pascal-app/core'
import { type MessageKey, translate } from '../../../i18n'
import { messages } from './messages'

export type NodeDisplay = {
  icon: string
  label: string
}

type NodeTypeDefault = { icon: string; labelKey: MessageKey<typeof messages> }

const TYPE_DEFAULTS: Record<string, NodeTypeDefault> = {
  item: { icon: '/icons/item.webp', labelKey: 'nodeType.item' },
  wall: { icon: '/icons/wall.webp', labelKey: 'nodeType.wall' },
  door: { icon: '/icons/door.webp', labelKey: 'nodeType.door' },
  window: { icon: '/icons/window.webp', labelKey: 'nodeType.window' },
  slab: { icon: '/icons/floor.webp', labelKey: 'nodeType.slab' },
  ceiling: { icon: '/icons/ceiling.webp', labelKey: 'nodeType.ceiling' },
  column: { icon: '/icons/column.webp', labelKey: 'nodeType.column' },
  elevator: { icon: '/icons/elevator.webp', labelKey: 'nodeType.elevator' },
  fence: { icon: '/icons/fence.webp', labelKey: 'nodeType.fence' },
  roof: { icon: '/icons/roof.webp', labelKey: 'nodeType.roof' },
  'roof-segment': { icon: '/icons/roof.webp', labelKey: 'nodeType.roof-segment' },
  stair: { icon: '/icons/stairs.webp', labelKey: 'nodeType.stair' },
  'stair-segment': { icon: '/icons/stairs.webp', labelKey: 'nodeType.stair-segment' },
  scan: { icon: '/icons/mesh.webp', labelKey: 'nodeType.scan' },
  guide: { icon: '/icons/floorplan.webp', labelKey: 'nodeType.guide' },
  zone: { icon: '/icons/zone.webp', labelKey: 'nodeType.zone' },
}

function typeDefault(type: string): NodeDisplay {
  const known = TYPE_DEFAULTS[type]
  return known
    ? { icon: known.icon, label: translate(messages, known.labelKey) }
    : { icon: '/icons/select.webp', label: type }
}

export function getTypeDisplay(type: string): NodeDisplay {
  return typeDefault(type)
}

export function getNodeDisplay(node: AnyNode | null | undefined): NodeDisplay {
  if (!node) return { icon: '/icons/select.webp', label: translate(messages, 'nodeType.selection') }
  const fallback = typeDefault(node.type)
  const scripted = scriptImages(node)?.thumbnail
  // Item nodes carry an asset with its own thumbnail/name
  if (node.type === 'item') {
    return {
      icon: scripted ?? (node.asset?.thumbnail || fallback.icon),
      label: node.name || node.asset?.name || fallback.label,
    }
  }
  if (node.type === 'zone' && node.spaceRole === 'room') {
    return { icon: '/icons/kitchen.webp', label: node.name || translate(messages, 'nodeType.room') }
  }
  return {
    icon: scripted ?? fallback.icon,
    label: node.name || fallback.label,
  }
}
