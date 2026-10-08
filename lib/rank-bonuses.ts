/**
 * Les bonus de rang, communs à toutes les classes : une ligne par rang (« Rang 1 »,
 * « Rang 2 »… sans limite, les rangs peuvent dépasser 20), puis des colonnes au rôle fixe,
 * comme les index des états ou des modificateurs d'armes :
 *
 * - « Cible 1 » à « Cible 4 » : une caractéristique ou une compétence de la fiche, ou
 *   « Caractéristique » (au choix du joueur, à répartir entre les caractéristiques
 *   principales) ou « Déplacement » (l'action de déplacement gratuite) ;
 * - « Valeur 1 » à « Valeur 4 » : ce que gagne la cible de même numéro (+5, -2…) ;
 * - « Choix » : combien de ces bonus le joueur choisit (1 à 4) ; vide, il les a tous ;
 * - « Sort sur mesure » : coché, le joueur cherche un sort à ajouter à sa fiche ;
 * - « Autre » : un texte, affiché tel quel.
 *
 * Une colonne ajoutée à la main dans Sheets reste affichée comme un texte (`entries`).
 * Sans dépendance au serveur : la fiche de personnage et le tableau des index s'en servent.
 */
import { foldCatalogName } from "@/lib/character-catalog"

export const RANK_BONUS_TAB = "Bonus de rang"
export const RANK_BONUS_RANK_HEADER = "Rang"
export const RANK_BONUS_SLOTS = 4
export const rankBonusTargetHeader = (slot: number) => `Cible ${slot}`
export const rankBonusValueHeader = (slot: number) => `Valeur ${slot}`
export const RANK_BONUS_CHOICE_HEADER = "Choix"
export const RANK_BONUS_SPELL_HEADER = "Sort sur mesure"
export const RANK_BONUS_OTHER_HEADER = "Autre"

/** Les colonnes du tableau, dans l'ordre où elles sont créées. */
export const RANK_BONUS_HEADERS = [
  RANK_BONUS_RANK_HEADER,
  ...Array.from({ length: RANK_BONUS_SLOTS }, (_, index) => [rankBonusTargetHeader(index + 1), rankBonusValueHeader(index + 1)]).flat(),
  RANK_BONUS_CHOICE_HEADER,
  RANK_BONUS_SPELL_HEADER,
  RANK_BONUS_OTHER_HEADER,
]

/** Le plus grand rang accepté : bien au-delà des 20 rangs des classes. */
export const RANK_BONUS_MAX_RANK = 999

/** Cible « Caractéristique » : le joueur répartit la valeur entre les caractéristiques principales. */
export const ANY_CHARACTERISTIC_TARGET = "Caractéristique"
/** Cible « Déplacement » : la valeur va à l'action de déplacement gratuite (donc aux trois). */
export const MOVEMENT_TARGET = "Déplacement"

export type RankBonusEntry = {
  /** Le nom de la cible, tel qu'écrit dans la case « Cible N ». */
  target: string
  /** La valeur telle qu'écrite (« +5 »). */
  value: string
  /** La valeur lue en nombre (0 si elle est illisible). */
  amount: number
  /** Le numéro de la colonne (1 à 4) : un bonus choisi est retrouvé par lui. */
  slot: number
}

export type RankBonus = {
  rank: number
  /** Les bonus chiffrés du rang, colonnes vides écartées. */
  bonuses: RankBonusEntry[]
  /** Combien de bonus le joueur choisit ; 0 : tous. */
  choose: number
  /** « Sort sur mesure » coché : un sort à chercher et à ajouter à la fiche. */
  customSpell: boolean
  /** La case « Autre ». */
  other: string
  /** Les colonnes ajoutées à la main dans Sheets, affichées telles quelles. */
  entries: Array<{ label: string; value: string }>
}

/** Les cases d'un rang telles qu'écrites, dans l'ordre des en-têtes (pour le tableau des index). */
export type RankBonusRow = { rank: number; values: string[] }

export type RankBonusTable = { bonuses: RankBonus[]; headers: string[]; rows?: RankBonusRow[]; sheetUrl: string; exists: boolean }

export function isAnyCharacteristicTarget(target: string) {
  return foldCatalogName(target) === foldCatalogName(ANY_CHARACTERISTIC_TARGET)
}

export function isMovementTarget(target: string) {
  return foldCatalogName(target) === foldCatalogName(MOVEMENT_TARGET)
}

/** « 3 », « +3 », « -2 », « 1,5 » ; 0 si la valeur est vide ou illisible. */
export function rankBonusAmount(value: string) {
  const parsed = Number.parseFloat(String(value ?? "").replace("−", "-").replace(",", ".").replace(/\s|\+/g, ""))
  return Number.isFinite(parsed) ? parsed : 0
}

/** « +5 », « -2 », « 0 ». */
export function formatRankBonusAmount(amount: number) {
  const rounded = Math.round(amount * 100) / 100
  return `${rounded > 0 ? "+" : ""}${rounded}`
}

function checked(value: string) {
  return /^(oui|vrai|true|x|1|yes|✓|☑)$/i.test(value.trim())
}

/** Le rang d'une case « Rang 12 » (ou « 12 ») ; null si elle n'en porte pas. */
export function rankOfCell(value: string) {
  const rank = Number.parseInt(String(value ?? "").match(/\d+/)?.[0] ?? "", 10)
  return Number.isInteger(rank) && rank >= 1 && rank <= RANK_BONUS_MAX_RANK ? rank : null
}

/** Les colonnes au rôle fixe, retrouvées par leur nom (casse et accents ignorés). */
export function isStandardRankBonusHeader(header: string) {
  const folded = foldCatalogName(header)
  return RANK_BONUS_HEADERS.some((candidate) => foldCatalogName(candidate) === folded)
}

/** Les bonus d'après les lignes de l'onglet (ligne 1 : les en-têtes). Un rang en double n'est lu qu'une fois. */
export function parseRankBonusRows(rows: ReadonlyArray<ReadonlyArray<unknown>>): { headers: string[]; bonuses: RankBonus[]; rows: RankBonusRow[] } {
  const headers = (rows[0] ?? []).map((header) => String(header ?? "").trim())
  const at = (name: string) => headers.findIndex((header) => foldCatalogName(header) === foldCatalogName(name))
  const slots = Array.from({ length: RANK_BONUS_SLOTS }, (_, index) => ({ slot: index + 1, target: at(rankBonusTargetHeader(index + 1)), value: at(rankBonusValueHeader(index + 1)) }))
  const choice = at(RANK_BONUS_CHOICE_HEADER)
  const spell = at(RANK_BONUS_SPELL_HEADER)
  const other = at(RANK_BONUS_OTHER_HEADER)
  const extras = headers.flatMap((header, index) => index > 0 && header && !isStandardRankBonusHeader(header) ? [index] : [])
  const seen = new Set<number>()
  const raw: RankBonusRow[] = []
  const bonuses = rows.slice(1).flatMap((row): RankBonus[] => {
    const cell = (index: number) => index >= 0 ? String(row[index] ?? "").trim() : ""
    const rank = rankOfCell(cell(0))
    if (rank === null || seen.has(rank)) return []
    seen.add(rank)
    raw.push({ rank, values: headers.map((_, index) => cell(index)) })
    const entries = slots.flatMap((slot): RankBonusEntry[] => {
      const target = cell(slot.target)
      const value = cell(slot.value)
      return target ? [{ target, value, amount: rankBonusAmount(value), slot: slot.slot }] : []
    })
    const choose = Number.parseInt(cell(choice), 10)
    return [{
      rank,
      bonuses: entries,
      choose: Number.isInteger(choose) && choose > 0 && choose < entries.length ? choose : 0,
      customSpell: checked(cell(spell)),
      other: cell(other),
      entries: extras.flatMap((index) => cell(index) ? [{ label: headers[index], value: cell(index) }] : []),
    }]
  })
  return { headers, bonuses: bonuses.sort((left, right) => left.rank - right.rank), rows: raw.sort((left, right) => left.rank - right.rank) }
}

/** Le rang apporte-t-il quelque chose (bonus, sort sur mesure, texte) ? */
export function rankBonusHasContent(bonus: RankBonus | undefined): bonus is RankBonus {
  return Boolean(bonus && (bonus.bonuses.length || bonus.customSpell || bonus.other || bonus.entries.length))
}

/** Le nombre de bonus que le joueur garde : `choose`, ou tous. */
export function rankBonusPickCount(bonus: RankBonus) {
  return bonus.choose > 0 ? Math.min(bonus.choose, bonus.bonuses.length) : bonus.bonuses.length
}
