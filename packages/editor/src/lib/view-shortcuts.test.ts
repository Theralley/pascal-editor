import { afterEach, describe, expect, test } from 'bun:test'
import { useViewer } from '@pascal-app/viewer'
import {
  OTHER_LETTER_KEYS,
  runViewShortcut,
  VIEW_SHORTCUT_KEYS,
  type ViewShortcut,
  viewShortcutOf,
} from './view-shortcuts'

const press = (key: string, modifiers: Partial<KeyboardEvent> = {}) => ({
  key,
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  repeat: false,
  target: null,
  ...modifiers,
})

const saved = useViewer.getState()
afterEach(() => useViewer.setState(saved, true))

describe('view shortcuts', () => {
  // The table is hand-kept (see OTHER_LETTER_KEYS): this guards the view keys against what it lists.
  test('no view key is bound twice, nor bound by the editor or an armed tool', () => {
    const keys = Object.values(VIEW_SHORTCUT_KEYS)
    expect(new Set(keys).size).toBe(keys.length)
    for (const [scope, bound] of Object.entries(OTHER_LETTER_KEYS)) {
      expect({ scope, clash: bound.filter((key) => keys.includes(key as never)) }).toEqual({
        scope,
        clash: [],
      })
    }
  })

  test.each([
    ['u', 'wallsUp'],
    ['j', 'wallsDown'],
    ['n', 'roofs'],
  ])('%s asks for %s', (key, expected) => {
    expect(viewShortcutOf(press(key))).toBe(expected as ViewShortcut)
  })

  test.each([
    ['a chord', press('u', { metaKey: true })],
    ['Ctrl', press('n', { ctrlKey: true })],
    ['Alt', press('j', { altKey: true })],
    ['Shift', press('u', { shiftKey: true })],
    ['a held key', press('n', { repeat: true })],
    ['another key', press('k')],
    ['a text field', press('n', { target: { closest: () => ({}) } as never })],
    ['an editable element', press('u', { target: { isContentEditable: true } as never })],
  ])('%s asks for nothing', (_, event) => {
    expect(viewShortcutOf(event)).toBeNull()
  })

  test('walls step one way or the other and stop at the ends', () => {
    useViewer.setState({ wallMode: 'cutaway' })
    runViewShortcut('wallsUp')
    expect(useViewer.getState().wallMode).toBe('up')
    runViewShortcut('wallsUp')
    expect(useViewer.getState().wallMode).toBe('up')
    runViewShortcut('wallsDown')
    runViewShortcut('wallsDown')
    runViewShortcut('wallsDown')
    expect(useViewer.getState().wallMode).toBe('down')
  })

  test('the roof key toggles roofs', () => {
    useViewer.setState({ showRoofs: true })
    runViewShortcut('roofs')
    expect(useViewer.getState().showRoofs).toBe(false)
    runViewShortcut('roofs')
    expect(useViewer.getState().showRoofs).toBe(true)
  })
})
