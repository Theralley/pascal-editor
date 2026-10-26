'use client'

import {
  getCatalogMaterialById,
  getDynamicLibraryMaterials,
  getLibraryMaterialIdFromRef,
  getLibraryMaterialsVersion,
  getMaterialsForCategory,
  MATERIAL_CATEGORIES,
  type MaterialSource,
  subscribeLibraryMaterials,
  toLibraryMaterialRef,
} from '@pascal-app/core'
import { useEffect, useState, useSyncExternalStore } from 'react'
import type { MessageKey } from '../i18n'
import type { messages } from './help-messages'

export type MaterialSourceFilter = MaterialSource

/** The catalog key of each source tab; the picker translates it when it renders. */
export const SOURCE_FILTER_KEYS = {
  pascal: 'source.pascal',
  mine: 'source.mine',
  workspace: 'source.workspace',
  community: 'source.community',
} as const satisfies Record<MaterialSourceFilter, MessageKey<typeof messages>>

const SOURCE_FILTERS: { id: MaterialSourceFilter }[] = [
  { id: 'pascal' },
  { id: 'mine' },
  { id: 'workspace' },
  { id: 'community' },
]

export function useMaterialCatalogModel(
  selectedMaterialPreset?: string,
  onSelectMaterialPreset?: (ref: string) => void,
  disabled = false,
  /** Paint mode arms the tab's first material; a finish row only writes on a tile click. */
  selectOnCategoryChange = true,
) {
  const [selectedCategory, setCategory] = useState<(typeof MATERIAL_CATEGORIES)[number]>(
    MATERIAL_CATEGORIES[0],
  )
  const [sourceFilter, setSourceFilter] = useState<MaterialSourceFilter>('pascal')
  useSyncExternalStore(
    subscribeLibraryMaterials,
    getLibraryMaterialsVersion,
    getLibraryMaterialsVersion,
  )
  const availableCategories = MATERIAL_CATEGORIES.filter(
    (category) => getMaterialsForCategory(category).length > 0,
  )
  const visibleSourceFilters = SOURCE_FILTERS.filter(
    (filter) =>
      filter.id !== 'workspace' ||
      getDynamicLibraryMaterials().some((item) => item.source === 'workspace'),
  )
  const itemsFor = (category: typeof selectedCategory) =>
    getMaterialsForCategory(category).filter((item) => (item.source ?? 'pascal') === sourceFilter)
  useEffect(() => {
    const entry = getCatalogMaterialById(
      getLibraryMaterialIdFromRef(selectedMaterialPreset) ?? undefined,
    )
    if (entry?.category) setCategory(entry.category)
  }, [selectedMaterialPreset])
  const select = (id: string) => {
    if (!disabled) onSelectMaterialPreset?.(toLibraryMaterialRef(id))
  }
  const setSelectedCategory = (category: typeof selectedCategory) => {
    setCategory(category)
    const first = itemsFor(category)[0]
    if (first && selectOnCategoryChange) select(first.id)
  }
  return {
    selectedCategory,
    setSelectedCategory,
    sourceFilter,
    setSourceFilter,
    visibleSourceFilters,
    availableCategories,
    catalogItems: itemsFor(selectedCategory),
    select,
  }
}
