export type GoogleSheetCellValue = string | number | boolean | null | undefined

export function googleSheetCellText(value: GoogleSheetCellValue) {
  return value === null || value === undefined ? "" : String(value)
}

export function normalizeGoogleSheetRows(rows: GoogleSheetCellValue[][] | undefined): string[][] {
  return (rows ?? []).map((row) => row.map(googleSheetCellText))
}
