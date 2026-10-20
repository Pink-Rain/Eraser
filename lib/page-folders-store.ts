/**
 * Où vit le rangement des pages en dossiers (lib/page-folders.ts) : sur le serveur partagé
 * d'Eraser, portée « custom-page-folders », une seule entrée « rangement » pour toute la table
 * (en morceaux si elle grandit) — jamais dans Google Sheets.
 *
 * L'explorateur des pages le lit frais ; la coque de chaque page (un dossier placé dans le menu)
 * prend la copie en mémoire (`knownPageFolders`) sans jamais attendre le serveur partagé, relue
 * en arrière-plan au plus toutes les soixante secondes, comme le menu (lib/app-menu-store.ts).
 * Chaque enregistrement relit le rangement et y refait les opérations demandées : deux admins
 * qui rangent en même temps gardent chacun leur geste.
 */
import { withAsyncLock } from "@/lib/async-lock"
import { PageStoreError, readChunked, writeChunked } from "@/lib/custom-pages-store"
import { applyFolderOps, cleanPageFolders, emptyFolders, type FolderOp, type PageFolders } from "@/lib/page-folders"
import { sharedStoreAvailable } from "@/lib/shared-store"

export const FOLDERS_SCOPE = "custom-page-folders"
const KEY = "rangement"
const REFRESH_EVERY = 60_000

let known: PageFolders | undefined
let refreshDueAt = 0
let refreshing: Promise<unknown> | null = null
let writes = 0

function remember(state: PageFolders) {
  known = state
  refreshDueAt = Date.now() + REFRESH_EVERY
}

/** Le rangement, lu sur le serveur partagé (vide sans serveur partagé ou jamais enregistré). */
export async function readPageFolders(): Promise<PageFolders> {
  if (!sharedStoreAvailable()) return emptyFolders()
  const stamp = writes
  const value = await readChunked(FOLDERS_SCOPE, KEY)
  const state = value ? cleanPageFolders(value) : emptyFolders()
  if (stamp === writes) remember(state)
  return state
}

/**
 * Le rangement connu tout de suite, sans attente (vide tant qu'il n'a jamais été lu) ; relu en
 * arrière-plan quand la copie date de plus d'une minute.
 */
export function knownPageFolders(): PageFolders {
  if (sharedStoreAvailable() && !refreshing && Date.now() >= refreshDueAt) {
    refreshDueAt = Date.now() + REFRESH_EVERY
    refreshing = readPageFolders().catch(() => null).finally(() => { refreshing = null })
  }
  return known ?? emptyFolders()
}

/** Oublie la copie en mémoire (tests). */
export function forgetPageFolders() {
  known = undefined
  refreshDueAt = 0
  refreshing = null
}

/** Refait `ops` sur le rangement relu à l'instant, puis l'enregistre ; rend le rangement enregistré. */
export function updatePageFolders(ops: FolderOp[], by: string) {
  if (!sharedStoreAvailable()) return Promise.reject(new PageStoreError("PAGE_FOLDERS_UNAVAILABLE", "Les dossiers se gardent sur le serveur partagé d’Eraser, qui n’est pas configuré ici.", 503))
  return withAsyncLock("page-folders", async () => {
    const value = await readChunked(FOLDERS_SCOPE, KEY)
    const current = value ? cleanPageFolders(value) : emptyFolders()
    const next: PageFolders = { ...applyFolderOps(current, ops), updatedAt: new Date().toISOString(), updatedBy: by }
    await writeChunked(FOLDERS_SCOPE, KEY, JSON.stringify(next))
    writes += 1
    remember(next)
    return next
  })
}

