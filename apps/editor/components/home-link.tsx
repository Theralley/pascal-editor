'use client'

import { useT } from '@pascal-app/editor'
import Link from 'next/link'
import { PascalLogo } from './app-shell'
import { messages } from './messages'

/** The logo that leads back to the project list; a client component so its label follows the language. */
export function HomeLink() {
  const t = useT(messages)

  return (
    <Link
      aria-label={t('home')}
      className="-mx-2 flex items-center rounded-lg px-2 py-1.5 transition-colors hover:bg-accent"
      href="/"
    >
      <PascalLogo />
    </Link>
  )
}
