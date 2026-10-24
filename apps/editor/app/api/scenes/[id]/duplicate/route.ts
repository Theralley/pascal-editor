import type { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { guardSceneApiRequest, sceneApiJson, sceneApiPreflight } from '@/lib/scene-api-security'
import { getSceneOperations } from '@/lib/scene-store-server'
import { copySceneThumbnail, sceneThumbnailUrl } from '@/lib/scene-thumbnails'
import { sessionPrincipal } from '@/lib/self-host-auth'

export const dynamic = 'force-dynamic'

type RouteParams = { params: Promise<{ id: string }> }

const duplicateSceneSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  /** Pins the content when a version number alone cannot, as for a draft saved in place. */
  expectedGraphHash: z.string().min(1).optional(),
})

export function OPTIONS(request: NextRequest) {
  return sceneApiPreflight(request)
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const guard = guardSceneApiRequest(request)
  if (guard) return guard

  const { id } = await params

  const text = await request.text()
  let body: unknown = {}
  if (text.trim() !== '') {
    try {
      body = JSON.parse(text)
    } catch {
      return sceneApiJson(
        request,
        { error: 'invalid_request', details: 'body must be valid JSON' },
        { status: 400 },
      )
    }
  }
  const parsed = duplicateSceneSchema.safeParse(body)
  if (!parsed.success) {
    return sceneApiJson(
      request,
      { error: 'invalid_request', details: parsed.error.issues },
      { status: 400 },
    )
  }

  const operations = await getSceneOperations()
  if (!operations.duplicateStoredScene) {
    return sceneApiJson(request, { error: 'duplicate_unavailable' }, { status: 501 })
  }

  try {
    const meta = await operations.duplicateStoredScene(id, {
      name: parsed.data.name,
      expectedGraphHash: parsed.data.expectedGraphHash,
      expectedVersion: parseIfMatch(request.headers.get('If-Match')),
      // A signed-in copy is attributable; agent copies through the bearer stay unowned.
      ownerId: sessionPrincipal(request),
    })
    // The share marker is deliberately not copied: the copy starts private.
    await copySceneThumbnail(id, meta.id).catch(() => {})
    return sceneApiJson(
      request,
      { ...meta, thumbnailUrl: meta.thumbnailUrl ?? (await sceneThumbnailUrl(meta.id)) },
      {
        status: 201,
        headers: { Location: `/project/${meta.id}`, ETag: `"${meta.version}"` },
      },
    )
  } catch (error) {
    return handleStoreError(request, error)
  }
}

/** `If-Match` as the scene routes read it: `"<version>"` or `W/"<version>"`; anything else is no pin. */
function parseIfMatch(raw: string | null): number | undefined {
  const match = raw?.trim().match(/^(?:W\/)?"?(\d+)"?$/)
  return match ? Number(match[1]) : undefined
}

function handleStoreError(request: NextRequest, error: unknown): NextResponse {
  const code = (error as { code?: string })?.code
  if (code === 'version_conflict') {
    return sceneApiJson(request, { error: 'version_conflict' }, { status: 409 })
  }
  if (code === 'not_found') {
    return sceneApiJson(request, { error: 'not_found' }, { status: 404 })
  }
  if (code === 'too_large') {
    return sceneApiJson(request, { error: 'too_large' }, { status: 413 })
  }
  if (code === 'invalid') {
    return sceneApiJson(request, { error: 'invalid' }, { status: 400 })
  }
  const message = error instanceof Error ? error.message : 'unexpected_error'
  return sceneApiJson(request, { error: 'internal_error', message }, { status: 500 })
}
