'use client'

import { useEditor, useT } from '@pascal-app/editor'
import { ChevronDown, Copy, Eye, GitFork, Pencil, Share2 } from 'lucide-react'
import Link from 'next/link'
import { type KeyboardEvent, useCallback, useEffect, useRef, useState } from 'react'
import { PascalMark } from './app-shell'
import { messages } from './messages'
import { MakeOwnVersionDialog } from './scene-card'
import { SharePanel } from './share-panel'

interface EditorNavbarProps {
  sceneId: string
  name: string
  /** Persists a new project name; resolves once the server has answered. */
  onRename: (name: string) => Promise<void>
  /**
   * Saves, then copies the project (named `Copy of <name>` without `name`) and opens the copy.
   * Resolves an error message, or null once the copy is opening.
   */
  onDuplicate: (name?: string) => Promise<string | null>
  /** The project this one was copied from, while that still exists. */
  copiedFrom: { id: string; name: string } | null
}

export function EditorNavbar({
  sceneId,
  name,
  onRename,
  onDuplicate,
  copiedFrom,
}: EditorNavbarProps) {
  const t = useT(messages)
  const [editing, setEditing] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [forkOpen, setForkOpen] = useState(false)
  const [duplicateError, setDuplicateError] = useState<string | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [shareOpen, setShareOpen] = useState(false)
  const shareAnchorRef = useRef<HTMLDivElement>(null)
  const closeShare = useCallback(() => setShareOpen(false), [])
  const [draft, setDraft] = useState(name)
  const inputRef = useRef<HTMLInputElement>(null)
  // Escape cancels; the blur it causes must not save.
  const cancelledRef = useRef(false)

  useEffect(() => {
    if (!menuOpen) return
    const onPointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false)
    }
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [menuOpen])

  useEffect(() => {
    if (!editing) return
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [editing])

  const startEditing = () => {
    cancelledRef.current = false
    setDraft(name)
    setEditing(true)
  }

  const duplicate = async () => {
    setMenuOpen(false)
    setDuplicateError(null)
    const message = await onDuplicate()
    if (message !== null) setDuplicateError(message)
  }

  const commit = () => {
    setEditing(false)
    if (cancelledRef.current) return
    const trimmed = draft.trim()
    if (trimmed && trimmed !== name) void onRename(trimmed)
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    // Keep editor shortcuts (delete, undo, tool keys) out of the title field.
    event.stopPropagation()
    if (event.key === 'Enter') {
      event.preventDefault()
      inputRef.current?.blur()
    } else if (event.key === 'Escape') {
      event.preventDefault()
      cancelledRef.current = true
      inputRef.current?.blur()
    }
  }

  return (
    <nav className="flex h-12 shrink-0 items-center gap-2 border-border/30 border-b bg-sidebar px-2 lg:px-3">
      <div className="flex min-w-0 items-center gap-1.5 lg:gap-2">
        <Link
          aria-label={t('navbar.allProjects')}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors hover:bg-accent"
          href="/"
          title={t('navbar.allProjects')}
        >
          <PascalMark />
        </Link>

        <div className="h-5 w-px shrink-0 bg-border/50" />

        <div className="min-w-0 max-w-40 lg:max-w-72">
          {editing ? (
            <input
              aria-label={t('card.projectName')}
              className="h-7 w-full rounded-md bg-accent/50 px-2 py-0 font-medium text-foreground text-sm outline-none ring-1 ring-primary/50 focus:ring-primary"
              maxLength={200}
              onBlur={commit}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={handleKeyDown}
              ref={inputRef}
              value={draft}
            />
          ) : (
            <button
              className="group/title flex h-7 max-w-full items-center gap-1.5 rounded-md px-2 text-left transition-colors hover:bg-accent/50"
              onClick={startEditing}
              title={t('card.renameTitle')}
              type="button"
            >
              <span className="truncate font-medium text-sm">{name}</span>
              <Pencil className="h-3 w-3 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover/title:opacity-100" />
            </button>
          )}
        </div>

        <div className="relative shrink-0" ref={menuRef}>
          <button
            aria-expanded={menuOpen}
            aria-haspopup="menu"
            aria-label={t('navbar.actions')}
            className="flex h-7 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
            onClick={() => setMenuOpen((open) => !open)}
            type="button"
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
          {menuOpen && (
            <div
              className="absolute top-9 left-0 z-50 min-w-48 rounded-xl border border-border bg-popover p-1 text-sm shadow-2xl"
              role="menu"
            >
              <button
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left hover:bg-accent"
                onClick={() => {
                  setMenuOpen(false)
                  startEditing()
                }}
                role="menuitem"
                type="button"
              >
                <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                {t('common.rename')}
              </button>
              <button
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left hover:bg-accent"
                onClick={() => void duplicate()}
                role="menuitem"
                type="button"
              >
                <Copy className="h-3.5 w-3.5 text-muted-foreground" />
                {t('common.duplicate')}
              </button>
              <button
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left hover:bg-accent"
                onClick={() => {
                  setMenuOpen(false)
                  setForkOpen(true)
                }}
                role="menuitem"
                type="button"
              >
                <GitFork className="h-3.5 w-3.5 text-muted-foreground" />
                {t('card.makeOwn')}
              </button>
              {copiedFrom && (
                <Link
                  className="mt-1 block truncate border-border/50 border-t px-2.5 pt-2 pb-1.5 text-muted-foreground text-xs hover:text-foreground"
                  href={`/project/${copiedFrom.id}`}
                  role="menuitem"
                >
                  {t('navbar.copiedFrom', { name: copiedFrom.name })}
                </Link>
              )}
            </div>
          )}
        </div>
        {duplicateError && (
          <p
            className="max-w-60 truncate text-destructive text-xs"
            role="alert"
            title={duplicateError}
          >
            {duplicateError}
          </p>
        )}
      </div>

      <div className="flex-1" />

      <button
        className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 font-medium text-sm transition-colors hover:bg-accent"
        onClick={() => useEditor.getState().setPreviewMode(true)}
        type="button"
      >
        <Eye className="h-4 w-4 shrink-0" />
        <span className="hidden sm:inline">Preview</span>
      </button>

      <div className="relative" ref={shareAnchorRef}>
        <button
          aria-expanded={shareOpen}
          className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 font-medium text-sm transition-colors hover:bg-accent"
          onClick={() => setShareOpen((open) => !open)}
          type="button"
        >
          <Share2 className="h-4 w-4 shrink-0" />
          <span className="hidden sm:inline">{t('navbar.share')}</span>
        </button>
        {shareOpen && (
          <SharePanel anchorRef={shareAnchorRef} onClose={closeShare} sceneId={sceneId} />
        )}
      </div>
      {forkOpen && (
        <MakeOwnVersionDialog
          initialName={t('card.myVersion', { name }).slice(0, 200)}
          onClose={() => setForkOpen(false)}
          onSubmit={onDuplicate}
        />
      )}
    </nav>
  )
}
