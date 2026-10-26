import {
  type AnyNode,
  getCatalogMaterialById,
  parseMaterialRef,
  roomSideFaces,
  type SceneMaterial,
  type SceneMaterialId,
  WALL_FACE_REGION_LIMIT,
  type WallFace,
  type WallFaceRegion,
  type WallNode,
} from '@pascal-app/core'
import { defineMessages, getLocale, type Locale } from '../i18n'
import { formatMessage } from '../i18n/messages'
import { getLinearUnitLabel, type LinearUnit, metersToLinearUnit } from './measurements'

// Rows for the wall panel's "Paint regions" list: finish swatch + name, the
// face in room terms when the wall has a room on exactly one side, and the
// bounds in the viewer unit.

const FALLBACK_SWATCH_COLOR = '#d4d4d8'

const messages = defineMessages({
  en: {
    inside: 'Inside',
    outside: 'Outside',
    faceA: 'Face A',
    faceB: 'Face B',
    customFinish: 'Custom finish',
    libraryFinish: 'Library finish',
    wholeFace: 'Whole face',
    along: 'along',
    high: 'high',
    above: 'Above {value} {unit}',
    fromAlong: 'From {value} {unit} along',
    upTo: '0–{high} {unit} {axis}',
    between: '{low}–{high} {unit} {axis}',
    capBoth: 'Up to {limit} regions per face',
    capOne: '{face} is full: up to {limit} regions per face',
  },
  sv: {
    inside: 'Insida',
    outside: 'Utsida',
    faceA: 'Sida A',
    faceB: 'Sida B',
    customFinish: 'Egen yta',
    libraryFinish: 'Bibliotekets yta',
    wholeFace: 'Hela sidan',
    along: 'längs',
    high: 'högt',
    above: 'Över {value} {unit}',
    fromAlong: 'Från {value} {unit} längs',
    upTo: '0–{high} {unit} {axis}',
    between: '{low}–{high} {unit} {axis}',
    capBoth: 'Högst {limit} ytor per sida',
    capOne: '{face} är full: högst {limit} ytor per sida',
  },
})

export type WallRegionFinish = { name: string; color: string; imageUrl?: string }

export type WallRegionRow = {
  id: string
  face: WallFace
  faceLabel: string
  finish: WallRegionFinish
  boundsText: string
}

/** "Inside" / "Outside" when a room sits on exactly one side of the wall, else "Face A" / "Face B". */
export function wallRegionFaceLabels(
  nodes: Readonly<Record<string, AnyNode>>,
  wallId: string,
  locale: Locale = getLocale(),
): Record<WallFace, string> {
  try {
    const sides = roomSideFaces(nodes as Parameters<typeof roomSideFaces>[0], wallId)
    if (sides.inside && sides.outside) {
      return {
        [sides.inside]: formatMessage(messages, locale, 'inside'),
        [sides.outside]: formatMessage(messages, locale, 'outside'),
      } as Record<WallFace, string>
    }
  } catch {
    // Not a wall (any more): fall through to the neutral labels.
  }
  return {
    a: formatMessage(messages, locale, 'faceA'),
    b: formatMessage(messages, locale, 'faceB'),
  }
}

/** Name and swatch for a region's finish ref (library or scene material). */
export function describeRegionFinish(
  ref: string,
  materials: Readonly<Record<SceneMaterialId, SceneMaterial>>,
  locale: Locale = getLocale(),
): WallRegionFinish {
  const parsed = parseMaterialRef(ref)
  if (parsed?.kind === 'scene') {
    const scene = materials[parsed.id as SceneMaterialId]
    return {
      name: scene?.name ?? formatMessage(messages, locale, 'customFinish'),
      color: scene?.material.properties?.color ?? FALLBACK_SWATCH_COLOR,
      ...(scene?.material.texture?.url ? { imageUrl: scene.material.texture.url } : {}),
    }
  }
  if (parsed?.kind === 'library') {
    const item = getCatalogMaterialById(parsed.id)
    const imageUrl = item?.previewThumbnailUrl ?? item?.preset.maps.albedoMap
    return {
      name: item?.label ?? formatMessage(messages, locale, 'libraryFinish'),
      color: item?.previewColor ?? item?.preset.mapProperties.color ?? FALLBACK_SWATCH_COLOR,
      ...(imageUrl ? { imageUrl } : {}),
    }
  }
  return { name: formatMessage(messages, locale, 'customFinish'), color: FALLBACK_SWATCH_COLOR }
}

function range(
  low: number | undefined,
  high: number | undefined,
  unit: LinearUnit,
  axis: 'along' | 'high',
  locale: Locale,
) {
  const number = new Intl.NumberFormat(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    useGrouping: false,
  })
  const value = (meters: number) => number.format(metersToLinearUnit(meters, unit))
  const vars = { unit: getLinearUnitLabel(unit), axis: formatMessage(messages, locale, axis) }
  if (low === undefined && high === undefined) return null
  if (low === undefined)
    return formatMessage(messages, locale, 'upTo', { ...vars, high: value(high!) })
  if (high === undefined)
    return axis === 'high'
      ? formatMessage(messages, locale, 'above', { ...vars, value: value(low) })
      : formatMessage(messages, locale, 'fromAlong', { ...vars, value: value(low) })
  return formatMessage(messages, locale, 'between', { ...vars, low: value(low), high: value(high) })
}

/** "1.20–2.40 m along, 0–0.90 m high"; absent bounds run to the face edge. */
export function formatRegionBounds(
  region: Pick<WallFaceRegion, 'u0' | 'u1' | 'v0' | 'v1'>,
  unit: LinearUnit,
  locale: Locale = getLocale(),
): string {
  const parts = [
    range(region.u0, region.u1, unit, 'along', locale),
    range(region.v0, region.v1, unit, 'high', locale),
  ].filter((part): part is string => part !== null)
  return parts.length > 0 ? parts.join(', ') : formatMessage(messages, locale, 'wholeFace')
}

export function wallRegionRows(
  wall: Pick<WallNode, 'faceRegions'>,
  faceLabels: Record<WallFace, string>,
  materials: Readonly<Record<SceneMaterialId, SceneMaterial>>,
  unit: LinearUnit,
  locale: Locale = getLocale(),
): WallRegionRow[] {
  const regions = wall.faceRegions ?? []
  return (['a', 'b'] as const).flatMap((face) =>
    regions
      .filter((region) => region.face === face)
      .map((region) => ({
        id: region.id,
        face,
        faceLabel: faceLabels[face],
        finish: describeRegionFinish(region.finish, materials, locale),
        boundsText: formatRegionBounds(region, unit, locale),
      })),
  )
}

/** Faces that already hold the maximum number of regions. */
export function fullWallFaces(wall: Pick<WallNode, 'faceRegions'>): WallFace[] {
  const regions = wall.faceRegions ?? []
  return (['a', 'b'] as const).filter(
    (face) => regions.filter((region) => region.face === face).length >= WALL_FACE_REGION_LIMIT,
  )
}

/** The cap notice under the list, naming the full face when only one is. */
export function wallRegionCapNotice(
  wall: Pick<WallNode, 'faceRegions'>,
  faceLabels: Record<WallFace, string>,
  locale: Locale = getLocale(),
): string | null {
  const full = fullWallFaces(wall)
  const limit = WALL_FACE_REGION_LIMIT
  if (full.length === 0) return null
  if (full.length === 2) return formatMessage(messages, locale, 'capBoth', { limit })
  return formatMessage(messages, locale, 'capOne', { face: faceLabels[full[0]!], limit })
}
