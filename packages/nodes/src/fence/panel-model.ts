import type { FenceNode } from '@pascal-app/core'
import { type NodePanelModel, translate } from '@pascal-app/editor'
import { beginFenceFeaturePlacement } from './features'
import { messages } from './messages'

export const fencePanelModel: NodePanelModel<FenceNode> = {
  rows() {
    return (['gate', 'opening'] as const).map((kind) => ({
      id: `add-${kind}`,
      kind: 'action',
      section: translate(messages, 'gatesAndOpenings'),
      label: translate(messages, kind === 'gate' ? 'addGate' : 'addOpening'),
      onSelect: () => beginFenceFeaturePlacement(kind),
    }))
  },
}
