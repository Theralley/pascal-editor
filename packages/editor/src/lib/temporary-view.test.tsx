import { afterEach, beforeEach, expect, test } from 'bun:test'
import { useViewer } from '@pascal-app/viewer'
import { act, create } from '@react-three/test-renderer'
import useEditor from '../store/use-editor'
import { useEditorLevelDisplay } from './editor-level-display'
import { runViewShortcut } from './view-shortcuts'

let previous: {
  viewer: ReturnType<typeof useViewer.getState>
  editor: ReturnType<typeof useEditor.getState>
}
beforeEach(() => {
  previous = { viewer: useViewer.getState(), editor: useEditor.getState() }
})
afterEach(() => {
  useViewer.setState(previous.viewer, true)
  useEditor.setState(previous.editor, true)
})

const view = () => {
  const { wallMode, levelMode, showRoofs } = useViewer.getState()
  return { wallMode, levelMode, showRoofs }
}
const saved = () => useViewer.getState().projectPreferences.p1

function savePicks() {
  const viewer = useViewer.getState()
  viewer.setProjectId('p1')
  viewer.setWallMode('cutaway')
  viewer.setLevelMode('exploded')
  viewer.setShowRoofs(false)
  return { ...saved() }
}

function EditorDisplay({ wholeBuilding }: { wholeBuilding: boolean }) {
  useEditorLevelDisplay(wholeBuilding)
  return null
}

test("a pick made in Preview is the person's: it survives leaving and coming back, and the editor's stacked levels are never saved", async () => {
  const picks = savePicks()
  const renderer = await create(<EditorDisplay wholeBuilding={false} />)
  try {
    // Editing: always stacked, whatever was saved.
    expect(view()).toEqual({ wallMode: 'cutaway', levelMode: 'stacked', showRoofs: false })
    expect(saved()).toEqual(picks)

    useEditor.getState().setPreviewMode(true)
    await renderer.update(<EditorDisplay wholeBuilding />)
    expect(view().levelMode).toBe('exploded')

    useViewer.getState().setLevelMode('solo')
    runViewShortcut('wallsUp')
    runViewShortcut('roofs')
    expect(saved()).toEqual({ wallMode: 'up', levelMode: 'solo', showRoofs: true })

    useEditor.getState().setPreviewMode(false)
    await act(async () => renderer.update(<EditorDisplay wholeBuilding={false} />))
    expect(view()).toEqual({ wallMode: 'up', levelMode: 'stacked', showRoofs: true })
    expect(saved()?.levelMode).toBe('solo')

    useEditor.getState().setPreviewMode(true)
    await act(async () => renderer.update(<EditorDisplay wholeBuilding />))
    expect(view().levelMode).toBe('solo')
  } finally {
    await renderer.unmount()
  }
})

test('a system override never becomes a saved pick', () => {
  const picks = savePicks()
  useViewer.getState().overrideView({ wallMode: 'up', levelMode: 'stacked', showRoofs: true })
  expect(saved()).toEqual(picks)
  useViewer.getState().restoreView()
  expect(view()).toEqual({ wallMode: 'cutaway', levelMode: 'exploded', showRoofs: false })
})

test('the view keys save the pick', () => {
  savePicks()
  runViewShortcut('wallsDown')
  expect(saved()?.wallMode).toBe('down')
})
