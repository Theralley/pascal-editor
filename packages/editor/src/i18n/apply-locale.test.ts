import { afterEach, describe, expect, test } from 'bun:test'
import { useViewer } from '@pascal-app/viewer'
import { applyLocale } from './use-apply-locale'

describe('a Swedish interface and units', () => {
  const original = useViewer.getState()
  afterEach(() => useViewer.setState(original, true))

  test('suggests metric while nobody has chosen units', () => {
    useViewer.setState({ unitDefault: 'imperial', unitExplicit: false })
    applyLocale('sv')
    expect(useViewer.getState()).toMatchObject({ unit: 'metric', unitSource: 'guess' })
  })

  test('leaves an explicit personal choice alone', () => {
    useViewer.setState({ unit: 'imperial', unitDefault: 'imperial', unitExplicit: true })
    applyLocale('sv')
    expect(useViewer.getState().unit).toBe('imperial')
  })

  test('leaves an explicit project choice alone', () => {
    useViewer.setState({
      projectId: 'p1',
      projectPresentation: { units: { system: 'imperial' } },
      unit: 'imperial',
      unitDefault: 'imperial',
      unitExplicit: false,
    } as never)
    applyLocale('sv')
    expect(useViewer.getState()).toMatchObject({ unit: 'imperial', unitSource: 'project' })
  })

  test('English changes nothing', () => {
    useViewer.setState({ unitDefault: 'imperial', unitExplicit: false })
    applyLocale('en')
    expect(useViewer.getState().unitDefault).toBe('imperial')
  })
})
