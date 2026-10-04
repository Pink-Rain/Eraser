/**
 * Les propriétaires d'un personnage (colonne « Joueur ») ou d'une campagne (colonne « MJ ») :
 * un ou plusieurs comptes, écrits dans la case séparés par « · » (« uid1 · uid2 »). Une case
 * d'un seul identifiant, comme toutes celles écrites avant, reste valable telle quelle.
 *
 * Sans dépendance : serveur, pages et composants s'en servent.
 */
import { parseListCell, serializeListCell } from "@/lib/multiple-values"

/** Les comptes d'une case « Joueur » ou « MJ ». */
export function ownersOf(cell: string | null | undefined): string[] {
  return parseListCell(cell).entries
}

/** La case écrite pour ces comptes (vide : sans propriétaire). */
export function ownersCell(uids: readonly string[]) {
  return serializeListCell(uids.map((uid) => uid.trim()).filter(Boolean))
}

/** Un des comptes (ou identifiants historiques) `uids` possède-t-il la ligne de cette case ? */
export function ownedBy(cell: string | null | undefined, uids: readonly string[]) {
  if (!cell || !uids.length) return false
  return ownersOf(cell).some((owner) => uids.includes(owner))
}
