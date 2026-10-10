import { AsyncLocalStorage } from "node:async_hooks"

/**
 * « Actualiser » (bouton, F5) relit la page affichée, et elle seule. La route /api/refresh
 * pose un cookie de quelques secondes (`eraser-fresh`, l'instant du clic) : pendant le
 * rechargement, ce que la page lit et qui date d'avant cet instant est relu dans Google (ou
 * dans une copie partagée faite après). Le reste de la mémoire n'est pas touché : les autres
 * onglets, les autres pages, gardent ce qu'ils avaient.
 *
 * Avant, « Actualiser » vidait toute la mémoire du serveur local : cinq joueurs qui
 * actualisaient ensemble relisaient chacun tout ce qu'ils avaient déjà vu, sur le quota
 * Google que toutes les installations partagent.
 */
export const FRESH_COOKIE = "eraser-fresh"
/** Le temps de recharger la page et ses données. */
export const FRESH_WINDOW_MS = 20_000

const explicit = new AsyncLocalStorage<number>()

/** Pour le travail qui n'est pas une requête de page (tests) : « relire ce qui date d'avant `after` ». */
export function runWithFreshness<T>(after: number, run: () => Promise<T>) {
  return explicit.run(after, run)
}

/**
 * L'instant avant lequel une donnée lue pour cette requête doit être relue (0 : rien à relire).
 * Hors d'une requête (travail d'arrière-plan), 0.
 */
export async function freshAfter() {
  const forced = explicit.getStore()
  if (forced !== undefined) return forced
  try {
    const { cookies } = await import("next/headers")
    const after = Number((await cookies()).get(FRESH_COOKIE)?.value ?? "")
    return Number.isFinite(after) && after > 0 && Date.now() - after < FRESH_WINDOW_MS ? after : 0
  } catch {
    return 0
  }
}

/** Une donnée lue (ou dont la lecture a commencé) à `readAt` doit-elle être relue pour cette requête ? */
export async function mustReread(readAt: number | undefined) {
  const after = await freshAfter()
  return after > 0 && (readAt ?? 0) < after
}
