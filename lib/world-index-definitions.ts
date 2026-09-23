/**
 * Les index du monde rangés dans Ressources : créatures, lieux, religions, peuples, langues.
 * Ce fichier ne dépend de rien côté serveur : l'interface s'en sert aussi pour savoir
 * quelles colonnes sont des listes de noms reliées à un autre index.
 */
export type WorldIndexKey = "creatures" | "places" | "religions" | "peoples" | "languages"

export type WorldIndexTabDefinition = {
  name: string
  /** « une créature », « une divinité »… pour « Ajouter une créature ». */
  itemLabel: string
  /** Toutes les colonnes de la feuille, dans l'ordre où elles sont créées. */
  headers: string[]
  widths: number[]
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
}

/** Colonnes de l'Index des créatures visibles dans le tableau. */
export const creatureGridHeaders = ["Nom", "Type", "Sous-type", "Rang", "Dressable", "Emplacement principal", "Rareté", "Emplacement secondaire", "Rareté secondaire", "Comportement", "Extension"]

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

export type CreatureChoice = { value: string; hint?: string }

const choices = (values: string[]): CreatureChoice[] => values.map((value) => ({ value }))

export const creatureLocations = choices(["Marais", "Désert", "Savane", "Jungle", "Forêt", "Forêt noir", "Donjon", "Ville", "Caverne", "Montagne", "Aquatique", "Plaine", "Maison"])
export const creatureRarities = choices(["Très commun", "Commun", "Rare", "Très rare", "Ultime", "Légendaire"])

/** Les listes fermées de la fiche, par en-tête de colonne. */
export const creatureChoices: Record<string, CreatureChoice[]> = {
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

/**
 * Forme comparable d'un choix : accents, casse, pluriel et lettres doublées ignorés.
 * La feuille écrit « Aggressif », « défensif » ou « Humanoïde monstrueux » : ce sont
 * bien les choix « Agressif », « Défensif » et « Humanoïdes monstrueux ».
 */
function choiceKey(value: string) {
  return foldName(value).replace(/[^a-z0-9' ]+/g, " ").split(" ").filter(Boolean)
    .map((word) => word.replace(/(.)\1+/g, "$1").replace(/(?<=..)s$/, "")).join(" ")
}

/** Le choix de la liste qui correspond à une valeur de la feuille, s'il y en a un. */
export function matchCreatureChoice(value: string, options: CreatureChoice[]) {
  const key = choiceKey(value)
  if (!key) return undefined
  return options.find((option) => choiceKey(option.value) === key)
}

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

export const worldIndexDefinitions: Record<WorldIndexKey, WorldIndexDefinition> = {
  creatures: {
    key: "creatures",
    sheetName: "Index des créatures",
    title: "Index des créatures",
    path: "/ressources/index-des-creatures",
    tabs: [{
      name: "Créatures",
      itemLabel: "une créature",
      headers: [...creatureGridHeaders, ...creatureSheetOnlyHeaders],
      widths: [240, 170, 160, 90, 100, 190, 140, 190, 150, 140, 120, ...creatureSheetOnlyHeaders.map((header) => /portrait|sorts|description|organisation|rencontre/i.test(header) ? 260 : 130)],
      gridHeaders: creatureGridHeaders,
    }],
  },
  places: {
    key: "places",
    sheetName: "Index des lieux",
    title: "Index des lieux",
    path: "/ressources/index-des-lieux",
    itemLabel: "un lieu",
    tabs: placeTabs.map(([name, itemLabel]) => ({
      name,
      itemLabel,
      headers: ["Nom", "Type", "Sous-type", "Peuple", "Description", "Note", "Langues"],
      widths: [220, 150, 150, 220, 420, 320, 220],
    })),
  },
  religions: {
    key: "religions",
    sheetName: "Index des religions",
    title: "Index des religions",
    path: "/ressources/index-des-religions",
    tabs: [
      { name: "Religions", itemLabel: "une religion", headers: ["Nom", "Divinités", "Description", "Note"], widths: [220, 260, 420, 320] },
      { name: "Divinités", itemLabel: "une divinité", headers: ["Nom", "Religion", "Histoire", "Description", "Autre"], widths: [220, 220, 420, 420, 320] },
    ],
  },
  peoples: {
    key: "peoples",
    sheetName: "Index des peuples",
    title: "Index des peuples",
    path: "/ressources/index-des-peuples",
    tabs: [{
      name: "Peuples",
      itemLabel: "un peuple",
      headers: ["Nom", "Ancêtres", "Descendant", "Lieux", "Description", "Note", "Langues"],
      widths: [220, 220, 220, 220, 420, 320, 220],
    }],
  },
  languages: {
    key: "languages",
    sheetName: "Index des langues",
    title: "Index des langues",
    path: "/ressources/index-des-langues",
    tabs: [{
      name: "Langues",
      itemLabel: "une langue",
      headers: ["Nom", "Lieu", "Peuple", "Langue-mère", "Langue-fille"],
      widths: [220, 240, 240, 220, 220],
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
  return end.tab === "*" ? worldIndexDefinitions[end.index].tabs.map((tab) => tab.name) : [end.tab]
}

export function foldName(value: string) {
  // ’ et ' sont le même caractère pour un nom : le clavier et Sheets n'écrivent pas toujours le même.
  return value.normalize("NFD").replace(/\p{M}/gu, "").replace(/[’‘ʼ`´]/g, "'").toLocaleLowerCase("fr").replace(/\s+/g, " ").trim()
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
