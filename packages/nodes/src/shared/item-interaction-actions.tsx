'use client'
import { type AnyNodeId, nodeMechanism, useInteractive, useScene } from '@pascal-app/core'
import { ActionMenuButton, useT } from '@pascal-app/editor'
import { useViewer } from '@pascal-app/viewer'
import { Lightbulb, LightbulbOff } from 'lucide-react'
import { itemHasLights, itemLightsOn, toggleItemLights } from './item-interactions'
import { messages } from './messages'

/**
 * The light switch for a single selected item or procedural item. Play/Stop
 * comes from the action menu's `capabilities.mechanism` button.
 */
export default function ItemInteractionActions() {
  const t = useT(messages)
  const selected = useViewer((s) => s.selection.selectedIds)
  const node = useScene((s) =>
    selected.length === 1 ? s.nodes[selected[0] as AnyNodeId] : undefined,
  )
  const hasLights = itemHasLights(node)
  const lit = useInteractive((s) => (node && hasLights ? itemLightsOn(node, s) : false))
  if (!(node && hasLights)) return null
  return (
    <ActionMenuButton
      // E runs the mechanism when there is one, and only otherwise the light.
      keys={nodeMechanism(node) ? undefined : ['E']}
      label={lit ? t('light.off') : t('light.on')}
      onClick={(event) => {
        event.stopPropagation()
        toggleItemLights(node)
      }}
      pressed={lit}
    >
      {lit ? <Lightbulb className="h-4 w-4" /> : <LightbulbOff className="h-4 w-4" />}
    </ActionMenuButton>
  )
}
