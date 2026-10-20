/**
 * Ce que tout le monde sait de l'index des pages (lib/pages-index.ts) : sa clé, son onglet, ses
 * colonnes et leur type. Sans dépendance : les cartes d'Eraser, la page Index des pages et le
 * serveur s'en servent.
 */
import type { IndexColumnSpec } from "@/lib/index-columns"

/** La clé de l'index des pages dans le moteur des index (cartes, survols, vues : « pages::Pages »). */
export const PAGES_INDEX = "pages"
export const PAGES_INDEX_TITLE = "Pages"
export const PAGES_TAB = "Pages"

export const pagesIndexHeaders = ["Titre", "Description", "Icône", "Image", "Section", "Adresse", "Visibilité", "Statut", "Origine", "Modifiée le", "Dossier", "ID"] as const

/** Une page vue comme une ligne de l'index des pages. */
/** `folder` : son dossier du créateur de pages (« Lore › Dieux »), lib/page-folders.ts. */
export type PagesIndexRow = { id: string; href: string; title: string; description: string; icon: string; image: string; section: string; address: string; visibility: string; status: string; origin: string; updated: string; folder: string }

/** Les valeurs d'une ligne, dans l'ordre de `pagesIndexHeaders`. */
export function pagesIndexValues(row: PagesIndexRow) {
  return [row.title, row.description, row.icon, row.image, row.section, row.address, row.visibility, row.status, row.origin, row.updated, row.folder, row.id]
}

/** Les colonnes de l'index des pages et leur type (lues seulement : une page se règle dans l'atelier). */
export function pagesIndexColumns(): Array<{ header: string; spec: IndexColumnSpec }> {
  const choice = (options: Array<[string, string]>, description: string): IndexColumnSpec => ({ kind: "choice", readOnly: true, description, options: options.map(([value, color]) => ({ value, color })) })
  return [
    { header: "Titre", spec: { kind: "name-form", readOnly: true, style: { bold: true } } },
    { header: "Description", spec: { kind: "rich", readOnly: true } },
    { header: "Icône", spec: { kind: "glyph", readOnly: true, glyph: { filled: false } } },
    { header: "Image", spec: { kind: "file", readOnly: true, file: { accept: "image" }, description: "La première image de la page (bloc Image)." } },
    { header: "Section", spec: choice([["Accueil", "#682522"], ["Règles", "#7a5f22"], ["Index", "#3b5c8a"], ["Bac à sable", "#0f7a65"], ["Administration", "#7c3aed"], ["Pages", "#78716c"], ["Campagne", "#9a6512"], ["Hors menu", "#78716c"]], "Où se range la page dans le menu.") },
    { header: "Adresse", spec: { kind: "rich", readOnly: true, style: { font: "mono", color: "muted" } } },
    { header: "Visibilité", spec: choice([["Tout le monde", "#0f7a65"], ["MJ et admin", "#3b5c8a"], ["Admin seulement", "#682522"]], "Qui voit la page.") },
    { header: "Statut", spec: choice([["Publiée", "#0f7a65"], ["Brouillon", "#9a6512"]], "Une page en brouillon n’est vue que de ceux qui la modifient.") },
    { header: "Origine", spec: choice([["Créée", "#682522"], ["Eraser", "#78716c"], ["Eraser, modifiée", "#9a6512"]], "Faite dans l’atelier, une page d’Eraser, ou une page d’Eraser reprise dans l’atelier.") },
    { header: "Modifiée le", spec: { kind: "rich", readOnly: true } },
    { header: "Dossier", spec: { kind: "rich", readOnly: true, description: "Son dossier dans l’Index des pages (« Lore › Dieux ») : pour ranger une vue par dossier, ou n’en montrer qu’un." } },
    { header: "ID", spec: { kind: "id", hidden: true } },
  ]
}

export function escapeCell(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}
