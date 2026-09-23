/** Les onglets de l'Index des PNJs, bibliothèques communes hors de toute campagne. */
export const npcIndexPage = "index-des-pnjs"
export const genericNpcIndexPage = "index-des-pnjs-generiques"

export const npcIndexTabs = [
  { id: npcIndexPage, label: "PNJs" },
  { id: genericNpcIndexPage, label: "PNJs Génériques" },
] as const

/** Les pages de PNJ qui ne dépendent d'aucune campagne. */
export function isNpcLibraryPage(pageLinked: string) {
  return pageLinked === "bac-a-sable" || npcIndexTabs.some((tab) => tab.id === pageLinked)
}

/** Un PNJ n'a de vie actuelle et de sac à dos que dans une campagne. */
export function npcBelongsToCampaign(npc: { pageLinked: string }) {
  return !isNpcLibraryPage(npc.pageLinked)
}

/** Deux PNJ de même nom sont le même personnage d'une page à l'autre. */
export function foldNpcName(value: string) {
  return value.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase("fr").replace(/\s+/g, " ").trim()
}
