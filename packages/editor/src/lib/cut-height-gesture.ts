import { WALL_CUT_HEIGHT_MAX, WALL_CUT_HEIGHT_MIN } from '@pascal-app/viewer'

type Deps = {
  requestFrame: (callback: () => void) => number
  cancelFrame: (id: number) => void
  /** Shows the height without saving it. */
  preview: (height: number) => void
  /** Saves the pick for the project the gesture began on. */
  save: (height: number, projectId: string | null) => void
  currentProjectId: () => string | null
}

/**
 * One drag of the cut height: a preview once per frame at most, then a single save when the
 * gesture ends, to the project it began on even if that project is closed meanwhile.
 */
export function createCutHeightGesture(deps: Deps) {
  let pending: { height: number; projectId: string | null } | null = null
  let frame: number | null = null

  return {
    move(height: number) {
      pending = { height, projectId: pending ? pending.projectId : deps.currentProjectId() }
      frame ??= deps.requestFrame(() => {
        frame = null
        if (pending) deps.preview(pending.height)
      })
    },
    /** Ends the gesture; false when none was under way. */
    commit(): boolean {
      if (frame !== null) deps.cancelFrame(frame)
      frame = null
      const done = pending
      pending = null
      if (done) deps.save(done.height, done.projectId)
      return done !== null
    },
  }
}

const KEY_STEPS: Record<string, number> = {
  ArrowLeft: -0.01,
  ArrowRight: 0.01,
  PageDown: -0.1,
  PageUp: 0.1,
}

/**
 * The height a key sets while the slider's menu row is focused, or null for a key the menu keeps
 * (Up and Down move between its rows).
 */
export function cutHeightKeyTarget(key: string, current: number): number | null {
  const clamp = (height: number) =>
    Math.min(WALL_CUT_HEIGHT_MAX, Math.max(WALL_CUT_HEIGHT_MIN, Math.round(height * 100) / 100))
  if (key === 'Home') return WALL_CUT_HEIGHT_MIN
  if (key === 'End') return WALL_CUT_HEIGHT_MAX
  const step = KEY_STEPS[key]
  return step === undefined ? null : clamp(current + step)
}
