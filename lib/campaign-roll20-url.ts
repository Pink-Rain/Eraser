import { cleanRoll20Url } from "@/lib/roll20-url"
import { deleteSharedRecord, readSharedRecord, sharedStoreAvailable, writeSharedRecord } from "@/lib/shared-store"

/**
 * Le lien de la partie Roll20 d'une campagne (« https://app.roll20.net/join/… »), collé par
 * le MJ et montré à toute la table sur le tableau de bord de la campagne.
 *
 * Gardé sur le serveur partagé (portée « campaign-roll20-url », une entrée par campagne) :
 * chaque installation voit le même lien, et rien ne change dans Google Sheets. Sans serveur
 * partagé (développement), il n'y a pas de lien.
 */
const scope = "campaign-roll20-url"
const CACHE_MS = 15_000
const cache = new Map<string, { at: number; promise: Promise<string> }>()

export function campaignRoll20UrlAvailable() {
  return sharedStoreAvailable()
}

/** Le lien de la partie Roll20 de cette campagne ; "" s'il n'y en a pas (ou serveur injoignable). */
export function campaignRoll20Url(campaignId: string): Promise<string> {
  if (!sharedStoreAvailable()) return Promise.resolve("")
  const known = cache.get(campaignId)
  if (known && Date.now() - known.at < CACHE_MS) return known.promise
  const promise = readSharedRecord(scope, campaignId).then((record) => {
    try { return cleanRoll20Url(record?.value) } catch { return "" }
  }).catch((error) => {
    // Le serveur partagé injoignable : la page s'affiche, sans le bouton.
    console.error("CAMPAIGN_ROLL20_URL_READ_FAILED", error instanceof Error ? error.message : "UNKNOWN_ERROR")
    cache.delete(campaignId)
    return ""
  })
  cache.set(campaignId, { at: Date.now(), promise })
  return promise
}

/** Enregistre (ou efface, avec "") le lien de la partie Roll20 ; rend le lien gardé. */
export async function setCampaignRoll20Url(campaignId: string, value: unknown) {
  if (!sharedStoreAvailable()) throw new Error("SHARED_STORE_UNAVAILABLE")
  const url = cleanRoll20Url(value)
  if (url) await writeSharedRecord(scope, campaignId, url)
  else await deleteSharedRecord(scope, campaignId)
  cache.set(campaignId, { at: Date.now(), promise: Promise.resolve(url) })
  return url
}
