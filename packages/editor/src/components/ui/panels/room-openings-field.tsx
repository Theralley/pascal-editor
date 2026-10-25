'use client'

import { area, useScene } from '@pascal-app/core'
import { useViewer } from '@pascal-app/viewer'
import { useMemo } from 'react'
import {
  endFloorEdit,
  finishFloorEdit,
  roomSurfaceOpenings,
  startFloorEdit,
  useFloorEditSession,
} from '../../../lib/floor-edit-session'
import { type OpeningSurface, startOpeningDraft } from '../../../lib/floor-opening-draft'
import { formatAreaLabel } from '../../../lib/measurements'
import { pill } from './room-construction-rows'
import { ShapeChoice } from './shape-choice'
import { useLocale, useT } from '../../../i18n'
import { messages } from './messages'

/**
 * A room's openings through its floor (or its ceiling), inside the row's
 * settings. The floor has "Edit floor": a session that outlines the openings
 * and lists them, with "Cut opening" to draw another — Rectangle or Polygon,
 * picked before drawing. The ceiling cuts directly (its own shape editing is
 * "Edit shape").
 */
export function RoomOpeningsField({
  zoneId,
  surface,
}: {
  zoneId: string
  surface: OpeningSurface
}) {
  const t = useT(messages)
  const locale = useLocale()
  const nodes = useScene((scene) => scene.nodes)
  const unit = useViewer((s) => s.unit)
  const readOnly = useScene((scene) => scene.readOnly)
  const openings = useMemo(
    () => roomSurfaceOpenings(nodes, zoneId, surface),
    [nodes, zoneId, surface],
  )
  const editing = useFloorEditSession((s) => surface === 'floor' && s.session?.zoneId === zoneId)
  const cut = (
    <ShapeChoice
      data={`cut-opening-${surface}`}
      disabled={readOnly}
      label={t('opening.cut')}
      onPick={(shape) => startOpeningDraft(zoneId, surface, shape)}
    />
  )
  if (surface === 'ceiling')
    return (
      <div className="flex flex-col gap-1" data-room-openings={surface}>
        {openings.length > 0 && <span>{t('opening.count', { count: openings.length })}</span>}
        {cut}
      </div>
    )
  if (!editing)
    return (
      <div className="flex min-h-7 items-center justify-between gap-3" data-room-openings={surface}>
        <span>{openings.length ? t('opening.count', { count: openings.length }) : t('opening.none')}</span>
        <button
          className={pill}
          data-edit-floor
          onClick={() => startFloorEdit(zoneId)}
          type="button"
        >
          {t('opening.editFloor')}
        </button>
      </div>
    )
  return (
    <div className="flex flex-col gap-1.5" data-room-openings={surface} data-editing-floor>
      {openings.length === 0 ? (
        <p>{t('opening.noneYet')}</p>
      ) : (
        openings.map((opening, index) => (
          <button
            className="flex items-center justify-between rounded-md px-2 py-1 text-left transition-colors hover:bg-accent"
            data-floor-opening-row={opening.id}
            key={opening.id}
            onClick={() => useViewer.getState().setSelection({ selectedIds: [opening.id] })}
            type="button"
          >
            <span className="text-foreground">
              {opening.source === 'stair'
                ? t('opening.title.stair')
                : opening.source === 'elevator'
                  ? t('opening.title.elevator')
                  : t('opening.numbered', { number: index + 1 })}
            </span>
            <span className="font-mono tabular-nums">
              {formatAreaLabel(area([{ outer: opening.polygon, holes: [] }]), unit, 2, locale)}
            </span>
          </button>
        ))
      )}
      {cut}
      <div className="flex items-center justify-end gap-2">
        <button
          className={pill}
          data-finish-floor-edit
          onClick={() => (finishFloorEdit() ? undefined : endFloorEdit())}
          type="button"
        >
          {t('done')}
        </button>
      </div>
    </div>
  )
}
