'use client'

import {
  type AnyNodeId,
  getEffectiveNode,
  getRoofGlazing,
  isGlazedRoofSegment,
  type RoofGlazing,
  type RoofSegmentNode,
  supportsRoofGlazing,
  useLiveNodeOverrides,
} from '@pascal-app/core'
import { PanelSection, SegmentedControl, ToggleControl, useT } from '@pascal-app/editor'
import { useEffect, useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import {
  GLAZING_INFILL_OPTIONS,
  GlazingColor,
  GlazingGridControls,
  GlazingNumber,
} from './glazing-controls'
import { GlazingPanelEditor } from './glazing-panel-editor'
import { createRoofGlazingPreview } from './glazing-preview'
import { messages } from './messages'

export function RoofGlazingPanel({ segments }: { segments: readonly RoofSegmentNode[] }) {
  const t = useT(messages)
  useLiveNodeOverrides(
    useShallow((state) => segments.map((segment) => state.overrides.get(segment.id))),
  )
  const idKey = segments.map((segment) => segment.id).join(',')
  const preview = useMemo(
    () => createRoofGlazingPreview(idKey ? (idKey.split(',') as AnyNodeId[]) : []),
    [idKey],
  )
  useEffect(() => () => preview.cancel(), [preview])
  if (!segments.length) return null
  const effectiveSegments = segments.map((segment) => getEffectiveNode(segment))
  const node = effectiveSegments[0]!
  const config = getRoofGlazing(node)
  const configs = effectiveSegments.map(getRoofGlazing)
  const glazed = isGlazedRoofSegment(node)
  const supported = effectiveSegments.every(supportsRoofGlazing)
  const mixed = effectiveSegments.some((segment) => isGlazedRoofSegment(segment) !== glazed)
  const allBarrel = effectiveSegments.every((segment) => segment.roofType === 'barrel')
  const mixedField = (field: keyof RoofGlazing) =>
    configs.some((value) => value[field] !== config[field])
  const update = (patch: Partial<RoofGlazing>) => {
    preview.previewGlazing((current) => ({ ...current, ...patch }))
    preview.commit()
  }
  return (
    <>
      <PanelSection title={t('roofSystem')}>
        <SegmentedControl
          value={glazed ? 'glazed' : 'standard'}
          mixed={mixed}
          options={[
            { value: 'standard', label: t('standard') },
            { value: 'glazed', label: t('glazed'), disabled: !supported },
          ]}
          onChange={(roofSystem) => {
            if (roofSystem === 'standard' || supported) preview.commit({ roofSystem })
          }}
        />
        {!supported && (
          <p className="pt-1 text-[11px] leading-relaxed text-muted-foreground">
            {t('glazingIsAvailableForGable')}
          </p>
        )}
        {mixed && (
          <p className="pt-1 text-[11px] leading-relaxed text-muted-foreground">
            {t('chooseOneRoofSystemTo')}
          </p>
        )}
        {segments.length > 1 && (
          <p className="pt-1 text-[11px] text-muted-foreground">
            {t('changesApplyToAll', { n: segments.length })}
          </p>
        )}
      </PanelSection>
      {glazed && !mixed && (
        <>
          <GlazingGridControls
            axis="across"
            title={allBarrel ? t('gridAlongTheLength') : t('gridAcrossTheRoof')}
            description={allBarrel ? t('dividesTheLengthOfEach') : t('dividesEachRoofFaceInto')}
            grid={config.across}
            grids={configs.map((value) => value.across)}
            preview={preview}
          />
          <GlazingGridControls
            axis="along"
            title={allBarrel ? t('gridWithinEachArchBay') : t('gridAlongTheSlope')}
            description={allBarrel ? t('subdividesEachFlatArchBay') : t('spacingIsMeasuredOnThe')}
            grid={config.along}
            grids={configs.map((value) => value.along)}
            preview={preview}
          />
          <PanelSection title={t('framing')}>
            <GlazingNumber
              field="frameWidth"
              label={t('frameWidth')}
              value={config.frameWidth}
              mixed={mixedField('frameWidth')}
              preview={preview}
            />
            <GlazingNumber
              field="frameDepth"
              label={t('frameDepth')}
              value={config.frameDepth}
              mixed={mixedField('frameDepth')}
              preview={preview}
            />
            <GlazingColor
              field="frameColor"
              label={t('frameColor')}
              value={config.frameColor}
              mixed={mixedField('frameColor')}
              preview={preview}
            />
          </PanelSection>
          <PanelSection title={t('glass')}>
            <GlazingNumber
              field="glassThickness"
              label={t('paneThickness')}
              value={config.glassThickness}
              mixed={mixedField('glassThickness')}
              preview={preview}
            />
            <GlazingColor
              field="glassColor"
              label={t('glassTint')}
              value={config.glassColor}
              mixed={mixedField('glassColor')}
              preview={preview}
            />
            <GlazingNumber
              field="glassOpacity"
              label={t('opacity')}
              value={config.glassOpacity}
              mixed={mixedField('glassOpacity')}
              preview={preview}
              fraction
            />
            <GlazingNumber
              field="glassRoughness"
              label={t('roughness')}
              value={config.glassRoughness}
              mixed={mixedField('glassRoughness')}
              preview={preview}
              fraction
            />
          </PanelSection>
          <PanelSection title={t('infill')}>
            <div
              className="flex flex-col gap-2 pb-1"
              role="group"
              aria-label={t('defaultPanelInfill')}
            >
              <span className="text-xs text-muted-foreground">{t('defaultPanelInfill')}</span>
              <SegmentedControl
                value={config.panelType}
                mixed={mixedField('panelType')}
                options={GLAZING_INFILL_OPTIONS.map(({ labelKey, value }) => ({
                  label: t(labelKey),
                  value,
                }))}
                onChange={(panelType) => update({ panelType })}
              />
            </div>
            <ToggleControl
              label={t('closeTheRoofEnds')}
              checked={config.glazedEnds}
              mixed={mixedField('glazedEnds')}
              onChange={(glazedEnds) => update({ glazedEnds })}
            />
            <p className="pt-1 text-[11px] leading-relaxed text-muted-foreground">
              {t('endInfillFillsTheSpace')}
            </p>
          </PanelSection>
          {segments.length === 1 && (
            <GlazingPanelEditor key={node.id} node={node} onUpdate={update} />
          )}
        </>
      )}
    </>
  )
}
