'use client'

import { useT } from '@pascal-app/editor'
import Link from 'next/link'
import { ImportClient } from './import-client'
import { messages } from './messages'

export function ImportView({ src, name }: { src: string | null; name: string | null }) {
  const t = useT(messages)

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 border-border border-b bg-background/95 backdrop-blur">
        <div className="container mx-auto flex items-center justify-between gap-4 px-6 py-4">
          <nav className="flex items-center gap-4 text-sm">
            <Link
              className="text-muted-foreground transition-colors hover:text-foreground"
              href="/"
            >
              {t('home')}
            </Link>
            <span className="text-muted-foreground">/</span>
            <span className="font-medium text-foreground">{t('breadcrumb')}</span>
          </nav>
        </div>
      </header>

      <main className="container mx-auto max-w-2xl px-6 py-12">
        <h1 className="mb-2 font-bold text-3xl">{t('title')}</h1>
        <p className="mb-8 text-muted-foreground text-sm">{t('intro')}</p>
        {/* Keyed by src: a new file is a new flow — state (scene name,
            phase) must never leak from the previous one. */}
        <ImportClient key={src} name={name} src={src} />
      </main>
    </div>
  )
}
