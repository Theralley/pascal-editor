import {
  type AnyNodeId,
  isRoofGeometry,
  nodeRegistry,
  sceneRegistry,
  useScene,
} from '@pascal-app/core'
import type { Object3D } from 'three'
import {
  hideFromScene,
  showInScene,
  temporarilyHideFromScene,
  temporarilyShowRoofs,
} from './scene-visibility'

/** The live scene's roof objects: nodes of a roof surface role or retained roof geometry, with what is hosted on them. */
export function liveRoofObjects(): Object3D[] {
  const nodes = useScene.getState().nodes
  const roots: Object3D[] = []
  for (const [id, object] of sceneRegistry.nodes) {
    const node = nodes[id as AnyNodeId]
    if (node && (isRoofGeometry(node) || nodeRegistry.get(node.type)?.surfaceRole === 'roof'))
      roots.push(object)
  }
  return roots
}

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

/**
 * Roofs in or out of one capture, whatever the person's toggle says. The returned function gives
 * the person's view back; their saved choice is never written.
 */
export function presentRoofsForCapture(showRoofs: boolean): () => void {
  const restores = liveRoofObjects().map((root) =>
    showRoofs ? temporarilyShowRoofs(root) : temporarilyHideFromScene(root, 'roof-hidden'),
  )
  return () => {
    for (const restore of restores.reverse()) restore()
  }
}
