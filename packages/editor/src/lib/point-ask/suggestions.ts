import { type MessageKey, translate } from '../../i18n'
import { messages } from './messages'
import type { PointKind, PointTarget } from './types'

type SuggestionState = {
  /** A room with nothing in it. */
  empty?: boolean
  /** A window already stands where the wall was clicked. */
  hasWindowAtStation?: boolean
}

/** Chips are the words sent to Pascal as well, so they come in the active language. */
const chipKeys = <Prefix extends string>(prefix: Prefix, count: number) =>
  Array.from({ length: count }, (_, i) => `${prefix}.${i + 1}` as MessageKey<typeof messages>)

/**
 * Three chips chosen locally from the kind and the element's state, with no model call, so they
 * are there on the first frame and teach what Pascal can do here (spec 2.4).
 */
export function suggestionsFor(kind: PointKind, state: SuggestionState = {}): string[] {
  const say = (key: MessageKey<typeof messages>) => translate(messages, key)
  if (kind === 'room')
    return [
      say(state.empty ? 'room.furnish' : 'room.rearrange'),
      say('room.longer'),
      say('room.floor'),
    ]
  if (kind === 'wall')
    return [
      say(state.hasWindowAtStation ? 'wall.moveWindow' : 'wall.addWindow'),
      say('wall.finish'),
      say('wall.move'),
    ]
  return chipKeys(kind, 3).map(say)
}

const ASK_KEYS = {
  wall: 'ask.wall',
  window: 'ask.window',
  door: 'ask.door',
  item: 'ask.item',
  roof: 'ask.roof',
  stair: 'ask.stair',
} as const satisfies Partial<Record<PointKind, MessageKey<typeof messages>>>

/** "Ask about Kitchen…", "Ask about this window…", "Ask about these…", "Ask about this area…". */
export function placeholderFor(targets: readonly PointTarget[]): string {
  if (targets.length === 0) return translate(messages, 'ask.area')
  if (targets.length > 1) return translate(messages, 'ask.several')
  const [only] = targets as [PointTarget]
  if (only.kind === 'room') return translate(messages, 'ask.room', { name: only.name })
  if (only.kind === 'area') return translate(messages, 'ask.area')
  const key = (ASK_KEYS as Partial<Record<PointKind, MessageKey<typeof messages>>>)[only.kind]
  return translate(messages, key ?? 'ask.other')
}

/** What the chips are chosen by, from a node's type. A region is an area whatever it holds. */
export function kindOf(nodeType: string, isRegion = false): PointKind {
  if (isRegion) return 'area'
  switch (nodeType) {
    case 'zone':
      return 'room'
    case 'wall':
      return 'wall'
    case 'window':
      return 'window'
    case 'door':
      return 'door'
    case 'item':
    case 'procedural-item':
    case 'imported-mesh':
    case 'column':
      return 'item'
    case 'roof':
    case 'roof-segment':
      return 'roof'
    case 'stair':
    case 'stair-segment':
      return 'stair'
    default:
      return 'other'
  }
}

export function kindForTargets(targets: readonly PointTarget[], isRegion = false): PointKind {
  if (isRegion || targets.length === 0) return 'area'
  if (targets.length > 1) return 'several'
  return (targets[0] as PointTarget).kind
}

const plain = (words: string) =>
  words
    .trim()
    .toLowerCase()
    .replace(/[.!?…]+$/u, '')

/**
 * Three chips for asking again on what a turn just changed ("Change more"): the next things to
 * try, never the words that were just sent.
 */
export function followUpSuggestionsFor(kind: PointKind, justAsked: string): string[] {
  const sent = plain(justAsked)
  return chipKeys(`follow.${kind}`, 4)
    .map((key) => translate(messages, key))
    .filter((chip) => plain(chip) !== sent)
    .slice(0, 3)
}
