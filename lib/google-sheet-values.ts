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

type MatchedValueRange = { valueRange?: { range?: string; values?: GoogleSheetCellValue[][] }; dataFilters?: Array<{ a1Range?: string }> }

/**
 * Les réponses d'une lecture par filtres (`values:batchGetByDataFilter`), rattachées chacune
 * à la plage demandée. Google ne les rend pas forcément dans l'ordre demandé : chaque
 * réponse est retrouvée par le filtre qui l'a trouvée, sinon par ses colonnes, et la
 * position ne sert qu'en dernier recours. Les prendre dans l'ordre mélangeait les colonnes.
 */
export function matchValueRanges(ranges: readonly string[], answers: readonly MatchedValueRange[]) {
  const used = new Set<number>()
  const take = (found: number) => { if (found >= 0) used.add(found); return found >= 0 ? answers[found]?.valueRange : undefined }
  return ranges.map((range, index) => {
    const byFilter = answers.findIndex((answer, at) => !used.has(at) && (answer.dataFilters ?? []).some((filter) => filter.a1Range === range))
    const byColumn = byFilter >= 0 ? -1 : answers.findIndex((answer, at) => !used.has(at) && sameRangeColumns(answer.valueRange?.range, range))
    const fallback = byFilter < 0 && byColumn < 0 && answers.length === ranges.length && !used.has(index) ? index : -1
    return take(byFilter >= 0 ? byFilter : byColumn >= 0 ? byColumn : fallback)
  })
}

/** Deux plages A1 du même onglet qui commencent et finissent aux mêmes colonnes (« A:A » et « 'Perso'!A1:A20 »). */
export function sameRangeColumns(answered: string | undefined, requested: string) {
  if (!answered) return false
  const columns = (range: string) => {
    const at = range.lastIndexOf("!")
    const tab = at >= 0 ? range.slice(0, at).replace(/^'|'$/g, "").replace(/''/g, "'") : ""
    const [start = "", end = start] = (at >= 0 ? range.slice(at + 1) : range).split(":")
    return { tab, start: start.replace(/[0-9$]/g, "").toUpperCase(), end: end.replace(/[0-9$]/g, "").toUpperCase() }
  }
  const left = columns(answered)
  const right = columns(requested)
  return Boolean(left.start) && left.start === right.start && left.end === right.end && (!left.tab || !right.tab || left.tab === right.tab)
}
