'use client'

import { useScene } from '@pascal-app/core'
import { useViewer } from '@pascal-app/viewer'
import { type Locale, useLocale } from '../../i18n'
import { nodeDisplayLabel } from '../../lib/node-display-label'
import { type ViewerNodes, zoneLabel } from '../../lib/viewer-selection'

/** The hovered node's name, for the bottom pill. A room reads as the room. */
export function viewerHoverLabel(
  hoveredId: string | null,
  nodes: ViewerNodes,
  locale?: Locale,
): string | null {
  const node = hoveredId ? nodes[hoveredId] : undefined
  if (!node) return null
  return node.type === 'zone' ? zoneLabel(node, locale) : nodeDisplayLabel(node, locale)
}

/**
 * What a click would select, named in a pill above the controls bar. Every
 * viewer surface's hit source sets the hover (`applyViewerHover`); hidden in
 * the walkthrough and on devices without a hovering pointer. Names come from
 * the parametric scene store unless the surface passes its own graph.
 */
export function ViewerHoverLabel({ nodes: nodesProp }: { nodes?: ViewerNodes }) {
  const sceneNodes = useScene((s) => s.nodes)
  const nodes = nodesProp ?? sceneNodes
  const locale = useLocale()
  const label = useViewer((s) =>
    s.walkthroughMode ? null : viewerHoverLabel(s.hoveredId, nodes, locale),
  )
  if (!label) return null
  return (
    <div
      className="pointer-events-none absolute bottom-24 left-1/2 z-20 -translate-x-1/2 rounded-full border border-border/60 bg-background/90 px-3 py-1 text-foreground text-sm shadow-elevation-3 backdrop-blur [@media(hover:none)]:hidden"
      data-testid="viewer-hover-label"
    >
      {label}
    </div>
  )
}
