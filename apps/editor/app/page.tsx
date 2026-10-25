import type { SceneCardData } from '@/components/scene-card'
import { nextProjectNumber } from '@/lib/next-project-number'
import { getSceneOperations } from '@/lib/scene-store-server'
import { sceneThumbnailUrl } from '@/lib/scene-thumbnails'
import { HomeView } from './home-view'

export const dynamic = 'force-dynamic'

async function fetchScenes(): Promise<SceneCardData[]> {
  const operations = await getSceneOperations()
  const scenes = await operations.listScenes({ limit: 50 })
  return Promise.all(
    scenes.map(async (scene) => ({
      id: scene.id,
      name: scene.name,
      version: scene.version,
      nodeCount: scene.nodeCount,
      thumbnailUrl: scene.thumbnailUrl ?? (await sceneThumbnailUrl(scene.id)),
      updatedAt: scene.updatedAt,
    })),
  )
}

export default async function HomePage() {
  const scenes = await fetchScenes()
  const nextNumber = nextProjectNumber(scenes.map((scene) => scene.name))

  return <HomeView nextNumber={nextNumber} scenes={scenes} />
}
