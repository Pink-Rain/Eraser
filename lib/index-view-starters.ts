/**
 * Les formes de base des vues (4 Liste, 5 Kanban, 6 Maître-détail…), remplies d'office avec
 * les colonnes de l'onglet : des points de départ, à mélanger et à modifier ensuite. Chaque
 * forme n'est qu'un assemblage des briques du moteur (groupes, formule, jauge, élément, au
 * clic…) ; rien n'est propre à un cas. Les presets d'Eraser sans colonne (lib/index-view-layouts.ts)
 * restent proposés à côté.
 */
import { isNameColumnSpec, normalizeSpec, type IndexColumnSpec } from "@/lib/index-columns"
import { DEFAULT_ITEM_CARD, type PresentationKind, type ViewLayout } from "@/lib/index-view-layouts"

export type ViewStarterColumn = { header: string; spec?: IndexColumnSpec }
export type ViewStarter = { key: string; label: string; hint: string; kind: PresentationKind; build: (columns: ViewStarterColumn[]) => ViewLayout }

const imageWords = /portrait|image|banni[eè]re|illustration|photo|avatar|ic[oô]ne|icon|token|blason|embl[eè]me/i
const descriptionWords = /description|effet|contenu|r[ée]sum[ée]|histoire|lore|biographie|d[ée]finition|note/i
const dateWords = /date|jour|ann[ée]e|p[ée]riode|quand/i

/** Ce que chaque colonne d'un onglet peut être dans une vue (le nom, l'image, les choix, les nombres, les dates…). */
export function viewRoles(columns: ViewStarterColumn[]) {
  const infos = columns.map((column) => ({ header: column.header, spec: column.spec ? normalizeSpec(column.spec) : undefined }))
  const usable = infos.filter(({ spec }) => !spec || !["id", "auto-links", "ranked-links", "tab", "archived", "actions"].includes(spec.kind))
  const kind = (entry: (typeof infos)[number]) => entry.spec?.kind ?? "rich"
  const name = usable.find(({ spec }) => spec && isNameColumnSpec(spec))?.header ?? usable.find(({ header }) => /^nom\b/i.test(header))?.header ?? usable[0]?.header
  const image = usable.find(({ header, spec }) => (spec?.kind === "file" && spec.file?.accept === "image") || (imageWords.test(header) && !/ic[oô]ne|icon/i.test(header)))?.header
  const glyph = usable.find(({ header, spec }) => spec?.kind === "glyph" || /ic[oô]ne|icon/i.test(header))?.header
  const color = usable.find(({ header, spec }) => spec?.kind === "color" || /^couleur$/i.test(header))?.header
  const choices = usable.filter((entry) => ["choice", "linked-choice", "tab-sort"].includes(kind(entry)) || (!entry.spec && /^(type|statut|état|etat|rang|rareté|rarete|cat[ée]gorie|famille)$/i.test(entry.header))).map(({ header }) => header)
  const linked = usable.filter((entry) => kind(entry) === "linked-choice" || kind(entry) === "linked").map(({ header }) => header)
  const numbers = usable.filter((entry) => ["number", "gauge", "formula", "rollup"].includes(kind(entry))).map(({ header }) => header)
  const dates = usable.filter((entry) => dateWords.test(entry.header)).map(({ header }) => header)
  const texts = usable.filter((entry) => entry.header !== name && kind(entry) === "rich" && descriptionWords.test(entry.header)).map(({ header }) => header)
  const short = usable.filter((entry) => entry.header !== name && entry.header !== image && !texts.includes(entry.header) && !["file", "spells", "actions", "glyph", "color"].includes(kind(entry))).map(({ header }) => header)
  return { name, image, glyph, color, choices, linked, numbers, dates, texts, short }
}

const first = <T,>(items: T[], not?: T) => items.find((item) => item !== not)

export const viewStarters: ViewStarter[] = [
  // ---- 4 Liste ----
  { key: "list-register", kind: "list", label: "Tableau aligné", hint: "Colonnes en libellés, lignes fines, numéro de ligne, tri par le nom.", build: (columns) => { const r = viewRoles(columns); return { kind: "list", compact: true, numbered: true, fields: r.short.slice(0, 4), sortBy: r.name, look: { surface: "zebra", density: "compact", titleFont: "sans", fieldStyle: "labels" } } } },
  { key: "list-directory", kind: "list", label: "Annuaire par lettre", hint: "Sections par initiale, deux colonnes, l’élément réduit au nom ; le menu des lettres en haut.", build: (columns) => { const r = viewRoles(columns); return { kind: "list", alphabet: true, menu: "top", compact: true, listColumns: 2, hideCounts: true, fields: r.choices.slice(0, 1), sortBy: r.name, look: { surface: "plain", density: "compact", sectionStyle: "letter" } } } },
  { key: "list-journal", kind: "list", label: "Entrées aérées", hint: "Titre en police titre, un texte coupé, une étiquette à droite.", build: (columns) => { const r = viewRoles(columns); return { kind: "list", fields: r.texts.slice(0, 1), badgeColumn: first(r.dates) ?? first(r.choices), look: { surface: "boxed", density: "airy", titleFont: "display", titleSize: "lg", fieldStyle: "stacked", radius: "lg" } } } },
  { key: "list-menu", kind: "list", label: "Sections + menu", hint: "Des sections par une colonne, leur sommaire sur le côté.", build: (columns) => { const r = viewRoles(columns); return { kind: "list", groupBy: first(r.choices), menu: "side", hideEmpty: true, fields: r.short.slice(0, 2), look: { sectionStyle: "heading" } } } },
  { key: "list-formula", kind: "list", label: "Sections + compte + formule", hint: "L’en-tête de chaque section compte ses lignes et additionne une colonne nombre.", build: (columns) => { const r = viewRoles(columns); return { kind: "list", groupBy: first(r.choices), hideEmpty: true, compact: true, fields: r.numbers.slice(0, 2), groupFormula: r.numbers[0] ? { op: "sum", column: r.numbers[0], label: "Σ" } : { op: "count" }, look: { density: "compact" } } } },
  { key: "list-gauge", kind: "list", label: "Jauge et charges", hint: "Une colonne nombre dessinée en barre sous chaque ligne (ou en charges), l’en-tête de section contre une cible.", build: (columns) => { const r = viewRoles(columns); return { kind: "list", gauge: r.numbers[0] ? { column: r.numbers[0], style: "bar", maxColumn: r.numbers[1] } : undefined, groupBy: first(r.choices), hideEmpty: true, groupFormula: { op: "count", style: "bar", target: 5 }, look: { surface: "boxed", density: "compact" } } } },
  { key: "list-tabs", kind: "list", label: "Groupes en onglets", hint: "Les groupes deviennent des onglets au-dessus de la liste, un seul groupe affiché à la fois.", build: (columns) => { const r = viewRoles(columns); return { kind: "list", groupBy: first(r.choices), menu: "tabs", hideEmpty: true, fields: r.short.slice(0, 3), look: { surface: "plain", density: "compact" } } } },
  { key: "list-zigzag", kind: "list", label: "Image alternée", hint: "L’image change de côté une ligne sur deux, le texte à côté.", build: (columns) => { const r = viewRoles(columns); return { kind: "list", imageColumn: r.image, fields: r.texts.slice(0, 1), look: { zigzag: true, surface: "plain", density: "airy", titleFont: "display", titleSize: "md", fieldStyle: "stacked", imageWidth: 120, imageHeight: 90, imageShape: "rounded" } } } },
  { key: "list-side", kind: "list", label: "Liste + détail à côté", hint: "Au clic : la ligne choisie s’affiche à côté (la liste devient un maître-détail).", build: (columns) => { const r = viewRoles(columns); return { kind: "list", compact: true, click: "side", fields: r.short.slice(0, 2), detail: { kind: "form", nav: true }, look: { density: "compact" } } } },
  { key: "list-below", kind: "list", label: "Accordéon", hint: "Au clic : la ligne se déplie à sa place avec son formulaire en lecture.", build: (columns) => { const r = viewRoles(columns); return { kind: "list", compact: true, click: "below", fields: r.short.slice(0, 2), detail: { kind: "form" }, look: { surface: "boxed", density: "compact" } } } },
  // ---- 5 Kanban ----
  { key: "kanban-board", kind: "kanban", label: "Colonnes à bandeau, élément = carte", hint: "Bandeau coloré par colonne, chaque ligne dessinée avec la carte étoilée de l’onglet.", build: (columns) => { const r = viewRoles(columns); return { kind: "kanban", kanbanColumn: first(r.choices), hideEmpty: true, itemCard: DEFAULT_ITEM_CARD, look: { laneStyle: "header", radius: "lg" } } } },
  { key: "kanban-pipeline", kind: "kanban", label: "Colonnes sobres + compte", hint: "Le compte dans chaque en-tête (contre une limite si tu en règles une), cartes serrées.", build: (columns) => { const r = viewRoles(columns); return { kind: "kanban", kanbanColumn: first(r.choices), fields: r.short.slice(0, 2), groupFormula: { op: "count", style: "bar", target: 5 }, hideCounts: true, look: { laneStyle: "plain", density: "compact", surface: "boxed" } } } },
  { key: "kanban-lanes", kind: "kanban", label: "Colonnes × couloirs", hint: "Un second regroupement en sections horizontales.", build: (columns) => { const r = viewRoles(columns); const column = first(r.choices); return { kind: "kanban", kanbanColumn: column, groupBy: first(r.choices, column), hideEmpty: true, fields: r.short.slice(0, 1), look: { laneStyle: "tinted" } } } },
  { key: "kanban-compact", kind: "kanban", label: "Colonnes étroites, élément = nom", hint: "Rien que le nom et son icône, des colonnes nombreuses et serrées.", build: (columns) => { const r = viewRoles(columns); return { kind: "kanban", kanbanColumn: first(r.choices), laneWidth: "narrow", hideEmpty: true, iconColumn: r.glyph, look: { laneStyle: "plain", density: "compact", surface: "plain", titleSize: "sm" } } } },
  { key: "kanban-linked", kind: "kanban", label: "Colonnes = lignes d’un onglet lié + formule", hint: "Les colonnes viennent d’une colonne liée (personnages, lieux…), un chiffre par colonne.", build: (columns) => { const r = viewRoles(columns); return { kind: "kanban", kanbanColumn: first(r.linked) ?? first(r.choices), groupFormula: r.numbers[0] ? { op: "sum", column: r.numbers[0] } : { op: "count" }, hideCounts: true, fields: r.short.slice(0, 1), look: { laneStyle: "header", surface: "boxed" } } } },
  { key: "kanban-sorter", kind: "kanban", label: "Formule dans l’en-tête", hint: "Somme, moyenne, min ou max d’une colonne nombre par colonne du kanban.", build: (columns) => { const r = viewRoles(columns); return { kind: "kanban", kanbanColumn: first(r.choices), hideEmpty: true, groupFormula: { op: "sum", column: r.numbers[0], label: "Σ" }, fields: r.numbers.slice(0, 1), look: { laneStyle: "header", fieldStyle: "pills" } } } },
  { key: "kanban-gauge", kind: "kanban", label: "Jauge et charges", hint: "L’en-tête contre une cible, une barre ou des charges sur chaque carte.", build: (columns) => { const r = viewRoles(columns); return { kind: "kanban", kanbanColumn: first(r.choices), hideEmpty: true, groupFormula: { op: "count", style: "bar", target: 5 }, gauge: r.numbers[0] ? { column: r.numbers[0], style: "charges", max: 5 } : undefined, look: { laneStyle: "plain", surface: "boxed" } } } },
  // ---- 6 Maître-détail ----
  { key: "master-form", kind: "master-detail", label: "Liste étroite + formulaire en lecture", hint: "Le détail est le formulaire étoilé de l’onglet, lu.", build: (columns) => { const r = viewRoles(columns); return { kind: "master-detail", detail: { kind: "form" }, fields: r.choices.slice(0, 1), look: { masterWidth: "narrow", density: "compact" } } } },
  { key: "master-library", kind: "master-detail", label: "Liste à droite + bannière", hint: "La liste à droite, le détail avec son image en bannière, sur une colonne.", build: (columns) => { const r = viewRoles(columns); return { kind: "master-detail", masterSide: "right", imageColumn: r.image, detailImage: "banner", detailColumns: 1, fields: r.short.slice(0, 1), look: { masterWidth: "narrow", titleFont: "display" } } } },
  { key: "master-tabs", kind: "master-detail", label: "Détail en onglets", hint: "Le détail = le formulaire de l’onglet ; règle ses sections en onglets dans 1 Formulaire.", build: () => ({ kind: "master-detail", detail: { kind: "form", nav: true }, look: { masterWidth: "normal" } }) },
  { key: "master-card", kind: "master-detail", label: "Détail = une carte", hint: "La ligne choisie dessinée avec la carte étoilée de l’onglet.", build: (columns) => { const r = viewRoles(columns); return { kind: "master-detail", detail: { kind: "card" }, fields: r.choices.slice(0, 1), look: { masterWidth: "normal", imageShape: "circle" } } } },
  { key: "master-nav", kind: "master-detail", label: "Précédent / suivant", hint: "Le détail avec sa position et des flèches, la liste serrée.", build: (columns) => { const r = viewRoles(columns); return { kind: "master-detail", detail: { nav: true }, imageColumn: r.image, fields: r.short.slice(0, 1), look: { masterWidth: "narrow", density: "compact" } } } },
  { key: "master-gauge", kind: "master-detail", label: "Jauge et charges", hint: "Une barre fine sous chaque ligne de la liste, la jauge de la ligne choisie dans le détail.", build: (columns) => { const r = viewRoles(columns); return { kind: "master-detail", gauge: r.numbers[0] ? { column: r.numbers[0], style: "bar", maxColumn: r.numbers[1] } : undefined, fields: [], look: { masterWidth: "normal", density: "compact" } } } },
]

/** Les formes de base d'une vue, bâties sur les colonnes de l'onglet (les colonnes absentes restent vides). */
export function viewStartersFor(kind: PresentationKind, columns: ViewStarterColumn[]) {
  return viewStarters.filter((starter) => starter.kind === kind).map((starter) => ({ key: starter.key, label: starter.label, hint: starter.hint, layout: starter.build(columns) }))
}
