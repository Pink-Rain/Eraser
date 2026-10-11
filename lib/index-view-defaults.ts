import { ALL_SOURCES, type IndexView } from "@/lib/index-views"

/**
 * Les onglets-fenêtres qu'Eraser prévoit d'office, avant ceux créés dans l'index : Actifs,
 * Passifs et Bonus dans les sorts des classes (Actifs et Passifs chez les créatures, qui
 * n'ont pas de bonus). Définis ici, jamais écrits dans les réglages : ils ne se modifient
 * ni ne se suppriment, et les lignes y sont rangées comme dans les pages de classe.
 */
const category = (index: string, id: string, name: string, value: string, position: number): IndexView => ({
  id: `eraser-${id}`, index, name, source: ALL_SOURCES, match: "toutes", conditions: [{ column: "Type", operator: "categorie-sort", value }], position, builtin: true,
})

/** Ce que reçoit une ligne ajoutée depuis un onglet-fenêtre prévu par Eraser : le Type de sa catégorie (un Type vide est un actif). */
export function viewAddDefaults(view: IndexView | null | undefined): Record<string, string> {
  const condition = view?.builtin ? view.conditions.find((item) => item.operator === "categorie-sort") : undefined
  if (condition?.value === "passif") return { [condition.column]: "Passif" }
  if (condition?.value === "bonus") return { [condition.column]: "Bonus" }
  return {}
}

export function builtinViewsFor(index: string): IndexView[] {
  if (index === "class-spells") return [category(index, "actifs", "Actifs", "actif", -3), category(index, "passifs", "Passifs", "passif", -2), category(index, "bonus", "Bonus", "bonus", -1)]
  // Pas de bonus chez les créatures : un sort ainsi typé reste avec les actifs.
  if (index === "creature-spells") return [category(index, "actifs", "Actifs", "!passif", -2), category(index, "passifs", "Passifs", "passif", -1)]
  return []
}
