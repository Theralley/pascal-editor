'use client'

import {
  type AnyNode,
  type AnyNodeId,
  type BuildingNode,
  resolveBuildingForLevel,
  runAsSingleSceneHistoryStep,
  useScene,
} from '@pascal-app/core'
import { unwrapCorner, windowMergeOffer } from '@pascal-app/core/building'
import { useViewer } from '@pascal-app/viewer'
import { Building2, Copy, Group, Merge, Split, Trash2, Ungroup } from 'lucide-react'
import { useMemo } from 'react'
import { deleteSelection, duplicateSelectionAndPickUp } from '../../editor/group-actions'
import { formatLinearMeasurement } from '../../../lib/measurements'
import { triggerSFX } from '../../../lib/sfx-bus'
import { writeWindowChanges } from '../../../lib/window-changes'
import { collectSelectableCandidateIds } from '../../tools/select/select-candidates'
import {
  canCreateSessionGroup,
  selectionIntersectsSessionGroup,
  selectionMatchesSessionGroup,
} from '../../../lib/session-groups'
import useSessionGroups, {
  groupCurrentSelection,
  ungroupCurrentSelection,
} from '../../../store/use-session-groups'
import { ActionButton, ActionGroup } from '../controls/action-button'
import { getTypeDisplay, type PanelT } from './node-display'
import { PanelWrapper } from './panel-wrapper'
import { formatSelectionBreakdown, selectionKind } from './selection-breakdown'
import { useLocale, useT } from '../../../i18n'
import { messages } from './messages'

/** The building holding the level, when the selection is everything selectable on it. */
function useWholeLevelBuildingId(selectedIds: readonly string[]) {
  const levelId = useViewer((s) => s.selection.levelId)
  const nodes = useScene((s) => s.nodes)
  return useMemo(() => {
    if (!levelId) return null
    const candidates = collectSelectableCandidateIds()
    if (candidates.length === 0) return null
    const selected = new Set(selectedIds)
    if (!candidates.every((id) => selected.has(id))) return null
    return resolveBuildingForLevel(levelId as AnyNodeId, nodes) ?? null
  }, [levelId, nodes, selectedIds])
}

/** The building's own selection (no level): its floating pill offers the whole-building Move. */
function selectBuilding(buildingId: AnyNodeId) {
  useViewer.getState().setSelection({ buildingId: buildingId as BuildingNode['id'] })
}

/**
 * Why two selected windows will not merge, for the person who selected them: the refusal's own
 * message is the agents' (node ids, metres), so the panel words its code, in the editor's units.
 */
function mergeRefusalNote(
  refusal: { code: string; details: Record<string, unknown> },
  nodes: Record<string, AnyNode>,
  length: (meters: number) => string,
  t: PanelT,
): string {
  const { blockingId, limit } = refusal.details as { blockingId?: string; limit?: number }
  const reach = length(limit ?? 0)
  const blocking = nodes[blockingId ?? '']
  const kind = !blocking
    ? t('merge.kind.something')
    : blocking.type === 'item'
      ? t('merge.kind.item')
      : t('merge.kind.other', {
          type: getTypeDisplay(blocking.type, t).label.toLowerCase(),
        })
  switch (refusal.code) {
    case 'window_already_joined':
      return t('merge.refusal.window_already_joined')
    case 'window_not_on_wall':
      return t('merge.refusal.window_not_on_wall')
    case 'windows_not_adjacent':
      return t('merge.refusal.windows_not_adjacent', { reach })
    case 'opening_between':
      return t('merge.refusal.opening_between', { kind })
    case 'walls_not_meeting':
      return t('merge.refusal.walls_not_meeting')
    case 'corner_angle':
      return t('merge.refusal.corner_angle')
    case 'window_not_at_corner':
      return t('merge.refusal.window_not_at_corner', { reach })
    case 'height_exceeds_wall':
      return t('merge.refusal.height_exceeds_wall')
    case 'opening_overlap':
      return t('merge.refusal.opening_overlap', { kind })
    default:
      return t('merge.refusal.default')
  }
}

/**
 * Merge windows: with exactly two windows selected, one window across both, or one corner window
 * when they sit on two walls that meet. Windows ride their wall, so they have no floating group
 * menu, and this is where the wall merge's twin lives. Two that already wrap their corner get
 * Unwrap instead; two that cannot join, the reason.
 */
function MergeWindowsAction() {
  const t = useT(messages)
  const locale = useLocale()
  const selectedIds = useViewer((s) => s.selection.selectedIds)
  const nodes = useScene((s) => s.nodes)
  const readOnly = useScene((s) => s.readOnly)
  const unit = useViewer((s) => s.unit)
  const metricNotation = useViewer((s) => s.metricNotation)
  const offer = useMemo(() => windowMergeOffer(nodes, selectedIds), [nodes, selectedIds])
  if (!offer) return null
  if (offer.refusal?.code === 'windows_already_joined')
    return (
      <ActionButton
        className="basis-full whitespace-nowrap disabled:cursor-not-allowed disabled:opacity-40"
        disabled={readOnly}
        icon={<Split className="h-4 w-4" />}
        label={t('merge.unwrap')}
        onClick={() => {
          writeWindowChanges({
            create: null,
            updates: unwrapCorner(useScene.getState().nodes, selectedIds[0]!),
            remove: [],
          })
          triggerSFX('sfx:structure-build')
        }}
        title={t('merge.unwrapTitle')}
      />
    )
  const { merge } = offer
  const note = offer.refusal
    ? mergeRefusalNote(
        offer.refusal,
        nodes,
        (meters) => formatLinearMeasurement(meters, unit, metricNotation, locale),
        t,
      )
    : null
  return (
    <>
      <ActionButton
        className="basis-full whitespace-nowrap disabled:cursor-not-allowed disabled:opacity-40"
        disabled={readOnly || !merge}
        icon={<Merge className="h-4 w-4" />}
        label={t('merge.label')}
        onClick={() => {
          if (!merge) return
          runAsSingleSceneHistoryStep(useScene, () =>
            writeWindowChanges({
              create: null,
              updates: Object.fromEntries(merge.changes.update.map(({ id, data }) => [id, data])),
              remove: merge.changes.delete,
            }),
          )
          triggerSFX('sfx:structure-build')
          useViewer.getState().setSelection({ selectedIds: merge.windowIds as AnyNodeId[] })
        }}
        title={
          note ??
          (merge?.kind === 'corner'
            ? t('merge.cornerTitle')
            : t('merge.singleTitle'))
        }
      />
      {note ? <p className="basis-full px-1 text-muted-foreground text-xs">{note}</p> : null}
    </>
  )
}

export function MultiSelectionActions() {
  const t = useT(messages)
  const selectedIds = useViewer((s) => s.selection.selectedIds)
  const sessionGroups = useSessionGroups((s) => s.groups)
  const sceneNodes = useScene((s) => s.nodes)
  const liveIds = useMemo(() => new Set(Object.keys(sceneNodes)), [sceneNodes])
  const showGroup = useMemo(
    () => canCreateSessionGroup(sessionGroups, selectedIds, liveIds),
    [sessionGroups, selectedIds, liveIds],
  )
  const showUngroup = useMemo(
    () => selectionIntersectsSessionGroup(sessionGroups, selectedIds, liveIds),
    [sessionGroups, selectedIds, liveIds],
  )

  const buildingId = useWholeLevelBuildingId(selectedIds)

  return (
    <ActionGroup className="flex-wrap">
      <MergeWindowsAction />
      {buildingId && (
        <ActionButton
          className="basis-full whitespace-nowrap"
          icon={<Building2 className="h-4 w-4" />}
          label={t('multi.selectBuilding')}
          onClick={() => selectBuilding(buildingId)}
          title={t('multi.selectBuildingTitle')}
        />
      )}
      {showGroup && (
        <ActionButton
          className="min-w-20 px-2"
          icon={<Group className="h-4 w-4" />}
          label={t('multi.group')}
          onClick={() => groupCurrentSelection()}
          title={t('multi.groupTitle')}
        />
      )}
      {showUngroup && (
        <ActionButton
          className="min-w-20 px-2"
          icon={<Ungroup className="h-4 w-4" />}
          label={t('multi.ungroup')}
          onClick={() => ungroupCurrentSelection()}
          title={t('multi.ungroupTitle')}
        />
      )}
      <ActionButton
        className="min-w-20 px-2"
        icon={<Copy className="h-4 w-4" />}
        label={t('duplicate')}
        onClick={() => duplicateSelectionAndPickUp()}
      />
      <ActionButton
        className="min-w-20 px-2 border-red-500/40 text-red-700 dark:text-red-200 hover:bg-red-500/15"
        icon={<Trash2 className="h-4 w-4 text-red-600 dark:text-red-400" />}
        label={t('delete')}
        onClick={() => deleteSelection()}
      />
    </ActionGroup>
  )
}

/**
 * Docked multi-selection panel. Includes Group / Ungroup for session selection sets.
 */
export function MultiSelectionPanel({ footer }: { footer?: React.ReactNode }) {
  const t = useT(messages)
  const selectedIds = useViewer((s) => s.selection.selectedIds)
  const setSelection = useViewer((s) => s.setSelection)
  const sessionGroups = useSessionGroups((s) => s.groups)
  const breakdown = useScene((s) =>
    formatSelectionBreakdown(
      selectedIds.map((id) => selectionKind(s.nodes[id as AnyNodeId])),
      t,
    ),
  )
  const sceneNodes = useScene((s) => s.nodes)
  const liveIds = useMemo(() => new Set(Object.keys(sceneNodes)), [sceneNodes])
  const matchedGroup = useMemo(
    () => selectionMatchesSessionGroup(sessionGroups, selectedIds, liveIds),
    [sessionGroups, selectedIds, liveIds],
  )

  return (
    <PanelWrapper
      footer={footer}
      icon="/icons/select.webp"
      onClose={() => setSelection({ selectedIds: [] })}
      title={
        matchedGroup
          ? `${matchedGroup.label} · ${selectedIds.length}`
          : t('multi.selectedCount', { count: selectedIds.length })
      }
      width={320}
    >
      {breakdown && <div className="px-3 py-3 text-muted-foreground text-xs">{breakdown}</div>}
      {matchedGroup && (
        <div className="border-border/50 border-t px-3 py-2 text-muted-foreground text-xs">
          {t('multi.sessionGroup', { label: matchedGroup.label })}
        </div>
      )}
      <div className="border-border/50 border-t p-3">
        <MultiSelectionActions />
      </div>
    </PanelWrapper>
  )
}
