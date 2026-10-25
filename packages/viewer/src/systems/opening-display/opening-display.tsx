import { emitter, nodeRegistry, sceneRegistry } from '@pascal-app/core'
import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import type { Mesh, Object3D } from 'three'
import { FLOOR_MARK_HIT_NAME, FLOOR_MARK_NAME } from '../../lib/floor-mark'
import { hideFromScene, showInScene } from '../../lib/scene-visibility'
import useViewer, { type OpeningDisplay } from '../../store/use-viewer'

/**
 * Doors and windows in the Low wall mode (`capabilities.lowWallOpening`). With the person's
 * `openingDisplay` on `hidden` or `marks`, an opening's meshes are held off the scene layer through
 * the scene-visibility owner (`'opening-low'`): not drawn, not picked, not shadowed, and no material
 * touched. A kind with `floorMark` builds its own flat mark (children named {@link FLOOR_MARK_NAME}
 * and {@link FLOOR_MARK_HIT_NAME}, held off from the moment they are built); `marks` lets it
 * through, and a click on it reaches the opening's own handlers. Every other wall mode shows the
 * opening as built, and so do exports, whole-wall captures and the finished-house picture; a
 * capture of low walls follows the Low setting.
 */

export type OpeningDisplayViewerState = Pick<
  ReturnType<typeof useViewer.getState>,
  'wallMode' | 'openingDisplay'
>

export type OpeningDisplayViewerStore = { getState: () => OpeningDisplayViewerState }

const affectedIds = new Set<string>()
const affectedListeners = new Set<(nodeId: string) => void>()

/** Whether the Low wall mode currently hides this opening. */
export function isOpeningDisplayAffected(nodeId: string): boolean {
  return affectedIds.has(nodeId)
}

/**
 * Calls back whenever the Low wall mode starts or stops hiding an opening, so a system that caches
 * the opening's meshes (the node batch) can release or re-offer it.
 */
export function subscribeOpeningDisplayAffected(listener: (nodeId: string) => void): () => void {
  affectedListeners.add(listener)
  return () => {
    affectedListeners.delete(listener)
  }
}

function setAffected(nodeId: string, affected: boolean): void {
  if (affectedIds.has(nodeId) === affected) return
  if (affected) affectedIds.add(nodeId)
  else affectedIds.delete(nodeId)
  for (const listener of affectedListeners) listener(nodeId)
}

const isFloorMark = (object: Object3D) =>
  object.name === FLOOR_MARK_NAME || object.name === FLOOR_MARK_HIT_NAME

/** The opening's drawn and pickable meshes, and its floor marks, apart. */
function partsOf(group: Object3D): { parts: Mesh[]; marks: Mesh[] } {
  const parts: Mesh[] = []
  const marks: Mesh[] = []
  group.traverse((object) => {
    const mesh = object as Mesh
    if (!mesh.isMesh) return
    if (isFloorMark(mesh)) marks.push(mesh)
    else parts.push(mesh)
  })
  return { parts, marks }
}

/** A rebuild swaps an opening's children for new objects; the last child's id says it happened. */
function signatureOf(group: Object3D): string {
  return `${group.children.length}:${group.children[group.children.length - 1]?.id ?? 0}`
}

type Tracked = { signature: string; display: OpeningDisplay }

/** What a capture asks of the openings: shown as built, or as the Low setting leaves them. */
type CaptureStance = { kind: 'full' } | { kind: 'low'; display: OpeningDisplay }

export class OpeningDisplayCache {
  private readonly tracked = new Map<string, Tracked>()
  private capture: CaptureStance | null = null

  constructor(private readonly viewerStore: OpeningDisplayViewerStore = useViewer) {}

  update(): void {
    // A capture that never reported its end must not leave the openings lifted.
    if (this.capture) this.afterCapture()
    this.reconcile()
  }

  /** Shows every opening as built and holds the marks off again. */
  dispose(): void {
    this.capture = null
    this.release()
  }

  /**
   * An export, a capture of whole walls and the finished-house picture see the openings as built; a
   * capture of low walls shows them as the Low setting, or the capture's own `openings`, leaves them.
   */
  beforeCapture(
    event:
      | {
          wholeWalls?: boolean
          exporting?: boolean
          finished?: boolean
          wallsLow?: boolean
          openings?: OpeningDisplay
        }
      | undefined,
  ): void {
    if (event?.wallsLow && !event.exporting) {
      this.capture = {
        kind: 'low',
        display: event.openings ?? this.viewerStore.getState().openingDisplay,
      }
    } else if (event?.wholeWalls || event?.exporting || event?.finished) {
      this.capture = { kind: 'full' }
    } else {
      return
    }
    this.reconcile()
  }

  afterCapture(): void {
    if (!this.capture) return
    this.capture = null
    this.reconcile()
  }

  private resolve(): OpeningDisplay {
    if (this.capture) return this.capture.kind === 'full' ? 'full' : this.capture.display
    const viewer = this.viewerStore.getState()
    return viewer.wallMode === 'low' ? viewer.openingDisplay : 'full'
  }

  private reconcile(): void {
    const display = this.resolve()
    // The batch follows the live view only: a capture's lift is undone before it draws again.
    const live = !this.capture
    if (display === 'full') {
      this.release(live)
      return
    }

    const seen = new Set<string>()
    for (const [kind, definition] of nodeRegistry.entries()) {
      const config = definition.capabilities?.lowWallOpening
      if (!config) continue
      for (const id of sceneRegistry.byType[kind] ?? []) {
        const group = sceneRegistry.nodes.get(id)
        if (!group) continue
        seen.add(id)
        const signature = signatureOf(group)
        const previous = this.tracked.get(id)
        if (previous?.signature === signature && previous.display === display) continue
        const { parts, marks } = partsOf(group)
        for (const part of parts) hideFromScene(part, 'opening-low')
        for (const mark of marks) {
          if (display === 'marks' && config.floorMark) showInScene(mark, 'floor-mark-off')
          else hideFromScene(mark, 'floor-mark-off')
        }
        this.tracked.set(id, { signature, display })
        if (live) setAffected(id, true)
      }
    }
    for (const id of [...this.tracked.keys()]) {
      if (!seen.has(id)) this.releaseOne(id, live)
    }
  }

  private release(live = true): void {
    for (const id of [...this.tracked.keys()]) this.releaseOne(id, live)
  }

  private releaseOne(id: string, live: boolean): void {
    this.tracked.delete(id)
    const group = sceneRegistry.nodes.get(id)
    if (group) {
      const { parts, marks } = partsOf(group)
      for (const part of parts) showInScene(part, 'opening-low')
      for (const mark of marks) hideFromScene(mark, 'floor-mark-off')
    }
    if (live) setAffected(id, false)
  }
}

/**
 * After the door and window systems (3), which rebuild the meshes this holds, and before the node
 * batch (5), which reads {@link isOpeningDisplayAffected} to release what this hides.
 */
export const OPENING_DISPLAY_FRAME_PRIORITY = 4

export const OpeningDisplaySystem = ({
  viewerStore = useViewer,
}: {
  viewerStore?: OpeningDisplayViewerStore
}) => {
  const cache = useMemo(() => new OpeningDisplayCache(viewerStore), [viewerStore])

  useFrame(() => cache.update(), OPENING_DISPLAY_FRAME_PRIORITY)

  useEffect(() => {
    const before = (event?: Parameters<OpeningDisplayCache['beforeCapture']>[0]) =>
      cache.beforeCapture(event)
    const after = () => cache.afterCapture()
    emitter.on('thumbnail:before-capture', before)
    emitter.on('thumbnail:after-capture', after)
    return () => {
      emitter.off('thumbnail:before-capture', before)
      emitter.off('thumbnail:after-capture', after)
      cache.dispose()
    }
  }, [cache])

  return null
}
