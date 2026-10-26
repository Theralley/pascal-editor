'use client'

import type { QuickMeasurementMetric } from '@pascal-app/core'
import { Crosshair, MapPin } from 'lucide-react'
import { memo } from 'react'
import { type Locale, useLocale, useT } from '../../i18n'
import { formatAreaLabel, formatLinearMeasurement, formatVolumeLabel } from '../../lib/measurements'
import type { LocalizedQuickMeasurementReport } from '../../lib/quick-measurement'
import { messages } from './messages'

function formatMetric(
  metric: QuickMeasurementMetric,
  unit: 'metric' | 'imperial',
  metricNotation: 'meters' | 'millimeters',
  locale: Locale,
): string {
  if (metric.quantity === 'area') return formatAreaLabel(metric.value, unit, 2, locale)
  if (metric.quantity === 'volume') return formatVolumeLabel(metric.value, unit, 2, locale)
  return formatLinearMeasurement(metric.value, unit, metricNotation, locale)
}

// Reports come from the node kinds in English; the card shows the quantities in the active language.
const METRIC_NAMES = {
  Length: 'length',
  Height: 'height',
  Surface: 'surface',
  Thickness: 'thickness',
  Perimeter: 'perimeter',
  Footprint: 'footprint',
} as const
const NOTE_KEYS = {
  'Gross face area before openings.': 'quick.note.grossFace',
  'Surface excludes slab openings.': 'quick.note.slabOpenings',
  'Footprint only — room envelope not proven.': 'quick.note.footprintOnly',
} as const

export const QuickMeasurementCard = memo(function QuickMeasurementCard({
  report,
  unit,
  metricNotation,
  lensState,
}: {
  report: LocalizedQuickMeasurementReport
  unit: 'metric' | 'imperial'
  metricNotation: 'meters' | 'millimeters'
  lensState: 'live' | 'pinned'
}) {
  const locale = useLocale()
  const t = useT(messages)
  const pinned = lensState === 'pinned'
  const metricLabel = (metric: LocalizedQuickMeasurementReport['metrics'][number]) => {
    const name = METRIC_NAMES[(metric.sourceLabel ?? metric.label) as keyof typeof METRIC_NAMES]
    return name
      ? { label: t(`quick.metric.${name}`), abbreviation: t(`quick.abbr.${name}`) }
      : { label: metric.label, abbreviation: metric.abbreviation }
  }
  const noteKey = report.note
    ? NOTE_KEYS[(report.sourceNote ?? report.note) as keyof typeof NOTE_KEYS]
    : undefined

  return (
    <div
      aria-label={t(pinned ? 'quick.pinnedLabel' : 'quick.liveLabel', {
        kind: report.kindLabel.toLowerCase(),
      })}
      className="w-full min-w-0 overflow-hidden rounded-lg border border-border/45 bg-background/96 text-foreground shadow-elevation-3 backdrop-blur-xl"
      data-quick-measure-card
      data-quick-measure-state={lensState}
      role="status"
    >
      <div className="flex items-center gap-2 border-border/60 border-b px-3 py-2">
        {pinned ? (
          <MapPin aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-foreground" />
        ) : (
          <Crosshair aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        )}
        <div className="min-w-0">
          <div className="truncate font-medium text-xs leading-tight">{report.title}</div>
          <div className="text-[10px] text-muted-foreground leading-tight">{report.kindLabel}</div>
        </div>
        <span className="ml-auto shrink-0 rounded-full bg-muted px-2 py-0.5 font-medium text-[10px] text-muted-foreground">
          {pinned ? t('quick.pinned') : t('quick.liveLens')}
        </span>
      </div>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(6.5rem,1fr))] gap-1.5 p-2">
        {report.metrics.map((metric) => {
          const { label, abbreviation } = metricLabel(metric)
          return (
            <div className="min-w-0 rounded-md bg-muted/60 px-2.5 py-1.5" key={metric.key}>
              <div className="flex items-baseline gap-1 text-[10px] text-muted-foreground">
                <span className="font-medium text-foreground/80">{abbreviation}</span>
                <span className="truncate">{label}</span>
              </div>
              <div className="mt-0.5 truncate font-mono font-medium text-xs tabular-nums">
                {formatMetric(metric, unit, metricNotation, locale)}
              </div>
            </div>
          )
        })}
      </div>

      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 border-border/60 border-t px-3 py-1.5 text-[10px] text-muted-foreground leading-tight">
        {report.note ? (
          <span className="min-w-48 flex-1">{noteKey ? t(noteKey) : report.note}</span>
        ) : (
          <span />
        )}
        <span className="ml-auto shrink-0 text-foreground/70">
          {pinned ? t('quick.replace') : t('quick.pin')}
        </span>
      </div>
    </div>
  )
})
