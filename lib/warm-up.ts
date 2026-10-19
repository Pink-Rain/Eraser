import { asBackgroundGoogleWork, googleQuotaPauseMs, QUOTA_ERROR } from "@/lib/google-quota"
import { OBJECTS_INDEX_KEY, worldIndexDefinitions, type WorldIndexKey } from "@/lib/world-index-definitions"
import { getWorldIndex } from "@/lib/world-indexes"
import type { SiteRole } from "@/lib/auth-types"

/**
 * Le préchauffage : peu après l'ouverture d'Eraser par un MJ ou un administrateur, les index
 * sont lus un par un en arrière-plan, pour que leur première ouverture soit immédiate au lieu
 * d'attendre Google. Chaque lecture cède la place aux pages (`asBackgroundGoogleWork`), passe
 * par les copies partagées entre installations (lib/shared-reads.ts), et n'a lieu qu'une fois
 * par lancement : ce sont les lectures que la première visite de chaque index aurait faites.
 * Un joueur n'ouvre pas les index : rien n'est lu pour lui.
 *
 * Le quota Google est commun à toute la table : les index sont lus espacés (GAP_MS), et au
 * premier refus le préchauffage s'arrête, puis reprend où il en était quelques minutes plus
 * tard. Lus d'affilée, ils épuisaient le quota au moment où le MJ ouvrait ses pages.
 */
const START_AFTER_MS = 20_000
const GAP_MS = 4_000
const AFTER_REFUSAL_MS = 5 * 60_000
let started = false

export function warmUpOnce(role: SiteRole | undefined) {
  if (started || (role !== "admin" && role !== "mj")) return
  started = true
  const keys: WorldIndexKey[] = [OBJECTS_INDEX_KEY, ...(Object.keys(worldIndexDefinitions) as WorldIndexKey[])]
  later(START_AFTER_MS, () => warmUp(keys))
}

function later(ms: number, run: () => Promise<void>) {
  const timer = setTimeout(() => { void run() }, ms)
  timer.unref?.()
}

async function warmUp(keys: WorldIndexKey[]): Promise<void> {
  for (let at = 0; at < keys.length; at += 1) {
    const key = keys[at]
    // Google vient de refuser (une page ou une autre installation) : on lui laisse sa place.
    if (googleQuotaPauseMs() > 0) { later(AFTER_REFUSAL_MS, () => warmUp(keys.slice(at))); return }
    try {
      await asBackgroundGoogleWork(() => getWorldIndex(key))
    } catch (error) {
      const message = error instanceof Error ? error.message : "UNKNOWN_ERROR"
      if (message.startsWith(QUOTA_ERROR)) { later(AFTER_REFUSAL_MS, () => warmUp(keys.slice(at))); return }
      console.error("WARM_UP_FAILED", key, message)
    }
    await new Promise((resolve) => setTimeout(resolve, GAP_MS))
  }
}
