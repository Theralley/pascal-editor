'use client'

import { type SceneMaterialId } from '@pascal-app/core'
import { Eraser, PaintBucket, Pentagon, Pipette, Plus, Square } from 'lucide-react'
import { useState } from 'react'
import { type MessageKey, useT } from '../../../i18n'
import { useMaterialPaintPanelModel } from '../../../lib/material-paint-panel-model'
import { type PaintMode, usePaintRegionMode } from '../../../lib/paint-region-mode'
import useEditor, { armMaterialPaint } from '../../../store/use-editor'
import { Button } from '../primitives/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '../primitives/tooltip'
import { MaterialPicker } from './material-picker'
import { messages } from './messages'
import { SceneMaterialList } from './scene-material-list'
import { SegmentedControl } from './segmented-control'

/**
 * Material picker for paint mode. Embedders render this wherever paint controls
 * belong (the community editor places it in the Build sidebar while paint mode
 * is active). It fills its container's height and lays out as three bands: a
 * fixed mode header, a single scrolling catalog grid, and a fixed
 * scene-material footer (always visible, with a `+` to add a custom material).
 */
export type MaterialPaintPanelProps = {
  /** When provided, the catalog grid leads with a "New material" tile that invokes it. */
  onCreateMaterialRequest?: () => void
}

const PAINT_MODE_OPTIONS: {
  value: PaintMode
  labelKey: MessageKey<typeof messages>
  icon: typeof PaintBucket
}[] = [
  { value: 'surface', labelKey: 'paint.surface', icon: PaintBucket },
  {
    value: 'rectangle',
    labelKey: 'paint.rectangle',
    icon: Square,
  },
  {
    value: 'polygon',
    labelKey: 'paint.polygon',
    icon: Pentagon,
  },
  {
    value: 'erase',
    labelKey: 'paint.erase',
    icon: Eraser,
  },
  {
    value: 'pick',
    labelKey: 'paint.pick',
    icon: Pipette,
  },
]

/**
 * Paint the whole surface, draw part of a wall, floor or ceiling first, erase, or
 * pick a material off a surface. Erase
 * is the eraser the paint path already knows (a click writes "no finish"), so a
 * painted region goes and a whole-surface paint returns to its default. The row
 * shows a choice only while paint mode is on; any pick (erase included) turns it
 * on, so nothing here needs a colour first.
 */
function PaintModeControl() {
  const t = useT(messages)
  const painting = useEditor((s) => s.mode === 'material-paint')
  const mode = usePaintRegionMode((s) => s.mode)
  const select = (next: PaintMode) => {
    if (painting) usePaintRegionMode.getState().setMode(next)
    else armMaterialPaint(undefined, next)
  }
  return (
    <div
      className="shrink-0 space-y-1.5 pb-2"
      data-paint-mode={painting ? mode : 'off'}
      // A clicked option must not keep focus: the next shortcut (V) would light
      // its focus ring and it would read as still chosen after paint mode ends.
      onPointerUp={(event) => (event.target as HTMLElement).closest('button')?.blur()}
    >
      <div className="px-0.5 font-medium text-muted-foreground text-xs">
        {painting && mode === 'erase'
          ? t('paint.titleErase')
          : painting && mode === 'pick'
            ? t('paint.titlePick')
            : t('paint.title')}
      </div>
      <SegmentedControl
        mixed={!painting}
        onChange={select}
        options={PAINT_MODE_OPTIONS.map(({ value, labelKey, icon: Icon }) => ({
          value,
          label: (
            <Tooltip>
              <TooltipTrigger asChild>
                <span aria-label={t(labelKey)} className="flex items-center justify-center">
                  <Icon className="h-3.5 w-3.5" />
                </span>
              </TooltipTrigger>
              <TooltipContent>{t(labelKey)}</TooltipContent>
            </Tooltip>
          ),
        }))}
        value={mode}
      />
    </div>
  )
}

export function MaterialPaintPanel({ onCreateMaterialRequest }: MaterialPaintPanelProps) {
  const t = useT(messages)
  const painting = useEditor((s) => s.mode === 'material-paint')
  const erasing = usePaintRegionMode((s) => s.mode) === 'erase' && painting
  const {
    activePaintMaterial,
    materialCount,
    selectMaterial,
    createCustomMaterial: createMaterial,
  } = useMaterialPaintPanelModel()
  const [autoEditMaterialId, setAutoEditMaterialId] = useState<SceneMaterialId | null>(null)
  const createCustomMaterial = () => setAutoEditMaterialId(createMaterial())

  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      {/* Fixed: whole surface, part of a surface, or erase. */}
      <PaintModeControl />

      {/* Erasing paints nothing: no swatches to pick from, just what a click does. */}
      {erasing ? (
        <p className="px-0.5 py-1 text-muted-foreground text-xs" data-paint-erase-note>
          {t('paint.eraseNote')}
        </p>
      ) : (
        <>
      {/* Scrolls: category tabs (fixed inside) + catalog grid (the scroll). */}
      {/* A stable hook for host-app onboarding to point at. Static, and read
          only from outside: nothing here depends on it. */}
      <div className="min-h-0 flex-1" data-guide-target="paint-material">
        <MaterialPicker
          onCreateMaterialRequest={onCreateMaterialRequest}
          onSelectMaterialPreset={selectMaterial}
          selectedMaterialPreset={activePaintMaterial?.materialPreset}
        />
      </div>

      {/* Fixed footer: scene materials, always visible, with a `+` to add one. */}
      <div className="mt-2 shrink-0 space-y-1.5 border-border/60 border-t pt-2">
        <div className="flex items-center justify-between">
          <span className="font-medium text-muted-foreground text-xs uppercase tracking-[0.12em]">
            {t('paint.sceneMaterials')}
          </span>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                aria-label={t('paint.addMaterial')}
                onClick={createCustomMaterial}
                size="icon-sm"
                type="button"
                variant="outline"
              >
                <Plus />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t('paint.addMaterial')}</TooltipContent>
          </Tooltip>
        </div>
        <div className="subtle-scrollbar max-h-56 overflow-y-auto">
          {materialCount > 0 ? (
            <SceneMaterialList autoEditId={autoEditMaterialId} />
          ) : (
            <p className="px-0.5 py-1 text-muted-foreground text-xs">
              {t('paint.noMaterials')}
            </p>
          )}
        </div>
      </div>
        </>
      )}
    </div>
  )
}
