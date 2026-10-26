import {
  WINDOW_STYLE_CHOICES,
  WINDOW_STYLE_LABELS,
  type WindowStyle,
} from '@pascal-app/core/building'
import { windowTypeOptions } from './placement'

const TYPE_SV: Record<(typeof windowTypeOptions)[number]['value'], string> = {
  fixed: 'Fast',
  sliding: 'Skjutbart',
  casement: 'Sidhängt',
  awning: 'Överhängt',
  'single-hung': 'Enkelhängt',
  'double-hung': 'Dubbelhängt',
  bay: 'Burspråk',
  bow: 'Välvt burspråk',
  hopper: 'Vippbart',
  louvered: 'Jalusi',
}

const STYLE_SV: Partial<Record<WindowStyle, string>> = {
  single: 'Enkel',
  'double-hung': 'Tvådelad',
  'triple-hung': 'Tredelad',
  casement: 'Sidhängd',
  sliding: 'Skjutbar',
  grid: 'Rutnät',
  'tall-grid': 'Högt rutnät',
  'wide-grid': 'Brett rutnät',
  'horizontal-bands': 'Vågräta band',
  transom: 'Överljus',
  picture: 'Fast glas',
}

/** Swedish for the text `windowDefinition` declares, keyed by its English source. */
export const windowTranslations = {
  sv: {
    Window: 'Fönster',
    'A window cut into a wall. Animated open/close for opening windows.':
      'Ett fönster som är utskuret i en vägg. Öppningsbara fönster kan animeras öppna och stängda.',
    'Place window on wall': 'Placera fönstret på en vägg',
    'Join as a corner window': 'Slå ihop till ett hörnfönster',
    'Corner window': 'Hörnfönster',
    'Place without the corner snap': 'Placera utan hörnfäste',
    'No wall meets here': 'Ingen annan vägg ansluter här',
    'Three or more walls meet here': 'Tre eller fler väggar möts här',
    'The walls meet at too sharp or too flat an angle':
      'Väggarna möts i en för spetsig eller för trubbig vinkel',
    'A curved wall takes no corner window': 'En böjd vägg kan inte ha något hörnfönster',
    'A curtain wall takes no corner window': 'En glasfasad kan inte ha något hörnfönster',
    'No room for the matching window on the other wall':
      'Det finns ingen plats för det matchande fönstret på den andra väggen',
    'Another opening is in the way at the corner': 'En annan öppning är i vägen vid hörnet',
    'The window waiting there is taller than this wall':
      'Fönstret som väntar där är högre än den här väggen',
    Type: 'Typ',
    Style: 'Stil',
    ...Object.fromEntries(
      windowTypeOptions.map((option) => [`Type: ${option.label}`, `Typ: ${TYPE_SV[option.value]}`]),
    ),
    ...Object.fromEntries(
      WINDOW_STYLE_CHOICES.map((style) => [
        `Style: ${WINDOW_STYLE_LABELS[style]}`,
        `Stil: ${STYLE_SV[style]}`,
      ]),
    ),
    'Window type — click or press O to cycle': 'Fönstertyp — klicka eller tryck O för att växla',
    'Window style — click or press L to cycle': 'Fönsterstil — klicka eller tryck L för att växla',
    'Flip side': 'Vänd sida',
    'Force place': 'Tvinga placering',
    Cancel: 'Avbryt',
    Dimensions: 'Mått',
    Width: 'Bredd',
    Height: 'Höjd',
    Frame: 'Karm',
    Glass: 'Glas',
    'Frame thickness': 'Karmtjocklek',
    'Frame depth': 'Karmdjup',
  },
}
