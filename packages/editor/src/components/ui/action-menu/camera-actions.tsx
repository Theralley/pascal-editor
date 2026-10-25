'use client'

import { emitter } from '@pascal-app/core'
import Image from 'next/image'
import { useT } from '../../../i18n'
import useEditor from '../../../store/use-editor'
import { visibleScene } from '../../../store/view-layout'
import { ActionButton } from './action-button'
import { FollowPascalToggle } from './follow-pascal-toggle'
import { messages } from './messages'

export function CameraActions({ hideOrbit = false }: { hideOrbit?: boolean }) {
  // Orbit stays useful in 2D-only (it spins the synced floorplan view), but
  // top view only tilts the hidden 3D camera — pointless without the canvas.
  const t = useT(messages)
  const is2dOnly = useEditor((s) => visibleScene(s) === '2d')

  const goToTopView = () => {
    emitter.emit('camera-controls:top-view')
  }

  const orbitCW = () => {
    emitter.emit('camera-controls:orbit-cw')
  }

  const orbitCCW = () => {
    emitter.emit('camera-controls:orbit-ccw')
  }

  return (
    <div className="flex items-center gap-1">
      {!hideOrbit && (
        <>
          {/* Orbit CCW */}
          <ActionButton
            className="group hover:bg-black/4"
            label={t('camera.orbitLeft')}
            onClick={orbitCCW}
            size="icon"
            variant="ghost"
          >
            <Image
              alt={t('camera.orbitLeft')}
              className="h-[28px] w-[28px] -scale-x-100 object-contain opacity-70 transition-opacity group-hover:opacity-100"
              height={28}
              src="/icons/rotate.webp"
              width={28}
            />
          </ActionButton>

          {/* Orbit CW */}
          <ActionButton
            className="group hover:bg-black/4"
            label={t('camera.orbitRight')}
            onClick={orbitCW}
            size="icon"
            variant="ghost"
          >
            <Image
              alt={t('camera.orbitRight')}
              className="h-[28px] w-[28px] object-contain opacity-70 transition-opacity group-hover:opacity-100"
              height={28}
              src="/icons/rotate.webp"
              width={28}
            />
          </ActionButton>
        </>
      )}

      {/* Follow Pascal */}
      {!is2dOnly && <FollowPascalToggle />}

      {/* Top View */}
      {!is2dOnly && (
        <ActionButton
          className="group hover:bg-black/4"
          label={t('camera.topView')}
          onClick={goToTopView}
          size="icon"
          variant="ghost"
        >
          <Image
            alt={t('camera.topView')}
            className="h-[28px] w-[28px] object-contain opacity-70 transition-opacity group-hover:opacity-100"
            height={28}
            src="/icons/topview.webp"
            width={28}
          />
        </ActionButton>
      )}
    </div>
  )
}
