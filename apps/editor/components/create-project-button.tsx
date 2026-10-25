'use client'

import { type SceneGraph, useT } from '@pascal-app/editor'
import { Plus } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useCallback, useState } from 'react'
import { PRIMARY_PILL } from './app-shell'
import { messages } from './messages'

const EMPTY_GRAPH: SceneGraph = {
  nodes: {},
  rootNodeIds: [],
}

/**
 * Creates an empty project named after its number and opens it. The number
 * comes from the server-rendered list so it never collides with a project
 * that still exists.
 */
export function CreateProjectButton({ nextNumber }: { nextNumber: number }) {
  const t = useT(messages)
  const router = useRouter()
  const [isCreating, setIsCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleCreate = useCallback(async () => {
    setIsCreating(true)
    setError(null)
    try {
      const response = await fetch('/api/scenes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: `Project #${nextNumber}`, graph: EMPTY_GRAPH }),
      })
      if (!response.ok) {
        setError(t('create.failed', { status: response.status }))
        return
      }
      const meta = (await response.json()) as { id: string }
      router.push(`/project/${meta.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('create.failedPlain'))
    } finally {
      setIsCreating(false)
    }
  }, [router, nextNumber, t])

  return (
    <div className="flex items-center gap-3">
      {error && <span className="text-destructive text-xs">{error}</span>}
      <button className={PRIMARY_PILL} disabled={isCreating} onClick={handleCreate} type="button">
        <Plus className="h-4 w-4" />
        {isCreating ? t('create.creating') : t('create.new')}
      </button>
    </div>
  )
}
