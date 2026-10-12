import { normalizeClassLabel } from "@/lib/class-utils"

/**
 * Les colonnes de rang de la feuille des sorts des classes : une par classe, nommée par
 * l'identifiant de la classe (« CLA-0003 ») ou par son nom (« Guerrier·e »). Chaque case
 * porte le rang du sort dans la classe (0 : rang commun), vide s'il n'en fait pas partie.
 * Une seule règle pour tout Eraser : les pages de classe et le moteur des index retrouvent
 * exactement les mêmes colonnes.
 */
export function classRankColumnsOf(headers: readonly string[], classes: ReadonlyArray<{ id: string; name: string }>) {
  return classes.flatMap((characterClass) => {
    const column = headers.findIndex((header) => header === characterClass.id || normalizeClassLabel(header) === normalizeClassLabel(characterClass.name))
    return column >= 0 ? [{ classId: characterClass.id, column }] : []
  })
}

/** Le rang écrit dans une case (0 à 20), `null` si elle est vide ou ne contient pas un rang. */
export function classRankOf(value: unknown) {
  const rank = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10)
  return Number.isInteger(rank) && rank >= 0 && rank <= 20 ? rank : null
}

/** Le libellé d'un rang, tel que la page d'une classe l'écrit. */
export const classRankLabel = (rank: number) => rank === 0 ? "Rang commun" : `Rang ${rank}`

/** Tous les libellés de rang, dans l'ordre (les sections d'une vue rangée par rang les suivent). */
export const classRankLabels = Array.from({ length: 21 }, (_, rank) => classRankLabel(rank))

type RankTable = { tabName: string; headers: string[]; rows: Array<{ values: string[]; html: string[] }> }

/**
 * Les sorts lus par une page du créateur de pages : la colonne de rang de chaque classe prend
 * l'identifiant de la classe pour nom (« CLA-0003 », qu'elle soit nommée ainsi ou par le nom
 * de la classe) et ses cases deviennent « Rang commun », « Rang 1 »… La page d'une classe
 * filtre et range ainsi ses sorts par « {ID} ». Lecture seulement, rien n'est écrit.
 */
export function rankColumnsForPages<T extends RankTable>(tables: T[], classes: ReadonlyArray<{ id: string; name: string }>): { tables: T[]; rankHeaders: Record<string, string[]> } {
  const rankHeaders: Record<string, string[]> = {}
  const out = tables.map((table) => {
    const columns = classRankColumnsOf(table.headers, classes)
    if (!columns.length) return table
    const byColumn = new Map(columns.map(({ classId, column }) => [column, classId]))
    rankHeaders[table.tabName] = columns.map(({ classId }) => classId)
    const label = (value: string | undefined) => { const rank = classRankOf(value); return rank === null ? "" : classRankLabel(rank) }
    return {
      ...table,
      headers: table.headers.map((header, index) => byColumn.get(index) ?? header),
      rows: table.rows.map((row) => ({
        ...row,
        values: row.values.map((value, index) => byColumn.has(index) ? label(value) : value),
        html: row.html.map((value, index) => byColumn.has(index) ? label(row.values[index]) : value),
      })),
    }
  })
  return { tables: out, rankHeaders }
}
