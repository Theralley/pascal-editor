'use client'

import { type ValidateBuildJsonResult, validateBuildJson } from '@pascal-app/core'
import { type MessageKey, type MessageVars, translate, useT } from '@pascal-app/editor'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import { type ImportSrcReason, MAX_IMPORT_BYTES, parseImportSrc } from '@/lib/import-src'
import { messages } from './messages'

const SRC_REASON_KEYS = {
  missing: 'src.missing',
  notAbsolute: 'src.notAbsolute',
  credentials: 'src.credentials',
  httpsOnly: 'src.httpsOnly',
} as const satisfies Record<ImportSrcReason, MessageKey<typeof messages>>

// A failed create is a catalog key, translated where it shows; a thrown error's own text stays as is.
type CreateError = { key: MessageKey<typeof messages>; vars?: MessageVars } | { message: string }

type Phase =
  | { kind: 'fetching' }
  // createError keeps the review alive after a failed create: the
  // validated graph stays on screen and Import can simply be retried —
  // a refresh would re-fetch `src`, and a short-lived scan URL may
  // already be gone (review feedback).
  | { kind: 'review'; result: ValidateBuildJsonResult; createError?: CreateError }
  | { kind: 'creating'; result: ValidateBuildJsonResult }
  | { kind: 'error'; key: MessageKey<typeof messages>; vars?: MessageVars }

/**
 * Client half of `/import?src=<url>`: fetches the build JSON in the
 * visitor's browser (same trust model as dropping a file on Load Build —
 * the target must allow CORS), runs the same `validateBuildJson`
 * pre-flight as Load Build, shows what would be imported, and only on an
 * explicit click creates the scene through the regular `POST /api/scenes`
 * route — so auth, origin checks and graph validation all apply
 * unchanged.
 */
export function ImportClient({ src, name }: { src: string | null; name: string | null }) {
  const router = useRouter()
  const t = useT(messages)
  const [phase, setPhase] = useState<Phase>({ kind: 'fetching' })
  // null until the visitor types: the field then shows the name from the link, or the default in their language.
  const [typedName, setTypedName] = useState<string | null>(null)
  const sceneName = typedName ?? name ?? t('defaultName')
  // Synchronous re-entry guard: a second tap can fire before React
  // re-renders into 'creating', and two scenes would be created (review
  // feedback — especially likely on the mobile hand-off).
  const creating = useRef(false)

  useEffect(() => {
    // A new src remounts the component (the page keys it by src), so
    // state can never leak between files. Within one mount, ignore
    // every state update from a superseded run — an abort must not
    // surface as an error either.
    const parsedSrc = parseImportSrc(src)
    if (!parsedSrc.ok) {
      setPhase({ kind: 'error', key: SRC_REASON_KEYS[parsedSrc.reason] })
      return
    }
    let cancelled = false
    const controller = new AbortController()
    const update = (next: Phase) => {
      if (!cancelled) setPhase(next)
    }
    ;(async () => {
      let response: Response
      try {
        response = await fetch(parsedSrc.url, { signal: controller.signal })
      } catch {
        update({
          kind: 'error',
          key: 'fetchFailedCors',
        })
        return
      }
      if (!response.ok) {
        update({
          kind: 'error',
          key: 'fetchFailedStatus',
          vars: { status: response.status },
        })
        return
      }
      const declared = Number(response.headers.get('content-length') ?? 0)
      if (declared > MAX_IMPORT_BYTES) {
        update({ kind: 'error', key: 'tooLarge' })
        return
      }
      let text: string
      try {
        text = await response.text()
      } catch {
        update({ kind: 'error', key: 'unreadable' })
        return
      }
      // Blob measures BYTES — text.length counts UTF-16 code units, and
      // a graph full of non-ASCII names could pass here yet still 413
      // at the store (review feedback).
      if (new Blob([text]).size > MAX_IMPORT_BYTES) {
        update({ kind: 'error', key: 'tooLarge' })
        return
      }
      let parsed: unknown
      try {
        parsed = JSON.parse(text)
      } catch {
        update({ kind: 'error', key: 'notJson' })
        return
      }
      update({ kind: 'review', result: validateBuildJson(parsed) })
    })()
    return () => {
      cancelled = true
      controller.abort()
    }
  }, [src])

  const handleImport = useCallback(async () => {
    if (phase.kind !== 'review' || !phase.result.parsed) return
    if (creating.current) return
    creating.current = true
    const review = phase.result
    setPhase({ kind: 'creating', result: review })
    try {
      const response = await fetch('/api/scenes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: sceneName.trim() || translate(messages, 'defaultName'),
          graph: phase.result.parsed,
        }),
      })
      if (!response.ok) {
        setPhase({
          kind: 'review',
          result: review,
          createError:
            response.status === 401 || response.status === 403
              ? { key: 'signInNeeded' }
              : response.status === 413
                ? { key: 'storeTooLarge' }
                : { key: 'createFailedStatus', vars: { status: response.status } },
        })
        return
      }
      const meta = (await response.json()) as { id: string }
      router.push(`/project/${meta.id}`)
    } catch (error) {
      setPhase({
        kind: 'review',
        result: review,
        createError: error instanceof Error ? { message: error.message } : { key: 'createFailed' },
      })
    } finally {
      // Released in every path: after an error the user may retry.
      creating.current = false
    }
  }, [phase, router, sceneName])

  if (phase.kind === 'fetching') {
    return <p className="text-muted-foreground text-sm">{t('fetching')}</p>
  }
  if (phase.kind === 'creating') {
    return <p className="text-muted-foreground text-sm">{t('creating')}</p>
  }
  if (phase.kind === 'error') {
    return (
      <div className="rounded-xl border border-border/60 bg-background p-6">
        <p className="text-destructive text-sm">{t(phase.key, phase.vars)}</p>
      </div>
    )
  }

  const { result } = phase
  const typeEntries = Object.entries(result.stats.byType).sort((a, b) => b[1] - a[1])

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border/60 bg-background p-6">
        <label className="mb-1 block font-medium text-muted-foreground text-xs uppercase">
          {t('sceneName')}
        </label>
        <input
          className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm"
          onChange={(event) => setTypedName(event.target.value)}
          value={sceneName}
        />

        <p className="mt-4 mb-1 font-medium text-muted-foreground text-xs uppercase">
          {t('contents')}
        </p>
        <p className="text-sm">
          {result.stats.floorAreaM2 > 0
            ? t('nodesWithArea', {
                count: result.stats.total,
                area: Math.round(result.stats.floorAreaM2),
              })
            : t('nodes', { count: result.stats.total })}
        </p>
        {typeEntries.length > 0 && (
          <p className="mt-1 text-muted-foreground text-xs">
            {typeEntries.map(([type, count]) => `${count} ${type}`).join(' · ')}
          </p>
        )}

        {result.errors.length > 0 && (
          <ul className="mt-4 space-y-1">
            {result.errors.map((issue) => (
              <li className="text-destructive text-xs" key={`${issue.code}:${issue.message}`}>
                {issue.message}
              </li>
            ))}
          </ul>
        )}
        {result.warnings.length > 0 && (
          <ul className="mt-2 space-y-1">
            {result.warnings.map((issue) => (
              <li className="text-muted-foreground text-xs" key={`${issue.code}:${issue.message}`}>
                {issue.message}
              </li>
            ))}
          </ul>
        )}
        {/* The schema error above says "see details below" — these are the
            details: per-node path and message, same data Load Build shows. */}
        {result.schemaIssues.length > 0 && (
          <ul className="mt-2 space-y-1">
            {result.schemaIssues.map((issue) => (
              <li
                className="text-destructive text-xs"
                key={`${issue.nodeId}:${issue.path}:${issue.message}`}
              >
                {issue.nodeId} ({issue.nodeType}) · {issue.path}: {issue.message}
              </li>
            ))}
          </ul>
        )}
      </div>

      {phase.createError && (
        <p className="text-destructive text-sm">
          {'message' in phase.createError
            ? phase.createError.message
            : t(phase.createError.key, phase.createError.vars)}
        </p>
      )}
      <button
        className="rounded-md border border-border bg-accent px-4 py-2 font-medium text-sm hover:bg-accent/80 disabled:opacity-50"
        disabled={!result.ok || !result.parsed}
        onClick={handleImport}
        type="button"
      >
        {phase.createError ? t('retry') : t('importAsNew')}
      </button>
    </div>
  )
}
