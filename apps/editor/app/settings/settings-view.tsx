'use client'

import { LanguageRow, useT } from '@pascal-app/editor'
import { ArrowLeft, ExternalLink } from 'lucide-react'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { SECONDARY_PILL } from '@/components/app-shell'
import { messages } from './messages'

export function SettingsView({
  agentTokenConfigured,
  dataDirectory,
  publicUrl,
  runtimeVersion,
  showAccount,
}: {
  agentTokenConfigured: boolean
  dataDirectory: string
  publicUrl: string
  runtimeVersion: string | null
  showAccount: boolean
}) {
  const t = useT(messages)

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <Link
        className="-ml-2 inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-muted-foreground text-sm transition-colors hover:bg-accent hover:text-foreground"
        href="/"
      >
        <ArrowLeft className="h-4 w-4" />
        {t('back.allProjects')}
      </Link>
      <h1 className="mt-4 mb-8 font-semibold text-lg">{t('title')}</h1>

      <div className="flex flex-col gap-6">
        <Section title={t('instance.title')}>
          <Row label={t('instance.publicUrl')}>
            <code className="font-mono">{publicUrl}</code>
          </Row>
          <Row label={t('instance.version')}>{runtimeVersion ?? t('instance.development')}</Row>
          <Row label={t('instance.dataDirectory')}>
            <code className="font-mono">{dataDirectory}</code>
          </Row>
        </Section>

        <Section title={t('agent.title')}>
          <Row label={t('agent.sceneApi')}>
            <code className="font-mono">{publicUrl}/api/scenes</code>
          </Row>
          <Row label={t('agent.token')}>
            {agentTokenConfigured ? t('agent.configured') : t('agent.notConfigured')}
          </Row>
          <p className="px-4 py-3 text-muted-foreground text-xs">
            {agentTokenConfigured ? t('agent.hintConfigured') : t('agent.hintNotConfigured')}
          </p>
        </Section>

        <Section title={t('preferences.title')}>
          <div className="@container px-4 py-3">
            <LanguageRow />
          </div>
        </Section>

        {showAccount && (
          <Section title={t('account.title')}>
            <div className="flex items-center justify-between gap-4 px-4 py-3">
              <p className="text-muted-foreground text-sm">{t('account.signedIn')}</p>
              <form action="/api/auth/logout" method="post">
                <button className={SECONDARY_PILL} type="submit">
                  {t('account.signOut')}
                </button>
              </form>
            </div>
          </Section>
        )}

        <Section title={t('about.title')}>
          <ExternalRow href="https://github.com/pascalorg/editor" label={t('about.source')} />
          <ExternalRow href="https://editor.pascal.app/docs" label={t('about.documentation')} />
        </Section>
      </div>
    </main>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 font-medium text-muted-foreground text-xs">{title}</h2>
      <div className="divide-y divide-border/50 rounded-xl border border-border/50 bg-background">
        {children}
      </div>
    </section>
  )
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3 text-sm">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 truncate text-right">{children}</span>
    </div>
  )
}

function ExternalRow({ href, label }: { href: string; label: string }) {
  return (
    <a
      className="flex items-center justify-between gap-4 px-4 py-3 text-sm transition-colors first:rounded-t-xl last:rounded-b-xl hover:bg-accent"
      href={href}
      rel="noreferrer"
      target="_blank"
    >
      <span>{label}</span>
      <span className="flex items-center gap-1.5 text-muted-foreground">
        {href.replace(/^https:\/\//, '')}
        <ExternalLink className="h-3.5 w-3.5" />
      </span>
    </a>
  )
}
