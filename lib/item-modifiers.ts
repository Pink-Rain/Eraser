import { characterCriticalValueIndex, characterSkillGroups, characterSkillValueIndex, characterSkills } from "@/lib/character-sheet-schema"
import type { InventoryContainerRecord } from "@/lib/inventory-schema"

export type ItemModifier = { value: string; target: string }

export type ItemModifierTargetKind = "valeur" | "calcul" | "caracteristique" | "competence" | "critique"

/** Ce qu’un lien vise sur une caractéristique ou une compétence : sa valeur ou l’un de ses seuils critiques. */
export type ItemModifierAspect = "stat" | "reussite" | "echec"

export type ItemModifierTarget = {
  id: string
  label: string
  group: string
  kind: ItemModifierTargetKind
  valueIndex: number
  skillIndex: number
  /** Pour un seuil critique : la caractéristique ou la compétence d’origine. */
  baseId?: string
  aspect?: ItemModifierAspect
}

export const itemModifierAspectLabels: Record<ItemModifierAspect, string> = { stat: "Valeur", reussite: "Réussite critique", echec: "Échec critique" }

const directTargets: Array<{ id: string; label: string; valueIndex: number }> = [
  { id: "vie", label: "Vie", valueIndex: 10 },
  { id: "notoriete", label: "Notoriété", valueIndex: 12 },
  { id: "moralite", label: "Moralité", valueIndex: 14 },
  { id: "folie", label: "Folie", valueIndex: 15 },
  { id: "destin", label: "Destin", valueIndex: 16 },
]

const calculatedTargets: Array<{ id: string; label: string; valueIndex: number }> = [
  { id: "degats-physiques", label: "Bonus de dégâts physiques", valueIndex: 17 },
  { id: "degats-magiques", label: "Bonus de dégâts magiques", valueIndex: 18 },
  { id: "armure-physique", label: "Bonus d’armure physique", valueIndex: 19 },
  { id: "armure-magique", label: "Bonus d’armure magique", valueIndex: 20 },
  { id: "rapidite", label: "Rapidité", valueIndex: 21 },
  { id: "echec-critique", label: "Échec critique", valueIndex: 22 },
  { id: "reussite-critique", label: "Réussite critique", valueIndex: 23 },
]

export const characteristicModifierTargetId = (characteristic: string) => `carac:${characteristic}`
export const skillModifierTargetId = (skill: string) => `comp:${skill}`
/** « crit-reussite:carac:Force », « crit-echec:comp:Parade »… */
export const criticalModifierTargetId = (baseId: string, aspect: Exclude<ItemModifierAspect, "stat">) => `crit-${aspect}:${baseId}`

function criticalTargets(base: { id: string; label: string; group: string }, valueIndex: (aspect: "reussite" | "echec") => number, skillIndex: number): ItemModifierTarget[] {
  return (["reussite", "echec"] as const).map((aspect) => ({
    id: criticalModifierTargetId(base.id, aspect),
    label: `${base.label} · ${aspect === "reussite" ? "réussite critique" : "échec critique"}`,
    group: base.group,
    kind: "critique" as const,
    valueIndex: valueIndex(aspect),
    skillIndex,
    baseId: base.id,
    aspect,
  }))
}

export const itemModifierTargets: ItemModifierTarget[] = [
  ...directTargets.map((target) => ({ ...target, group: "Général", kind: "valeur" as const, skillIndex: -1 })),
  ...calculatedTargets.map((target) => ({ ...target, group: "Général", kind: "calcul" as const, skillIndex: -1 })),
  ...characterSkillGroups.flatMap((group, groupIndex) => {
    const characteristic = { id: characteristicModifierTargetId(group.characteristic), label: group.characteristic, group: group.characteristic }
    return [
      { ...characteristic, kind: "caracteristique" as const, valueIndex: group.characteristicIndex, skillIndex: -1 },
      ...criticalTargets(characteristic, (aspect) => characterCriticalValueIndex(groupIndex, aspect === "reussite" ? "success" : "failure"), -1),
      ...group.skills.flatMap((skill) => {
        const skillIndex = characterSkills.findIndex((candidate) => candidate.name === skill)
        const base = { id: skillModifierTargetId(skill), label: skill, group: group.characteristic }
        return [
          { ...base, kind: "competence" as const, valueIndex: characterSkillValueIndex(skillIndex, 2), skillIndex },
          ...criticalTargets(base, (aspect) => characterSkillValueIndex(skillIndex, aspect === "reussite" ? 5 : 8), skillIndex),
        ]
      }),
    ]
  }),
]

export const itemModifierTargetById = new Map(itemModifierTargets.map((target) => [target.id, target]))

/** La cible choisie dans la liste (caractéristique, compétence…) et l’aspect visé. */
export function splitModifierTarget(id: string): { baseId: string; aspect: ItemModifierAspect } {
  const target = itemModifierTargetById.get(id)
  return target?.baseId && target.aspect ? { baseId: target.baseId, aspect: target.aspect } : { baseId: id, aspect: "stat" }
}

export function joinModifierTarget(baseId: string, aspect: ItemModifierAspect) {
  if (aspect === "stat" || !baseId) return baseId
  const id = criticalModifierTargetId(baseId, aspect)
  return itemModifierTargetById.has(id) ? id : baseId
}

export function itemModifierTargetLabel(id: string) {
  return itemModifierTargetById.get(id)?.label || id
}

/** Accepte « 3 », « +3 », « -2 », « 1,5 » ou « 1.5 ». Retourne 0 si la valeur est vide ou illisible. */
export function parseModifierAmount(value: string) {
  const parsed = Number.parseFloat(String(value ?? "").replace(",", ".").replace(/\s|\+/g, ""))
  return Number.isFinite(parsed) ? parsed : 0
}

/**
 * « 0 » est un modificateur volontaire et valable : on distingue une valeur
 * chiffrée, même nulle, d’une case vide ou illisible.
 */
export function hasModifierAmount(value: string) {
  return Number.isFinite(Number.parseFloat(String(value ?? "").replace(",", ".").replace(/\s|\+/g, "")))
}

export function formatModifierAmount(amount: number) {
  if (!Number.isFinite(amount) || amount === 0) return "0"
  const rounded = Math.round(amount * 100) / 100
  return `${rounded > 0 ? "+" : ""}${rounded}`
}

export function parseItemModifiers(raw: string): ItemModifier[] {
  if (!raw.trim()) return []
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.flatMap((entry) => {
      if (!entry || typeof entry !== "object") return []
      const target = typeof (entry as ItemModifier).target === "string" ? (entry as ItemModifier).target.trim() : ""
      const value = typeof (entry as ItemModifier).value === "string" ? (entry as ItemModifier).value.trim() : String((entry as { value?: unknown }).value ?? "").trim()
      return target && itemModifierTargetById.has(target) ? [{ target, value }] : []
    })
  } catch { return [] }
}

export function serializeItemModifiers(modifiers: ItemModifier[]) {
  const kept = modifiers
    .map((modifier) => ({ target: modifier.target.trim(), value: modifier.value.trim() }))
    .filter((modifier) => modifier.target && itemModifierTargetById.has(modifier.target) && hasModifierAmount(modifier.value))
  return kept.length ? JSON.stringify(kept) : ""
}

export type LinkedModifierItem = {
  slotId: string
  /** Ce que l’objet modifie quand ce n’est pas la valeur principale (« Réussite critique »…). */
  tag?: string
  name: string
  equipped: boolean
  containerName: string
  amount: number
}

type ModifierIndex = {
  /** Somme des modificateurs actifs (objet coché) par cible. */
  totals: Map<string, number>
  /** Objets porteurs d’un modificateur, cochés ou non, par cible. */
  items: Map<string, LinkedModifierItem[]>
}

export function indexInventoryModifiers(containers: InventoryContainerRecord[]): ModifierIndex {
  const totals = new Map<string, number>()
  const items = new Map<string, LinkedModifierItem[]>()
  for (const container of containers) {
    if (container.category === "Bourse") continue
    for (const slot of container.slots) {
      if (!slot.item || slot.quantity <= 0) continue
      for (const modifier of parseItemModifiers(slot.modifiers)) {
        if (!hasModifierAmount(modifier.value)) continue
        const amount = parseModifierAmount(modifier.value)
        if (slot.equipped) totals.set(modifier.target, (totals.get(modifier.target) || 0) + amount)
        items.set(modifier.target, [...(items.get(modifier.target) || []), {
          slotId: slot.id,
          name: slot.item.name,
          equipped: slot.equipped,
          containerName: container.name,
          amount,
        }])
      }
    }
  }
  return { totals, items }
}

export function modifierTotalFor(index: ModifierIndex, targetId: string) {
  return index.totals.get(targetId) || 0
}

export function linkedItemsFor(index: ModifierIndex, targetId: string) {
  return index.items.get(targetId) || []
}

/** Reprend la formule de la feuille : le total d’une compétence reste borné entre 10 et 90. */
export function cappedSkillTotal(value: number) {
  return Math.max(10, Math.min(90, value))
}
