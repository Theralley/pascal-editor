import type { AnyNodeDefinition, ToolHint } from '@pascal-app/core'
import { useDefinitionText, useT } from '../../../i18n'
import type { ContinuationContext } from '../../../lib/continuation'
import type { HudTitle } from '../../../lib/hud-title'
import type { SnapContext } from '../../../lib/snapping-mode'
import { localizeToolHint, useVisibleToolHints } from '../../../lib/panel-tool-options'
import { ContextualHelperPanel } from './contextual-helper-panel'
import { messages } from './messages'

/**
 * Generic helper panel rendered from `def.toolHints` data. Matches the
 * visual styling of the hand-written `<WallHelper>` / `<ItemHelper>` /
 * etc. so registry-driven kinds get a consistent look without each kind
 * writing its own component.
 *
 * Drops the need for per-kind helper files entirely — kinds declare
 * their hints as static data in their `NodeDefinition`.
 */
export function RegisteredToolHelper({
  definition,
  hints,
  shiftPressed = false,
  snapContext = null,
  continuationContext = null,
  title = null,
  notice = null,
}: {
  /** The kind that declared `hints`; its translations localize them. */
  definition?: AnyNodeDefinition
  hints: ToolHint[]
  shiftPressed?: boolean
  snapContext?: SnapContext | null
  continuationContext?: ContinuationContext | null
  title?: HudTitle | null
  notice?: string | null
}) {
  const t = useT(messages)
  const defText = useDefinitionText()
  const visible = useVisibleToolHints(hints).map((hint) =>
    localizeToolHint(definition, hint, defText),
  )
  if (visible.length === 0 && !snapContext && !continuationContext && !notice) return null
  // Hints carrying a live-state `chip` render as mode chips next to the
  // snapping / continuation rows; the rest stay static key rows.
  const chipHints = visible.filter((hint) => hint.chip)
  const staticHints = visible.filter((hint) => !hint.chip)
  return (
    <ContextualHelperPanel
      chipHints={chipHints}
      hints={staticHints.map((hint) => {
        // Shift is a per-kind bypass for opening / zone / duct placement ("Free
        // place", "Free angle", …) — those flip to a bypassed state while held.
        const isBypassHint = hint.key === 'Shift'
        return {
          keys: [hint.key],
          label: shiftPressed && isBypassHint ? t('bypassed') : hint.label,
          active: shiftPressed && isBypassHint,
        }
      })}
      continuationContext={continuationContext}
      notice={notice}
      snapContext={snapContext}
      title={title}
    />
  )
}
