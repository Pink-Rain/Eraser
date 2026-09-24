/**
 * À 0 PV ou moins, la fiche passe en gris ; à moins la vie totale ou en dessous, en
 * rouge. Seul un filtre change : tout reste cliquable. Une fiche dont la vie totale
 * n'est pas encore renseignée (« 0 / 0 ») reste normale.
 */
export function characterLifeState(current: string, total: string): "alive" | "down" | "dead" {
  const totalNumber = Number.parseFloat(String(total ?? "").replace(",", "."))
  const hasTotal = Number.isFinite(totalNumber) && totalNumber > 0
  const parsed = Number.parseFloat(String(current ?? "").replace(",", "."))
  // Une vie actuelle vide s'affiche « 0 » : elle compte comme 0 dès qu'il y a une vie totale.
  const currentNumber = Number.isFinite(parsed) ? parsed : hasTotal ? 0 : Number.NaN
  if (!Number.isFinite(currentNumber)) return "alive"
  if (hasTotal && currentNumber <= -totalNumber) return "dead"
  if (currentNumber < 0 || (hasTotal && currentNumber <= 0)) return "down"
  return "alive"
}
