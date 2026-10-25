import { applyCountryUnitDefault } from '@pascal-app/viewer'
import { useEffect } from 'react'
import { hydrateLocale, useLocale } from './locale'

/**
 * Reads the person's language once the page is on the client, then puts it to work outside the
 * catalogs: `<html lang>` follows it, and a Swedish
 * interface suggests metric units until the person or the project chooses. Mount it once, in the
 * host's root.
 */
export function useApplyLocale() {
  const locale = useLocale()
  useEffect(hydrateLocale, [])
  useEffect(() => {
    document.documentElement.lang = locale
    if (locale === 'sv') applyCountryUnitDefault('SE')
  }, [locale])
}
