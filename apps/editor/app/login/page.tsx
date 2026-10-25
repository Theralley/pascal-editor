import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { AppCard } from '@/components/app-shell'
import { resolvePublicUrl } from '@/lib/public-url'
import { safeNextPath } from '@/lib/safe-next-path'
import { LoginForm } from './login-form'

export const dynamic = 'force-dynamic'
// i18n-ignore: server metadata cannot follow the language chosen in the browser
export const metadata: Metadata = { title: 'Sign in · Pascal' }

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>
}) {
  const { next } = await searchParams
  const origin = resolvePublicUrl(
    new Request('http://localhost/login', { headers: await headers() }),
  )
  return (
    <AppCard>
      <LoginForm next={safeNextPath(next, origin)} />
    </AppCard>
  )
}
