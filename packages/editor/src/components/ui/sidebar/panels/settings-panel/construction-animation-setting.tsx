'use client'

import type { ConstructionRevealLevel } from '@pascal-app/viewer'
import { type MessageKey, useT } from '../../../../../i18n'
import {
  chooseConstructionLevel,
  useConstructionRevealLevel,
  useFramingAvailable,
} from '../../../../../store/use-construction-reveal'
import { SegmentedControl } from '../../../controls/segmented-control'
import { Badge } from '../../../primitives/badge'
import { Tooltip, TooltipContent, TooltipTrigger } from '../../../primitives/tooltip'
import { messages } from './messages'

const OPTIONS: {
  labelKey: MessageKey<typeof messages>
  value: ConstructionRevealLevel
  titleKey: MessageKey<typeof messages>
  badge?: string
}[] = [
  { labelKey: 'construction.off', value: 'off', titleKey: 'construction.offHint' },
  { labelKey: 'construction.simple', value: 'simple', titleKey: 'construction.simpleHint' },
  { labelKey: 'construction.full', value: 'full', titleKey: 'construction.fullHint' },
  {
    labelKey: 'construction.framing',
    value: 'framing',
    titleKey: 'construction.framingHint',
    // The plugin that draws the framing is a Pro one.
    badge: 'Pro',
  },
]

/**
 * The four levels as the control offers them: Framing is greyed out, with the reason as its tip,
 * where the project has no plugin that draws the framing.
 */
export function constructionLevelOptions(framingAvailable: boolean) {
  return OPTIONS.map((option) =>
    option.value === 'framing' && !framingAvailable
      ? { ...option, titleKey: 'construction.framingNeedsArchitect' as const, disabled: true }
      : { ...option, disabled: false },
  )
}

/** How much of an AI build plays as a construction. */
export function ConstructionAnimationSetting() {
  const t = useT(messages)
  // What plays: the person's choice, or Framing where the framing plugin is installed and Full where it is not.
  const level = useConstructionRevealLevel()
  const framingAvailable = useFramingAvailable()
  const current = OPTIONS.find((option) => option.value === level)
  const options = constructionLevelOptions(framingAvailable).map((option) => {
    const text = t(option.labelKey)
    const title = t(option.titleKey)
    const label = option.badge ? (
      <span className="inline-flex items-center gap-1.5">
        {text}
        <Badge label={option.badge} />
      </span>
    ) : (
      text
    )
    if (!option.disabled) return { value: option.value, title, label }
    return {
      value: option.value,
      disabled: true,
      label: (
        <Tooltip>
          <TooltipTrigger asChild>
            <span>{label}</span>
          </TooltipTrigger>
          <TooltipContent>{title}</TooltipContent>
        </Tooltip>
      ),
    }
  })
  return (
    <div className="space-y-2 py-1">
      <div className="space-y-0.5">
        <p className="font-medium text-sm">{t('construction.label')}</p>
        <p className="text-muted-foreground text-xs">{current && t(current.titleKey)}</p>
      </div>
      <SegmentedControl
        aria-label={t('construction.label')}
        onChange={(next) => chooseConstructionLevel(next, framingAvailable)}
        options={options}
        value={level}
      />
    </div>
  )
}
