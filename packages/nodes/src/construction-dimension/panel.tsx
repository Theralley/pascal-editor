'use client'

import {
  type AnyNode,
  type AnyNodeId,
  type ConstructionDimensionDatumPolicy,
  type ConstructionDimensionDrawingPresentation,
  type ConstructionDimensionImperialPrecision,
  type ConstructionDimensionMetricNotation,
  type ConstructionDimensionNode,
  type ConstructionDimensionTerminator,
  type ConstructionDimensionTextPosition,
  type ConstructionDrawingType,
  resolveConstructionDimensionDrawingOverride,
  resolveConstructionDimensionDrawingPresentation,
  setConstructionDimensionDrawingPresentation,
  setConstructionDimensionDrawingSuppressedSegments,
  useScene,
} from '@pascal-app/core'
import {
  ActionButton,
  ActionGroup,
  DRAWING_TYPE_OPTIONS,
  PanelSection,
  PanelWrapper,
  SliderControl,
  triggerSFX,
  useDrawingView,
  useT,
} from '@pascal-app/editor'
import { useViewer } from '@pascal-app/viewer'
import { Trash2 } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import { messages } from './messages'

const DATUM_POLICIES: ConstructionDimensionDatumPolicy[] = [
  'centerline',
  'wall-face',
  'structural-face',
  'finish-face',
]

const TERMINATORS: ConstructionDimensionTerminator[] = [
  'architectural-tick',
  'filled-arrow',
  'open-arrow',
  'dot',
]

const TEXT_POSITIONS: ConstructionDimensionTextPosition[] = ['above', 'centered']

const IMPERIAL_PRECISIONS: ConstructionDimensionImperialPrecision[] = [
  '1',
  '1/2',
  '1/4',
  '1/8',
  '1/16',
]

const METRIC_NOTATIONS: ConstructionDimensionMetricNotation[] = ['meters', 'millimeters']

export default function ConstructionDimensionPanel() {
  const t = useT(messages)
  const selectedId = useViewer((state) => state.selection.selectedIds[0])
  const setSelection = useViewer((state) => state.setSelection)
  const dimension = useScene((state) => {
    const node = selectedId ? state.nodes[selectedId as AnyNodeId] : undefined
    return node?.type === 'construction-dimension' ? node : null
  })
  const updateNode = useScene((state) => state.updateNode)
  const deleteNode = useScene((state) => state.deleteNode)
  const activeDrawingType = useDrawingView((state) => state.drawingType)

  if (!(dimension && selectedId)) return null
  const update = (patch: Partial<ConstructionDimensionNode>) => updateNode(dimension.id, patch)
  const supportsCenterMark = ['radius', 'diameter', 'arc-length', 'angular'].includes(
    dimension.mode,
  )
  const activeDrawingLabel = t(`drawing.${activeDrawingType}`)
  const activePresentation = resolveConstructionDimensionDrawingPresentation(
    dimension,
    activeDrawingType,
  )
  const activeDrawingOverride = resolveConstructionDimensionDrawingOverride(
    dimension,
    activeDrawingType,
  )
  const suppressedSegmentsText = formatSuppressedSegments(
    activeDrawingOverride?.suppressedSegmentIndexes ?? [],
  )
  const updateDrawingPresentation = (
    drawingType: ConstructionDrawingType,
    presentation: ConstructionDimensionDrawingPresentation,
  ) => {
    const drawingOverrides = setConstructionDimensionDrawingPresentation(
      dimension,
      drawingType,
      presentation,
    )
    const firstFoundationController =
      presentation === 'controlled' && !dimension.controllingDimensionId
        ? selectFoundationControllers(useScene.getState().nodes, dimension.id)[0]
        : undefined
    update({
      drawingOverrides,
      ...(presentation === 'controlled' && !dimension.controllingDimensionId
        ? { controllingDimensionId: firstFoundationController?.id ?? null }
        : {}),
    })
  }
  const updateSuppressedSegments = (value: string) => {
    update({
      drawingOverrides: setConstructionDimensionDrawingSuppressedSegments(
        dimension,
        activeDrawingType,
        parseSuppressedSegments(value),
      ),
    })
  }

  return (
    <PanelWrapper
      icon="/icons/blueprint.webp"
      onClose={() => setSelection({ selectedIds: [] })}
      title={t('title')}
      width={320}
    >
      <PanelSection title={t('dimension.heading')}>
        <div className="flex items-center justify-between gap-3 text-sm">
          <span className="text-muted-foreground">{t('dimension.mode')}</span>
          <span className="font-medium text-foreground">{t(`mode.${dimension.mode}`)}</span>
        </div>
        <SliderControl
          label={t('dimension.featureCount')}
          max={999}
          min={1}
          onChange={(featureCount) => update({ featureCount })}
          precision={0}
          step={1}
          value={dimension.featureCount}
        />
        {supportsCenterMark ? (
          <label className="flex items-center justify-between gap-3 text-sm">
            <span className="text-muted-foreground">{t('dimension.centerMark')}</span>
            <input
              checked={dimension.showCenterMark}
              onChange={(event) => update({ showCenterMark: event.target.checked })}
              type="checkbox"
            />
          </label>
        ) : null}
      </PanelSection>

      <PanelSection title={t('coordination.heading')}>
        <SelectField
          label={t('coordination.primary')}
          onChange={(drawingType) =>
            update({ drawingType: drawingType as ConstructionDrawingType })
          }
          options={DRAWING_TYPE_OPTIONS.map((option) => ({
            label: t(`drawing.${option.id}`),
            value: option.id,
          }))}
          value={dimension.drawingType}
        />
        <SelectField
          label={t('coordination.presentation', { drawing: activeDrawingLabel })}
          onChange={(presentation) =>
            updateDrawingPresentation(
              activeDrawingType,
              presentation as ConstructionDimensionDrawingPresentation,
            )
          }
          options={[
            { label: t('coordination.shown'), value: 'shown' },
            { label: t('coordination.omitted'), value: 'omit' },
            ...(activeDrawingType === 'floor-plan'
              ? [{ label: t('coordination.controlled'), value: 'controlled' }]
              : []),
          ]}
          value={activePresentation}
        />
        {activeDrawingType === 'floor-plan' && activePresentation === 'controlled' ? (
          <FoundationControllerField
            dimensionId={dimension.id}
            onChange={(controllingDimensionId) =>
              update({
                controllingDimensionId,
              })
            }
            value={dimension.controllingDimensionId ?? ''}
          />
        ) : null}
        <p className="text-muted-foreground text-xs">{t('coordination.linked')}</p>
        <TextField
          label={t('coordination.suppressed', { drawing: activeDrawingLabel })}
          onCommit={updateSuppressedSegments}
          placeholder={t('coordination.suppressedPlaceholder')}
          value={suppressedSegmentsText}
        />
        <p className="text-muted-foreground text-xs">{t('coordination.segmentNote')}</p>
      </PanelSection>

      <PanelSection title={t('notation.heading')}>
        <TextField
          label={t('notation.prefix')}
          onCommit={(prefix) => update({ prefix })}
          value={dimension.prefix}
        />
        <TextField
          label={t('notation.suffix')}
          onCommit={(suffix) => update({ suffix })}
          value={dimension.suffix}
        />
        <TextField
          label={t('notation.override')}
          onCommit={(textOverride) => update({ textOverride: textOverride || null })}
          placeholder={t('notation.overridePlaceholder')}
          value={dimension.textOverride ?? ''}
        />
      </PanelSection>

      <PanelSection title={t('standards.heading')}>
        <SelectField
          label={t('standards.datum')}
          onChange={(datumPolicy) =>
            update({ datumPolicy: datumPolicy as ConstructionDimensionDatumPolicy })
          }
          options={DATUM_POLICIES.map((value) => ({ label: t(`datum.${value}`), value }))}
          value={dimension.datumPolicy}
        />
        <SelectField
          label={t('standards.terminator')}
          onChange={(terminator) =>
            update({ terminator: terminator as ConstructionDimensionTerminator })
          }
          options={TERMINATORS.map((value) => ({ label: t(`terminator.${value}`), value }))}
          value={dimension.terminator}
        />
        <SelectField
          label={t('standards.textPosition')}
          onChange={(textPosition) =>
            update({ textPosition: textPosition as ConstructionDimensionTextPosition })
          }
          options={TEXT_POSITIONS.map((value) => ({ label: t(`textPosition.${value}`), value }))}
          value={dimension.textPosition}
        />
        <SelectField
          label={t('standards.imperial')}
          onChange={(imperialPrecision) =>
            update({
              imperialPrecision: imperialPrecision as ConstructionDimensionImperialPrecision,
            })
          }
          options={IMPERIAL_PRECISIONS.map((value) => ({ label: t(`precision.${value}`), value }))}
          value={dimension.imperialPrecision}
        />
        <SelectField
          label={t('standards.metric')}
          onChange={(metricNotation) =>
            update({ metricNotation: metricNotation as ConstructionDimensionMetricNotation })
          }
          options={METRIC_NOTATIONS.map((value) => ({ label: t(`notation.${value}`), value }))}
          value={dimension.metricNotation}
        />
        <SliderControl
          label={t('standards.gap')}
          max={0.5}
          min={0}
          onChange={(extensionStartGap) => update({ extensionStartGap })}
          precision={3}
          step={0.005}
          value={dimension.extensionStartGap}
        />
        <SliderControl
          label={t('standards.overshoot')}
          max={0.5}
          min={0}
          onChange={(extensionOvershoot) => update({ extensionOvershoot })}
          precision={3}
          step={0.005}
          value={dimension.extensionOvershoot}
        />
      </PanelSection>

      <PanelSection title={t('actions.heading')}>
        <ActionGroup>
          <ActionButton
            className="border-red-500/40 text-red-700 dark:text-red-200 hover:bg-red-500/15"
            icon={<Trash2 className="h-4 w-4" />}
            label={t('actions.delete')}
            onClick={() => {
              triggerSFX('sfx:structure-delete')
              deleteNode(dimension.id)
              setSelection({ selectedIds: [] })
            }}
          />
        </ActionGroup>
      </PanelSection>
    </PanelWrapper>
  )
}

function selectFoundationControllers(
  nodes: Record<string, AnyNode>,
  excludedId: AnyNodeId,
): ConstructionDimensionNode[] {
  return Object.values(nodes).filter(
    (candidate): candidate is ConstructionDimensionNode =>
      candidate.type === 'construction-dimension' &&
      candidate.id !== excludedId &&
      candidate.drawingType === 'foundation-plan',
  )
}

function FoundationControllerField({
  dimensionId,
  value,
  onChange,
}: {
  dimensionId: AnyNodeId
  value: string
  onChange: (value: NonNullable<ConstructionDimensionNode['controllingDimensionId']>) => void
}) {
  const t = useT(messages)
  const foundationControllers = useScene(
    useShallow((state) => selectFoundationControllers(state.nodes, dimensionId)),
  )
  return (
    <SelectField
      disabled={foundationControllers.length === 0}
      label={t('coordination.controller')}
      onChange={(controllingDimensionId) =>
        onChange(
          controllingDimensionId as NonNullable<
            ConstructionDimensionNode['controllingDimensionId']
          >,
        )
      }
      options={foundationControllers.map((controller) => ({
        label: controller.name || t('coordination.controllerFallback'),
        value: controller.id,
      }))}
      placeholder={t('coordination.noControllers')}
      value={value}
    />
  )
}

function parseSuppressedSegments(value: string): number[] {
  return [
    ...new Set(
      value
        .split(/[,\s]+/)
        .map((part) => Number.parseInt(part, 10))
        .filter((index) => Number.isInteger(index) && index > 0)
        .map((index) => index - 1),
    ),
  ].sort((left, right) => left - right)
}

function formatSuppressedSegments(indexes: readonly number[]): string {
  return indexes.map((index) => index + 1).join(', ')
}

function SelectField({
  label,
  value,
  options,
  placeholder,
  disabled,
  onChange,
}: {
  label: string
  value: string
  options: Array<{ label: string; value: string }>
  placeholder?: string
  disabled?: boolean
  onChange: (value: string) => void
}) {
  return (
    <label className="space-y-1 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <select
        className="w-full rounded-md border border-border/70 bg-background px-2 py-1.5 text-foreground disabled:opacity-50"
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        value={value}
      >
        {placeholder && options.length === 0 ? <option value="">{placeholder}</option> : null}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  )
}

function TextField({
  label,
  value,
  placeholder,
  onCommit,
}: {
  label: string
  value: string
  placeholder?: string
  onCommit: (value: string) => void
}) {
  return (
    <label className="space-y-1 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <input
        className="w-full rounded-md border border-border/70 bg-background px-2 py-1.5 text-foreground"
        defaultValue={value}
        key={value}
        onBlur={(event) => onCommit(event.target.value)}
        placeholder={placeholder}
      />
    </label>
  )
}
