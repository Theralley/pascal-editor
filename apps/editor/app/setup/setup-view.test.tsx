import { afterEach, describe, expect, spyOn, test } from 'bun:test'
import { setLocale } from '@pascal-app/editor'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { SetupView } from './setup-view'

/** Server-renders from the stores' current state; a server render would read the startup `en`. */
function renderCurrent(element: React.ReactElement): string {
  const useSyncExternalStore = React.useSyncExternalStore
  const spy = spyOn(React, 'useSyncExternalStore').mockImplementation((subscribe, getSnapshot) =>
    useSyncExternalStore(subscribe, getSnapshot, getSnapshot),
  )
  try {
    return renderToStaticMarkup(element)
  } finally {
    spy.mockRestore()
  }
}

describe('the setup page in the active language', () => {
  afterEach(() => setLocale('en'))

  test('reads in English by default', () => {
    const html = renderCurrent(<SetupView />)
    expect(html).toContain('This editor is reachable but not protected yet')
    expect(html).toContain('PASCAL_ADMIN_PASSWORD')
  })

  test('reads in Swedish when the locale is sv, keeping the variable names', () => {
    setLocale('sv')
    const html = renderCurrent(<SetupView />)
    expect(html).toContain('Editorn går att nå men är inte skyddad ännu')
    expect(html).toContain('Lösenordet som låser upp editorn.')
    expect(html).toContain('PASCAL_ADMIN_PASSWORD')
    expect(html).not.toContain('reachable but not protected')
  })
})
