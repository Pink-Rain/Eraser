/**
 * Le tri des index : il lit ce que la case affiche, pas le texte brut de Sheets. Une
 * formule se trie sur son résultat, une liste sur son choix bien écrit, une référence
 * « { » sur le nom actuel de sa ligne, un nombre sur sa valeur, une case à cocher sur
 * son état. Les cases vides restent en bas dans les deux sens, comme dans Sheets.
 *
 * Sans dépendance au navigateur : la page fournit, si elle le peut, le nom actuel d'une
 * référence (`resolveReference`).
 */
import { gaugeScaleOf, isCheckedValue, matchChoice, normalizeSpec, parseGaugeCell, splitListValue, type IndexColumnSpec } from "@/lib/index-columns"
import { parseIndexNumber } from "@/lib/index-numbers"

/** La clé de tri d'une case : vide, un nombre, ou le texte affiché. */
export type IndexSortKey = { empty: boolean; number: number | null; text: string }

export type SortTextOptions = {
  /** Le texte affiché d'un lien de référence (« /reference/… ») ; `undefined` : son libellé. */
  resolveReference?: (href: string, label: string) => string | undefined
}

const referenceLink = /<a\b[^>]*\bhref="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi

function decode(value: string) {
  return value.replace(/&nbsp;/gi, " ").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&quot;/gi, "\"").replace(/&#39;/gi, "'").replace(/&amp;/gi, "&")
}

function stripTags(html: string) {
  return html.replace(/<br\s*\/?>/gi, " ").replace(/<\/(?:p|div|li|h\d)>/gi, " ").replace(/<[^>]+>/g, "")
}

/** Le texte que montre une case : sans balises, références remplacées par leur nom actuel. */
export function displayedCellText(value: string, options: SortTextOptions = {}) {
  let text = String(value ?? "")
  if (text.includes("<")) {
    if (options.resolveReference && text.includes("/reference/")) {
      text = text.replace(referenceLink, (match, href: string, label: string) => {
        const plain = decode(stripTags(label)).replace(/\s+/g, " ").trim()
        return options.resolveReference!(decode(href), plain) ?? plain
      })
    }
    text = stripTags(text)
  }
  return decode(text).replace(/\s+/g, " ").trim()
}

/** Guillemets, puces, émojis et tirets de tête ne comptent pas pour l'ordre alphabétique. */
const leadingSymbols = /^[^\p{L}\p{N}]+/u

function textKey(text: string) {
  return text.replace(leadingSymbols, "") || text
}

/** Le nombre d'un texte qui commence par un nombre (« 12 », « -3,5 PO », « 2|skull »). */
function leadingNumber(text: string) {
  const match = text.match(/^[-+−]?\d[\d\s .]*(?:,\d+)?/)
  if (!match) return null
  const parsed = Number.parseFloat(match[0].replace(/[\s ]/g, "").replace("−", "-").replace(/\.(?=\d{3}(?:\D|$))/g, "").replace(",", "."))
  return Number.isFinite(parsed) ? parsed : null
}

function numberOf(text: string, spec: IndexColumnSpec) {
  if (spec.number) {
    const parsed = parseIndexNumber(text, spec.number)
    if (parsed && Number.isFinite(parsed.base)) return parsed.base
  }
  return leadingNumber(text)
}

/**
 * La clé de tri d'une case. `value` est ce que la page sait de la case : le texte de
 * Sheets (ou le HTML d'une colonne mise en forme), ou le résultat d'une colonne calculée.
 */
export function indexSortKey(value: string, input?: IndexColumnSpec, options: SortTextOptions = {}): IndexSortKey {
  const spec = input ? normalizeSpec(input) : undefined
  const text = displayedCellText(value, options)
  if (spec?.kind === "checkbox") return { empty: false, number: isCheckedValue(text, spec.emptyChecked) ? 1 : 0, text }
  if (!text) return { empty: true, number: null, text: "" }
  switch (spec?.kind) {
    case "number":
    case "rollup":
    case "formula": {
      const number = numberOf(text, spec)
      return number === null ? { empty: false, number: null, text: textKey(text) } : { empty: false, number, text }
    }
    case "gauge": {
      const { count } = parseGaugeCell(text)
      const number = leadingNumber(count)
      // Une jauge « sans limite » (« ✦ ») passe après toutes les autres.
      if (number === null && spec.gauge?.unlimited && gaugeScaleOf(spec.gauge) === "cell" && count === spec.gauge.unlimited) return { empty: false, number: Number.MAX_SAFE_INTEGER, text }
      return { empty: false, number, text: textKey(count || text) }
    }
    case "choice": {
      // Le choix tel que la liste l'écrit : « Aggressif » se range à « Agressif ».
      const options = spec.options ?? []
      const values = spec.multiple ? splitListValue(text, options) : [text]
      const shown = values.map((item) => matchChoice(item, options)?.value ?? item).join(", ")
      return { empty: false, number: null, text: textKey(shown) }
    }
    default: {
      // Un texte qui n'est qu'un nombre (« 12 », « -3,5 ») se range comme un nombre.
      const number = /^[-+−]?\d[\d\s ]*(?:[.,]\d+)?$/.test(text) ? leadingNumber(text.replace(/\./g, ",")) : null
      return number === null ? { empty: false, number: null, text: textKey(text) } : { empty: false, number, text }
    }
  }
}

const collator = new Intl.Collator("fr", { numeric: true, sensitivity: "base", ignorePunctuation: false })

/**
 * Compare deux clés. `direction` : 1 de A à Z, -1 de Z à A. Les vides restent en bas
 * dans les deux sens ; les nombres passent avant le texte (et après, de Z à A).
 */
export function compareIndexSortKeys(left: IndexSortKey, right: IndexSortKey, direction: 1 | -1 = 1) {
  if (left.empty || right.empty) return left.empty === right.empty ? 0 : left.empty ? 1 : -1
  if (left.number !== null && right.number !== null) {
    if (left.number !== right.number) return (left.number < right.number ? -1 : 1) * direction
    return collator.compare(left.text, right.text) * direction
  }
  if (left.number !== null) return -direction
  if (right.number !== null) return direction
  return collator.compare(left.text, right.text) * direction
}

/** Trie des éléments sur leur clé, calculée une seule fois chacun. Le tri est stable. */
export function sortByIndexKey<T>(items: T[], keyOf: (item: T) => IndexSortKey, direction: 1 | -1) {
  return items.map((item) => ({ item, key: keyOf(item) }))
    .sort((left, right) => compareIndexSortKeys(left.key, right.key, direction))
    .map((entry) => entry.item)
}
