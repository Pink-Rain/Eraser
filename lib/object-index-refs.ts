/**
 * Comment la page désigne une ligne ou une case de l'Index des objets : la ligne par son
 * ID (sa place n'est qu'un indice) et, faute d'ID, par son nom ; la colonne par son
 * en-tête. Le serveur les retrouve dans la feuille relue au moment d'écrire et refuse si
 * elles n'y sont plus. Sans dépendance au serveur.
 */
import { columnAt, objectNameHeaders } from "@/lib/index-references-cells"

export type ObjectIndexRowRef = { id: string; rowNumber: number; name?: string }
/** `occurrence` : la place de la colonne parmi celles du même en-tête (« Rareté » peut revenir). */
export type ObjectIndexCellRef = ObjectIndexRowRef & { header: string; occurrence?: number }

const idHeaders = ["ID", "Identifiant"]

/** Une ligne d'un tableau tel que la page l'a reçu. */
export function objectIndexRowRef(headers: string[], row: { rowNumber: number; values: string[] }): ObjectIndexRowRef {
  const id = columnAt(headers, idHeaders)
  const name = columnAt(headers, objectNameHeaders)
  return {
    id: id >= 0 ? (row.values[id] ?? "").trim() : "",
    rowNumber: row.rowNumber,
    name: name >= 0 ? (row.values[name] ?? "").trim() : "",
  }
}

/** Combien de colonnes portent le même en-tête avant celle-ci. */
export function headerOccurrence(headers: string[], column: number) {
  const header = (headers[column] ?? "").trim()
  return headers.slice(0, column).filter((candidate) => candidate.trim() === header).length
}

/** Une case d'une ligne : sa ligne, et sa colonne par son en-tête. */
export function objectIndexCellRef(headers: string[], row: { rowNumber: number; values: string[] }, column: number): ObjectIndexCellRef {
  return { ...objectIndexRowRef(headers, row), header: headers[column] ?? "", occurrence: headerOccurrence(headers, column) }
}

/** Une ligne reçue dans une requête, ou null si elle est mal formée. */
export function parseObjectIndexRowRef(value: unknown): ObjectIndexRowRef | null {
  if (!value || typeof value !== "object") return null
  const { id, rowNumber, name } = value as Record<string, unknown>
  if (typeof id !== "string" || typeof rowNumber !== "number" || !Number.isInteger(rowNumber) || rowNumber < 2) return null
  return { id, rowNumber, name: typeof name === "string" ? name : undefined }
}

/** Réponse (HTTP 409) quand la ligne ou la colonne visée n'est plus là où la page la voyait. */
export const OBJECT_INDEX_CHANGED_MESSAGE = "Le tableau a changé entre-temps dans Google Sheets : actualise puis recommence."
