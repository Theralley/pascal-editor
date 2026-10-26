import { defineMessages, translate } from '../i18n'
import { crossingMessage } from './floor-region-geometry'

// Short labels for what core refuses a mezzanine — drawing, moving, turning,
// copying, pushing an edge or adding its stair all read the same words.

const messages = defineMessages({
  en: {
    outside: 'Outside the room',
    tooSmall: 'At least 1 m²',
    overlap: 'Overlaps a mezzanine',
    elevation: 'Too high or too low',
    failed: "Can't add a mezzanine here",
    noStair: 'No room for stairs',
  },
  sv: {
    outside: 'Utanför rummet',
    tooSmall: 'Minst 1 m²',
    overlap: 'Överlappar en entresol',
    elevation: 'För högt eller för lågt',
    failed: 'Det går inte att lägga till en entresol här',
    noStair: 'Det finns inte plats för en trappa',
  },
})

export const mezzanineOutsideMessage = () => translate(messages, 'outside')
export const mezzanineTooSmallMessage = () => translate(messages, 'tooSmall')
export const mezzanineOverlapMessage = () => translate(messages, 'overlap')
export const mezzanineElevationMessage = () => translate(messages, 'elevation')
export const mezzanineFailedMessage = () => translate(messages, 'failed')
export const mezzanineNoStairMessage = () => translate(messages, 'noStair')

const CONFLICT_MESSAGES: Record<string, () => string> = {
  'outside-host': mezzanineOutsideMessage,
  'overlaps-mezzanine': mezzanineOverlapMessage,
  'mezzanine-overlap': mezzanineOverlapMessage,
  'too-small': mezzanineTooSmallMessage,
  'mezzanine-elevation': mezzanineElevationMessage,
  'no-room-for-stair': mezzanineNoStairMessage,
}

/** The label for a core mezzanine conflict code, or null when it is not one of them. */
export function mezzanineConflictMessage(code: string | undefined): string | null {
  if (code === 'self-intersecting') return crossingMessage()
  return (code && CONFLICT_MESSAGES[code]?.()) || null
}
