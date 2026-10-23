import { readSharedRecord, sharedStoreAvailable, writeSharedRecord } from "@/lib/shared-store"
import { applySatietyAction, emptySatiety, parseSatiety, type SatietyAction, type SatietyState } from "@/lib/satiety"

/**
 * La barre de rassasiement et les jours passés de chaque personnage (lib/satiety). Gardés
 * dans le serveur partagé, un enregistrement par personnage, comme son historique : rien
 * n'est lu ni écrit dans Google (le quota commun aux joueurs reste aux fiches), et la case
 * JSON de la fiche n'est pas réécrite (un MJ qui fait passer la nuit au groupe ne crée pas
 * de conflit sur la fiche ouverte d'un joueur). Sans serveur partagé, rien n'est gardé.
 */
const scope = "character-satiety"

export function satietyAvailable() {
  return sharedStoreAvailable()
}

/** La barre d'un personnage ; jamais réglée : pleine, sans jour compté. Illisible : `null`. */
export async function readCharacterSatiety(characterId: string): Promise<SatietyState | null> {
  if (!sharedStoreAvailable()) return null
  const record = await readSharedRecord(scope, characterId)
  return record ? parseSatiety(record.value) : emptySatiety()
}

/** Plusieurs barres à la fois (le tableau du groupe) ; une lecture manquée vaut `null`. */
export async function readCharacterSatieties(characterIds: string[]) {
  const entries = await Promise.all([...new Set(characterIds)].map(async (id) => [id, await readCharacterSatiety(id).catch(() => null)] as const))
  return Object.fromEntries(entries) as Record<string, SatietyState | null>
}

// Une écriture à la fois par personnage dans cette installation : une nuit de groupe et un
// clic du joueur rapprochés partent l'un après l'autre, chacun sur la barre relue.
const queues = new Map<string, Promise<unknown>>()

/**
 * Applique l'action sur la barre relue à l'instant (jamais sur la copie de la page) et
 * l'enregistre. Échoue (serveur partagé injoignable, enregistrement illisible) sans rien écrire.
 */
export function updateCharacterSatiety(characterId: string, action: SatietyAction): Promise<SatietyState> {
  if (!sharedStoreAvailable()) return Promise.reject(new Error("SHARED_STORE_UNAVAILABLE"))
  const previous = queues.get(characterId) ?? Promise.resolve()
  const next = previous.catch(() => {}).then(async () => {
    const record = await readSharedRecord(scope, characterId)
    const current = record ? parseSatiety(record.value) : emptySatiety()
    if (!current) throw new Error("SATIETY_UNREADABLE")
    const updated = applySatietyAction(current, action)
    await writeSharedRecord(scope, characterId, JSON.stringify(updated))
    return updated
  })
  queues.set(characterId, next)
  void next.catch(() => {}).finally(() => { if (queues.get(characterId) === next) queues.delete(characterId) })
  return next
}
