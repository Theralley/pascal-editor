import { type MessageKey, translate } from '../../../i18n'
import { messages } from './messages'

/**
 * "1 slab · 1 stair · 2 fences" — one entry per node type in first-appearance
 * order so the line stays stable while shift-clicking. Labels derive from the
 * type id ('roof-segment' → 'roof segment'); pluralization is a simple +s
 * (the codebase has no pluralize helper and no current kind needs one).
 * The kinds the panels name carry their own noun and plural per language.
 * Missing nodes (stale ids) are skipped.
 */
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
}

export function formatSelectionBreakdown(types: Array<string | null | undefined>): string {
  const counts = new Map<string, number>()
  for (const type of types) {
    if (!type) continue
    counts.set(type, (counts.get(type) ?? 0) + 1)
  }
  const parts: string[] = []
  for (const [type, count] of counts) {
    const key = BREAKDOWN_KEYS[type]
    if (key) {
      parts.push(translate(messages, key, { count }))
      continue
    }
    const label = type.replace(/-/g, ' ')
    parts.push(`${count} ${count === 1 ? label : `${label}s`}`)
  }
  return parts.join(' · ')
}
