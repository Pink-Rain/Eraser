import { normalizeClassLabel } from "@/lib/class-utils"

/**
 * Les colonnes de rang de la feuille des sorts des classes : une par classe, nommée par
 * l'identifiant de la classe (« CLA-0003 ») ou par son nom (« Guerrier·e »). Chaque case
 * porte le rang du sort dans la classe (0 : rang commun), vide s'il n'en fait pas partie.
 * Une seule règle pour tout Eraser : les pages de classe et le moteur des index retrouvent
 * exactement les mêmes colonnes.
 */
export function classRankColumnsOf(headers: readonly string[], classes: ReadonlyArray<{ id: string; name: string }>) {
  return classes.flatMap((characterClass) => {
    const column = headers.findIndex((header) => header === characterClass.id || normalizeClassLabel(header) === normalizeClassLabel(characterClass.name))
    return column >= 0 ? [{ classId: characterClass.id, column }] : []
  })
}

/** Le rang écrit dans une case (0 à 20), `null` si elle est vide ou ne contient pas un rang. */
export function classRankOf(value: unknown) {
  const rank = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10)
  return Number.isInteger(rank) && rank >= 0 && rank <= 20 ? rank : null
}
