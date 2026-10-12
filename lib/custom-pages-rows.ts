/**
 * Les pages de ligne : une page du créateur de pages réglée sur un index (`rowOf`) sert de
 * modèle à la page de chacune de ses lignes, à l'adresse stable /fiche/<index>/<ID>. Ses
 * blocs lisent les colonnes de la ligne (« {Nom} », « {Image} »), filtrent une vue sur elle,
 * montrent ses valeurs et les lignes d'autres index qui la citent.
 *
 * Règles pures : la route, le serveur des blocs et les tests s'en servent. Un joueur ne lit
 * jamais une colonne masquée ni une colonne privée d'une entité (comme les vues d'index).
 */
import { activeWhere, type CustomPage, type PageView, type ViewedBlock } from "@/lib/custom-pages"
import { foldName, isIdHeader } from "@/lib/index-columns"
import type { IndexLayout } from "@/lib/index-layouts"
import { parseReferenceHref } from "@/lib/index-references"
import { cellCitesRow, columnSpecIn, shownColumns, type BlockDataOptions, type IndexSource } from "@/lib/custom-pages-data"
import { matchesView } from "@/lib/index-views"
import { sanitizeRichText } from "@/lib/rich-text-sanitize"

/** La ligne d'une page de ligne : ses valeurs lisibles par le lecteur. */
export type RowContext = {
  index: string
  indexTitle: string
  tab: string
  id: string
  name: string
  /** Les colonnes montrées, dans l'ordre de l'onglet. */
  columns: Array<{ header: string; text: string; html: string }>
  /** La fiche de l'onglet (Modifier › Formulaire), quand un bloc « Valeurs de la ligne » la reprend. */
  form?: IndexLayout
  /** Les colonnes de l'onglet que le lecteur ne voit pas (leur « {…} » s'efface). */
  hidden: string[]
}

export const rowPageHref = (index: string, id: string) => `/fiche/${encodeURIComponent(index)}/${encodeURIComponent(id)}`

/**
 * Sur le fil, de la page au composant client (comme lib/index-rows-wire.ts pour les index) :
 * l'html d'une case identique à son texte est vidé avant l'envoi, puis rétabli avant usage.
 * Rétablir une ligne déjà rétablie ne change rien.
 */
export function packRowContext(row: RowContext): RowContext {
  if (!row.columns.some((column) => column.html !== "" && column.html === column.text)) return row
  return { ...row, columns: row.columns.map((column) => column.html === column.text ? { ...column, html: "" } : column) }
}

export function unpackRowContext(row: RowContext): RowContext {
  if (!row.columns.some((column) => column.html === "" && column.text !== "")) return row
  return { ...row, columns: row.columns.map((column) => column.html === "" ? { ...column, html: column.text } : column) }
}

const plain = (value: string) => value.replace(/<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+/g, " ").trim()
const escapeHtml = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")

/** La ligne `id` de l'index (par sa colonne ID), avec ce que le lecteur peut en lire ; `null` si elle n'existe pas. */
export function rowContextOf(source: IndexSource, id: string, options: BlockDataOptions): RowContext | null {
  for (const table of source.tables) {
    const idColumn = table.headers.findIndex(isIdHeader)
    if (idColumn < 0) continue
    const row = table.rows.find((candidate) => plain(candidate.values[idColumn] ?? "") === id)
    if (!row) continue
    const shown = shownColumns(source, table, options)
    const columns = shown.map((header) => {
      const at = table.headers.findIndex((candidate) => foldName(candidate) === foldName(header))
      const html = at < 0 ? "" : row.html[at] ?? ""
      const value = at < 0 ? "" : row.values[at] ?? ""
      return { header, text: plain(value || html), html: sanitizeRichText(html || escapeHtml(value)) }
    })
    const nameHeader = source.nameHeader ?? shown.find((header) => ["nom", "nom du pnj", "nom personnage", "nom de la campagne", "nom de la classe"].includes(foldName(header))) ?? shown.find((header) => columnSpecIn(source, table.tabName, header).rowLabel) ?? shown[0]
    const name = columns.find((column) => foldName(column.header) === foldName(nameHeader ?? ""))?.text ?? ""
    const hidden = table.headers.filter((header) => header.trim() && !shown.some((candidate) => foldName(candidate) === foldName(header)))
    return { index: source.key, indexTitle: source.title, tab: table.tabName, id, name: name || id, columns, hidden }
  }
  return null
}

/** Le modèle de page d'une ligne : celui de son onglet d'abord, sinon celui de tout l'index (le plus récent). */
export function templateForRow<T extends Pick<CustomPage, "rowOf" | "updatedAt" | "trashedAt">>(pages: T[], index: string, tab: string) {
  const candidates = pages.filter((page) => !page.trashedAt && page.rowOf?.index === index && (!page.rowOf.tab || foldName(page.rowOf.tab) === foldName(tab)))
  const exact = candidates.filter((page) => page.rowOf?.tab)
  const pool = exact.length ? exact : candidates
  return [...pool].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0] ?? null
}

const placeholder = /\{([^{}<>"]{1,80})\}/g

/** Remplace « {Colonne} » par la valeur de la ligne ; une colonne cachée au lecteur s'efface, un nom inconnu reste écrit. */
export function fillRowText(value: string, row: RowContext, mode: "text" | "html" = "text") {
  if (!value.includes("{")) return value
  return value.replace(placeholder, (match, raw: string) => {
    const name = plain(raw)
    if (foldName(name) === "id") return mode === "html" ? escapeHtml(row.id) : row.id
    const column = row.columns.find((candidate) => foldName(candidate.header) === foldName(name))
    if (column) return mode === "html" ? column.html : column.text
    if (row.hidden.some((header) => foldName(header) === foldName(name))) return ""
    return match
  })
}

/** La première adresse d'image d'une colonne de la ligne (« {Portrait} »). */
export function rowImage(source: string, row: RowContext) {
  const match = source.match(/^\{([^{}<>"']{1,80})\}$/)
  if (!match) return source
  const column = row.columns.find((candidate) => foldName(candidate.header) === foldName(match[1].trim()))
  return (column ? `${column.html} ${column.text}` : "").match(/(https:\/\/[^\s"'<>]+|\/api\/[^\s"'<>]+)/)?.[0]?.replace(/&amp;/g, "&") ?? ""
}

function fillBlock(block: ViewedBlock, row: RowContext): ViewedBlock {
  const text = (value: string) => fillRowText(value, row, "text")
  const html = (value: string) => fillRowText(value, row, "html")
  switch (block.type) {
    case "title": return { ...block, eyebrow: text(block.eyebrow), text: text(block.text) }
    case "text": return { ...block, html: html(block.html) }
    case "callout": return { ...block, title: text(block.title), html: html(block.html) }
    case "quote": return { ...block, text: text(block.text), cite: text(block.cite) }
    case "image": return { ...block, src: rowImage(block.src, row), caption: text(block.caption) }
    // Une adresse peut citer la ligne (« /creation-de-classe?classe={ID} ») : la valeur y est encodée.
    case "link": return { ...block, title: text(block.title), description: text(block.description), href: block.href.replace(/\{([^{}]{1,80})\}/g, (_, name: string) => encodeURIComponent(fillRowText(`{${name}}`, row))) }
    case "secret": return { ...block, title: text(block.title), html: html(block.html) }
    case "notes": return { ...block, title: text(block.title) }
    case "view": return { ...block, heading: text(block.heading) }
    case "stat": return { ...block, heading: text(block.heading) }
    case "rowfields": return { ...block, heading: text(block.heading) }
    case "backlinks": return { ...block, heading: text(block.heading) }
    case "search": return { ...block, heading: text(block.heading), placeholder: text(block.placeholder) }
    default: return block
  }
}

/** Les valeurs d'une ligne, toutes colonnes comprises (masquées aussi) : pour les conditions, jamais montrées. */
export function rowValuesOf(source: IndexSource, tab: string, id: string): ((column: string) => string) | null {
  const table = source.tables.find((candidate) => foldName(candidate.tabName) === foldName(tab))
  const idColumn = table ? table.headers.findIndex(isIdHeader) : -1
  const row = table && idColumn >= 0 ? table.rows.find((candidate) => plain(candidate.values[idColumn] ?? "") === id) : undefined
  if (!table || !row) return null
  return (column) => { const at = table.headers.findIndex((header) => foldName(header) === foldName(column)); return at >= 0 ? row.values[at] ?? "" : "" }
}

/**
 * Page de ligne : retire les blocs dont la condition d'affichage n'est pas remplie par la
 * ligne (sur le serveur : un bloc écarté n'est pas envoyé). Une section vidée disparaît à l'affichage.
 */
export function blocksForRow<T extends Pick<PageView, "sections">>(view: T, valueOf: (column: string) => string): T {
  if (!view.sections.some((section) => section.cols.some((column) => column.some((block) => block.showIf)))) return view
  return { ...view, sections: view.sections.map((section) => ({ ...section, cols: section.cols.map((column) => column.filter((block) => { const where = activeWhere(block.showIf); return !where || matchesView(where, valueOf) })) })) }
}

/** La page de la ligne : le modèle (déjà filtré pour son lecteur) rempli avec les valeurs de la ligne. */
export function fillRowPage(view: PageView, row: RowContext): PageView {
  return {
    ...view,
    title: fillRowText(view.title, row) || row.name,
    description: fillRowText(view.description, row),
    sections: view.sections.map((section) => ({ ...section, cols: section.cols.map((column) => column.map((block) => fillBlock(block, row))) })),
  }
}

/** Une ligne d'un autre index qui cite la ligne de la page. */
export type Backlink = { index: string; indexTitle: string; tab: string; id: string; name: string; column: string; href?: string }

/**
 * Les lignes qui citent la ligne `target` : par une référence « { » (lien /reference/…), ou
 * par une colonne liée à son index qui porte son nom. Les colonnes que le lecteur ne voit
 * pas ne comptent pas (un joueur ne découvre pas un lien par une note MJ).
 */
export function backlinksOf(sources: IndexSource[], target: { index: string; id: string; name: string }, options: BlockDataOptions & { hrefOf?: (index: string, tab: string, id: string) => string | undefined }, limit = 60): Backlink[] {
  const out: Backlink[] = []
  for (const source of sources) {
    for (const table of source.tables) {
      const idColumn = table.headers.findIndex(isIdHeader)
      const shown = shownColumns(source, table, options)
      const columns = shown.map((header) => ({ header, at: table.headers.findIndex((candidate) => foldName(candidate) === foldName(header)), spec: columnSpecIn(source, table.tabName, header) }))
      const linked = new Set(columns.filter((column) => column.spec.source?.index === target.index || column.spec.link?.index === target.index || column.spec.moreSources?.some((more) => more.index === target.index)).map((column) => column.header))
      const nameHeader = source.nameHeader ?? shown.find((header) => ["nom", "nom du pnj", "nom personnage", "nom de la campagne", "nom de la classe"].includes(foldName(header))) ?? shown[0]
      const nameAt = table.headers.findIndex((candidate) => foldName(candidate) === foldName(nameHeader ?? ""))
      for (const row of table.rows) {
        const rowId = idColumn >= 0 ? plain(row.values[idColumn] ?? "") : ""
        if (source.key === target.index && rowId === target.id) continue
        const hit = columns.find(({ header, at }) => {
          if (at < 0) return false
          const html = row.html[at] ?? ""
          if (html.includes("/reference/")) {
            for (const match of html.matchAll(/href\s*=\s*"([^"]+)"/g)) {
              const reference = parseReferenceHref(match[1])
              if (reference && reference.index === target.index && reference.id === target.id) return true
            }
          }
          return linked.has(header) && cellCitesRow(row.values[at] ?? "", columnSpecIn(source, table.tabName, header).listSeparator, target)
        })
        if (!hit) continue
        const name = nameAt >= 0 ? plain(row.values[nameAt] ?? "") : rowId
        const href = rowId ? options.hrefOf?.(source.key, table.tabName, rowId) : undefined
        out.push({ index: source.key, indexTitle: source.title, tab: table.tabName, id: rowId, name: name || rowId || "Sans nom", column: hit.header, ...(href ? { href } : {}) })
        if (out.length >= limit) return out
      }
    }
  }
  return out
}
