import { ImportView } from './import-view'

export const dynamic = 'force-dynamic'

/**
 * `/import?src=<https-url>[&name=<scene name>]` — the hand-off point for
 * scanning apps and other external tools: they host a build JSON at a
 * URL (CORS-enabled) and open this page; the visitor reviews what the
 * file contains and imports it as a new scene of their own.
 */
export default async function ImportPage({
  searchParams,
}: {
  searchParams: Promise<{ src?: string; name?: string }>
}) {
  const params = await searchParams

  return <ImportView name={params.name ?? null} src={params.src ?? null} />
}
