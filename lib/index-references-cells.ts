/**
 * Ce qu'une référence affiche d'une ligne d'index : la valeur d'une case citée (comme
 * dans le tableau) ou le détail montré au survol du nom. Sans dépendance au serveur.
 */
import { foldName, type IndexColumnSpec } from "@/lib/index-columns"
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

const textKinds = new Set(["rich", "name-form", "text", "linked"])

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
  const html = !mode && textKinds.has(spec.kind) && /<[a-z]/i.test(row.html[index] ?? "") ? row.html[index] : escapeHtml(shown)
  const style = spec.style && !spec.style.keepCellFormatting ? spec.style : undefined
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
  const nameStyle = nameSpec?.style && !nameSpec.style.keepCellFormatting ? nameSpec.style : undefined
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

