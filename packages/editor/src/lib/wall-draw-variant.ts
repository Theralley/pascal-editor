import { emitter } from '@pascal-app/core'
import useEditor from '../store/use-editor'
import type { ContinuationMode } from './continuation'

/**
 * How the wall tool draws, picked from the Build panel's Rooms group before
 * drawing starts. Stored as the wall's continuation mode (persisted with the
 * editor preferences), so the choice survives tool switches and reloads.
 */
export type WallDrawVariant = 'rectangle' | 'polygon' | 'walls'

export type WallDrawVariantInfo = {
  id: WallDrawVariant
  /** The wall continuation mode the tool reads. */
  mode: ContinuationMode
  iconSrc: string
}

export const WALL_DRAW_VARIANTS: readonly WallDrawVariantInfo[] = [
  {
    id: 'rectangle',
    mode: 'rectangle',
    iconSrc: '/icons/room.webp',
  },
  {
    id: 'polygon',
    mode: 'room',
    iconSrc: '/icons/polygon-room.webp',
  },
  {
    id: 'walls',
    mode: 'single',
    iconSrc: '/icons/wall.webp',
  },
]

export function getWallDrawVariantInfo(variant: WallDrawVariant): WallDrawVariantInfo {
  return WALL_DRAW_VARIANTS.find((info) => info.id === variant) ?? WALL_DRAW_VARIANTS[1]!
}

export function wallDrawVariantOf(mode: ContinuationMode): WallDrawVariant {
  return WALL_DRAW_VARIANTS.find((info) => info.mode === mode)?.id ?? 'polygon'
}

export function getWallDrawVariant(): WallDrawVariant {
  return wallDrawVariantOf(useEditor.getState().getContinuation('wall'))
}

export function useWallDrawVariant(): WallDrawVariant {
  return useEditor((state) => wallDrawVariantOf(state.getContinuation('wall')))
}

/**
 * Pick how the wall tool draws. Callers arm the wall tool themselves; switching
 * while it is armed drops the in-flight draft so a half-drawn chain never
 * finishes as a rectangle.
 */
export function selectWallDrawVariant(variant: WallDrawVariant): void {
  const editor = useEditor.getState()
  const { mode } = getWallDrawVariantInfo(variant)
  if (editor.getContinuation('wall') === mode) return
  if (editor.mode === 'build' && editor.tool === 'wall') emitter.emit('tool:cancel')
  editor.setContinuation('wall', mode)
}
