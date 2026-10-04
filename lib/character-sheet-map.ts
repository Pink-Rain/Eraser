/**
 * La feuille des personnages lue par le nom de ses colonnes. La fiche travaille dans un
 * ordre fixe (`characterValueHeaders`, puis les colonnes ajoutées par l'index des
 * compétences) ; la feuille peut ranger ses colonnes dans n'importe quel ordre : chaque
 * valeur est retrouvée par son en-tête, et les formules écrites par Eraser visent la
 * vraie case. Sans dépendance au serveur : les tests le vérifient directement.
 */
import { characterLayout, isCatalogColumnHeader, type CharacterLayout } from "@/lib/character-catalog"
import { characterSheetHeaders, characterValueHeaders } from "@/lib/character-sheet-schema"
import { sheetColumnLetter, sheetColumns, type SheetCell, type SheetColumns } from "@/lib/sheet-columns"

/** Anciens noms des premières colonnes de la feuille des personnages (feuille d'origine du site). */
export const characterSheetAliases: Record<string, readonly string[]> = {
  "Joueur": ["ownerUid", "Propriétaire"],
  "Nom personnage": ["name"],
}

/**
 * La feuille des personnages vue dans l'ordre de la fiche. `values[i]` est la valeur
 * de l'en-tête `characterValueHeaders[i]`, retrouvée par le nom de sa colonne où
 * qu'elle soit dans Sheets ; les colonnes ajoutées par l'index des compétences (et
 * celles ajoutées à la main) suivent, dans l'ordre de la feuille.
 */
export type CharacterSheetMap = {
  columns: SheetColumns
  /** La colonne réelle (0 = A) de chaque valeur de la fiche, -1 si la feuille ne l'a pas. */
  valueColumns: number[]
  layout: CharacterLayout
  /** Les valeurs qu'Eraser écrit : celles de la fiche d'origine et les colonnes de l'index. */
  writable: boolean[]
  /** Valeurs rangées comme la fiche, dès la colonne C et sans trou : une seule plage suffit. */
  contiguous: boolean
  /** Nombre de colonnes à lire pour une ligne entière. */
  width: number
}

export function characterSheetMap(headerRow: readonly (string | undefined)[]): CharacterSheetMap {
  const columns = sheetColumns(headerRow, characterSheetHeaders, characterSheetAliases)
  const canonical = characterValueHeaders.map((header) => columns.at(header))
  const taken = new Set([columns.at("ID"), columns.at("Joueur"), ...canonical].filter((index) => index >= 0))
  const extras = columns.headers.flatMap((header, index) => header && !taken.has(index) ? [index] : [])
  const valueColumns = [...canonical, ...extras]
  const headers = [...characterValueHeaders, ...extras.map((index) => columns.headers[index])]
  const writable = headers.map((header, index) => index < characterValueHeaders.length || isCatalogColumnHeader(header))
  const contiguous = columns.at("ID") === 0 && columns.at("Joueur") === 1 && valueColumns.every((column, index) => column === index + 2)
  const layout = characterLayout(headers, contiguous ? undefined : (index, rowNumber) => {
    const column = valueColumns[index] ?? -1
    // Une colonne absente (jamais après ensureCharacterSheetSchema) : une case vide plutôt qu'une formule cassée.
    return column >= 0 ? `${sheetColumnLetter(column + 1)}${rowNumber}` : "0"
  })
  return { columns, valueColumns, layout, writable, contiguous, width: Math.max(columns.width, ...valueColumns.map((column) => column + 1)) }
}

/**
 * Une ligne entière de la feuille (pour l'ajouter) : l'identifiant, le joueur et chaque valeur
 * à sa place. Sans colonne ID ou Joueur, la ligne est refusée : écrite quand même, elle
 * donnait une fiche que rien ne retrouve, ou sans joueur.
 */
export function characterSheetRow(map: CharacterSheetMap, id: string, ownerUid: string, values: readonly string[]) {
  for (const name of ["ID", "Joueur"]) if (map.columns.at(name) < 0) throw new Error(`SHEET_COLUMN_MISSING:${name}`)
  const row: SheetCell[] = Array.from({ length: map.width }, () => "")
  values.forEach((value, index) => {
    const column = map.valueColumns[index] ?? -1
    if (column >= 0 && map.writable[index]) row[column] = value
  })
  row[map.columns.at("ID")] = id
  row[map.columns.at("Joueur")] = ownerUid
  return row
}

export function characterValuesOf(map: CharacterSheetMap, row: readonly (string | undefined)[]) {
  return map.valueColumns.map((column) => column >= 0 ? String(row[column] ?? "") : "")
}

