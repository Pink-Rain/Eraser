/**
 * Regroupement des index d'objets en un seul classeur à onglets : les règles pures
 * (noms des onglets, identifiants gardés, vérification de la copie). Le serveur s'en
 * sert dans `object-index-regroup-server.ts`, les tests directement.
 *
 * Ce fichier ne dépend de rien.
 */

/** Le classeur regroupé, dans le dossier « Objets ». */
export const MERGED_OBJECT_INDEX_NAME = "Index des objets"
/** Le sous-dossier de « Objets » où les anciens classeurs sont rangés, intacts. */
export const OBJECT_INDEX_BACKUP_FOLDER = "Anciens index d’objets (avant regroupement)"
/** L'onglet caché du classeur regroupé qui garde de quoi annuler. */
export const OBJECT_INDEX_REGROUP_TAB = "Eraser · regroupement"
export const OBJECT_INDEX_REGROUP_HEADERS = ["Ancien classeur (ID)", "Ancien classeur", "Ancien onglet", "Ancien onglet (ID)", "Nouvel onglet", "Nouvel onglet (ID)", "Entrée déplacée (ID)", "Dossier Objets (ID)", "Dossier de sauvegarde (ID)", "Regroupé le"]

function fold(value: string) {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/gi, " ").trim().toLowerCase()
}

/** Le nom d'onglet d'un ancien classeur : « Index armes » → « Armes »… */
export function regroupedBaseName(fileName: string) {
  const folded = fold(fileName)
  if (/\barmes?\b/.test(folded)) return "Armes"
  if (/\bequipements?\b/.test(folded)) return "Équipement"
  if (/\bparchemins?\b/.test(folded)) return "Parchemins"
  if (/\bconsommables?\b/.test(folded)) return "Consommables"
  if (/\bobjets?\b/.test(folded)) return "Objets"
  const stripped = fileName.replace(/^\s*index\s+(?:des?\s+|du\s+|d[’']\s*)?/i, "").trim() || fileName.trim()
  return stripped.charAt(0).toLocaleUpperCase("fr") + stripped.slice(1)
}

/** L'ordre des onglets : Objets, Équipement, Parchemins, Consommables, Armes, puis le reste. */
const preferredOrder = ["Objets", "Équipement", "Parchemins", "Consommables", "Armes"]

export type RegroupSource = { key: string; fileName: string; tabName: string }

/**
 * Le nom de chaque tableau dans le classeur regroupé. Un classeur d'un seul tableau
 * prend le nom court ; s'il en a plusieurs, chacun garde le nom de son onglet derrière.
 * Les noms restent uniques et ne commencent jamais par « Eraser · ».
 */
export function regroupedTabNames(sources: RegroupSource[]) {
  const perFile = new Map<string, number>()
  for (const source of sources) perFile.set(source.fileName, (perFile.get(source.fileName) ?? 0) + 1)
  const used = new Set<string>()
  const names = new Map<string, string>()
  const ordered = [...sources].sort((left, right) => {
    const a = preferredOrder.indexOf(regroupedBaseName(left.fileName)); const b = preferredOrder.indexOf(regroupedBaseName(right.fileName))
    return (a < 0 ? 99 : a) - (b < 0 ? 99 : b) || left.fileName.localeCompare(right.fileName, "fr") || left.tabName.localeCompare(right.tabName, "fr")
  })
  for (const source of ordered) {
    const base = regroupedBaseName(source.fileName)
    let name = ((perFile.get(source.fileName) ?? 0) > 1 ? `${base} – ${source.tabName.trim()}` : base).replace(/^Eraser\s*·\s*/i, "").replace(/[[\]*?:/\\]/g, " ").replace(/\s+/g, " ").trim().slice(0, 90) || "Objets"
    const stem = name
    for (let index = 2; used.has(fold(name)); index += 1) name = `${stem} (${index})`
    used.add(fold(name))
    names.set(source.key, name)
  }
  return { names, order: ordered.map((source) => source.key) }
}

/** L'identifiant que l'inventaire donne à un objet d'un tableau sans colonne ID. */
export function legacyObjectId(fileId: string, sheetId: number, rowNumber: number) {
  return `DRIVE-${fileId}-${sheetId}-${rowNumber}`
}

const idHeaders = new Set(["id", "identifiant"])

export type IdFillPlan = {
  /** La colonne ID (0 = A) : existante, ou ajoutée après la dernière colonne. */
  column: number
  /** Vrai quand la colonne est ajoutée (son en-tête « ID » est à écrire). */
  addHeader: boolean
  cells: Array<{ rowNumber: number; value: string }>
}

/**
 * Les identifiants à écrire dans la copie pour que chaque objet garde le sien : les
 * inventaires, boutiques et fouilles désignent un objet sans ID par sa position dans
 * l'ancien classeur (`DRIVE-classeur-onglet-ligne`). Cette valeur est écrite dans une
 * colonne ID (ajoutée si besoin) ; une case ID déjà remplie n'est jamais touchée.
 */
export function plannedObjectIds(table: { fileId: string; sheetId: number; headers: string[]; rawWidth: number; rows: Array<{ rowNumber: number; values: string[] }> }, nameOf: (row: { values: string[] }) => string): IdFillPlan {
  const existing = table.headers.findIndex((header) => idHeaders.has(fold(header)))
  const column = existing >= 0 ? existing : table.rawWidth
  const cells = table.rows.flatMap((row) => {
    if (!nameOf(row).trim()) return []
    if (existing >= 0 && (row.values[existing] ?? "").trim()) return []
    return [{ rowNumber: row.rowNumber, value: legacyObjectId(table.fileId, table.sheetId, row.rowNumber) }]
  })
  return { column, addHeader: existing < 0, cells }
}

/**
 * Les différences entre un tableau et sa copie, ligne par ligne : la bascule n'a lieu
 * que s'il n'y en a aucune (hors colonne ID remplie par le regroupement).
 */
export function copyMismatches(source: Array<{ rowNumber: number; values: string[] }>, copy: Array<{ rowNumber: number; values: string[] }>, width: number, ignoredColumn = -1) {
  const problems: string[] = []
  const filled = (rows: typeof source) => rows.filter((row) => row.values.some((value, index) => index !== ignoredColumn && value.trim()))
  const sourceRows = filled(source)
  const copyRows = new Map(filled(copy).map((row) => [row.rowNumber, row]))
  if (sourceRows.length !== copyRows.size) problems.push(`${sourceRows.length} lignes dans l’original, ${copyRows.size} dans la copie`)
  for (const row of sourceRows) {
    const copied = copyRows.get(row.rowNumber)
    if (!copied) { problems.push(`ligne ${row.rowNumber} absente de la copie`); continue }
    for (let column = 0; column < width; column += 1) {
      if (column === ignoredColumn) continue
      if ((row.values[column] ?? "").trim() !== (copied.values[column] ?? "").trim()) { problems.push(`ligne ${row.rowNumber}, colonne ${column + 1} différente`); break }
    }
    if (problems.length >= 5) break
  }
  return problems
}

/** La clé d'un tableau d'objets dans un onglet-fenêtre (`classeur:onglet`). */
export const objectTableSource = (fileId: string, sheetId: number) => `${fileId}:${sheetId}`
