/**
 * Les compagnons d'un personnage : des entités que le joueur contrôle comme des
 * personnages secondaires, rangées dans un onglet « Compagnon » de sa fiche.
 *
 * - Un **PNJ** de la campagne est le vrai PNJ du MJ : le compagnon ne garde que son ID,
 *   sa fiche (vie, caractéristiques, sorts, sac à dos) est celle de la feuille « PNJs ».
 * - Une **créature** de l'Index des créatures n'est qu'un modèle (jamais modifié) : le
 *   compagnon en est une copie propre au personnage, avec le nom qu'on lui donne. Son sac à
 *   dos vit dans le classeur d'inventaire, sous `companionInventoryOwnerId`.
 *
 * Les compagnons sont enregistrés dans l'onglet lui-même (colonne « Onglets personnalisés »
 * de la fiche) : retirer l'onglet les retire. Sans dépendance au serveur.
 */
import { characteristicOrder, npcCharacteristicKeys, type CharacteristicName } from "@/lib/characteristics"

/** Les valeurs chiffrées d'une fiche de compagnon, aux noms des champs d'un PNJ. */
export type CompanionStats = {
  currentHp: number
  totalHp: number
  speed: number
  strength: number
  dexterity: number
  intelligence: number
  wisdom: number
  charisma: number
}

/**
 * Les charges qui restent à ses sorts, par nom de sort replié (sans accents ni majuscules) ;
 * un sort absent a toutes ses charges. Gardées par le joueur, dans l'onglet : la fiche d'un
 * PNJ n'est jamais touchée.
 */
export type SpellCharges = Record<string, number>

export type NpcCompanion = {
  id: string
  kind: "npc"
  npcId: string
  /** La campagne du PNJ, au moment où il a été pris comme compagnon. */
  campaignId: string
  spellCharges?: SpellCharges
}

export type CreatureCompanion = CompanionStats & {
  id: string
  kind: "creature"
  /** L'ID de la créature dans l'Index des créatures (vide si elle n'en avait pas). */
  sourceId: string
  /** Son nom dans l'index : « Loup gris ». */
  sourceName: string
  /** Le nom que le joueur lui donne : « Croc ». */
  name: string
  portrait: string
  /** Type et rang de l'index, affichés sous le nom. */
  creatureType: string
  rank: string
  activeSpells: string
  passiveSpells: string
  /** La description de l'index (HTML), en lecture. */
  description: string
  /** Les notes du joueur. */
  notes: string
  spellCharges?: SpellCharges
}

export type Companion = NpcCompanion | CreatureCompanion

/** Une créature proposée dans la recherche, lue dans l'Index des créatures. */
export type CreatureCandidate = Omit<CreatureCompanion, "id" | "kind" | "name" | "notes" | "currentHp">

/** Un PNJ proposé dans la recherche (ceux que le joueur peut voir dans ses campagnes). */
export type NpcCandidate = { id: string; name: string; title: string; occupation: string; portrait: string; campaignId: string; campaignName: string }

export const COMPANION_TEXT_LIMIT = 4000
const statKeys = ["currentHp", "totalHp", "speed", "strength", "dexterity", "intelligence", "wisdom", "charisma"] as const satisfies ReadonlyArray<keyof CompanionStats>

/** « 12 », « 12,5 », « +3 » ; 0 si illisible. */
export function companionNumber(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0
  const parsed = Number.parseFloat(String(value ?? "").replace(",", ".").replace(/\s|\+/g, ""))
  return Number.isFinite(parsed) ? parsed : 0
}

function text(value: unknown, limit = COMPANION_TEXT_LIMIT) {
  return typeof value === "string" ? value.slice(0, limit) : ""
}

/** Les charges restantes enregistrées ; rien (pas même un objet vide) quand aucune n'est dépensée. */
function parseSpellCharges(raw: unknown): { spellCharges?: SpellCharges } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {}
  const entries = Object.entries(raw as Record<string, unknown>).slice(0, 100).flatMap(([key, value]) => {
    const count = Math.trunc(Number(value))
    return key && key.length <= 200 && Number.isFinite(count) ? [[key, Math.max(0, Math.min(5, count))] as const] : []
  })
  return entries.length ? { spellCharges: Object.fromEntries(entries) } : {}
}

/** Les compagnons d'un onglet, tels qu'enregistrés ; une entrée illisible est écartée. */
export function parseCompanions(raw: unknown): Companion[] {
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  return raw.flatMap((entry): Companion[] => {
    if (!entry || typeof entry !== "object") return []
    const value = entry as Record<string, unknown>
    const id = text(value.id, 80)
    if (!id || seen.has(id)) return []
    seen.add(id)
    if (value.kind === "npc") {
      const npcId = text(value.npcId, 120)
      return npcId ? [{ id, kind: "npc", npcId, campaignId: text(value.campaignId, 120), ...parseSpellCharges(value.spellCharges) }] : []
    }
    if (value.kind !== "creature") return []
    const stats = Object.fromEntries(statKeys.map((key) => [key, companionNumber(value[key])])) as CompanionStats
    return [{
      ...stats,
      id, kind: "creature",
      sourceId: text(value.sourceId, 120), sourceName: text(value.sourceName, 200),
      name: text(value.name, 200) || text(value.sourceName, 200) || "Créature",
      portrait: text(value.portrait, 2000), creatureType: text(value.creatureType, 200), rank: text(value.rank, 80),
      activeSpells: text(value.activeSpells), passiveSpells: text(value.passiveSpells),
      description: text(value.description, 20_000), notes: text(value.notes),
      ...parseSpellCharges(value.spellCharges),
    }]
  })
}

/** Le propriétaire du sac à dos d'une créature compagnon, dans le classeur d'inventaire. */
export function companionInventoryOwnerId(characterId: string, companionId: string) {
  return `COMPAGNON:${characterId}:${companionId}`
}

export function isCompanionInventoryOwner(ownerId: string) {
  return ownerId.startsWith("COMPAGNON:")
}

/** Le personnage et le compagnon d'un sac à dos de compagnon ; null pour un autre propriétaire. */
export function companionOfInventoryOwner(ownerId: string) {
  if (!isCompanionInventoryOwner(ownerId)) return null
  const rest = ownerId.slice("COMPAGNON:".length)
  const separator = rest.lastIndexOf(":")
  return separator > 0 ? { characterId: rest.slice(0, separator), companionId: rest.slice(separator + 1) } : null
}

/** Tous les compagnons d'une fiche, d'après sa case « Onglets personnalisés ». */
export function companionsOfTabs(tabsJson: string): Companion[] {
  try {
    const tabs = JSON.parse(tabsJson || "[]") as unknown
    if (!Array.isArray(tabs)) return []
    return tabs.flatMap((tab) => tab && typeof tab === "object" && (tab as { type?: unknown }).type === "compagnon" ? parseCompanions((tab as { companions?: unknown }).companions) : [])
  } catch {
    return []
  }
}

/** Les caractéristiques d'un compagnon, par nom (Force… Vitalité). */
export function companionCharacteristics(stats: CompanionStats): Record<CharacteristicName, number> {
  return Object.fromEntries(characteristicOrder.map((name) => [name, stats[npcCharacteristicKeys[name]]])) as Record<CharacteristicName, number>
}

function fold(value: string) {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase()
}

/**
 * Une créature de l'index d'après sa ligne (colonnes retrouvées par leur nom). Sa Vitalité
 * devient sa vie totale ; sa vie actuelle part pleine.
 */
export function creatureCandidateFromRow(headers: readonly string[], values: readonly string[], html: readonly string[] = []): CreatureCandidate | null {
  const at = (name: string) => headers.findIndex((header) => fold(header) === fold(name))
  const cell = (name: string) => { const index = at(name); return index >= 0 ? String(values[index] ?? "").trim() : "" }
  const rich = (name: string) => { const index = at(name); return index >= 0 ? String(html[index] || values[index] || "").trim() : "" }
  const sourceName = cell("Nom")
  if (!sourceName) return null
  const stat = (name: CharacteristicName) => companionNumber(cell(name))
  return {
    sourceId: cell("ID"), sourceName, portrait: cell("Portrait"),
    creatureType: [cell("Type"), cell("Sous-type")].filter(Boolean).join(" · "), rank: cell("Rang"),
    totalHp: stat("Vitalité"), speed: stat("Vitesse"), strength: stat("Force"), dexterity: stat("Dextérité"),
    intelligence: stat("Intelligence"), wisdom: stat("Sagesse"), charisma: stat("Charisme"),
    activeSpells: cell("Sorts actifs"), passiveSpells: cell("Sorts passifs"), description: rich("Description"),
  }
}

/** Le compagnon créé à partir d'une créature de l'index : vie pleine, nom à donner. */
export function creatureCompanionFrom(candidate: CreatureCandidate, id: string, name = ""): CreatureCompanion {
  return { ...candidate, id, kind: "creature", name: name.trim() || candidate.sourceName, currentHp: candidate.totalHp, notes: "" }
}
