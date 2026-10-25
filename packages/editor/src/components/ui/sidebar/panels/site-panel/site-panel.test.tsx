import { useScene } from '@pascal-app/core'
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { renderCurrentMarkup } from '../../../../../test-utils/render-current-markup'
import { setLocale } from '../../../../../i18n'
import { SitePanel } from '.'

describe('Site panel in the active language', () => {
  beforeEach(() => useScene.setState({ nodes: {}, rootNodeIds: [] }))
  afterEach(() => setLocale('en'))

  test('says there are no buildings in English', () => {
    expect(renderCurrentMarkup(<SitePanel />)).toContain('No buildings yet')
  })

  test('says it in Swedish when the locale is sv', () => {
    setLocale('sv')
    const html = renderCurrentMarkup(<SitePanel />)
    expect(html).toContain('Inga byggnader ännu')
    expect(html).not.toContain('No buildings')
  })
})
