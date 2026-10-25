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

test('Preview shows the saved level pick, keeps what the visitor changes to itself, and editing gets the saved picks back', async () => {
  const picks = savePicks()
  const renderer = await create(<EditorDisplay wholeBuilding={false} />)
  try {
    // Editing: always stacked, whatever was saved.
    expect(view()).toEqual({ wallMode: 'cutaway', levelMode: 'stacked', showRoofs: false })
    expect(saved()).toEqual(picks)

    useEditor.getState().setPreviewMode(true)
    await renderer.update(<EditorDisplay wholeBuilding />)
    expect(view().levelMode).toBe('exploded')

    // The visitor's own changes, as the Preview controls and keys make them.
    useViewer.getState().overrideView({ wallMode: 'down', showRoofs: true })
    useEditor.setState({ isPreviewMode: true })
    runViewShortcut('wallsUp')
    runViewShortcut('roofs')
    expect(saved()).toEqual(picks)

    useEditor.getState().setPreviewMode(false)
    await act(async () => renderer.update(<EditorDisplay wholeBuilding={false} />))
    expect(view()).toEqual({ wallMode: 'cutaway', levelMode: 'stacked', showRoofs: false })
    expect(saved()).toEqual(picks)
  } finally {
    await renderer.unmount()
  }
})

test('the view keys save the pick outside Preview', () => {
  savePicks()
  runViewShortcut('wallsDown')
  expect(saved()?.wallMode).toBe('down')
})
