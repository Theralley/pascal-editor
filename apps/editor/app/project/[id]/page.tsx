import type { SceneGraph } from '@pascal-app/editor'
import { SceneLoader, type SceneMeta } from '@/components/scene-loader'
import { getSceneOperations } from '@/lib/scene-store-server'
import { ProjectNotFound } from './project-not-found'

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
    return <ProjectNotFound id={id} />
  }

  const { graph, ...meta } = scene
  // The source is a project of its own that may be gone by now, which leaves it unnamed.
  const origin = meta.forkedFrom
  const copiedFrom = origin?.name != null ? { id: origin.id, name: origin.name } : null
  return <SceneLoader copiedFrom={copiedFrom} initialScene={graph} meta={meta} />
}
