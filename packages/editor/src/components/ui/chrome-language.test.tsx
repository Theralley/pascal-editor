import { afterEach, describe, expect, test } from 'bun:test'
import { setLocale } from '../../i18n'
import { renderCurrentMarkup } from '../../test-utils/render-current-markup'
import { CameraActions } from './action-menu/camera-actions'
import { ControlModes } from './action-menu/control-modes'
import { TerrainSculptPanel } from './controls/terrain-sculpt-panel'
import { SceneLoadFailed } from './scene-loader'
import { SnapTargetBadge } from './snap-target-badge'
import { TooltipProvider } from './primitives/tooltip'

const render = (element: React.ReactElement) =>
  renderCurrentMarkup(<TooltipProvider>{element}</TooltipProvider>)

// Each row renders a component of the chrome and lists the text it must show per language.
const cases = [
  {
    name: 'the mode buttons',
    element: <ControlModes />,
    en: ['Select'],
    sv: ['Markera'],
  },
  {
    name: 'the camera buttons',
    element: <CameraActions />,
    en: ['Orbit Left', 'Orbit Right'],
    sv: ['Kretsa åt vänster', 'Kretsa åt höger'],
  },
  {
    name: 'the terrain sculpt panel',
    element: <TerrainSculptPanel />,
    en: ['Raise', 'Level lot', 'Clear terrain'],
    sv: ['Höj', 'Jämna ut tomten', 'Rensa terräng'],
  },
  {
    name: 'the scene load failure',
    element: <SceneLoadFailed onRetry={() => {}} />,
    en: ['Try again'],
    sv: ['Projektet kunde inte laddas', 'Försök igen'],
  },
  {
    name: 'the snap target badge',
    element: <SnapTargetBadge target="wall" />,
    en: ['Wall attachment'],
    sv: ['Monteras på vägg'],
  },
] as const

describe('Editor chrome in the active language', () => {
  afterEach(() => setLocale('en'))

  for (const { name, element, en, sv } of cases) {
    test(`${name} reads English by default`, () => {
      const html = render(element)
      for (const text of en) expect(html).toContain(text)
      for (const text of sv) expect(html).not.toContain(text)
    })

    test(`${name} reads Swedish when the locale is sv`, () => {
      setLocale('sv')
      const html = render(element)
      for (const text of sv) expect(html).toContain(text)
      for (const text of en) expect(html).not.toContain(text)
    })
  }
})
