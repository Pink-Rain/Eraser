/**
 * Spécificités de classe : des outils génériques que le MJ assemble pour chaque classe
 * dans « Création des classes ». Le premier est la **Jauge** (barre de rage, mana,
 * concentration…). Chaque sorte de spécificité a son onglet dans le classeur « Sorts de
 * classe » (ici « Jauges »), une ligne par spécificité, lisible et modifiable dans Sheets.
 *
 * Une jauge a un minimum, un maximum et une valeur actuelle. Le maximum est fixe, calculé
 * par une formule sur la fiche (« {Points de vie max} »), ou choisi par le joueur. La valeur
 * actuelle est tenue par le joueur (− / +, valeur tapée) ou calculée (« {Points de vie max}
 * - {Points de vie actuels} »). Ce que le joueur change est rangé dans sa fiche, case
 * « Sorts de classe choisis JSON », sous `specifics[id]`.
 *
 * Sans dépendance au serveur : l'éditeur, la fiche et les tests s'en servent.
 */
import type { CharacterCatalog } from "@/lib/character-catalog"
import { evaluateMathExpression } from "@/lib/math-expression"

export const GAUGES_TAB = "Jauges"

export type GaugeMaxMode = "fixe" | "formule" | "joueur"
export type GaugeCurrentMode = "joueur" | "formule"
export type GaugePlacement = "vie" | "bandeau" | "sorts"
export type GaugeDisplay = "barre" | "pastilles" | "nombre"

export type GaugeThreshold = { value: string; label: string }

export type ClassGauge = {
  id: string
  /** La classe, par son identifiant (CLA-…) ; `className` est son nom, pour la feuille. */
  classId: string
  className: string
  name: string
  color: string
  placement: GaugePlacement
  display: GaugeDisplay
  /** Un nombre ou une formule ; vide : 0. */
  min: string
  maxMode: GaugeMaxMode
  /** Fixe : le nombre ; formule : la formule ; joueur : le maximum de départ. */
  max: string
  currentMode: GaugeCurrentMode
  /** Joueur : la valeur de départ (nombre ou formule, « {Maximum} » pour pleine) ; formule : la formule. */
  current: string
  /** Ce qu'ajoutent ou retirent − et +. */
  step: number
  /** Un bouton remet la valeur du joueur à sa valeur de départ. */
  resetButton: boolean
  /** Des repères sur la jauge : « 50 : Frénésie ». */
  thresholds: GaugeThreshold[]
  description: string
  order: number
  /** Les formes (par nom) où la jauge s'affiche ; vide : toujours. */
  forms: string[]
  /** En quittant ces formes, la valeur du joueur revient à sa valeur de départ. */
  resetOnLeave: boolean
  /**
   * Une caractéristique ou compétence de la fiche à laquelle la valeur de la jauge s'ajoute
   * (« Folie temporaire » → « Folie ») ; vide : la jauge ne change rien sur la fiche.
   */
  addTo: string
}

export const gaugePlacements: Array<{ value: GaugePlacement; label: string; hint: string }> = [
  { value: "vie", label: "Sous la barre de vie", hint: "Dans la carte des points de vie" },
  { value: "bandeau", label: "Sous les caractéristiques", hint: "Un bandeau sous les secondaires" },
  { value: "sorts", label: "Onglet Sorts", hint: "En haut de l’onglet Sorts" },
]
export const gaugeDisplays: Array<{ value: GaugeDisplay; label: string; hint: string }> = [
  { value: "barre", label: "Barre", hint: "Une jauge qui se remplit" },
  { value: "pastilles", label: "Pastilles", hint: "Des points à cocher (20 au plus)" },
  { value: "nombre", label: "Nombre", hint: "Juste la valeur" },
]
export const gaugeMaxModes: Array<{ value: GaugeMaxMode; label: string; hint: string }> = [
  { value: "fixe", label: "Fixe", hint: "Le même pour tous" },
  { value: "formule", label: "Relié à la fiche", hint: "Calculé par une formule" },
  { value: "joueur", label: "Choisi par le joueur", hint: "Il le change sur sa fiche" },
]
export const gaugeCurrentModes: Array<{ value: GaugeCurrentMode; label: string; hint: string }> = [
  { value: "joueur", label: "Tenue par le joueur", hint: "− / +, ou une valeur tapée" },
  { value: "formule", label: "Reliée à la fiche", hint: "Calculée, le joueur ne la touche pas" },
]

export const GAUGE_MAX_PIPS = 20
export const gaugeColors = ["#c0392b", "#b9504e", "#d29a4a", "#e7ae69", "#6d8f6a", "#4f9a8a", "#4f7fb0", "#8a6fb0", "#a76f9d", "#7d7f86"]

/* ─────────────────────────────── Feuille ─────────────────────────────── */

export const GAUGE_HEADERS = [
  "ID", "Classe", "Nom", "Couleur", "Emplacement", "Affichage", "Minimum",
  "Maximum (type)", "Maximum", "Valeur actuelle (type)", "Valeur actuelle",
  "Pas", "Remise à zéro", "Seuils", "Description", "Ordre", "Classe ID",
  "Formes", "Remise à zéro en quittant la forme", "S'ajoute à",
] as const
export type GaugeHeader = (typeof GAUGE_HEADERS)[number]

const fold = (value: string) => value.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim().toLocaleLowerCase("fr")
const label = <T extends string>(options: Array<{ value: T; label: string }>, value: T) => options.find((option) => option.value === value)?.label ?? value
/** Une case écrite à la main (« Formule », « relié », « Joueur »…) retrouve sa valeur. */
function choice<T extends string>(options: Array<{ value: T; label: string }>, raw: string, fallback: T, aliases: Record<string, T> = {}): T {
  const key = fold(raw)
  if (!key) return fallback
  return options.find((option) => fold(option.value) === key || fold(option.label) === key)?.value ?? Object.entries(aliases).find(([alias]) => key.startsWith(alias))?.[1] ?? fallback
}
const yes = (raw: string) => ["oui", "vrai", "true", "x", "1", "yes"].includes(fold(raw))

/* ─────────────────────── Texte mis en forme (HTML) ─────────────────────── */

const escapeHtml = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
const decodeHtml = (text: string) => text.replace(/&nbsp;/gi, " ").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&quot;/gi, '"').replace(/&#39;/gi, "'").replace(/&amp;/gi, "&")
const tagName = (token: string) => token.match(/^<\/?\s*([a-z0-9]+)/i)?.[1]?.toLowerCase() ?? ""
const blockTags = new Set(["p", "div", "li", "h2", "h3", "ul", "ol"])

/** Le texte brut d'un contenu mis en forme (les retours à la ligne deviennent « \n »). */
export function plainTextOf(html: string) {
  return decodeHtml(String(html ?? "").replace(/<br\s*\/?>/gi, "\n").replace(/<\/(?:p|div|li|h2|h3)>/gi, "\n").replace(/<[^>]+>/g, "")).replace(/\n{3,}/g, "\n\n").trim()
}

/**
 * Un texte mis en forme sur une seule ligne : titres, listes et retours à la ligne
 * deviennent des espaces, gras, couleurs et liens (références « { ») restent.
 */
export function inlineRichText(html: string) {
  return String(html ?? "")
    .replace(/<br\s*\/?>|<\/?(?:p|div|li|h2|h3|ul|ol|hr)\b[^>]*>/gi, " ")
    .replace(/<input\b[^>]*>/gi, "")
    .replace(/\s*\n\s*/g, " ")
    .replace(/(?:&nbsp;|\s){2,}/g, " ")
    .trim()
}

/**
 * Les lignes d'un contenu mis en forme, chacune gardant ses mises en forme : une balise
 * ouverte avant un retour à la ligne est refermée en fin de ligne et rouverte sur la
 * suivante (la lecture d'une case Sheets met un <br /> dans un même gras).
 */
export function richTextLines(html: string) {
  const lines: string[] = []
  const open: string[] = []
  let current = ""
  const end = () => {
    lines.push(current + [...open].reverse().map((token) => `</${tagName(token)}>`).join(""))
    current = open.join("")
  }
  for (const token of String(html ?? "").split(/(<[^>]+>)/g).filter(Boolean)) {
    if (!token.startsWith("<")) {
      const parts = token.split("\n")
      parts.forEach((part, index) => { if (index) end(); current += part })
      continue
    }
    const tag = tagName(token)
    if (tag === "br" || tag === "hr") { end(); continue }
    if (blockTags.has(tag)) { if (/^<\//.test(token)) end(); continue }
    if (/^<\//.test(token)) {
      const index = open.map(tagName).lastIndexOf(tag)
      if (index >= 0) open.splice(index, 1)
      current += token
      continue
    }
    if (/\/>$/.test(token)) { current += token; continue }
    open.push(token)
    current += token
  }
  end()
  return lines.filter((line) => plainTextOf(line))
}

/** Le contenu sans ses `count` premiers caractères de texte (les balises sont gardées). */
function dropLeadingText(html: string, count: number) {
  let remaining = count
  return html.split(/(<[^>]+>)/g).filter(Boolean).map((token) => {
    if (token.startsWith("<") || remaining <= 0) return token
    const text = decodeHtml(token)
    const kept = text.slice(remaining)
    remaining -= text.length - kept.length
    return escapeHtml(kept)
  }).join("").replace(/^(\s|&nbsp;)+/, "")
}

/**
 * Les seuils, lus dans leur case : « 50 : Frénésie », un par ligne. Le nom peut être mis en
 * forme (gras, couleur, référence « {index:ligne} ») ; la valeur reste du texte.
 */
export function parseGaugeThresholdsHtml(html: string): GaugeThreshold[] {
  return richTextLines(html).flatMap((line) => {
    const text = plainTextOf(line)
    const match = text.match(/^\s*([^:]+?)\s*:\s*/)
    if (!match) return text.trim() ? [{ value: text.trim(), label: "" }] : []
    return match[1].trim() ? [{ value: match[1].trim(), label: dropLeadingText(line, match[0].length).trim() }] : []
  }).slice(0, 12)
}

/** Les seuils tels qu'ils s'écrivent dans leur case : une ligne par seuil, le nom mis en forme. */
export function gaugeThresholdsHtml(thresholds: GaugeThreshold[]) {
  return thresholds.filter((item) => item.value.trim()).map((item) => {
    const label = inlineRichText(item.label)
    return plainTextOf(label) ? `${escapeHtml(item.value.trim())} : ${label}` : escapeHtml(item.value.trim())
  }).join("<br>")
}

/** « 50 : Frénésie », une par ligne (texte simple). */
export const parseGaugeThresholds = (raw: string) => parseGaugeThresholdsHtml(escapeHtml(raw))

export function emptyGauge(classId: string, className: string, id: string, order = 0): ClassGauge {
  return { id, classId, className, name: "", color: gaugeColors[0], placement: "vie", display: "barre", min: "0", maxMode: "fixe", max: "100", currentMode: "joueur", current: "0", step: 1, resetButton: true, thresholds: [], description: "", order, forms: [], resetOnLeave: false, addTo: "" }
}

/** Les colonnes dont la case est mise en forme (lue et écrite en HTML). */
export const GAUGE_RICH_HEADERS = ["Seuils", "Description"] as const satisfies readonly GaugeHeader[]

/**
 * Une ligne de l'onglet « Jauges » ; null sans identifiant ni nom. `cell` : le texte de
 * chaque case ; `rich` : le contenu mis en forme des cases Seuils et Description (à défaut,
 * leur texte).
 */
export function gaugeFromCells(cell: (header: GaugeHeader) => string, rich?: (header: (typeof GAUGE_RICH_HEADERS)[number]) => string): ClassGauge | null {
  const id = cell("ID").trim()
  const name = cell("Nom").trim()
  if (!id || !name) return null
  const html = (header: (typeof GAUGE_RICH_HEADERS)[number]) => rich?.(header) ?? escapeHtml(cell(header)).replace(/\n/g, "<br>")
  const color = cell("Couleur").trim()
  const step = Number.parseFloat(cell("Pas").replace(",", "."))
  const order = Number.parseFloat(cell("Ordre").replace(",", "."))
  return {
    id, name,
    classId: cell("Classe ID").trim(),
    className: cell("Classe").trim(),
    color: /^#[0-9a-f]{3,8}$/i.test(color) ? color : gaugeColors[0],
    placement: choice(gaugePlacements, cell("Emplacement"), "vie", { vie: "vie", "sous la barre": "vie", bandeau: "bandeau", caract: "bandeau", sort: "sorts" }),
    display: choice(gaugeDisplays, cell("Affichage"), "barre", { past: "pastilles", point: "pastilles", nomb: "nombre", chiff: "nombre" }),
    min: cell("Minimum").trim(),
    maxMode: choice(gaugeMaxModes, cell("Maximum (type)"), "fixe", { form: "formule", reli: "formule", calc: "formule", joue: "joueur", libre: "joueur" }),
    max: cell("Maximum").trim(),
    currentMode: choice(gaugeCurrentModes, cell("Valeur actuelle (type)"), "joueur", { form: "formule", reli: "formule", calc: "formule", joue: "joueur", libre: "joueur", tenu: "joueur" }),
    current: cell("Valeur actuelle").trim(),
    step: Number.isFinite(step) && step > 0 ? step : 1,
    resetButton: cell("Remise à zéro").trim() ? yes(cell("Remise à zéro")) : true,
    thresholds: parseGaugeThresholdsHtml(html("Seuils")),
    description: plainTextOf(html("Description")) ? html("Description") : "",
    order: Number.isFinite(order) ? order : 0,
    forms: cell("Formes").split(/\n|;|,/).map((name) => name.trim()).filter(Boolean).slice(0, 12),
    resetOnLeave: yes(cell("Remise à zéro en quittant la forme")),
    addTo: cell("S'ajoute à").trim(),
  }
}

/**
 * Les cases d'une jauge, par en-tête, telles qu'elles s'écrivent dans la feuille. Seuils et
 * Description sont du contenu mis en forme (HTML), écrit comme une case formatée.
 */
export function gaugeCells(gauge: ClassGauge): Record<GaugeHeader, string> {
  return {
    "ID": gauge.id,
    "Classe": gauge.className,
    "Nom": gauge.name.trim(),
    "Couleur": gauge.color,
    "Emplacement": label(gaugePlacements, gauge.placement),
    "Affichage": label(gaugeDisplays, gauge.display),
    "Minimum": gauge.min.trim(),
    "Maximum (type)": label(gaugeMaxModes, gauge.maxMode),
    "Maximum": gauge.max.trim(),
    "Valeur actuelle (type)": label(gaugeCurrentModes, gauge.currentMode),
    "Valeur actuelle": gauge.current.trim(),
    "Pas": String(gauge.step),
    "Remise à zéro": gauge.resetButton ? "Oui" : "Non",
    "Seuils": gaugeThresholdsHtml(gauge.thresholds),
    "Description": plainTextOf(gauge.description) ? gauge.description : "",
    "Ordre": String(gauge.order),
    "Classe ID": gauge.classId,
    "Formes": gauge.forms.join("\n"),
    "Remise à zéro en quittant la forme": gauge.resetOnLeave ? "Oui" : "",
    "S'ajoute à": gauge.addTo.trim(),
  }
}

/** Ce qu'une jauge reçue (éditeur, route) peut contenir ; le reste est ramené à des valeurs sûres. */
export function sanitizeGauge(raw: unknown): ClassGauge | null {
  if (!raw || typeof raw !== "object") return null
  const value = raw as Record<string, unknown>
  const text = (key: string, limit = 400) => typeof value[key] === "string" ? (value[key] as string).slice(0, limit) : typeof value[key] === "number" ? String(value[key]) : ""
  const thresholds: GaugeThreshold[] = Array.isArray(value.thresholds) ? value.thresholds.flatMap((item) => item && typeof item === "object" ? [{ value: String((item as GaugeThreshold).value ?? "").slice(0, 200), label: inlineRichText(String((item as GaugeThreshold).label ?? "")).slice(0, 4000) }] : []).slice(0, 12) : []
  const key: Record<GaugeHeader, string> = { "ID": "id", "Classe": "className", "Nom": "name", "Couleur": "color", "Emplacement": "placement", "Affichage": "display", "Minimum": "min", "Maximum (type)": "maxMode", "Maximum": "max", "Valeur actuelle (type)": "currentMode", "Valeur actuelle": "current", "Pas": "step", "Remise à zéro": "resetButton", "Seuils": "thresholds", "Description": "description", "Ordre": "order", "Classe ID": "classId", "Formes": "forms", "Remise à zéro en quittant la forme": "resetOnLeave", "S'ajoute à": "addTo" }
  const forms = Array.isArray(value.forms) ? value.forms.flatMap((name) => typeof name === "string" && name.trim() ? [name.trim().slice(0, 200)] : []).slice(0, 12) : []
  const gauge = gaugeFromCells((header) => header === "Remise à zéro" ? (value.resetButton === false ? "Non" : "Oui") : header === "Formes" ? forms.join("\n") : header === "Remise à zéro en quittant la forme" ? (value.resetOnLeave === true ? "Oui" : "") : text(key[header]), (header) => header === "Seuils" ? "" : text("description", 20_000))
  return gauge && { ...gauge, thresholds: thresholds.filter((item) => item.value.trim()) }
}

/** Les jauges d'une classe, dans leur ordre ; retrouvées par l'identifiant, sinon par le nom de la classe. */
export function gaugesOfClass(gauges: ClassGauge[], classItem: { id: string; name: string }) {
  return gauges.filter((gauge) => gauge.classId ? gauge.classId === classItem.id : fold(gauge.className) === fold(classItem.name)).sort((a, b) => a.order - b.order || a.name.localeCompare(b.name, "fr"))
}

/** La jauge s'affiche-t-elle avec ces formes actives (noms) ? Sans formes choisies : toujours. */
export function gaugeVisibleIn(gauge: ClassGauge, activeFormNames: string[]) {
  if (!gauge.forms.length) return true
  const active = new Set(activeFormNames.map(fold))
  return gauge.forms.some((name) => active.has(fold(name)))
}

/* ─────────────────────────────── Formules ─────────────────────────────── */

/**
 * Les valeurs qu'une formule peut lire, par nom. Les noms sont comparés sans accents ni
 * majuscules : « {points de vie max} » vaut « {Points de vie max} ».
 */
export type FormulaValues = Map<string, number>

export function formulaValues(entries: Array<[string, number]>): FormulaValues {
  return new Map(entries.filter(([, value]) => Number.isFinite(value)).map(([name, value]) => [fold(name), value]))
}

/** Les noms toujours connus d'une jauge, en plus de ceux de la fiche. */
export const GAUGE_SELF_VALUES = ["Minimum", "Maximum"] as const
/** Les valeurs de la fiche qu'une formule peut lire, en plus des caractéristiques et compétences. */
export const SHEET_FORMULA_VALUES = ["Niveau", "Points de vie actuels", "Points de vie max"] as const

/** Les secondaires qui ne sont pas des nombres, et la vie (déjà proposée en actuels / max). */
const notNumbers = new Set(["Classe sociale", "Alignement", "Vie totale"])

/**
 * Les valeurs qu'une formule peut lire, rangées pour l'éditeur : la fiche (niveau, vie),
 * les caractéristiques principales, secondaires et de déplacement, les compétences.
 */
export function formulaNameGroups(catalog: CharacterCatalog, withSelf = false): Array<{ label: string; items: string[] }> {
  const of = (kind: string) => catalog.characteristics.filter((item) => item.kind === kind && !notNumbers.has(item.key)).map((item) => item.name)
  return [
    ...(withSelf ? [{ label: "Cette jauge", items: [...GAUGE_SELF_VALUES] }] : []),
    { label: "Fiche", items: [...SHEET_FORMULA_VALUES] },
    { label: "Caractéristiques principales", items: of("principale") },
    { label: "Caractéristiques secondaires", items: of("secondaire") },
    { label: "Déplacement", items: of("deplacement") },
    { label: "Compétences", items: catalog.skills.map((skill) => skill.name) },
  ].filter((group) => group.items.length)
}

/** Des valeurs d'exemple pour l'aperçu de l'éditeur : vie 60 / 100, niveau 5, le reste à 50. */
export function sampleFormulaValues(catalog: CharacterCatalog): FormulaValues {
  return formulaValues([
    ...formulaNameGroups(catalog).flatMap((group) => group.items.map((name) => [name, 50] as [string, number])),
    ["Niveau", 5], ["Points de vie actuels", 60], ["Points de vie max", 100],
  ])
}

export type FormulaResult = { ok: true; value: number } | { ok: false; error: string }

/** « {Points de vie max} - {Points de vie actuels} », « 50 », « {Force} * 2 + 10 ». */
export function evaluateFormula(formula: string, values: FormulaValues): FormulaResult {
  const text = formula.trim()
  if (!text) return { ok: false, error: "Formule vide" }
  const unknown: string[] = []
  const replaced = text.replace(/\{([^{}]*)\}/g, (_, name: string) => {
    const value = values.get(fold(name))
    if (value === undefined) { unknown.push(name.trim()); return "0" }
    return value < 0 ? `(0-${-value})` : String(value)
  })
  if (unknown.length) return { ok: false, error: `Valeur inconnue : ${unknown.map((name) => `{${name}}`).join(", ")}` }
  if (/[{}]/.test(replaced)) return { ok: false, error: "Accolade mal fermée" }
  try {
    const value = evaluateMathExpression(replaced.replace(/,/g, "."))
    return Number.isFinite(value) ? { ok: true, value: Math.round(value * 100) / 100 } : { ok: false, error: "Résultat illisible" }
  } catch {
    return { ok: false, error: "Formule illisible" }
  }
}

/** Les noms entre accolades d'une formule. */
export const formulaNames = (formula: string) => [...formula.matchAll(/\{([^{}]*)\}/g)].map((match) => match[1].trim())

/* ─────────────────────────────── Jeu ─────────────────────────────── */

/** Ce que le joueur a changé sur une jauge, rangé dans sa fiche. */
export type GaugeState = { current?: number; max?: number }

export function parseGaugeState(raw: unknown): GaugeState {
  if (!raw || typeof raw !== "object") return {}
  const value = raw as Record<string, unknown>
  const number = (item: unknown) => typeof item === "number" && Number.isFinite(item) ? item : undefined
  const current = number(value.current)
  const max = number(value.max)
  return { ...(current !== undefined ? { current } : {}), ...(max !== undefined ? { max } : {}) }
}

export type ResolvedGauge = {
  gauge: ClassGauge
  min: number
  max: number
  current: number
  /** Le joueur change la valeur actuelle (− / +, saisie) ; sinon elle est calculée. */
  editableCurrent: boolean
  editableMax: boolean
  /** La valeur de départ, pour la remise à zéro. */
  start: number
  /** 0 à 100. */
  ratio: number
  thresholds: Array<{ value: number; label: string; ratio: number }>
  /** Ce qui n'a pas pu être calculé (formule à revoir), affiché au MJ et dans l'aperçu. */
  errors: string[]
}

const round = (value: number) => Math.round(value * 100) / 100

/** La jauge telle qu'elle s'affiche pour une fiche : valeurs calculées, bornées, et ce que le joueur a changé. */
export function resolveGauge(gauge: ClassGauge, values: FormulaValues, state: GaugeState = {}): ResolvedGauge {
  const errors: string[] = []
  const compute = (formula: string, fallback: number, scope = values, what = "") => {
    if (!formula.trim()) return fallback
    const result = evaluateFormula(formula, scope)
    if (result.ok) return result.value
    errors.push(what ? `${what} : ${result.error}` : result.error)
    return fallback
  }
  const min = compute(gauge.min, 0, values, "Minimum")
  const baseMax = compute(gauge.max, min, values, "Maximum")
  const max = Math.max(min, gauge.maxMode === "joueur" && state.max !== undefined ? state.max : baseMax)
  const own = new Map(values)
  own.set(fold("Minimum"), min)
  own.set(fold("Maximum"), max)
  const clamp = (value: number) => max > min ? Math.max(min, Math.min(max, value)) : Math.max(min, value)
  const start = clamp(compute(gauge.current, min, own, gauge.currentMode === "formule" ? "Valeur actuelle" : "Valeur de départ"))
  const current = gauge.currentMode === "joueur" && state.current !== undefined ? clamp(state.current) : start
  const span = max - min
  const ratioOf = (value: number) => span > 0 ? Math.max(0, Math.min(100, ((value - min) / span) * 100)) : 0
  const thresholds = gauge.thresholds.flatMap((threshold) => {
    const result = evaluateFormula(threshold.value, own)
    if (!result.ok) { errors.push(`Seuil « ${threshold.value} » : ${result.error}`); return [] }
    return [{ value: result.value, label: threshold.label, ratio: ratioOf(result.value) }]
  })
  return { gauge, min: round(min), max: round(max), current: round(current), editableCurrent: gauge.currentMode === "joueur", editableMax: gauge.maxMode === "joueur", start: round(start), ratio: ratioOf(current), thresholds, errors }
}

/**
 * Ce que les jauges « S'ajoute à » changent sur la fiche, comme un état : la valeur de la
 * jauge s'ajoute à sa caractéristique (« Folie temporaire » 3 → Folie +3). Une jauge cachée
 * (hors de ses formes) n'ajoute rien. `values` : la fiche sans ces ajouts, pour ne pas
 * tourner en rond si la jauge lit la valeur qu'elle change.
 */
export function gaugeContributions(gauges: ClassGauge[], states: Record<string, GaugeState>, values: FormulaValues, activeFormNames: string[], targetOf: (name: string) => string | null) {
  return gauges.flatMap((gauge) => {
    if (!gauge.addTo.trim() || !gaugeVisibleIn(gauge, activeFormNames)) return []
    const target = targetOf(gauge.addTo)
    const amount = resolveGauge(gauge, values, states[gauge.id]).current
    if (!target || !amount) return []
    return [{ state: gauge.name, level: 1 as const, effect: gauge.name, target, amount, label: `${amount > 0 ? "+" : ""}${amount}`, color: gauge.color, fx: [] }]
  })
}

/**
 * La case des sorts choisis après un changement de jauge par le joueur. `patch` à
 * `undefined` retire la valeur (retour à la valeur de départ). Tout le reste est gardé.
 */
export function withGaugeState(choicesJson: string, gaugeId: string, patch: Partial<Record<keyof GaugeState, number | undefined>>) {
  let parsed: Record<string, unknown> = {}
  try {
    const value = JSON.parse(choicesJson || "{}") as unknown
    if (value && typeof value === "object" && !Array.isArray(value)) parsed = value as Record<string, unknown>
  } catch { /* case vide ou illisible : on part de rien */ }
  const specifics = parsed.specifics && typeof parsed.specifics === "object" && !Array.isArray(parsed.specifics) ? { ...(parsed.specifics as Record<string, unknown>) } : {}
  const next: GaugeState = { ...parseGaugeState(specifics[gaugeId]) }
  for (const key of ["current", "max"] as const) {
    if (!(key in patch)) continue
    const value = patch[key]
    if (value === undefined || !Number.isFinite(value)) delete next[key]
    else next[key] = round(value)
  }
  if (Object.keys(next).length) specifics[gaugeId] = next
  else delete specifics[gaugeId]
  return JSON.stringify({ ...parsed, specifics })
}

/** L'état de jeu des jauges d'une fiche, d'après sa case des sorts choisis. */
export function gaugeStatesOf(choicesJson: string): Record<string, GaugeState> {
  try {
    const parsed = JSON.parse(choicesJson || "{}") as { specifics?: unknown }
    if (!parsed?.specifics || typeof parsed.specifics !== "object" || Array.isArray(parsed.specifics)) return {}
    return Object.fromEntries(Object.entries(parsed.specifics as Record<string, unknown>).map(([id, raw]) => [id, parseGaugeState(raw)]))
  } catch {
    return {}
  }
}
