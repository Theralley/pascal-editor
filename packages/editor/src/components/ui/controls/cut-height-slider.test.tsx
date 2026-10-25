import { afterEach, describe, expect, test } from 'bun:test'
import { useViewer } from '@pascal-app/viewer'
import { renderCurrentMarkup } from '../../../test-utils/render-current-markup'
import { CutHeightControl, CutHeightSlider } from './cut-height-slider'

const saved = useViewer.getState()
afterEach(() => useViewer.setState(saved, true))

describe('the cut height slider', () => {
  test.each(['up', 'cutaway', 'down', 'translucent'] as const)('is hidden while walls are %s', (wallMode) => {
    useViewer.setState({ wallMode })
    expect(renderCurrentMarkup(<CutHeightSlider />)).toBe('')
  })

  test('is a named slider whose value reads in metres', () => {
    useViewer.setState({ wallMode: 'low', wallCutHeight: 0.25, unit: 'metric' })
    const markup = renderCurrentMarkup(<CutHeightControl />)
    expect(markup).toContain('type="range"')
    expect(markup).toContain('aria-valuetext="0.25m"')
    expect(markup).toContain('>Cut height</label>')
    expect(markup).toContain('min="0.05"')
    expect(markup).toContain('max="1.5"')
  })

  test('reads in millimetres and in feet and inches in the units the person chose', () => {
    useViewer.setState({ wallMode: 'low', wallCutHeight: 0.25, unit: 'metric', metricNotation: 'millimeters' })
    expect(renderCurrentMarkup(<CutHeightControl />)).toContain('aria-valuetext="250mm"')
    useViewer.setState({ unit: 'imperial' })
    expect(renderCurrentMarkup(<CutHeightControl />)).toContain('aria-valuetext="0&#x27;10&quot;"')
  })
})
