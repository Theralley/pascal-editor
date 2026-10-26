import { getLocale, type Locale } from '../i18n'
import { localizeFootprintName } from './room-built-on'

// Core refuses with English sentences that carry numbers and names. In Swedish they are rebuilt
// from the code and the pieces of the sentence; a refusal this table does not know reads as core
// wrote it. English is never rewritten here.

type Conflict = { code?: string; message: string }

const OPENING_SV: Record<string, string> = { door: 'dörren', window: 'fönstret' }
const OPENING_PRONOUN: Record<string, string> = { door: 'den', window: 'det' }
const KIND_SV: Record<string, string> = {
  door: 'dörren',
  window: 'fönstret',
  wall: 'väggen',
  'upper floor': 'bjälklaget ovanför',
  roof: 'taket',
  ceiling: 'innertaket',
}

// The reasons "Level the floors first." can end in; one that is not here stays in core's English.
const FOOTPRINT_DETAILS: [RegExp, (match: RegExpExecArray) => string][] = [
  [
    /^This room has no single base plate to convert\.$/,
    () => 'Rummet har inte en enda golvplatta att omvandla.',
  ],
  [
    /^The floor must retain at least (.+) m above its soffit\.$/,
    ([, n]) => `Golvet måste ligga kvar minst ${num(n!)} m över undersidan.`,
  ],
  [
    /^Changing the footprint would move another storey\.$/,
    () => 'Ändrad golvyta skulle flytta en annan våning.',
  ],
  [
    /^Changing the footprint would move a door or window\.$/,
    () => 'Ändrad golvyta skulle flytta en dörr eller ett fönster.',
  ],
  [
    /^Only a grounded room with a generated floor can change its footprint\.$/,
    () => 'Bara ett rum på mark med genererat golv kan ändra golvyta.',
  ],
  [
    /^The preserved wall top would leave less than (.+) m of wall\.$/,
    ([, n]) => `Väggens bevarade överkant skulle lämna mindre än ${num(n!)} m vägg.`,
  ],
  [
    /^Changing the footprint cannot preserve the ceiling beneath the covering floor\.$/,
    () => 'Ändrad golvyta kan inte bevara innertaket under golvet ovanför.',
  ],
]
const num = (value: string) => value.replace('.', ',')

const BY_CODE: Record<string, string> = {
  'covered-existing-wall': 'En vägg går redan längs den här kanten.',
  'segment-too-short': 'En kant är för kort för en vägg.',
  'occupied-split': 'En öppning sitter där väggen skulle delas.',
  'overlapping-spans': 'Rummet har ändrats. Försök igen.',
  'invalid-span': 'Rummet har ändrats. Försök igen.',
  'stale-span': 'Rummet har ändrats. Försök igen.',
  'mixed-exterior-faces': 'En vägg är utvändig på båda sidor. Dela den först.',
  'junction-conflict': 'Låsningen skulle förstöra ett rum på den här våningen.',
  'floor-foundation-level': 'Bara en platta i markkontakt kan ha en massiv grund.',
  'floor-reference-shared-storey':
    'Våningen vilar på golvnivåer som skulle flyttas olika mycket. Flytta de bärande grunderna tillsammans.',
  'floor-door-step': 'Tröskeln i dörröppningen är över 20 cm och behöver trappsteg.',
  'floor-door-swing': 'Dörren slår mot det lägre golvet över en nivåskillnad.',
  'floor-window-sill': 'Öppningens underkant ligger under rummets golv.',
  'floor-low-headroom': 'Takhöjden är under 2,10 m.',
  'mezzanine-intent': 'En entresol måste behålla sitt öppna stöd och sin angivna höjd.',
}

const PATTERNS: [RegExp, (match: RegExpExecArray) => string | null][] = [
  [
    /^To remove this room, delete one of its walls\.$/,
    () => 'Ta bort rummet genom att ta bort en av dess väggar.',
  ],
  [
    /^Choose an existing floor key on this level, or "new"\.$/,
    () => 'Välj en befintlig golvnyckel på den här våningen, eller ”new”.',
  ],
  [
    /^Level the floors first\. (.*)$/,
    ([, detail]) => {
      for (const [pattern, build] of FOOTPRINT_DETAILS) {
        const match = pattern.exec(detail!)
        if (match) return `Jämna ut golven först. ${build(match)}`
      }
      return null
    },
  ],
  [
    /^The (upper floor|door|window|wall|[\w-]+) also sits over (.+); raise both or neither\.$/,
    ([, kind, over]) =>
      (KIND_SV[kind!] ?? null) &&
      `${capitalize(KIND_SV[kind!]!)} vilar också på ${localizeFootprintName(over!, undefined, 'sv')}. Höj båda eller ingen.`,
  ],
  [
    /^Floor must be at least (.+) m to retain the level soffit\.$/,
    ([, n]) => `Golvet måste ligga minst ${num(n!)} m för att behålla våningens undersida.`,
  ],
  [
    /^Floor must be at most (.+) m for (.+) to fit\.$/,
    ([, n, name]) =>
      `Golvet får ligga högst ${num(n!)} m för att ${OPENING_SV[name!] ?? name} ska rymmas.`,
  ],
  [
    /^Floor must be at most (.+) m to retain minimum headroom\.$/,
    ([, n]) => `Golvet får ligga högst ${num(n!)} m för att behålla minsta takhöjd.`,
  ],
  [
    /^The (door|window) does not fit: it exceeds its wall top by (.+) m\.$/,
    ([, type, n]) =>
      `${capitalize(OPENING_SV[type!]!)} ryms inte: ${OPENING_PRONOUN[type!]} går ${num(n!)} m över väggens överkant.`,
  ],
  [
    /^The wall top exceeds the floor above by (.+) m\.$/,
    ([, n]) => `Väggens överkant går ${num(n!)} m upp i golvet ovanför.`,
  ],
  [
    /^The floor plate (.+) cannot move that far: its thickness must remain at least (.+) m\.$/,
    ([, id, n]) =>
      `Bjälklaget ${id} kan inte flyttas så långt: tjockleken måste förbli minst ${num(n!)} m.`,
  ],
  [
    /^Mezzanine elevation must be greater than thickness \((.+) m\) and at most (.+) m\.$/,
    ([, thickness, max]) =>
      `Entresolens höjd måste vara större än tjockleken (${num(thickness!)} m) och högst ${num(max!)} m.`,
  ],
  [
    /^This room's floor is (a drawn slab|the drawn slab "(.+)") \((.+)\)\. Its height is the slab's: change that slab's elevation instead\.$/,
    ([, , name, id]) =>
      `Rummets golv är ${name ? `det ritade bjälklaget ”${name}”` : 'ett ritat bjälklag'} (${id}). Höjden sitter på bjälklaget: ändra bjälklagets höjd i stället.`,
  ],
  [
    /^The terrace overlaps (.+)\.$/,
    ([, name]) =>
      `Terrassen överlappar ${name === 'an existing room' ? 'ett befintligt rum' : name}.`,
  ],
  [
    /^A stair on another level uses the moving room’s floor as its destination deck\.$/,
    () => 'En trappa på en annan våning slutar på det flyttade rummets golv.',
  ],
  [
    /^The adjacent ceiling is manual\. Cut it in Edit ceiling\.$/,
    () => 'Innertaket intill är handritat. Skär ut i Redigera innertak.',
  ],
]

function capitalize(text: string) {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

/** A refusal's text for a person: Swedish when `locale` is, otherwise core's own sentence. */
export function conflictMessage(conflict: Conflict, locale: Locale = getLocale()): string {
  if (locale === 'en') return conflict.message
  for (const [pattern, build] of PATTERNS) {
    const match = pattern.exec(conflict.message)
    const built = match && build(match)
    if (built) return built
  }
  return (conflict.code && BY_CODE[conflict.code]) || conflict.message
}

/** Several refusals as one sentence run, each once. */
export function conflictMessages(
  conflicts: readonly Conflict[],
  locale: Locale = getLocale(),
): string {
  return [...new Set(conflicts.map((conflict) => conflictMessage(conflict, locale)))].join(' ')
}
