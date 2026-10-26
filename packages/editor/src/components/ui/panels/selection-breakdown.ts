import { nodeRegistry } from '@pascal-app/core'
import { definitionText, type MessageKey } from '../../../i18n'
import type { PanelT } from './node-display'
import type { messages } from './messages'

const BREAKDOWN_KEYS: Record<string, MessageKey<typeof messages>> = {
  item: 'breakdown.item',
  wall: 'breakdown.wall',
  door: 'breakdown.door',
  window: 'breakdown.window',
  slab: 'breakdown.slab',
  ceiling: 'breakdown.ceiling',
  column: 'breakdown.column',
  elevator: 'breakdown.elevator',
  fence: 'breakdown.fence',
  roof: 'breakdown.roof',
  'roof-segment': 'breakdown.roof-segment',
  stair: 'breakdown.stair',
  'stair-segment': 'breakdown.stair-segment',
  scan: 'breakdown.scan',
  guide: 'breakdown.guide',
  zone: 'breakdown.zone',
  room: 'breakdown.room',
}

/** The kind a selected node is counted under: a zone that is a room is counted as a room. */
export function selectionKind(node: { type: string; spaceRole?: string } | undefined) {
  return node?.type === 'zone' && node.spaceRole === 'room' ? 'room' : node?.type
}

/**
 * "1 slab · 1 stair · 2 fences" — one entry per kind in first-appearance order so the line stays
 * stable while shift-clicking. The kinds the panels name carry their own noun and plural per
 * language; any other kind reads "Label: count" from its definition. Missing nodes (stale ids)
 * are skipped.
 */
export function formatSelectionBreakdown(
  types: Array<string | null | undefined>,
  t: PanelT,
): string {
  const counts = new Map<string, number>()
  for (const type of types) {
    if (!type) continue
    counts.set(type, (counts.get(type) ?? 0) + 1)
  }
  const parts: string[] = []
  for (const [type, count] of counts) {
    const key = BREAKDOWN_KEYS[type]
    if (key) {
      parts.push(t(key, { count }))
      continue
    }
    const definition = nodeRegistry.get(type)
    const label = definition?.presentation
      ? definitionText(definition, definition.presentation.label)
      : type
    parts.push(`${label}: ${count}`)
  }
  return parts.join(' · ')
}
