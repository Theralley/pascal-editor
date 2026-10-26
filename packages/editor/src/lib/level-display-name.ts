import { getDefaultLevelName, type LevelNode } from '@pascal-app/core'
import { useCallback } from 'react'
import { defineMessages, getLocale, type Locale, useLocale } from '../i18n'
import { formatMessage } from '../i18n/messages'

const messages = defineMessages({
  en: {
    ground: 'Ground floor',
    floor: 'Floor {n}',
    basement: 'Basement',
    basementN: 'Basement {n}',
  },
  sv: {
    ground: 'Bottenvåning',
    floor: 'Våning {n}',
    basement: 'Källare',
    basementN: 'Källare {n}',
  },
})

type NamedLevel = Pick<LevelNode, 'name' | 'level'>

/** What an unnamed level is called by its place in the building, in `locale`. */
export function defaultLevelName(level: number, locale: Locale = getLocale()): string {
  if (level === 0) return formatMessage(messages, locale, 'ground')
  if (level > 0) return formatMessage(messages, locale, 'floor', { n: level })
  return level === -1
    ? formatMessage(messages, locale, 'basement')
    : formatMessage(messages, locale, 'basementN', { n: -level })
}

/**
 * A level's name as shown: a name the person gave wins; one that is empty, the old "Level N" or
 * core's English default reads by its place in the building, in `locale`. Stored names never change.
 */
export function levelDisplayName(level: NamedLevel, locale: Locale = getLocale()): string {
  const name = level.name?.trim()
  const unnamed =
    !name || name === `Level ${level.level}` || name === getDefaultLevelName(level.level)
  return unnamed ? defaultLevelName(level.level, locale) : name
}

/** `levelDisplayName` bound to the active locale; it re-renders when the locale changes. */
export function useLevelDisplayName() {
  const locale = useLocale()
  return useCallback((level: NamedLevel) => levelDisplayName(level, locale), [locale])
}

/** `defaultLevelName` bound to the active locale. */
export function useDefaultLevelName() {
  const locale = useLocale()
  return useCallback((level: number) => defaultLevelName(level, locale), [locale])
}
