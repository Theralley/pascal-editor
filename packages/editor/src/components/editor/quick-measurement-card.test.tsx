import { afterEach, expect, test } from 'bun:test'
import { setLocale } from '../../i18n'
import type { LocalizedQuickMeasurementReport } from '../../lib/quick-measurement'
import { renderCurrentMarkup } from '../../test-utils/render-current-markup'
import { QuickMeasurementCard } from './quick-measurement-card'

afterEach(() => setLocale('en'))

const report = (label: string): LocalizedQuickMeasurementReport => ({
  title: 'Wall',
  kindLabel: 'Wall',
  anchor: [0, 0, 0],
  metrics: [
    {
      key: 'length',
      label,
      sourceLabel: 'Length',
      abbreviation: 'L',
      quantity: 'length',
      value: 2,
    },
  ],
})

test("a kind that translates a common quantity still gets the card's own name and abbreviation", () => {
  setLocale('sv')
  const html = renderCurrentMarkup(
    <QuickMeasurementCard
      lensState="live"
      metricNotation="meters"
      report={report('Egen längd')}
      unit="metric"
    />,
  )
  expect(html).toContain('>Längd<')
  expect(html).not.toContain('Egen längd')
})
