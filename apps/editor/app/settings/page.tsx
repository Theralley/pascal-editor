import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { AppHeader, AppShell } from '@/components/app-shell'
import { resolvePublicUrl } from '@/lib/public-url'
import { resolveAuthMode } from '@/lib/self-host-auth'
import { SettingsView } from './settings-view'

export const dynamic = 'force-dynamic'
// i18n-ignore: server metadata cannot follow the language chosen in the browser
export const metadata: Metadata = { title: 'Settings · Pascal' }

/** Server components see headers, not a Request; the auth helpers want the latter. */
async function currentRequest(): Promise<Request> {
  const h = await headers()
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost'
  const proto = h.get('x-forwarded-proto') ?? 'http'
  return new Request(`${proto}://${host}/settings`, { headers: h })
}

export default async function SettingsPage() {
  const request = await currentRequest()
  const publicUrl = resolvePublicUrl(request)
  const authMode = resolveAuthMode(request)
  const agentTokenConfigured = Boolean(process.env.PASCAL_SCENE_API_TOKEN)

  return (
    <AppShell>
      <AppHeader />
      <SettingsView
        agentTokenConfigured={agentTokenConfigured}
        dataDirectory={process.env.PASCAL_DATA_DIR || '~/.pascal/data'}
        publicUrl={publicUrl}
        runtimeVersion={process.env.PASCAL_RUNTIME_VERSION || null}
        showAccount={authMode === 'password'}
      />
    </AppShell>
  )
}
