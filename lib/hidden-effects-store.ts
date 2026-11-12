/**
 * Où vivent les effets cachés (lib/hidden-effects.ts) : sur le serveur partagé de l'application
 * (« eraser-accounts », `shared_records`), comme l'affichage des items et la barre de
 * rassasiement. Rien n'est lu ni écrit dans Google Sheets.
 *
 * - portée « item-effects », clé « hidden-types » : `{ types }`, les types d'items dont l'effet
 *   est caché (réglé par un admin ; absente : rien de caché). Lue par `sharedSnapshot`.
 * - portée « character-effects », une clé par personnage : `{ unlocked }`, les noms repliés des
 *   items dont il a débloqué l'effet.
 */
import { cleanEffectNames, foldEffectName, HIDDEN_TYPES_MAX, UNLOCKED_EFFECTS_MAX, withUnlockedEffect, type CharacterEffects } from "@/lib/hidden-effects"
import { readSharedRecord, sharedStoreAvailable, writeSharedRecord } from "@/lib/shared-store"
import { sharedSnapshot } from "@/lib/shared-snapshot"

const SETTINGS_SCOPE = "item-effects"
const HIDDEN_TYPES_KEY = "hidden-types"
const CHARACTER_SCOPE = "character-effects"

function parseTypes(value: string) {
  try {
    const parsed = JSON.parse(value) as { types?: unknown }
    return cleanEffectNames(parsed?.types, HIDDEN_TYPES_MAX)
  } catch { return [] }
}

function parseUnlocked(value: string): string[] | null {
  try {
    const parsed = JSON.parse(value) as { unlocked?: unknown }
    if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.unlocked)) return null
    return [...new Set(parsed.unlocked.filter((name): name is string => typeof name === "string").map(foldEffectName).filter(Boolean))].slice(0, UNLOCKED_EFFECTS_MAX)
  } catch { return null }
}

// Servie tout de suite, relue derrière passé 30 s (lib/shared-snapshot.ts).
const hiddenTypesSnapshot = sharedSnapshot(async () => {
  if (!sharedStoreAvailable()) return [] as string[]
  const record = await readSharedRecord(SETTINGS_SCOPE, HIDDEN_TYPES_KEY)
  return record ? parseTypes(record.value) : []
})

export function hiddenEffectsAvailable() {
  return sharedStoreAvailable()
}

/** Les types d'items dont l'effet est caché ; aucun sans serveur partagé. */
export async function readHiddenEffectTypes(): Promise<string[]> {
  return hiddenTypesSnapshot.read()
}

/** Enregistre les types cachés (un admin) ; une liste vide ne cache plus rien. */
export async function saveHiddenEffectTypes(types: unknown): Promise<string[]> {
  if (!sharedStoreAvailable()) throw new Error("ITEM_EFFECTS_UNAVAILABLE")
  const clean = cleanEffectNames(types, HIDDEN_TYPES_MAX)
  await writeSharedRecord(SETTINGS_SCOPE, HIDDEN_TYPES_KEY, JSON.stringify({ types: clean }))
  return hiddenTypesSnapshot.read(true)
}

/** Les items dont ce personnage a débloqué l'effet (noms repliés). Illisible : on le dit. */
export async function readUnlockedEffects(characterId: string): Promise<string[]> {
  if (!sharedStoreAvailable()) return []
  const record = await readSharedRecord(CHARACTER_SCOPE, characterId)
  if (!record) return []
  const unlocked = parseUnlocked(record.value)
  if (!unlocked) throw new Error("ITEM_EFFECTS_UNREADABLE")
  return unlocked
}

export async function readCharacterEffects(characterId: string): Promise<CharacterEffects> {
  const [hiddenTypes, unlocked] = await Promise.all([readHiddenEffectTypes(), readUnlockedEffects(characterId)])
  return { hiddenTypes, unlocked }
}

// Une écriture à la fois par personnage dans cette installation, chacune sur la liste relue.
const queues = new Map<string, Promise<unknown>>()

/** Débloque (ou reverrouille) l'effet d'un item pour ce personnage, sur la liste relue à l'instant. */
export function setUnlockedEffect(characterId: string, item: string, unlocked: boolean): Promise<string[]> {
  if (!sharedStoreAvailable()) return Promise.reject(new Error("ITEM_EFFECTS_UNAVAILABLE"))
  const key = foldEffectName(item)
  if (!key || key.length > 160) return Promise.reject(new Error("ITEM_EFFECTS_INVALID"))
  const previous = queues.get(characterId) ?? Promise.resolve()
  const next = previous.catch(() => {}).then(async () => {
    const current = await readUnlockedEffects(characterId)
    if (current.includes(key) === unlocked) return current
    if (unlocked && current.length >= UNLOCKED_EFFECTS_MAX) throw new Error("ITEM_EFFECTS_FULL")
    const updated = withUnlockedEffect(current, key, unlocked)
    await writeSharedRecord(CHARACTER_SCOPE, characterId, JSON.stringify({ unlocked: updated }))
    return updated
  })
  queues.set(characterId, next)
  void next.catch(() => {}).finally(() => { if (queues.get(characterId) === next) queues.delete(characterId) })
  return next
}
