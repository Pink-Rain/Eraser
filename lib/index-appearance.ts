/**
 * Les colonnes qu'une apparence d'un index peut montrer : formulaire, survol, carte, présentation.
 * Règle pure, partagée par le « Modifier » de l'index (components/eraser/index-editor.tsx :
 * formulaire principal, carte officielle) et l'atelier des pages (extension Eraser Page, qui
 * l'emprunte : survols, cartes, formulaires et présentations).
 */
import { normalizeSpec, type IndexColumnSpec } from "@/lib/index-columns"
import type { LayoutKind } from "@/lib/index-layouts"

export type AppearanceColumn = { header: string; spec: IndexColumnSpec }
/** Une colonne d'un onglet, telle que l'éditeur la tient (`removed` : à la corbeille, pas encore enregistré). */
export type AppearanceSourceColumn = { header: string; spec: IndexColumnSpec; removed?: boolean }

const live = (columns: AppearanceSourceColumn[]) => columns.filter((item) => !item.removed && item.header.trim())

/**
 * Les colonnes qu'une mise en page peut placer : celles de la fiche (sauf l'identifiant et
 * ce qu'Eraser calcule hors fiche), ou celles qu'un survol sait montrer (une valeur gardée).
 */
export function layoutColumnsFor(columns: AppearanceSourceColumn[], kind: LayoutKind): AppearanceColumn[] {
  const formHidden = ["id", "auto-links", "ranked-links", "tab", "archived"]
  // Le survol a toujours le nom en titre : il n'est pas proposé comme case.
  const hoverHidden = ["id", "actions", "auto-links", "ranked-links", "tab", "archived", "formula", "lookup", "rollup", "name", "name-form"]
  return live(columns).flatMap((item) => {
    const spec = normalizeSpec(item.spec)
    // Toute colonne peut aller dans la fiche ou le survol, masquée ou non : c'est la mise en page qui décide.
    if ((kind === "form" ? formHidden : hoverHidden).includes(spec.kind)) return []
    return [{ header: item.header.trim(), spec }]
  })
}

/** Les colonnes qu'une carte peut montrer : toutes, sauf ce qui n'a pas de valeur à afficher. */
export function cardColumnsFor(columns: AppearanceSourceColumn[]): AppearanceColumn[] {
  const hidden = ["id", "archived", "tab", "auto-links", "ranked-links", "actions"]
  return live(columns).flatMap((item) => {
    const spec = normalizeSpec(item.spec)
    return hidden.includes(spec.kind) ? [] : [{ header: item.header.trim(), spec }]
  })
}

/** Les colonnes qu'une présentation peut lire (sans l'identifiant). */
export function viewColumnsFor(columns: AppearanceSourceColumn[]): string[] {
  return live(columns).filter((item) => !/^id$/i.test(item.header.trim())).map((item) => item.header.trim())
}
