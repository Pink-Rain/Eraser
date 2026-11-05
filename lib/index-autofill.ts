/**
 * « Remplissage automatique » d'une colonne d'index, d'après une autre colonne de la même
 * ligne : « Rangement » réglée sur « Genre » reçoit, pour chaque genre, la valeur choisie
 * dans « Modifier » (Arme → Armurerie, Potion → Sacoche…). La valeur est écrite dans la case,
 * comme une saisie : tout ce qui lit la colonne (Sheets, l'inventaire, les vues) la voit.
 *
 * - La case se remplit quand la colonne source change (case, fiche, nouvelle ligne) ; elle
 *   reste modifiable à la main jusqu'au changement suivant de la source.
 * - Une valeur source sans réglage (et sans « Toute autre valeur ») ne touche pas la case.
 * - Une colonne remplie peut en remplir une autre (en chaîne), jamais en boucle.
 *
 * Ce fichier ne dépend que du modèle des colonnes : la page et le serveur s'en servent.
 */
import { foldName, type IndexColumnKind, type IndexColumnSpec } from "@/lib/index-columns"

/** Une règle : quand la colonne source vaut `when`, la case reçoit `value` (telle que l'écrit le champ de son type). */
export type AutoFillRule = { when: string; value: string }

export type AutoFillSettings = {
  /** La colonne de la même ligne qui décide (son nom). */
  from: string
  /** Une règle par valeur de la source. */
  rules: AutoFillRule[]
  /** Toute autre valeur (non vide) de la source : absente, la case n'est pas touchée. */
  otherwise?: string
}

/** Les types calculés ou posés par Eraser : ils ne se remplissent pas d'après une autre colonne. */
const NOT_FILLABLE = new Set<IndexColumnKind>(["name", "name-form", "id", "auto-links", "ranked-links", "tab", "lookup", "rollup", "formula", "random", "actions", "archived"])
/** Les types dont la case ne garde rien qu'on puisse comparer : ils ne décident de rien. */
const NOT_SOURCE = new Set<IndexColumnKind>(["auto-links", "lookup", "rollup", "formula", "actions", "archived", "tab"])

/** Une colonne de ce type peut-elle se remplir d'après une autre ? */
export function canAutoFill(spec: IndexColumnSpec) {
  return !NOT_FILLABLE.has(spec.kind) && !spec.readOnly
}

/** Une colonne de ce type peut-elle en remplir une autre ? */
export function canDecideAutoFill(spec: IndexColumnSpec) {
  return !NOT_SOURCE.has(spec.kind)
}

/** Le réglage tel qu'il s'enregistre : règles sans valeur ni doublon retirées ; rien de réglé : `undefined`. */
export function cleanAutoFill(input: unknown): AutoFillSettings | undefined {
  if (!input || typeof input !== "object") return undefined
  const raw = input as { from?: unknown; rules?: unknown; otherwise?: unknown }
  const from = typeof raw.from === "string" ? raw.from.replace(/\s+/g, " ").trim().slice(0, 200) : ""
  if (!from) return undefined
  const seen = new Set<string>()
  const rules = (Array.isArray(raw.rules) ? raw.rules : []).flatMap((rule): AutoFillRule[] => {
    if (!rule || typeof rule !== "object") return []
    const when = typeof (rule as AutoFillRule).when === "string" ? (rule as AutoFillRule).when.replace(/\s+/g, " ").trim().slice(0, 500) : ""
    const value = typeof (rule as AutoFillRule).value === "string" ? (rule as AutoFillRule).value.slice(0, 50_000) : ""
    if (!when || !value.trim() || seen.has(foldName(when))) return []
    seen.add(foldName(when))
    return [{ when, value }]
  }).slice(0, 500)
  const otherwise = typeof raw.otherwise === "string" && raw.otherwise.trim() ? raw.otherwise.slice(0, 50_000) : undefined
  return { from, rules, ...(otherwise ? { otherwise } : {}) }
}

/** Le texte d'une case, sans balises ni espaces en trop (une case enrichie arrive en HTML). */
export function plainCellText(value: string) {
  const text = /<[a-z][^>]*>/i.test(value)
    ? value.replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|div|li|h[1-6])>/gi, "\n").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, "\"").replace(/&#39;/g, "'")
    : value
  return text.replace(/[ \t]+/g, " ").replace(/\s*\n\s*/g, "\n").trim()
}

/** Les morceaux d'une case à plusieurs valeurs (« Arme, Bouclier », une ligne par valeur…). */
export function autoFillParts(text: string) {
  return text.split(/\s*(?:[,;|\n]|\s-\s)\s*/).map((part) => part.trim()).filter(Boolean)
}

/**
 * La valeur que reçoit la case quand la source vaut `sourceText` ; `undefined` : la case n'est
 * pas touchée. La valeur entière d'abord (« Arme de jet »), puis chacun de ses morceaux, dans
 * l'ordre (« Potion, Arme » prend la règle de « Potion »), puis « Toute autre valeur ».
 */
export function autoFillValue(settings: AutoFillSettings | undefined, sourceText: string): string | undefined {
  if (!settings) return undefined
  const text = plainCellText(sourceText)
  if (!text) return undefined
  const ruleOf = (value: string) => settings.rules.find((rule) => foldName(rule.when) === foldName(value))
  const whole = ruleOf(text)
  if (whole) return whole.value
  for (const part of autoFillParts(text)) {
    const rule = ruleOf(part)
    if (rule) return rule.value
  }
  return settings.otherwise
}

/** Les colonnes d'un onglet remplies d'après `source`. */
export function autoFillTargetsOf<T extends { header: string; spec: IndexColumnSpec }>(columns: T[], source: string): T[] {
  return columns.filter((column) => column.spec.autoFill?.from && foldName(column.spec.autoFill.from) === foldName(source) && foldName(column.header) !== foldName(source) && canAutoFill(column.spec))
}

/**
 * Les cases que des changements remplissent, en chaîne : `changed` donne les colonnes qui
 * viennent de changer, `valueOf` la valeur actuelle d'une case (déjà changée pour celles-là).
 * Une colonne n'est remplie qu'une fois : deux colonnes réglées l'une sur l'autre ne
 * tournent pas en rond. `skip` : les colonnes que l'appel écrit lui-même (la saisie gagne).
 * Seules les cases dont la valeur change sont rendues.
 */
export function plannedAutoFills<T extends { header: string; spec: IndexColumnSpec }>(columns: T[], changed: string[], valueOf: (header: string) => string, skip: string[] = []): Map<string, { column: T; value: string }> {
  const fills = new Map<string, { column: T; value: string }>()
  const done = new Set([...changed, ...skip].map(foldName))
  const queue = [...changed]
  const current = (header: string) => fills.get(foldName(header))?.value ?? valueOf(header)
  for (let step = 0; queue.length && step < 200; step++) {
    const source = queue.shift()!
    for (const target of autoFillTargetsOf(columns, source)) {
      const key = foldName(target.header)
      if (done.has(key)) continue
      const value = autoFillValue(target.spec.autoFill, current(source))
      if (value === undefined) continue
      done.add(key)
      if (plainCellText(value) === plainCellText(valueOf(target.header))) continue
      fills.set(key, { column: target, value })
      queue.push(target.header)
    }
  }
  return fills
}

/** Ce qui empêche d'enregistrer le réglage d'une colonne (source absente, boucle), pour l'éditeur. */
export function autoFillProblem(columns: Array<{ header: string; spec: IndexColumnSpec }>, header: string): string {
  const own = columns.find((column) => foldName(column.header) === foldName(header))
  const settings = own?.spec.autoFill
  if (!own || !settings?.from) return ""
  const source = columns.find((column) => foldName(column.header) === foldName(settings.from))
  if (!source) return `« ${header} » se remplit d’après « ${settings.from} », qui n’existe plus dans cet onglet.`
  if (foldName(source.header) === foldName(header)) return `« ${header} » ne peut pas se remplir d’après elle-même.`
  if (!canDecideAutoFill(source.spec)) return `« ${header} » ne peut pas se remplir d’après « ${source.header} » : une colonne calculée ne garde rien dans sa case.`
  // Remonter la chaîne : revenir sur `header` serait une boucle.
  const visited = new Set([foldName(header)])
  let next = source
  while (next?.spec.autoFill?.from) {
    const key = foldName(next.header)
    if (visited.has(key)) break
    visited.add(key)
    const parent = foldName(next.spec.autoFill.from)
    if (parent === foldName(header)) return `« ${header} » et « ${next.header} » se remplissent l’une d’après l’autre : choisis un seul sens.`
    next = columns.find((column) => foldName(column.header) === parent)!
  }
  return ""
}
