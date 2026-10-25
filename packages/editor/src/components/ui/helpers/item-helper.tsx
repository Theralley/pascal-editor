import { translate } from '../../../i18n'
import type { ContinuationContext } from '../../../lib/continuation'
import type { HudTitle } from '../../../lib/hud-title'
import type { SnapContext } from '../../../lib/snapping-mode'
import { ContextualHelperPanel } from './contextual-helper-panel'
import { messages } from './messages'

interface ItemHelperProps {
  showEsc?: boolean
  snapContext?: SnapContext | null
  // Whether to advertise Alt = force-place. Only meaningful for kinds that
  // collision-validate their drop.
  showForce?: boolean
  // Set for a fresh point-kind placement (e.g. a positioned preset) so the
  // once/repeat continuation chip shows; null for an existing-node move.
  continuationContext?: ContinuationContext | null
  title?: HudTitle | null
  // Why the item would not fit where it is (a door's way, a room too small): a warning, not a block.
  notice?: string | null
  // Rows a kind adds while it is in hand (a window near a corner says what dropping it does).
  extraHints?: { keys: string[]; label: string }[]
  // The extra rows say what a click does, so the plain Place row is left out.
  replacesPlace?: boolean
}

// Snapping mode is the chip on the right (Shift cycles it), so it's not repeated
// as a key hint. Rotate is the two keys; Alt forces an invalid (red) drop.
export function ItemHelper({
  showEsc,
  snapContext,
  showForce,
  continuationContext = null,
  title = null,
  notice = null,
  extraHints = [],
  replacesPlace = false,
}: ItemHelperProps) {
  return (
    <ContextualHelperPanel
      continuationContext={continuationContext}
      notice={notice}
      hints={[
        // Where a click does something else (joining a corner), that row says so instead.
        ...(replacesPlace ? [] : [{ keys: ['Left click'], label: translate(messages, 'place') }]),
        ...extraHints,
        { keys: ['R', 'T'], label: translate(messages, 'rotate') },
        ...(showForce ? [{ keys: ['Alt'], label: translate(messages, 'item.forcePlace') }] : []),
        { keys: [showEsc ? 'Esc' : 'Right click'], label: translate(messages, 'cancel') },
      ]}
      snapContext={snapContext}
      title={title}
    />
  )
}
