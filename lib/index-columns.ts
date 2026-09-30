/**
 * Les types de colonnes de tous les index. Chaque colonne d'un index est décrite par
 * un type principal, d'éventuels types secondaires (« Nom · Affichage fixe ») et le
 * drapeau Formulaire (elle ne vit que dans la fiche, pas dans le tableau). Le moteur
 * de cellules (`components/eraser/index-cells.tsx`) ne connaît que ces types : il n'y
 * a plus de cas particuliers écrits index par index.
 *
 * Ce fichier ne dépend de rien : le serveur s'en sert aussi (identifiants, corrections).
 */
import { formatIndexNumber, parseIndexNumber, type NumberFormat } from "@/lib/index-numbers"
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
  | "file"
  | "color"
  | "lookup"
  | "rollup"
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
  "file": { label: "Fichier", description: "Un ou plusieurs fichiers (images, sons, PDF…) importés dans le Drive, ou des adresses collées." },
  "color": { label: "Couleur", description: "Une couleur, choisie dans une palette ou par son code." },
  "lookup": { label: "Recherche", description: "Affiche une colonne des lignes reliées par une relation. Rien à saisir." },
  "rollup": { label: "Agrégat", description: "Calcule sur les lignes reliées : nombre, somme, moyenne, min, max… Rien à saisir." },
  "spells": { label: "Sélecteur de sorts", description: "Des sorts des classes, des créatures ou des deux, gardés par leur nom." },
  "gauge": { label: "Jauge", description: "Un nombre affiché en barre, en icônes à cliquer ou en anneau." },
  "number": { label: "Nombre", description: "Un nombre, avec son unité (monnaie, distance, poids…), une plage ou un pourcentage ; trié sur sa vraie valeur." },
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

/** Les fichiers acceptés par une colonne Fichier. */
export type FileAccept = "image" | "audio" | "video" | "pdf" | "any"

export const fileAcceptLabels: Record<FileAccept, string> = { image: "Images", audio: "Sons", video: "Vidéos", pdf: "PDF", any: "Tous les fichiers" }

/** Le filtre du sélecteur de fichiers du système pour chaque choix. */
export const fileAcceptInput: Record<FileAccept, string> = { image: "image/*", audio: "audio/*", video: "video/*", pdf: "application/pdf", any: "" }

export type RollupFunction = "count" | "filled" | "empty" | "sum" | "average" | "min" | "max" | "unique" | "checked"

export const rollupLabels: Record<RollupFunction, string> = {
  count: "Nombre de lignes reliées",
  filled: "Nombre de valeurs remplies",
  empty: "Nombre de valeurs vides",
  sum: "Somme",
  average: "Moyenne",
  min: "Minimum",
  max: "Maximum",
  unique: "Valeurs uniques",
  checked: "% coché",
}

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
  /**
   * Colonne liée créée depuis l'éditeur : la colonne qui lui répond dans l'autre index
   * (`tab: "*"` : n'importe quel onglet). Les liens prévus par Eraser n'en ont pas besoin.
   */
  link?: { index: WorldIndexKey; tab: string; column: string }
  /**
   * `mode: "count"` : chaque case compte ses propres icônes (les charges d'un sort),
   * au lieu de remplir une jauge sur un maximum commun.
   */
  gauge?: { style: GaugeStyle; max: number; mode?: "fill" | "count" }
  spells?: { source: SpellSource; category?: "actif" | "passif" }
  /** Nombre : unité, décimales, plage, pourcentage… */
  number?: NumberFormat
  /** Fichier : ce qui est accepté, un seul ou plusieurs. */
  file?: { accept: FileAccept; multiple?: boolean }
  /** Recherche : la colonne de relation à suivre et la colonne à afficher en face. */
  lookup?: { via: string; field: string }
  /** Agrégat : la colonne de relation, la colonne calculée en face et le calcul. */
  rollup?: { via: string; field?: string; fn: RollupFunction }
  /** Colonne masquée : cachée du tableau, qu'on peut montrer d'un clic. */
  hidden?: boolean
  /** Explication de la colonne, montrée au survol de son en-tête. */
  description?: string
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
  if (spec.kind === "gauge" && spec.gauge) labels[0] = `${labels[0]} (${spec.gauge.mode === "count" ? "compteur d’icônes, propre à chaque ligne" : spec.gauge.style === "bar" ? "barre" : spec.gauge.style === "icons" ? "icônes" : "anneau"})`
  if (spec.kind === "spells" && spec.spells) labels[0] = `${labels[0]} (${spec.spells.source === "class" ? "sorts de classe" : spec.spells.source === "creature" ? "sorts de créature" : "tous les sorts"})`
  if (spec.kind === "file" && spec.file) labels[0] = `${labels[0]} (${fileAcceptLabels[spec.file.accept].toLocaleLowerCase("fr")}, ${spec.file.multiple ? "plusieurs" : "un seul"})`
  if (spec.kind === "number" && spec.number) {
    const details = [
      spec.number.unit && spec.number.unit !== "none" ? { money: "monnaie", distance: "distance", weight: "poids" }[spec.number.unit] : "",
      spec.number.range ? "plage" : "",
      spec.number.percent ? "%" : "",
    ].filter(Boolean)
    if (details.length) labels[0] = `${labels[0]} (${details.join(", ")})`
  }
  if (spec.kind === "rollup" && spec.rollup) labels[0] = `${labels[0]} (${rollupLabels[spec.rollup.fn].toLocaleLowerCase("fr")})`
  if (spec.hidden) labels.push("Masquée")
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

/** Colonne calculée par Eraser : rien ne s'y saisit ni ne s'y colle. */
export function isComputedSpec(spec: IndexColumnSpec) {
  return spec.kind === "lookup" || spec.kind === "rollup" || spec.kind === "auto-links"
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
  if (isIdHeader(header)) return { kind: "id", hidden: true }
  const names = new Set(objectNameHeaders.map(foldName))
  const nameHeader = headers.find((candidate) => names.has(foldName(candidate)))
  if (nameHeader && foldName(nameHeader) === folded) return { kind: "name", also: ["rich"] }
  if (["image", "illustration", "url image", "icone", "icon"].includes(folded)) return { kind: "file", file: { accept: "image" } }
  if (["prix", "valeur", "cout"].includes(folded)) return { kind: "number", number: { unit: "money", defaultUnit: "PO" } }
  if (["actif", "active", "disponible"].includes(folded)) return { kind: "checkbox", emptyChecked: true }
  return { kind: "rich" }
}

/**
 * Le résultat d'un Agrégat : `count` lignes reliées, `values` la colonne d'en face.
 * `format` : le format de nombre de cette colonne (un total de prix reste en PO/PC/PN).
 */
export function computeRollup(fn: RollupFunction, count: number, values: string[], format: NumberFormat = {}) {
  const filled = values.filter((value) => value.trim())
  if (fn === "count") return String(count)
  if (fn === "filled") return String(filled.length)
  if (fn === "empty") return String(values.length - filled.length)
  if (fn === "unique") return [...new Set(filled.map((value) => value.trim()))].join(", ")
  if (fn === "checked") return values.length ? `${Math.round((values.filter((value) => isCheckedValue(value)).length / values.length) * 100)} %` : ""
  const numbers = filled.map((value) => parseIndexNumber(value, format)).filter((parsed): parsed is NonNullable<typeof parsed> => Boolean(parsed))
  if (!numbers.length) return ""
  const bases = numbers.map((parsed) => parsed.base)
  const base = fn === "sum" ? bases.reduce((total, value) => total + value, 0)
    : fn === "average" ? bases.reduce((total, value) => total + value, 0) / bases.length
    : fn === "min" ? Math.min(...bases) : Math.max(...bases)
  return formatIndexNumber({ base, unit: numbers[0].unit }, format)
}
