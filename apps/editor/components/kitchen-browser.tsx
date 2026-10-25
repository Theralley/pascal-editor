'use client'

import {
  type AnyNodeId,
  type CabinetNode,
  emitter,
  resolveLevelId,
  useScene,
} from '@pascal-app/core'
import { useCommandPalette, useCommandRegistry, useEditor, useT } from '@pascal-app/editor'
import {
  beginKitchenPlacement,
  findKitchenItems,
  KITCHEN_ITEMS,
  KitchenCollection,
  kitchenPresetForModule,
} from '@pascal-app/nodes'
import { useViewer } from '@pascal-app/viewer'
import { useEffect } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { messages } from './messages'

const NO_ITEMS: never[] = []

function focusKitchenItem(id: AnyNodeId) {
  const nodes = useScene.getState().nodes
  const node = nodes[id]
  if (!node) return
  const levelId = resolveLevelId(node, nodes)
  const level = levelId ? nodes[levelId as AnyNodeId] : undefined
  const building = level?.parentId ? nodes[level.parentId as AnyNodeId] : undefined
  useEditor.getState().setMode('select')
  useViewer.getState().setSelection({
    selectedIds: [id],
    ...(level?.type === 'level' ? { levelId: level.id } : {}),
    ...(building?.type === 'building' ? { buildingId: building.id } : {}),
  })
  emitter.emit('camera-controls:focus', { nodeId: id })
  emitter.emit('selection:find-node', node)
}

export function KitchenBrowser({ query = '' }: { query?: string }) {
  const t = useT(messages)
  const defaults = useEditor((state) => state.toolDefaults.cabinet)
  const mode = useEditor((state) => state.mode)
  // Read the scene only while a query asks for placed items.
  const matches = useScene(
    useShallow((state) => (query.trim() ? findKitchenItems(state.nodes, query) : NO_ITEMS)),
  )
  const active = KITCHEN_ITEMS.find((item) => item.id === defaults?.kitchenPreset)
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-medium">{t('kitchen.addTitle')}</h3>
        <p className="mt-1 text-xs text-muted-foreground">{t('kitchen.addHint')}</p>
      </div>
      <KitchenCollection
        query={query}
        activeId={mode === 'build' ? active?.id : null}
        onSelect={beginKitchenPlacement}
      />
      {query.trim() && (
        <div className="space-y-2 border-t border-border pt-3">
          <h3 className="text-xs font-medium">{t('kitchen.find', { count: matches.length })}</h3>
          {matches.map((node) => (
            <button
              key={node.id}
              type="button"
              onClick={() => focusKitchenItem(node.id)}
              className="block w-full rounded-lg border border-border/60 px-3 py-2 text-left text-xs hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
            >
              {node.name || t('kitchen.cabinet')}
              <span className="block text-[10px] text-muted-foreground">{t('kitchen.show')}</span>
            </button>
          ))}
          {!matches.length && <p className="text-xs text-muted-foreground">{t('kitchen.none')}</p>}
        </div>
      )}
    </div>
  )
}

export function KitchenCommands() {
  const t = useT(messages)
  const register = useCommandRegistry((state) => state.register)
  // Always mounted: the placed items are read only while the palette is open to list them.
  const paletteOpen = useCommandPalette((state) => state.open)
  const modules = useScene(
    useShallow((state) => (paletteOpen ? findKitchenItems(state.nodes, '') : NO_ITEMS)),
  )
  useEffect(
    () =>
      register(
        KITCHEN_ITEMS.map((item) => ({
          id: `kitchen.add.${item.id}`,
          label: t('kitchen.commandAdd', { name: item.label }),
          group: t('kitchen.groupAdd'),
          keywords: item.keywords.split(' '),
          execute: () => beginKitchenPlacement(item.id),
        })),
      ),
    [register, t],
  )
  useEffect(
    () =>
      register(
        modules.map((node) => {
          const nodes = useScene.getState().nodes
          const parent = node.parentId ? nodes[node.parentId as AnyNodeId] : undefined
          const preset =
            node.type === 'cabinet-module'
              ? kitchenPresetForModule(
                  node,
                  parent?.type === 'cabinet' ? (parent as CabinetNode) : undefined,
                )
              : 'base-door'
          const item = KITCHEN_ITEMS.find((entry) => entry.id === preset)!
          return {
            id: `kitchen.find.${node.id}`,
            label: t('kitchen.commandFind', { name: node.name || item.label }),
            group: t('kitchen.groupFind'),
            keywords: item.keywords.split(' '),
            execute: () => focusKitchenItem(node.id),
          }
        }),
      ),
    [register, modules, t],
  )
  return null
}
