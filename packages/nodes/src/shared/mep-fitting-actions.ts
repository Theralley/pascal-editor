import type { NodeQuickAction, PipeFittingNode, SceneApi } from '@pascal-app/core'
import { translate } from '@pascal-app/editor'
import { messages } from './messages'

export function pipeFittingQuickActions({ node }: { node: PipeFittingNode }): NodeQuickAction[] {
  if (node.fittingType === 'end-cap') return []

  const variants = (['pvc', 'abs', 'cast-iron'] as const).map((pipeMaterial) => ({
    id: `pipe-fitting:material:${pipeMaterial}`,
    label: pipeMaterial === 'cast-iron' ? 'Cast iron' : pipeMaterial.toUpperCase(),
    title: translate(messages, 'fitting.useMaterial', {
      material: translate(messages, `fitting.${pipeMaterial}`),
    }),
    disabled: node.pipeMaterial === pipeMaterial,
    history: 'single' as const,
    run: ({ sceneApi }: { sceneApi: SceneApi }) => {
      sceneApi.update(node.id, { pipeMaterial })
      return { selectedIds: [node.id] }
    },
  }))
  return variants
}
