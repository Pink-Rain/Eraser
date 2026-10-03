import { mergeRule, type ModifierRule, type ValueOperation } from "@/lib/state-change"
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

/**
 * Un lien chiffré vers une caractéristique ou une compétence. `from` : l'attribut, le
 * matériau ou la rune de l'objet qui l'apporte (« attribut:Lourde ») ; absent, il vient de
 * l'objet lui-même. Il part avec ce qui l'apporte.
 */
export type ItemModifier = { value: string; target: string; from?: string }

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
      const from = typeof (entry as ItemModifier).from === "string" ? (entry as ItemModifier).from!.trim().slice(0, 200) : ""
      return target && isItemModifierTargetId(target) ? [{ target, value, ...(from ? { from } : {}) }] : []
    })
  } catch { return [] }
}

export function serializeItemModifiers(modifiers: ItemModifier[]) {
  const kept = modifiers
    .map((modifier) => ({ target: modifier.target.trim(), value: modifier.value.trim() }))
    .filter((modifier) => modifier.target && isItemModifierTargetId(modifier.target) && hasModifierAmount(modifier.value))
  return kept.length ? JSON.stringify(kept) : ""
}

/**
 * Runes, attributs et matériaux posés sur un objet, choisis dans leurs index. Ils sont
 * rangés dans le même JSON que les liens, avec pour cible leur genre : les versions qui
 * ne les connaissent pas les ignorent. Leurs effets seront définis plus tard.
 */
export type ItemAttachmentKind = "rune" | "attribut" | "materiau"
export type ItemAttachment = { kind: ItemAttachmentKind; name: string }
export const itemAttachmentKinds: ItemAttachmentKind[] = ["rune", "attribut", "materiau"]
export const itemAttachmentLabels: Record<ItemAttachmentKind, { singular: string; plural: string }> = {
  rune: { singular: "Rune", plural: "Runes" },
  attribut: { singular: "Attribut", plural: "Attributs" },
  materiau: { singular: "Matériau", plural: "Matériaux" },
}

export function parseItemAttachments(raw: string): ItemAttachment[] {
  if (!raw.trim()) return []
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.flatMap((entry) => {
      const kind = entry && typeof entry === "object" ? (entry as { target?: unknown }).target : null
      const name = entry && typeof entry === "object" && typeof (entry as { value?: unknown }).value === "string" ? (entry as { value: string }).value.trim() : ""
      return typeof kind === "string" && (itemAttachmentKinds as string[]).includes(kind) && name ? [{ kind: kind as ItemAttachmentKind, name: name.slice(0, 160) }] : []
    })
  } catch { return [] }
}

/**
 * Ce qu'un exemplaire change de son objet, pour lui seul : sa compétence, sa valeur, sa
 * distance, ses actions, ses attributs, matériaux et runes. L'Index des objets ne change
 * pas. Rangés dans le même JSON que les liens, avec pour cible « champ:… » : les versions
 * qui ne les connaissent pas les ignorent. Une valeur vide est voulue (plus d'attribut).
 */
export const itemOverrideKeys = ["skill", "value", "distance", "action", "reload", "attributes", "materials", "runes"] as const
export type ItemOverrideKey = (typeof itemOverrideKeys)[number]
export type ItemOverrides = Partial<Record<ItemOverrideKey, string>>
const OVERRIDE_PREFIX = "champ:"
/** Les champs qui tiennent une liste de noms : comparés sans ordre ni casse. */
export const itemOverrideListKeys: ItemOverrideKey[] = ["skill", "attributes", "materials", "runes"]

export function parseItemOverrides(raw: string): ItemOverrides {
  if (!raw.trim()) return {}
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return {}
    const overrides: ItemOverrides = {}
    for (const entry of parsed) {
      const target = entry && typeof entry === "object" ? (entry as { target?: unknown }).target : null
      const value = entry && typeof entry === "object" ? (entry as { value?: unknown }).value : null
      if (typeof target !== "string" || !target.startsWith(OVERRIDE_PREFIX) || typeof value !== "string") continue
      const key = target.slice(OVERRIDE_PREFIX.length) as ItemOverrideKey
      if ((itemOverrideKeys as readonly string[]).includes(key)) overrides[key] = value.trim().slice(0, 400)
    }
    return overrides
  } catch { return {} }
}

const attachmentFields: Record<ItemAttachmentKind, ItemOverrideKey> = { attribut: "attributes", materiau: "materials", rune: "runes" }

function splitList(value: string | undefined) {
  return String(value ?? "").split(/\s*[,;\n]\s*/).map((part) => part.trim()).filter(Boolean)
}

/** « Lourde, Combo » et « combo, lourde » sont la même liste. */
export function sameItemField(key: ItemOverrideKey, left: string | undefined, right: string | undefined) {
  if (!itemOverrideListKeys.includes(key)) return String(left ?? "").trim() === String(right ?? "").trim()
  const set = (value: string | undefined) => [...new Set(splitList(value).map(fold))].sort().join("\u0001")
  return set(left) === set(right)
}

/**
 * Les champs d'un exemplaire tels qu'il les montre : ceux de l'objet, ses anciens ajouts
 * (runes, attributs, matériaux posés avant ce formulaire) à la suite, puis ce qu'il change.
 */
export function effectiveItemFields<T extends Partial<Record<ItemOverrideKey, string>>>(item: T, raw: string): T {
  const overrides = parseItemOverrides(raw)
  const result: T = { ...item }
  for (const attachment of parseItemAttachments(raw)) {
    const key = attachmentFields[attachment.kind]
    if (overrides[key] !== undefined) continue
    const names = splitList(result[key])
    if (!names.some((name) => fold(name) === fold(attachment.name))) (result as Record<string, string>)[key] = [...names, attachment.name].join(", ")
  }
  for (const key of itemOverrideKeys) if (overrides[key] !== undefined) (result as Record<string, string>)[key] = overrides[key]!
  return result
}

/**
 * Les charges restantes de ce qu'un exemplaire porte (colonne Charges d'« Armes -
 * Modificateurs ») : cible « charge:rune:Lame de feu », valeur le nombre restant. Absente,
 * la charge est pleine. Clé : « rune:lame de feu ».
 */
const CHARGE_PREFIX = "charge:"
export type ItemCharges = Record<string, number>

export function itemChargeKey(kind: ItemAttachmentKind, name: string) {
  return `${kind}:${fold(name)}`
}

export function parseItemCharges(raw: string): ItemCharges {
  if (!raw.trim()) return {}
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return {}
    const charges: ItemCharges = {}
    for (const entry of parsed) {
      const target = entry && typeof entry === "object" ? (entry as { target?: unknown }).target : null
      const value = Number.parseInt(String(entry && typeof entry === "object" ? (entry as { value?: unknown }).value : ""), 10)
      const match = typeof target === "string" ? /^charge:(rune|attribut|materiau):(.+)$/.exec(target) : null
      if (match && Number.isFinite(value) && value >= 0) charges[itemChargeKey(match[1] as ItemAttachmentKind, match[2])] = Math.min(value, 99)
    }
    return charges
  } catch { return {} }
}

/** Les charges, telles qu'on les range dans le JSON de l'exemplaire. */
function chargeEntries(charges: ItemCharges) {
  return Object.entries(charges).flatMap(([key, value]) => Number.isFinite(value) && value >= 0 ? [{ target: `${CHARGE_PREFIX}${key}`, value: String(Math.trunc(value)) }] : [])
}

/** Le même exemplaire, avec la charge restante de cet attribut, matériau ou rune changée. */
export function withItemCharge(raw: string, kind: ItemAttachmentKind, name: string, count: number) {
  const charges = { ...parseItemCharges(raw), [itemChargeKey(kind, name)]: Math.max(0, Math.trunc(count)) }
  return serializeItemLinks(parseItemModifiers(raw), parseItemAttachments(raw), parseItemOverrides(raw), charges)
}

/** Garde les charges d'un exemplaire dans des liens réécrits (fenêtre de l'enclume). */
export function keepItemCharges(serialized: string, previous: string) {
  return serializeItemLinks(parseItemModifiers(serialized), parseItemAttachments(serialized), parseItemOverrides(serialized), { ...parseItemCharges(previous), ...parseItemCharges(serialized) })
}

/** Ce qui apporte un lien : « attribut:Lourde ». */
export function modifierSource(kind: ItemAttachmentKind, name: string) {
  return `${kind}:${name.trim()}`
}

/** Le lien vient-il de cet attribut, matériau ou rune ? */
export function isFromSource(modifier: ItemModifier, kind: ItemAttachmentKind, name: string) {
  const match = /^([a-z]+):(.+)$/.exec(modifier.from ?? "")
  return Boolean(match && match[1] === kind && fold(match[2]) === fold(name))
}

/** Les liens chiffrés, les runes/attributs/matériaux et ce que l'exemplaire change, ensemble, sans doublon. */
export function serializeItemLinks(modifiers: ItemModifier[], attachments: ItemAttachment[], overrides: ItemOverrides = {}, charges: ItemCharges = {}) {
  const kept = modifiers
    .map((modifier) => ({ target: modifier.target.trim(), value: modifier.value.trim(), ...(modifier.from?.trim() ? { from: modifier.from.trim() } : {}) }))
    .filter((modifier) => modifier.target && isItemModifierTargetId(modifier.target) && hasModifierAmount(modifier.value))
  const seen = new Set<string>()
  const extras = attachments.flatMap((attachment) => {
    const name = attachment.name.trim()
    const key = `${attachment.kind}:${name.toLocaleLowerCase("fr")}`
    if (!name || seen.has(key) || !itemAttachmentKinds.includes(attachment.kind)) return []
    seen.add(key)
    return [{ target: attachment.kind, value: name }]
  })
  const fields = itemOverrideKeys.flatMap((key) => typeof overrides[key] === "string" ? [{ target: `${OVERRIDE_PREFIX}${key}`, value: overrides[key]!.trim().slice(0, 400) }] : [])
  const all = [...kept, ...extras, ...fields, ...chargeEntries(charges)]
  return all.length ? JSON.stringify(all) : ""
}

export type LinkedModifierItem = {
  slotId: string
  /** « état » : un effet d'un état posé (Index des états), sans case à cocher. */
  source?: "objet" | "état"
  /** La couleur de l'effet d'un état (si « Couleur appliquée à » vise les compétences liées). */
  color?: string
  /** Les FX de l'effet d'un état à dessiner sur la case (« FX appliqué à » : compétences liées). */
  fx?: Array<{ name: string; color: string }>
  /** Ce que l’objet modifie quand ce n’est pas la valeur principale (« Réussite critique »…). */
  tag?: string
  name: string
  equipped: boolean
  containerName: string
  amount: number
  /** L'opération d'un effet d'état en clair (« =100 », « ≥1 ») quand ce n'est pas un ajout. */
  label?: string
}

type ModifierIndex = {
  /** Somme des modificateurs actifs (objet coché) par cible. */
  totals: Map<string, number>
  /** Objets porteurs d’un modificateur, cochés ou non, par cible. */
  items: Map<string, LinkedModifierItem[]>
  /** Ce que les états posés imposent : « = », plancher, plafond. Rien ne reste après eux. */
  rules?: Map<string, ModifierRule>
}

/** La vie actuelle : visée par un effet d'état (« Points de vie actuels ≥1 »), pas par un objet. */
export const CURRENT_LIFE_TARGET_ID = "vie-actuelle"

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
          // Un lien apporté par un attribut, un matériau ou une rune porte son nom.
          ...(modifier.from ? { tag: modifier.from.replace(/^[a-z]+:/, "") } : {}),
          equipped: slot.equipped,
          containerName: container.name,
          amount,
        }])
      }
    }
  }
  return { totals, items }
}

/** Un objet de l'inventaire qui s'utilise avec une caractéristique ou une compétence (sa colonne Compétence). */
export type UsageItem = { slotId: string; name: string; equipped: boolean; icon: string; image: string; type: string; subtype: string }

/**
 * Les objets de l'inventaire rangés par la caractéristique ou la compétence qu'ils
 * utilisent (clé : le nom replié), d'après la Compétence de chaque exemplaire.
 */
export function indexItemUsage(containers: InventoryContainerRecord[]) {
  const usage = new Map<string, UsageItem[]>()
  for (const container of containers) {
    if (container.category === "Bourse") continue
    for (const slot of container.slots) {
      if (!slot.item || slot.quantity <= 0) continue
      const { skill } = effectiveItemFields(slot.item, slot.modifiers)
      for (const name of new Set(splitList(skill).map(fold))) {
        usage.set(name, [...(usage.get(name) ?? []), { slotId: slot.id, name: slot.item.name, equipped: slot.equipped, icon: slot.item.icon ?? "", image: slot.item.image ?? "", type: slot.item.type ?? "", subtype: slot.item.subtype ?? "" }])
      }
    }
  }
  return usage
}

/** Les objets qui utilisent l'une de ces caractéristiques ou compétences (nom ou clé), une fois chacun. */
export function usageItemsFor(usage: Map<string, UsageItem[]>, ...names: string[]) {
  const seen = new Set<string>()
  return names.flatMap((name) => usage.get(fold(name)) ?? []).filter((item) => !seen.has(item.slotId) && Boolean(seen.add(item.slotId)))
}

/**
 * La cible de la fiche d'un nom de l'Index des caractéristiques et compétences (la
 * « Cible » d'un effet d'état) : une secondaire, une caractéristique ou une compétence.
 */
export function modifierTargetIdForName(catalog: CharacterCatalog, name: string) {
  const folded = fold(name)
  if (!folded) return null
  if (["points de vie actuels", "pv actuels", "vie actuelle", "points de vie actuel"].includes(folded)) return CURRENT_LIFE_TARGET_ID
  const characteristic = catalog.characteristics.find((item) => fold(item.name) === folded || fold(item.key) === folded)
  if (characteristic) {
    if (characteristic.kind === "secondaire") return listSecondaries.has(characteristic.key) ? null : generalTargets.find((target) => target.key === characteristic.key)?.id ?? characteristicModifierTargetId(characteristic.key)
    return characteristicModifierTargetId(characteristic.key)
  }
  const skill = catalog.skills.find((item) => fold(item.name) === folded || fold(item.key) === folded)
  return skill ? skillModifierTargetId(skill.key) : null
}

function fold(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[’']/g, "'").replace(/\s+/g, " ").trim().toLocaleLowerCase("fr")
}

/** Ajoute aux objets les changements des états posés : ils comptent toujours (pas de case à cocher). */
export function withStateModifiers(index: ModifierIndex, contributions: Array<{ state: string; level: number; effect: string; target: string; amount: number; operation?: ValueOperation; label?: string; color: string; fx?: Array<{ name: string; color: string }> }>): ModifierIndex {
  if (!contributions.length) return index
  const totals = new Map(index.totals)
  const items = new Map(index.items)
  const rules = new Map(index.rules)
  for (const contribution of contributions) {
    totals.set(contribution.target, (totals.get(contribution.target) || 0) + contribution.amount)
    if (contribution.operation) {
      const rule = mergeRule(rules.get(contribution.target), contribution.operation)
      if (rule) rules.set(contribution.target, rule)
    }
    items.set(contribution.target, [...(items.get(contribution.target) || []), {
      slotId: `etat:${contribution.state}:${contribution.effect}`,
      source: "état",
      color: contribution.color,
      fx: contribution.fx,
      name: `${contribution.state}${contribution.level === 2 ? " (niv. 2)" : ""}`,
      tag: contribution.effect !== contribution.state ? contribution.effect : undefined,
      equipped: true,
      containerName: "États",
      amount: contribution.amount,
      label: contribution.operation ? contribution.label : undefined,
    }])
  }
  return { totals, items, rules }
}

/** Le « = », le plancher et le plafond que les états posés imposent à une cible. */
export function modifierRuleFor(index: ModifierIndex, targetId: string) {
  return index.rules?.get(targetId)
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
