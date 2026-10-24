import type { SceneGraph } from '@pascal-app/editor'
import Link from 'next/link'
import { AppCard, PRIMARY_PILL } from '@/components/app-shell'
import { SceneLoader, type SceneMeta } from '@/components/scene-loader'
import { getSceneOperations } from '@/lib/scene-store-server'
import { cn } from '@/lib/utils'

export const dynamic = 'force-dynamic'

interface SceneWithGraph extends SceneMeta {
  graph: SceneGraph
}

async function fetchScene(id: string): Promise<SceneWithGraph | null> {
  const operations = await getSceneOperations()
  return (await operations.loadStoredScene(id)) as SceneWithGraph | null
}

export default async function ScenePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const scene = await fetchScene(id)

  if (!scene) {
    return (
      <AppCard>
        <h1 className="mt-6 font-semibold text-lg">Project not found</h1>
        <p className="mt-1 text-muted-foreground text-sm">
          There is no project with id <code className="font-mono">{id}</code> on this editor.
        </p>
        <Link className={cn(PRIMARY_PILL, 'mt-5')} href="/">
          All projects
        </Link>
      </AppCard>
    )
  }

  const { graph, ...meta } = scene
  // The source is a project of its own that may be gone by now.
  const source = meta.forkedFrom
    ? await (await getSceneOperations()).getProjectStatus(meta.forkedFrom.id)
    : null
  return (
    <SceneLoader
      copiedFrom={source ? { id: source.id, name: source.name } : null}
      initialScene={graph}
      meta={meta}
    />
  )
}
