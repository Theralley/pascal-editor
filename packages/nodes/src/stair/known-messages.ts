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
  ['Overhead surfaces leave less than the target headroom.', 'msg.headroomTarget'],
  [
    'Detailed headroom could not be evaluated: check riser counts and the surface query budget.',
    'msg.headroomUnresolved',
  ],
  [
    'Flight riser heights differ. Use uniform-riser repair only if this is a proposed design.',
    'msg.nonuniform',
  ],
  ['A landing has a stored rise; inspect its transition before repair.', 'msg.raisedLanding'],
  ['The flight chain does not reach the declared destination.', 'msg.arrivalMismatch'],
  ['Detailed stair geometry requires a positive whole riser count.', 'msg.detailRisers'],
  [
    'Detailed stair geometry exceeds the 10,000-surface computation budget. The authored count is preserved.',
    'msg.detailBudget',
  ],
  ['Explicit arc construction requires a positive going.', 'msg.arcGoing'],
  ['One tread spans more than one turn; add risers or reduce the sweep.', 'msg.treadTurn'],
  [
    'Detailed winder construction exceeds the 10,000-surface computation budget. The authored values are preserved.',
    'msg.winderBudget',
  ],
  ['Riser panels must fit within their treads.', 'msg.riserPanels'],
  ['Stringers must fit within the flight width.', 'msg.stringers'],
  [
    'The center stringer must fit around the walking line within the winder width.',
    'msg.centerStringer',
  ],
  ['Winder nosing must be smaller than the walking-line radius.', 'msg.winderNosing'],
  ['Winders require positive dimensions and 1\u201310,000 whole risers.', 'msg.winderDims'],
  ['The winder walking line must lie within the flight width.', 'msg.winderLine'],
  [
    'Detailed stair construction exceeds the 10,000-surface computation budget. The authored values are preserved.',
    'msg.constructionBudget',
  ],
  ['The handrail inset and radius must fit within the stair width.', 'msg.handrailFit'],
  ['Guard height must be positive.', 'msg.guardHeight'],
  [
    'Detailed stair geometry exceeds the 10,000-surface computation budget. The authored counts are preserved.',
    'msg.detailBudgetCounts',
  ],
  [
    'Detailed stair rails exceed the 10,000-unit computation budget. The authored dimensions are preserved.',
    'msg.railBudget',
  ],
])

export const stairMessageKey = (message: string) => KNOWN_MESSAGES.get(message)
