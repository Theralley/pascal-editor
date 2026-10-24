import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { SettingsPanel } from '.'

test('Settings shows the project section a host passes, without a project id and without Sharing', () => {
  const html = renderToStaticMarkup(<SettingsPanel projectSection={<p>Copied from House</p>} />)

  expect(html).toContain('Copied from House')
  expect(html).not.toContain('Sharing')
  expect(renderToStaticMarkup(<SettingsPanel />)).not.toContain('Copied from')
})
