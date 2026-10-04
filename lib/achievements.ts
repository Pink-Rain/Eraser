/**
 * Les succès côté serveur : lus dans l'Index des succès (Google Sheets) et son onglet
 * « Obtenus ». Google Sheets reste la source : une attribution
 * écrite ou effacée à la main dans la feuille compte comme les autres.
 */
import {
  ACHIEVEMENTS_TAB,
  OBTAINED_TAB,
  achievementsFromTable,
  obtainedBy,
  obtainedFromTable,
} from "@/lib/achievements-shared"
import { resolveJdrSheet } from "@/lib/google-sheets"
import { getWorldIndex, getWorldIndexQuick } from "@/lib/world-indexes"

const KEY = "achievements" as const

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

