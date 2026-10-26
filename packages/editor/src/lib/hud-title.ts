import { type IconRef, nodeRegistry, type TerrainVerb } from '@pascal-app/core'
import { definitionText, getLocale, type Locale, type MessageKey } from '../i18n'
import { formatMessage } from '../i18n/messages'
import type { ContinuationMode } from './continuation'
import { messages } from './help-messages'
import {
  getWallDrawVariantInfo,
  type WallDrawVariant,
  wallDrawVariantOf,
} from './wall-draw-variant'

/**
 * The contextual helper panel's header: what is in hand, and its key. The name is a catalog `key`
 * the panel translates when it renders (so it follows the language and hydrates like the rest),
 * or a `label` that is a name as it is — a kind's own.
 */
export type HudTitle = {
  key?: HelpKey
  vars?: Record<string, string>
  label?: string
  icon?: IconRef
  shortcut?: string
}

const url = (src: string): IconRef => ({ kind: 'url', src })

export type HelpKey = MessageKey<typeof messages>
type TitleKey = Extract<keyof (typeof messages)['en'], `title.${string}`>

const hudTitle = (key: TitleKey, icon: IconRef, shortcut?: string): HudTitle => ({
  key,
  icon,
  shortcut,
})

/** The header's words in the active language, from the renderer's own `t`. */
export function hudTitleText(
  title: HudTitle,
  t: (key: HelpKey, vars?: Record<string, string>) => string,
): string {
  return title.key ? t(title.key, title.vars) : (title.label ?? '')
}

/** Tools with a global arming key (`use-keyboard.ts`). */
const TOOL_SHORTCUTS: Record<string, string> = {
  wall: 'B',
  measurement: 'M',
}

export const SELECT_HUD_TITLE = hudTitle('title.select', url('/icons/select.webp'), 'V')
export const PAINT_HUD_TITLE = hudTitle('title.paint', url('/icons/paint.webp'))
export const ERASE_HUD_TITLE = hudTitle('title.erase', { kind: 'iconify', name: 'lucide:eraser' })
export const PICK_MATERIAL_HUD_TITLE = hudTitle('title.pickMaterial', {
  kind: 'iconify',
  name: 'lucide:pipette',
})
export const ROTATE_HUD_TITLE = hudTitle('title.rotate', url('/icons/rotate.webp'))
export const MOVE_SELECTION_HUD_TITLE = hudTitle('title.moveSelection', url('/icons/pan.webp'))
export const MOVE_ROOM_HUD_TITLE = hudTitle('title.moveRoom', url('/icons/room.webp'))
export const RESIZE_HUD_TITLE = hudTitle('title.resize', url('/icons/resize.webp'))
export const DIVIDE_ROOM_HUD_TITLE = hudTitle('title.divideRoom', url('/icons/divide-room.webp'))
export const MEZZANINE_HUD_TITLE = hudTitle('title.mezzanine', url('/icons/mezzanine.webp'))
export const OPENING_HUD_TITLE = hudTitle('title.cutOpening', {
  kind: 'iconify',
  name: 'lucide:square-dashed',
})
export const TERRACE_HUD_TITLE = hudTitle('title.terrace', url('/icons/floor.webp'))
export const SMART_MEASURE_HUD_TITLE = hudTitle(
  'title.smartMeasure',
  url('/icons/measure.webp'),
  'M',
)

export function paintRegionHudTitle(mode: 'rectangle' | 'polygon'): HudTitle {
  return hudTitle(
    mode === 'rectangle' ? 'title.paintRectangle' : 'title.paintShape',
    url('/icons/paint.webp'),
  )
}

export function terrainHudTitle(verb: TerrainVerb): HudTitle {
  const key =
    verb === 'raise'
      ? 'title.raiseTerrain'
      : verb === 'lower'
        ? 'title.lowerTerrain'
        : verb === 'flatten'
          ? 'title.levelTerrain'
          : 'title.smoothTerrain'
  return hudTitle(key, url(`/icons/terrain-${verb}.webp`))
}

const WALL_VARIANT_KEYS = {
  rectangle: 'continuation.wallRectangle',
  polygon: 'continuation.wallRoom',
  walls: 'continuation.wallSingle',
} as const satisfies Record<WallDrawVariant, keyof (typeof messages)['en']>

/** What the Build panel calls the wall tool's Rooms variant, in the active language. */
export function wallVariantLabel(variant: WallDrawVariant, locale: Locale = getLocale()): string {
  return formatMessage(messages, locale, WALL_VARIANT_KEYS[variant])
}

/** A kind's registry name and icon, optionally behind a verb ("Move door"). */
export function nodeKindHudTitle(
  kind: string,
  verb?: 'move' | 'edit' | 'split',
  locale: Locale = getLocale(),
): HudTitle | null {
  const definition = nodeRegistry.get(kind)
  const presentation = definition?.presentation
  if (!presentation) return null
  const name = definitionText(definition, presentation.label, locale)
  return {
    ...(verb
      ? { key: `title.${verb}` as const, vars: { name: name.toLowerCase() } }
      : { label: name }),
    icon: presentation.icon,
    shortcut: verb ? undefined : TOOL_SHORTCUTS[kind],
  }
}

/**
 * The armed build tool. The wall tool is named after the Rooms variant it draws
 * (Rectangle room / Polygon room / Walls) — the tile the user picked.
 */
export function toolHudTitle(
  tool: string,
  wallMode: ContinuationMode,
  locale: Locale = getLocale(),
): HudTitle | null {
  if (tool === 'wall') {
    const variant = getWallDrawVariantInfo(wallDrawVariantOf(wallMode))
    return {
      key: WALL_VARIANT_KEYS[variant.id],
      icon: url(variant.iconSrc),
      shortcut: TOOL_SHORTCUTS.wall,
    }
  }
  return nodeKindHudTitle(tool, undefined, locale)
}
