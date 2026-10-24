import { hiddenWallPointerEventsHeld, sceneRegistry, useScene } from '@pascal-app/core'

/**
 * Depth tie-break, as for hidden walls: a selectable at about the same depth or nearer outranks
 * the hidden node, and so does anything it hosts.
 */
export const HIDDEN_FOLLOWER_SELECTION_EPSILON = 0.35

const PASSIVE_KINDS = new Set(['site', 'building', 'level', 'zone'])

type ObjectLike = { parent?: ObjectLike | null }
type RayIntersection = { distance: number; object: ObjectLike }

type RayHit = { distance: number; hosted: boolean }

/** Whether any other selectable hit on the ray outranks the hidden node's own hit. */
export function hiddenFollowerOutrankedOnRay(
  ownDistance: number,
  otherHits: ReadonlyArray<RayHit>,
  epsilon: number = HIDDEN_FOLLOWER_SELECTION_EPSILON,
): boolean {
  return otherHits.some((hit) => hit.hosted || hit.distance <= ownDistance + epsilon)
}

function nearestRegisteredId(object: ObjectLike): string | null {
  const roots = new Map<object, string>()
  for (const [id, root] of sceneRegistry.nodes.entries()) roots.set(root, id)
  for (let current = object as ObjectLike | null | undefined; current; current = current.parent) {
    const id = roots.get(current)
    if (id !== undefined) return id
  }
  return null
}

/**
 * Whether a node that the wall mode hides should let this pointer event through to what is behind
 * it, like a hidden wall: it yields to a selectable at the same depth or nearer, or hosted on it.
 * Events without ray data stay transparent. Delete hover and a live hidden-wall hold keep every
 * event, as they do for walls.
 */
export function hiddenFollowerPointerSuppressed({
  nodeId,
  hidden,
  hoverHighlightMode,
  event,
}: {
  nodeId: string
  hidden: boolean
  hoverHighlightMode: string | null | undefined
  event: unknown
}): boolean {
  if (!hidden || hoverHighlightMode === 'delete' || hiddenWallPointerEventsHeld()) return false
  const e = event as { distance?: unknown; object?: ObjectLike; intersections?: unknown }
  if (typeof e?.distance !== 'number' || !e.object || !Array.isArray(e.intersections)) return true
  const nodes = useScene.getState().nodes as Record<string, { type?: string } | undefined>
  const self = sceneRegistry.nodes.get(nodeId)
  const hits: RayHit[] = []
  for (const hit of e.intersections as RayIntersection[]) {
    if (!hit || typeof hit.distance !== 'number' || !hit.object || hit.object === e.object) continue
    const ownerId = nearestRegisteredId(hit.object)
    if (ownerId === null || ownerId === nodeId) continue
    const kind = nodes[ownerId]?.type
    if (!kind || PASSIVE_KINDS.has(kind)) continue
    let hosted = false
    for (
      let current = hit.object as ObjectLike | null | undefined;
      current && !hosted;
      current = current.parent
    )
      hosted = current === self
    hits.push({ distance: hit.distance, hosted })
  }
  return hiddenFollowerOutrankedOnRay(e.distance, hits)
}
