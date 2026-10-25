import { translate } from '../../../i18n'
import type { HudTitle } from '../../../lib/hud-title'
import { ContextualHelperPanel } from './contextual-helper-panel'
import { messages } from './messages'

interface BuildingHelperProps {
  showRotate?: boolean
  title?: HudTitle | null
}

// Rotate is one hint with both keys (R / T) — never two separate
// counterclockwise / clockwise rows — to match every other placement helper.
export function BuildingHelper({ showRotate, title = null }: BuildingHelperProps) {
  return (
    <ContextualHelperPanel
      title={title}
      hints={[
        { keys: ['Left click'], label: translate(messages, 'building.place') },
        ...(showRotate ? [{ keys: ['R', 'T'], label: translate(messages, 'rotate') }] : []),
        { keys: ['Esc'], label: translate(messages, 'cancel') },
      ]}
    />
  )
}
