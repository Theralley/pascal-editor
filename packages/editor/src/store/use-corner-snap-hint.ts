import type { CornerBlockReason } from '@pascal-app/core'
import { create } from 'zustand'
import { translate } from '../i18n'
import { messages } from '../lib/help-messages'

/**
 * What the window being placed or dragged near a wall end says: `join` when a window already waits
 * on the other wall, `new` when one would be created, the reason when the end is not a corner a
 * window can wrap, null away from a wall end. The tools write it; the HUD reads it, so the hint is
 * there only inside the zone.
 */
export type CornerSnapHint = 'join' | 'new' | CornerBlockReason | null

export const useCornerSnapHint = create<{
  hint: CornerSnapHint
  setHint: (hint: CornerSnapHint) => void
}>((set) => ({
  hint: null,
  setHint: (hint) => set((state) => (state.hint === hint ? state : { hint })),
}))

/** One line each, in the HUD's voice: what is in the way, not what to do about it. */
export const CORNER_BLOCK_NOTES = {
  get free_end() {
    return translate(messages, 'corner.free_end')
  },
  get several_walls() {
    return translate(messages, 'corner.several_walls')
  },
  get angle() {
    return translate(messages, 'corner.angle')
  },
  get curved() {
    return translate(messages, 'corner.curved')
  },
  get curtain() {
    return translate(messages, 'corner.curtain')
  },
  get no_room() {
    return translate(messages, 'corner.no_room')
  },
  get in_the_way() {
    return translate(messages, 'corner.in_the_way')
  },
  get too_tall() {
    return translate(messages, 'corner.too_tall')
  },
} satisfies Record<CornerBlockReason, string>

export type CornerHintRow = { keys: string[]; label: string }

/** The HUD rows for a hint, shared by the placement tool and the move HUD. */
export function cornerHintRows(hint: CornerSnapHint): CornerHintRow[] {
  if (!hint) return []
  if (hint === 'join' || hint === 'new')
    return [
      {
        keys: ['Left click'],
        label: translate(messages, hint === 'join' ? 'corner.join' : 'corner.new'),
      },
      { keys: ['Alt'], label: translate(messages, 'corner.withoutSnap') },
    ]
  // The HUD's notice row, as for a placement that does not fit: a note, not a key to press.
  return [{ keys: ['!'], label: CORNER_BLOCK_NOTES[hint] }]
}
