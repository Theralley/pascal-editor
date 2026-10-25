'use client'

import { useViewer, WALL_CUT_HEIGHT_MAX, WALL_CUT_HEIGHT_MIN } from '@pascal-app/viewer'
import { useEffect, useId, useRef, useState } from 'react'
import { createCutHeightGesture, cutHeightKeyTarget } from '../../../lib/cut-height-gesture'
import { formatLinearMeasurement } from '../../../lib/measurements'
import { cn } from '../../../lib/utils'
import { DropdownMenuItem } from '../primitives/dropdown-menu'

const ROW_CLASS = 'flex items-center gap-2 px-2 py-1.5 text-xs'

/**
 * The slider itself, in the person's units. A drag previews the cut once a frame without saving,
 * and the pick is saved once, when the gesture ends.
 */
export function CutHeightControl({ className }: { className?: string }) {
  const saved = useViewer((state) => state.wallCutHeight)
  const unit = useViewer((state) => state.unit)
  const metricNotation = useViewer((state) => state.metricNotation)
  const [dragging, setDragging] = useState<number | null>(null)
  const id = useId()
  const gesture = useRef<ReturnType<typeof createCutHeightGesture> | null>(null)
  gesture.current ??= createCutHeightGesture({
    requestFrame: (callback) => requestAnimationFrame(callback),
    cancelFrame: (frame) => cancelAnimationFrame(frame),
    preview: (height) => useViewer.getState().overrideView({ wallCutHeight: height }),
    save: (height, projectId) => useViewer.getState().setWallCutHeight(height, projectId),
    currentProjectId: () => useViewer.getState().projectId,
  })

  const commit = () => {
    gesture.current?.commit()
    setDragging(null)
  }
  useEffect(() => () => void gesture.current?.commit(), [])

  const shown = dragging ?? saved
  const text = formatLinearMeasurement(shown, unit, metricNotation)

  return (
    <div className={cn(ROW_CLASS, 'w-full', className)}>
      <label className="shrink-0 text-muted-foreground" htmlFor={id}>
        Cut height
      </label>
      <input
        aria-valuetext={text}
        className="min-w-0 flex-1 accent-current"
        id={id}
        max={WALL_CUT_HEIGHT_MAX}
        min={WALL_CUT_HEIGHT_MIN}
        onBlur={commit}
        onChange={(event) => {
          const value = Number(event.target.value)
          setDragging(value)
          gesture.current?.move(value)
        }}
        onKeyDown={(event) => {
          // The menu around the slider would take these keys to move between its rows.
          if (event.key !== 'Escape' && event.key !== 'Tab') event.stopPropagation()
        }}
        onKeyUp={commit}
        // The menu would focus its row as the pointer moves, taking focus off a drag.
        onPointerLeave={(event) => event.stopPropagation()}
        onPointerMove={(event) => event.stopPropagation()}
        onPointerUp={commit}
        step={0.01}
        type="range"
        value={shown}
      />
      <span className="w-12 shrink-0 text-right font-mono tabular-nums">{text}</span>
    </div>
  )
}

/**
 * The cut height as a row of a Display menu, shown only while walls are Low. The row takes the
 * menu's focus like any other: Left and Right, Page Up and Down, Home and End set the height
 * while it is focused, and Up and Down move on to the next row.
 */
export function CutHeightSlider() {
  const wallMode = useViewer((state) => state.wallMode)
  if (wallMode !== 'low') return null

  return (
    <DropdownMenuItem
      className="p-0"
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return
        const viewer = useViewer.getState()
        const target = cutHeightKeyTarget(event.key, viewer.wallCutHeight)
        if (target === null) return
        event.preventDefault()
        event.stopPropagation()
        viewer.setWallCutHeight(target)
      }}
      onSelect={(event) => event.preventDefault()}
    >
      <CutHeightControl />
    </DropdownMenuItem>
  )
}
