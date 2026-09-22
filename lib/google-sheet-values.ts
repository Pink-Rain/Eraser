export type GoogleSheetCellValue = string | number | boolean | null | undefined

export function googleSheetCellText(value: GoogleSheetCellValue) {
  return value === null || value === undefined ? "" : String(value)
}

export function normalizeGoogleSheetRows(rows: GoogleSheetCellValue[][] | undefined): string[][] {
  return (rows ?? []).map((row) => row.map(googleSheetCellText))
}

/**
 * Première ligne (1-indexée) d’une plage A1, ou null si elle n’en précise pas.
 *
 * Google renvoie avec chaque lecture la plage réellement lue, qui ne commence
 * pas forcément là où elle a été demandée. Les écritures suivantes se calent
 * sur elle : déduire le numéro de ligne d’une constante faisait écrire
 * par-dessus la ligne voisine dès que la lecture était décalée.
 */
export function sheetRangeStartRow(range: string | undefined) {
  if (!range) return null
  const cells = range.includes("!") ? range.slice(range.lastIndexOf("!") + 1) : range
  const start = cells.split(":", 1)[0] || ""
  const row = /^[A-Z]*([0-9]+)$/i.exec(start)?.[1]
  return row ? Number.parseInt(row, 10) : null
}
