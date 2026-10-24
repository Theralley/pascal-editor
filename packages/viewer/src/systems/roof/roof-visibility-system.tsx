import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import type { Object3D } from 'three'
import { liveRoofObjects, syncRoofVisibility } from '../../lib/roof-visibility'
import useViewer from '../../store/use-viewer'

/**
 * Holds the roofs off the scene layer while `showRoofs` is false. Reapplied when a geometry
 * rebuild swaps meshes under a roof, so a rebuilt roof stays hidden.
 */
export const RoofVisibilitySystem = () => {
  const held = useRef<Set<Object3D>>(new Set())
  const applied = useRef<{ showRoofs: boolean; revision: number } | null>(null)

  useFrame(() => {
    const { showRoofs, geometryRevision } = useViewer.getState()
    const last = applied.current
    if (last?.showRoofs === showRoofs && (showRoofs || last.revision === geometryRevision)) return
    applied.current = { showRoofs, revision: geometryRevision }
    held.current = syncRoofVisibility(liveRoofObjects(), showRoofs, held.current)
  }, 5)

  return null
}
