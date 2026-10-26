'use client'

import {
  type AnyNode,
  type AnyNodeId,
  BLOCK_BODY_SLOT_ID,
  type BlockNode,
  blockSlots,
  getCatalogMaterialById,
  type MaterialSchema,
  parseMaterialColor,
  parseMaterialRef,
  type SceneMaterialId,
  useScene,
} from '@pascal-app/core'
import {
  ActionButton,
  ActionGroup,
  createEditorApi,
  PanelSection,
  PanelWrapper,
  SliderControl,
  ToggleControl,
  triggerSFX,
  useInteractionScope,
  useT,
} from '@pascal-app/editor'
import { useViewer } from '@pascal-app/viewer'
import { Check, Move, Plus, Trash2 } from 'lucide-react'
import { useCallback, useRef, useState } from 'react'
import { resolveSlotPaintMaterialRef } from '../shared/slot-paint'
import useBlockEditSession from './edit-session'
import {
  assignBlockMaterial,
  blockMaterialSelection,
  createAssignedBlockMaterialSlot,
  removeBlockMaterialSlot,
  renameBlockMaterialSlot,
} from './material-slots'
import { messages } from './messages'

const SLOT_TRAILING_ACTION_CLASS =
  'm-2 ml-0 flex w-8 shrink-0 items-center justify-center rounded-md'
const SLOT_DISABLED_ACTION_CLASS =
  'disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-black/4 dark:disabled:hover:bg-[#2C2C2E] disabled:active:bg-black/4 dark:disabled:active:bg-[#2C2C2E]'
const NEW_BLOCK_SLOT_MATERIAL = {
  preset: 'custom',
  properties: {
    color: '#7768d8',
    roughness: 0.75,
    metalness: 0,
    opacity: 1,
    transparent: false,
    side: 'front',
  },
} satisfies MaterialSchema

function materialRefLabel(
  ref: string | undefined,
  sceneMaterials: ReturnType<typeof useScene.getState>['materials'],
  fallback: string,
): string {
  const color = parseMaterialColor(ref)
  if (color) return color.toUpperCase()
  const parsed = parseMaterialRef(ref)
  if (!parsed) return fallback
  if (parsed.kind === 'scene')
    return sceneMaterials[parsed.id as keyof typeof sceneMaterials]?.name ?? ref ?? parsed.id
  return getCatalogMaterialById(parsed.id)?.label ?? ref ?? parsed.id
}

function materialRefPreview(
  ref: string | undefined,
  sceneMaterials: ReturnType<typeof useScene.getState>['materials'],
): { color: string; imageUrl?: string } {
  const color = parseMaterialColor(ref)
  if (color) return { color }
  const parsed = parseMaterialRef(ref)
  if (!parsed) return { color: '#71717a' }
  if (parsed.kind === 'scene') {
    const material = sceneMaterials[parsed.id as keyof typeof sceneMaterials]?.material
    return {
      color: material?.properties?.color ?? '#71717a',
      imageUrl: material?.texture?.url,
    }
  }
  const catalogMaterial = getCatalogMaterialById(parsed.id)
  return {
    color:
      catalogMaterial?.previewColor ?? catalogMaterial?.preset.mapProperties.color ?? '#71717a',
    imageUrl: catalogMaterial?.previewThumbnailUrl,
  }
}

export default function BlockPanel() {
  const t = useT(messages)
  const selectedId = useViewer((state) => state.selection.selectedIds[0])
  const setViewerSelection = useViewer((state) => state.setSelection)
  const node = useScene((state) => {
    if (!selectedId) return null
    const selected = state.nodes[selectedId as AnyNodeId]
    return selected?.type === 'block' ? (selected as BlockNode) : null
  })
  const nodeRef = useRef(node)
  nodeRef.current = node
  const sceneMaterials = useScene((state) => state.materials)
  const readOnly = useScene((state) => state.readOnly)
  const editing = useInteractionScope(
    (state) => state.scope.kind === 'mesh-editing' && state.scope.nodeId === selectedId,
  )
  const sessionNodeId = useBlockEditSession((state) => state.nodeId)
  const selection = useBlockEditSession((state) => state.selection)
  const [slotNotice, setSlotNotice] = useState<{ nodeId: string; text: string } | null>(null)

  const close = useCallback(() => {
    setViewerSelection({ selectedIds: [] })
  }, [setViewerSelection])

  const move = useCallback(() => {
    const current = nodeRef.current
    if (!current) return
    triggerSFX('sfx:item-pick')
    createEditorApi().engageMove(current)
    setViewerSelection({ selectedIds: [] })
  }, [setViewerSelection])

  const updatePositionX = useCallback((value: number) => {
    const current = nodeRef.current
    if (!current) return
    useScene.getState().updateNode(current.id, {
      position: [value, current.position[1], current.position[2]],
    })
  }, [])

  const updatePositionY = useCallback((value: number) => {
    const current = nodeRef.current
    if (!current) return
    useScene.getState().updateNode(current.id, {
      position: [current.position[0], value, current.position[2]],
    })
  }, [])

  const updatePositionZ = useCallback((value: number) => {
    const current = nodeRef.current
    if (!current) return
    useScene.getState().updateNode(current.id, {
      position: [current.position[0], current.position[1], value],
    })
  }, [])

  if (!node) return null

  const selectedFaceIds =
    editing && sessionNodeId === node.id && selection.mode === 'face' ? selection.ids : []
  const materialSelection = blockMaterialSelection(
    node.topology,
    selectedFaceIds,
    selection.activeId,
  )
  const slotDeclarations = blockSlots(node)
  const canOperateOnFaces = editing && selection.mode === 'face'
  const slotEditTitle = !editing
    ? t('slots.enterEditActions')
    : readOnly
      ? t('slots.readOnly')
      : undefined
  const faceCountBySlot = new Map<string, number>()
  for (const face of node.topology.faces) {
    faceCountBySlot.set(face.materialSlot, (faceCountBySlot.get(face.materialSlot) ?? 0) + 1)
  }

  const addMaterialSlot = () => {
    const scene = useScene.getState()
    const resolution = resolveSlotPaintMaterialRef(
      scene.materials,
      NEW_BLOCK_SLOT_MATERIAL,
      undefined,
    )
    if (!resolution?.ref) return
    const result = createAssignedBlockMaterialSlot(
      node.topology,
      node.slots,
      node.slotNames,
      selectedFaceIds,
      resolution.ref,
    )
    if (!result.changed) return
    let committed = false
    useScene.setState((current) => {
      if (current.readOnly || current.nodes[node.id]?.type !== 'block') return current
      committed = true
      return {
        materials: resolution.newSceneMaterial
          ? {
              ...current.materials,
              [resolution.newSceneMaterial.id as SceneMaterialId]: {
                ...resolution.newSceneMaterial,
                name: t('material.accent'),
              },
            }
          : current.materials,
        nodes: {
          ...current.nodes,
          [node.id]: {
            ...current.nodes[node.id],
            topology: result.topology,
            slots: result.slots,
            slotNames: result.slotNames,
          } as AnyNode,
        },
      }
    })
    if (!committed) return
    useScene.getState().markDirty(node.id)
    setSlotNotice({
      nodeId: node.id,
      text: t('slots.applied', {
        slot: result.slotNames[result.slotId] ?? result.slotId,
        count: selectedFaceIds.length,
      }),
    })
    triggerSFX('sfx:menu-click')
  }

  const renameMaterialSlot = (slotId: string, name: string) => {
    const slotNames = renameBlockMaterialSlot(
      node.topology,
      node.slots,
      node.slotNames,
      slotId,
      name,
    )
    if (slotNames === node.slotNames) return
    useScene.getState().updateNode(node.id, { slotNames })
  }

  const assignSlot = (slotId: string) => {
    setSlotNotice(null)
    const result = assignBlockMaterial(
      node.topology,
      node.slots,
      selectedFaceIds,
      {
        kind: 'slot',
        slotId,
      },
      node.slotNames,
    )
    if (!result.changed) return
    useScene.getState().updateNode(node.id, {
      topology: result.topology,
      slots: result.slots,
    })
    triggerSFX('sfx:menu-click')
  }

  const removeMaterialSlot = (slotId: string) => {
    const result = removeBlockMaterialSlot(node.topology, node.slots, slotId, node.slotNames)
    if (!result.changed) return
    useScene.getState().updateNode(node.id, {
      topology: result.topology,
      slots: result.slots,
      slotNames: result.slotNames,
    })
    setSlotNotice(null)
    triggerSFX('sfx:menu-click')
  }

  const slotLabel = (slot: { slotId: string; label: string }) =>
    slot.slotId === BLOCK_BODY_SLOT_ID && slot.label === 'Body' ? t('slots.body') : slot.label
  const selectionLabel = !editing
    ? t('slots.enterEdit')
    : selection.mode !== 'face'
      ? t('slots.switchToFace')
      : materialSelection.kind === 'empty'
        ? t('slots.noFaces')
        : materialSelection.kind === 'mixed'
          ? t('slots.mixed', { count: selectedFaceIds.length })
          : t('slots.selected', {
              count: selectedFaceIds.length,
              slot: (() => {
                const selected = slotDeclarations.find(
                  (slot) => slot.slotId === materialSelection.slotId,
                )
                return selected ? slotLabel(selected) : materialSelection.slotId
              })(),
            })

  return (
    <PanelWrapper
      icon="/icons/cube.webp"
      onClose={close}
      title={node.name || t('title')}
      width={340}
    >
      <PanelSection title={t('position.heading')}>
        {(
          [
            { axis: 0, label: 'X', onChange: updatePositionX },
            { axis: 1, label: 'Y', onChange: updatePositionY },
            { axis: 2, label: 'Z', onChange: updatePositionZ },
          ] as const
        ).map(({ axis, label, onChange }) => (
          <SliderControl
            key={label}
            label={label}
            onChange={onChange}
            precision={2}
            step={0.01}
            unit="m"
            value={node.position[axis]}
          />
        ))}
      </PanelSection>

      <PanelSection title={t('display.heading')}>
        <ToggleControl
          checked={node.followsWallMode === true}
          label={t('display.followsWall')}
          onChange={(checked) => {
            if (readOnly) return
            useScene.getState().updateNode(node.id, { followsWallMode: checked || undefined })
          }}
        />
      </PanelSection>

      <PanelSection title={t('slots.heading')}>
        <div className="rounded-md border border-border/50 bg-background/40 px-2.5 py-2 text-muted-foreground text-xs">
          {selectionLabel}
        </div>

        <div className="mt-2 flex justify-end">
          <ActionButton
            className={SLOT_DISABLED_ACTION_CLASS}
            disabled={!canOperateOnFaces || selectedFaceIds.length === 0 || readOnly}
            icon={<Plus className="h-3.5 w-3.5" />}
            label={t('slots.add')}
            onClick={addMaterialSlot}
            title={
              slotEditTitle ?? (selectedFaceIds.length === 0 ? t('slots.selectFirst') : undefined)
            }
          />
        </div>

        {slotNotice?.nodeId === node.id ? (
          <div
            aria-live="polite"
            className="mt-2 rounded-md border border-primary/35 bg-primary/10 px-2.5 py-2 text-foreground text-xs"
          >
            {slotNotice.text}
          </div>
        ) : null}

        <div className="mt-2 max-h-44 overflow-y-auto rounded-lg border border-border/60 bg-black/3 dark:bg-[#252527]">
          {slotDeclarations.map((slot, index) => {
            const ref = node.slots?.[slot.slotId]
            const active =
              materialSelection.kind === 'single' && materialSelection.slotId === slot.slotId
            const preview = materialRefPreview(ref, sceneMaterials)
            const faceCount = faceCountBySlot.get(slot.slotId) ?? 0
            const materialLabel =
              ref || slot.slotId === BLOCK_BODY_SLOT_ID
                ? materialRefLabel(ref, sceneMaterials, t('material.default'))
                : t('material.unpainted')
            return (
              <div
                className={`group relative flex min-h-11 items-stretch border-border/50 ${
                  index > 0 ? 'border-t' : ''
                } ${active ? 'bg-primary/15' : 'hover:bg-black/4 dark:hover:bg-white/[0.035]'}`}
                key={slot.slotId}
              >
                <button
                  className="absolute inset-0 z-0 rounded-none disabled:cursor-not-allowed disabled:opacity-50"
                  aria-label={t('slots.apply', { slot: slotLabel(slot) })}
                  aria-pressed={active}
                  disabled={!canOperateOnFaces || selectedFaceIds.length === 0 || readOnly}
                  onClick={() => assignSlot(slot.slotId)}
                  type="button"
                />
                <span className="pointer-events-none relative z-10 flex w-12 shrink-0 items-center justify-center">
                  <span
                    className="h-7 w-7 shrink-0 rounded-md border border-black/10 dark:border-white/10 bg-cover bg-center shadow-inner"
                    style={{
                      backgroundColor:
                        !ref && slot.slotId !== BLOCK_BODY_SLOT_ID ? '#7768d8' : preview.color,
                      backgroundImage: preview.imageUrl ? `url(${preview.imageUrl})` : undefined,
                    }}
                  />
                </span>

                <span className="pointer-events-none relative z-10 flex min-w-0 flex-1 flex-col justify-center py-1.5">
                  <input
                    aria-label={t('slots.rename', { slot: slotLabel(slot) })}
                    className="pointer-events-auto h-5 min-w-0 rounded bg-transparent px-1 font-medium text-foreground text-xs outline-none focus:bg-background/70 focus:ring-1 focus:ring-primary/50 disabled:cursor-not-allowed"
                    defaultValue={slotLabel(slot)}
                    disabled={!editing || readOnly}
                    key={`${slot.slotId}:${slotLabel(slot)}`}
                    onBlur={(event) => {
                      if (!event.currentTarget.value.trim())
                        event.currentTarget.value = slotLabel(slot)
                      if (event.currentTarget.value !== slotLabel(slot))
                        renameMaterialSlot(slot.slotId, event.currentTarget.value)
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') event.currentTarget.blur()
                      if (event.key === 'Escape') {
                        event.currentTarget.value = slotLabel(slot)
                        event.currentTarget.blur()
                      }
                    }}
                  />
                  <span className="truncate px-1 text-[10px] text-muted-foreground">
                    {t('slots.faces', { material: materialLabel, count: faceCount })}
                  </span>
                </span>

                {slot.slotId === BLOCK_BODY_SLOT_ID ? (
                  <span
                    className={`${SLOT_TRAILING_ACTION_CLASS} pointer-events-none relative z-10 text-primary`}
                  >
                    {active ? <Check aria-hidden="true" className="h-4 w-4" /> : null}
                  </span>
                ) : (
                  <button
                    className={`${SLOT_TRAILING_ACTION_CLASS} relative z-10 text-muted-foreground transition-colors hover:bg-red-500/15 hover:text-red-700 dark:hover:text-red-300 focus-visible:bg-red-500/15 focus-visible:text-red-700 dark:focus-visible:text-red-300 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-muted-foreground dark:disabled:hover:text-muted-foreground`}
                    aria-label={t('slots.delete', { slot: slotLabel(slot) })}
                    disabled={!editing || readOnly}
                    onClick={() => removeMaterialSlot(slot.slotId)}
                    title={slotEditTitle ?? t('slots.deleteTitle')}
                    type="button"
                  >
                    <Trash2 aria-hidden="true" className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            )
          })}
        </div>
      </PanelSection>

      <PanelSection title={t('actions.heading')}>
        <ActionGroup>
          <ActionButton
            icon={<Move className="h-4 w-4" />}
            label={t('actions.move')}
            onClick={move}
          />
          <ActionButton
            className="border-red-500/40 text-red-700 dark:text-red-200 hover:bg-red-500/15"
            icon={<Trash2 className="h-4 w-4" />}
            label={t('actions.delete')}
            onClick={() => {
              useScene.getState().deleteNode(node.id)
              setViewerSelection({ selectedIds: [] })
            }}
          />
        </ActionGroup>
      </PanelSection>
    </PanelWrapper>
  )
}
