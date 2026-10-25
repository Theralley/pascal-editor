import { emitter } from '@pascal-app/core'
import { useFrame } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import { liveRoofs } from '../../lib/roof-visibility'
import useViewer from '../../store/use-viewer'

/**
 * After GeometrySystem (2), which rebuilds meshes, and before the node batch (5), which reads
 * `isRoofHidden` to release what this hides.
 */
export const ROOF_VISIBILITY_FRAME_PRIORITY = 3

/**
 * Holds the roofs off the scene layer while `showRoofs` is false. It reconciles every frame while
 * roofs are off, so a roof built or remounted meanwhile is held too. A capture or an export sees
 * the roofs whatever the toggle says.
 */
export const RoofVisibilitySystem = () => {
  const endCapture = useRef<(() => void) | null>(null)

  useFrame(() => {
    // A capture that never reported its end must not leave the roofs shown.
    endCapture.current?.()
    endCapture.current = null
    liveRoofs.update(useViewer.getState().showRoofs)
  }, ROOF_VISIBILITY_FRAME_PRIORITY)

  useEffect(() => {
    const before = () => {
      endCapture.current ??= liveRoofs.lift()
    }
    const after = () => {
      endCapture.current?.()
      endCapture.current = null
    }
    emitter.on('thumbnail:before-capture', before)
    emitter.on('thumbnail:after-capture', after)
    return () => {
      emitter.off('thumbnail:before-capture', before)
      emitter.off('thumbnail:after-capture', after)
      after()
      liveRoofs.update(true)
    }
  }, [])

  return null
}
