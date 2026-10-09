/**
 * Ce que les autres joueurs voient de la classe d'un personnage. Le joueur (ou le MJ) la
 * choisit sur la fiche : visible, cachée (« Aucune classe »), ou affichée comme une autre
 * (vraie classe : Serviteuse de Khim Tay ; affichée : Rôdeur). Rangé dans la case « Sorts
 * de classe choisis JSON », clé `classDisplay` ; tout le reste de la case est gardé.
 *
 * Seule la fiche montre la vraie classe. Partout ailleurs (profil, accueil, campagne, table
 * de jeu, références), le serveur n'envoie que `publicClassText`, pour tout le monde :
 * propriétaire et MJ compris, pour que personne ne se trompe à voix haute.
 *
 * Sans dépendance au serveur.
 */
import { displayedMultipleValue } from "@/lib/multiple-values"

/** Ce qui s'affiche quand un personnage n'a pas (encore) de classe, ou qu'elle est cachée. */
export const NO_CLASS = "Aucune classe"

export type ClassDisplayMode = "visible" | "hidden" | "as"
export type ClassDisplay = { mode: ClassDisplayMode; as: string }

export const classDisplayModes: Array<{ value: ClassDisplayMode; label: string; hint: string }> = [
  { value: "visible", label: "Visible", hint: "La vraie classe s’affiche partout" },
  { value: "hidden", label: "Cachée", hint: "« Aucune classe » partout hors de la fiche" },
  { value: "as", label: "Affichée comme…", hint: "La classe de ton choix partout hors de la fiche" },
]

function parsedChoices(choicesJson: string): Record<string, unknown> {
  try {
    const value = JSON.parse(choicesJson || "{}") as unknown
    return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}
  } catch {
    return {}
  }
}

/** Le réglage de la fiche ; sans réglage (ou illisible) : visible. « Affichée comme » sans nom vaut « cachée ». */
export function classDisplayOf(choicesJson: string): ClassDisplay {
  const raw = parsedChoices(choicesJson).classDisplay
  if (!raw || typeof raw !== "object") return { mode: "visible", as: "" }
  const value = raw as Record<string, unknown>
  const as = typeof value.as === "string" ? value.as.replace(/\s+/g, " ").trim().slice(0, 120) : ""
  if (value.mode === "hidden") return { mode: "hidden", as }
  if (value.mode === "as") return as ? { mode: "as", as } : { mode: "hidden", as: "" }
  return { mode: "visible", as }
}

/** La case des sorts choisis avec ce réglage ; visible : la clé disparaît. Tout le reste est gardé. */
export function withClassDisplay(choicesJson: string, display: ClassDisplay) {
  const parsed = parsedChoices(choicesJson)
  const as = display.as.replace(/\s+/g, " ").trim().slice(0, 120)
  const next = { ...parsed }
  if (display.mode === "visible") delete next.classDisplay
  else next.classDisplay = display.mode === "as" ? { mode: "as", as } : { mode: "hidden", ...(as ? { as } : {}) }
  return JSON.stringify(next)
}

/** La vraie classe telle qu'on la lit (« Mage · Prêtre »), ou « Aucune classe ». */
export function realClassText(classCell: string) {
  return displayedMultipleValue(classCell, "all").trim() || NO_CLASS
}

/** Ce que les autres joueurs voient : la vraie classe, « Aucune classe », ou la classe affichée. */
export function publicClassText(classCell: string, choicesJson: string) {
  const display = classDisplayOf(choicesJson)
  if (display.mode === "hidden") return NO_CLASS
  if (display.mode === "as") return display.as
  return realClassText(classCell)
}
