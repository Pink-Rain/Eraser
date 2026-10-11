import { readSharedRecord, sharedStoreAvailable, writeSharedRecord } from "@/lib/shared-store"

/**
 * Ce qui arrive à un personnage au fil des parties, que la fiche ne garde pas : ses chutes
 * (sa vie tombe à 0 ou moins), ses retours (elle repasse au-dessus) et les objets qui arrivent
 * dans son inventaire (ajoutés, achetés, créés ; pas les échanges entre personnages). Gardé
 * dans le serveur partagé, un enregistrement par personnage : rien n'est lu ni écrit dans
 * Google. Sans serveur partagé (développement), rien n'est noté.
 */
const scope = "character-history"

export type CharacterHistoryEvent =
  | { kind: "chute" | "retour"; at: string }
  | { kind: "objet"; at: string; name: string; rarity?: string }

export type CharacterHistory = { since: string; events: CharacterHistoryEvent[] }

/** Le serveur partagé refuse plus de 20 000 caractères : les plus anciens objets partent d'abord. */
const MAX_LENGTH = 19_000

function parseHistory(value: string): CharacterHistory | null {
  try {
    const parsed = JSON.parse(value) as Partial<CharacterHistory>
    const events = Array.isArray(parsed.events) ? parsed.events.flatMap((event): CharacterHistoryEvent[] => {
      if (!event || typeof event !== "object" || typeof event.at !== "string") return []
      if (event.kind === "chute" || event.kind === "retour") return [{ kind: event.kind, at: event.at }]
      if (event.kind === "objet" && typeof event.name === "string") return [{ kind: "objet", at: event.at, name: event.name.slice(0, 120), ...(typeof event.rarity === "string" && event.rarity ? { rarity: event.rarity.slice(0, 40) } : {}) }]
      return []
    }) : []
    return { since: typeof parsed.since === "string" ? parsed.since : events[0]?.at ?? "", events }
  } catch {
    return null
  }
}

/** L'historique d'un personnage ; `null` : pas de serveur partagé, ou lecture impossible. */
export async function readCharacterHistory(characterId: string): Promise<CharacterHistory | null> {
  if (!sharedStoreAvailable()) return null
  const record = await readSharedRecord(scope, characterId)
  if (!record) return { since: "", events: [] }
  return parseHistory(record.value)
}

/** Plusieurs historiques à la fois (le tableau du groupe d'une campagne). */
export async function readCharacterHistories(characterIds: string[]) {
  const entries = await Promise.all([...new Set(characterIds)].map(async (id) => [id, await readCharacterHistory(id).catch(() => null)] as const))
  return Object.fromEntries(entries) as Record<string, CharacterHistory | null>
}

// Une note à la fois par personnage dans cette installation : deux écritures rapprochées
// (un objet ajouté deux fois) ne se remplacent pas l'une l'autre.
const queues = new Map<string, Promise<unknown>>()

/**
 * Note un événement. Ne fait jamais échouer ce qui l'a provoqué : une note perdue est
 * écrite dans le journal des erreurs, l'écriture de la fiche ou de l'inventaire reste faite.
 */
export function noteCharacterEvent(characterId: string, event: CharacterHistoryEvent) {
  if (!characterId || !sharedStoreAvailable()) return Promise.resolve()
  const previous = queues.get(characterId) ?? Promise.resolve()
  const next = previous.then(async () => {
    const record = await readSharedRecord(scope, characterId)
    const current = record ? parseHistory(record.value) : { since: event.at, events: [] }
    // Illisible : on n'écrase pas ce qui est gardé.
    if (!current) throw new Error("CHARACTER_HISTORY_UNREADABLE")
    const history: CharacterHistory = { since: current.since || event.at, events: [...current.events, event] }
    let serialized = JSON.stringify(history)
    while (serialized.length > MAX_LENGTH && history.events.length) {
      const oldestItem = history.events.findIndex((candidate) => candidate.kind === "objet")
      history.events.splice(oldestItem >= 0 ? oldestItem : 0, 1)
      serialized = JSON.stringify(history)
    }
    await writeSharedRecord(scope, characterId, serialized)
  }).catch((error) => {
    console.error("CHARACTER_HISTORY_WRITE_FAILED", characterId, error instanceof Error ? error.message : "UNKNOWN_ERROR")
  })
  queues.set(characterId, next)
  void next.finally(() => { if (queues.get(characterId) === next) queues.delete(characterId) })
  return next
}

/** Les compteurs d'un historique : chutes, retours, objets (et ceux rares ou mieux). */
export function historyCounts(history: CharacterHistory | null, rareRarities: readonly string[] = []) {
  if (!history) return null
  const rare = new Set(rareRarities.map((value) => value.toLocaleLowerCase("fr")))
  const items = history.events.filter((event): event is Extract<CharacterHistoryEvent, { kind: "objet" }> => event.kind === "objet")
  return {
    since: history.since,
    falls: history.events.filter((event) => event.kind === "chute").length,
    returns: history.events.filter((event) => event.kind === "retour").length,
    items: items.length,
    rareItems: items.filter((event) => event.rarity && rare.has(event.rarity.toLocaleLowerCase("fr"))).length,
    lastItems: items.slice(-8).reverse().map((event) => ({ name: event.name, rarity: event.rarity ?? "", at: event.at })),
  }
}
