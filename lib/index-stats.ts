/**
 * Les statistiques d'un index : une phrase à trous (« Compter les lignes où … réparties par …
 * en colonnes … comparé à … ») enregistrée sur le serveur partagé (Modifier › Stats), et son
 * calcul sur les lignes déjà chargées de l'index. Aucune lecture Google : tout se calcule dans
 * la page.
 *
 * Les colonnes regroupées (« Rareté (P+S) » = Rareté principale + Rareté secondaire) se
 * choisissent comme une colonne : chaque ligne compte alors une fois par colonne remplie du
 * groupe (un « emplacement »), deux groupes de même taille s'alignent rang par rang.
 *
 * Règles pures : la page, le serveur (nettoyage) et les tests s'en servent.
 */
import { describeCondition, isViewOperator, matchesCondition, viewOperators, type ViewCondition, type ViewOperator } from "@/lib/index-views"

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
export type StatForm = "number" | "gauge" | "bars" | "columns" | "ranking" | "donut" | "treemap" | "stacked" | "stacked100" | "grouped" | "cross" | "table" | "sankey" | "histogram" | "scatter"
export type StatPercent = "none" | "total" | "row" | "column" | "parent"
/** Les comparaisons des onglets-fenêtres, plus « au moins » et « au plus » (nombres, listes ordonnées). */
export type StatOperator = ViewOperator | "au-moins" | "au-plus"
export type StatLeaf = { column: string; operator: StatOperator; value: string }
/** Une condition ; `or` : d'autres conditions dont une seule suffit (« Attributs contient Poison ou Saignante »). */
export type StatCondition = StatLeaf & { or?: StatLeaf[] }
export type StatColorMode = "column" | "hue" | "value"
export type StatColors = {
  /** De la colonne (ses couleurs, sinon la palette), une teinte, ou une couleur choisie par valeur. */
  mode?: StatColorMode
  hue?: string
  /** Tableaux : la teinte du dégradé. */
  ramp?: string
  values?: Record<string, string>
}
export type StatHistogramScale = "auto" | "lin" | "log"

export type StatDefinition = {
  id: string
  title: string
  measure: StatMeasure
  /** La colonne mesurée (nombres) ; absente pour « Compter ». */
  field?: string
  /** L'onglet de données dont viennent les lignes ; absent : tout l'index. */
  source?: string
  /** Les conditions (toutes doivent être vraies ; chacune peut avoir des « ou »). */
  where?: StatCondition[]
  /** Réparties par (lignes du tableau) : trois niveaux au plus. */
  by: string[]
  /** En colonnes (premier bloc) : deux niveaux au plus. */
  cols?: string[]
  /** Tableau à niveaux : d'autres blocs de colonnes, posés à côté du premier. */
  blocks?: string[][]
  form: StatForm
  /** Tableaux, barres empilées, flux : valeurs gardées par niveau de colonnes (0 : toutes) ; classement : les N premières. */
  top?: number
  percent?: StatPercent
  /** Une case à plusieurs valeurs compte comme une seule valeur (« Feu, Glace »), pas dans chacune. */
  joined?: true
  /** Colonnes regroupées : chaque ligne une seule fois par valeur, au lieu d'une fois par colonne du groupe. */
  once?: true
  /** Comparé au reste de l'index, ou à d'autres lignes (`compareWhere`). */
  compare?: "rest" | "filter"
  compareWhere?: StatCondition[]
  /** Jauge : l'objectif. */
  goal?: number
  /** Histogramme : la colonne de nombres, le nombre de tranches, leur taille. */
  hist?: { field: string; bins: number; scale: StatHistogramScale }
  /** Nuage de points : les deux colonnes de nombres. */
  scatter?: { x: string; y: string }
  colors?: StatColors
  /** Épinglée en tête de l'onglet. */
  pinned?: true
  /** Dans l'onglet stat : sa largeur (absente : selon sa forme, voir `pinnedWidth`). */
  width?: StatWidth
  /** Dans l'onglet stat : ses lignes concernées repliées ou masquées (absent : affichées). */
  rows?: "folded" | "hidden"
}

/** La largeur d'une statistique épinglée dans l'onglet stat, sur une grille de six colonnes. */
export type StatWidth = "third" | "half" | "two-thirds" | "full"
export const statWidths: Array<{ value: StatWidth; label: string; span: number }> = [
  { value: "third", label: "⅓", span: 2 },
  { value: "half", label: "½", span: 3 },
  { value: "two-thirds", label: "⅔", span: 4 },
  { value: "full", label: "Pleine", span: 6 },
]
const widthSet = new Set<string>(statWidths.map((width) => width.value))

/**
 * La largeur d'une épinglée : la sienne, sinon selon sa forme — un chiffre ou une jauge sur un
 * tiers, un tableau ou un flux sur toute la ligne, le reste sur une demi-ligne.
 */
export function pinnedWidth(stat: Pick<StatDefinition, "width" | "form">): StatWidth {
  if (stat.width) return stat.width
  if (stat.form === "number" || stat.form === "gauge") return "third"
  if (stat.form === "table" || stat.form === "cross" || stat.form === "sankey" || stat.form === "scatter") return "full"
  return "half"
}

/** Avance (-1) ou recule (+1) une épinglée parmi les épinglées ; les autres ne bougent pas. */
export function movePinned<T extends { id: string; pinned?: true }>(stats: T[], id: string, step: -1 | 1) {
  const pinnedAt = stats.flatMap((stat, index) => stat.pinned ? [index] : [])
  const position = pinnedAt.findIndex((index) => stats[index].id === id)
  const swapWith = pinnedAt[position + step]
  if (position < 0 || swapWith === undefined) return stats
  const next = [...stats]
  ;[next[pinnedAt[position]], next[swapWith]] = [next[swapWith], next[pinnedAt[position]]]
  return next
}

export const STAT_LIMITS = { stats: 24, levels: 3, columnLevels: 2, blocks: 3, conditions: 6, or: 4, title: 90, colorValues: 24 } as const

export const statMeasures: Array<{ value: StatMeasure; label: string; numeric: boolean }> = [
  { value: "count", label: "Compter", numeric: false },
  { value: "sum", label: "Additionner", numeric: true },
  { value: "average", label: "Moyenne de", numeric: true },
  { value: "max", label: "Maximum de", numeric: true },
  { value: "min", label: "Minimum de", numeric: true },
]

/** Les formes, dans l'ordre du choix. */
export const statForms: Array<{ value: StatForm; label: string }> = [
  { value: "number", label: "Tuile" },
  { value: "gauge", label: "Jauge" },
  { value: "bars", label: "Barres" },
  { value: "columns", label: "Colonnes" },
  { value: "ranking", label: "Classement" },
  { value: "donut", label: "Anneau" },
  { value: "treemap", label: "Mosaïque" },
  { value: "stacked", label: "Barres empilées" },
  { value: "stacked100", label: "Empilées 100 %" },
  { value: "grouped", label: "Barres groupées" },
  { value: "cross", label: "Tableau croisé" },
  { value: "table", label: "Tableau à niveaux" },
  { value: "sankey", label: "Flux" },
  { value: "histogram", label: "Histogramme" },
  { value: "scatter", label: "Nuage de points" },
]

export const statOperators: Array<{ value: StatOperator; label: string; needsValue: boolean }> = [
  ...viewOperators.slice(0, 2),
  { value: "au-moins", label: "est au moins", needsValue: true },
  { value: "au-plus", label: "est au plus", needsValue: true },
  ...viewOperators.slice(2),
]

export const tableTopChoices = [0, 3, 4, 5, 6, 8, 10] as const
export const rankingTopChoices = [5, 10, 15, 20] as const
export const histogramBinChoices = [4, 5, 6, 8, 10, 12] as const
const TABLE_TOP = 6
const RANKING_TOP = 10
/** Les formes qui savent comparer deux séries. */
export const COMPARE_FORMS: readonly StatForm[] = ["number", "bars", "columns"]
/** Les formes qui gardent les valeurs les plus fréquentes d'une colonne (« top »). */
const TOP_FORMS = new Set<StatForm>(["table", "cross", "stacked", "stacked100", "grouped", "sankey"])

const measureSet = new Set<string>(statMeasures.map((measure) => measure.value))
const formSet = new Set<string>(statForms.map((form) => form.value))
const text = (value: unknown, max = 120) => typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : ""
const fold = (value: string) => value.toLocaleLowerCase("fr")
const hexColor = (value: unknown) => typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value.trim()) ? value.trim().toLowerCase() : ""

export const isStatOperator = (value: unknown): value is StatOperator => value === "au-moins" || value === "au-plus" || isViewOperator(value)

const additive = (stat: Pick<StatDefinition, "measure">) => stat.measure === "count" || stat.measure === "sum"

/** Les blocs de colonnes : le premier (`cols`), puis ceux posés à côté (`blocks`). */
export function statColumnBlocks(stat: Pick<StatDefinition, "cols" | "blocks">) {
  return [stat.cols ?? [], ...(stat.blocks ?? [])].filter((block) => block.length > 0)
}

/** Toutes les colonnes qui rangent les lignes : réparties par, puis en colonnes (tous blocs). */
export function statDimensions(stat: Pick<StatDefinition, "by" | "cols" | "blocks">) {
  return [...stat.by, ...statColumnBlocks(stat).flat()]
}

export type FormContext = {
  /** Le nombre de valeurs de la colonne de « réparties par » (Colonnes : 16 au plus). */
  distinct?: number
  /** La statistique compte des emplacements (colonnes regroupées). */
  slots?: boolean
  /** Le nombre de colonnes de nombres de l'index. */
  numeric?: number
}

/** Pourquoi une forme ne convient pas à la phrase (vide : elle convient), et ce qu'il faut changer. */
export function formProblem(stat: Pick<StatDefinition, "by" | "cols" | "measure"> & Partial<Pick<StatDefinition, "blocks" | "compare">>, form: StatForm, context: FormContext = {}): string {
  const levels = stat.by.length
  const blocks = statColumnBlocks(stat)
  const simple = blocks.length === 1 && blocks[0].length === 1
  const sum = additive(stat) ? "" : "Elle additionne des parts : choisis « Compter » ou « Additionner » au début de la phrase."
  const one = levels === 0 ? "Choisis une colonne dans « réparties par »." : levels > 1 || blocks.length ? "Garde une seule colonne dans « réparties par », sans « en colonnes »." : ""
  switch (form) {
    case "number":
    case "gauge": return levels || blocks.length ? "Elle donne un seul nombre : choisis « rien » dans « réparties par »." : ""
    case "histogram": return levels || blocks.length ? "Elle compte les lignes par tranche d’un nombre (Prix, Valeur…) : choisis « rien » dans « réparties par »." : context.numeric === 0 ? "Aucune colonne de nombres dans cet index." : ""
    case "scatter": return levels > 1 || blocks.length ? "Elle place chaque ligne selon deux nombres ; « réparties par » ne sert qu’à colorer les points : garde au plus une colonne, sans « en colonnes »." : context.slots ? "Pas avec des colonnes regroupées : un point est une ligne." : context.numeric !== undefined && context.numeric < 2 ? "Il faut deux colonnes de nombres dans l’index." : ""
    case "bars":
    case "ranking": return one
    case "columns": return one || (context.distinct !== undefined && context.distinct > 16 ? `${context.distinct} valeurs, c’est trop pour des colonnes : prends Barres ou Classement.` : "")
    case "donut": return one || sum || (stat.compare ? "Pas de comparaison dans un anneau : remets « comparé à » sur « rien »." : "")
    case "treemap": return levels === 0 ? "Choisis une ou deux colonnes dans « réparties par » (ex. Type › Sous-type)." : levels > 2 || blocks.length ? "Deux niveaux au plus dans « réparties par », sans « en colonnes »." : sum
    case "stacked":
    case "stacked100":
    case "grouped":
      if (levels !== 1) return "Une colonne dans « réparties par » (les barres), une dans « en colonnes » (les morceaux)."
      if (!simple) return blocks.length ? "Une seule colonne dans « en colonnes » : elle fait les morceaux de chaque barre." : "Ajoute « + en colonnes » : cette colonne fait les morceaux de chaque barre."
      return form === "grouped" ? "" : sum
    case "sankey": return (levels === 1 && simple) || (levels === 2 && !blocks.length) ? sum : "Le flux relie deux colonnes : une dans « réparties par » et une « en colonnes » (ex. Rareté principale → Emplacement principal)."
    case "cross": return levels === 1 && simple ? "" : levels === 0 ? "Une colonne en lignes (« réparties par ») et une « en colonnes »." : !blocks.length ? "Ajoute « + en colonnes » : une colonne pour les colonnes du tableau." : "Plusieurs niveaux ou blocs : c’est le Tableau à niveaux."
    case "table": return levels ? "" : "Choisis au moins une colonne dans « réparties par »."
  }
}

/** Les manières d'afficher les valeurs : en pourcentage seulement pour ce qui s'additionne. */
export function percentChoices(stat: Pick<StatDefinition, "measure" | "form"> & { by?: string[] }): Array<{ value: StatPercent; label: string }> {
  const values: Array<{ value: StatPercent; label: string }> = [{ value: "none", label: "les valeurs" }]
  if (!additive(stat)) return values
  if (stat.form === "number" || stat.form === "bars" || stat.form === "columns") values.push({ value: "total", label: "% du total" })
  if (stat.form === "table" || stat.form === "cross") values.push({ value: "total", label: "% du total" }, { value: "row", label: "% de la ligne" }, { value: "column", label: "% de la colonne" })
  if (stat.form === "table" && (stat.by?.length ?? 0) > 1) values.push({ value: "parent", label: "% du parent" })
  return values
}

/** La phrase garde une forme qui lui convient, et des réglages que cette forme comprend. */
export function fitForm(stat: StatDefinition, context: FormContext = {}): StatDefinition {
  const blocks = statColumnBlocks(stat).map((block) => [...block])
  const next: StatDefinition = { ...stat, by: [...stat.by] }
  delete next.cols
  delete next.blocks
  if (next.by.length && blocks.length) {
    next.cols = blocks[0]
    if (blocks.length > 1) next.blocks = blocks.slice(1)
  }
  if (formProblem(next, next.form, context)) {
    const levels = next.by.length
    next.form = levels === 0 ? "number" : levels === 1 && !next.cols ? "bars" : "table"
  }
  if (!COMPARE_FORMS.includes(next.form)) delete next.compare
  if (next.compare !== "filter") delete next.compareWhere
  if (TOP_FORMS.has(next.form)) {
    if (next.top === undefined || !(tableTopChoices as readonly number[]).includes(next.top)) next.top = TABLE_TOP
    if (!next.cols) delete next.top
  } else if (next.form === "ranking") {
    if (next.top === undefined || !(rankingTopChoices as readonly number[]).includes(next.top)) next.top = RANKING_TOP
  } else delete next.top
  if (!next.percent || next.percent === "none" || !percentChoices(next).some((choice) => choice.value === next.percent)) delete next.percent
  return next
}

/** Une condition et ses « ou », lisibles (« (Attributs contient « Poison » ou … ») ». */
export function describeStatCondition(condition: StatCondition, labelOf: (column: string) => string = (column) => column) {
  const one = (leaf: StatLeaf) => {
    const column = labelOf(leaf.column)
    if (leaf.operator === "au-moins" || leaf.operator === "au-plus") return `${column} ${leaf.operator === "au-moins" ? "est au moins" : "est au plus"} « ${leaf.value} »`
    return describeCondition({ ...leaf, column } as ViewCondition)
  }
  const leaves = [condition, ...(condition.or ?? [])]
  return leaves.length > 1 ? `(${leaves.map(one).join(" ou ")})` : one(condition)
}

export function describeStatConditions(conditions: StatCondition[] | undefined, labelOf?: (column: string) => string) {
  return (conditions ?? []).filter((condition) => condition.column).map((condition) => describeStatCondition(condition, labelOf)).join(" et ")
}

/** Un titre proposé tant que la statistique n'a pas de nom. */
export function autoStatTitle(stat: Pick<StatDefinition, "measure" | "field" | "by" | "cols" | "where" | "source"> & Partial<Pick<StatDefinition, "blocks" | "form" | "hist" | "scatter" | "compare">>, labelOf: (column: string) => string = (column) => column) {
  const kind = { sum: "total", average: "moyen", max: "maximum", min: "minimum" } as const
  const what = stat.measure === "count" || !stat.field ? (stat.by.length ? "Lignes" : "Nombre de lignes") : `${stat.field} ${kind[stat.measure as keyof typeof kind]}`
  const blocks = statColumnBlocks(stat)
  const by = stat.form === "histogram" && stat.hist ? ` par tranche de ${stat.hist.field}` : stat.form === "scatter" && stat.scatter ? ` : ${stat.scatter.y} selon ${stat.scatter.x}` : stat.by.length ? ` par ${stat.by.map(labelOf).join(" › ")}${blocks.length ? ` × ${blocks.map((block) => block.map(labelOf).join(" › ")).join(" + ")}` : ""}` : ""
  const where = describeStatConditions(stat.where, labelOf)
  const head = stat.form === "histogram" || stat.form === "scatter" ? "Lignes" : what
  const title = `${head}${by}${stat.source ? ` · ${stat.source}` : ""}${where ? ` · ${where}` : ""}${stat.compare === "rest" ? " · contre le reste" : ""}`
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

function cleanLeaf(entry: unknown): StatLeaf | null {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null
  const condition = entry as Record<string, unknown>
  const column = text(condition.column)
  return column && isStatOperator(condition.operator) ? { column, operator: condition.operator, value: text(condition.value) } : null
}

/** Des conditions propres : six au plus, chacune avec quatre « ou » au plus. */
export function cleanStatConditions(value: unknown): StatCondition[] {
  return (Array.isArray(value) ? value : []).flatMap((entry): StatCondition[] => {
    const leaf = cleanLeaf(entry)
    if (!leaf) return []
    const or = (Array.isArray((entry as { or?: unknown }).or) ? (entry as { or: unknown[] }).or : []).map(cleanLeaf).filter((item): item is StatLeaf => Boolean(item)).slice(0, STAT_LIMITS.or)
    return [or.length ? { ...leaf, or } : leaf]
  }).slice(0, STAT_LIMITS.conditions)
}

function cleanColors(value: unknown): StatColors | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  const raw = value as Record<string, unknown>
  const colors: StatColors = {}
  if (raw.mode === "column" || raw.mode === "hue" || raw.mode === "value") colors.mode = raw.mode
  const hue = hexColor(raw.hue)
  if (hue) colors.hue = hue
  const ramp = hexColor(raw.ramp)
  if (ramp) colors.ramp = ramp
  if (raw.values && typeof raw.values === "object" && !Array.isArray(raw.values)) {
    const values = Object.entries(raw.values as Record<string, unknown>).flatMap(([key, color]) => { const name = text(key); const hex = hexColor(color); return name && hex ? [[name, hex] as const] : [] }).slice(0, STAT_LIMITS.colorValues)
    if (values.length) colors.values = Object.fromEntries(values)
  }
  return Object.keys(colors).length ? colors : null
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
  const blocks: string[][] = []
  if (cols.length) {
    const taken = [...by, ...cols]
    for (const entry of Array.isArray(raw.blocks) ? raw.blocks : []) {
      const block = columnList(entry, STAT_LIMITS.columnLevels, taken)
      if (!block.length) continue
      taken.push(...block)
      blocks.push(block)
      if (blocks.length >= STAT_LIMITS.blocks - 1) break
    }
  }
  const where = cleanStatConditions(raw.where)
  const source = text(raw.source)
  const form: StatForm = formSet.has(String(raw.form)) ? raw.form as StatForm : "number"
  const compare = raw.compare === "rest" || raw.compare === "filter" ? raw.compare : null
  const compareWhere = compare === "filter" ? cleanStatConditions(raw.compareWhere) : []
  const goal = typeof raw.goal === "number" && Number.isFinite(raw.goal) && raw.goal > 0 ? Math.min(raw.goal, 1e12) : null
  const rawHist = raw.hist && typeof raw.hist === "object" ? raw.hist as Record<string, unknown> : null
  const histField = rawHist ? text(rawHist.field) : ""
  const rawScatter = raw.scatter && typeof raw.scatter === "object" ? raw.scatter as Record<string, unknown> : null
  const scatterX = rawScatter ? text(rawScatter.x) : ""
  const scatterY = rawScatter ? text(rawScatter.y) : ""
  const colors = cleanColors(raw.colors)
  const stat: StatDefinition = {
    id,
    title: "",
    measure,
    ...(field ? { field } : {}),
    ...(source && source !== "*" ? { source } : {}),
    ...(where.length ? { where } : {}),
    by,
    ...(cols.length ? { cols } : {}),
    ...(blocks.length ? { blocks } : {}),
    form,
    ...(typeof raw.top === "number" && Number.isInteger(raw.top) ? { top: raw.top } : {}),
    ...(raw.percent === "total" || raw.percent === "row" || raw.percent === "column" || raw.percent === "parent" ? { percent: raw.percent } : {}),
    ...(raw.joined === true ? { joined: true as const } : {}),
    ...(raw.once === true ? { once: true as const } : {}),
    ...(compare === "rest" || (compare === "filter" && compareWhere.length) ? { compare } : {}),
    ...(compare === "filter" && compareWhere.length ? { compareWhere } : {}),
    ...(goal !== null && form === "gauge" ? { goal } : {}),
    ...(histField && form === "histogram" ? { hist: { field: histField, bins: (histogramBinChoices as readonly number[]).includes(Number(rawHist!.bins)) ? Number(rawHist!.bins) : 6, scale: rawHist!.scale === "lin" || rawHist!.scale === "log" ? rawHist!.scale : "auto" as StatHistogramScale } } : {}),
    ...(scatterX && scatterY && form === "scatter" ? { scatter: { x: scatterX, y: scatterY } } : {}),
    ...(colors ? { colors } : {}),
    ...(raw.pinned === true ? { pinned: true as const } : {}),
    ...(typeof raw.width === "string" && widthSet.has(raw.width) ? { width: raw.width as StatWidth } : {}),
    ...(raw.rows === "folded" || raw.rows === "hidden" ? { rows: raw.rows } : {}),
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
export function newStatId(existing: Array<{ id: string }>, random: () => number = Math.random, prefix = "st") {
  const taken = new Set(existing.map((stat) => stat.id))
  for (;;) {
    const id = `${prefix}-${Math.floor(random() * 36 ** 6).toString(36).padStart(6, "0")}`
    if (!taken.has(id)) return id
  }
}

/** Les épinglées en tête, chacune gardant sa place parmi les siennes. */
export function pinnedFirst<T extends { pinned?: true }>(stats: T[]) {
  return [...stats.filter((stat) => stat.pinned), ...stats.filter((stat) => !stat.pinned)]
}

/* ---------- Les colonnes regroupées ---------- */

/** Un groupe de colonnes regardées comme une seule (« Rareté (P+S) »). */
export type StatColumnGroup = { id: string; name: string; columns: string[] }

export const GROUP_LIMITS = { groups: 24, columns: 6, name: 60 } as const
/** Une colonne de la phrase qui désigne un groupe : « groupe:<id> ». */
export const GROUP_PREFIX = "groupe:"
/** La colonne virtuelle « Rang dans le groupe » : la colonne du groupe d'où vient l'emplacement. */
export const RANK_COLUMN = "groupe:#rang"
export const RANK_LABEL = "Rang dans le groupe"

export const groupRef = (id: string) => `${GROUP_PREFIX}${id}`
export const isGroupRef = (column: string) => column.startsWith(GROUP_PREFIX) && column !== RANK_COLUMN

export function groupOf(groups: StatColumnGroup[] | undefined, column: string) {
  return isGroupRef(column) ? (groups ?? []).find((group) => group.id === column.slice(GROUP_PREFIX.length)) ?? null : null
}

/** Ce qui distingue les colonnes d'un groupe (« principale », « secondaire » ; « P. », « S. ») ; sinon leurs noms. */
export function memberLabels(columns: string[]) {
  if (columns.length < 2) return [...columns]
  const words = columns.map((column) => column.trim().split(/\s+/))
  let common = 0
  while (common < words[0].length - 1 && words.every((list) => list.length > common + 1 && fold(list[common]) === fold(words[0][common]))) common += 1
  const labels = words.map((list) => list.slice(common).join(" "))
  return common && labels.every(Boolean) && new Set(labels.map(fold)).size === labels.length ? labels : [...columns]
}

const MARKER = /^(.*?\S)[\s(–-]*\b(principale?|secondaire|primaire|tertiaire|[pst]\.?|\d{1,2})\)?\s*$/i

function markerOf(column: string) {
  const match = column.trim().match(MARKER)
  if (!match) return null
  const base = match[1].replace(/[\s(–-]+$/, "").trim()
  const marker = match[2].toLocaleLowerCase("fr").replace(/\.$/, "")
  const rank = /^\d+$/.test(marker) ? Number(marker) : /^(principale?|primaire|p)$/.test(marker) ? 1 : /^(secondaire|s)$/.test(marker) ? 2 : 3
  const initial = /^\d+$/.test(marker) ? marker : marker.length === 1 ? marker.toUpperCase() : marker.startsWith("prin") || marker.startsWith("prim") ? "P" : marker.startsWith("sec") ? "S" : "T"
  return base ? { base, rank, initial } : null
}

/** Les familles de colonnes dont les noms ne diffèrent que par une marque finale (P./S., principale/secondaire, 1/2/3). */
export function columnFamilies(columns: string[]) {
  const families = new Map<string, { base: string; members: Array<{ column: string; rank: number; initial: string }> }>()
  for (const column of columns) {
    if (isGroupRef(column) || column === RANK_COLUMN) continue
    const marker = markerOf(column)
    if (!marker) continue
    const key = fold(marker.base)
    const family = families.get(key) ?? { base: marker.base, members: [] }
    if (family.members.some((member) => member.rank === marker.rank)) continue
    family.members.push({ column, rank: marker.rank, initial: marker.initial })
    families.set(key, family)
  }
  return [...families.values()].filter((family) => family.members.length >= 2).map((family) => {
    const members = family.members.sort((left, right) => left.rank - right.rank).slice(0, GROUP_LIMITS.columns)
    return { name: `${family.base} (${members.map((member) => member.initial).join("+")})`.slice(0, GROUP_LIMITS.name), columns: members.map((member) => member.column) }
  })
}

const sameColumns = (left: string[], right: string[]) => left.length === right.length && left.every((column, index) => fold(column) === fold(right[index]))

/** Les familles pas encore regroupées : « Regrouper Rareté principale + Rareté secondaire ». */
export function suggestColumnGroups(columns: string[], groups: StatColumnGroup[]) {
  return columnFamilies(columns).filter((family) => !groups.some((group) => sameColumns(group.columns, family.columns)))
}

/** Le nom proposé pour un groupe : celui de sa famille (« Rareté (P+S) »), sinon ses colonnes. */
export function defaultGroupName(columns: string[]) {
  const family = columnFamilies(columns).find((candidate) => candidate.columns.length === columns.length)
  return (family?.name ?? columns.join(" + ")).slice(0, GROUP_LIMITS.name)
}

/** Les groupes d'un index, propres : 24 au plus, deux colonnes au moins chacun, noms et identifiants uniques. */
export function cleanColumnGroups(value: unknown): StatColumnGroup[] {
  const ids = new Set<string>()
  const names = new Set<string>()
  const out: StatColumnGroup[] = []
  for (const [index, entry] of (Array.isArray(value) ? value : []).entries()) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue
    const raw = entry as Record<string, unknown>
    const columns = columnList(raw.columns, GROUP_LIMITS.columns).filter((column) => !column.startsWith(GROUP_PREFIX))
    if (columns.length < 2) continue
    let id = typeof raw.id === "string" && /^[A-Za-z0-9_-]{1,24}$/.test(raw.id) ? raw.id : `g-${index + 1}`
    for (let suffix = 2; ids.has(id); suffix += 1) id = `${id.slice(0, 20)}-${suffix}`
    ids.add(id)
    const base = text(raw.name, GROUP_LIMITS.name) || defaultGroupName(columns)
    let name = base
    for (let suffix = 2; names.has(fold(name)); suffix += 1) name = `${base.slice(0, GROUP_LIMITS.name - 3)} ${suffix}`
    names.add(fold(name))
    out.push({ id, name, columns })
    if (out.length >= GROUP_LIMITS.groups) break
  }
  return out
}

/** L'enregistrement des statistiques d'un index : `{ stats, groups }` (les anciens n'ont que `stats`). */
export function cleanStatsRecord(value: unknown): { stats: StatDefinition[]; groups: StatColumnGroup[] } {
  const raw = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}
  return { stats: cleanStats(raw.stats), groups: cleanColumnGroups(raw.groups) }
}

/** Une colonne de la phrase, lisible : le nom du groupe, « Rang dans le groupe », ou la colonne. */
export function statColumnLabel(groups: StatColumnGroup[] | undefined, column: string) {
  if (column === RANK_COLUMN) return RANK_LABEL
  return groupOf(groups, column)?.name ?? (isGroupRef(column) ? "Groupe supprimé" : column)
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

function rankIn(order: string[], value: string) {
  const key = fold(cellText(value))
  return order.findIndex((entry) => fold(entry) === key)
}

/**
 * Une condition sur une case. « au moins » / « au plus » (et « supérieur » / « inférieur ») suivent
 * l'ordre de la liste quand la valeur en fait partie (Rareté au moins Rare), sinon les nombres.
 */
export function matchStatCondition(condition: StatLeaf, cell: string, order: string[] = []) {
  const operator = condition.operator
  if (operator === "au-moins" || operator === "au-plus" || ((operator === "superieur" || operator === "inferieur") && order.length)) {
    const wanted = order.length ? rankIn(order, condition.value) : -1
    if (wanted >= 0) {
      const ranks = cellParts(cell).map((part) => rankIn(order, part)).filter((rank) => rank >= 0)
      return ranks.some((rank) => operator === "au-moins" ? rank >= wanted : operator === "au-plus" ? rank <= wanted : operator === "superieur" ? rank > wanted : rank < wanted)
    }
    if (operator === "superieur" || operator === "inferieur") return matchesCondition(condition as ViewCondition, cell)
    const left = cellNumber(cell)
    const right = cellNumber(condition.value)
    return left !== null && right !== null && (operator === "au-moins" ? left >= right : left <= right)
  }
  return matchesCondition(condition as ViewCondition, cell)
}

/** Toutes les conditions sont vraies ; dans chacune, une de ses branches « ou » suffit. */
export function passesConditions(conditions: StatCondition[] | undefined, cell: (column: string) => string, orderOf?: (column: string) => string[]) {
  return (conditions ?? []).every((condition) => {
    const leaves = [condition, ...(condition.or ?? [])].filter((leaf) => leaf.column)
    return !leaves.length || leaves.some((leaf) => matchStatCondition(leaf, cell(leaf.column), orderOf?.(leaf.column)))
  })
}

/** Les lignes que compte la statistique : sa source, puis ses conditions. */
export function statRows<T>(stat: Pick<StatDefinition, "source" | "where">, rows: T[], valueOf: CellOf<T>, tabOf?: (row: T) => string, orderOf?: (column: string) => string[]) {
  return scopeRows(stat, rows, tabOf).filter((row) => passesConditions(stat.where, (column) => valueOf(row, column), orderOf))
}

/** Ce que compte une statistique : une ligne, ou un emplacement (une ligne dans une colonne d'un groupe). */
export type StatUnit<T> = { row: T; slot: number }

export type StatEnv<T> = {
  valueOf: CellOf<T>
  tabOf?: (row: T) => string
  orderOf?: (column: string) => string[]
  groups?: StatColumnGroup[]
}

/**
 * Les emplacements d'une statistique : quand elle range par un groupe (sans « une seule fois »),
 * chaque ligne compte une fois par colonne remplie du groupe (au moins une fois, dans « Sans
 * valeur »). Les groupes de la même taille s'alignent rang par rang (Rareté P. avec Emplacement P.).
 */
export function statSlots(stat: Pick<StatDefinition, "by" | "cols" | "blocks" | "once">, groups: StatColumnGroup[] = []) {
  const dimensions = statDimensions(stat)
  const used = [...new Map(dimensions.map((column) => groupOf(groups, column)).filter((group): group is StatColumnGroup => Boolean(group)).map((group) => [group.id, group])).values()]
  const size = stat.once ? 0 : Math.max(0, ...used.map((group) => group.columns.length))
  const aligned = new Set([...used.map((group) => group.id), ...groups.filter((group) => size && group.columns.length === size).map((group) => group.id)])
  return { size, used, aligned, labels: used[0] ? memberLabels(used[0].columns) : [] }
}

function mergeOrders(orders: string[][]) {
  const seen = new Set<string>()
  const out: string[] = []
  for (const order of orders) for (const value of order) if (!seen.has(fold(value))) { seen.add(fold(value)); out.push(value) }
  return out
}

/** Les lignes (ou emplacements) d'une statistique, et la manière d'en lire chaque colonne. */
export function statUnits<T>(stat: Pick<StatDefinition, "by" | "cols" | "blocks" | "once">, rows: T[], env: StatEnv<T>) {
  const groups = env.groups ?? []
  const slots = statSlots(stat, groups)
  const valueOf: CellOf<StatUnit<T>> = (unit, column) => {
    if (column === RANK_COLUMN) return unit.slot >= 0 ? slots.labels[unit.slot] ?? `${unit.slot + 1}` : ""
    const group = groupOf(groups, column)
    if (!group) return isGroupRef(column) ? "" : env.valueOf(unit.row, column)
    if (unit.slot >= 0 && slots.aligned.has(group.id)) { const member = group.columns[unit.slot]; return member ? env.valueOf(unit.row, member) : "" }
    return group.columns.map((member) => env.valueOf(unit.row, member)).filter((value) => cellText(value)).join(", ")
  }
  const units: StatUnit<T>[] = []
  for (const row of rows) {
    if (!slots.size) { units.push({ row, slot: -1 }); continue }
    let added = 0
    for (let slot = 0; slot < slots.size; slot += 1) {
      if (slots.used.some((group) => group.columns[slot] && cellText(env.valueOf(row, group.columns[slot])))) { units.push({ row, slot }); added += 1 }
    }
    if (!added) units.push({ row, slot: 0 })
  }
  const orderOf = (column: string) => column === RANK_COLUMN ? slots.labels : groupOf(groups, column) ? mergeOrders(groupOf(groups, column)!.columns.map((member) => env.orderOf?.(member) ?? [])) : env.orderOf?.(column) ?? []
  return { units, valueOf, orderOf, size: slots.size, labels: slots.labels }
}

/**
 * Tout ce qu'il faut pour dessiner une statistique : les emplacements de sa source (`all`), ceux
 * qui remplissent ses conditions (`units`), ceux de la comparaison (`other`).
 */
export function prepareStat<T>(stat: StatDefinition, rows: T[], env: StatEnv<T>) {
  const { units: all, valueOf, orderOf, size, labels } = statUnits(stat, scopeRows(stat, rows, env.tabOf), env)
  const test = (conditions: StatCondition[] | undefined) => (unit: StatUnit<T>) => passesConditions(conditions, (column) => valueOf(unit, column), orderOf)
  const units = all.filter(test(stat.where))
  let other: StatUnit<T>[] | null = null
  if (stat.compare === "rest") { const kept = new Set(units); other = all.filter((unit) => !kept.has(unit)) }
  else if (stat.compare === "filter") other = all.filter(test(stat.compareWhere))
  return { all, units, other, valueOf, orderOf, size, labels }
}

/** Les lignes distinctes de quelques emplacements (une ligne comptée deux fois n'apparaît qu'une). */
export function unitRows<T>(units: Array<StatUnit<T>>) {
  return [...new Set(units.map((unit) => unit.row))]
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

/** Les clés d'une case : une par valeur, ou une seule pour toute la case (`whole`). */
function keysOf(value: string, whole = false): Key[] {
  const parts = cellParts(value)
  if (whole && parts.length) { const label = parts.join(", "); return [{ key: fold(label), label }] }
  return parts.length ? parts.map((part) => ({ key: fold(part), label: part })) : [{ key: "", label: "" }]
}

/** Les `limit` valeurs les plus fréquentes d'une colonne ; `null` si toutes tiennent (une seule de trop ne fait pas d'« Autres »). */
export function frequentKeys<T>(rows: T[], valueOf: CellOf<T>, column: string, limit: number, whole = false) {
  if (!limit) return null
  const counts = new Map<string, { label: string; count: number }>()
  for (const row of rows) for (const { key, label } of keysOf(valueOf(row, column), whole)) {
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
 * (comme les sections des vues ; `whole` : la case entière est une valeur), « Sans valeur » à
 * la fin, « Autres » juste avant. `keep` : les valeurs gardées, les autres vont dans « Autres »
 * (une ligne n'y compte qu'une fois).
 */
export function groupStatRows<T>(rows: T[], valueOf: CellOf<T>, column: string, options: { order?: string[]; keep?: Set<string> | null; whole?: boolean } = {}): StatGroup<T>[] {
  const groups = new Map<string, StatGroup<T>>()
  for (const row of rows) {
    const seen = new Set<string>()
    for (const found of keysOf(valueOf(row, column), options.whole)) {
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

/** Les lignes d'une valeur (clé) d'une colonne, « Autres » compris. */
export function rowsWithKey<T>(rows: T[], valueOf: CellOf<T>, column: string, key: string, options: { keep?: Set<string> | null; whole?: boolean } = {}) {
  return rows.filter((row) => keysOf(valueOf(row, column), options.whole).some((found) => (found.key && options.keep && !options.keep.has(found.key) ? STAT_OTHERS : found.key) === key))
}

export type StatPart<T> = StatGroup<T> & { value: number | null }

/**
 * La répartition d'une colonne (barres, classement, anneau). Au-delà de `limit` valeurs, les
 * moins fréquentes vont dans « Autres », sauf si elles sont dépliées (`expanded`).
 */
export function statBreakdown<T>(stat: Pick<StatDefinition, "measure" | "field" | "by"> & Partial<Pick<StatDefinition, "joined">>, rows: T[], valueOf: CellOf<T>, options: { order?: string[]; limit?: number; expanded?: boolean; byValue?: boolean; column?: string } = {}) {
  const column = options.column ?? stat.by[0] ?? ""
  const whole = Boolean(stat.joined)
  const frequent = options.limit ? frequentKeys(rows, valueOf, column, options.limit, whole) : null
  const parts: StatPart<T>[] = groupStatRows(rows, valueOf, column, { order: options.order, keep: options.expanded ? null : frequent?.keep, whole })
    .map((group) => ({ ...group, value: aggregate(stat, group.rows, valueOf) }))
  if (options.byValue && !options.order?.length) {
    const place = (part: StatPart<T>) => part.key === "" ? 2 : part.key === STAT_OTHERS ? 1 : 0
    parts.sort((left, right) => place(left) - place(right) || (right.value ?? -Infinity) - (left.value ?? -Infinity) || left.label.localeCompare(right.label, "fr", { numeric: true }))
  }
  return { parts, hidden: frequent?.hidden ?? 0, keep: options.expanded ? null : frequent?.keep ?? null, revealed: options.expanded && frequent ? (key: string) => key !== "" && key !== STAT_OTHERS && !frequent.keep.has(key) : () => false }
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

export type StatTableHeader = {
  key: string
  label: string
  span: number
  depth: number
  leaf: boolean
  revealed: boolean
  /** Le bloc de colonnes (0 : le premier). */
  block: number
  /** Un groupe du premier niveau replié : une seule colonne, son sous-total. */
  closed: boolean
  closable: boolean
}

/**
 * Le tableau croisé (ou à niveaux) : les lignes rangées par niveaux (`by`), les colonnes par
 * blocs (`cols`, puis `blocks`) de niveaux, chaque niveau limité à ses `top` valeurs les plus
 * fréquentes (le reste en « Autres », sauf niveau déplié). Un groupe du premier niveau d'un bloc
 * à deux niveaux peut être replié (`closed`) : il ne montre que son sous-total. Sans colonne :
 * seulement le total de chaque ligne.
 */
export function statTable<T>(stat: Pick<StatDefinition, "measure" | "field" | "by" | "cols" | "top"> & Partial<Pick<StatDefinition, "blocks" | "joined">>, rows: T[], valueOf: CellOf<T>, options: { orderOf?: (column: string) => string[]; expanded?: (level: number, block: number) => boolean; closed?: (block: number, key: string) => boolean } = {}) {
  const whole = Boolean(stat.joined)
  type ColumnNode = { key: string; label: string; depth: number; block: number; labels: string[]; closed: boolean; closable: boolean; children: ColumnNode[]; test: (row: T) => boolean }
  const blocks = statColumnBlocks(stat).map((levels, block) => {
    const frequent = levels.map((column, level) => ({ info: frequentKeys(rows, valueOf, column, stat.top ?? 0, whole), open: Boolean(options.expanded?.(level, block)) }))
    const keepOf = (level: number) => frequent[level].open ? null : frequent[level].info?.keep ?? null
    const keyMatches = (row: T, level: number, key: string) => {
      const keep = keepOf(level)
      return keysOf(valueOf(row, levels[level]), whole).some((found) => (found.key && keep && !keep.has(found.key) ? STAT_OTHERS : found.key) === key)
    }
    const build = (subset: T[], level: number, test: (row: T) => boolean, labels: string[]): ColumnNode[] => groupStatRows(subset, valueOf, levels[level], { order: options.orderOf?.(levels[level]), keep: keepOf(level), whole }).map((group) => {
      const own = (row: T) => test(row) && keyMatches(row, level, group.key)
      const path = [...labels, statKeyLabel(group)]
      const closable = level === 0 && levels.length > 1
      const closed = closable && Boolean(options.closed?.(block, group.key))
      return { key: group.key, label: group.label, depth: level, block, labels: path, closed, closable, test: own, children: !closed && level + 1 < levels.length ? build(group.rows, level + 1, own, path) : [] }
    })
    return { levels, frequent, tree: build(rows, 0, () => true, []) }
  })
  const leaves: ColumnNode[] = []
  const walk = (nodes: ColumnNode[]) => nodes.forEach((node) => node.children.length ? walk(node.children) : leaves.push(node))
  blocks.forEach((block) => walk(block.tree))
  const width = (node: ColumnNode): number => node.children.length ? node.children.reduce((total, child) => total + width(child), 0) : 1
  const depthCount = Math.max(0, ...blocks.map((block) => block.levels.length))
  const headers: StatTableHeader[][] = Array.from({ length: depthCount }, () => [])
  const collect = (nodes: ColumnNode[]) => nodes.forEach((node) => {
    const info = blocks[node.block].frequent[node.depth]
    headers[node.depth].push({ key: node.key, label: node.label, span: width(node), depth: node.depth, leaf: !node.children.length, revealed: Boolean(info.open && info.info && node.key && node.key !== STAT_OTHERS && !info.info.keep.has(node.key)), block: node.block, closed: node.closed, closable: node.closable })
    collect(node.children)
  })
  blocks.forEach((block) => collect(block.tree))
  const cellsOf = (subset: T[]) => leaves.map((leaf) => { const inside = subset.filter(leaf.test); return { rows: inside, value: inside.length ? aggregate(stat, inside, valueOf) : null } })
  const tree = (subset: T[], depth: number, path: string[], labels: string[]): StatTableNode<T>[] => depth >= stat.by.length ? [] : groupStatRows(subset, valueOf, stat.by[depth], { order: options.orderOf?.(stat.by[depth]), whole }).map((group) => ({
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
  const blockInfo = blocks.map((block) => ({ columns: block.levels, hidden: block.frequent.map((entry) => entry.info?.hidden ?? 0), open: block.frequent.map((entry) => entry.open), width: block.tree.reduce((sum, node) => sum + width(node), 0) }))
  return {
    total,
    headers,
    leaves: leaves.map((leaf) => leaf.labels),
    /** Pour chaque colonne feuille : son bloc, ses colonnes et si c'est un sous-total replié. */
    leafInfo: leaves.map((leaf) => ({ block: leaf.block, columns: blocks[leaf.block].levels.slice(0, leaf.labels.length), labels: leaf.labels, closed: leaf.closed })),
    blocks: blockInfo,
    depth: depthCount,
    hidden: blockInfo[0]?.hidden ?? [],
    open: blockInfo[0]?.open ?? [],
  }
}

/** Une valeur en part d'un tout, en pour cent ; `null` sans tout. */
export function percentOf(value: number | null, of: number | null) {
  return value === null || !of ? null : (value / of) * 100
}

export function formatStatNumber(value: number | null) {
  return value === null ? "—" : value.toLocaleString("fr-FR", { maximumFractionDigits: 2 })
}

/* ---------- Histogramme, nuage de points, mosaïque ---------- */

/** Un pas « rond » (1, 2, 2,5, 5 × 10ⁿ) pour couper `span` en environ `count` tranches. */
export function niceStep(span: number, count: number) {
  const raw = span / Math.max(1, count)
  const power = 10 ** Math.floor(Math.log10(raw || 1))
  const fraction = raw / power
  return (fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 2.5 ? 2.5 : fraction <= 5 ? 5 : 10) * power
}

export type StatBin = { from: number; to: number; zero?: true }

/**
 * Les tranches d'un histogramme : égales (pas rond), ou par paliers ×10 (1, 2, 5, 10, 20…) quand
 * les valeurs vont de 1 à plus de 200 fois plus (`auto`) ou si on le demande (`log`).
 */
export function histogramBins(values: number[], count: number, scale: StatHistogramScale = "auto"): { bins: StatBin[]; log: boolean } {
  if (!values.length) return { bins: [], log: false }
  const min = Math.min(...values)
  const max = Math.max(...values)
  const positive = values.filter((value) => value > 0)
  const log = scale === "log" || (scale === "auto" && min >= 0 && positive.length > 0 && max / Math.min(...positive) > 200)
  const bins: StatBin[] = []
  if (log && positive.length) {
    if (values.some((value) => value <= 0)) bins.push({ from: 0, to: 0, zero: true })
    const low = Math.floor(Math.log10(Math.min(...positive)))
    const high = Math.max(low + 1, Math.ceil(Math.log10(max) + 1e-9))
    const steps = (high - low) * 3 <= count ? [1, 2, 5] : (high - low) * 2 <= count ? [1, 3] : [1]
    const edges: number[] = []
    for (let exponent = low; exponent <= high; exponent += 1) for (const step of steps) { const edge = step * 10 ** exponent; if (edge >= 10 ** low && edge <= 10 ** high) edges.push(edge) }
    for (let index = 0; index < edges.length - 1; index += 1) bins.push({ from: edges[index], to: edges[index + 1] })
    // Les tranches vides des deux bouts sont retirées.
    const inside = (bin: StatBin, value: number) => bin.zero ? value <= 0 : value >= bin.from && value < bin.to
    const first = bins.findIndex((bin) => values.some((value) => inside(bin, value)))
    const last = bins.length - 1 - [...bins].reverse().findIndex((bin) => values.some((value) => inside(bin, value)))
    return { bins: bins.slice(Math.max(0, first), Math.max(first, last) + 1), log: true }
  }
  const step = niceStep(max - min || 1, count)
  const start = Math.floor(min / step) * step
  for (let from = start; from <= max; from += step) bins.push({ from: Math.round(from * 1000) / 1000, to: Math.round((from + step) * 1000) / 1000 })
  return { bins, log: false }
}

/** Les lignes réparties en tranches d'une colonne de nombres ; les lignes sans nombre à part. */
export function statHistogram<T>(rows: T[], valueOf: CellOf<T>, field: string, count: number, scale: StatHistogramScale = "auto") {
  const valued = rows.flatMap((row) => { const value = cellNumber(valueOf(row, field)); return value === null ? [] : [{ row, value }] })
  const { bins, log } = histogramBins(valued.map((entry) => entry.value), count, scale)
  return {
    log,
    without: rows.length - valued.length,
    withValue: valued.length,
    bins: bins.map((bin, index) => {
      const last = index === bins.length - 1
      return { ...bin, rows: valued.filter((entry) => bin.zero ? entry.value <= 0 : entry.value >= bin.from && (entry.value < bin.to || (last && entry.value <= bin.to))).map((entry) => entry.row) }
    }),
  }
}

/** Un axe de nuage de points : linéaire (pas rond) ou ×10 si les valeurs s'étalent sur plus de 200 fois. */
export function scatterAxis(values: number[]) {
  const min = Math.min(...values)
  const max = Math.max(...values)
  const positive = values.filter((value) => value > 0)
  if (min > 0 && max / Math.min(...positive) > 200) {
    const low = Math.floor(Math.log10(min))
    const high = Math.ceil(Math.log10(max))
    return { log: true, low, high, at: (value: number) => (Math.log10(value) - low) / (high - low || 1), ticks: Array.from({ length: high - low + 1 }, (_, index) => 10 ** (low + index)) }
  }
  const step = niceStep(max - min || 1, 4)
  const low = Math.floor(min / step) * step
  const high = Math.ceil(max / step) * step || step
  return { log: false, low, high, at: (value: number) => (value - low) / (high - low || 1), ticks: Array.from({ length: Math.round((high - low) / step) + 1 }, (_, index) => Math.round((low + index * step) * 100) / 100) }
}

/** Les points d'un nuage : les lignes au même endroit forment un seul point. */
export function statScatter<T>(rows: T[], valueOf: CellOf<T>, x: string, y: string) {
  const spots = new Map<string, { x: number; y: number; rows: T[] }>()
  for (const row of rows) {
    const left = cellNumber(valueOf(row, x))
    const right = cellNumber(valueOf(row, y))
    if (left === null || right === null) continue
    const key = `${left}|${right}`
    const spot = spots.get(key) ?? { x: left, y: right, rows: [] }
    spot.rows.push(row)
    spots.set(key, spot)
  }
  return [...spots.values()]
}

/** La mosaïque (treemap) : des rectangles d'aire proportionnelle, aussi carrés que possible. */
export function squarify<I extends { value: number }>(items: I[], x: number, y: number, width: number, height: number): Array<I & { x: number; y: number; w: number; h: number }> {
  const out: Array<I & { x: number; y: number; w: number; h: number }> = []
  const total = items.reduce((sum, item) => sum + item.value, 0)
  if (!total || width <= 0 || height <= 0) return out
  const scale = (width * height) / total
  let rest = items.map((item) => ({ item, area: item.value * scale })).sort((left, right) => right.area - left.area)
  const worst = (row: Array<{ area: number }>, side: number) => {
    const sum = row.reduce((total, entry) => total + entry.area, 0)
    const most = Math.max(...row.map((entry) => entry.area))
    const least = Math.min(...row.map((entry) => entry.area))
    return Math.max((side * side * most) / (sum * sum), (sum * sum) / (side * side * least))
  }
  while (rest.length) {
    const side = Math.min(width, height)
    const row = [rest[0]]
    let index = 1
    while (index < rest.length && worst([...row, rest[index]], side) <= worst(row, side)) { row.push(rest[index]); index += 1 }
    rest = rest.slice(index)
    const sum = row.reduce((total, entry) => total + entry.area, 0)
    if (width >= height) {
      const columnWidth = sum / height
      let top = y
      for (const entry of row) { const h = entry.area / columnWidth; out.push({ ...entry.item, x, y: top, w: columnWidth, h }); top += h }
      x += columnWidth; width -= columnWidth
    } else {
      const rowHeight = sum / width
      let left = x
      for (const entry of row) { const w = entry.area / rowHeight; out.push({ ...entry.item, x: left, y, w, h: rowHeight }); left += w }
      y += rowHeight; height -= rowHeight
    }
  }
  return out
}
