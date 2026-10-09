import { AsyncLocalStorage } from "node:async_hooks"

/**
 * Toutes les installations d'Eraser parlent à Google Sheets avec le même compte Google :
 * elles se partagent un seul quota, d'environ 60 lectures par minute pour tout le groupe.
 * Cinq joueurs ouvrant leur fiche en même temps suffisent à l'épuiser.
 *
 * Avant, chaque requête refusée (429) se relançait seule, cinq fois : vingt lectures
 * refusées en devenaient cent, le quota ne se libérait jamais et tout ralentissait à
 * chaque essai. Désormais, sur cette installation :
 * - un refus met toutes les requêtes Sheets en pause ensemble, le temps que Google libère
 *   du quota (pause plus longue à chaque refus d'affilée, remise à zéro au premier succès) ;
 * - quelques requêtes seulement partent à la fois, celles d'une page passant en premier ;
 * - le travail d'arrière-plan (relectures de caches, synchronisations) cède sa place :
 *   il passe après les pages et, pendant une pause, abandonne aussitôt (les données déjà en
 *   mémoire restent servies ; il sera retenté plus tard).
 */

const backgroundWork = new AsyncLocalStorage<true>()

/** Lance `run` comme travail d'arrière-plan : ses requêtes Sheets passent après celles des pages. */
export function asBackgroundGoogleWork<T>(run: () => Promise<T>): Promise<T> {
  return backgroundWork.run(true, run)
}

export function isBackgroundGoogleWork() {
  return backgroundWork.getStore() === true
}

/** Le code d'erreur d'un refus de quota, le même que celui que Google renvoie. */
export const QUOTA_ERROR = "SHEETS_API_ERROR:429"

const MAX_IN_FLIGHT = 6
const FIRST_PAUSE_MS = 4_000
const MAX_PAUSE_MS = 60_000

let pausedUntil = 0
let refusals = 0
let inFlight = 0
const queue: Array<{ background: boolean; start: () => void }> = []

/** Combien de temps (ms) la pause commune dure encore. */
export function googleQuotaPauseMs() {
  return Math.max(0, pausedUntil - Date.now())
}

/** Google a refusé pour quota : toutes les requêtes Sheets de l'installation attendent. */
export function noteQuotaRefusal(retryAfter?: string | null) {
  refusals += 1
  const hinted = Number.parseFloat(retryAfter ?? "")
  const pause = Number.isFinite(hinted) && hinted > 0
    ? Math.min(MAX_PAUSE_MS, hinted * 1_000)
    : Math.min(MAX_PAUSE_MS, FIRST_PAUSE_MS * 2 ** (refusals - 1))
  pausedUntil = Math.max(pausedUntil, Date.now() + pause + Math.random() * 1_500)
}

export function noteQuotaSuccess() {
  refusals = 0
}

function pump() {
  while (inFlight < MAX_IN_FLIGHT && queue.length) {
    // Les requêtes des pages d'abord ; l'arrière-plan ne prend jamais la dernière place libre.
    const index = queue.findIndex((item) => !item.background)
    if (index < 0 && inFlight >= MAX_IN_FLIGHT - 1) return
    const [next] = queue.splice(index < 0 ? 0 : index, 1)
    inFlight += 1
    next.start()
  }
}

/**
 * Attend que cette installation puisse envoyer une requête Sheets, puis rend la fonction
 * qui libère la place. `deadline` : au-delà, mieux vaut dire tout de suite que Google est
 * saturé que de faire attendre la page pour rien.
 */
export async function acquireSheetsSlot(options: { deadline: number }) {
  const background = isBackgroundGoogleWork()
  for (;;) {
    const pause = googleQuotaPauseMs()
    if (pause > 0) {
      if (background || Date.now() + pause > options.deadline) throw new Error(QUOTA_ERROR)
      await new Promise((resolve) => setTimeout(resolve, pause))
      continue
    }
    await new Promise<void>((resolve) => {
      queue.push({ background, start: resolve })
      pump()
    })
    // Une pause a pu commencer pendant l'attente de la place : on la respecte.
    if (googleQuotaPauseMs() > 0) {
      inFlight -= 1
      pump()
      continue
    }
    let released = false
    return () => {
      if (released) return
      released = true
      inFlight -= 1
      pump()
    }
  }
}
