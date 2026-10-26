import { DOOR_STYLE_LABELS, DOOR_STYLES, type DoorStyle } from '@pascal-app/core/building'
import { doorTypeOptions } from './placement'

const TYPE_SV: Record<(typeof doorTypeOptions)[number]['value'], string> = {
  hinged: 'Svängd',
  double: 'Dubbel',
  french: 'Fransk',
  folding: 'Vikdörr',
  pocket: 'Fickdörr',
  barn: 'Rälsdörr',
  sliding: 'Skjutdörr',
}

const STYLE_SV: Record<DoorStyle, string> = {
  panel: 'Fyllning',
  glass: 'Glas',
  modern: 'Modern',
  'paneled-glass': 'Fyllning med glas',
  french: 'Fransk',
  shaker: 'Shaker',
  'six-panel': 'Sex fyllningar',
  craftsman: 'Craftsman',
  'half-louvered': 'Halv spjäl',
  barn: 'Ladugård',
}

/** Swedish for the text `doorDefinition` declares, keyed by its English source. */
export const doorTranslations = {
  sv: {
    Door: 'Dörr',
    'A door cut into a wall. Animated open/close state.':
      'En dörr som är utskuren i en vägg. Kan animeras öppen och stängd.',
    'Place door on wall': 'Placera dörren på en vägg',
    Type: 'Typ',
    Style: 'Stil',
    ...Object.fromEntries(
      doorTypeOptions.map((option) => [`Type: ${option.label}`, `Typ: ${TYPE_SV[option.value]}`]),
    ),
    ...Object.fromEntries(
      DOOR_STYLES.map((style) => [
        `Style: ${DOOR_STYLE_LABELS[style]}`,
        `Stil: ${STYLE_SV[style]}`,
      ]),
    ),
    'Door type — click or press O to cycle': 'Dörrtyp – klicka eller tryck O för att växla',
    'Door style — click or press L to cycle': 'Dörrstil – klicka eller tryck L för att växla',
    'Flip side': 'Vänd sida',
    'Force place': 'Tvinga placering',
    Cancel: 'Avbryt',
    Dimensions: 'Mått',
    Frame: 'Karm',
    Panel: 'Dörrblad',
    Glass: 'Glas',
    Hardware: 'Beslag',
  },
}
