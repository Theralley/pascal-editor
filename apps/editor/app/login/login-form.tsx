'use client'

import { useT } from '@pascal-app/editor'
import { useRouter } from 'next/navigation'
import { type FormEvent, useState } from 'react'
import { PRIMARY_PILL } from '@/components/app-shell'
import { cn } from '@/lib/utils'
import { messages } from './messages'

export function LoginForm({ next }: { next: string }) {
  const t = useT(messages)
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      if (response.status === 429) {
        setError(t('tooMany'))
        return
      }
      if (!response.ok) {
        setError(t('wrong'))
        return
      }
      router.push(next)
      router.refresh()
    } catch {
      setError(t('unreachable'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <h1 className="mt-6 font-semibold text-lg">{t('title')}</h1>
      <p className="mt-1 text-muted-foreground text-sm">{t('description')}</p>
      <form className="mt-5 flex flex-col gap-3" onSubmit={handleSubmit}>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">{t('password')}</span>
          <input
            autoComplete="current-password"
            className="rounded-lg border border-input bg-accent px-3 py-2 text-sm outline-none focus:border-ring"
            name="password"
            onChange={(event) => setPassword(event.target.value)}
            required
            type="password"
            value={password}
          />
        </label>
        {error && <p className="text-destructive text-xs">{error}</p>}
        <button
          className={cn(PRIMARY_PILL, 'mt-1 py-2')}
          disabled={submitting || password.length === 0}
          type="submit"
        >
          {submitting ? t('signingIn') : t('signIn')}
        </button>
      </form>
    </>
  )
}
