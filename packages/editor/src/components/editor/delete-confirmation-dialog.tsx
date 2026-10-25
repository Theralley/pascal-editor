'use client'

import {
  type AnyNode,
  type DeleteZonePayload,
  type StructureNodes,
  useScene,
} from '@pascal-app/core'
import { useEffect, useMemo, useRef } from 'react'
import { type MessageKey, type MessageVars, translate, useLocale, useT } from '../../i18n'
import { formatDecimal } from '../../lib/measurements'
import { cn } from '../../lib/utils'
import useDeleteConfirmation, {
  type DeleteConfirmationRequest,
  type RoomConstructionChange,
} from '../../store/use-delete-confirmation'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/primitives/dialog'
import { messages } from './messages'

type Key = MessageKey<typeof messages>

const NOUN_KEYS = {
  wall: 'noun.wall',
  separator: 'noun.separator',
  door: 'noun.door',
  window: 'noun.window',
  item: 'noun.item',
  light: 'noun.light',
  element: 'noun.element',
} as const satisfies Record<string, Key>

type Noun = keyof typeof NOUN_KEYS

const t = (key: Key, vars?: MessageVars) => translate(messages, key, vars)

/** "3 doors": the count with its noun, in the active language. */
const count = (n: number, noun: Noun) => t(NOUN_KEYS[noun], { count: n })

function sentenceList(parts: string[]) {
  if (parts.length <= 1) return parts.join('')
  return `${parts.slice(0, -1).join(', ')}${t('list.and')}${parts.at(-1)}`
}

/** " (Sofa, Chair)" after a noun phrase, or nothing. */
const parenthesized = (names: string) => (names ? ` (${names})` : '')

/**
 * A mezzanine takes its own plate (with its railing) and the ceiling core
 * derived over it; kept items come down to the floor below.
 */
function mezzanineDeletionDescription(room: DeleteZonePayload, nodes: StructureNodes) {
  const hasCeiling = Object.values(nodes).some(
    (node) => node.type === 'ceiling' && node.zoneId === room.zoneId,
  )
  const sentences = [t(hasCeiling ? 'mezzanine.removesWithCeiling' : 'mezzanine.removes')]
  const items = room.itemIds.length
  if (items) sentences.push(t('mezzanine.items', { count: items }))
  return sentences.join(' ')
}

/**
 * An area Divide made goes back into the room across its dividing line: the
 * line and the area's own finish go, the walls and anything standing in it stay.
 */
function mergeDescription(room: DeleteZonePayload, nodes: StructureNodes) {
  const into = nodes[room.mergedIntoZoneId ?? '']?.name?.trim()
  const sentences = [
    t('merge.description', {
      count: room.separatorIds.length,
      into: into || t('delete.roomNextToIt'),
    }),
  ]
  const items = room.itemIds.length
  if (items) sentences.push(t('merge.items', { count: items }))
  return sentences.join(' ')
}

function roomDeletionDescription(room: DeleteZonePayload, nodes: StructureNodes) {
  if (isMezzanine(room, nodes)) return mezzanineDeletionDescription(room, nodes)
  if (room.mode === 'merge') return mergeDescription(room, nodes)
  const sentences: string[] = []
  const typeCount = (type: string) =>
    room.openingIds.filter((id) => nodes[id]?.type === type).length
  const removed = [
    room.wallIds.length ? count(room.wallIds.length, 'wall') : '',
    room.separatorIds.length ? count(room.separatorIds.length, 'separator') : '',
    typeCount('door') ? count(typeCount('door'), 'door') : '',
    typeCount('window') ? count(typeCount('window'), 'window') : '',
  ].filter(Boolean)
  sentences.push(
    removed.length ? t('room.removes', { list: sentenceList(removed) }) : t('room.removesFinish'),
  )
  if (room.keptSharedWallIds.length + room.keptSharedSeparatorIds.length > 0)
    sentences.push(t('room.sharedStay'))
  if (room.opensZoneIds.length) {
    const names = room.opensZoneIds.map((id) => nodes[id]?.name?.trim() || t('delete.nextRoom'))
    sentences.push(t('room.opensInto', { list: sentenceList(names) }))
  }
  const items = room.itemIds.length
  if (items) sentences.push(t('room.items', { count: items }))
  return sentences.join(' ')
}

/** A hosted node's kind from its type and structure — never from its name. */
function hostedKind(node: AnyNode | undefined): 'door' | 'window' | 'light' | 'item' {
  if (node?.type === 'door' || node?.type === 'window') return node.type
  if (node?.type === 'item' && node.asset.interactive?.effects.some((e) => e.kind === 'light'))
    return 'light'
  return 'item'
}

function hostedName(node: AnyNode | undefined) {
  return (node?.name || (node?.type === 'item' ? node.asset.name : '') || '').trim()
}

function shownNames(names: string[]) {
  const named = [...new Set(names.filter(Boolean))]
  return named.slice(0, 3).join(', ') + (named.length > 3 ? ', …' : '')
}

/** "1 door (Front door), 2 windows and 1 light": counts per kind, a few names, no ids. */
export function hostedSummary(ids: readonly string[], nodes: StructureNodes) {
  const groups = new Map<'door' | 'window' | 'light' | 'item', string[]>()
  for (const id of ids) {
    const kind = hostedKind(nodes[id])
    groups.set(kind, [...(groups.get(kind) ?? []), hostedName(nodes[id])])
  }
  return sentenceList(
    [...groups].map(
      ([kind, names]) => `${count(names.length, kind)}${parenthesized(shownNames(names))}`,
    ),
  )
}

function ceilingContent(
  change: RoomConstructionChange,
  nodes: StructureNodes,
  room: string,
  canKeep: boolean,
): DeleteConfirmationContent {
  const ids = change.hostedIds
  const manual = change.manualCeilings ?? []
  const sentences: string[] = []
  if (manual.length) {
    sentences.push(
      t('ceiling.removesManual', {
        count: manual.length,
        names: parenthesized(shownNames(manual)),
      }),
    )
    if (change.alsoCovers?.length)
      sentences.push(
        t('ceiling.alsoCovers', { count: manual.length, list: sentenceList(change.alsoCovers) }),
      )
  }
  // Lights are known from their light effect; anything else reads as an item.
  const lights = ids.length > 0 && ids.every((id) => hostedKind(nodes[id]) === 'light')
  if (ids.length) {
    const names = shownNames(ids.map((id) => hostedName(nodes[id])))
    sentences.push(
      lights
        ? t('ceiling.lightsHang', { count: ids.length, summary: hostedSummary(ids, nodes) })
        : t('ceiling.itemsOn', { count: ids.length, names: parenthesized(names) }),
      t(lights ? 'ceiling.keepLightsInPlace' : 'ceiling.keepInPlace', { count: ids.length }),
    )
  }
  return {
    title: t('ceiling.title', { room }),
    description: sentences.length ? sentences.join(' ') : t('ceiling.removes'),
    keepLabel:
      ids.length && canKeep ? t(lights ? 'ceiling.keepLights' : 'ceiling.keepItems') : null,
    confirmLabel: t(ids.length ? 'ceiling.removeAll' : 'ceiling.remove'),
    destructive: true,
  }
}

function constructionContent(
  change: RoomConstructionChange,
  nodes: StructureNodes,
  canKeep: boolean,
): DeleteConfirmationContent {
  const room = change.roomName.trim() || t('delete.thisRoom')
  const hosted = hostedSummary(change.hostedIds, nodes)
  if (change.part === 'walls' && change.action === 'add') {
    return {
      title: t('walls.addTitle', { room }),
      description: t('walls.addDescription', {
        walls: count(change.wallCount ?? 0, 'wall'),
        area: formatDecimal(change.areaLoss ?? 0, { minFractionDigits: 2, maxFractionDigits: 2 }),
      }),
      keepLabel: null,
      confirmLabel: t('walls.add'),
      destructive: false,
    }
  }
  if (change.part === 'walls') {
    const walls = count(change.wallCount ?? 0, 'wall')
    return {
      title: t('walls.removeTitle', { room }),
      description: [
        hosted ? t('walls.turnsAndRemoves', { walls, hosted }) : t('walls.turns', { walls }),
        change.sharedWalls ? t('walls.sharedRemain') : '',
      ]
        .filter(Boolean)
        .join(' '),
      keepLabel: null,
      confirmLabel: t('walls.remove'),
      destructive: true,
    }
  }
  if (change.part === 'floor') {
    // Swedish: a door or a lamp is "den", an item or a window is "det".
    const single =
      change.hostedIds.length === 1 ? hostedKind(nodes[change.hostedIds[0] as string]) : null
    const commonGender = single === 'door' || single === 'light'
    return {
      title: t('floor.title', { room }),
      description: hosted
        ? t(commonGender ? 'floor.hostedOnCommon' : 'floor.hostedOn', {
            count: change.hostedIds.length,
            hosted,
          })
        : t('floor.removes'),
      keepLabel: hosted && canKeep ? t('floor.keepItems') : null,
      confirmLabel: t(hosted ? 'floor.deleteItems' : 'floor.remove'),
      destructive: true,
    }
  }
  return ceilingContent(change, nodes, room, canKeep)
}

export type DeleteConfirmationContent = {
  title: string
  description: string
  /** Delete the room but leave its items in place — offered only when it has items. */
  keepLabel: string | null
  confirmLabel: string
  /** Red confirm for removals; adding walls confirms in the neutral style. */
  destructive: boolean
}

function isMezzanine(room: DeleteZonePayload, nodes: StructureNodes) {
  const zone = nodes[room.zoneId]
  return zone?.type === 'zone' && zone.floor?.support === 'open'
}

/** The words and choices the confirmation offers, from the request alone. */
export function deleteConfirmationContent(
  request: DeleteConfirmationRequest,
  nodes: StructureNodes,
): DeleteConfirmationContent {
  if (request.construction)
    return constructionContent(request.construction, nodes, !!request.onKeepContents)
  const room = request.room
  if (!room)
    return {
      title: t('delete.elementsTitle', { count: request.count }),
      description: t('delete.elementsDescription'),
      keepLabel: null,
      confirmLabel: t('delete.confirm'),
      destructive: true,
    }
  const merge = room.mode === 'merge'
  // A merged area's items always stay, so there is nothing to choose.
  const hasItems = room.itemIds.length > 0 && !merge
  return {
    title: t('delete.title', {
      name:
        room.name.trim() ||
        t(
          isMezzanine(room, nodes)
            ? 'delete.thisMezzanine'
            : merge
              ? 'delete.thisArea'
              : 'delete.thisRoom',
        ),
    }),
    description: roomDeletionDescription(room, nodes),
    keepLabel: hasItems && request.onKeepContents ? t('delete.keepItems') : null,
    confirmLabel: t(hasItems ? 'delete.all' : 'delete.confirm'),
    destructive: true,
  }
}

export function DeleteConfirmationDialog() {
  const locale = useLocale()
  const dialogText = useT(messages)
  const request = useDeleteConfirmation((state) => state.request)
  const cancel = useDeleteConfirmation((state) => state.cancel)
  const confirm = useDeleteConfirmation((state) => state.confirm)
  const nodes = useScene((state) => (request ? state.nodes : null))
  // The words are read in the active language, so `locale` rebuilds them on a switch.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `locale` is a trigger, not a value the memo reads
  const live = useMemo(
    () => (request && nodes ? deleteConfirmationContent(request, nodes) : null),
    [request, nodes, locale],
  )
  // Hold the last words through the close animation so the dialog never empties.
  const shown = useRef(live)
  if (live) shown.current = live
  const content = shown.current
  const blocked = !!request?.conflict

  useEffect(() => cancel, [cancel])

  return (
    <Dialog onOpenChange={(open) => !open && cancel()} open={request !== null}>
      <DialogContent
        className="border-border/70 bg-background/95 shadow-2xl backdrop-blur-xl sm:max-w-md"
        data-delete-confirmation-dialog
        showCloseButton={false}
      >
        <DialogHeader>
          <DialogTitle>{content?.title}</DialogTitle>
          <DialogDescription>
            {content?.description}
            {request?.conflict && (
              <span className="mt-2 block text-destructive">{request.conflict}</span>
            )}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <button
            className="rounded-full border border-border px-4 py-2 text-sm transition-colors hover:bg-accent"
            onClick={cancel}
            type="button"
          >
            {dialogText('delete.cancel')}
          </button>
          {content?.keepLabel && (
            <button
              className="rounded-full border border-border px-4 py-2 text-sm transition-colors hover:bg-accent disabled:pointer-events-none disabled:opacity-50"
              disabled={blocked}
              onClick={() => {
                const keep = request?.onKeepContents
                cancel()
                keep?.()
              }}
              type="button"
            >
              {content.keepLabel}
            </button>
          )}
          <button
            className={cn(
              'rounded-full px-4 py-2 text-sm transition-colors disabled:pointer-events-none disabled:opacity-50',
              content?.destructive === false
                ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                : 'bg-red-600 text-white hover:bg-red-700',
            )}
            disabled={blocked}
            onClick={confirm}
            type="button"
          >
            {content?.confirmLabel}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
