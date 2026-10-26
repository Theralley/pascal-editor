'use client'

import { levelDisplayName } from '../../lib/level-display-name'
import type { LevelNode } from '@pascal-app/core'
import { useEffect, useState } from 'react'
import type { LevelDuplicatePreset } from '@pascal-app/core/building'
import { type MessageKey, useT } from '../../i18n'
import { cn } from '../../lib/utils'
import { messages } from './messages'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './primitives/dialog'

const DUPLICATE_PRESETS: Array<{
  id: LevelDuplicatePreset
  labelKey: MessageKey<typeof messages>
  descriptionKey: MessageKey<typeof messages>
}> = [
  { id: 'everything', labelKey: 'duplicate.everything', descriptionKey: 'duplicate.everythingHint' },
  { id: 'structure', labelKey: 'duplicate.structure', descriptionKey: 'duplicate.structureHint' },
  {
    id: 'structure-materials',
    labelKey: 'duplicate.structureMaterials',
    descriptionKey: 'duplicate.structureMaterialsHint',
  },
  {
    id: 'structure-furniture',
    labelKey: 'duplicate.structureFurniture',
    descriptionKey: 'duplicate.structureFurnitureHint',
  },
]

export function LevelDuplicateDialog({
  open,
  level,
  onConfirm,
  onOpenChange,
}: {
  open: boolean
  level: LevelNode | null
  onConfirm: (preset: LevelDuplicatePreset) => void
  onOpenChange: (open: boolean) => void
}) {
  const t = useT(messages)
  const [preset, setPreset] = useState<LevelDuplicatePreset>('everything')

  useEffect(() => {
    if (open) {
      setPreset('everything')
    }
  }, [open])

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-md" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>{t('duplicate.title')}</DialogTitle>
          <DialogDescription>
            {t('duplicate.description', {
              name: level ? levelDisplayName(level) : t('duplicate.thisLevel'),
            })}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-2">
          {DUPLICATE_PRESETS.map((option) => (
            <button
              className={cn(
                'cursor-pointer rounded-xl border px-3 py-3 text-left transition-colors',
                preset === option.id
                  ? 'border-primary bg-primary/10 text-foreground'
                  : 'border-border bg-background hover:bg-accent/40',
              )}
              key={option.id}
              onClick={() => setPreset(option.id)}
              type="button"
            >
              <div className="font-medium text-sm">{t(option.labelKey)}</div>
              <div className="mt-1 text-muted-foreground text-xs">{t(option.descriptionKey)}</div>
            </button>
          ))}
        </div>

        <DialogFooter>
          <button
            className="cursor-pointer rounded-md px-4 py-2 text-muted-foreground text-sm transition-colors hover:bg-accent"
            onClick={() => onOpenChange(false)}
            type="button"
          >
            {t('duplicate.cancel')}
          </button>
          <button
            className="cursor-pointer rounded-md bg-primary px-4 py-2 text-primary-foreground text-sm transition-opacity hover:opacity-90"
            onClick={() => onConfirm(preset)}
            type="button"
          >
            {t('duplicate.confirm')}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
