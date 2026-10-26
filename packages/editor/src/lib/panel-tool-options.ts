'use client'

import {
  type AnyNodeDefinition,
  nodeRegistry,
  type ToolHint,
  useRegistryVersion,
} from '@pascal-app/core'
import { useMemo, useSyncExternalStore } from 'react'
import { useDefinitionText } from '../i18n'
import useEditor from '../store/use-editor'

export type PanelToolOption = {
  id: string
  label: string
  value: string
  choices: readonly { value: string; label: string; description?: string }[]
  set: (value: string) => void
}

export function createToolHintsStore(hints: readonly ToolHint[]) {
  return {
    subscribe(listener: () => void) {
      const subscriptions = hints.flatMap((hint) => [hint.chip?.subscribe, hint.visible?.subscribe])
      const cleanups = [...new Set(subscriptions)].flatMap((subscribe) =>
        subscribe ? [subscribe(listener)] : [],
      )
      return () => {
        for (const cleanup of cleanups) cleanup()
      }
    },
    getSnapshot: () =>
      JSON.stringify(hints.map((hint) => [hint.visible?.value() ?? true, hint.chip?.value()])),
  }
}

export function useVisibleToolHints(hints: readonly ToolHint[] = []) {
  const draftVertexCount = useEditor((state) => state.draftVertexCount)
  const store = useMemo(() => createToolHintsStore(hints), [hints])
  useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
  return hints.filter(
    (hint) =>
      !(hint.key === 'Shift' && hint.label === 'Cycle snapping mode') &&
      (hint.visible?.value() ?? true) &&
      (hint.minDraftVertices == null || draftVertexCount >= hint.minDraftVertices),
  )
}

/** A hint with its label and chip text in the definition's translation for the active locale. */
export function localizeToolHint(
  definition: AnyNodeDefinition | undefined,
  hint: ToolHint,
  defText: ReturnType<typeof useDefinitionText>,
): ToolHint {
  const { chip } = hint
  return {
    ...hint,
    label: defText(definition, hint.label),
    chip: chip && {
      ...chip,
      labels: Object.fromEntries(
        Object.entries(chip.labels).map(([value, label]) => [value, defText(definition, label)]),
      ),
      tooltip: chip.tooltip === undefined ? undefined : defText(definition, chip.tooltip),
    },
  }
}

export function usePanelToolHints(kind: string | null | undefined) {
  useRegistryVersion()
  const defText = useDefinitionText()
  const definition = kind ? nodeRegistry.get(kind) : undefined
  return useVisibleToolHints(definition?.toolHints).map((hint) =>
    localizeToolHint(definition, hint, defText),
  )
}
