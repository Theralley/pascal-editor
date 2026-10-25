'use client'

import { type MessageKey, useT } from '@pascal-app/editor'
import { AppCard } from '@/components/app-shell'
import { messages } from './messages'

const VARIABLES = [
  ['PASCAL_ADMIN_PASSWORD', 'password'],
  ['PASCAL_PUBLIC_URL', 'publicUrl'],
  ['PASCAL_SCENE_API_TOKEN', 'token'],
  ['PASCAL_AUTH=proxy', 'proxy'],
] as const satisfies readonly (readonly [string, MessageKey<typeof messages>])[]

export function SetupView() {
  const t = useT(messages)

  return (
    <AppCard className="max-w-lg">
      <h1 className="mt-6 font-semibold text-lg">{t('title')}</h1>
      <p className="mt-2 text-muted-foreground text-sm">{t('description')}</p>
      <dl className="mt-5 flex flex-col divide-y divide-border/50 rounded-xl border border-border/50">
        {VARIABLES.map(([name, descriptionKey]) => (
          <div className="px-4 py-3" key={name}>
            <dt className="font-mono text-sm">{name}</dt>
            <dd className="mt-0.5 text-muted-foreground text-xs">{t(descriptionKey)}</dd>
          </div>
        ))}
      </dl>
    </AppCard>
  )
}
