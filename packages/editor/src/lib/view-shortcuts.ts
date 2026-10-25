import { stepWallMode, useViewer } from '@pascal-app/viewer'
import { isTypingTarget } from './typing-target'

/** The plain letter keys that change what the viewer shows. */
export const VIEW_SHORTCUT_KEYS = {
  wallsUp: 'u',
  wallsDown: 'j',
  roofs: 'n',
} as const

export type ViewShortcut = keyof typeof VIEW_SHORTCUT_KEYS

/**
 * Plain letter keys bound outside the view shortcuts, by where they apply: the editor's global
 * keys, and the keys a tool listens for while it is armed. A view shortcut must stay clear of
 * every one, or it would fire alongside, or instead of, the tool's own. The bindings themselves
 * are not introspectable, so this table is kept by hand: a tool that binds a letter adds it here.
 */
export const OTHER_LETTER_KEYS: Readonly<Record<string, readonly string[]>> = {
  editor: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'm', 'p', 'r', 's', 't', 'v', 'w', 'x', 'z'],
  'block-selection': ['a', 'd', 'e', 'g', 'i', 'm', 'r', 's', 'x'],
  cabinet: ['i'],
  door: ['l', 'o', 'r'],
  'duct-segment': ['h', 'q'],
  'duct-terminal': ['m'],
  'lean-to-extension': ['f'],
  'liquid-line': ['f'],
  'pipe-segment': ['h', 'q', 's'],
  'point-ask': ['c'],
  roof: ['p', 'r', 't'],
  walkthrough: ['a', 'd', 'e', 'p', 'q', 'r', 's', 't', 'w'],
  window: ['l', 'o', 'r'],
}

/**
 * The view shortcut a key press asks for, or null: modifiers belong to other chords, and a field
 * being typed in keeps its letters.
 */
export function viewShortcutOf(
  event: Pick<
    KeyboardEvent,
    'key' | 'metaKey' | 'ctrlKey' | 'altKey' | 'shiftKey' | 'repeat' | 'target'
  >,
): ViewShortcut | null {
  if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey || event.repeat) return null
  if (isTypingTarget(event.target)) return null
  const shortcut = (Object.keys(VIEW_SHORTCUT_KEYS) as ViewShortcut[]).find(
    (name) => VIEW_SHORTCUT_KEYS[name] === event.key,
  )
  return shortcut ?? null
}

/** The person's pick: saved for the project, in Preview as in the editor. */
export function runViewShortcut(shortcut: ViewShortcut): void {
  const viewer = useViewer.getState()
  if (shortcut === 'roofs') viewer.setShowRoofs(!viewer.showRoofs)
  else viewer.setWallMode(stepWallMode(viewer.wallMode, shortcut === 'wallsUp' ? 'up' : 'down'))
}
