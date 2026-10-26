import type { MessageKey } from '@pascal-app/editor'
import type { messages } from './messages'

/** The English a stair computation reports, as catalog keys. Anything else is shown as reported. */
const KNOWN_MESSAGES = new Map<string, MessageKey<typeof messages>>([
  ['The destination must be above the stair base.', 'msg.destinationAbove'],
  [
    'Landing depth exceeds a full circle at the walking line; the visible landing is limited to one circle.',
    'msg.landingOverlap',
  ],
  [
    'The narrow end of a winder tread is below 0.10 m; check the intended stair use.',
    'msg.narrowWinder',
  ],
  ['Flight dimensions and integer riser count must be positive.', 'msg.invalidFlight'],
  ['Riser height exceeds the design target.', 'msg.riserTarget'],
  ['Going is below the design target.', 'msg.goingTarget'],
  ['Two risers plus going is outside the 0.60\u20130.65 m design range.', 'msg.comfortTarget'],
  ['Rise must be positive', 'msg.risePositive'],
  ['Use at least two whole risers', 'msg.twoRisers'],
  ['Run must be positive', 'msg.runPositive'],
  ['Add a flight before sizing a stair with only landings', 'msg.addFlightSizing'],
  ['Add a flight before fitting the run', 'msg.addFlightFitting'],
  ['Rise must exceed the accumulated landing rise', 'msg.riseExceedsLandings'],
  ['Flight height must be positive', 'msg.flightHeightPositive'],
  ['Width must be positive', 'msg.widthPositive'],
  ['A turning landing must be at least as deep as the stair is wide', 'msg.turningLanding'],
  ['Stair support and arrival do not converge; choose an explicit rise or run', 'msg.noConverge'],
])

export const stairMessageKey = (message: string) => KNOWN_MESSAGES.get(message)
