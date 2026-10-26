import type { AnyNode } from '@pascal-app/core'
import { getLocale, type Locale } from '../i18n'

/** A titled group of the room-name combobox. */
export type RoomNameSection = { id: string; title: string; names: readonly string[] }

/** What the room reads as, which decides the section shown first. */
export type RoomNameContext = 'room' | 'outdoor' | 'mezzanine'

type RoomNameSectionSource = {
  id: string
  title: Record<Locale, string>
  names: Record<Locale, readonly string[]>
}

/** Names for any room, in the order the dropdown lists their sections. Suggestions only: a picked name is stored as is. */
const ROOM_NAME_CATALOG: readonly RoomNameSectionSource[] = [
  {
    id: 'living',
    title: { en: 'Living', sv: 'Vardag' },
    names: {
      en: [
        'Living room',
        'Family room',
        'Dining room',
        'Kitchen',
        'Kitchenette',
        'Pantry',
        'Lounge',
        'Den',
        'Library',
        'Playroom',
        'Home cinema',
        'Games room',
        'Sunroom',
      ],
      sv: [
        'Vardagsrum',
        'Allrum',
        'Matsal',
        'Kök',
        'Pentry',
        'Skafferi',
        'Lounge',
        'Mysrum',
        'Bibliotek',
        'Lekrum',
        'Hemmabio',
        'Spelrum',
        'Uterum',
      ],
    },
  },
  {
    id: 'sleeping',
    title: { en: 'Sleeping', sv: 'Sova' },
    names: {
      en: [
        'Bedroom',
        'Primary bedroom',
        'Guest room',
        "Kids' room",
        'Nursery',
        'Dressing room',
        'Walk-in closet',
      ],
      sv: [
        'Sovrum',
        'Stora sovrummet',
        'Gästrum',
        'Barnrum',
        'Babyrum',
        'Klädkammare',
        'Walk-in closet',
      ],
    },
  },
  {
    id: 'bathrooms',
    title: { en: 'Bathrooms', sv: 'Badrum' },
    names: {
      en: ['Bathroom', 'En-suite', 'Shower room', 'Toilet', 'Powder room'],
      sv: ['Badrum', 'Eget badrum', 'Duschrum', 'Toalett', 'Gästtoalett'],
    },
  },
  {
    id: 'work',
    title: { en: 'Work & hobbies', sv: 'Arbete och hobby' },
    names: {
      en: ['Office', 'Study', 'Studio', 'Workshop', 'Gym'],
      sv: ['Kontor', 'Arbetsrum', 'Ateljé', 'Verkstad', 'Gym'],
    },
  },
  {
    id: 'circulation',
    title: { en: 'Circulation', sv: 'Förflyttning' },
    names: {
      en: ['Entrance', 'Hallway', 'Corridor', 'Landing', 'Stairwell', 'Mudroom'],
      sv: ['Entré', 'Hall', 'Korridor', 'Trappavsats', 'Trapphus', 'Kapprum'],
    },
  },
  {
    id: 'utility',
    title: { en: 'Utility & storage', sv: 'Tvätt och förvaring' },
    names: {
      en: [
        'Laundry',
        'Utility room',
        'Storage',
        'Closet',
        'Boiler room',
        'Cellar',
        'Basement',
        'Attic',
        'Garage',
      ],
      sv: [
        'Tvättstuga',
        'Hushållsrum',
        'Förråd',
        'Garderob',
        'Pannrum',
        'Jordkällare',
        'Källarvåning',
        'Vind',
        'Garage',
      ],
    },
  },
  {
    id: 'outdoor',
    title: { en: 'Outdoor', sv: 'Utomhus' },
    names: {
      en: [
        'Garden',
        'Patio',
        'Terrace',
        'Balcony',
        'Porch',
        'Veranda',
        'Deck',
        'Courtyard',
        'Pool area',
        'Carport',
        'Garden shed',
      ],
      sv: [
        'Trädgård',
        'Uteplats',
        'Terrass',
        'Balkong',
        'Farstukvist',
        'Veranda',
        'Trädäck',
        'Innergård',
        'Poolområde',
        'Carport',
        'Trädgårdsskjul',
      ],
    },
  },
]

/** Only offered, and first, when the selection is a mezzanine. */
const MEZZANINE_NAME_CATALOG: RoomNameSectionSource = {
  id: 'mezzanine',
  title: { en: 'Mezzanine', sv: 'Entresol' },
  names: {
    en: ['Mezzanine', 'Loft', 'Reading nook', 'Gallery'],
    sv: ['Entresol', 'Loft', 'Läshörna', 'Galleri'],
  },
}

const inLocale = (source: RoomNameSectionSource, locale: Locale): RoomNameSection => ({
  id: source.id,
  title: source.title[locale],
  names: source.names[locale],
})

/** The catalog's sections in `locale`, in their usual order. */
export function roomNameCatalog(locale: Locale = getLocale()): RoomNameSection[] {
  return ROOM_NAME_CATALOG.map((source) => inLocale(source, locale))
}

/** The mezzanine section in `locale`. */
export function mezzanineNameSection(locale: Locale = getLocale()): RoomNameSection {
  return inLocale(MEZZANINE_NAME_CATALOG, locale)
}

/**
 * A mezzanine is one; a room reads as outdoor with no ceiling, without a wall
 * of its own (a terrace closed by separators) or when it is not a room inside
 * walls at all. Everything else is an indoor room.
 */
export function roomNameContext(nodes: Record<string, AnyNode>, zoneId: string): RoomNameContext {
  const zone = nodes[zoneId]
  if (zone?.type !== 'zone') return 'room'
  if (zone.floor?.support === 'open') return 'mezzanine'
  if (zone.spaceRole !== 'room' || zone.hasCeiling === false || !zone.boundaryWallIds.length)
    return 'outdoor'
  return 'room'
}

/** A name without the number the picker adds to a repeat: "Bedroom 2" → "Bedroom". */
export function baseRoomName(name: string) {
  return name.trim().replace(/\s+\d+$/, '')
}

/** The names the level's other rooms go by (a mezzanine's level is its host's). */
function otherRoomNames(nodes: Record<string, AnyNode>, zoneId: string) {
  const levelId = nodes[zoneId]?.parentId
  const names: string[] = []
  for (const node of Object.values(nodes)) {
    if (node.type !== 'zone' || node.id === zoneId || node.parentId !== levelId) continue
    const name = node.name?.trim()
    if (name) names.push(name)
  }
  return names
}

/** How many of the level's other rooms already go by `name` (numbered or not). */
export function roomNameUseCount(nodes: Record<string, AnyNode>, zoneId: string, name: string) {
  const wanted = name.trim().toLowerCase()
  return otherRoomNames(nodes, zoneId).filter(
    (other) => baseRoomName(other).toLowerCase() === wanted,
  ).length
}

/**
 * The name a picked suggestion becomes: itself while no other room on the
 * level has it, otherwise the first free "Name 2", "Name 3"…
 */
export function numberedRoomName(nodes: Record<string, AnyNode>, zoneId: string, name: string) {
  const taken = new Set(otherRoomNames(nodes, zoneId).map((other) => other.toLowerCase()))
  if (!taken.has(name.toLowerCase())) return name
  let index = 2
  while (taken.has(`${name} ${index}`.toLowerCase())) index++
  return `${name} ${index}`
}

/**
 * The combobox's sections for one room: the catalog, with the section its
 * context calls for first (Mezzanine, only for a mezzanine; Outdoor for an
 * outdoor room), then the rest in their usual order. Other rooms' names are
 * not offered — a name already used on the level is numbered when picked.
 */
export function roomNameSections(
  nodes: Record<string, AnyNode>,
  zoneId: string,
  locale: Locale = getLocale(),
): RoomNameSection[] {
  const context = roomNameContext(nodes, zoneId)
  const catalog = roomNameCatalog(locale)
  const first =
    context === 'mezzanine'
      ? [mezzanineNameSection(locale)]
      : context === 'outdoor'
        ? catalog.filter((section) => section.id === 'outdoor')
        : []
  return [...first, ...catalog.filter((section) => !first.some((other) => other.id === section.id))]
}
