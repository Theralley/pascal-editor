interface Timers<Handle> {
  set(callback: () => void, delayMs: number): Handle
  clear(handle: Handle): void
}

/** One pending retry: scheduling replaces the previous one, and it fires at most once. */
export function createDeferredRetry<Handle = ReturnType<typeof setTimeout>>(
  run: () => void,
  timers: Timers<Handle> = {
    set: (callback, delayMs) => setTimeout(callback, delayMs) as Handle,
    clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
  },
) {
  let pending: { handle: Handle } | null = null
  const cancel = () => {
    if (!pending) return
    timers.clear(pending.handle)
    pending = null
  }
  return {
    schedule(delayMs: number) {
      cancel()
      const entry = { handle: undefined as Handle }
      entry.handle = timers.set(() => {
        if (pending === entry) pending = null
        run()
      }, delayMs)
      pending = entry
    },
    cancel,
  }
}
