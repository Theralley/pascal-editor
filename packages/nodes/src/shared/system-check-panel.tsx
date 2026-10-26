'use client'

import {
  type AnyNode,
  type AnyNodeId,
  emitter,
  getLevelElevations,
  summarizeSystemFor,
} from '@pascal-app/core'
import { useLocale, useT } from '@pascal-app/editor'
import { useViewer } from '@pascal-app/viewer'
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Crosshair,
  ShieldCheck,
  XCircle,
} from 'lucide-react'
import { useId, useMemo, useState } from 'react'
import { messages } from './messages'
import { checkDistributionSystems } from './system-checks'

const CATEGORIES = [
  { id: 'all', labelKey: 'checks.all' },
  { id: 'open-end', labelKey: 'checks.openEnd' },
  { id: 'connection-mismatch', labelKey: 'checks.connectionMismatch' },
  { id: 'disconnected-branch', labelKey: 'checks.disconnectedBranch' },
  { id: 'possible-intersection', labelKey: 'checks.possibleIntersection' },
  { id: 'drainage', labelKey: 'checks.drainage' },
  { id: 'unsupported-hanger', labelKey: 'checks.unsupportedHanger' },
] as const
const categoryFor = (code: string) =>
  ['slope-too-flat', 'slope-too-steep', 'trap-arm-too-long'].includes(code) ? 'drainage' : code

export default function SystemCheckPanel({
  nodeId,
  nodes,
}: {
  nodeId: AnyNodeId
  nodes: Record<AnyNodeId, AnyNode>
}) {
  const t = useT(messages)
  const locale = useLocale()
  const contentId = useId()
  const [open, setOpen] = useState(false)
  const [filter, setFilter] = useState('all')
  const summary = useMemo(
    () => (open ? summarizeSystemFor(nodeId, nodes) : null),
    [nodeId, nodes, open],
  )
  // The findings word themselves in the language they are made in.
  const findings = useMemo(
    () => (open && locale ? checkDistributionSystems(nodes) : []),
    [nodes, open, locale],
  )
  const visibleFindings = findings.filter(
    (finding) => filter === 'all' || categoryFor(finding.code) === filter,
  )
  const errorCount = findings.filter((finding) => finding.severity === 'error').length
  const warningCount = findings.length - errorCount
  const reveal = (id: AnyNodeId) => {
    const node = nodes[id]
    if (!node) return
    let parent = node
    const visited = new Set<string>()
    while (parent.parentId && parent.type !== 'level' && !visited.has(parent.id)) {
      visited.add(parent.id)
      const next = nodes[parent.parentId as AnyNodeId]
      if (!next) break
      parent = next
    }
    const buildingId =
      parent.type === 'level' ? getLevelElevations(nodes).get(parent.id)?.buildingId : null
    const building = buildingId ? nodes[buildingId as AnyNodeId] : null
    useViewer.getState().setSelection({
      ...(building?.type === 'building' ? { buildingId: building.id } : {}),
      ...(parent.type === 'level' ? { levelId: parent.id } : {}),
      selectedIds: [id],
    })
    emitter.emit('camera-controls:focus', { nodeId: id })
    emitter.emit('selection:find-node', node)
  }
  return (
    <section className="border-t border-border/50">
      <button
        type="button"
        className="flex w-full items-center gap-2 px-3 py-3 text-left text-xs font-medium transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
        aria-expanded={open}
        aria-controls={contentId}
        onClick={() => setOpen((value) => !value)}
      >
        <ShieldCheck className="size-4 text-muted-foreground" aria-hidden="true" />
        <span className="flex-1">{t('checks.heading')}</span>
        {open && (
          <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] tabular-nums text-muted-foreground">
            {findings.length}
          </span>
        )}
        <ChevronDown
          className={`size-3.5 text-muted-foreground transition-transform ${open ? '' : '-rotate-90'}`}
          aria-hidden="true"
        />
      </button>
      {open && (
        <div id={contentId} className="space-y-3 px-3 pb-3">
          <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
            <span>{t('checks.allSystems')}</span>
            {summary && (
              <span className="tabular-nums" title={t('checks.selectedTitle')}>
                {t('checks.selected', {
                  count: summary.runCount,
                  length: summary.runLengthM.toFixed(1),
                })}
              </span>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-muted/20 px-2.5 py-2">
              <XCircle
                className={`size-4 ${errorCount ? 'text-red-500' : 'text-muted-foreground'}`}
                aria-hidden="true"
              />
              <span className="text-sm font-semibold tabular-nums">{errorCount}</span>
              <span className="text-[11px] text-muted-foreground">{t('checks.errors')}</span>
            </div>
            <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-muted/20 px-2.5 py-2">
              <AlertTriangle
                className={`size-4 ${warningCount ? 'text-amber-500' : 'text-muted-foreground'}`}
                aria-hidden="true"
              />
              <span className="text-sm font-semibold tabular-nums">{warningCount}</span>
              <span className="text-[11px] text-muted-foreground">{t('checks.warnings')}</span>
            </div>
          </div>
          <div className="relative">
            <select
              aria-label={t('checks.filter')}
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              className="h-9 w-full appearance-none rounded-lg border border-border bg-background px-3 pr-8 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {CATEGORIES.map((category) => (
                <option key={category.id} value={category.id}>
                  {t(category.labelKey)} (
                  {category.id === 'all'
                    ? findings.length
                    : findings.filter((finding) => categoryFor(finding.code) === category.id)
                        .length}
                  )
                </option>
              ))}
            </select>
            <ChevronDown
              className="pointer-events-none absolute right-3 top-3 size-3.5 text-muted-foreground"
              aria-hidden="true"
            />
          </div>
          {visibleFindings.length ? (
            <ul
              className="max-h-72 space-y-2 overflow-y-auto overscroll-contain pr-1"
              aria-label={t('checks.findings')}
            >
              {visibleFindings.map((finding, index) => {
                const error = finding.severity === 'error'
                const Icon = error ? XCircle : AlertTriangle
                const category = CATEGORIES.find((entry) => entry.id === categoryFor(finding.code))
                const label = category ? t(category.labelKey) : t('checks.finding')
                return (
                  <li
                    key={`${finding.code}:${finding.nodeIds.join(':')}:${index}`}
                    className="overflow-hidden rounded-lg border border-border/60 bg-muted/10 p-2.5"
                  >
                    <div className="mb-1.5 flex items-center gap-2">
                      <Icon
                        className={`size-3.5 shrink-0 ${error ? 'text-red-500' : 'text-amber-500'}`}
                        aria-hidden="true"
                      />
                      <span className="min-w-0 flex-1 text-xs font-medium">{label}</span>
                      <span
                        className={`text-[10px] font-medium ${error ? 'text-red-600 dark:text-red-400' : 'text-amber-700 dark:text-amber-400'}`}
                      >
                        {error ? t('checks.error') : t('checks.warning')}
                      </span>
                    </div>
                    <p className="break-words text-[11px] leading-relaxed text-muted-foreground">
                      {finding.message}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {finding.nodeIds.map((id) => (
                        <button
                          type="button"
                          key={id}
                          disabled={!nodes[id]}
                          title={t('checks.locate', {
                            name: nodes[id]?.name || nodes[id]?.type || t('checks.item'),
                            id,
                          })}
                          onClick={() => reveal(id)}
                          className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-border/60 bg-background px-2 py-1 text-[10px] transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                        >
                          <Crosshair
                            className="size-3 shrink-0 text-muted-foreground"
                            aria-hidden="true"
                          />
                          <span className="truncate">
                            {nodes[id]?.name ||
                              nodes[id]?.type.replaceAll('-', ' ') ||
                              t('checks.missingItem')}
                          </span>
                          <ChevronRight
                            className="size-3 shrink-0 text-muted-foreground"
                            aria-hidden="true"
                          />
                        </button>
                      ))}
                    </div>
                  </li>
                )
              })}
            </ul>
          ) : (
            <div
              role="status"
              className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border px-3 py-5 text-center"
            >
              <CheckCircle2 className="size-5 text-emerald-500" aria-hidden="true" />
              <span className="text-xs font-medium">
                {findings.length ? t('checks.noneInCategory') : t('checks.none')}
              </span>
              {filter !== 'all' && (
                <button
                  type="button"
                  className="text-[11px] text-muted-foreground underline underline-offset-4 hover:text-foreground"
                  onClick={() => setFilter('all')}
                >
                  {t('checks.showAll')}
                </button>
              )}
            </div>
          )}
          <details className="text-[10px] leading-relaxed text-muted-foreground">
            <summary className="cursor-pointer hover:text-foreground">{t('checks.about')}</summary>
            <p className="pt-1.5">{t('checks.aboutNote')}</p>
          </details>
        </div>
      )}
    </section>
  )
}
