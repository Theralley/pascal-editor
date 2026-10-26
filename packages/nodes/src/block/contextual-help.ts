import {
  type ContextualHelpNodeExtension,
  type ContextualShortcutHint,
  getLocale,
  translate,
} from '@pascal-app/editor'
import useBlockEditSession from './edit-session'
import { messages } from './messages'
import type { BlockComponentMode } from './selection-model'

function buildHints(mode: BlockComponentMode): ContextualShortcutHint[] {
  const operations: Record<BlockComponentMode, ContextualShortcutHint[]> = {
    vertex: [{ keys: ['M'], label: translate(messages, 'help.mergeVertices') }],
    edge: [
      { keys: ['Cmd/Ctrl', 'B'], label: translate(messages, 'help.bevelEdges') },
      { keys: ['D'], label: translate(messages, 'help.dissolveEdges') },
    ],
    face: [
      { keys: ['E'], label: translate(messages, 'help.extrudeFaces') },
      { keys: ['I'], label: translate(messages, 'help.insetFaces') },
    ],
  }
  return [
    {
      keys: [['1', '2', '3']],
      label: translate(messages, `help.${mode}Mode`),
      subtitle: translate(messages, 'help.modes'),
    },
    { keys: [['G', 'R', 'S']], label: translate(messages, 'help.transform') },
    ...operations[mode],
    { keys: ['Tab'], label: translate(messages, 'help.exit') },
  ]
}

// The editor reads the hints as a store snapshot, so each language keeps one array per mode.
const hintsByLocale = new Map<string, ContextualShortcutHint[]>()

function hintsFor(mode: BlockComponentMode): ContextualShortcutHint[] {
  const key = `${getLocale()}:${mode}`
  let hints = hintsByLocale.get(key)
  if (!hints) {
    hints = buildHints(mode)
    hintsByLocale.set(key, hints)
  }
  return hints
}

const EMPTY_HINTS: ContextualShortcutHint[] = []

export const blockContextualHelp: ContextualHelpNodeExtension = {
  subscribe: useBlockEditSession.subscribe,
  getHints: (nodeId) => {
    const session = useBlockEditSession.getState()
    return session.nodeId === nodeId ? hintsFor(session.selection.mode) : EMPTY_HINTS
  },
}
