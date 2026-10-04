/**
 * Les lignes d'une carte de personnage joueur, partout où il apparaît (journal de
 * relations, accueil, profil, campagne, survol d'une référence) :
 *
 *   Nom
 *   Joueur · Campagne
 *   Titre honorifique
 *
 * Peuple, classes et titres sont enregistrés en liste (`["Orc des Terres Libres"]`) ou en
 * liste avec la valeur choisie (`{"values": […], "selected": "…"}`) : jamais affichés tels
 * quels. Sans dépendance : client et serveur s'en servent.
 */
import { displayedMultipleValue } from "@/lib/multiple-values"

/** Le séparateur de la deuxième ligne. */
export const CARD_SEPARATOR = " • "

/** Le titre honorifique choisi (le premier, faute de choix). */
export function honoraryTitleText(value: string | undefined) {
  return displayedMultipleValue(value ?? "", "selected")
}

/** Toutes les valeurs d'une liste (peuples, classes), lisibles : « Orc · Elfe ». */
export function listText(value: string | undefined) {
  return displayedMultipleValue(value ?? "", "all")
}

/** « Andrea • Test » : le joueur puis la ou les campagnes, ce qui est connu seulement. */
export function playerCampaignLine(playerName: string | undefined, campaigns: string | string[] | undefined) {
  const names = (Array.isArray(campaigns) ? campaigns : [campaigns ?? ""]).map((name) => name.trim()).filter(Boolean)
  return [playerName?.trim() ?? "", names.join(", ")].filter(Boolean).join(CARD_SEPARATOR)
}
