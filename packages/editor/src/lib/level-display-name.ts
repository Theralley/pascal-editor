import type { LevelNode } from '@pascal-app/core'
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

const GENERATED_NAME = /^(?:(Ground floor)|Floor (\d+)|(Basement)(?: (\d+))?)$/

/**
 * A level's name as shown: a name the person gave wins. One that is empty, the old "Level N" or
 * core's English default ("Ground floor", "Floor 2", "Basement 2") reads in `locale`; a stored
 * default keeps its own number, so a level moved by a reorder is not renamed. Stored names never change.
 */
export function levelDisplayName(level: NamedLevel, locale: Locale = getLocale()): string {
  const name = level.name?.trim()
  if (!name || name === `Level ${level.level}`) return defaultLevelName(level.level, locale)
  const generated = GENERATED_NAME.exec(name)
  if (!generated) return name
  const [, ground, floor, basement, deep] = generated
  if (ground) return formatMessage(messages, locale, 'ground')
  if (floor) return formatMessage(messages, locale, 'floor', { n: floor })
  return deep
    ? formatMessage(messages, locale, 'basementN', { n: deep })
    : formatMessage(messages, locale, basement ? 'basement' : 'ground')
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
