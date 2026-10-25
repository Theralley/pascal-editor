import type { Metadata } from 'next'
import { SetupView } from './setup-view'

export const dynamic = 'force-dynamic'
// i18n-ignore: server metadata cannot follow the language chosen in the browser
export const metadata: Metadata = { title: 'Set up · Pascal' }

export default function SetupPage() {
  return <SetupView />
}
