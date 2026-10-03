/**
 * Les colonnes d'une feuille Google Sheets retrouvées par leur nom (la ligne 1), jamais
 * par leur position. Déplacer une colonne dans Sheets ne change donc rien à ce que lit
 * ou écrit Eraser. Sans dépendance au serveur.
 *
 * Une colonne prévue par Eraser se cherche d'abord par son nom (ou un ancien nom). Si
 * elle est introuvable et que sa place d'origine est une case vide au milieu des
 * en-têtes, on la lit à cette place, comme avant : une feuille dont un en-tête a été
 * effacé n'est jamais lue plus mal qu'avant. Absente pour de bon, elle vaut -1 :
 * l'écriture l'ajoute d'abord à droite de la dernière colonne nommée.
 */

export type SheetCell = string | number | boolean

type SheetRow = readonly (string | undefined)[] | undefined | null

export function foldSheetHeader(value: string | undefined) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[’']/g, "'")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase("fr")
}

export type SheetColumns = {
  /** Les en-têtes réels de la feuille (ligne 1). */
  headers: string[]
  /** Les colonnes prévues, dans l'ordre d'Eraser, et leurs anciens noms. */
  expected: readonly string[]
  aliases: Record<string, readonly string[]>
  /** Les colonnes prévues que la feuille n'a pas encore (à ajouter à droite avant d'écrire). */
  missing: string[]
  /** Les colonnes prévues lues à leur place d'origine faute d'en-tête (case vide de la ligne 1). */
  unnamed: Array<{ name: string; index: number }>
  /** Le nombre de colonnes à lire et à écrire : jusqu'à la dernière connue. */
  width: number
  /** La place d'une colonne (nom prévu, ancien nom, ou en-tête de la feuille), ou -1. */
  at(name: string): number
  /** La valeur d'une case d'une ligne lue, « » si la colonne n'existe pas. */
  get(row: SheetRow, name: string): string
  /**
   * Une ligne entière : chaque valeur nommée à sa place, tout le reste repris de
   * `original`. Une colonne nommée absente de la feuille fait échouer l'écriture plutôt
   * que de perdre la valeur.
   */
  row(values: Record<string, SheetCell>, original?: SheetRow): SheetCell[]
  /**
   * Les seules cases nommées, regroupées en morceaux contigus (`start` : place de la
   * première, à partir de 0). Écrire ces morceaux ne touche jamais une autre colonne :
   * une colonne ajoutée à la main dans Sheets (même une formule) reste intacte.
   */
  runs(values: Record<string, SheetCell>): Array<{ start: number; values: SheetCell[] }>
  /** Une ligne vide de la largeur de la feuille (effacer une ligne). */
  blank(): string[]
}

export function sheetColumns(actual: SheetRow, expected: readonly string[], aliases: Record<string, readonly string[]> = {}): SheetColumns {
  const headers = Array.from(actual ?? [], (header) => String(header ?? "").trim())
  const positions = new Map<string, number>()
  headers.forEach((header, index) => {
    const key = foldSheetHeader(header)
    if (key && !positions.has(key)) positions.set(key, index)
  })
  let used = headers.length
  while (used > 0 && !headers[used - 1]) used -= 1
  const resolved = new Map<string, number>()
  const missing: string[] = []
  const unnamed: Array<{ name: string; index: number }> = []
  expected.forEach((name, defaultIndex) => {
    let index = -1
    for (const candidate of [name, ...(aliases[name] ?? [])]) {
      const found = positions.get(foldSheetHeader(candidate))
      if (found !== undefined) { index = found; break }
    }
    // Une case d'en-tête vide à sa place d'origine, entre deux colonnes nommées : la
    // colonne y est lue, comme avant. Une feuille sans aucun en-tête est lue de même.
    if (index < 0 && (defaultIndex < used || used === 0) && !headers[defaultIndex]) {
      index = defaultIndex
      unnamed.push({ name, index })
    }
    if (index < 0) missing.push(name)
    resolved.set(foldSheetHeader(name), index)
  })
  const width = Math.max(headers.length, ...[...resolved.values()].map((index) => index + 1), 0)
  const at = (name: string) => {
    const key = foldSheetHeader(name)
    const known = resolved.get(key)
    if (known !== undefined) return known
    for (const [expectedName, extra] of Object.entries(aliases)) {
      if (extra.some((alias) => foldSheetHeader(alias) === key)) return resolved.get(foldSheetHeader(expectedName)) ?? -1
    }
    return positions.get(key) ?? -1
  }
  const placed = (values: Record<string, SheetCell>) => Object.entries(values).map(([name, value]) => {
    const index = at(name)
    if (index < 0) throw new Error(`SHEET_COLUMN_MISSING:${name}`)
    return { index, value }
  })
  return {
    headers,
    expected,
    aliases,
    missing,
    unnamed,
    width,
    at,
    get(row, name) {
      const index = at(name)
      return index >= 0 ? String(row?.[index] ?? "") : ""
    },
    row(values, original) {
      const line: SheetCell[] = Array.from({ length: width }, (_, index) => original?.[index] ?? "")
      for (const { index, value } of placed(values)) line[index] = value
      return line
    },
    runs(values) {
      const cells = placed(values).sort((left, right) => left.index - right.index)
      const runs: Array<{ start: number; values: SheetCell[] }> = []
      for (const cell of cells) {
        const last = runs[runs.length - 1]
        if (last && last.start + last.values.length === cell.index) last.values.push(cell.value)
        else if (!last || last.start + last.values.length <= cell.index) runs.push({ start: cell.index, values: [cell.value] })
        // Deux noms pour la même colonne : la dernière valeur l'emporte.
        else last.values[cell.index - last.start] = cell.value
      }
      return runs
    },
    blank() {
      return Array.from({ length: width }, () => "")
    },
  }
}

/** Les mêmes colonnes après l'ajout d'en-têtes à la ligne 1. */
export function withSheetHeaders(columns: SheetColumns, headers: readonly string[]) {
  return sheetColumns(headers, columns.expected, columns.aliases)
}

/**
 * Ce qu'il faut écrire en ligne 1 pour que chaque colonne prévue ait son en-tête : les
 * cases d'origine restées vides reçoivent leur nom, les colonnes absentes sont ajoutées
 * à droite de la dernière colonne nommée. Aucun en-tête existant n'est remplacé.
 */
export function headerAdditions(columns: SheetColumns) {
  let used = columns.headers.length
  while (used > 0 && !columns.headers[used - 1]) used -= 1
  const cells = columns.unnamed.map((item) => ({ index: item.index, header: item.name }))
  // Une case d'origine vide au-delà de la dernière colonne nommée : la suite part après elle.
  const end = Math.max(used, ...cells.map((cell) => cell.index + 1))
  columns.missing.forEach((header, offset) => cells.push({ index: end + offset, header }))
  const headers = Array.from({ length: Math.max(columns.headers.length, ...cells.map((cell) => cell.index + 1)) }, (_, index) => columns.headers[index] ?? "")
  for (const cell of cells) headers[cell.index] = cell.header
  return { cells, headers }
}

/** « A », « Z », « AA »… : la lettre d'une colonne (1 = A). */
export function sheetColumnLetter(position: number) {
  let current = Math.max(1, Math.trunc(position))
  let result = ""
  while (current > 0) {
    const remainder = (current - 1) % 26
    result = String.fromCharCode(65 + remainder) + result
    current = Math.floor((current - 1) / 26)
  }
  return result
}
