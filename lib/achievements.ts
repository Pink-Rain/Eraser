/**
 * Les succès côté serveur : lus dans l'Index des succès (Google Sheets), attribués et
 * retirés dans son onglet « Obtenus ». Google Sheets reste la source : une attribution
 * écrite ou effacée à la main dans la feuille compte comme les autres.
 */
import {
  ACHIEVEMENTS_TAB,
  OBTAINED_ACCOUNT_HEADER,
  OBTAINED_ACHIEVEMENT_HEADER,
  OBTAINED_BY_HEADER,
  OBTAINED_DATE_HEADER,
  OBTAINED_NOTE_HEADER,
  OBTAINED_PLAYER_HEADER,
  OBTAINED_TAB,
  achievementsFromTable,
  foldAchievementText,
  obtainedBy,
  obtainedFromTable,
} from "@/lib/achievements-shared"
import { resolveJdrSheet } from "@/lib/google-sheets"
import { addWorldIndexRow, deleteWorldIndexRows, getWorldIndex, getWorldIndexQuick } from "@/lib/world-indexes"

const KEY = "achievements" as const

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

/** L'index et toutes les attributions ; `fresh` relit la feuille (après une écriture). */
export async function readAchievements(options: { fresh?: boolean } = {}) {
  // Lire ne crée jamais le classeur : on relie seulement une feuille « Index des succès »
  // déjà présente dans Drive. Il est créé quand un MJ ouvre Index › Succès.
  if (!(await resolveJdrSheet(KEY))) return { achievements: [], obtained: [] }
  const data = options.fresh ? await getWorldIndex(KEY, { refresh: true }) : await getWorldIndexQuick(KEY)
  const table = (name: string) => data.tables.find((candidate) => candidate.tabName === name)
  return { achievements: achievementsFromTable(table(ACHIEVEMENTS_TAB)), obtained: obtainedFromTable(table(OBTAINED_TAB)) }
}

/** Les succès d'un compte. */
export async function achievementsOf(account: { uid: string; displayName: string }) {
  const { achievements, obtained } = await readAchievements()
  return { achievements, obtained: obtainedBy(obtained, account) }
}

/**
 * Attribue un succès à un compte. Un compte qui l'a déjà le garde tel quel : la même
 * attribution n'est jamais écrite deux fois.
 */
export async function grantAchievement(input: { achievement: string; uid: string; player: string; grantedBy: string; note?: string }) {
  const { achievements, obtained } = await readAchievements({ fresh: true })
  const achievement = achievements.find((candidate) => foldAchievementText(candidate.name) === foldAchievementText(input.achievement) || candidate.id === input.achievement)
  if (!achievement) throw new Error("ACHIEVEMENT_NOT_FOUND")
  const already = obtainedBy(obtained, { uid: input.uid, displayName: input.player }).find((entry) => foldAchievementText(entry.achievement) === foldAchievementText(achievement.name))
  if (already) return { achievement, created: false }
  const data = await getWorldIndex(KEY)
  const table = data.tables.find((candidate) => candidate.tabName === OBTAINED_TAB)
  if (!table) throw new Error("WORLD_INDEX_TAB_NOT_FOUND")
  const fields: Record<string, string> = {
    [OBTAINED_ACHIEVEMENT_HEADER]: achievement.name,
    [OBTAINED_PLAYER_HEADER]: input.player,
    [OBTAINED_BY_HEADER]: input.grantedBy,
    [OBTAINED_DATE_HEADER]: new Date().toISOString().slice(0, 10),
    [OBTAINED_NOTE_HEADER]: input.note?.trim() ?? "",
    [OBTAINED_ACCOUNT_HEADER]: input.uid,
  }
  const values = table.headers.map((header) => {
    const entry = Object.entries(fields).find(([candidate]) => foldAchievementText(candidate) === foldAchievementText(header))
    return escapeHtml(entry?.[1] ?? "")
  })
  await addWorldIndexRow(KEY, OBTAINED_TAB, values)
  return { achievement, created: true }
}

/** Retire une attribution, retrouvée par son identifiant (les lignes ont pu bouger). */
export async function revokeAchievement(obtainedId: string) {
  const { obtained } = await readAchievements({ fresh: true })
  const entry = obtained.find((candidate) => candidate.id === obtainedId)
  if (!entry) throw new Error("ACHIEVEMENT_GRANT_NOT_FOUND")
  await deleteWorldIndexRows(KEY, OBTAINED_TAB, [entry.rowNumber])
  return entry
}
