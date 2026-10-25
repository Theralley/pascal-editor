import {
  type AnyNode,
  type AnyNodeId,
  isRoofGeometry,
  nodeRegistry,
  sceneRegistry,
  useScene,
} from '@pascal-app/core'
import type { Object3D } from 'three'
import { hideFromScene, showInScene } from './scene-visibility'

/** A roof surface role in the registry, or retained roof geometry. */
export function isRoofNode(node: AnyNode): boolean {
  return isRoofGeometry(node) || nodeRegistry.get(node.type)?.surfaceRole === 'roof'
}

/**
 * Whether a baked object is a roof: the role the exporter stamped (retained roof geometry), else
 * its kind's surface role in the registry, else the kinds every bake knows.
 */
export function isBakedRoof(extras: { kind?: string; surfaceRole?: string }): boolean {
  const kind = extras.kind ?? ''
  const role =
    extras.surfaceRole ??
    nodeRegistry.get(kind)?.surfaceRole ??
    (kind === 'roof' || kind === 'roof-segment' ? 'roof' : undefined)
  return role === 'roof'
}

type RoofRoot = { id: string; object: Object3D }

/**
 * Holds `roots` (and everything under them) off the scene layer while roofs are off, and hands
 * back what an earlier call held that is no longer roof. Returns the objects now held; the caller
 * keeps them for the next call, so each surface (live scene, baked scene) owns its own set.
 */
export function syncRoofVisibility(
  roots: readonly Object3D[],
  showRoofs: boolean,
  held: ReadonlySet<Object3D>,
): Set<Object3D> {
  const next = new Set<Object3D>()
  if (!showRoofs) {
    for (const root of roots) {
      root.traverse((object) => {
        hideFromScene(object, 'roof-hidden')
        next.add(object)
      })
    }
  }
  for (const object of held) if (!next.has(object)) showInScene(object, 'roof-hidden')
  return next
}

const hiddenIds = new Set<string>()
const hiddenListeners = new Set<(nodeId: string) => void>()

/** Whether the roof toggle currently hides this node (a roof, or something hosted on one). */
export function isRoofHidden(nodeId: string): boolean {
  return hiddenIds.has(nodeId)
}

/**
 * Calls back whenever the roof toggle starts or stops hiding a node, so a system that caches the
 * node's meshes (the node batch) can release or re-offer it.
 */
export function subscribeRoofHidden(listener: (nodeId: string) => void): () => void {
  hiddenListeners.add(listener)
  return () => {
    hiddenListeners.delete(listener)
  }
}

function setHiddenIds(next: ReadonlySet<string>): void {
  const changed: string[] = []
  for (const id of hiddenIds) if (!next.has(id)) changed.push(id)
  for (const id of next) if (!hiddenIds.has(id)) changed.push(id)
  hiddenIds.clear()
  for (const id of next) hiddenIds.add(id)
  for (const id of changed) for (const listener of hiddenListeners) listener(id)
}

function withDescendants(
  rootId: string,
  nodes: Readonly<Record<string, AnyNode>>,
  out: Set<string>,
) {
  if (out.has(rootId)) return
  out.add(rootId)
  for (const childId of (nodes[rootId] as { children?: readonly string[] } | undefined)?.children ??
    [])
    withDescendants(childId, nodes, out)
}

/**
 * The live scene's roof toggle. Roofs are held off the scene layer while `showRoofs` is false; a
 * roof drawn or remounted meanwhile is held on the next update.
 */
class LiveRoofs {
  private held = new Set<Object3D>()
  private roots: RoofRoot[] = []
  private ids = new Set<string>()
  private rootsFor: { nodes: unknown; revision: number } | undefined
  private lifts = 0

  /** Reconciles the holds with the toggle and the roofs the scene has now. */
  update(showRoofs: boolean): void {
    if (this.lifts > 0) return
    if (showRoofs && this.held.size === 0 && hiddenIds.size === 0) return
    const roots = this.currentRoots()
    this.held = syncRoofVisibility(
      roots.map((root) => root.object),
      showRoofs,
      this.held,
    )
    setHiddenIds(showRoofs ? new Set() : this.ids)
  }

  /** Roofs shown, whatever the toggle says, until the returned function gives the toggle back. */
  lift(): () => void {
    if (this.lifts++ === 0) for (const object of this.held) showInScene(object, 'roof-hidden')
    let lifted = true
    return () => {
      if (!lifted) return
      lifted = false
      if (--this.lifts === 0) for (const object of this.held) hideFromScene(object, 'roof-hidden')
    }
  }

  /**
   * For one capture: the roofs left out of the picture, whatever the toggle says. A real hold, so
   * the level presentation laid over it composes through the reasons instead of replacing it.
   */
  hideForCapture(): () => void {
    const added: Object3D[] = []
    for (const root of this.currentRoots()) {
      root.object.traverse((object) => {
        // Already held by the toggle, and not lifted for this capture.
        if (this.lifts === 0 && this.held.has(object)) return
        hideFromScene(object, 'roof-hidden')
        added.push(object)
      })
    }
    return () => {
      for (const object of added) showInScene(object, 'roof-hidden')
    }
  }

  private currentRoots(): RoofRoot[] {
    const nodes = useScene.getState().nodes
    const revision = sceneRegistry.revision
    if (this.rootsFor?.nodes === nodes && this.rootsFor.revision === revision) return this.roots
    this.rootsFor = { nodes, revision }
    this.roots = []
    this.ids = new Set()
    for (const [id, object] of sceneRegistry.nodes) {
      const node = nodes[id as AnyNodeId]
      if (!(node && isRoofNode(node))) continue
      this.roots.push({ id, object })
      withDescendants(id, nodes, this.ids)
    }
    return this.roots
  }
}

export const liveRoofs = new LiveRoofs()

/**
 * Roofs in or out of one capture, whatever the person's toggle says. The returned function gives
 * the person's view back; their saved choice is never written.
 */
export function presentRoofsForCapture(showRoofs: boolean): () => void {
  return showRoofs ? liveRoofs.lift() : liveRoofs.hideForCapture()
}
