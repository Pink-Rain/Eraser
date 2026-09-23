/** La page des PNJ de l'Index des PNJ, bibliothèque commune hors de toute campagne. */
export const npcIndexPage = "index-des-pnjs"

/** Les pages de PNJ qui ne dépendent d'aucune campagne. */
export function isNpcLibraryPage(pageLinked: string) {
  return pageLinked === "bac-a-sable" || pageLinked === npcIndexPage
}

/** Un PNJ n'a de vie actuelle et de sac à dos que dans une campagne. */
export function npcBelongsToCampaign(npc: { pageLinked: string }) {
  return !isNpcLibraryPage(npc.pageLinked)
}
