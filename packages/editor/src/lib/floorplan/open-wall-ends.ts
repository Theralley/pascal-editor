import {
  type OpenWallEnd,
  planJoinOpenWallEnd,
  runAsSingleSceneHistoryStep,
  useScene,
  type WallJoinResult,
} from '@pascal-app/core'
import { defineMessages, type MessageKey, translate } from '../../i18n'
import { formatLinearMeasurement, type LinearUnit } from '../measurements'

const messages = defineMessages({
  en: {
    'refusal.covered': 'An existing wall already covers this span',
    'refusal.tooShort': 'Joining would make the wall too short',
    'refusal.stale': 'This wall end has changed',
    'refusal.noTarget': 'The other wall has moved or is no longer available',
    'refusal.attachment': 'A door or window is in the way',
    'refusal.readOnly': 'This scene is read-only',
    notJoined: 'Not joined',
    gap: '{distance} gap',
    cross: 'Walls cross',
    overlap: 'Overlaps by {distance}',
    alongside: 'Runs alongside a wall',
    parallel: 'Parallel, {distance} apart',
    'summary.one': "1 wall end isn't joined — a room can't close",
    'summary.many': "{count} wall ends aren't joined — rooms can't close",
  },
  sv: {
    'refusal.covered': 'En befintlig vägg täcker redan sträckan',
    'refusal.tooShort': 'Väggen skulle bli för kort om de sammanfogas',
    'refusal.stale': 'Väggänden har ändrats',
    'refusal.noTarget': 'Den andra väggen har flyttats eller finns inte kvar',
    'refusal.attachment': 'En dörr eller ett fönster är i vägen',
    'refusal.readOnly': 'Scenen är skrivskyddad',
    notJoined: 'Inte ihopfogad',
    gap: 'Glapp på {distance}',
    cross: 'Väggarna korsar varandra',
    overlap: 'Överlappar med {distance}',
    alongside: 'Går längs en vägg',
    parallel: 'Parallell, {distance} ifrån',
    'summary.one': 'En väggände är inte ihopfogad – ett rum kan inte stängas',
    'summary.many': '{count} väggändar är inte ihopfogade – rum kan inte stängas',
  },
})

const JOIN_REFUSALS: Record<
  Extract<WallJoinResult, { ok: false }>['reason'],
  MessageKey<typeof messages>
> = {
  'covered-existing-wall': 'refusal.covered',
  'segment-too-short': 'refusal.tooShort',
  'stale-end': 'refusal.stale',
  'no-target': 'refusal.noTarget',
  'attachment-outside-wall': 'refusal.attachment',
  'attachment-straddles-junction': 'refusal.attachment',
}

export function joinOpenWallEnd(end: OpenWallEnd): string | null {
  const scene = useScene.getState()
  if (scene.readOnly) return translate(messages, 'refusal.readOnly')
  const result = planJoinOpenWallEnd(scene.nodes, end)
  if (!result.ok) return translate(messages, JOIN_REFUSALS[result.reason])
  runAsSingleSceneHistoryStep(useScene, () =>
    useScene.getState().applyNodeChanges(result.plan.changes),
  )
  return null
}

/** Stable id of one wall end, for hover / pin state. */
export function openWallEndKey(end: Pick<OpenWallEnd, 'wallId' | 'end'>): string {
  return `${end.wallId}:${end.end}`
}

/** Short distances read in the unit a person would say out loud: "4 cm", "8 mm", `1.5"`. */
export function formatOpenWallEndDistance(meters: number, unit: LinearUnit): string {
  const value = Math.abs(meters)
  if (unit === 'imperial') {
    const inches = value / 0.0254
    if (inches >= 12) return formatLinearMeasurement(value, unit)
    return `${Number.parseFloat(inches.toFixed(inches < 1 ? 2 : 1))}"`
  }
  if (value >= 1) return formatLinearMeasurement(value, unit)
  if (value < 0.01) return `${Math.max(1, Math.round(value * 1000))} mm`
  return `${Math.round(value * 100)} cm`
}

function candidateDistance(end: OpenWallEnd): number | null {
  if (!end.candidate) return null
  return Math.hypot(end.candidate.point[0] - end.point[0], end.candidate.point[1] - end.point[1])
}

/** What is wrong at this end, in a few words. Null when there is nothing to name. */
export function openWallEndLabel(end: OpenWallEnd, unit: LinearUnit): string | null {
  const gap = end.gap ?? candidateDistance(end)
  const distance = (meters: number) => formatOpenWallEndDistance(meters, unit)
  switch (end.reason) {
    case 'gap':
      return gap === null
        ? translate(messages, 'notJoined')
        : translate(messages, 'gap', { distance: distance(gap) })
    case 'crosses': {
      const overlap = candidateDistance(end)
      return overlap === null
        ? translate(messages, 'cross')
        : translate(messages, 'overlap', { distance: distance(overlap) })
    }
    case 'parallel':
      return gap === null
        ? translate(messages, 'alongside')
        : translate(messages, 'parallel', { distance: distance(gap) })
    case 'rejected':
      return translate(messages, 'notJoined')
    case 'isolated':
      return null
  }
}

/**
 * Which open ends the floor plan marks. A near miss (an end with a join
 * candidate) on a wall that bounds no room is always worth a dot — it is what
 * keeps a room from closing. While walls or rooms are being drawn, every open
 * end of a room-less wall shows, and near misses on walls that already bound a
 * room too, since that is when the person is joining things.
 */
export function visibleOpenWallEnds(
  ends: readonly OpenWallEnd[],
  roomWallIds: ReadonlySet<string>,
  drawing: boolean,
): OpenWallEnd[] {
  return ends.filter((end) => {
    const boundsRoom = roomWallIds.has(end.wallId)
    if (end.candidate) return drawing || !boundsRoom
    return drawing && !boundsRoom
  })
}

// Core looks for join targets within 0.35 m; two ends naming each other sit closer than that.
const MUTUAL_GAP_REACH = 0.5

/**
 * How well this end shows its gap when it is the one marked: an end that
 * slides along its own wall onto the join (1) beats one that stays put while
 * the other wall comes to it (0.5), which beats one that would tilt its wall.
 */
function joinAlignment(
  end: OpenWallEnd,
  wallDirection: (wallId: string) => readonly [number, number] | null,
): number {
  const direction = wallDirection(end.wallId)
  if (!(direction && end.candidate)) return 0
  const dx = end.candidate.point[0] - end.point[0]
  const dz = end.candidate.point[1] - end.point[1]
  const move = Math.hypot(dx, dz)
  const length = Math.hypot(direction[0], direction[1])
  if (move < 1e-9) return 0.5
  if (length < 1e-9) return 0
  return Math.abs(dx * direction[0] + dz * direction[1]) / (move * length)
}

/**
 * Two ends of different walls that name each other as the join target, a
 * join's reach apart, are one gap — whether core plans the join as one end
 * onto the other or both onto a squared corner. Keep the end that shows the
 * gap best (`joinAlignment`), so the floor plan and the 3D view mark it once.
 */
export function collapseMutualOpenWallEnds(
  ends: readonly OpenWallEnd[],
  wallDirection: (wallId: string) => readonly [number, number] | null,
): OpenWallEnd[] {
  const dropped = new Set<OpenWallEnd>()
  const byWall = new Map<string, OpenWallEnd[]>()
  for (const end of ends) {
    const group = byWall.get(end.wallId)
    if (group) group.push(end)
    else byWall.set(end.wallId, [end])
  }
  for (const end of ends) {
    if (dropped.has(end) || !end.candidate) continue
    const candidate = end.candidate
    const partner = byWall
      .get(candidate.wallId)
      ?.find(
        (other) =>
          other !== end &&
          !dropped.has(other) &&
          other.candidate?.wallId === end.wallId &&
          Math.hypot(other.point[0] - end.point[0], other.point[1] - end.point[1]) <=
            MUTUAL_GAP_REACH,
      )
    if (!partner) continue
    dropped.add(
      joinAlignment(partner, wallDirection) > joinAlignment(end, wallDirection) ? end : partner,
    )
  }
  return ends.filter((end) => !dropped.has(end))
}

/** "2 wall ends aren't joined — rooms can't close", or null when every end is joined. */
export function openWallEndsSummary(joinableCount: number): string | null {
  if (joinableCount === 0) return null
  return joinableCount === 1
    ? translate(messages, 'summary.one')
    : translate(messages, 'summary.many', { count: joinableCount })
}
