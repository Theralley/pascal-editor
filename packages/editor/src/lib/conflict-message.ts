import { getLocale, type Locale } from '../i18n'

// Core refuses with English sentences that carry numbers and names. In Swedish they are rebuilt
// from the code and the pieces of the sentence; a refusal this table does not know reads as core
// wrote it. English is never rewritten here.

type Conflict = { code?: string; message: string }

const OPENING_SV: Record<string, string> = { door: 'dörren', window: 'fönstret' }
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
  'room-floor-footprint': 'Välj en befintlig golvnyckel på den här våningen, eller ”new”.',
}

const PATTERNS: [RegExp, (match: RegExpExecArray) => string][] = [
  [
    /^To remove this room, delete one of its walls\.$/,
    () => 'Ta bort rummet genom att ta bort en av dess väggar.',
  ],
  [
    /^The upper floor also sits over (.+); raise both or neither\.$/,
    ([, over]) => `Bjälklaget ovanför vilar också på ${over}. Höj båda eller ingen.`,
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
      `${capitalize(OPENING_SV[type!]!)} ryms inte: det går ${num(n!)} m över väggens överkant.`,
  ],
  [
    /^The wall top exceeds the floor above by (.+) m\.$/,
    ([, n]) => `Väggens överkant går ${num(n!)} m upp i golvet ovanför.`,
  ],
  [
    /^The floor plate (.+) cannot move that far: its thickness must remain at least (.+) m\.$/,
    ([, id, n]) =>
      `Golvplattan ${id} kan inte flyttas så långt: tjockleken måste förbli minst ${num(n!)} m.`,
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
    if (match) return build(match)
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
