import { readSharedRecord, sharedStoreAvailable, writeSharedRecord } from "@/lib/shared-store"

/**
 * Les personnages joueurs qu'un MJ cache, exceptionnellement, aux autres joueurs de sa
 * campagne (tableau de bord, journal, relations, transferts d'objets). Le personnage reste
 * dans la campagne ; son joueur le voit toujours, le MJ et les administrateurs aussi.
 *
 * Gardé sur le serveur partagé (portée « campaign-hidden-characters », une entrée par
 * campagne) : chaque installation voit le même choix. Sans serveur partagé (développement),
 * personne n'est caché.
 */
const scope = "campaign-hidden-characters"
const CACHE_MS = 15_000
const cache = new Map<string, { at: number; promise: Promise<string[]> }>()

function parse(value: string | undefined) {
  try {
    const parsed = JSON.parse(value || "[]") as unknown
    return Array.isArray(parsed) ? [...new Set(parsed.filter((item): item is string => typeof item === "string" && item.length > 0))] : []
  } catch {
    return []
  }
}

/** Les identifiants des personnages cachés aux autres joueurs dans cette campagne. */
export function hiddenCampaignCharacters(campaignId: string): Promise<string[]> {
  if (!sharedStoreAvailable()) return Promise.resolve([])
  const known = cache.get(campaignId)
  if (known && Date.now() - known.at < CACHE_MS) return known.promise
  const promise = readSharedRecord(scope, campaignId).then((record) => parse(record?.value)).catch((error) => {
    // Le serveur partagé injoignable : la page s'affiche, sans rien cacher de plus.
    console.error("CAMPAIGN_HIDDEN_CHARACTERS_READ_FAILED", error instanceof Error ? error.message : "UNKNOWN_ERROR")
    cache.delete(campaignId)
    return [] as string[]
  })
  cache.set(campaignId, { at: Date.now(), promise })
  return promise
}

export function campaignHidingAvailable() {
  return sharedStoreAvailable()
}

/** Cache ou montre un personnage aux autres joueurs ; rend la liste à jour. */
export async function setCampaignCharacterHidden(campaignId: string, characterId: string, hidden: boolean) {
  if (!sharedStoreAvailable()) throw new Error("SHARED_STORE_UNAVAILABLE")
  // Relu à l'instant (pas la copie de 15 s) : un autre choix fait ailleurs n'est pas perdu.
  const current = parse((await readSharedRecord(scope, campaignId))?.value)
  const next = hidden ? [...new Set([...current, characterId])] : current.filter((id) => id !== characterId)
  await writeSharedRecord(scope, campaignId, JSON.stringify(next))
  cache.set(campaignId, { at: Date.now(), promise: Promise.resolve(next) })
  return next
}

/**
 * Ce qu'un lecteur voit des personnages d'une campagne : tout pour le MJ et les administrateurs ;
 * pour un joueur, tout sauf les personnages cachés des autres (les siens restent visibles).
 */
export function visibleCampaignCharacters<T extends { id: string }>(characters: T[], hidden: string[], viewer: { manager: boolean; ownIds: Iterable<string> }) {
  if (viewer.manager || !hidden.length) return characters
  const own = new Set(viewer.ownIds)
  const veiled = new Set(hidden)
  return characters.filter((character) => own.has(character.id) || !veiled.has(character.id))
}
