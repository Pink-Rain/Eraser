/**
 * Les index du monde rangés dans Ressources : créatures, lieux, religions, peuples.
 * Ce fichier ne dépend de rien côté serveur : l'interface s'en sert aussi pour savoir
 * quelles colonnes sont des listes de noms reliées à un autre index.
 */
export type WorldIndexKey = "creatures" | "places" | "religions" | "peoples"

export type WorldIndexTabDefinition = {
  name: string
  /** « une créature », « une divinité »… pour « Ajouter une créature ». */
  itemLabel: string
  headers: string[]
  widths: number[]
}

export type WorldIndexDefinition = {
  key: WorldIndexKey
  /** Nom du classeur dans Google Drive. */
  sheetName: string
  title: string
  path: string
  tabs: WorldIndexTabDefinition[]
}

export const worldIndexDefinitions: Record<WorldIndexKey, WorldIndexDefinition> = {
  creatures: {
    key: "creatures",
    sheetName: "Index des créatures",
    title: "Index des créatures",
    path: "/ressources/index-des-creatures",
    tabs: [{
      name: "Créatures",
      itemLabel: "une créature",
      headers: ["Nom", "Type", "Sous-type", "Rang", "Dressable", "Emplacement principal", "Rareté", "Emplacement secondaire", "Rareté secondaire", "Agressivité", "Extension"],
      widths: [220, 150, 150, 90, 110, 200, 110, 200, 140, 120, 130],
    }],
  },
  places: {
    key: "places",
    sheetName: "Index des lieux",
    title: "Index des lieux",
    path: "/ressources/index-des-lieux",
    tabs: [{
      name: "Lieux",
      itemLabel: "un lieu",
      headers: ["Nom", "Type", "Sous-type", "Peuple", "Description", "Note"],
      widths: [220, 150, 150, 220, 420, 320],
    }],
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
      headers: ["Nom", "Ancêtres", "Descendant", "Lieux", "Description", "Note"],
      widths: [220, 220, 220, 220, 420, 320],
    }],
  },
}

export type WorldIndexLinkEnd = { index: WorldIndexKey; tab: string; column: string }

/**
 * Colonnes qui se répondent. Écrire un nom d'un côté l'inscrit de l'autre, et crée
 * la ligne manquante au besoin : « x » en Descendant de « y » ajoute « y » aux
 * Ancêtres de « x ».
 */
export const worldIndexLinks: Array<[WorldIndexLinkEnd, WorldIndexLinkEnd]> = [
  [{ index: "religions", tab: "Religions", column: "Divinités" }, { index: "religions", tab: "Divinités", column: "Religion" }],
  [{ index: "peoples", tab: "Peuples", column: "Ancêtres" }, { index: "peoples", tab: "Peuples", column: "Descendant" }],
  [{ index: "peoples", tab: "Peuples", column: "Lieux" }, { index: "places", tab: "Lieux", column: "Peuple" }],
]

export function foldName(value: string) {
  return value.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase("fr").replace(/\s+/g, " ").trim()
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
  return worldIndexLinks.flatMap((pair) => pair.filter((end) => end.index === index && end.tab === tab).map((end) => end.column))
}

export function isLongColumn(header: string) {
  return /description|note|histoire|autre/.test(foldName(header))
}
