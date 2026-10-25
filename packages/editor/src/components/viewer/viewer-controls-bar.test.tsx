import { afterEach, describe, expect, test } from 'bun:test'
import { LEVEL_MODE_OPTIONS, useViewer, WALL_MODE_OPTIONS } from '@pascal-app/viewer'
import { setLocale } from '../../i18n'
import { renderCurrentMarkup } from '../../test-utils/render-current-markup'
import { ViewerControlsBar } from './viewer-controls-bar'

const saved = useViewer.getState()
afterEach(() => {
  useViewer.setState(saved, true)
  setLocale('en')
})

const bar = (props: Partial<Parameters<typeof ViewerControlsBar>[0]> = {}) =>
  renderCurrentMarkup(<ViewerControlsBar onWalkthroughToggle={() => {}} {...props} />)

const buttonNamed = (markup: string, name: string) =>
  markup.match(new RegExp(`<button[^>]*aria-label="${name}"[^>]*>`))?.[0] ?? ''

describe('the viewer controls bar', () => {
  test('offers every shared wall and level mode, under the group names a screen reader hears', () => {
    const markup = bar()
    expect(markup).toContain('role="radiogroup"')
    expect(markup).toContain('aria-label="Walls"')
    expect(markup).toContain('aria-label="Levels"')
    for (const { label } of [...WALL_MODE_OPTIONS, ...LEVEL_MODE_OPTIONS]) {
      expect(markup).toContain(`>${label}</span>`)
    }
  })

  test('the roof and walkthrough buttons are named and say whether they are on', () => {
    useViewer.setState({ showRoofs: false })
    const markup = bar({ walkthroughActive: true })
    expect(buttonNamed(markup, 'Roofs')).toContain('aria-pressed="false"')
    expect(buttonNamed(markup, 'Walkthrough')).toContain('aria-pressed="true"')
  })

  test('speaks Swedish: the group names, every wall and level mode and the roof tooltip', () => {
    setLocale('sv')
    useViewer.setState({ showRoofs: false })
    const markup = bar()
    expect(markup).toContain('aria-label="Väggar"')
    expect(markup).toContain('aria-label="Våningar"')
    for (const label of ['Uppe', 'Genomskuren', 'Låga', 'Dolda', 'Genomskinliga'])
      expect(markup).toContain(`>${label}</span>`)
    for (const label of ['Staplade', 'Isärdragna', 'Ensam'])
      expect(markup).toContain(`>${label}</span>`)
    expect(buttonNamed(markup, 'Tak')).toContain('aria-pressed="false"')
    expect(markup).not.toContain('Cutaway')
  })

  test('a baked scene has no wall modes to choose', () => {
    expect(bar({ glbActive: true })).not.toContain('aria-label="Walls"')
  })
})
