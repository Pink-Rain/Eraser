import { asBackgroundGoogleWork } from "@/lib/google-quota"
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
 */
const START_AFTER_MS = 20_000
let started = false

export function warmUpOnce(role: SiteRole | undefined) {
  if (started || (role !== "admin" && role !== "mj")) return
  started = true
  setTimeout(() => { void warmUp() }, START_AFTER_MS)
}

async function warmUp() {
  const keys: WorldIndexKey[] = [OBJECTS_INDEX_KEY, ...(Object.keys(worldIndexDefinitions) as WorldIndexKey[])]
  for (const key of keys) {
    try {
      await asBackgroundGoogleWork(() => getWorldIndex(key))
    } catch (error) {
      console.error("WARM_UP_FAILED", key, error instanceof Error ? error.message : "UNKNOWN_ERROR")
    }
  }
}
