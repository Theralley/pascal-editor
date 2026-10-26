import type { Locale } from '../i18n'
import type { ContinuationMode } from './continuation'
import { wallVariantLabel } from './hud-title'
import { getWallDrawVariantInfo, wallDrawVariantOf } from './wall-draw-variant'

/**
 * The cursor bubble's icon for the wall tool: the Rooms variant in hand
 * (Rectangle / Polygon / Walls), the same art as the Build panel tile.
 */
export function wallCursorIcon(
  mode: ContinuationMode,
  locale?: Locale,
): { label: string; iconSrc: string } {
  const variant = getWallDrawVariantInfo(wallDrawVariantOf(mode))
  return { label: wallVariantLabel(wallDrawVariantOf(mode), locale), iconSrc: variant.iconSrc }
}
