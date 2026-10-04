/**
 * La mise en page d'un onglet d'index, réglée dans « Modifier » sans écrire de code :
 *
 * - la fiche (et le formulaire d'ajout) : une colonne latérale (portrait, image…), puis des
 *   sections, chacune faite de lignes de champs côte à côte, chacun de sa largeur ;
 * - le survol d'une ligne citée en entier (« {État:Sérénité} ») : la même chose, en
 *   lecture, avec en tête l'image et la ligne de sous-titre choisies.
 *
 * Un onglet sans mise en page garde l'affichage automatique. Une colonne absente de la mise
 * en page (ajoutée plus tard, par exemple) s'affiche à la suite, sauf si la mise en page
 * dit de masquer le reste. Rien n'est jamais perdu : une colonne renommée ou supprimée
 * disparaît simplement de la mise en page.
 *
 * Sans dépendance : l'éditeur, la fiche et la résolution des références (serveur) s'en
 * servent. Gardé sur le serveur partagé d'Eraser (lib/index-layouts-store.ts), jamais dans
 * Google Sheets.
 */
import { foldName } from "@/lib/index-columns"

/** La largeur d'un champ, sur une ligne de 12 : ¼, ⅓, ½, ⅔, ¾, toute la ligne. */
export type LayoutSpan = 3 | 4 | 6 | 8 | 9 | 12

export const layoutSpans: Array<{ value: LayoutSpan; label: string; short: string }> = [
  { value: 3, label: "Un quart de la ligne", short: "¼" },
  { value: 4, label: "Un tiers de la ligne", short: "⅓" },
  { value: 6, label: "La moitié de la ligne", short: "½" },
  { value: 8, label: "Deux tiers de la ligne", short: "⅔" },
  { value: 9, label: "Trois quarts de la ligne", short: "¾" },
  { value: 12, label: "Toute la ligne", short: "Plein" },
]

export type LayoutField = {
  column: string
  span?: LayoutSpan
  /** Le nom de la colonne n'est pas écrit au-dessus du champ. */
  hideLabel?: boolean
  /** Le champ en grand (un nom, un titre). */
  large?: boolean
}

export type LayoutRow = { id: string; fields: LayoutField[] }

export type LayoutSection = {
  id: string
  /** Titre écrit au-dessus de la section (« Caractéristiques »). */
  title?: string
  /** Section dans un cadre. */
  framed?: boolean
  rows: LayoutRow[]
}

export type IndexLayout = {
  /** La colonne latérale, à gauche : portrait, image, icône… empilés. */
  aside: LayoutField[]
  asideWidth?: "sm" | "md" | "lg"
  sections: LayoutSection[]
  /** Les colonnes que la mise en page ne place pas : à la suite, ou masquées. */
  rest?: "show" | "hide"
  /** Survol seulement : la colonne de l'image (ou de l'icône) en tête, et celle du sous-titre. */
  image?: string
  subtitle?: string
}

/** Les deux mises en page d'un onglet. */
export type TabLayouts = { form?: IndexLayout; hover?: IndexLayout }

export type LayoutKind = keyof TabLayouts

const MAX_SECTIONS = 30
const MAX_ROWS = 40
const MAX_FIELDS = 12
const spans = new Set<number>(layoutSpans.map((span) => span.value))

export function layoutId() {
  return Math.random().toString(36).slice(2, 10)
}

function cleanText(value: unknown, max = 80) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : ""
}

function cleanField(input: unknown): LayoutField | null {
  if (!input || typeof input !== "object") return null
  const raw = input as Record<string, unknown>
  const column = cleanText(raw.column, 120)
  if (!column) return null
  const field: LayoutField = { column }
  if (typeof raw.span === "number" && spans.has(raw.span)) field.span = raw.span as LayoutSpan
  if (raw.hideLabel === true) field.hideLabel = true
  if (raw.large === true) field.large = true
  return field
}

/** Une mise en page lue (JSON de la feuille ou envoyé par l'éditeur), bornée et nettoyée ; null si vide ou illisible. */
export function parseIndexLayout(input: unknown): IndexLayout | null {
  let value = input
  if (typeof value === "string") {
    if (!value.trim()) return null
    try { value = JSON.parse(value) } catch { return null }
  }
  if (!value || typeof value !== "object") return null
  const raw = value as Record<string, unknown>
  const seen = new Set<string>()
  const keep = (field: LayoutField | null) => {
    if (!field || seen.has(foldName(field.column))) return null
    seen.add(foldName(field.column))
    return field
  }
  const aside = (Array.isArray(raw.aside) ? raw.aside : []).map(cleanField).map(keep).filter((field): field is LayoutField => Boolean(field)).slice(0, MAX_FIELDS)
  const sections = (Array.isArray(raw.sections) ? raw.sections : []).slice(0, MAX_SECTIONS).flatMap((entry): LayoutSection[] => {
    if (!entry || typeof entry !== "object") return []
    const section = entry as Record<string, unknown>
    const rows = (Array.isArray(section.rows) ? section.rows : []).slice(0, MAX_ROWS).flatMap((rowEntry): LayoutRow[] => {
      if (!rowEntry || typeof rowEntry !== "object") return []
      const row = rowEntry as Record<string, unknown>
      const fields = (Array.isArray(row.fields) ? row.fields : []).map(cleanField).map(keep).filter((field): field is LayoutField => Boolean(field)).slice(0, MAX_FIELDS)
      return [{ id: cleanText(row.id, 20) || layoutId(), fields }]
    })
    const title = cleanText(section.title)
    return [{ id: cleanText(section.id, 20) || layoutId(), ...(title ? { title } : {}), ...(section.framed === true ? { framed: true } : {}), rows }]
  })
  const layout: IndexLayout = { aside, sections }
  if (raw.asideWidth === "sm" || raw.asideWidth === "md" || raw.asideWidth === "lg") layout.asideWidth = raw.asideWidth
  if (raw.rest === "hide") layout.rest = "hide"
  else if (raw.rest === "show") layout.rest = "show"
  const image = cleanText(raw.image, 120)
  const subtitle = cleanText(raw.subtitle, 120)
  if (image) layout.image = image
  if (subtitle) layout.subtitle = subtitle
  if (!aside.length && !sections.some((section) => section.rows.some((row) => row.fields.length)) && !image && !subtitle) return null
  return layout
}

/** Le texte JSON gardé dans la feuille (vide : pas de mise en page). */
export function serializeIndexLayout(layout: IndexLayout | null | undefined) {
  const clean = layout ? parseIndexLayout(layout) : null
  return clean ? JSON.stringify(clean) : ""
}

/** Toutes les colonnes nommées par une mise en page, dans l'ordre. */
export function layoutColumns(layout: IndexLayout) {
  return [...layout.aside, ...layout.sections.flatMap((section) => section.rows.flatMap((row) => row.fields))].map((field) => field.column)
}

/** Une mise en page dont les colonnes renommées (ancien nom → nouveau) suivent leur nouveau nom. */
export function renameLayoutColumns(layout: IndexLayout, renames: Map<string, string>): IndexLayout {
  if (!renames.size) return layout
  const rename = (column: string) => renames.get(foldName(column)) ?? column
  const field = (item: LayoutField) => ({ ...item, column: rename(item.column) })
  return {
    ...layout,
    aside: layout.aside.map(field),
    sections: layout.sections.map((section) => ({ ...section, rows: section.rows.map((row) => ({ ...row, fields: row.fields.map(field) })) })),
    ...(layout.image ? { image: rename(layout.image) } : {}),
    ...(layout.subtitle ? { subtitle: rename(layout.subtitle) } : {}),
  }
}

export type ArrangedField<T> = LayoutField & { item: T }
export type ArrangedLayout<T> = {
  aside: Array<ArrangedField<T>>
  asideWidth: "sm" | "md" | "lg"
  sections: Array<{ id: string; title?: string; framed?: boolean; rows: Array<{ id: string; fields: Array<ArrangedField<T>> }> }>
  /** Les éléments que la mise en page ne place pas (affichés à la suite, sauf « masquées »). */
  rest: T[]
}

/**
 * Range des éléments (champs de la fiche, cases du survol) selon la mise en page. `keyOf`
 * donne la colonne de chaque élément. Une colonne de la mise en page absente des éléments
 * est sautée ; une ligne ou une section vide disparaît.
 */
export function arrangeLayout<T>(layout: IndexLayout, items: T[], keyOf: (item: T) => string): ArrangedLayout<T> {
  const byColumn = new Map(items.map((item) => [foldName(keyOf(item)), item]))
  const used = new Set<string>()
  const take = (field: LayoutField): ArrangedField<T>[] => {
    const key = foldName(field.column)
    const item = byColumn.get(key)
    if (!item || used.has(key)) return []
    used.add(key)
    return [{ ...field, item }]
  }
  const aside = layout.aside.flatMap(take)
  const sections = layout.sections.map((section) => ({
    id: section.id,
    title: section.title,
    framed: section.framed,
    rows: section.rows.map((row) => ({ id: row.id, fields: row.fields.flatMap(take) })).filter((row) => row.fields.length),
  })).filter((section) => section.rows.length || section.title)
  const rest = layout.rest === "hide" ? [] : items.filter((item) => !used.has(foldName(keyOf(item))))
  return { aside, asideWidth: layout.asideWidth ?? "md", sections, rest }
}

/**
 * Une mise en page de départ, proche de l'affichage automatique : les images dans la
 * colonne latérale, le nom en grand sur toute la ligne, le reste deux par deux et les
 * textes longs sur toute la ligne.
 */
export function startingLayout(columns: Array<{ header: string; picture?: boolean; long?: boolean; name?: boolean }>): IndexLayout {
  const aside = columns.filter((column) => column.picture).map((column): LayoutField => ({ column: column.header }))
  const rows: LayoutRow[] = []
  let pending: LayoutField[] = []
  const flush = () => { if (pending.length) rows.push({ id: layoutId(), fields: pending }); pending = [] }
  for (const column of columns) {
    if (column.picture) continue
    if (column.name || column.long) { flush(); rows.push({ id: layoutId(), fields: [{ column: column.header, span: 12, ...(column.name ? { large: true } : {}) }] }); continue }
    pending.push({ column: column.header, span: 6 })
    if (pending.length === 2) flush()
  }
  flush()
  return { aside, sections: [{ id: layoutId(), rows }] }
}

/** La mise en page d'un onglet parmi celles d'un index (nom d'onglet sans accents ni casse). */
export function tabLayout(layouts: Record<string, TabLayouts> | null | undefined, tab: string, kind: LayoutKind): IndexLayout | null {
  if (!layouts) return null
  const found = Object.entries(layouts).find(([name]) => foldName(name) === foldName(tab))
  return found?.[1][kind] ?? null
}
