import { useT } from '../../../i18n'
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
  const t = useT(messages)
  return (
    <ContextualHelperPanel
      title={title}
      hints={[
        { keys: ['Left click'], label: t('building.place') },
        ...(showRotate ? [{ keys: ['R', 'T'], label: t('rotate') }] : []),
        { keys: ['Esc'], label: t('cancel') },
      ]}
    />
  )
}
