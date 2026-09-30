/**
 * Les types de colonnes de tous les index. Chaque colonne d'un index est décrite par
 * un type principal, d'éventuels types secondaires (« Nom · Affichage fixe ») et le
 * drapeau Formulaire (elle ne vit que dans la fiche, pas dans le tableau). Le moteur
 * de cellules (`components/eraser/index-cells.tsx`) ne connaît que ces types : il n'y
 * a plus de cas particuliers écrits index par index.
 *
 * Ce fichier ne dépend de rien : le serveur s'en sert aussi (identifiants, corrections).
 */
import type { WorldIndexKey } from "@/lib/world-index-definitions"

export type IndexColumnKind =
  | "rich"
  | "fixed"
  | "name"
  | "name-form"
  | "id"
  | "linked"
  | "choice"
  | "linked-choice"
  | "checkbox"
  | "auto-links"
  | "ranked-links"
  | "tab"
  | "image"
  | "spells"
  | "gauge"
  | "number"
  | "archived"

export const indexColumnKinds: Record<IndexColumnKind, { label: string; description: string }> = {
  "rich": { label: "Texte enrichi", description: "Texte libre avec mise en forme (gras, couleurs, listes, liens…), enregistré tel quel dans Sheets." },
  "fixed": { label: "Affichage fixe", description: "Texte dont l'apparence est imposée par Eraser : la mise en forme est retirée à l'enregistrement." },
  "name": { label: "Nom", description: "Le nom de la ligne : obligatoire, enregistré à la sortie de la cellule, renommé partout où il est cité." },
  "name-form": { label: "Nom formulaire", description: "Le nom de la ligne, qui ouvre sa fiche complète d'un clic." },
  "id": { label: "Identifiant", description: "Identifiant unique, généré par Eraser. Il ne se modifie pas depuis le tableau." },
  "linked": { label: "Colonne liée", description: "Liste de noms séparés par des virgules, recopiée dans la colonne qui lui répond ; un nom absent crée sa ligne." },
  "choice": { label: "Liste déroulante", description: "Un choix dans une liste fermée. Une valeur hors liste reste affichée en italique." },
  "linked-choice": { label: "Liste déroulante liée", description: "Un choix parmi les noms d'un autre index ; une valeur absente y crée sa ligne." },
  "checkbox": { label: "Case à cocher", description: "Écrit « Oui » ou « Non » dans Sheets." },
  "auto-links": { label: "Liens automatiques", description: "Calculée par Eraser : chaque élément trouvé ailleurs devient un lien. Rien à saisir." },
  "ranked-links": { label: "Liens classés", description: "Pastilles reliées à d'autres éléments, chacune avec son rang." },
  "tab": { label: "Onglet", description: "L'onglet de la ligne ; le changer la déplace." },
  "image": { label: "Image", description: "Une image importée ou une adresse (URL) collée." },
  "spells": { label: "Sélecteur de sorts", description: "Des sorts des classes, des créatures ou des deux, gardés par leur nom." },
  "gauge": { label: "Jauge", description: "Un nombre affiché en barre, en icônes à cliquer ou en anneau." },
  "number": { label: "Nombre", description: "Un nombre entier." },
  "archived": { label: "Archivée", description: "Ancienne colonne gardée dans Sheets, jamais affichée ni modifiée." },
}

export type ChoiceOption = {
  value: string
  /** Information affichée au survol de l'option. */
  hint?: string
  /** Anciennes orthographes reconnues et corrigées vers `value`. */
  aliases?: string[]
}

export type GaugeStyle = "bar" | "icons" | "ring"

/**
 * « class » : l'index « Sorts des classes » ; « creature » : l'index « Sorts des
 * créatures » ; « all » : les deux.
 */
export type SpellSource = "class" | "creature" | "all"

export type IndexColumnSpec = {
  kind: IndexColumnKind
  /** Types secondaires : « Nom » + « Affichage fixe », « Jauge » + « Nombre »… */
  also?: IndexColumnKind[]
  /** Colonne formulaire : remplie dans la fiche, absente du tableau. */
  form?: boolean
  /** Apparence imposée d'un texte à affichage fixe. */
  display?: "bold" | "skills" | "muted"
  /** Liste déroulante : les choix. */
  options?: ChoiceOption[]
  /** Liste déroulante : une valeur hors liste peut être saisie (les choix ne sont que des suggestions). */
  allowCustom?: boolean
  /** Liste déroulante liée : l'index et l'onglet d'où viennent les noms. */
  source?: { index: WorldIndexKey; tab: string }
  gauge?: { style: GaugeStyle; max: number }
  spells?: { source: SpellSource; category?: "actif" | "passif" }
  /** Case à cocher : une cellule vide compte comme cochée (« Actif » d'un objet). */
  emptyChecked?: boolean
  /** Nombre : bornes. */
  min?: number
  max?: number
}

/** Tous les types d'une colonne, principal d'abord. */
export function kindsOf(spec: IndexColumnSpec): IndexColumnKind[] {
  return [spec.kind, ...(spec.also ?? []).filter((kind) => kind !== spec.kind)]
}

/** « Liste déroulante · Formulaire » : ce qu'affiche l'en-tête au survol. */
export function columnTypeLabel(spec: IndexColumnSpec) {
  const labels = kindsOf(spec).map((kind) => indexColumnKinds[kind].label)
  if (spec.form) labels.push("Formulaire")
  if (spec.kind === "gauge" && spec.gauge) labels[0] = `${labels[0]} (${spec.gauge.style === "bar" ? "barre" : spec.gauge.style === "icons" ? "icônes" : "anneau"})`
  if (spec.kind === "spells" && spec.spells) labels[0] = `${labels[0]} (${spec.spells.source === "class" ? "sorts de classe" : spec.spells.source === "creature" ? "sorts de créature" : "tous les sorts"})`
  return labels.join(" · ")
}

/** Le texte d'une colonne de ce type est-il enregistré avec sa mise en forme ? */
export function isRichSpec(spec: IndexColumnSpec) {
  const kinds = kindsOf(spec)
  return kinds.includes("rich") || (spec.kind === "linked" && !kinds.includes("fixed"))
}

/** La colonne apparaît-elle dans le tableau ? */
export function isGridSpec(spec: IndexColumnSpec) {
  return !spec.form && spec.kind !== "archived"
}

export function foldName(value: string) {
  // ’ et ' sont le même caractère pour un nom : le clavier et Sheets n'écrivent pas toujours le même.
  return value.normalize("NFD").replace(/\p{M}/gu, "").replace(/[’‘ʼ`´]/g, "'").toLocaleLowerCase("fr").replace(/\s+/g, " ").trim()
}

/**
 * Forme comparable d'un choix : accents, casse, pluriel et lettres doublées ignorés.
 * La feuille écrit « Aggressif », « défensif » ou « Humanoïde monstrueux » : ce sont
 * bien les choix « Agressif », « Défensif » et « Humanoïdes monstrueux ».
 */
export function choiceKey(value: string) {
  return foldName(value).replace(/[^a-z0-9' ]+/g, " ").split(" ").filter(Boolean)
    .map((word) => word.replace(/(.)\1+/g, "$1").replace(/(?<=..)s$/, "")).join(" ")
}

/** Le choix de la liste qui correspond à une valeur de la feuille, s'il y en a un. */
export function matchChoice(value: string, options: ChoiceOption[]) {
  const key = choiceKey(value)
  if (!key) return undefined
  return options.find((option) => choiceKey(option.value) === key || option.aliases?.some((alias) => choiceKey(alias) === key))
}

/**
 * La bonne orthographe d'une valeur, si elle est mal écrite : « Aggressif » → « Agressif ».
 * `null` quand la valeur est déjà juste, vide ou hors de la liste.
 */
export function choiceCorrection(value: string, options: ChoiceOption[]) {
  const trimmed = value.trim()
  const matched = matchChoice(trimmed, options)
  return matched && matched.value !== value ? matched.value : null
}

export function isCheckedValue(value: string, emptyChecked = false) {
  const trimmed = value.trim()
  if (!trimmed) return emptyChecked
  // « Actif » d'un objet : tout ce qui n'est pas explicitement négatif est coché.
  if (emptyChecked) return !/^(non|faux|false|0|no|inactif|inactive)$/i.test(trimmed)
  return /^(oui|vrai|true|x|1|yes)$/i.test(trimmed)
}

/**
 * La valeur écrite par une case à cocher, dans le vocabulaire de la cellule : une vraie
 * case Google Sheets (TRUE/FALSE) le reste, sinon « Oui »/« Non ».
 */
export function checkboxValue(checked: boolean, current = "") {
  if (/^(true|false)$/i.test(current.trim())) return checked ? "TRUE" : "FALSE"
  return checked ? "Oui" : "Non"
}

/** Nouvel identifiant : « CRE-3F9A1C2B ». */
export function newIndexId(prefix: string) {
  return `${prefix}-${crypto.randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase()}`
}

export function isIdHeader(header: string) {
  return ["id", "identifiant"].includes(foldName(header))
}

/** Une vraie adresse d'image : une cellule décalée peut contenir « Base ». */
export function isImageSource(value: string) {
  return /^(https?:\/\/|\/|data:image\/)/i.test(value.trim())
}

function decodeEntities(value: string) {
  return value.replace(/&nbsp;/gi, " ").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&quot;/gi, "\"").replace(/&#39;/gi, "'").replace(/&amp;/gi, "&")
}

/**
 * Un texte enrichi sans aucune mise en forme redevient du texte simple : la feuille
 * reste lisible et les pages qui affichent ce texte en brut n'y voient pas de balises.
 */
export function compactRichText(html: string) {
  const value = html.trim()
  if (/<(?!br\s*\/?>|\/?(?:div|p)\s*>)[a-z/]/i.test(value)) return value
  return decodeEntities(value.replace(/<br\s*\/?>/gi, "\n").replace(/<\/(?:div|p)>/gi, "\n").replace(/<(?:div|p)>/gi, "")).replace(/\n+$/, "").trim()
}

/** Les en-têtes qui désignent le nom d'un objet, dans l'ordre où l'inventaire les cherche. */
const objectNameHeaders = ["Nom", "Nom de l'objet", "Objet", "Arme", "Équipement", "Equipement", "Ressource", "Livre", "Titre"]

/**
 * Le type d'une colonne de l'Index des objets, reconnu par son en-tête : chaque
 * classeur du dossier « Objets » a ses propres colonnes. Le nom garde sa mise en forme,
 * que l'inventaire et les boutiques affichent.
 */
export function objectColumnSpec(header: string, headers: string[]): IndexColumnSpec {
  const folded = foldName(header)
  if (isIdHeader(header)) return { kind: "id" }
  const names = new Set(objectNameHeaders.map(foldName))
  const nameHeader = headers.find((candidate) => names.has(foldName(candidate)))
  if (nameHeader && foldName(nameHeader) === folded) return { kind: "name", also: ["rich"] }
  if (["image", "illustration", "url image", "icone", "icon"].includes(folded)) return { kind: "image" }
  if (["actif", "active", "disponible"].includes(folded)) return { kind: "checkbox", emptyChecked: true }
  return { kind: "rich" }
}
