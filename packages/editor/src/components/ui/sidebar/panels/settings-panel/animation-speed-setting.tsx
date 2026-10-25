'use client'

import { ANIMATION_SPEEDS, normalizeAnimationSpeed } from '@pascal-app/viewer'
import { useT } from '../../../../../i18n'
import { formatDecimal } from '../../../../../lib/measurements'
import useConstructionReveal from '../../../../../store/use-construction-reveal'
import { SegmentedControl } from '../../../controls/segmented-control'
import { messages } from './messages'

/** How fast what the AI builds plays: ×0.5 to ×2, for the Full and Framing animations and their undo. */
export function AnimationSpeedSetting() {
  const t = useT(messages)
  const level = useConstructionReveal((state) => state.level)
  const speed = useConstructionReveal((state) => state.speed)
  const setSpeed = useConstructionReveal((state) => state.setSpeed)
  const off = level === 'off'
  // The control's values are strings; a step is its number as text.
  const options = ANIMATION_SPEEDS.map((step) => {
    const factor = formatDecimal(step, { maxFractionDigits: 2 })
    return {
      label: `×${factor}`,
      value: String(step),
      title: step === 1 ? t('speed.normal') : t('speed.factor', { speed: factor }),
    }
  })
  return (
    <div className="space-y-2 py-1">
      <div className="space-y-0.5">
        <p className="font-medium text-sm">{t('speed.label')}</p>
        <p className="text-muted-foreground text-xs">
          {off ? t('speed.offHint') : t('speed.hint')}
        </p>
      </div>
      <SegmentedControl
        aria-label={t('speed.label')}
        onChange={(value) => setSpeed(normalizeAnimationSpeed(Number(value)))}
        options={options}
        value={String(speed)}
      />
    </div>
  )
}
