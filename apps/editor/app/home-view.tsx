'use client'

import { useT } from '@pascal-app/editor'
import { Settings } from 'lucide-react'
import Link from 'next/link'
import { AppHeader, AppShell, ICON_BUTTON, PascalMark } from '@/components/app-shell'
import { CreateProjectButton } from '@/components/create-project-button'
import { SceneCard, type SceneCardData } from '@/components/scene-card'
import { messages } from './messages'

export function HomeView({ scenes, nextNumber }: { scenes: SceneCardData[]; nextNumber: number }) {
  const t = useT(messages)

  return (
    <AppShell>
      <AppHeader>
        <CreateProjectButton nextNumber={nextNumber} />
        <Link
          aria-label={t('settings')}
          className={ICON_BUTTON}
          href="/settings"
          title={t('settings')}
        >
          <Settings className="h-4 w-4" />
        </Link>
      </AppHeader>

      <main className="mx-auto max-w-6xl px-6 py-10">
        {scenes.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-4 py-32 text-center">
            <PascalMark className="h-10 w-10" />
            <p className="max-w-xs text-muted-foreground text-sm">{t('empty')}</p>
            <CreateProjectButton nextNumber={nextNumber} />
          </div>
        ) : (
          <>
            <h1 className="mb-6 font-semibold text-lg">{t('projects')}</h1>
            <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {scenes.map((scene) => (
                <SceneCard key={scene.id} scene={scene} />
              ))}
            </ul>
          </>
        )}
      </main>
    </AppShell>
  )
}
