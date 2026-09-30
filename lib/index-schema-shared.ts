/**
 * Le schéma des index : ce qu'on peut changer dans « Modifier », et pourquoi certaines
 * colonnes sont verrouillées. Partagé par l'éditeur (interface) et le serveur, qui
 * refuse une opération verrouillée même si l'interface la laissait passer.
 */
import { foldName, isIdHeader, type IndexColumnKind, type IndexColumnSpec } from "@/lib/index-columns"
import type { WorldIndexKey } from "@/lib/world-index-definitions"

/** L'onglet discret de chaque classeur qui décrit ses colonnes. */
export const SCHEMA_TAB = "Eraser · colonnes"

export type IndexFamily = "world" | "objects" | "spells" | "npcs" | "campaigns" | "characters"

/**
 * Une ligne de l'onglet de schéma. `column` vide : la ligne décrit l'onglet lui-même.
 * `state` : « ajouté » (créé depuis Eraser), « corbeille » (supprimé, restaurable),
 * « supprimé » (effacé définitivement : Eraser ne doit pas le recréer).
 */
export type SchemaEntry = {
  tab: string
  column: string
  /** Nom d'origine d'une colonne prévue par Eraser, quand elle a été renommée. */
  origin: string
  spec: IndexColumnSpec | null
  state: "" | "ajouté" | "corbeille" | "supprimé"
  deletedAt: string
}

/** La ligne du schéma qui décrit une colonne (ou, `column` vide, un onglet). */
export function findEntry(entries: SchemaEntry[], tab: string, column: string) {
  return entries.find((entry) => foldName(entry.tab) === foldName(tab) && foldName(entry.column) === foldName(column))
}

/** Une colonne ou un onglet à la corbeille, ou effacé pour de bon. */
export function isTrashedEntry(entry: SchemaEntry | undefined) {
  return Boolean(entry && (entry.deletedAt || entry.state === "supprimé"))
}

export type ColumnPolicy = {
  rename: boolean
  type: boolean
  remove: boolean
  /** Ce qui lit la colonne, et donc ce qui casserait. */
  reasons: string[]
  /** Ce qu'on peut changer malgré le verrou. */
  allowed: string
}

export type EditorColumn = { header: string; spec: IndexColumnSpec; policy: ColumnPolicy }

export type EditorTab = {
  name: string
  columns: EditorColumn[]
  remove: boolean
  removeReason?: string
  addColumns: boolean
  addColumnsReason?: string
}

/** Un index qu'on peut viser depuis une relation (Liste liée, Colonne liée, Recherche…). */
export type RelationTarget = { index: WorldIndexKey; title: string; tabs: Array<{ name: string; columns: string[] }> }

export type IndexEditorModel = {
  family: IndexFamily
  /** Clé de l'index (monde), ou identifiant du classeur (objets). */
  key: string
  title: string
  tabs: EditorTab[]
  addTabs: boolean
  addTabsReason?: string
  /** Rien n'est modifiable : l'éditeur ne fait qu'expliquer. */
  readOnly?: boolean
  readOnlyReason?: string
  relationTargets: RelationTarget[]
}

export type SchemaOperation =
  | { op: "rename"; tab: string; header: string; to: string }
  | { op: "spec"; tab: string; header: string; spec: IndexColumnSpec }
  | { op: "add-column"; tab: string; header: string; spec: IndexColumnSpec }
  | { op: "remove-column"; tab: string; header: string }
  | { op: "add-tab"; name: string; columns: Array<{ header: string; spec: IndexColumnSpec }> }
  | { op: "remove-tab"; tab: string }

/** Les types proposés à la création ou au changement de type d'une colonne. */
export const creatableKinds: IndexColumnKind[] = ["rich", "fixed", "number", "choice", "checkbox", "linked-choice", "linked", "file", "color", "gauge", "lookup", "rollup", "spells"]

export const freePolicy: ColumnPolicy = { rename: true, type: true, remove: true, reasons: [], allowed: "Tout : nom, type, réglages, suppression." }

export function lockedPolicy(reasons: string[], allowed = "Seulement la description et l’option « Masquée ».", partial: Partial<Pick<ColumnPolicy, "rename" | "type" | "remove">> = {}): ColumnPolicy {
  return { rename: false, type: false, remove: false, ...partial, reasons, allowed }
}

/** Un nom de colonne acceptable : non vide, pas trop long, pas déjà pris dans l'onglet. */
export function headerProblem(name: string, existing: string[], current?: string) {
  const clean = name.replace(/\s+/g, " ").trim()
  if (!clean) return "Le nom de la colonne est vide."
  if (clean.length > 60) return "Le nom de la colonne est trop long (60 caractères au plus)."
  if (clean.startsWith("Eraser ·")) return "Ce nom est réservé par Eraser."
  if (existing.some((header) => foldName(header) === foldName(clean) && foldName(header) !== foldName(current ?? ""))) return "Une colonne porte déjà ce nom dans cet onglet."
  return ""
}

export function tabProblem(name: string, existing: string[]) {
  const clean = name.replace(/\s+/g, " ").trim()
  if (!clean) return "Le nom de l’onglet est vide."
  if (clean.length > 60) return "Le nom de l’onglet est trop long (60 caractères au plus)."
  if (clean.startsWith("Eraser ·")) return "Ce nom est réservé par Eraser."
  if (/[[\]*?/\\:]/.test(clean)) return "Un nom d’onglet ne peut pas contenir [ ] * ? / \\ :."
  if (existing.some((tab) => foldName(tab) === foldName(clean))) return "Un onglet porte déjà ce nom."
  return ""
}

/** Les colonnes que l'inventaire, les boutiques et la table lisent dans un tableau d'objets. */
export const objectReadHeaders: Array<{ names: string[]; label: string }> = [
  { names: ["Nom", "Nom de l'objet", "Objet", "Arme", "Équipement", "Equipement", "Ressource", "Livre", "Titre"], label: "le nom de l’objet" },
  { names: ["Description", "Déscription"], label: "la description" },
  { names: ["Type", "Catégorie", "Categorie"], label: "le type (rangement dans les sacs, icône par défaut)" },
  { names: ["Sous-type", "Sous type", "Subtype"], label: "le sous-type" },
  { names: ["Effet", "Effets"], label: "l’effet" },
  { names: ["Nombre max", "Quantité max", "Quantite max", "Maximum", "Max"], label: "la pile maximale dans un sac" },
  { names: ["Poids", "Masse"], label: "le poids" },
  { names: ["Prix", "Valeur", "Coût", "Cout"], label: "le prix (boutiques)" },
  { names: ["Encombrement"], label: "l’encombrement" },
  { names: ["Image", "Illustration", "URL image"], label: "l’image" },
  { names: ["Icône", "Icone", "Icon"], label: "l’icône (inventaire, boutiques, table)" },
  { names: ["Notes", "Note"], label: "les notes" },
  { names: ["Lien", "URL"], label: "le lien" },
  { names: ["Rareté", "Rarete"], label: "la rareté (générateur de boutiques)" },
  { names: ["Attributs", "Attribut"], label: "les attributs" },
  { names: ["Prérequis", "Prerequis"], label: "les prérequis" },
  { names: ["Édition", "Edition"], label: "l’édition" },
  { names: ["Actif", "Active", "Disponible"], label: "la disponibilité (boutiques, recherche d’objets)" },
]

/** Pourquoi une colonne d'un tableau d'objets est verrouillée, ou `null` si elle est libre. */
export function objectColumnPolicy(header: string): ColumnPolicy {
  if (isIdHeader(header)) return lockedPolicy(["L’identifiant relie chaque objet aux inventaires des personnages et aux boutiques : le changer ferait perdre ces objets."])
  const read = objectReadHeaders.find((entry) => entry.names.some((name) => foldName(name) === foldName(header)))
  if (!read) return freePolicy
  return lockedPolicy(
    [`L’inventaire des personnages, les boutiques et la table lisent ${read.label} dans la colonne « ${header} » par son nom : la renommer ou la supprimer la rendrait introuvable.`],
    "Le type d’affichage (la valeur reste le même texte dans Sheets), la description et l’option « Masquée ».",
    { type: true },
  )
}
