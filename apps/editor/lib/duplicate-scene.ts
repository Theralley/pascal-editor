export const CONFLICT_MESSAGE = 'This project changed since the page loaded. Reload and try again.'

export type DuplicateResult = { ok: true; id: string } | { ok: false; message: string }

/** Copies the project as it was at `version`, under `name` or `Copy of <name>`. */
export async function requestDuplicate(
  sceneId: string,
  { name, version }: { name?: string; version: number },
): Promise<DuplicateResult> {
  try {
    const response = await fetch(`/api/scenes/${sceneId}/duplicate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'If-Match': `"${version}"` },
      body: JSON.stringify(name ? { name } : {}),
    })
    if (response.status === 409) return { ok: false, message: CONFLICT_MESSAGE }
    if (!response.ok) return { ok: false, message: `Copy failed (${response.status})` }
    const copy = (await response.json()) as { id: string }
    return { ok: true, id: copy.id }
  } catch {
    return { ok: false, message: 'Could not reach the editor.' }
  }
}
