import { nodeRegistry } from '@pascal-app/core'
import { definitionText, translate } from '@pascal-app/editor'
import { messages } from './messages'

const POST = /^Lean-to (High |Opposite )?Post (\d+)$/
const CORNER_POST = /^Lean-to (Left|Right) Corner Post$/
const JOINT_POST = /^Canopy (Left|Right)( Opposite)? Joint Post$/

/**
 * A name the lean-to placement or assembly produced, in the active language. Placement and
 * assembly keep their English names for agent and non-UI callers; the tools translate on commit.
 */
export function localizedLeanToName(name: string | null | undefined): string | undefined {
  if (!name) return undefined
  const post = POST.exec(name)
  if (post) {
    const kind = post[1] === 'High ' ? 'highPost' : post[1] ? 'oppositePost' : 'post'
    return translate(messages, kind, { n: post[2] as string })
  }
  const corner = CORNER_POST.exec(name)
  if (corner)
    return translate(messages, corner[1] === 'Left' ? 'leftCornerPost' : 'rightCornerPost')
  const joint = JOINT_POST.exec(name)
  if (joint) {
    const side = joint[1] === 'Left' ? 'left' : 'right'
    return translate(messages, joint[2] ? `${side}OppositeJointPost` : `${side}JointPost`)
  }
  return definitionText(nodeRegistry.get('lean-to-extension'), name)
}

/** `node` with its English default name translated; a name the person chose stays. */
export function withLocalizedLeanToName<T extends { name?: string | null }>(node: T): T {
  return { ...node, name: localizedLeanToName(node.name) }
}
