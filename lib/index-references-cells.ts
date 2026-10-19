/**
 * Ce qu'une référence affiche d'une ligne d'index : la valeur d'une case citée (comme
 * dans le tableau) ou le détail montré au survol du nom. Sans dépendance au serveur.
 */
import { parseSections } from "@/lib/index-sections"
import { parseRarityPlaces } from "@/lib/rarity-places"
import { foldName, isIdHeader, rowColumnStyle, type IndexColumnSpec } from "@/lib/index-columns"
import { arrangeLayout, blockColumns, resolveLayoutColor, subtitleColumnsOf, type IndexLayout } from "@/lib/index-layouts"
import type { ResolvedLayout, ResolvedLayoutField } from "@/lib/index-references"
import { formatIndexNumber, parseIndexNumber } from "@/lib/index-numbers"

export type SourceRow = { id: string; name: string; values: string[]; html: string[] }
/**
 * Ce que montre le survol d'une ligne, quand ses colonnes ne portent pas les noms
 * habituels (Description, Image, Couleur…) : « Portrait » d'un PNJ, « Bannière » d'une
 * campagne. Chaque liste est essayée dans l'ordre, la première case remplie l'emporte.
 */
export type SourceHints = { type?: string[]; description?: string[]; image?: string[]; color?: string[] }

/** `columns` : les colonnes proposées par le menu (hors corbeille) ; `name` : la colonne du nom. */
export type SourceTable = { tab: string; headers: string[]; columns: string[]; name: number; specs: Map<string, IndexColumnSpec>; rows: SourceRow[]; hints?: SourceHints }

export const objectNameHeaders = ["Nom", "Nom de l'objet", "Objet", "Arme", "Équipement", "Equipement", "Ressource", "Livre", "Titre"]

export function columnAt(headers: string[], names: string[]) {
  const wanted = new Set(names.map(foldName))
  return headers.findIndex((header) => wanted.has(foldName(header)))
}

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
}

/** Une case affichée comme dans le tableau : un nombre dans son unité (« 12 m »), par valeur « a | b ». */
function displayedValue(value: string, spec: IndexColumnSpec) {
  if (spec.kind !== "number" || !spec.number) return value
  return value.split("|").map((part) => {
    const parsed = parseIndexNumber(part, spec.number)
    return parsed ? formatIndexNumber(parsed, spec.number) : part.trim()
  }).join(" | ")
}

const textKinds = new Set(["rich", "name-form", "text", "linked", "sections", "rarity-places"])

/** La case demandée, par son nom ; « Valeur 2 » sans colonne de ce nom : la 2e valeur de « Valeur ». */
export function citedCell(table: SourceTable, row: SourceRow, column: string) {
  let index = table.headers.findIndex((header) => foldName(header) === foldName(column))
  let mode = 0
  if (index < 0) {
    const numbered = column.trim().match(/^(.*\S)\s+(\d{1,2})$/)
    if (numbered) {
      index = table.headers.findIndex((header) => foldName(header) === foldName(numbered[1]))
      mode = Number(numbered[2])
    }
  }
  if (index < 0) return null
  const header = table.headers[index]
  const spec = table.specs.get(foldName(header)) ?? { kind: "rich" }
  const raw = row.values[index] ?? ""
  const value = mode ? (raw.split("|")[mode - 1] ?? "").trim() : raw.trim()
  const shown = displayedValue(value, spec)
  // Un texte mis en forme garde sa mise en forme ; le reste s'affiche comme dans le tableau.
  // Sections : chaque partie sous son titre ; Rareté et emplacements : une rareté (en gras) par ligne, avec ses lieux.
  const html = spec.kind === "sections" ? parseSections(row.html[index] || raw).map((section) => `${section.title ? `<h3>${escapeHtml(section.title)}</h3>` : ""}${section.html}`).join("")
    : spec.kind === "rarity-places" ? parseRarityPlaces(raw).map((entry) => `<strong>${escapeHtml(entry.rarity || "Sans rareté")}</strong>${entry.places.length ? ` : ${escapeHtml(entry.places.join(", "))}` : ""}`).join("<br>")
    : !mode && textKinds.has(spec.kind) && /<[a-z]/i.test(row.html[index] ?? "") ? row.html[index] : escapeHtml(shown)
  // Un style imposé dont la couleur vient d'une colonne Couleur prend celle de cette ligne.
  const style = spec.style && !spec.style.keepCellFormatting ? rowColumnStyle(spec.style, (name) => { const at = columnAt(table.headers, [name]); return at >= 0 ? row.values[at] ?? "" : "" }) : undefined
  const options = spec.kind === "choice" ? spec.options?.filter((option) => option.color).map((option) => ({ value: option.value, color: option.color })) : undefined
  return {
    column: header,
    value: shown,
    valueHtml: html,
    look: { kind: spec.kind, ...(style ? { style } : {}), ...(options?.length ? { options } : {}), ...(spec.multiple ? { multiple: true } : {}) },
  }
}

/**
 * Ce que le nom cité et son survol montrent. `object` : une ligne de l'Index des objets,
 * dont l'icône (colonne Icône) se dessine comme dans l'inventaire.
 */
export function rowDetails(table: SourceTable, row: SourceRow, options: { object?: boolean } = {}) {
  const at = (names: string[]) => columnAt(table.headers, names)
  const filled = (index: number) => index >= 0 && Boolean((row.values[index] ?? "").trim())
  // La première colonne remplie parmi celles qu'indique la source, sinon -1.
  const hinted = (names: string[] | undefined) => names ? names.map((name) => at([name])).find(filled) ?? -1 : undefined
  const hints = table.hints ?? {}
  const description = hints.description ? (() => { const index = hinted(hints.description)!; return index >= 0 ? index : undefined })() : [at(["Description", "Déscription"]), at(["Effet", "Effets"])].find(filled)
  const type = hinted(hints.type) ?? at(["Type", "Catégorie"])
  const color = hinted(hints.color) ?? table.headers.findIndex((header) => table.specs.get(foldName(header))?.kind === "color" || foldName(header) === "couleur")
  const icon = table.headers.findIndex((header) => table.specs.get(foldName(header))?.kind === "glyph")
  const image = hinted(hints.image) ?? at(["Image", "Portrait", "Illustration"])
  const nameHtml = table.name >= 0 && /<[a-z]/i.test(row.html[table.name] ?? "") ? row.html[table.name] : undefined
  const colorValue = color >= 0 ? (row.values[color] ?? "").trim() : ""
  // Le style imposé à la colonne du nom : le nom cité le garde.
  const nameSpec = table.name >= 0 ? table.specs.get(foldName(table.headers[table.name])) : undefined
  const nameStyle = nameSpec?.style && !nameSpec.style.keepCellFormatting ? rowColumnStyle(nameSpec.style, (name) => { const index = at([name]); return index >= 0 ? row.values[index] ?? "" : "" }) : undefined
  const objectIcon = options.object ? at(["Icône", "Icone", "Icon"]) : -1
  const subtype = at(["Sous-type", "Sous type"])
  return {
    ...(nameHtml ? { nameHtml } : {}),
    ...(nameStyle ? { nameStyle } : {}),
    ...(options.object ? { object: { icon: objectIcon >= 0 ? (row.values[objectIcon] ?? "").trim() : "", type: type >= 0 ? (row.values[type] ?? "").trim() : "", subtype: subtype >= 0 ? (row.values[subtype] ?? "").trim() : "" } } : {}),
    ...(type >= 0 && row.values[type]?.trim() ? { type: row.values[type].trim() } : {}),
    ...(description !== undefined ? { descriptionHtml: (row.html[description] || escapeHtml(row.values[description] ?? "")).trim() } : {}),
    ...(/^#[0-9a-f]{3,8}$/i.test(colorValue) ? { color: colorValue } : {}),
    ...(icon >= 0 && row.values[icon]?.trim() ? { icon: row.values[icon].trim() } : {}),
    ...(image >= 0 && row.values[image]?.trim() && !/^#/.test(row.values[image]) ? { image: row.values[image].trim() } : {}),
  }
}

/**
 * Les cases du survol, rangées : vides et colonnes privées (joueurs) laissées de côté. Le
 * serveur s'en sert pour les citations « { », l'aperçu de « Modifier › Survol » aussi.
 */
/** La colonne d'une couleur lue dans la ligne (« {Couleur} »), sinon rien. */
const colorColumnOf = (value: string | undefined) => value?.match(/^\{([^{}]+)\}$/)?.[1].trim() ?? ""

export function hoverOf(layout: IndexLayout, table: SourceTable, row: SourceRow, hidden: (column: string) => boolean): ResolvedLayout {
  const columns = table.headers.filter((header) => header.trim() && !hidden(header) && !isIdHeader(header))
  const cells = columns.flatMap((header): ResolvedLayoutField[] => {
    const cell = citedCell(table, row, header)
    return cell && cell.value.trim() ? [{ column: cell.column, value: cell.value, valueHtml: cell.valueHtml, look: cell.look }] : []
  })
  // Un bloc (paliers, tuiles…) emporte les cases qu'il lit, vides comprises (il sait quoi en faire).
  const arranged = arrangeLayout(layout, cells, (cell) => cell.column, (field) => {
    // Les couleurs lues dans une colonne (tuiles, trait) viennent avec : la carte n'a pas la ligne.
    const colors = field.block.kind === "tiles" ? Object.values(field.block.colors ?? {}) : field.block.kind === "divider" ? [field.block.color] : []
    const needed = [...blockColumns(field.block), ...colors.map(colorColumnOf).filter(Boolean)].filter((column) => !hidden(column))
    const read = needed.flatMap((column) => { const cell = citedCell(table, row, column); return cell ? [[cell.column, { value: cell.value, valueHtml: cell.valueHtml }] as const] : [] })
    return { column: field.column, value: "", valueHtml: "", block: field.block, cells: Object.fromEntries(read) }
  })
  const fieldOf = (field: { item: ResolvedLayoutField; span?: number; hideLabel?: boolean; large?: boolean; size?: "sm"; align?: "center" | "right"; imageWidth?: number; label?: string; icon?: string; color?: string }): ResolvedLayoutField => ({ ...field.item, ...(field.span ? { span: field.span } : {}), ...(field.hideLabel ? { hideLabel: true } : {}), ...(field.large ? { large: true } : {}), ...(field.size ? { size: field.size } : {}), ...(field.align ? { align: field.align } : {}), ...(field.imageWidth ? { imageWidth: field.imageWidth } : {}), ...(field.label ? { label: field.label } : {}), ...(field.icon ? { icon: field.icon } : {}), ...(field.color ? { color: field.color } : {}) })
  const sections = arranged.sections.map((section) => ({ id: section.id, ...(section.title ? { title: section.title } : {}), ...(section.framed ? { framed: true } : {}), ...(section.look ? { look: section.look } : {}), ...(section.color ? { color: section.color } : {}), ...(section.icon ? { icon: section.icon } : {}), ...(section.collapsible ? { collapsible: true } : {}), ...(section.collapsed ? { collapsed: true } : {}), ...(section.columns ? { columns: section.columns } : {}), rows: section.rows.map((line) => ({ id: line.id, fields: line.fields.map(fieldOf) })) }))
  // « Montrer le reste » : les cases non placées, à la suite, deux par deux.
  if (arranged.rest.length) {
    const rows: Array<{ id: string; fields: ResolvedLayoutField[] }> = []
    for (let start = 0; start < arranged.rest.length; start += 2) rows.push({ id: `reste-${start}`, fields: arranged.rest.slice(start, start + 2).map((item) => ({ ...item, span: 6 as const })) })
    sections.push({ id: "reste", rows })
  }
  const pick = (column: string | undefined) => {
    if (!column || hidden(column)) return ""
    const at = columnAt(table.headers, [column])
    return at >= 0 ? (row.values[at] ?? "").trim() : ""
  }
  const image = pick(layout.image)
  // Plusieurs colonnes possibles : leurs valeurs remplies, séparées par « • ».
  const subtitle = subtitleColumnsOf(layout).map(pick).map((value) => value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()).filter(Boolean).join(" • ")
  const icon = pick(layout.icon)
  // Le médaillon : la colonne choisie, sinon l'image ou l'icône de la ligne (résolues par la référence).
  const medallion = layout.medallion ? { value: layout.medallion.column ? pick(layout.medallion.column) : "", ...(layout.medallion.size ? { size: layout.medallion.size } : {}), ...(layout.medallion.round ? { round: true } : {}), ...(layout.medallion.tint ? { tint: true } : {}), ...(layout.medallion.bare ? { bare: true } : {}) } : undefined
  const bannerValue = layout.banner?.column ? pick(layout.banner.column) : ""
  const banner = layout.banner && bannerValue ? { value: bannerValue, ...(layout.banner.height ? { height: layout.banner.height } : {}) } : undefined
  // La couleur d'accent réglée (« {Couleur} », « #… ») : résolue ici, la carte n'a pas la ligne.
  const accent = layout.accent ? resolveLayoutColor(layout.accent, "", (column) => pick(column)) : ""
  // Les autres couleurs « {Colonne} » (libellés, sections, fond) : leurs cases, pour que la carte les résolve.
  const colorColumns = [layout.look?.background, layout.look?.labelColor, ...sections.flatMap((section) => [section.color, ...section.rows.flatMap((line) => line.fields.map((field) => field.color))]), ...arranged.aside.map((field) => field.color)].map(colorColumnOf).filter(Boolean)
  const colorCells = Object.fromEntries(colorColumns.flatMap((column) => { const value = pick(column); return value ? [[foldName(column), value] as const] : [] }))
  return {
    ...(Object.keys(colorCells).length ? { colorCells } : {}),
    ...(image ? { image } : {}),
    ...(subtitle ? { subtitle } : {}),
    ...(icon ? { icon } : {}),
    ...(accent ? { accent } : {}),
    ...(layout.tint ? { tint: true } : {}),
    ...(medallion ? { medallion } : {}),
    ...(banner ? { banner } : {}),
    ...(layout.tabs ? { tabs: true } : {}),
    ...(layout.look ? { look: layout.look } : {}),
    ...(layout.nameInAccent ? { nameInAccent: true } : {}),
    ...(layout.width ? { width: layout.width } : {}),
    ...(layout.asideWidth ? { asideWidth: layout.asideWidth } : {}),
    ...(layout.asideSide === "right" ? { asideSide: "right" as const } : {}),
    aside: arranged.aside.map(fieldOf),
    sections,
  }
}
