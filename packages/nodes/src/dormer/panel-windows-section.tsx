'use client'

import type { WindowNode } from '@pascal-app/core'
import { ActionButton, formatDecimal, PanelSection, useT } from '@pascal-app/editor'
import { Move, Pencil, Plus } from 'lucide-react'
import { messages } from './messages'

const FIXED_2 = { minFractionDigits: 2, maxFractionDigits: 2 }

export function DormerWindowsSection({
  windows,
  canAdd,
  onAdd,
  onEdit,
  onMove,
}: {
  windows: WindowNode[]
  canAdd: boolean
  onAdd: () => void
  onEdit: (window: WindowNode) => void
  onMove: (window: WindowNode) => void
}) {
  const t = useT(messages)
  return (
    <PanelSection title={t('windowsCount', { n: windows.length })}>
      {windows.length > 0 ? (
        <div className="flex flex-col gap-1">
          {windows.map((window, index) => (
            <div
              className="flex items-center gap-1 rounded-lg border border-border/50 bg-black/4 dark:bg-[#2C2C2E] p-1"
              key={window.id}
            >
              <button
                className="min-w-0 flex-1 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-black/8 dark:hover:bg-[#3e3e3e]"
                onClick={() => onEdit(window)}
                type="button"
              >
                <span className="block truncate font-medium text-foreground text-xs">
                  {window.name || t('windowN', { n: index + 1 })}
                </span>
                <span className="block truncate text-[10px] text-muted-foreground capitalize">
                  {t(window.dormerFace ?? 'front')} ·{' '}
                  {formatDecimal(window.width, FIXED_2, t.locale)} ×{' '}
                  {formatDecimal(window.height, FIXED_2, t.locale)} m
                </span>
              </button>
              <button
                aria-label={t('editNamed', { name: window.name || t('windowN', { n: index + 1 }) })}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-black/8 dark:hover:bg-[#3e3e3e] hover:text-foreground"
                onClick={() => onEdit(window)}
                title={t('editWindow')}
                type="button"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button
                aria-label={t('moveNamed', { name: window.name || t('windowN', { n: index + 1 }) })}
                className="flex h-8 shrink-0 items-center justify-center gap-1 rounded-md px-2 text-muted-foreground text-xs transition-colors hover:bg-black/8 dark:hover:bg-[#3e3e3e] hover:text-foreground"
                onClick={() => onMove(window)}
                title={t('moveWindow')}
                type="button"
              >
                <Move className="h-3.5 w-3.5" />
                {t('move')}
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="px-2 py-3 text-center text-muted-foreground text-xs">{t('noWindows')}</div>
      )}

      <div className="px-1 pt-2 pb-1">
        <ActionButton
          className="w-full"
          disabled={!canAdd}
          icon={<Plus className="h-3.5 w-3.5" />}
          label={t('addWindow')}
          onClick={onAdd}
        />
        {!canAdd && (
          <p className="px-1 pt-2 text-center text-[10px] text-muted-foreground">
            {t('increaseTheDormerWidthTo')}
          </p>
        )}
      </div>
    </PanelSection>
  )
}
