/**
 * Colonnes de combat des index d'objets (Compétence, Distance, Action, Valeur, Attributs) :
 * où les lire, quels en-têtes ajouter ou renommer, et comment remplacer « {Valeur} » dans
 * une description ou un effet affiché hors du tableau. Sans dépendance au serveur.
 */
import { legacyObjectValueHeaders, objectCombatColumns, objectPriceHeaders, objectPrimaryRarityHeaders, objectSecondaryRarityHeaders, type ObjectCombatFields } from "@/lib/inventory-schema"

function normalized(value: string) {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/gi, " ").trim().toLowerCase()
}

function columnOf(headers: string[], aliases: readonly string[]) {
  const expected = new Set(aliases.map(normalized))
  return headers.findIndex((header) => expected.has(normalized(header ?? "")))
}

/**
 * La colonne du prix : « Prix », « Coût » ou « Cout ». Un tableau qui n'en a aucun mais a
 * une « Valeur » s'en sert comme prix : c'était le cas des parchemins, consommables et
 * livres avant que leur en-tête ne devienne « Prix ».
 */
export function objectPriceColumn(headers: string[]) {
  const price = columnOf(headers, objectPriceHeaders)
  return price >= 0 ? price : columnOf(headers, ["Valeur"])
}

/** La colonne Valeur (ex-« Dégâts ») : jamais celle qui sert de prix. */
export function objectValueColumn(headers: string[]) {
  const valeur = columnOf(headers, ["Valeur"])
  if (valeur >= 0 && columnOf(headers, objectPriceHeaders) >= 0) return valeur
  return columnOf(headers, legacyObjectValueHeaders)
}

/** La colonne d'une donnée de combat dans un tableau d'objets, ou -1. */
export function objectCombatColumn(headers: string[], key: (typeof objectCombatColumns)[number]["key"]) {
  if (key === "value") return objectValueColumn(headers)
  const column = objectCombatColumns.find((candidate) => candidate.key === key)
  return column ? columnOf(headers, column.aliases) : -1
}

/** Les colonnes « Rareté » sans précision, dans l'ordre de la feuille. */
function plainRarityColumns(headers: string[]) {
  return headers.flatMap((header, index) => normalized(header ?? "") === "rarete" ? [index] : [])
}

/**
 * Les emplacements où un objet se trouve, lus par le nom des colonnes (jamais par leur
 * position) : « Emplacement principal » avec « Rareté principale », « Emplacement
 * secondaire » avec « Rareté secondaire ». Deux « Rareté » sans précision (avant leur
 * renommage) : la première va avec l'emplacement principal, la seconde avec l'autre.
 */
export function objectLocationColumns(headers: string[]) {
  const plain = plainRarityColumns(headers)
  const namedPrimary = columnOf(headers, objectPrimaryRarityHeaders)
  const namedSecondary = columnOf(headers, objectSecondaryRarityHeaders)
  const primary = namedPrimary >= 0 ? namedPrimary : plain.shift() ?? -1
  const secondary = namedSecondary >= 0 ? namedSecondary : plain.shift() ?? -1
  return [
    { rarity: primary, place: columnOf(headers, ["Emplacement principal"]) },
    { rarity: secondary, place: columnOf(headers, ["Emplacement secondaire"]) },
  ]
}

/**
 * Ce qu'il faut écrire dans la ligne 1 d'un tableau d'objets pour avoir toutes les
 * colonnes de combat. Seuls des en-têtes changent, jamais une case en dessous :
 * - deux « Rareté » sans précision deviennent « Rareté principale » et « Rareté secondaire » ;
 * - une « Valeur » qui sert de prix (aucun « Prix », « Coût », « Cout ») devient « Prix » ;
 * - l'ancienne colonne « Dégâts » devient « Valeur » ;
 * - les colonnes absentes sont ajoutées à droite, dans l'ordre de `objectCombatColumns`.
 */
export function planObjectCombatHeaders(headers: string[]) {
  const renames: Array<{ index: number; header: string }> = []
  // Deux « Rareté » sans précision : la principale puis la secondaire.
  const plain = plainRarityColumns(headers)
  if (plain.length >= 2 && columnOf(headers, objectPrimaryRarityHeaders) < 0 && columnOf(headers, objectSecondaryRarityHeaders) < 0) {
    renames.push({ index: plain[0], header: "Rareté principale" }, { index: plain[1], header: "Rareté secondaire" })
  }
  let valeur = columnOf(headers, ["Valeur"])
  const legacy = columnOf(headers, legacyObjectValueHeaders)
  if (columnOf(headers, objectPriceHeaders) < 0 && valeur >= 0) {
    renames.push({ index: valeur, header: "Prix" })
    valeur = -1
  }
  if (legacy >= 0 && valeur < 0) {
    renames.push({ index: legacy, header: "Valeur" })
    valeur = legacy
  }
  const append = objectCombatColumns.flatMap((column) => {
    if (column.key === "value") return valeur < 0 ? [column.header] : []
    return columnOf(headers, column.aliases) < 0 ? [column.header] : []
  })
  return { renames, append }
}

/** « 12 » → « 12 m » : une distance sans unité est en mètres. */
export function objectDistanceText(value: string) {
  const clean = value.trim()
  return /^\d+(?:[.,]\d+)?$/.test(clean) ? `${clean} m` : clean
}

/** Le texte de chaque donnée de combat, tel qu'il s'affiche (« {Distance} » → « 12 m »). */
function displayedField(item: ObjectCombatFields, key: (typeof objectCombatColumns)[number]["key"]) {
  const value = item[key]?.trim() ?? ""
  return key === "distance" ? objectDistanceText(value) : value
}

const placeholder = /\{\s*([^{}<>\n]{1,40}?)\s*\}/g

function placeholderValue(name: string, item: ObjectCombatFields) {
  const key = normalized(name)
  const column = objectCombatColumns.find((candidate) => normalized(candidate.header) === key || candidate.aliases.some((alias) => normalized(alias) === key) || (candidate.key === "value" && legacyObjectValueHeaders.some((alias) => normalized(alias) === key)))
  if (!column) return null
  const value = displayedField(item, column.key)
  return value || null
}

/**
 * Remplace « {Valeur} », « {Compétence} », « {Distance} », « {Action} » et « {Attributs} »
 * par les valeurs de l'objet. Une accolade inconnue, ou dont la case est vide, reste écrite
 * telle quelle : on voit tout de suite ce qui manque.
 */
export function fillObjectTemplate(text: string, item: ObjectCombatFields) {
  if (!text.includes("{")) return text
  return text.replace(placeholder, (match, name: string) => placeholderValue(name, item) ?? match)
}

const htmlEscapes: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }

/** Même chose dans un texte mis en forme : la valeur insérée est échappée. */
export function fillObjectTemplateHtml(html: string, item: ObjectCombatFields) {
  if (!html.includes("{")) return html
  return html.replace(placeholder, (match, name: string) => {
    const value = placeholderValue(name, item)
    return value === null ? match : value.replace(/[&<>"']/g, (character) => htmlEscapes[character])
  })
}
