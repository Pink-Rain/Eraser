/**
 * Cache mémoire « périmé pendant qu'on revalide » : une valeur récente est servie
 * telle quelle ; une valeur plus ancienne est servie tout de suite pendant qu'une
 * relecture part en arrière-plan ; au-delà de `maxStaleMs`, on attend la relecture.
 * `invalidate()` oublie tout, y compris les relectures déjà parties.
 */
export function staleWhileRevalidate<T>(options: { freshMs: number; maxStaleMs: number }) {
  type Entry = { value?: T; loadedAt: number; pending?: Promise<T> }
  const entries = new Map<string, Entry>()
  let generation = 0

  function load(key: string, loader: () => Promise<T>) {
    const current = entries.get(key)
    if (current?.pending) return current.pending
    const startedAt = generation
    const pending = loader().then((value) => {
      if (startedAt === generation) entries.set(key, { value, loadedAt: Date.now() })
      return value
    }).finally(() => {
      const entry = entries.get(key)
      if (entry?.pending === pending) entries.set(key, { ...entry, pending: undefined })
    })
    entries.set(key, { ...(current ?? { loadedAt: 0 }), pending })
    return pending
  }

  return {
    async get(key: string, loader: () => Promise<T>, getOptions: { refresh?: boolean } = {}) {
      const entry = entries.get(key)
      if (!getOptions.refresh && entry?.value !== undefined) {
        const age = Date.now() - entry.loadedAt
        if (age < options.freshMs) return entry.value
        if (age < options.maxStaleMs) {
          load(key, loader).catch((error) => console.error("STALE_CACHE_REFRESH_FAILED", key, error instanceof Error ? error.message : "UNKNOWN_ERROR"))
          return entry.value
        }
      }
      return load(key, loader)
    },
    invalidate() {
      generation += 1
      entries.clear()
    },
  }
}
