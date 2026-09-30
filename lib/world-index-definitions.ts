/**
 * Les index du monde rangés dans Ressources : créatures, lieux, religions, peuples, langues.
 * Ce fichier ne dépend de rien côté serveur : l'interface s'en sert aussi pour savoir
 * quelles colonnes sont des listes de noms reliées à un autre index.
 */
import { foldName, isIdHeader, matchChoice, type ChoiceOption, type IndexColumnSpec } from "@/lib/index-columns"
import type { ColumnPolicy } from "@/lib/index-schema-shared"

export { foldName }

export type BuiltinWorldIndexKey = "creatures" | "places" | "religions" | "peoples" | "languages" | "states" | "runes" | "attributes" | "materials"

/** Un index du monde : prévu par Eraser, ou créé depuis « Nouvel index » (« perso-… »). */
export type WorldIndexKey = BuiltinWorldIndexKey | `perso-${string}`

export type WorldIndexTabDefinition = {
  name: string
  /** « une créature », « une divinité »… pour « Ajouter une créature ». */
  itemLabel: string
  /** Toutes les colonnes de la feuille, dans l'ordre où elles sont créées. */
  headers: string[]
  widths: number[]
  /** Préfixe des identifiants de l'onglet : « CRE » donne « CRE-3F9A1C2B ». */
  idPrefix: string
  /**
   * Colonnes affichées dans le tableau de l'application, quand elles ne sont pas
   * toutes utiles : les autres restent dans Sheets et se remplissent par la fiche.
   */
  gridHeaders?: string[]
}

export type WorldIndexDefinition = {
  key: WorldIndexKey
  /** Nom du classeur dans Google Drive. */
  sheetName: string
  title: string
  path: string
  /** « un lieu » : ce qu'on ajoute depuis la vue « Tout », quel que soit l'onglet. */
  itemLabel?: string
  tabs: WorldIndexTabDefinition[]
  /** Index créé depuis « Nouvel index ». */
  custom?: boolean
  description?: string
}

/** Colonnes de l'Index des créatures visibles dans le tableau. */
export const creatureGridHeaders = ["Nom", "Type", "Sous-type", "Rang", "Dressable", "Emplacement principal", "Rareté", "Emplacement secondaire", "Rareté secondaire", "Comportement", "Extension"]

/**
 * La colonne d'identifiant de chaque index. Elle est ajoutée à droite des colonnes
 * existantes de la feuille, sans rien déplacer, et remplie par Eraser.
 */
export const ID_HEADER = "ID"

/** Caractéristiques d'une créature, dans l'ordre de la fiche. */
export const creatureCharacteristics = ["Force", "Dextérité", "Intelligence", "Sagesse", "Charisme", "Vitesse", "Vitalité"]

/** La seule note de la fiche. */
export const creatureNoteHeader = "Description"

/**
 * Colonnes remplies par la fiche d'une créature. Elles vivent dans Sheets, à la suite
 * des colonnes de l'index, mais ne s'affichent pas dans le tableau de l'application.
 * Les anciennes colonnes (Environnement, Climat, Rencontre, Perception…) restent
 * listées : sorties de la fiche, elles gardent leur contenu dans Sheets et restent
 * hors du tableau.
 */
export const creatureSheetOnlyHeaders = [
  "Portrait", "Environnement", "Climat", "Sous-type secondaire", "Organisation", "Rencontre",
  "Langue", "Taille", "Poids", "Force", "Dextérité", "Intelligence", "Perception", "Charisme", "Vitesse", "Vitalité",
  "Sorts actifs", "Sorts passifs", "Sagesse", creatureNoteHeader,
]

/** Un choix d'une liste fermée (conservé sous ce nom pour la fiche des créatures). */
export type CreatureChoice = ChoiceOption

const choices = (values: string[]): ChoiceOption[] => values.map((value) => ({ value }))

export const creatureLocations: ChoiceOption[] = [
  ...choices(["Marais", "Désert", "Savane", "Jungle", "Forêt"]),
  // Orthographe corrigée : les cellules « Forêt noir » sont reconnues et corrigées.
  { value: "Forêt noire", aliases: ["Forêt noir"] },
  ...choices(["Donjon", "Ville", "Caverne", "Montagne", "Aquatique", "Plaine", "Maison"]),
]
export const creatureRarities = choices(["Très commun", "Commun", "Rare", "Très rare", "Ultime", "Légendaire"])

/** Les listes fermées de la fiche, par en-tête de colonne. */
export const creatureChoices: Record<string, ChoiceOption[]> = {
  "Rang": choices(["1", "2", "3", "4", "5"]),
  "Type": choices(["Animal", "Artificiel", "Extérieur", "Humanoïdes monstrueux", "Mort-vivant", "Spectrale", "Végétale", "Vermine"]),
  "Sous-type": choices(["Destrier", "Amphibien", "Aquatique", "Arachnide", "Bois", "Carnivore", "Cervidé", "Crustacé", "Démoniaque", "Divin", "Familier", "Félin", "Fermier", "Feu", "Fixe", "Golem", "Insecte", "Nim'Or", "Nuée", "Ombre", "Parasite", "Reptile", "Rongeur", "Sable", "Toxique", "Vase", "Volatile"]),
  "Emplacement principal": creatureLocations,
  "Rareté": creatureRarities,
  "Emplacement secondaire": creatureLocations,
  "Rareté secondaire": creatureRarities,
  "Organisation": choices(["Solitaire 1", "Groupe 2", "Meute 3", "Nuée 4"]),
  "Comportement": choices(["Agressif", "Défensif", "Pacifiste"]),
  // Les familles qui parlent chaque langue s'affichent au survol.
  "Langue": [
    { value: "Anoumagus", hint: "Destrier, Volatile, Carnivore, Cervidé" },
    { value: "Félinos", hint: "Félin, Rongeur" },
    { value: "Reptaïl", hint: "Reptile, Amphibien" },
    { value: "Shaâil", hint: "Ombre" },
    { value: "Arak", hint: "Arachnide" },
    { value: "Kléovias", hint: "Crustacé, Insecte, Parasite" },
    { value: "Nashilien", hint: "Aquatique" },
    { value: "Hépoien", hint: "Démoniaque" },
  ],
}

/** Le choix de la liste qui correspond à une valeur de la feuille, s'il y en a un. */
export const matchCreatureChoice = matchChoice

/** Les onglets de l'Index des lieux, du plus vaste au plus précis. */
export const placeTabs = [
  ["Zone géographique", "une zone géographique"],
  ["Pays", "un pays"],
  ["Régions", "une région"],
  ["Villes", "une ville"],
  ["Points d'intérêt", "un point d'intérêt"],
  // Ajouté après les autres : le premier onglet reste celui où un lien crée un lieu manquant.
  ["Environnement", "un environnement"],
] as const

export const worldIndexDefinitions: Record<BuiltinWorldIndexKey, WorldIndexDefinition> = {
  creatures: {
    key: "creatures",
    sheetName: "Index des créatures",
    title: "Créatures",
    path: "/ressources/index-des-creatures",
    tabs: [{
      name: "Créatures",
      itemLabel: "une créature",
      headers: [...creatureGridHeaders, ...creatureSheetOnlyHeaders, ID_HEADER],
      widths: [240, 170, 160, 90, 100, 190, 140, 190, 150, 140, 120, ...creatureSheetOnlyHeaders.map((header) => /portrait|sorts|description|organisation|rencontre/i.test(header) ? 260 : 130), 130],
      gridHeaders: [...creatureGridHeaders, ID_HEADER],
      idPrefix: "CRE",
    }],
  },
  places: {
    key: "places",
    sheetName: "Index des lieux",
    title: "Lieux",
    path: "/ressources/index-des-lieux",
    itemLabel: "un lieu",
    tabs: placeTabs.map(([name, itemLabel]) => ({
      name,
      itemLabel,
      headers: ["Nom", "Type", "Sous-type", "Peuple", "Description", "Note", "Langues", ID_HEADER],
      widths: [220, 150, 150, 220, 420, 320, 220, 130],
      idPrefix: "LIE",
    })),
  },
  religions: {
    key: "religions",
    sheetName: "Index des religions",
    title: "Religions",
    path: "/ressources/index-des-religions",
    tabs: [
      { name: "Religions", itemLabel: "une religion", headers: ["Nom", "Divinités", "Description", "Note", ID_HEADER], widths: [220, 260, 420, 320, 130], idPrefix: "REL" },
      { name: "Divinités", itemLabel: "une divinité", headers: ["Nom", "Religion", "Histoire", "Description", "Autre", ID_HEADER], widths: [220, 220, 420, 420, 320, 130], idPrefix: "DIV" },
    ],
  },
  peoples: {
    key: "peoples",
    sheetName: "Index des peuples",
    title: "Peuples",
    path: "/ressources/index-des-peuples",
    tabs: [{
      name: "Peuples",
      itemLabel: "un peuple",
      headers: ["Nom", "Ancêtres", "Descendant", "Lieux", "Description", "Note", "Langues", ID_HEADER],
      widths: [220, 220, 220, 220, 420, 320, 220, 130],
      idPrefix: "PEU",
    }],
  },
  languages: {
    key: "languages",
    sheetName: "Index des langues",
    title: "Langues",
    path: "/ressources/index-des-langues",
    tabs: [{
      name: "Langues",
      itemLabel: "une langue",
      headers: ["Nom", "Lieu", "Peuple", "Langue-mère", "Langue-fille", ID_HEADER],
      widths: [220, 240, 240, 220, 220, 130],
      idPrefix: "LAN",
    }],
  },
  // Quatre index préparés, à remplir : chacun a son propre classeur, créé la première
  // fois qu'on ouvre sa page (et relié s'il existe déjà sous ce nom dans Drive).
  states: {
    key: "states",
    sheetName: "Index des états",
    title: "États",
    path: "/ressources/index-des-etats",
    tabs: [{
      name: "États",
      itemLabel: "un état",
      headers: ["Nom", "Type", "Effet", "Durée", "Cumul", "Fin de l'état", "Description", "Note", ID_HEADER],
      widths: [220, 140, 380, 140, 110, 260, 380, 280, 130],
      idPrefix: "ETA",
    }],
  },
  runes: {
    key: "runes",
    sheetName: "Index des runes",
    title: "Runes",
    path: "/ressources/index-des-runes",
    tabs: [{
      name: "Runes",
      itemLabel: "une rune",
      headers: ["Nom", "Type", "Élément", "Effet", "Se pose sur", "Rareté", "Description", "Note", ID_HEADER],
      widths: [220, 140, 140, 380, 200, 130, 380, 280, 130],
      idPrefix: "RUN",
    }],
  },
  attributes: {
    key: "attributes",
    sheetName: "Index des attributs",
    title: "Attributs",
    path: "/ressources/index-des-attributs",
    tabs: [{
      name: "Attributs",
      itemLabel: "un attribut",
      headers: ["Nom", "Type", "Effet", "Description", "Note", ID_HEADER],
      widths: [220, 160, 420, 380, 280, 130],
      idPrefix: "ATT",
    }],
  },
  materials: {
    key: "materials",
    sheetName: "Index des matériaux",
    title: "Matériaux",
    path: "/ressources/index-des-materiaux",
    tabs: [{
      name: "Matériaux",
      itemLabel: "un matériau",
      headers: ["Nom", "Type", "Rareté", "Emplacement principal", "Emplacement secondaire", "Propriétés", "Description", "Note", ID_HEADER],
      widths: [220, 150, 130, 200, 200, 320, 380, 280, 130],
      idPrefix: "MAT",
    }],
  },
}

/**
 * Un côté d'un lien. `tab: "*"` désigne n'importe quel onglet de l'index : un lieu
 * cité peut être une ville comme un pays. Une entité absente est alors créée dans
 * le premier onglet, d'où elle peut être déplacée.
 */
export type WorldIndexLinkEnd = { index: WorldIndexKey; tab: string; column: string }

/**
 * Colonnes qui se répondent. Écrire un nom d'un côté l'inscrit de l'autre, et crée
 * la ligne manquante au besoin : « x » en Descendant de « y » ajoute « y » aux
 * Ancêtres de « x ».
 */
export const worldIndexLinks: Array<[WorldIndexLinkEnd, WorldIndexLinkEnd]> = [
  [{ index: "religions", tab: "Religions", column: "Divinités" }, { index: "religions", tab: "Divinités", column: "Religion" }],
  [{ index: "peoples", tab: "Peuples", column: "Ancêtres" }, { index: "peoples", tab: "Peuples", column: "Descendant" }],
  [{ index: "peoples", tab: "Peuples", column: "Lieux" }, { index: "places", tab: "*", column: "Peuple" }],
  [{ index: "languages", tab: "Langues", column: "Langue-mère" }, { index: "languages", tab: "Langues", column: "Langue-fille" }],
  [{ index: "languages", tab: "Langues", column: "Lieu" }, { index: "places", tab: "*", column: "Langues" }],
  [{ index: "languages", tab: "Langues", column: "Peuple" }, { index: "peoples", tab: "Peuples", column: "Langues" }],
]

/** Ce côté de lien concerne-t-il cet onglet ? */
export function linkEndCovers(end: WorldIndexLinkEnd, index: WorldIndexKey, tab: string) {
  return end.index === index && (end.tab === "*" || end.tab === tab)
}

/** Les onglets réellement couverts par un côté de lien. */
export function linkEndTabs(end: WorldIndexLinkEnd) {
  return end.tab === "*" && isBuiltinWorldIndexKey(end.index) ? worldIndexDefinitions[end.index].tabs.map((tab) => tab.name) : [end.tab]
}

export function isBuiltinWorldIndexKey(value: unknown): value is BuiltinWorldIndexKey {
  return typeof value === "string" && Object.hasOwn(worldIndexDefinitions, value)
}

/** Deux colonnes qui se répondent. */
export type WorldIndexLink = [WorldIndexLinkEnd, WorldIndexLinkEnd]

/** Les colonnes d'un onglet que le code d'Eraser lit par leur nom, avec la raison. */
function builtinReaders(index: WorldIndexKey, header: string): string[] {
  const folded = foldName(header)
  const reasons: string[] = []
  if (index === "creatures") {
    if (["portrait", "sorts actifs", "sorts passifs", "taille", "poids", "organisation", "langue", foldName(creatureNoteHeader), ...creatureCharacteristics.map(foldName), ...creatureGridHeaders.filter((item) => foldName(item) !== "extension").map(foldName)].includes(folded)) {
      reasons.push("La fiche des créatures lit cette colonne par son nom et l’affiche avec un champ prévu pour elle.")
    }
    if (folded === "sorts actifs" || folded === "sorts passifs") reasons.push("La fusion des sorts (Index des sorts) renomme les sorts cités dans cette colonne.")
    if (folded === "portrait") reasons.push("Le token d’une créature est fabriqué à partir de ce portrait.")
    if (Object.keys(creatureChoices).some((choice) => foldName(choice) === folded)) reasons.push("« Corriger les fautes » compare cette colonne à sa liste de choix.")
  }
  return reasons
}

/**
 * Ce qu'on peut changer sur une colonne d'un index du monde, et pourquoi pas le reste.
 * `links` : les liens de l'index (prévus par Eraser et créés dans l'éditeur).
 */
export function worldColumnPolicy(index: WorldIndexKey, tab: string, header: string, links: WorldIndexLink[]): ColumnPolicy {
  const all = "Tout : nom, type, réglages, suppression."
  const only = "Seulement la description et l’option « Masquée »."
  if (isIdHeader(header)) return { rename: false, type: false, remove: false, reasons: ["Généré par Eraser pour reconnaître chaque ligne (et masqué d’office)."], allowed: only }
  if (isNameColumn(header)) return { rename: false, type: false, remove: false, reasons: ["Chaque ligne est retrouvée par son nom : colonnes liées, listes liées (le Peuple des PNJ…), Recherche, Agrégat et création de personnage (Peuples) en dépendent."], allowed: only }
  const pair = links.find(([end]) => linkEndCovers(end, index, tab) && foldName(end.column) === foldName(header))
  if (pair) {
    const other = pair[1]
    const where = isBuiltinWorldIndexKey(other.index) ? worldIndexDefinitions[other.index].title : other.index
    return { rename: false, type: false, remove: false, reasons: [`Répond à « ${other.column} » (${where}${other.tab === "*" ? "" : `, onglet ${other.tab}`}) : les deux colonnes se recopient par leur nom. Changer son nom, son type ou la supprimer couperait le lien.`], allowed: only }
  }
  const readers = builtinReaders(index, header)
  if (readers.length) return { rename: false, type: false, remove: false, reasons: readers, allowed: only }
  return { rename: true, type: true, remove: true, reasons: [], allowed: all }
}


/** « Aldor, Vesna ; Tharn » → trois noms. Doublons retirés, casse d'origine conservée. */
export function splitNames(value: string) {
  const seen = new Set<string>()
  return value.split(/[,;\n]+/).map((name) => name.replace(/\s+/g, " ").trim()).filter((name) => {
    const folded = foldName(name)
    if (!folded || seen.has(folded)) return false
    seen.add(folded)
    return true
  })
}

export function isNameColumn(header: string) {
  return foldName(header) === "nom"
}

/** Colonnes de liste de noms : saisies en texte brut pour que les liens restent lisibles. */
export function linkedColumnsOf(index: WorldIndexKey, tab: string) {
  return worldIndexLinks.flatMap((pair) => pair.filter((end) => linkEndCovers(end, index, tab)).map((end) => end.column))
}

/** Anciennes colonnes des créatures : sorties de la fiche, elles gardent leur contenu dans Sheets. */
export const creatureArchivedHeaders = ["Environnement", "Climat", "Sous-type secondaire", "Rencontre", "Perception"]

/** Les champs de la fiche d'une créature qui ne sont que du texte enrichi. */
const creatureFormTexts = ["Taille", "Poids", creatureNoteHeader]

function isHeader(header: string, candidates: string[]) {
  const folded = foldName(header)
  return candidates.some((candidate) => foldName(candidate) === folded)
}

/**
 * Le type de chaque colonne d'un index du monde, reconnu par son en-tête. Une colonne
 * ajoutée à la main dans Sheets est du texte enrichi, la norme.
 */
export function worldColumnSpec(index: WorldIndexKey, tab: string, header: string): IndexColumnSpec {
  // L'identifiant est utile à Eraser, rarement à l'écran : il est masqué d'office.
  if (isIdHeader(header)) return { kind: "id", hidden: true }
  if (isNameColumn(header)) return index === "creatures" ? { kind: "name-form", also: ["fixed"] } : { kind: "name", also: ["fixed"] }
  if (linkedColumnsOf(index, tab).some((column) => foldName(column) === foldName(header))) return { kind: "linked", also: ["rich"] }
  if (index === "creatures") {
    const form = !isHeader(header, creatureGridHeaders)
    if (isHeader(header, creatureArchivedHeaders)) return { kind: "archived" }
    const options = Object.entries(creatureChoices).find(([candidate]) => foldName(candidate) === foldName(header))?.[1]
    if (options) return { kind: "choice", options, form }
    if (foldName(header) === "dressable") return { kind: "checkbox" }
    if (foldName(header) === "portrait") return { kind: "file", file: { accept: "image" }, form: true }
    if (isHeader(header, ["Sorts actifs"])) return { kind: "spells", spells: { source: "creature", category: "actif" }, form: true }
    if (isHeader(header, ["Sorts passifs"])) return { kind: "spells", spells: { source: "creature", category: "passif" }, form: true }
    if (isHeader(header, creatureCharacteristics)) return { kind: "number", min: 0, max: 99999, form: true }
    if (isHeader(header, creatureFormTexts)) return { kind: "rich", form: true }
    return { kind: "rich", form }
  }
  return { kind: "rich" }
}

/** Les colonnes longues (récits) prennent plus de place dans le tableau et le formulaire. */
export function isLongColumn(header: string) {
  return /description|note|histoire|autre|organisation|rencontre/.test(foldName(header))
}

/**
 * Les colonnes montrées dans le tableau d'un onglet, parmi celles de la feuille. Une
 * colonne en double dans Sheets (deux « Comportement ») n'apparaît qu'une fois : c'est
 * la première qui est lue et écrite.
 */
export function gridHeadersOf(tab: WorldIndexTabDefinition, sheetHeaders: string[]) {
  if (!tab.gridHeaders) return sheetHeaders.map((_, index) => index)
  const visible = new Set(tab.gridHeaders.map(foldName))
  const hidden = new Set(tab.headers.map(foldName).filter((header) => !visible.has(header)))
  const seen = new Set<string>()
  return sheetHeaders.flatMap((header, index) => {
    const folded = foldName(header)
    if (hidden.has(folded) || seen.has(folded)) return []
    seen.add(folded)
    return [index]
  })
}
