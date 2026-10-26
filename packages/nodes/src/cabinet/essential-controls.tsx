'use client'

import { PanelSection, SegmentedControl, useT } from '@pascal-app/editor'
import { messages } from './messages'
import {
  type CabinetCompartment,
  type CabinetCooktopCompartmentType,
  type CabinetFridgeCompartmentType,
  COOKTOP_DEFAULT_GAS_LAYOUT,
  COOKTOP_DEFAULT_INDUCTION_LAYOUT,
  compartmentDoorType,
  compartmentSinkLayout,
  isCooktopCompartmentType,
  isFridgeCompartmentType,
  patchCompartment,
} from './stack'

export function CabinetEssentialControls({
  stack,
  width,
  onReplace,
}: {
  stack: CabinetCompartment[]
  width: number
  onReplace: (index: number, next: CabinetCompartment) => void
}) {
  const t = useT(messages)
  const itemLabel = (type: CabinetCompartment['type']) =>
    t(
      type === 'door'
        ? 'doorDirection'
        : type === 'sink'
          ? 'sinkLayout'
          : isFridgeCompartmentType(type)
            ? 'fridgeType'
            : 'cooktopType',
    )
  const entries = stack
    .map((part, index) => ({ part, index }))
    .filter(
      ({ part }) =>
        part.type === 'door' ||
        part.type === 'sink' ||
        isFridgeCompartmentType(part.type) ||
        isCooktopCompartmentType(part.type),
    )
  if (!entries.length) return null
  return (
    <PanelSection title={t('itemOptions')}>
      {entries.map(({ part, index }) => (
        <div key={part.id} className="space-y-2 pb-2">
          <div className="text-xs text-muted-foreground">
            {entries.length > 1
              ? t('itemOptionN', { label: itemLabel(part.type), n: index + 1 })
              : itemLabel(part.type)}
          </div>
          {part.type === 'door' && (
            <SegmentedControl
              value={compartmentDoorType(part, width)}
              options={[
                { value: 'single-left', label: t('leftHinge') },
                { value: 'single-right', label: t('rightHinge') },
                { value: 'double', label: t('double') },
                { value: 'glass', label: t('glass') },
              ]}
              onChange={(value) =>
                onReplace(
                  index,
                  patchCompartment(part, {
                    doorType: value as 'single-left' | 'single-right' | 'double' | 'glass',
                  }),
                )
              }
            />
          )}
          {part.type === 'sink' && (
            <SegmentedControl
              value={compartmentSinkLayout(part)}
              options={[
                { value: 'single', label: t('single') },
                { value: 'double', label: t('double') },
                { value: 'double-offset', label: '60/40' },
              ]}
              onChange={(value) =>
                onReplace(
                  index,
                  patchCompartment(part, {
                    sinkLayout: value as 'single' | 'double' | 'double-offset',
                  }),
                )
              }
            />
          )}
          {isFridgeCompartmentType(part.type) && (
            <SegmentedControl
              value={part.type}
              options={[
                { value: 'fridge-single', label: t('single') },
                { value: 'fridge-double', label: t('double') },
                { value: 'fridge-top-freezer', label: t('topFreezer2') },
                { value: 'fridge-bottom-freezer', label: t('bottomFreezer2') },
              ]}
              onChange={(value) =>
                onReplace(
                  index,
                  patchCompartment(part, { type: value as CabinetFridgeCompartmentType }),
                )
              }
            />
          )}
          {isCooktopCompartmentType(part.type) && (
            <SegmentedControl
              value={part.type}
              options={[
                { value: 'cooktop-gas', label: t('gas') },
                { value: 'cooktop-induction', label: t('induction') },
              ]}
              onChange={(value) =>
                onReplace(
                  index,
                  patchCompartment(part, {
                    type: value as CabinetCooktopCompartmentType,
                    cooktopLayout:
                      value === 'cooktop-gas'
                        ? COOKTOP_DEFAULT_GAS_LAYOUT
                        : COOKTOP_DEFAULT_INDUCTION_LAYOUT,
                  }),
                )
              }
            />
          )}
        </div>
      ))}
    </PanelSection>
  )
}
