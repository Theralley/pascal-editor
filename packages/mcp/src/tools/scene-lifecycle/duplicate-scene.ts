import type { McpServer } from '@modelcontextprotocol/server'
import { z } from 'zod'
import type { SceneOperations } from '../../operations'
import { SceneNotFoundError, SceneVersionConflictError } from '../../storage/types'
import { ADDITIVE_TOOL_ANNOTATIONS } from '../annotations'
import { ProtocolErrorCode, throwMcpError } from '../errors'
import { editorUrlFor } from './metadata'

export const duplicateSceneInput = {
  id: z.string().min(1).max(64),
  name: z.string().min(1).max(200).optional(),
  expectedVersion: z.number().int().positive().optional(),
}

export const duplicateSceneOutput = {
  id: z.string(),
  name: z.string(),
  projectId: z.string().nullable(),
  thumbnailUrl: z.string().nullable(),
  version: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
  ownerId: z.string().nullable(),
  sizeBytes: z.number(),
  nodeCount: z.number(),
  editorUrl: z.string(),
  forkedFrom: z.object({ id: z.string(), version: z.number() }).nullable(),
}

export function registerDuplicateScene(server: McpServer, operations: SceneOperations): void {
  server.registerTool(
    'duplicate_scene',
    {
      title: 'Duplicate scene',
      description:
        'Copy a stored scene into a new private scene named `Copy of <name>` unless `name` is given. The copy has its own id and history, is not shared, and records where it came from in `forkedFrom`. The source is unchanged and this session is not rebound: `load_scene` the copy by its id to edit it. Optionally pass `expectedVersion` to copy a specific version.',
      inputSchema: z.object(duplicateSceneInput),
      outputSchema: z.object(duplicateSceneOutput),
      annotations: ADDITIVE_TOOL_ANNOTATIONS,
    },
    async ({ id, name, expectedVersion }) => {
      if (!operations.canDuplicateScene) {
        throwMcpError(
          ProtocolErrorCode.InvalidRequest,
          'duplicate_unavailable: this MCP store cannot copy scenes',
        )
      }
      try {
        const meta = await operations.duplicateStoredScene?.(id, {
          ...(name !== undefined ? { name } : {}),
          ...(expectedVersion !== undefined ? { expectedVersion } : {}),
        })
        if (!meta) throw new Error('duplicate_unavailable')
        const payload = {
          id: meta.id,
          name: meta.name,
          projectId: meta.projectId,
          thumbnailUrl: meta.thumbnailUrl,
          version: meta.version,
          createdAt: meta.createdAt,
          updatedAt: meta.updatedAt,
          ownerId: meta.ownerId,
          sizeBytes: meta.sizeBytes,
          nodeCount: meta.nodeCount,
          editorUrl: editorUrlFor(meta),
          forkedFrom: meta.forkedFrom ?? null,
        }
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(payload) }],
          structuredContent: payload,
        }
      } catch (err) {
        if (err instanceof SceneNotFoundError) {
          throwMcpError(ProtocolErrorCode.InvalidParams, 'scene_not_found', { id })
        }
        if (err instanceof SceneVersionConflictError) {
          throwMcpError(ProtocolErrorCode.InvalidRequest, 'version_conflict', {
            id,
            expectedVersion,
          })
        }
        const msg = err instanceof Error ? err.message : String(err)
        throwMcpError(ProtocolErrorCode.InternalError, msg)
      }
    },
  )
}
