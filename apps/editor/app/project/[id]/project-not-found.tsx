'use client'

import { useT } from '@pascal-app/editor'
import Link from 'next/link'
import { AppCard, PRIMARY_PILL } from '@/components/app-shell'
import { cn } from '@/lib/utils'
import { messages } from './messages'

export function ProjectNotFound({ id }: { id: string }) {
  const t = useT(messages)

  return (
    <AppCard>
      <h1 className="mt-6 font-semibold text-lg">{t('title')}</h1>
      <p className="mt-1 text-muted-foreground text-sm">
        {t.rich('body', { id: (text) => <code className="font-mono">{text}</code> }, { id })}
      </p>
      <Link className={cn(PRIMARY_PILL, 'mt-5')} href="/">
        {t('all')}
      </Link>
    </AppCard>
  )
}
