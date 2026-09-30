/**
 * Les nombres des index : unités (distance, poids), monnaie du monde et plages.
 * La feuille garde un texte lisible (« 1,5 PO », « 2–5 m ») ; Eraser le lit, le
 * convertit, le trie sur sa vraie valeur et l'écrit toujours de la même façon.
 *
 * Monnaie : 1 PO = 100 PC, 1 PN = 1,5 PO. Les pièces d'argent (PA) et de bronze (PB)
 * n'existent pas : ce sont des erreurs de saisie pour des pièces de cuivre.
 */

export type UnitFamily = "none" | "money" | "distance" | "weight"

export type NumberFormat = {
  /** Famille d'unités convertibles entre elles. */
  unit?: UnitFamily
  /** Unité par défaut quand la cellule n'en écrit aucune (« PO », « m »…). */
  defaultUnit?: string
  /** Nombre de décimales affichées (automatique si absent). */
  decimals?: number
  /** Texte avant et après le nombre (« ~ », « kg »…), sans conversion. */
  prefix?: string
  suffix?: string
  percent?: boolean
  /** La cellule contient une plage : « 2–5 ». */
  range?: boolean
}

type UnitDefinition = { code: string; label: string; title: string; factor: number; aliases: string[]; tone?: string }

/** Les unités de chaque famille. `factor` : combien d'unités de base vaut une unité. */
export const unitFamilies: Record<Exclude<UnitFamily, "none">, { label: string; base: string; units: UnitDefinition[] }> = {
  money: {
    label: "Monnaie (PO, PC, PN)",
    base: "PC",
    units: [
      { code: "PO", label: "PO", title: "Pièce d’or", factor: 100, aliases: ["po", "p.o.", "or", "piece d'or", "pieces d'or", "piece or", "gold"], tone: "border-amber-300 bg-amber-100 text-amber-900" },
      { code: "PC", label: "PC", title: "Pièce de cuivre", factor: 1, aliases: ["pc", "p.c.", "cuivre", "piece de cuivre", "pieces de cuivre", "pa", "p.a.", "argent", "piece d'argent", "pieces d'argent", "pb", "p.b.", "bronze", "piece de bronze", "pieces de bronze"], tone: "border-orange-300 bg-orange-100 text-orange-900" },
      { code: "PN", label: "PN", title: "Pièce d’or noir", factor: 150, aliases: ["pn", "p.n.", "pon", "p.o.n.", "or noir", "piece d'or noir", "pieces d'or noir"], tone: "border-zinc-700 bg-zinc-900 text-amber-200" },
    ],
  },
  distance: {
    label: "Distance (cm, m, km)",
    base: "cm",
    units: [
      { code: "cm", label: "cm", title: "Centimètre", factor: 1, aliases: ["cm", "centimetre", "centimetres"] },
      { code: "m", label: "m", title: "Mètre", factor: 100, aliases: ["m", "metre", "metres", "mètre", "mètres"] },
      { code: "km", label: "km", title: "Kilomètre", factor: 100_000, aliases: ["km", "kilometre", "kilometres"] },
    ],
  },
  weight: {
    label: "Poids (g, kg, t)",
    base: "g",
    units: [
      { code: "g", label: "g", title: "Gramme", factor: 1, aliases: ["g", "gr", "gramme", "grammes"] },
      { code: "kg", label: "kg", title: "Kilogramme", factor: 1000, aliases: ["kg", "kilo", "kilos", "kilogramme", "kilogrammes"] },
      { code: "t", label: "t", title: "Tonne", factor: 1_000_000, aliases: ["t", "tonne", "tonnes"] },
    ],
  },
}

function fold(value: string) {
  return value.normalize("NFD").replace(/\p{M}/gu, "").replace(/[’‘]/g, "'").toLocaleLowerCase("fr").replace(/\s+/g, " ").trim()
}

/** L'unité d'une famille qui correspond à un texte (« po », « pièces d'or », « PON »…). */
export function findUnit(family: UnitFamily | undefined, text: string) {
  if (!family || family === "none") return undefined
  const key = fold(text).replace(/\.$/, "")
  if (!key) return undefined
  return unitFamilies[family].units.find((unit) => unit.aliases.some((alias) => fold(alias) === key) || fold(unit.code) === key)
}

export function unitsOf(family: UnitFamily | undefined) {
  return family && family !== "none" ? unitFamilies[family].units : []
}

export type ParsedNumber = {
  /** Valeur (ou borne basse d'une plage) dans l'unité de base de la famille. */
  base: number
  /** Borne haute d'une plage, dans l'unité de base. */
  baseMax?: number
  /** Unité dans laquelle la cellule s'affiche. */
  unit?: string
  /** Une unité inconnue a été écrite : la valeur est gardée telle quelle. */
  unknown?: boolean
  /** « PA » ou « PB » ont été lus comme des « PC ». */
  corrected?: boolean
}

function toNumber(text: string) {
  const cleaned = text.replace(/\s| | /g, "").replace(",", ".")
  const value = Number(cleaned)
  return Number.isFinite(value) ? value : Number.NaN
}

const numberPattern = /-?\d[\d\s  ]*(?:[.,]\d+)?/

/**
 * Lit une cellule : « 12 », « 1,5 PO », « 1 PO 50 PC », « 2–5 m », « 30 % ». Plusieurs
 * montants dans des unités différentes sont additionnés ; ils s'affichent ensuite dans
 * la première unité écrite. `null` si la cellule ne contient pas de nombre.
 */
export function parseIndexNumber(value: string, format: NumberFormat = {}): ParsedNumber | null {
  const text = value.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").trim()
  if (!text) return null
  const family = format.unit ?? "none"
  // Plage : deux nombres séparés par un tiret, « à » ou « - ».
  const range = text.match(new RegExp(`^\\s*(${numberPattern.source})\\s*(?:–|—|-|à|a)\\s*(${numberPattern.source})\\s*(.*)$`, "i"))
  if (range && !/^-/.test(range[2])) {
    const low = toNumber(range[1])
    const high = toNumber(range[2])
    const unit = findUnit(family, range[3]) ?? findUnit(family, format.defaultUnit ?? "")
    if (Number.isFinite(low) && Number.isFinite(high)) {
      const factor = unit?.factor ?? 1
      return { base: Math.min(low, high) * factor, baseMax: Math.max(low, high) * factor, unit: unit?.code, unknown: Boolean(range[3].trim()) && !unit && family !== "none", corrected: isCorrected(range[3]) }
    }
  }
  const parts = [...text.matchAll(new RegExp(`(${numberPattern.source})\\s*([^\\d\\s,;+-][^\\d,;+]*)?`, "g"))]
  if (!parts.length) return null
  let base = 0
  let firstUnit: string | undefined
  let unknown = false
  let corrected = false
  for (const part of parts) {
    const amount = toNumber(part[1])
    if (!Number.isFinite(amount)) continue
    const label = (part[2] ?? "").replace(/%/g, "").trim()
    const unit = findUnit(family, label) ?? (label ? undefined : findUnit(family, format.defaultUnit ?? ""))
    if (label && !unit && family !== "none") unknown = true
    if (isCorrected(label)) corrected = true
    base += amount * (unit?.factor ?? 1)
    firstUnit ??= unit?.code
  }
  return { base, unit: firstUnit, unknown, corrected }
}

function isCorrected(label: string) {
  return /^(p\.?\s?[ab]\.?|argent|bronze|pieces? d'argent|pieces? de bronze)$/i.test(fold(label))
}

/** « 1 234,5 » : décimales automatiques (jusqu'à 2) sauf réglage contraire. */
export function formatAmount(value: number, decimals?: number) {
  const digits = decimals ?? (Number.isInteger(value) ? 0 : Math.abs(value) < 1 ? 2 : Math.abs(value * 10) % 1 === 0 ? 1 : 2)
  return value.toLocaleString("fr-FR", { minimumFractionDigits: decimals ?? 0, maximumFractionDigits: digits }).replace(/ /g, " ")
}

/** La valeur dans une unité donnée (sans arrondi). */
export function convertBase(base: number, family: UnitFamily | undefined, unit: string | undefined) {
  const definition = findUnit(family, unit ?? "")
  return definition ? base / definition.factor : base
}

/**
 * Le texte écrit dans la feuille pour une valeur : toujours la même forme, dans l'unité
 * choisie (« 1,5 PO », « 2–5 m », « 30 % »).
 */
export function formatIndexNumber(parsed: ParsedNumber, format: NumberFormat = {}, unit = parsed.unit) {
  const family = format.unit ?? "none"
  const code = findUnit(family, unit ?? "")?.code ?? (family !== "none" ? findUnit(family, format.defaultUnit ?? "")?.code : undefined)
  const low = formatAmount(convertBase(parsed.base, family, code), format.decimals)
  const high = parsed.baseMax !== undefined ? formatAmount(convertBase(parsed.baseMax, family, code), format.decimals) : undefined
  const amount = high !== undefined && high !== low ? `${low}–${high}` : low
  const suffix = format.percent ? " %" : code ? ` ${code}` : format.suffix ? ` ${format.suffix}` : ""
  return `${format.prefix ? `${format.prefix} ` : ""}${amount}${suffix}`
}

/** Les conversions d'une valeur dans toutes les unités de sa famille (« 1,5 PO · 150 PC · 1 PN »). */
export function conversionsOf(parsed: ParsedNumber, format: NumberFormat = {}) {
  return unitsOf(format.unit).map((unit) => ({ unit: unit.code, title: unit.title, text: formatIndexNumber(parsed, format, unit.code) }))
}

/** Clé de tri numérique d'une cellule (les vides à la fin). */
export function numberSortKey(value: string, format: NumberFormat = {}) {
  const parsed = parseIndexNumber(value, format)
  return parsed ? parsed.base : Number.POSITIVE_INFINITY
}

/**
 * La forme corrigée d'une cellule, ou `null` si elle est déjà correcte : les pièces
 * d'argent ou de bronze deviennent des pièces de cuivre, l'écriture est harmonisée.
 */
export function numberCorrection(value: string, format: NumberFormat = {}) {
  const parsed = parseIndexNumber(value, format)
  if (!parsed || parsed.unknown) return null
  const next = formatIndexNumber(parsed, format)
  return parsed.corrected && next !== value.trim() ? next : null
}

export function unitTone(family: UnitFamily | undefined, unit: string | undefined) {
  return findUnit(family, unit ?? "")?.tone
}
