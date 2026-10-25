'use client'

import { useViewer, WALL_CUT_HEIGHT_MAX, WALL_CUT_HEIGHT_MIN } from '@pascal-app/viewer'
import { useEffect, useRef, useState } from 'react'
import { formatLinearMeasurement } from '../../../lib/measurements'
import { cn } from '../../../lib/utils'

/**
 * Where low walls are cut, in the person's units. Shown only while walls are Low. A drag previews
 * the cut once a frame without saving, and the pick is saved once, when the gesture ends.
 */
export function CutHeightSlider({ className }: { className?: string }) {
  const wallMode = useViewer((state) => state.wallMode)
  const saved = useViewer((state) => state.wallCutHeight)
  const unit = useViewer((state) => state.unit)
  const metricNotation = useViewer((state) => state.metricNotation)
  const [dragging, setDragging] = useState<number | null>(null)
  const pending = useRef<number | null>(null)
  const frame = useRef<number | null>(null)

  const commit = () => {
    if (frame.current !== null) cancelAnimationFrame(frame.current)
    frame.current = null
    const value = pending.current
    pending.current = null
    setDragging(null)
    if (value !== null) useViewer.getState().setWallCutHeight(value)
  }
  const commitOnUnmount = useRef(commit)
  commitOnUnmount.current = commit
  useEffect(() => () => commitOnUnmount.current(), [])

  if (wallMode !== 'low') return null

  const shown = dragging ?? saved
  const text = formatLinearMeasurement(shown, unit, metricNotation)

  return (
    <div className={cn('flex items-center gap-2 px-2 py-1.5 text-xs', className)}>
      <label className="shrink-0 text-muted-foreground" htmlFor="wall-cut-height">
        Cut height
      </label>
      <input
        aria-valuetext={text}
        className="min-w-0 flex-1 accent-current"
        id="wall-cut-height"
        max={WALL_CUT_HEIGHT_MAX}
        min={WALL_CUT_HEIGHT_MIN}
        onBlur={commit}
        onChange={(event) => {
          const value = Number(event.target.value)
          setDragging(value)
          pending.current = value
          frame.current ??= requestAnimationFrame(() => {
            frame.current = null
            if (pending.current !== null)
              useViewer.getState().overrideView({ wallCutHeight: pending.current })
          })
        }}
        onKeyDown={(event) => {
          // A menu around the slider would take the arrow keys to move between its items.
          if (event.key !== 'Escape' && event.key !== 'Tab') event.stopPropagation()
        }}
        onKeyUp={commit}
        onPointerUp={commit}
        step={0.01}
        type="range"
        value={shown}
      />
      <span className="w-12 shrink-0 text-right font-mono tabular-nums">{text}</span>
    </div>
  )
}
