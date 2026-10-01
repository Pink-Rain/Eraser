import {
  builtinCharacterCatalog,
  catalogGroups,
  characterLayout,
  CRITICAL_FAILURE_METRIC,
  CRITICAL_SUCCESS_METRIC,
  type CharacterCatalog,
  type CharacterLayout,
} from "@/lib/character-catalog"
import { characterValueHeaders } from "@/lib/character-sheet-schema"
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
  /** Colonne de la fiche visée (-1 quand la fiche n'est pas connue, dans l'éditeur des objets). */
  valueIndex: number
  /** Pour un seuil critique : la caractéristique ou la compétence d’origine. */
  baseId?: string
  aspect?: ItemModifierAspect
}

export const itemModifierAspectLabels: Record<ItemModifierAspect, string> = { stat: "Valeur", reussite: "Réussite critique", echec: "Échec critique" }

/**
 * Les cibles générales d'origine, par clé de fiche : leurs identifiants sont déjà
 * enregistrés dans les objets et ne changent pas.
 */
const generalTargets: Array<{ id: string; key: string; label: string; kind: "valeur" | "calcul" }> = [
  { id: "vie", key: "Vie totale", label: "Vie", kind: "valeur" },
  { id: "notoriete", key: "Notoriété", label: "Notoriété", kind: "valeur" },
  { id: "moralite", key: "Moralité", label: "Moralité", kind: "valeur" },
  { id: "folie", key: "Folie", label: "Folie", kind: "valeur" },
  { id: "destin", key: "Destin", label: "Destin", kind: "valeur" },
  { id: "degats-physiques", key: "Bonus de dégâts physiques", label: "Bonus de dégâts physiques", kind: "calcul" },
  { id: "degats-magiques", key: "Bonus de dégâts magiques", label: "Bonus de dégâts magiques", kind: "calcul" },
  { id: "armure-physique", key: "Armure physique", label: "Bonus d’armure physique", kind: "calcul" },
  { id: "armure-magique", key: "Armure magique", label: "Bonus d’armure magique", kind: "calcul" },
  { id: "rapidite", key: "Rapidité", label: "Rapidité", kind: "calcul" },
  { id: "echec-critique", key: "Échec critique", label: "Échec critique", kind: "calcul" },
  { id: "reussite-critique", key: "Réussite critique", label: "Réussite critique", kind: "calcul" },
]
const generalTargetIds = new Set(generalTargets.map((target) => target.id))
/** Ce qu'une secondaire à liste (classe sociale, alignement) ne peut pas recevoir : un nombre. */
const listSecondaries = new Set(["Classe sociale", "Alignement"])

export const characteristicModifierTargetId = (characteristic: string) => `carac:${characteristic}`
export const skillModifierTargetId = (skill: string) => `comp:${skill}`
/** « crit-reussite:carac:Force », « crit-echec:comp:Parade »… */
export const criticalModifierTargetId = (baseId: string, aspect: Exclude<ItemModifierAspect, "stat">) => `crit-${aspect}:${baseId}`

function criticalTargets(base: { id: string; label: string; group: string }, valueIndex: (aspect: "reussite" | "echec") => number): ItemModifierTarget[] {
  return (["reussite", "echec"] as const).map((aspect) => ({
    id: criticalModifierTargetId(base.id, aspect),
    label: `${base.label} · ${aspect === "reussite" ? "réussite critique" : "échec critique"}`,
    group: base.group,
    kind: "critique" as const,
    valueIndex: valueIndex(aspect),
    baseId: base.id,
    aspect,
  }))
}

/**
 * Tout ce qu'un objet peut modifier sur une fiche, d'après l'Index des caractéristiques
 * et compétences : les secondaires (« Général »), puis chaque caractéristique principale
 * avec ses seuils critiques et ses compétences. `layout` situe chaque cible dans la fiche.
 */
export function buildItemModifierTargets(catalog: CharacterCatalog, layout?: CharacterLayout): ItemModifierTarget[] {
  const at = (key: string, metric = "") => layout ? layout.index(key, metric) : -1
  const secondaries = catalog.characteristics.filter((item) => item.kind === "secondaire" && !listSecondaries.has(item.key))
  const general: ItemModifierTarget[] = secondaries.map((item) => {
    const known = generalTargets.find((target) => target.key === item.key)
    const builtinName = builtinCharacterCatalog.characteristics.find((candidate) => candidate.key === item.key)?.name
    return known
      ? { id: known.id, label: item.name === builtinName ? known.label : item.name, group: "Général", kind: known.kind, valueIndex: at(item.key) }
      : { id: characteristicModifierTargetId(item.key), label: item.name, group: "Général", kind: "valeur", valueIndex: at(item.key) }
  })
  const groups = catalogGroups(catalog).flatMap((group) => {
    const groupName = group.characteristic?.name ?? "Autres compétences"
    const characteristicTargets = group.characteristic ? (() => {
      const key = group.characteristic.key
      const base = { id: characteristicModifierTargetId(key), label: group.characteristic.name, group: groupName }
      return [
        { ...base, kind: "caracteristique" as const, valueIndex: at(key) },
        ...criticalTargets(base, (aspect) => at(key, aspect === "reussite" ? CRITICAL_SUCCESS_METRIC : CRITICAL_FAILURE_METRIC)),
      ]
    })() : []
    return [
      ...characteristicTargets,
      ...group.skills.flatMap((skill) => {
        const base = { id: skillModifierTargetId(skill.key), label: skill.name, group: groupName }
        return [
          { ...base, kind: "competence" as const, valueIndex: at(skill.key, "Total de stats") },
          ...criticalTargets(base, (aspect) => at(skill.key, aspect === "reussite" ? "Total de réussite critique" : "Total d’échec critique")),
        ]
      }),
    ]
  })
  return [...general, ...groups]
}

/** Les cibles de la liste d'origine, situées dans les colonnes d'origine. */
export const itemModifierTargets: ItemModifierTarget[] = buildItemModifierTargets(builtinCharacterCatalog, characterLayout(characterValueHeaders))

export const itemModifierTargetById = new Map(itemModifierTargets.map((target) => [target.id, target]))

/**
 * Un identifiant de cible bien formé. Une compétence ajoutée à l'index (ou retirée)
 * garde ainsi ses liens : ils ne dépendent pas de la liste chargée.
 */
export function isItemModifierTargetId(id: string) {
  return generalTargetIds.has(id) || /^(?:crit-(?:reussite|echec):)?(?:carac|comp):.+/.test(id)
}

/** La cible choisie dans la liste (caractéristique, compétence…) et l’aspect visé. */
export function splitModifierTarget(id: string): { baseId: string; aspect: ItemModifierAspect } {
  const match = /^crit-(reussite|echec):(.+)$/.exec(id)
  return match ? { baseId: match[2], aspect: match[1] as ItemModifierAspect } : { baseId: id, aspect: "stat" }
}

export function joinModifierTarget(baseId: string, aspect: ItemModifierAspect) {
  if (aspect === "stat" || !baseId) return baseId
  return /^(?:carac|comp):/.test(baseId) ? criticalModifierTargetId(baseId, aspect) : baseId
}

/** Le nom lisible d'une cible, d'après les cibles connues (celles de l'index chargé, sinon celles d'origine). */
export function itemModifierTargetLabel(id: string, targets: Map<string, ItemModifierTarget> = itemModifierTargetById) {
  return targets.get(id)?.label || id.replace(/^(?:crit-(?:reussite|echec):)?(?:carac|comp):/, "")
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
      return target && isItemModifierTargetId(target) ? [{ target, value }] : []
    })
  } catch { return [] }
}

export function serializeItemModifiers(modifiers: ItemModifier[]) {
  const kept = modifiers
    .map((modifier) => ({ target: modifier.target.trim(), value: modifier.value.trim() }))
    .filter((modifier) => modifier.target && isItemModifierTargetId(modifier.target) && hasModifierAmount(modifier.value))
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
