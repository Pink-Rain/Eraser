/**
 * Les succès : leur index (onglet « Succès ») et les attributions (onglet « Obtenus »),
 * lus depuis Google Sheets. Sans dépendance serveur : l'accueil, le profil et les tests
 * s'en servent aussi.
 */

export const ACHIEVEMENTS_TAB = "Succès"
export const OBTAINED_TAB = "Obtenus"

export const ACHIEVEMENT_TYPE_HEADER = "Type"
export const ACHIEVEMENT_SUBTYPE_HEADER = "Sous-type"
export const ACHIEVEMENT_DESCRIPTION_HEADER = "Description"
export const ACHIEVEMENT_ICON_HEADER = "Icône"
export const ACHIEVEMENT_COLOR_HEADER = "Couleur"

export const OBTAINED_ACHIEVEMENT_HEADER = "Succès"
export const OBTAINED_PLAYER_HEADER = "Joueur"
export const OBTAINED_BY_HEADER = "Attribué par"
export const OBTAINED_DATE_HEADER = "Date"
export const OBTAINED_NOTE_HEADER = "Note"
export const OBTAINED_ACCOUNT_HEADER = "Compte"

export type AchievementType = "Joueur" | "MJ"
export const achievementTypeColors: Record<AchievementType, string> = { Joueur: "#397f88", MJ: "#9a4f2c" }

/** Les sous-types proposés au départ ; la liste accepte toute nouvelle valeur. */
export const achievementSubtypes = ["Combat", "Exploration", "Roleplay", "Social", "Collection", "Insolite", "Préparation", "Narration", "Organisation"]

export type Achievement = {
  id: string
  rowNumber: number
  name: string
  type: AchievementType
  subtype: string
  /** HTML, mise en forme de Sheets comprise. */
  description: string
  /** Colonne Fichier image : l'adresse de l'image (ou un symbole court, comme ailleurs). */
  icon: string
  color: string
}

export type ObtainedAchievement = {
  id: string
  rowNumber: number
  /** Le nom du succès, tel qu'écrit dans « Obtenus » (renommé avec lui). */
  achievement: string
  uid: string
  player: string
  grantedBy: string
  date: string
  note: string
}

/** Ce que l'accueil et le profil reçoivent : l'index, et les succès d'un compte. */
export type AchievementBoard = {
  achievements: Achievement[]
  obtained: ObtainedAchievement[]
}

export function foldAchievementText(value: string) {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim().toLocaleLowerCase("fr")
}

export function achievementTypeOf(value: string): AchievementType {
  const folded = foldAchievementText(value)
  return folded === "mj" || folded.startsWith("maitre") || folded === "meneur" ? "MJ" : "Joueur"
}

const fallbackColor = "#927640"

export function achievementColor(value: string, type: AchievementType) {
  const color = value.trim()
  return /^#[0-9a-f]{6}$/i.test(color) ? color : type === "MJ" ? "#9a4f2c" : fallbackColor
}

type SheetTable = { headers: string[]; rows: Array<{ rowNumber: number; values: string[]; html: string[] }> }

function columnReader(headers: string[]) {
  const columns = new Map(headers.map((header, index) => [foldAchievementText(header), index]))
  return (row: SheetTable["rows"][number], header: string, html = false) => {
    const index = columns.get(foldAchievementText(header))
    if (index === undefined) return ""
    return String((html ? row.html[index] || row.values[index] : row.values[index]) ?? "").trim()
  }
}

/** Les succès de l'onglet « Succès » (les lignes sans nom sont ignorées). */
export function achievementsFromTable(table: SheetTable | undefined): Achievement[] {
  if (!table) return []
  const read = columnReader(table.headers)
  return table.rows.flatMap((row) => {
    const name = read(row, "Nom")
    if (!name) return []
    const type = achievementTypeOf(read(row, ACHIEVEMENT_TYPE_HEADER))
    return [{
      id: read(row, "ID") || `row-${row.rowNumber}`,
      rowNumber: row.rowNumber,
      name,
      type,
      subtype: read(row, ACHIEVEMENT_SUBTYPE_HEADER),
      description: read(row, ACHIEVEMENT_DESCRIPTION_HEADER, true),
      icon: read(row, ACHIEVEMENT_ICON_HEADER),
      color: achievementColor(read(row, ACHIEVEMENT_COLOR_HEADER), type),
    }]
  })
}

/** Les attributions de l'onglet « Obtenus ». */
export function obtainedFromTable(table: SheetTable | undefined): ObtainedAchievement[] {
  if (!table) return []
  const read = columnReader(table.headers)
  return table.rows.flatMap((row) => {
    const achievement = read(row, OBTAINED_ACHIEVEMENT_HEADER)
    if (!achievement) return []
    return [{
      id: read(row, "ID") || `row-${row.rowNumber}`,
      rowNumber: row.rowNumber,
      achievement,
      uid: read(row, OBTAINED_ACCOUNT_HEADER),
      player: read(row, OBTAINED_PLAYER_HEADER),
      grantedBy: read(row, OBTAINED_BY_HEADER),
      date: read(row, OBTAINED_DATE_HEADER),
      note: read(row, OBTAINED_NOTE_HEADER),
    }]
  })
}

/**
 * Les attributions d'un compte : par son identifiant, ou, pour une ligne écrite à la
 * main dans Sheets sans identifiant, par le nom du joueur.
 */
export function obtainedBy(obtained: ObtainedAchievement[], account: { uid: string; displayName: string }) {
  const name = foldAchievementText(account.displayName)
  return obtained.filter((entry) => entry.uid ? entry.uid === account.uid : Boolean(name) && foldAchievementText(entry.player) === name)
}

/** Le succès d'une attribution, retrouvé par son nom. */
export function achievementOf(achievements: Achievement[], entry: ObtainedAchievement) {
  const folded = foldAchievementText(entry.achievement)
  return achievements.find((achievement) => foldAchievementText(achievement.name) === folded)
}

/** « 2026-10-02 » → « 2 oct. 2026 » ; une date écrite autrement reste telle quelle. */
export function achievementDateLabel(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}/.test(value)) return value
  const date = new Date(`${value.slice(0, 10)}T12:00:00`)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })
}
