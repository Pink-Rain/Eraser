import { getRequestExecutionContext } from "vinext/shims/request-context"

import { QUOTA_ERROR } from "@/lib/google-quota"

/**
 * Le travail d'arrière-plan qui cède sa place quand Google refuse faute de quota (voir
 * google-quota.ts) n'a pas échoué : il sera refait plus tard, et la page a déjà ce qu'il lui
 * faut. Ce n'est donc pas une erreur du journal ; une ligne par minute au plus dans la sortie
 * du serveur. Le nombre de refus reste dans Administration › Lenteurs.
 */
let quotaNoticeAt = 0

export function runInBackground(promise: Promise<unknown>, label: string) {
  const guarded = promise.catch((error) => {
    const message = error instanceof Error ? error.message : "UNKNOWN_ERROR"
    if (message.startsWith(QUOTA_ERROR)) {
      if (Date.now() - quotaNoticeAt > 60_000) { quotaNoticeAt = Date.now(); console.warn(label, "reporté : quota Google épuisé pour l'instant") }
      return
    }
    console.error(label, message)
  })
  getRequestExecutionContext()?.waitUntil(guarded)
  return guarded
}
