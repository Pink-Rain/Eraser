/**
 * Les statistiques d'un onglet stat : une phrase à trous (« Compter les lignes où … réparties
 * par … en colonnes … ») enregistrée dans la présentation de l'onglet (« Présentation (JSON) »
 * des onglets-fenêtres), et son calcul sur les lignes déjà chargées de l'index. Aucune lecture
 * Google : tout se calcule dans la page.
 *
 * Règles pures : la page, le serveur (nettoyage) et les tests s'en servent.
 */
import { describeCondition, isViewOperator, matchesCondition, type ViewCondition } from "@/lib/index-views"

/* ---------- Les cases ---------- */

/** Le texte d'une case, sans balises (une référence garde son libellé). */
export function cellText(value: string) {
  return value.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim()
}

/** Les valeurs d'une case : « Feu, Glace » en donne deux (comme les sections des vues). */
export function cellParts(value: string) {
  return cellText(value).split(/\s*[,;]\s*/).filter(Boolean)
}

/** Un nombre lu dans une case (« 1 250,5 PO » → 1250.5) ; `null` si elle n'en contient pas. */
export function cellNumber(value: string) {
  const match = cellText(value).replace(/\s/g, "").match(/-?\d+(?:[.,]\d+)?/)
  return match ? Number(match[0].replace(",", ".")) : null
}

/* ---------- La définition d'une statistique ---------- */

export type StatMeasure = "count" | "sum" | "average" | "max" | "min"
export type StatForm = "number" | "bars" | "ranking" | "donut" | "table"
export type StatPercent = "none" | "total" | "row" | "column"

export type StatDefinition = {
  id: string
  title: string
  measure: StatMeasure
  /** La colonne mesurée (nombres) ; absente pour « Compter ». */
  field?: string
  /** L'onglet de données dont viennent les lignes ; absent : tout l'index. */
  source?: string
  /** Les conditions (toutes doivent être vraies), comme celles des onglets-fenêtres. */
  where?: ViewCondition[]
  /** Réparties par (lignes du tableau) : trois niveaux au plus. */
  by: string[]
  /** En colonnes (tableau croisé) : deux niveaux au plus. */
  cols?: string[]
  form: StatForm
  /** Tableau : valeurs gardées par niveau de colonnes (0 : toutes) ; classement : les N premières. */
  top?: number
  percent?: StatPercent
  /** Épinglée en tête de l'onglet. */
  pinned?: true
}

export const STAT_LIMITS = { stats: 24, levels: 3, columnLevels: 2, conditions: 6, title: 90 } as const

export const statMeasures: Array<{ value: StatMeasure; label: string; numeric: boolean }> = [
  { value: "count", label: "Compter", numeric: false },
  { value: "sum", label: "Additionner", numeric: true },
  { value: "average", label: "Moyenne de", numeric: true },
  { value: "max", label: "Maximum de", numeric: true },
  { value: "min", label: "Minimum de", numeric: true },
]

export const statForms: Array<{ value: StatForm; label: string }> = [
  { value: "number", label: "Chiffre" },
  { value: "bars", label: "Barres" },
  { value: "ranking", label: "Classement" },
  { value: "donut", label: "Anneau" },
  { value: "table", label: "Tableau croisé" },
]

export const tableTopChoices = [0, 3, 4, 5, 6, 8, 10] as const
export const rankingTopChoices = [5, 10, 15, 20] as const
const TABLE_TOP = 6
const RANKING_TOP = 10

const measureSet = new Set<string>(statMeasures.map((measure) => measure.value))
const formSet = new Set<string>(statForms.map((form) => form.value))
const text = (value: unknown, max = 120) => typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : ""
const fold = (value: string) => value.toLocaleLowerCase("fr")

const additive = (stat: Pick<StatDefinition, "measure">) => stat.measure === "count" || stat.measure === "sum"

/** Pourquoi une forme ne convient pas à la phrase (vide : elle convient). */
export function formProblem(stat: Pick<StatDefinition, "by" | "cols" | "measure">, form: StatForm) {
  const levels = stat.by.length
  const columns = stat.cols?.length ?? 0
  switch (form) {
    case "number": return levels ? "Un seul nombre : choisis « rien » dans « réparties par »." : ""
    case "bars":
    case "ranking": return levels !== 1 || columns ? "Une seule colonne dans « réparties par », sans « en colonnes »." : ""
    case "donut": return levels !== 1 || columns ? "Une seule colonne dans « réparties par », sans « en colonnes »." : additive(stat) ? "" : "Un anneau additionne des parts : choisis « Compter » ou « Additionner »."
    case "table": return levels ? "" : "Choisis au moins une colonne dans « réparties par »."
  }
}

/** Les manières d'afficher les valeurs : en pourcentage seulement pour ce qui s'additionne. */
export function percentChoices(stat: Pick<StatDefinition, "measure" | "form">): Array<{ value: StatPercent; label: string }> {
  const values: Array<{ value: StatPercent; label: string }> = [{ value: "none", label: "les valeurs" }]
  if (!additive(stat) || stat.form === "ranking" || stat.form === "donut") return values
  values.push({ value: "total", label: "% du total" })
  if (stat.form === "table") values.push({ value: "row", label: "% de la ligne" }, { value: "column", label: "% de la colonne" })
  return values
}

/** La phrase garde une forme qui lui convient, et des réglages que cette forme comprend. */
export function fitForm(stat: StatDefinition): StatDefinition {
  const next: StatDefinition = { ...stat, by: [...stat.by], ...(stat.cols ? { cols: [...stat.cols] } : {}) }
  if (!next.by.length) delete next.cols
  if (next.cols && !next.cols.length) delete next.cols
  if (formProblem(next, next.form)) {
    const levels = next.by.length
    next.form = levels === 0 ? "number" : levels === 1 && !next.cols ? "bars" : "table"
  }
  if (next.form === "table") {
    if (next.top === undefined || !(tableTopChoices as readonly number[]).includes(next.top)) next.top = TABLE_TOP
    if (!next.cols) delete next.top
  } else if (next.form === "ranking") {
    if (next.top === undefined || !(rankingTopChoices as readonly number[]).includes(next.top)) next.top = RANKING_TOP
  } else delete next.top
  if (!next.percent || next.percent === "none" || !percentChoices(next).some((choice) => choice.value === next.percent)) delete next.percent
  return next
}

/** Un titre proposé tant que la statistique n'a pas de nom. */
export function autoStatTitle(stat: Pick<StatDefinition, "measure" | "field" | "by" | "cols" | "where" | "source">) {
  const kind = { sum: "total", average: "moyen", max: "maximum", min: "minimum" } as const
  const what = stat.measure === "count" || !stat.field ? (stat.by.length ? "Lignes" : "Nombre de lignes") : `${stat.field} ${kind[stat.measure as keyof typeof kind]}`
  const by = stat.by.length ? ` par ${stat.by.join(" › ")}${stat.cols?.length ? ` × ${stat.cols.join(" › ")}` : ""}` : ""
  const where = (stat.where ?? []).map(describeCondition).join(" et ")
  const title = `${what}${by}${stat.source ? ` · ${stat.source}` : ""}${where ? ` · ${where}` : ""}`
  return title.length > STAT_LIMITS.title ? `${title.slice(0, STAT_LIMITS.title - 1)}…` : title
}

function columnList(value: unknown, max: number, taken: string[] = []) {
  const seen = new Set(taken.map(fold))
  const out: string[] = []
  for (const entry of Array.isArray(value) ? value : []) {
    const column = text(entry)
    if (!column || seen.has(fold(column))) continue
    seen.add(fold(column))
    out.push(column)
    if (out.length >= max) break
  }
  return out
}

/** Une statistique propre (champs connus, longueurs bornées) ; `null` si elle est illisible. */
export function cleanStat(value: unknown, fallbackId = "stat"): StatDefinition | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  const raw = value as Record<string, unknown>
  const id = typeof raw.id === "string" && /^[A-Za-z0-9_-]{1,24}$/.test(raw.id) ? raw.id : fallbackId
  let measure: StatMeasure = measureSet.has(String(raw.measure)) ? raw.measure as StatMeasure : "count"
  const field = measure === "count" ? "" : text(raw.field)
  if (!field) measure = "count"
  const by = columnList(raw.by, STAT_LIMITS.levels)
  const cols = by.length ? columnList(raw.cols, STAT_LIMITS.columnLevels, by) : []
  const where = (Array.isArray(raw.where) ? raw.where : []).flatMap((entry): ViewCondition[] => {
    if (!entry || typeof entry !== "object") return []
    const condition = entry as Record<string, unknown>
    const column = text(condition.column)
    return column && isViewOperator(condition.operator) ? [{ column, operator: condition.operator, value: text(condition.value) }] : []
  }).slice(0, STAT_LIMITS.conditions)
  const source = text(raw.source)
  const stat: StatDefinition = {
    id,
    title: "",
    measure,
    ...(field ? { field } : {}),
    ...(source && source !== "*" ? { source } : {}),
    ...(where.length ? { where } : {}),
    by,
    ...(cols.length ? { cols } : {}),
    form: formSet.has(String(raw.form)) ? raw.form as StatForm : "number",
    ...(typeof raw.top === "number" && Number.isInteger(raw.top) ? { top: raw.top } : {}),
    ...(raw.percent === "total" || raw.percent === "row" || raw.percent === "column" ? { percent: raw.percent } : {}),
    ...(raw.pinned === true ? { pinned: true as const } : {}),
  }
  const fitted = fitForm(stat)
  fitted.title = text(raw.title, STAT_LIMITS.title) || autoStatTitle(fitted)
  return fitted
}

/** Les statistiques d'un onglet : 24 au plus, chacune une fois (identifiants uniques). */
export function cleanStats(value: unknown): StatDefinition[] {
  const used = new Set<string>()
  const out: StatDefinition[] = []
  for (const [index, entry] of (Array.isArray(value) ? value : []).entries()) {
    const stat = cleanStat(entry, `stat-${index + 1}`)
    if (!stat) continue
    let id = stat.id
    for (let suffix = 2; used.has(id); suffix += 1) id = `${stat.id.slice(0, 20)}-${suffix}`
    used.add(id)
    out.push({ ...stat, id })
    if (out.length >= STAT_LIMITS.stats) break
  }
  return out
}

/** Un identifiant neuf, absent de la liste. */
export function newStatId(existing: Array<{ id: string }>, random: () => number = Math.random) {
  const taken = new Set(existing.map((stat) => stat.id))
  for (;;) {
    const id = `st-${Math.floor(random() * 36 ** 6).toString(36).padStart(6, "0")}`
    if (!taken.has(id)) return id
  }
}

/** Les épinglées en tête, chacune gardant sa place parmi les siennes. */
export function pinnedFirst<T extends { pinned?: true }>(stats: T[]) {
  return [...stats.filter((stat) => stat.pinned), ...stats.filter((stat) => !stat.pinned)]
}

/* ---------- Le calcul ---------- */

export type CellOf<T> = (row: T, column: string) => string

/** Une case qui est un nombre, avec au plus une courte unité (« 12 PO », « 40 m », « 1D30+20 ») ; pas « Potion n°2 ». */
export function isNumberCell(value: string) {
  const text = cellText(value)
  const match = text.replace(/(\d)\s+(?=\d{3}\b)/g, "$1").match(/-?\d+(?:[.,]\d+)?/)
  if (!match) return false
  return text.replace(/(\d)\s+(?=\d{3}\b)/g, "$1").replace(match[0], "").replace(/\s+/g, "").length <= 5
}

/** Les colonnes qui contiennent des nombres (au moins `threshold` des cases remplies) : Additionner, Moyenne… */
export function numericColumns<T>(columns: string[], rows: T[], valueOf: CellOf<T>, threshold = 0.6) {
  const sample = rows.length > 600 ? rows.filter((_, index) => index % Math.ceil(rows.length / 600) === 0) : rows
  return columns.filter((column) => {
    let filled = 0
    let numbers = 0
    for (const row of sample) {
      const value = cellText(valueOf(row, column))
      if (!value) continue
      filled += 1
      if (isNumberCell(value)) numbers += 1
    }
    return numbers > 0 && numbers / filled >= threshold
  })
}

/** Les lignes de la source choisie (un onglet, ou tout l'index). */
export function scopeRows<T>(stat: Pick<StatDefinition, "source">, rows: T[], tabOf?: (row: T) => string) {
  return stat.source && tabOf ? rows.filter((row) => tabOf(row) === stat.source) : rows
}

/** Les lignes que compte la statistique : sa source, puis ses conditions. */
export function statRows<T>(stat: Pick<StatDefinition, "source" | "where">, rows: T[], valueOf: CellOf<T>, tabOf?: (row: T) => string) {
  const conditions = (stat.where ?? []).filter((condition) => condition.column)
  return scopeRows(stat, rows, tabOf).filter((row) => conditions.every((condition) => matchesCondition(condition, valueOf(row, condition.column))))
}

const round = (value: number) => Math.round(value * 100) / 100

/** La mesure de quelques lignes : leur nombre, ou la somme (moyenne, max, min) d'une colonne. */
export function aggregate<T>(stat: Pick<StatDefinition, "measure" | "field">, rows: T[], valueOf: CellOf<T>): number | null {
  if (stat.measure === "count" || !stat.field) return rows.length
  const numbers = rows.map((row) => cellNumber(valueOf(row, stat.field!))).filter((number): number is number => number !== null)
  if (!numbers.length) return stat.measure === "sum" ? 0 : null
  if (stat.measure === "max") return Math.max(...numbers)
  if (stat.measure === "min") return Math.min(...numbers)
  const sum = numbers.reduce((total, number) => total + number, 0)
  return round(stat.measure === "sum" ? sum : sum / numbers.length)
}

/** « Autres » : les valeurs regroupées ; une clé qui ne peut pas venir d'une case. */
export const STAT_OTHERS = "\u0000autres"

export function statKeyLabel(group: { key: string; label: string }) {
  return group.key === STAT_OTHERS ? "Autres" : group.label || "Sans valeur"
}

type Key = { key: string; label: string }

function keysOf(value: string): Key[] {
  const parts = cellParts(value)
  return parts.length ? parts.map((part) => ({ key: fold(part), label: part })) : [{ key: "", label: "" }]
}

/** Les `limit` valeurs les plus fréquentes d'une colonne ; `null` si toutes tiennent (une seule de trop ne fait pas d'« Autres »). */
export function frequentKeys<T>(rows: T[], valueOf: CellOf<T>, column: string, limit: number) {
  if (!limit) return null
  const counts = new Map<string, { label: string; count: number }>()
  for (const row of rows) for (const { key, label } of keysOf(valueOf(row, column))) {
    if (!key) continue
    const entry = counts.get(key) ?? { label, count: 0 }
    entry.count += 1
    counts.set(key, entry)
  }
  if (counts.size <= limit + 1) return null
  const kept = [...counts.entries()].sort((left, right) => right[1].count - left[1].count || left[1].label.localeCompare(right[1].label, "fr", { numeric: true })).slice(0, limit)
  return { keep: new Set(kept.map(([key]) => key)), hidden: counts.size - limit }
}

export type StatGroup<T> = { key: string; label: string; rows: T[] }

/**
 * Les lignes rangées par valeur d'une colonne : une case à plusieurs valeurs va dans chacune
 * (comme les sections des vues), « Sans valeur » à la fin, « Autres » juste avant. `keep` : les
 * valeurs gardées, les autres vont dans « Autres » (une ligne n'y compte qu'une fois).
 */
export function groupStatRows<T>(rows: T[], valueOf: CellOf<T>, column: string, options: { order?: string[]; keep?: Set<string> | null } = {}): StatGroup<T>[] {
  const groups = new Map<string, StatGroup<T>>()
  for (const row of rows) {
    const seen = new Set<string>()
    for (const found of keysOf(valueOf(row, column))) {
      const key = found.key && options.keep && !options.keep.has(found.key) ? STAT_OTHERS : found.key
      if (seen.has(key)) continue
      seen.add(key)
      const group = groups.get(key) ?? { key, label: key === STAT_OTHERS ? "" : found.label, rows: [] }
      group.rows.push(row)
      groups.set(key, group)
    }
  }
  const rank = new Map((options.order ?? []).map((name, index) => [fold(name), index]))
  const place = (group: StatGroup<T>) => group.key === "" ? 2 : group.key === STAT_OTHERS ? 1 : 0
  return [...groups.values()].sort((left, right) => place(left) - place(right)
    || (rank.get(left.key) ?? Number.MAX_SAFE_INTEGER) - (rank.get(right.key) ?? Number.MAX_SAFE_INTEGER)
    || left.label.localeCompare(right.label, "fr", { numeric: true }))
}

export type StatPart<T> = StatGroup<T> & { value: number | null }

/**
 * La répartition d'une colonne (barres, classement, anneau). Au-delà de `limit` valeurs, les
 * moins fréquentes vont dans « Autres », sauf si elles sont dépliées (`expanded`).
 */
export function statBreakdown<T>(stat: Pick<StatDefinition, "measure" | "field" | "by">, rows: T[], valueOf: CellOf<T>, options: { order?: string[]; limit?: number; expanded?: boolean; byValue?: boolean } = {}) {
  const column = stat.by[0] ?? ""
  const frequent = options.limit ? frequentKeys(rows, valueOf, column, options.limit) : null
  const parts: StatPart<T>[] = groupStatRows(rows, valueOf, column, { order: options.order, keep: options.expanded ? null : frequent?.keep })
    .map((group) => ({ ...group, value: aggregate(stat, group.rows, valueOf) }))
  if (options.byValue && !options.order?.length) {
    const place = (part: StatPart<T>) => part.key === "" ? 2 : part.key === STAT_OTHERS ? 1 : 0
    parts.sort((left, right) => place(left) - place(right) || (right.value ?? -Infinity) - (left.value ?? -Infinity) || left.label.localeCompare(right.label, "fr", { numeric: true }))
  }
  return { parts, hidden: frequent?.hidden ?? 0, revealed: options.expanded && frequent ? (key: string) => key !== "" && !frequent.keep.has(key) : () => false }
}

export type StatTableNode<T> = {
  key: string
  label: string
  path: string[]
  /** Les libellés du chemin (« Sans valeur », « Autres » compris). */
  labels: string[]
  depth: number
  rows: T[]
  total: number | null
  cells: Array<{ rows: T[]; value: number | null }>
  children: StatTableNode<T>[]
}

export type StatTableHeader = { key: string; label: string; span: number; depth: number; leaf: boolean; revealed: boolean }

/**
 * Le tableau croisé : les lignes rangées par niveaux (`by`), les colonnes par niveaux (`cols`),
 * chaque niveau de colonnes limité à ses `top` valeurs les plus fréquentes (le reste en « Autres »,
 * sauf niveau déplié). Sans colonne : seulement le total de chaque ligne.
 */
export function statTable<T>(stat: Pick<StatDefinition, "measure" | "field" | "by" | "cols" | "top">, rows: T[], valueOf: CellOf<T>, options: { orderOf?: (column: string) => string[]; expanded?: (level: number) => boolean } = {}) {
  const levels = stat.cols ?? []
  const frequent = levels.map((column, level) => ({ info: frequentKeys(rows, valueOf, column, stat.top ?? 0), open: Boolean(options.expanded?.(level)) }))
  const keepOf = (level: number) => frequent[level].open ? null : frequent[level].info?.keep ?? null
  const keyMatches = (row: T, level: number, key: string) => {
    const keep = keepOf(level)
    return keysOf(valueOf(row, levels[level])).some((found) => (found.key && keep && !keep.has(found.key) ? STAT_OTHERS : found.key) === key)
  }
  type ColumnNode = { key: string; label: string; depth: number; labels: string[]; children: ColumnNode[]; test: (row: T) => boolean }
  const build = (subset: T[], level: number, test: (row: T) => boolean, labels: string[]): ColumnNode[] => groupStatRows(subset, valueOf, levels[level], { order: options.orderOf?.(levels[level]), keep: keepOf(level) }).map((group) => {
    const own = (row: T) => test(row) && keyMatches(row, level, group.key)
    const path = [...labels, statKeyLabel(group)]
    return { key: group.key, label: group.label, depth: level, labels: path, test: own, children: level + 1 < levels.length ? build(group.rows, level + 1, own, path) : [] }
  })
  const columnTree = levels.length ? build(rows, 0, () => true, []) : []
  const leaves: ColumnNode[] = []
  const walk = (nodes: ColumnNode[]) => nodes.forEach((node) => node.children.length ? walk(node.children) : leaves.push(node))
  walk(columnTree)
  const width = (node: ColumnNode): number => node.children.length ? node.children.reduce((total, child) => total + width(child), 0) : 1
  const headers: StatTableHeader[][] = levels.map(() => [])
  const collect = (nodes: ColumnNode[]) => nodes.forEach((node) => {
    const info = frequent[node.depth]
    headers[node.depth].push({ key: node.key, label: node.label, span: width(node), depth: node.depth, leaf: !node.children.length, revealed: Boolean(info.open && info.info && node.key && !info.info.keep.has(node.key)) })
    collect(node.children)
  })
  collect(columnTree)
  const cellsOf = (subset: T[]) => leaves.map((leaf) => { const inside = subset.filter(leaf.test); return { rows: inside, value: inside.length ? aggregate(stat, inside, valueOf) : null } })
  const tree = (subset: T[], depth: number, path: string[], labels: string[]): StatTableNode<T>[] => depth >= stat.by.length ? [] : groupStatRows(subset, valueOf, stat.by[depth], { order: options.orderOf?.(stat.by[depth]) }).map((group) => ({
    key: group.key,
    label: group.label,
    path: [...path, group.key],
    labels: [...labels, statKeyLabel(group)],
    depth,
    rows: group.rows,
    total: aggregate(stat, group.rows, valueOf),
    cells: cellsOf(group.rows),
    children: tree(group.rows, depth + 1, [...path, group.key], [...labels, statKeyLabel(group)]),
  }))
  const total: StatTableNode<T> = { key: "*", label: "Total", path: [], labels: [], depth: -1, rows, total: aggregate(stat, rows, valueOf), cells: cellsOf(rows), children: tree(rows, 0, [], []) }
  return { total, headers, leaves: leaves.map((leaf) => leaf.labels), hidden: frequent.map((entry) => entry.info?.hidden ?? 0), open: frequent.map((entry) => entry.open) }
}

/** Une valeur en part d'un tout, en pour cent ; `null` sans tout. */
export function percentOf(value: number | null, of: number | null) {
  return value === null || !of ? null : (value / of) * 100
}

export function formatStatNumber(value: number | null) {
  return value === null ? "—" : value.toLocaleString("fr-FR", { maximumFractionDigits: 2 })
}
