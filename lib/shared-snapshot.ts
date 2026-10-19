import { mustReread } from "@/lib/request-freshness"

/**
 * Une lecture du serveur partagé (réglages des index, presets, rangement…) gardée en mémoire.
 *
 * Copie de moins de `freshMs` : servie telle quelle. Plus vieille : servie tout de suite quand
 * même, et relue en arrière-plan (une seule relecture à la fois) ; la page suivante a la
 * nouvelle. Avant, une copie périmée faisait attendre le serveur partagé — un aller-retour
 * jusqu'à Cloudflare, souvent plus d'une demi-seconde — à chaque page passé ce délai.
 *
 * Seules attentes : la toute première lecture, `read(true)` (ce qui suit une écriture faite ici,
 * ou en décide), et « Actualiser » (F5), qui relit ce qui date d'avant son clic. `forget()`
 * oublie la copie : la lecture suivante attend le serveur partagé.
 */
export function sharedSnapshot<T>(load: () => Promise<T>, options: { freshMs?: number } = {}) {
  const freshMs = options.freshMs ?? 30_000
  let current: { readAt: number; promise: Promise<T> } | null = null
  let pending: { readAt: number; promise: Promise<T> } | null = null
  let generation = 0

  function start() {
    const gen = generation
    const entry = { readAt: Date.now(), promise: load() }
    pending = entry
    entry.promise.then(() => {
      if (pending === entry) pending = null
      // Une lecture partie avant un oubli (une écriture) ne reprend pas la main.
      if (gen === generation && (!current || current.readAt <= entry.readAt)) current = entry
    }, () => { if (pending === entry) pending = null })
    return entry.promise
  }

  async function read(fresh = false): Promise<T> {
    if (fresh) return start()
    const copy = current
    if (!copy) return pending?.promise ?? start()
    if (await mustReread(copy.readAt)) return pending && !await mustReread(pending.readAt) ? pending.promise : start()
    if (Date.now() - copy.readAt >= freshMs && !pending) void start().catch(() => undefined)
    return copy.promise
  }

  function forget() {
    generation += 1
    current = null
    pending = null
  }

  return { read, forget }
}
