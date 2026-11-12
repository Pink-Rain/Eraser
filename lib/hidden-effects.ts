/**
 * Les effets cachés de l'inventaire. Un admin choisit des TYPES d'items (« Ingrédient, Alchimie »,
 * Administration › Effets cachés) dont l'effet reste « Effet verrouillé » tant que le personnage
 * ne l'a pas débloqué ; chaque personnage garde la liste des items (par nom replié) dont il connaît
 * l'effet. Rien de choisi : rien n'est caché. Les deux vivent sur le serveur partagé
 * (lib/hidden-effects-store.ts). Module commun à la page et au serveur.
 */

/** Combien de types un admin peut cacher, et combien d'items un personnage peut débloquer. */
export const HIDDEN_TYPES_MAX = 60
export const UNLOCKED_EFFECTS_MAX = 600
const NAME_MAX = 160

/** Le nom replié d'un item ou d'un type : sans accents, sans casse, espaces simples. */
export function foldEffectName(value: string) {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[’']/g, "'").replace(/\s+/g, " ").trim().toLocaleLowerCase("fr")
}

/** Une liste de noms (types ou items), sans vide ni doublon (comparés repliés), bornée. */
export function cleanEffectNames(value: unknown, max: number): string[] {
  const raw = Array.isArray(value) ? value : typeof value === "string" ? value.split(/\s*[,;\n|]\s*/) : []
  const names: string[] = []
  const seen = new Set<string>()
  for (const entry of raw) {
    if (typeof entry !== "string") continue
    const name = entry.replace(/\s+/g, " ").trim().slice(0, NAME_MAX)
    const key = foldEffectName(name)
    if (!key || seen.has(key)) continue
    seen.add(key)
    names.push(name)
    if (names.length >= max) break
  }
  return names
}

/** Ce que la page sait des effets d'un personnage : les types cachés et les items débloqués (repliés). */
export type CharacterEffects = { hiddenTypes: string[]; unlocked: string[] }

/** L'effet d'un item de ce type est-il caché à ce personnage ? */
export function isEffectHidden(itemName: string, itemType: string | undefined, effects: CharacterEffects | null | undefined) {
  if (!effects?.hiddenTypes.length || !itemType?.trim()) return false
  const type = foldEffectName(itemType)
  if (!effects.hiddenTypes.some((hidden) => foldEffectName(hidden) === type)) return false
  const name = foldEffectName(itemName)
  return !effects.unlocked.includes(name)
}

/** Le type d'item est-il l'un des types cachés (débloqué ou non) ? */
export function isHiddenEffectType(itemType: string | undefined, effects: CharacterEffects | null | undefined) {
  if (!effects?.hiddenTypes.length || !itemType?.trim()) return false
  const type = foldEffectName(itemType)
  return effects.hiddenTypes.some((hidden) => foldEffectName(hidden) === type)
}

/** La liste des items débloqués après avoir débloqué (ou reverrouillé) celui-ci. */
export function withUnlockedEffect(unlocked: string[], item: string, value: boolean) {
  const key = foldEffectName(item)
  if (!key) return unlocked
  const others = unlocked.filter((name) => name !== key)
  return value ? [...others, key].slice(-UNLOCKED_EFFECTS_MAX) : others
}
