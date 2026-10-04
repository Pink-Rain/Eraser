import { parseSearchDraws, type SearchDraw } from "@/lib/search-draws"
import { readSharedRecord, sharedStoreAvailable, writeSharedRecord } from "@/lib/shared-store"

/**
 * Les tirages de Fouille d'une campagne. Ils vivent dans le serveur partagé, comme
 * d'autres petits états communs : le MJ les retrouve d'une installation à l'autre.
 * Sans serveur partagé (développement), la page les garde dans le navigateur.
 */
const scope = "search-draws"

export function searchDrawsShared() {
  return sharedStoreAvailable()
}

/**
 * `null` : pas de serveur partagé, le navigateur prend le relais. Une lecture qui échoue
 * n'est pas « aucun tirage » : la page l'aurait crue vide, et son premier enregistrement
 * aurait remplacé tous les tirages gardés.
 */
export async function readSearchDraws(campaignId: string): Promise<SearchDraw[] | null> {
  if (!sharedStoreAvailable()) return null
  const record = await readSharedRecord(scope, campaignId)
  if (!record) return []
  try {
    return parseSearchDraws(JSON.parse(record.value))
  } catch {
    throw new Error("SEARCH_DRAWS_UNREADABLE")
  }
}

export async function writeSearchDraws(campaignId: string, value: unknown) {
  if (!sharedStoreAvailable()) return null
  const draws = parseSearchDraws(value)
  // Le serveur partagé refuse plus de 20 000 caractères : on retire d'abord les plus
  // anciens tirages non épinglés, puis seulement les épinglés, plutôt que de tout perdre.
  let serialized = JSON.stringify(draws)
  while (serialized.length > 19_000 && draws.length) {
    const oldest = draws.findLastIndex((draw) => !draw.pinned)
    draws.splice(oldest >= 0 ? oldest : draws.length - 1, 1)
    serialized = JSON.stringify(draws)
  }
  await writeSharedRecord(scope, campaignId, serialized)
  return draws.length
}
