/**
 * Les caractéristiques et compétences de la fiche de personnage. Elles viennent de
 * l'Index des caractéristiques et compétences ; ce fichier sait les lire, les
 * retrouver dans les colonnes de la feuille de personnage et, faute d'index, les
 * reprendre telles qu'elles étaient écrites dans le code.
 *
 * Chaque caractéristique ou compétence a une « clé de fiche » : le nom de ses
 * colonnes dans la feuille « Personnages ». Celles qui existaient avant l'index
 * gardent leurs colonnes d'origine (« Parade — Total de stats ») ; une nouvelle prend
 * son identifiant d'index (« Pêche à la mouche — Total de stats [COM-3F9A1C2B] »).
 * Renommer une ligne de l'index ne coupe donc jamais le lien avec les valeurs déjà
 * saisies, et une colonne de la feuille n'est jamais déplacée.
 *
 * Aucune dépendance serveur : la fiche, l'éditeur des objets et les statistiques
 * s'en servent aussi.
 */
import {
  characterSkillGroups,
  characterSkillMetrics,
  innateCharacterSkills,
} from "@/lib/character-sheet-schema"

export type CharacteristicKind = "principale" | "secondaire"

export type CatalogCharacteristic = {
  /** Clé de fiche : le nom de ses colonnes dans la feuille de personnage. */
  key: string
  name: string
  kind: CharacteristicKind
  /** Écrite dans la fiche à sa création (et dans les fiches existantes quand la caractéristique est ajoutée). */
  defaultValue: string
  /** Couleur de sa carte (principale) ou de sa case (secondaire) sur la fiche ; vide : celle d'origine. */
  color?: string
}

export type CatalogSkill = {
  key: string
  name: string
  /** Clé de la caractéristique dont la compétence dépend ; vide si aucune n'est reconnue. */
  characteristicKey: string
  defaultValue: string
}

export type CharacterCatalog = {
  characteristics: CatalogCharacteristic[]
  skills: CatalogSkill[]
  /** « index » : lu dans l'Index des caractéristiques et compétences ; « code » : la liste d'origine. */
  source: "index" | "code"
}

export const SKILL_INDEX_TITLE = "Caractéristiques et compétences"
export const CHARACTERISTICS_TAB = "Caractéristiques"
export const SKILLS_TAB = "Compétences"
export const CATALOG_TYPE_HEADER = "Type"
export const CATALOG_CHARACTERISTIC_HEADER = "Caractéristique"
export const CATALOG_DEFAULT_HEADER = "Valeur par défaut"
/** Colonne masquée : relie une ligne d'origine à ses colonnes de la feuille de personnage. */
export const CATALOG_KEY_HEADER = "Clé de fiche"
export const CATALOG_COLOR_HEADER = "Couleur"
export const PRINCIPAL_LABEL = "Principale"
export const SECONDARY_LABEL = "Secondaire"

/**
 * Les caractéristiques secondaires d'origine, dans l'ordre de la fiche. Leur clé est
 * l'en-tête de leur colonne ; la fiche leur garde leur affichage propre (points de vie,
 * listes, cartes calculées), une secondaire ajoutée s'affiche en compteur.
 */
export const builtinSecondaryCharacteristics: Array<{ key: string; name: string; defaultValue: string; color: string }> = [
  { key: "Vie totale", name: "Points de vie", defaultValue: "", color: "#6e9ee8" },
  { key: "Classe sociale", name: "Classe sociale", defaultValue: "", color: "#75a9c8" },
  { key: "Notoriété", name: "Notoriété", defaultValue: "0", color: "#70a8c5" },
  { key: "Alignement", name: "Alignement", defaultValue: "", color: "#c37998" },
  { key: "Moralité", name: "Moralité", defaultValue: "0", color: "#bd7b99" },
  { key: "Folie", name: "Folie", defaultValue: "0", color: "#8f79b5" },
  { key: "Destin", name: "Destin", defaultValue: "0", color: "#e7ae69" },
  { key: "Bonus de dégâts physiques", name: "Bonus de dégâts physiques", defaultValue: "0", color: "#c85f78" },
  { key: "Bonus de dégâts magiques", name: "Bonus de dégâts magiques", defaultValue: "0", color: "#a96991" },
  { key: "Armure physique", name: "Armure physique", defaultValue: "0", color: "#74a968" },
  { key: "Armure magique", name: "Armure magique", defaultValue: "0", color: "#6599a0" },
  { key: "Rapidité", name: "Rapidité", defaultValue: "0", color: "#e8aa62" },
  { key: "Échec critique", name: "Échec critique", defaultValue: "96", color: "#c86f6f" },
  { key: "Réussite critique", name: "Réussite critique", defaultValue: "5", color: "#d9b85c" },
]

/** Les couleurs d'origine des cartes de caractéristiques principales. */
export const builtinPrincipalColors: Record<string, string> = {
  "Capacité de combat": "#b9504e", "Capacité de tir": "#b9504e", "Capacité magique": "#b9504e",
  "Constitution": "#648f4e", "Force mentale": "#648f4e",
  "Force": "#397f88", "Dextérité": "#397f88", "Intelligence": "#397f88", "Sagesse": "#397f88", "Charisme": "#397f88",
}

/** La couleur d'origine d'une caractéristique, d'après sa clé de fiche. */
export function builtinCharacteristicColor(key: string) {
  return builtinPrincipalColors[key] ?? builtinSecondaryCharacteristics.find((item) => item.key === key)?.color ?? ""
}

/** La liste telle qu'elle était écrite dans le code : graines de l'index et repli sans lui. */
export const builtinCharacterCatalog: CharacterCatalog = {
  source: "code",
  characteristics: [
    ...characterSkillGroups.map((group) => ({ key: group.characteristic, name: group.characteristic, kind: "principale" as const, defaultValue: "0", color: builtinPrincipalColors[group.characteristic] })),
    ...builtinSecondaryCharacteristics.map((item) => ({ ...item, kind: "secondaire" as const })),
  ],
  skills: characterSkillGroups.flatMap((group) => group.skills.map((skill) => ({
    key: skill,
    name: skill,
    characteristicKey: group.characteristic,
    defaultValue: innateCharacterSkills.has(skill) ? "0" : "-20",
  }))),
}

/** Les lignes de départ de l'index, onglet par onglet, quand il vient d'être créé. */
export function catalogSeedRows(): Record<string, Array<Record<string, string>>> {
  return {
    [CHARACTERISTICS_TAB]: builtinCharacterCatalog.characteristics.map((item) => ({
      Nom: item.name,
      [CATALOG_TYPE_HEADER]: item.kind === "principale" ? PRINCIPAL_LABEL : SECONDARY_LABEL,
      [CATALOG_DEFAULT_HEADER]: item.defaultValue,
      [CATALOG_KEY_HEADER]: item.key,
      [CATALOG_COLOR_HEADER]: item.color ?? "",
    })),
    [SKILLS_TAB]: builtinCharacterCatalog.skills.map((skill) => ({
      Nom: skill.name,
      [CATALOG_CHARACTERISTIC_HEADER]: skill.characteristicKey,
      [CATALOG_DEFAULT_HEADER]: skill.defaultValue,
      [CATALOG_KEY_HEADER]: skill.key,
    })),
  }
}

export function foldCatalogName(value: string) {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[’']/g, "'").replace(/\s+/g, " ").trim().toLocaleLowerCase("fr")
}

type CatalogTable = { headers: string[]; rows: string[][] }

function cellOf(table: CatalogTable, row: string[], header: string) {
  const column = table.headers.findIndex((candidate) => foldCatalogName(candidate) === foldCatalogName(header))
  return column < 0 ? "" : String(row[column] ?? "").trim()
}

/**
 * Le catalogue d'après les deux onglets de l'index. Une ligne sans nom, ou sans clé ni
 * identifiant (ajoutée dans Sheets, pas encore numérotée), est ignorée ; une clé déjà
 * prise n'est gardée qu'une fois.
 */
export function catalogFromTables(characteristics: CatalogTable | null, skills: CatalogTable | null): CharacterCatalog {
  const taken = new Set<string>()
  const keyOf = (table: CatalogTable, row: string[]) => {
    const key = cellOf(table, row, CATALOG_KEY_HEADER) || cellOf(table, row, "ID")
    if (!key || taken.has(foldCatalogName(key))) return ""
    taken.add(foldCatalogName(key))
    return key
  }
  const characteristicList: CatalogCharacteristic[] = []
  for (const row of characteristics?.rows ?? []) {
    const name = cellOf(characteristics!, row, "Nom")
    if (!name) continue
    const key = keyOf(characteristics!, row)
    if (!key) continue
    const kind = foldCatalogName(cellOf(characteristics!, row, CATALOG_TYPE_HEADER)).startsWith("second") ? "secondaire" : "principale"
    const color = cellOf(characteristics!, row, CATALOG_COLOR_HEADER)
    characteristicList.push({ key, name, kind, defaultValue: cellOf(characteristics!, row, CATALOG_DEFAULT_HEADER), ...(/^#[0-9a-f]{3,8}$/i.test(color) ? { color } : {}) })
  }
  const principalByName = new Map<string, string>()
  for (const item of characteristicList) {
    if (item.kind !== "principale") continue
    principalByName.set(foldCatalogName(item.name), item.key)
    principalByName.set(foldCatalogName(item.key), item.key)
  }
  const skillList: CatalogSkill[] = []
  for (const row of skills?.rows ?? []) {
    const name = cellOf(skills!, row, "Nom")
    if (!name) continue
    const key = keyOf(skills!, row)
    if (!key) continue
    const characteristicName = cellOf(skills!, row, CATALOG_CHARACTERISTIC_HEADER).split(/[,;\n]/)[0]?.trim() ?? ""
    skillList.push({ key, name, characteristicKey: principalByName.get(foldCatalogName(characteristicName)) ?? "", defaultValue: cellOf(skills!, row, CATALOG_DEFAULT_HEADER) })
  }
  return { source: "index", characteristics: characteristicList, skills: skillList }
}

// ---------------------------------------------------------------------------
// Colonnes de la feuille de personnage
// ---------------------------------------------------------------------------

export const CRITICAL_SUCCESS_METRIC = "Réussite critique"
export const CRITICAL_FAILURE_METRIC = "Échec critique"
const knownMetrics = [...characterSkillMetrics, CRITICAL_SUCCESS_METRIC, CRITICAL_FAILURE_METRIC]
const SEPARATOR = " — "

/** Une colonne de la fiche : la clé de ce qu'elle porte, et la mesure (« » pour la valeur elle-même). */
export function slotName(key: string, metric = "") {
  return metric ? `${key}${SEPARATOR}${metric}` : key
}

const ID_SUFFIX = /\s\[([^\]\s]+)\]$/

/** L'emplacement qu'une colonne de la feuille représente. « Folie » → « Folie » ; « Pêche — Total de stats [COM-1] » → « COM-1 — Total de stats ». */
export function slotOfHeader(header: string) {
  const match = ID_SUFFIX.exec(header)
  if (!match) return header
  const label = header.slice(0, match.index)
  const metric = knownMetrics.find((candidate) => label.endsWith(`${SEPARATOR}${candidate}`)) ?? ""
  return slotName(match[1], metric)
}

/** Une clé d'origine (« Parade ») garde ses colonnes ; une clé d'index les nomme d'après la ligne. */
export function isIndexKey(key: string) {
  return /^[A-Z]{2,}-[0-9A-F]{4,}$/.test(key)
}

/** L'en-tête de colonne à écrire dans la feuille pour cette clé et cette mesure. */
export function headerFor(key: string, name: string, metric = "") {
  return isIndexKey(key) ? `${slotName(name, metric)} [${key}]` : slotName(key, metric)
}

/** Les mesures qu'occupe chaque genre d'entrée dans la feuille. */
export const principalMetrics = ["", CRITICAL_SUCCESS_METRIC, CRITICAL_FAILURE_METRIC]
export const secondaryMetrics = [""]
export const skillMetrics: string[] = [...characterSkillMetrics]

/** Les colonnes d'une feuille de personnage, retrouvées par ce qu'elles portent. */
export type CharacterLayout = {
  headers: string[]
  index: (key: string, metric?: string) => number
  /**
   * La case A1 d'une valeur de la fiche dans la feuille (pour les formules), quand les
   * colonnes ne sont pas rangées dans l'ordre de la fiche. Absente : valeurs dès la colonne C.
   */
  cell?: (valueIndex: number, rowNumber: number) => string
}

export function characterLayout(headers: string[], cell?: CharacterLayout["cell"]): CharacterLayout {
  const slots = new Map<string, number>()
  headers.forEach((header, position) => {
    const slot = slotOfHeader(String(header ?? "").trim())
    if (slot && !slots.has(slot)) slots.set(slot, position)
  })
  return { headers, index: (key, metric = "") => slots.get(slotName(key, metric)) ?? -1, ...(cell ? { cell } : {}) }
}

/** Une colonne ajoutée par l'Index des caractéristiques et compétences (« Pêche — Total de stats [COM-1] »). */
export function isCatalogColumnHeader(header: string) {
  return ID_SUFFIX.test(String(header ?? "").trim())
}

/** Chaque colonne que le catalogue demande à la feuille, avec son en-tête attendu. */
export function catalogColumns(catalog: CharacterCatalog) {
  const columns: Array<{ key: string; metric: string; header: string }> = []
  for (const item of catalog.characteristics) {
    for (const metric of item.kind === "principale" ? principalMetrics : secondaryMetrics) columns.push({ key: item.key, metric, header: headerFor(item.key, item.name, metric) })
  }
  for (const skill of catalog.skills) for (const metric of skillMetrics) columns.push({ key: skill.key, metric, header: headerFor(skill.key, skill.name, metric) })
  return columns
}

/**
 * Ce qu'il faut changer dans la ligne d'en-têtes pour accueillir le catalogue : des
 * colonnes à ajouter à la suite (jamais ailleurs), et des en-têtes d'index à mettre au
 * nom actuel de leur ligne. Les colonnes d'origine ne sont jamais renommées.
 */
export function planCatalogColumns(headers: string[], catalog: CharacterCatalog) {
  const layout = characterLayout(headers)
  const append: Array<{ key: string; metric: string; header: string }> = []
  const rename: Array<{ index: number; header: string }> = []
  for (const column of catalogColumns(catalog)) {
    const position = layout.index(column.key, column.metric)
    if (position < 0) append.push(column)
    else if (isIndexKey(column.key) && headers[position] !== column.header) rename.push({ index: position, header: column.header })
  }
  return { append, rename }
}

/** Une caractéristique principale et ses compétences, dans l'ordre de l'index. */
export type CatalogGroup = { characteristic: CatalogCharacteristic | null; skills: CatalogSkill[] }

export function catalogGroups(catalog: CharacterCatalog): CatalogGroup[] {
  const groups: CatalogGroup[] = catalog.characteristics.filter((item) => item.kind === "principale").map((characteristic) => ({
    characteristic,
    skills: catalog.skills.filter((skill) => skill.characteristicKey === characteristic.key),
  }))
  const orphans = catalog.skills.filter((skill) => !groups.some((group) => group.characteristic?.key === skill.characteristicKey))
  if (orphans.length) groups.push({ characteristic: null, skills: orphans })
  return groups
}

/** Les noms reconnus comme compétences ou caractéristiques de la fiche (statistiques des sorts). */
export function catalogNames(catalog: CharacterCatalog) {
  return [...catalog.characteristics.filter((item) => item.kind === "principale").map((item) => item.name), ...catalog.skills.map((skill) => skill.name)]
}
