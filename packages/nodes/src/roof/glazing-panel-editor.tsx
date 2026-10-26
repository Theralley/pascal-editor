'use client'

import {
  getGlazedRoofLayout,
  getGlazedRoofPanelType,
  getRoofGlazing,
  type RoofGlazing,
  type RoofSegmentNode,
} from '@pascal-app/core'
import {
  ActionButton,
  PanelSection,
  SegmentedControl,
  SelectControl,
  SliderControl,
  useT,
} from '@pascal-app/editor'
import { RotateCcw } from 'lucide-react'
import { useState } from 'react'
import { GLAZING_INFILL_OPTIONS } from './glazing-controls'
import { messages } from './messages'

function faceLabel(id: string): string {
  if (id.startsWith('barrel-')) return `Arch bay ${Number(id.slice(7)) + 1}`
  const labels: Record<string, string> = {
    front: 'Front slope',
    back: 'Back slope',
    slope: 'Shed slope',
    'end-left': 'Left end',
    'end-right': 'Right end',
  }
  return labels[id] ?? id
}

export function GlazingPanelEditor({
  node,
  onUpdate,
}: {
  node: RoofSegmentNode
  onUpdate: (patch: Partial<RoofGlazing>) => void
}) {
  const t = useT(messages)
  const [faceId, setFaceId] = useState('front')
  const [column, setColumn] = useState(0)
  const [row, setRow] = useState(0)
  const config = getRoofGlazing(node)
  const layouts = getGlazedRoofLayout(node).filter(
    ({ face, across, along }) => face.polygon.length >= 3 && across.length > 1 && along.length > 1,
  )
  const layout = layouts.find((entry) => entry.face.id === faceId) ?? layouts[0]
  if (!layout) return null
  const columns = layout.across.length - 1,
    rows = layout.along.length - 1
  const activeColumn = Math.max(0, Math.min(column, columns - 1)),
    activeRow = Math.max(0, Math.min(row, rows - 1))
  const matches = (panel: RoofGlazing['panels'][number]) =>
    panel.face === layout.face.id && panel.column === activeColumn && panel.row === activeRow
  const overridden = config.panels.some(matches)
  const update = (type?: RoofGlazing['panelType']) =>
    onUpdate({
      panels: [
        ...config.panels.filter((panel) => !matches(panel)),
        ...(type ? [{ face: layout.face.id, column: activeColumn, row: activeRow, type }] : []),
      ],
    })
  return (
    <PanelSection title={t('individualPanels')} defaultExpanded={false}>
      <p className="pb-1 text-[11px] leading-relaxed text-muted-foreground">
        {t('chooseAPanelToOverride')}
      </p>
      <SelectControl
        label={t('roofFace')}
        value={layout.face.id}
        options={layouts.map(({ face }) => ({ value: face.id, label: faceLabel(face.id) }))}
        onChange={(value) => {
          setFaceId(value)
          setColumn(0)
          setRow(0)
        }}
      />
      <p className="py-1 text-[11px] text-muted-foreground">
        {columns} {t(columns === 1 ? 'columnLower' : 'columnsLower')} · {rows}{' '}
        {t(rows === 1 ? 'rowLower' : 'rowsLower')}
      </p>
      {columns > 1 && (
        <SliderControl
          label={t('column')}
          value={activeColumn + 1}
          min={1}
          max={columns}
          step={1}
          precision={0}
          onChange={(value) => setColumn(Math.round(value) - 1)}
        />
      )}
      {rows > 1 && (
        <SliderControl
          label={t('row')}
          value={activeRow + 1}
          min={1}
          max={rows}
          step={1}
          precision={0}
          onChange={(value) => setRow(Math.round(value) - 1)}
        />
      )}
      <div className="flex flex-col gap-2 pt-1" role="group" aria-label={t('selectedPanelInfill')}>
        <span className="flex items-center justify-between text-xs text-muted-foreground">
          {t('panelInfill')}{' '}
          <span className="text-[11px]">{overridden ? t('custom') : t('default')}</span>
        </span>
        <SegmentedControl
          value={getGlazedRoofPanelType(node, layout.face.id, activeColumn, activeRow)}
          options={GLAZING_INFILL_OPTIONS.map(({ labelKey, value }) => ({
            label: t(labelKey),
            value,
          }))}
          onChange={(type) => update(type)}
        />
      </div>
      <ActionButton
        label={t('resetToDefault')}
        icon={<RotateCcw className="size-3.5" />}
        disabled={!overridden}
        className="mt-1 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-[#2C2C2E]"
        onClick={() => update()}
      />
    </PanelSection>
  )
}
