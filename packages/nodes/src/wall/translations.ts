import { WALL_SPLIT_MAX_CUTS } from './split-preview'

/** Swedish for the text `wallDefinition` declares, keyed by its English source. */
export const wallTranslations = {
  sv: {
    Wall: 'Vägg',
    'A straight or curved wall segment. Hosts doors, windows, lean-to extensions, and wall-mounted items.':
      'En rak eller böjd väggdel. Bär dörrar, fönster, pulpettillbyggnader och väggmonterade objekt.',
    'Set one corner, then the opposite': 'Markera ett hörn, sedan det motsatta',
    'Add a corner · click the first to close':
      'Lägg till ett hörn · klicka på det första för att sluta',
    'Set wall start / end': 'Sätt väggens start / slut',
    Cancel: 'Avbryt',
    'Split at the marks': 'Dela vid markeringarna',
    Cuts: 'Snitt',
    'Cuts: 1': 'Snitt: 1',
    ...Object.fromEntries(
      Array.from({ length: WALL_SPLIT_MAX_CUTS - 1 }, (_, index) => {
        const count = index + 2
        return [`Cuts: ${count}, even`, `Snitt: ${count}, jämnt fördelade`]
      }),
    ),
    'Number of cuts — scroll or click to change':
      'Antal snitt – scrolla eller klicka för att ändra',
    'Free placement': 'Fri placering',
    Dimensions: 'Mått',
    Reference: 'Referens',
    'Outside face': 'Utsida',
    Center: 'Mitt',
    'Inside face': 'Insida',
    Left: 'Vänster',
    Right: 'Höger',
    'Wall start': 'Väggens start',
    'Wall end': 'Väggens slut',
    'Wall centerline': 'Väggens mittlinje',
    'Wall midpoint': 'Väggens mittpunkt',
    'Wall arc center': 'Väggbågens centrum',
    'Wall face': 'Väggsida',
    'Wall height': 'Väggens höjd',
    'Wall top': 'Väggens överkant',
    Face: 'Sida',
    Room: 'Rum',
    Frame: 'Profiler',
    Glass: 'Glas',
    'Solid panels': 'Massiva fält',
    'Side A': 'Sida A',
    'Side B': 'Sida B',
    'Skirting (side A)': 'Golvlist (sida A)',
    'Skirting (side B)': 'Golvlist (sida B)',
    'Crown (side A)': 'Taklist (sida A)',
    'Crown (side B)': 'Taklist (sida B)',
    'Chair rail (side A)': 'Stolslist (sida A)',
    'Chair rail (side B)': 'Stolslist (sida B)',
    Foundation: 'Grund',
  },
}
