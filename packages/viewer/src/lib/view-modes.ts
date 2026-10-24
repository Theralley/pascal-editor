import type { LevelMode, WallMode } from '../store/use-viewer'

/** The wall modes every view control offers, in the order they are listed. */
export const WALL_MODE_OPTIONS: readonly { value: WallMode; label: string }[] = [
  { value: 'up', label: 'Up' },
  { value: 'cutaway', label: 'Cutaway' },
  { value: 'down', label: 'Down' },
  { value: 'translucent', label: 'Translucent' },
]

/** The level modes every view control offers. `manual` is not a pick: it is where the levels were left by hand. */
export const LEVEL_MODE_OPTIONS: readonly { value: Exclude<LevelMode, 'manual'>; label: string }[] =
  [
    { value: 'stacked', label: 'Stack' },
    { value: 'exploded', label: 'Exploded' },
    { value: 'solo', label: 'Solo' },
  ]

const WALL_STEPS: readonly WallMode[] = ['down', 'cutaway', 'up']

/** Translucent walls stand at the cutaway's height, so a step from it goes the same way. */
export function stepWallMode(mode: WallMode, direction: 'up' | 'down'): WallMode {
  const index = WALL_STEPS.indexOf(mode === 'translucent' ? 'cutaway' : mode)
  const next = Math.min(WALL_STEPS.length - 1, Math.max(0, index + (direction === 'up' ? 1 : -1)))
  return WALL_STEPS[next] ?? mode
}
