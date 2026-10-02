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
  | "tab-sort"
  | "file"
  | "color"
  | "lookup"
  | "rollup"
  | "formula"
  | "random"
  | "actions"
  | "spells"
  | "gauge"
  | "number"
  | "archived"

/** Les familles de types, dans l'ordre où l'éditeur les propose. */
export const kindGroups = ["Saisie", "Listes et relations", "Calculs", "Jeu", "Médias", "Système"] as const
export type KindGroup = (typeof kindGroups)[number]

type KindInfo = {
  label: string
  /** Quelques mots pour la liste des types de l'éditeur : ce qui le distingue des autres. */
  short?: string
  /** Une phrase : ce que fait le type. */
  description: string
  group: KindGroup
  /** Proposé dans « Modifier » (les autres sont posés par Eraser). */
  creatable: boolean
  /** Ce qu'on peut régler, pour le guide « ? ». */
  settings?: string[]
  /** Exemple d'usage, pour le guide. */
  example?: string
}

export const indexColumnKinds: Record<IndexColumnKind, KindInfo> = {
  "rich": { label: "Texte", short: "Du texte libre, mis en forme.", group: "Saisie", creatable: true, description: "Du texte libre. Chaque case garde sa mise en forme (gras, couleurs, listes, liens…), sauf si la colonne a un style imposé.", settings: ["Style imposé : toute la colonne prend le même style, et la mise en forme propre à chaque case est retirée."], example: "Description, Histoire, Note." },
  "fixed": { label: "Texte", group: "Saisie", creatable: false, description: "Du texte au style imposé (ancien réglage « Affichage fixe »)." },
  "name": { label: "Nom formulaire", group: "Saisie", creatable: false, description: "Ancien type « Nom » : tous les noms sont maintenant des Noms formulaires." },
  "name-form": { label: "Nom formulaire", group: "Saisie", creatable: false, description: "Le nom de la ligne, qui ouvre sa fiche (le formulaire complet de la ligne) d'un clic. On le modifie dans la fiche.", example: "Les créatures, les PNJ ; les campagnes et personnages ouvrent leur page." },
  "id": { label: "Identifiant", group: "Système", creatable: false, description: "Identifiant unique, généré par Eraser. Il relie la ligne au reste de l'application ; il ne se modifie pas." },
  "linked": { label: "Colonne liée ↔", short: "Des noms d’un autre index, et l’autre index se remplit en retour (double sens).", group: "Listes et relations", creatable: true, description: "Des noms d'un autre index (ou du même), séparés par des virgules. La colonne d'en face se remplit toute seule, et un nom absent crée sa ligne.", settings: ["Index lié et onglet.", "Colonne qui répond en face (créée si elle n'existe pas)."], example: "Lieux ↔ Peuples : ajouter « Elfes » à une ville ajoute la ville aux Elfes." },
  "choice": { label: "Liste", short: "Des choix que tu définis ici, avec leurs couleurs.", group: "Listes et relations", creatable: true, description: "Un ou plusieurs choix dans une liste, chacun avec sa couleur. Remplace les étiquettes et les statuts.", settings: ["Options : valeur, couleur, groupe.", "Choix multiple.", "Ajout libre : une valeur hors liste est acceptée.", "Groupes (statut) : « À faire », « En cours », « Fini »…"], example: "Rareté, Comportement, Statut d'une quête." },
  "linked-choice": { label: "Liste liée", short: "Des noms pris dans un autre index (sens unique).", group: "Listes et relations", creatable: true, description: "Un ou plusieurs noms pris dans un autre index. Un nom absent y crée sa ligne, même collé.", settings: ["Index et onglet d'où viennent les noms.", "Choix multiple."], example: "Le Peuple d'un PNJ." },
  "checkbox": { label: "Case à cocher", short: "Oui ou non.", group: "Saisie", creatable: true, description: "Oui ou non. Écrit « Oui » ou « Non » dans Sheets.", example: "Dressable, Important, Découvert." },
  "auto-links": { label: "Liens automatiques", group: "Système", creatable: false, description: "Calculée par Eraser : chaque élément trouvé ailleurs devient un lien (campagnes d'un PNJ…). Rien à saisir." },
  "ranked-links": { label: "Liens classés", group: "Système", creatable: false, description: "Des pastilles reliées à d'autres éléments, chacune avec son rang (« Classes et rangs » des sorts)." },
  "tab": { label: "Onglet", group: "Système", creatable: false, description: "L'onglet de la ligne dans la vue « Tout » ; le changer la déplace." },
  "tab-sort": { label: "Rangement en onglets", short: "Range la ligne dans l’onglet qui porte sa valeur ; une valeur nouvelle crée l’onglet.", group: "Listes et relations", creatable: true, description: "La valeur de la case est le nom d'un onglet de l'index : la ligne y est rangée. Choisir une autre valeur la déplace dans cet onglet ; une valeur qui n'est pas encore un onglet le crée, avec les mêmes colonnes.", example: "Le Type d'un lieu : « Villes », « Pays », « Régions »… chaque lieu va dans l'onglet de son type." },
  "file": { label: "Fichier", short: "Image, son, PDF… un ou plusieurs (galerie).", group: "Médias", creatable: true, description: "Un ou plusieurs fichiers importés dans le Drive, ou des adresses collées. Une galerie, c'est un Fichier « images, plusieurs ».", settings: ["Fichiers acceptés : images, sons, vidéos, PDF ou tous.", "Un seul ou plusieurs (galerie)."], example: "Portrait, Carte du lieu, Thème musical." },
  "color": { label: "Couleur", short: "Une couleur.", group: "Saisie", creatable: true, description: "Une couleur, choisie dans une palette ou par son code (#aa3355).", example: "Couleur d'une faction sur la carte." },
  "lookup": { label: "Recherche", short: "Affiche une info des lignes liées.", group: "Calculs", creatable: true, description: "Affiche, en face, une colonne des lignes reliées par une relation (colonne liée ou liste d'un index). Rien à saisir.", settings: ["Relation à suivre.", "Colonne à afficher en face."], example: "La région de chaque peuple d'un lieu." },
  "rollup": { label: "Agrégat", short: "Calcule sur les lignes liées : nombre, somme, moyenne…", group: "Calculs", creatable: true, description: "Calcule sur les lignes reliées : nombre, somme, moyenne, minimum, maximum, valeurs uniques, % coché… Rien à saisir.", settings: ["Relation à suivre.", "Colonne d'en face (facultative pour compter).", "Calcul."], example: "Le nombre de villes d'un peuple, la somme des prix d'un équipement." },
  "formula": { label: "Formule", short: "Calculée à partir des autres colonnes de la ligne.", group: "Calculs", creatable: true, description: "Une valeur calculée à partir des autres colonnes de la ligne : {Prix} * 2, SI({Rang} >= 3; \"Élite\"; \"Commun\")… Rien à saisir. Le bouton « ? » détaille toutes les fonctions.", settings: ["La formule.", "Le type du résultat : texte, nombre (avec son format), case à cocher, liste, couleur."], example: "Prix de revente = {Prix} / 2 ; Danger = SI({Rang} >= 4; \"Mortel\"; \"\")." },
  "random": { label: "Aléatoire", short: "Un tirage : dés, liste pondérée, ligne d’un index…", group: "Jeu", creatable: true, description: "Un tirage au sort : un nombre, des dés, une option d'une liste pondérée, une ligne d'un index (filtrée et pondérée), une valeur d'une autre colonne… Le résultat est gardé dans la case, figé ou relançable.", settings: ["Ce qu'on tire.", "Nombre de tirages, sans doublon ou non.", "Figé après le premier tirage, ou relançable."], example: "Rencontre du jour (une créature de la région), Météo, Butin 2d6 PO." },
  "actions": { label: "Boutons", short: "Des boutons qui enchaînent des actions.", group: "Jeu", creatable: true, description: "Un ou plusieurs boutons par case. Chaque bouton enchaîne des actions : ouvrir, changer une valeur, +1/−1, dupliquer, créer ailleurs, tirer au sort, envoyer dans le chat… Les valeurs et conditions peuvent être des formules.", settings: ["Boutons : libellé, icône, couleur, confirmation, condition d'affichage.", "Étapes de chaque bouton, exécutées dans l'ordre."], example: "« −1 charge », « Lancer l'attaque », « Créer un PNJ de ce peuple »." },
  "spells": { label: "Sélecteur de sorts", short: "Des sorts, affichés en cartes.", group: "Listes et relations", creatable: true, description: "Des sorts des classes, des créatures ou des deux, gardés par leur nom et affichés en cartes.", settings: ["Sorts proposés : classes, créatures ou les deux.", "Catégorie : tous, actifs ou passifs."] },
  "gauge": { label: "Jauge", short: "Un nombre en icônes, barre ou anneau.", group: "Saisie", creatable: true, description: "Un nombre affiché en icônes à cliquer, en barre ou en anneau. La jauge peut avoir le même maximum pour toute la colonne, être propre à chaque case, ou prendre son maximum dans une autre colonne.", settings: ["Affichage : icônes, barre, anneau.", "Maximum : le même pour la colonne, propre à chaque case, ou lu dans une autre colonne.", "Icône (une centaine au choix, ou un émoji) et couleur.", "Couleur selon le niveau (rouge quand c'est bas)."], example: "Charges d'un sort (propre à chaque case), Note sur 5 (même maximum), PV sur « PV max » (autre colonne)." },
  "number": { label: "Nombre", short: "Un nombre : unité, monnaie, plage, pourcentage.", group: "Saisie", creatable: true, description: "Un nombre, trié sur sa vraie valeur : unité (monnaie PO/PC/PN, distance, poids), décimales, texte avant/après, pourcentage, plage « 2–5 ».", settings: ["Unité et unité par défaut.", "Décimales.", "Texte avant / après.", "Pourcentage.", "Plage."], example: "Prix « 1,5 PO », Portée « 2–5 m », Poids « 12 kg »." },
  "archived": { label: "Archivée", group: "Système", creatable: false, description: "Ancienne colonne gardée dans Sheets, jamais affichée ni modifiée." },
}

/**
 * D'où une liste liée tire ses noms. Par défaut, tous les onglets de l'index (un lieu
 * peut être une ville comme un pays) ; `onlyTab` les limite à l'onglet nommé, et
 * `exclude` écarte les lignes dont une colonne vaut une valeur (les caractéristiques
 * secondaires, pour la Caractéristique d'une compétence).
 */
export type ChoiceSource = { index: WorldIndexKey; tab: string; onlyTab?: boolean; exclude?: { column: string; value: string } }

export type ChoiceOption = {
  value: string
  /** Information affichée au survol de l'option. */
  hint?: string
  /** Anciennes orthographes reconnues et corrigées vers `value`. */
  aliases?: string[]
  /** Couleur de la pastille (code CSS). */
  color?: string
  /** Groupe de l'option (« À faire », « En cours », « Fini »…). */
  group?: string
}

export type GaugeStyle = "bar" | "icons" | "ring"

/**
 * Jusqu'où va la jauge. « column » : le même maximum pour toute la colonne (la case
 * dit combien est rempli) ; « cell » : chaque case a sa propre jauge (le nombre tapé
 * est le nombre d'icônes, comme les charges d'un sort) ; « from-column » : le maximum
 * est lu dans une autre colonne de la ligne (« PV » sur « PV max »).
 */
export type GaugeScale = "column" | "cell" | "from-column"

export type GaugeSettings = {
  style: GaugeStyle
  max: number
  /** Ancien réglage : « count » équivaut à `scale: "cell"`. */
  mode?: "fill" | "count"
  scale?: GaugeScale
  /** `scale: "from-column"` : la colonne qui donne le maximum. */
  maxColumn?: string
  /** Icône des jauges en icônes (voir `gaugeIcons` côté interface), ou « emoji ». */
  icon?: string
  /** Émoji ou caractère utilisé à la place d'une icône. */
  emoji?: string
  /** Couleur de remplissage (code CSS). */
  color?: string
  /** Couleur des traits d'une icône pleine (l'horloge, le sourire…). Sans réglage : clairs. */
  strokeColor?: string
  /**
   * Icône et couleur choisies ligne par ligne : chaque case garde les siennes après son
   * nombre (« 2|skull|#b9504e »). Sans choix, celles de la colonne.
   */
  perRow?: boolean
  /** Couleur selon le niveau : rouge quand c'est bas, vert quand c'est plein. */
  levels?: boolean
  /** Jauge propre à chaque case : la valeur spéciale « sans limite » (« ✦ » des charges). */
  unlimited?: string
}

/** L'icône et la couleur propres à une case de jauge (réglage « par ligne »). */
export type GaugeRowStyle = { icon?: string; emoji?: string; color?: string }

const GAUGE_EMOJI = /[^\p{L}\p{N}\s_-]/u

/** « 2|skull|#b9504e » → le nombre (texte) et le style de la case. */
export function parseGaugeCell(value: string): { count: string; style: GaugeRowStyle } {
  const [count = "", look = "", color = ""] = value.split("|").map((part) => part.trim())
  const style: GaugeRowStyle = {}
  if (look) { if (GAUGE_EMOJI.test(look)) style.emoji = look; else style.icon = look }
  if (/^#[0-9a-f]{3,8}$/i.test(color)) style.color = color
  return { count, style }
}

/** Le nombre et le style d'une case, réunis dans sa valeur (le nombre reste en tête : tri et formules le lisent). */
export function formatGaugeCell(count: string, style: GaugeRowStyle) {
  const look = style.emoji?.trim() || style.icon?.trim() || ""
  const color = style.color?.trim() || ""
  if (!look && !color) return count
  return [count, look, color].join("|").replace(/\|+$/, "")
}

export function gaugeScaleOf(gauge: GaugeSettings | undefined): GaugeScale {
  return gauge?.scale ?? (gauge?.mode === "count" ? "cell" : "column")
}

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

/**
 * Le style imposé d'une colonne. Posé sur une colonne Texte, il remplace la mise en
 * forme de chaque case (retirée à l'enregistrement) ; sur les autres types, il change
 * seulement leur apparence. Un objet vide : texte sans mise en forme, style normal.
 */
export type ColumnStyle = {
  bold?: boolean
  italic?: boolean
  underline?: boolean
  strike?: boolean
  /** Couleur du texte (code CSS) ; « muted » : discret. */
  color?: string
  /** Couleur de fond de la case. */
  background?: string
  size?: "sm" | "md" | "lg" | "xl"
  font?: "sans" | "serif" | "mono" | "display"
  letterCase?: "upper" | "lower" | "title"
  align?: "left" | "center" | "right"
  /** Ancien réglage : le style s'ajoute sans retirer la mise en forme des cases. */
  keepCellFormatting?: boolean
}

/** Où la colonne s'affiche : dans le tableau et la fiche, le tableau seulement, la fiche seulement. */
export type ColumnPlacement = "both" | "table" | "sheet"

export const placementLabels: Record<ColumnPlacement, string> = {
  both: "Tableau et formulaire",
  table: "Tableau seulement",
  sheet: "Formulaire seulement",
}

/** Le type du résultat d'une formule. */
export type FormulaResult = "auto" | "text" | "number" | "checkbox" | "list" | "color"

export const formulaResultLabels: Record<FormulaResult, string> = {
  auto: "Automatique",
  text: "Texte",
  number: "Nombre",
  checkbox: "Case à cocher",
  list: "Liste de pastilles",
  color: "Couleur",
}

/** Ce qu'une colonne Aléatoire tire au sort. */
export type RandomSource = "number" | "dice" | "list" | "index" | "column" | "formula"

export const randomSourceLabels: Record<RandomSource, string> = {
  number: "Un nombre entre deux bornes",
  dice: "Des dés (2d6+1…)",
  list: "Une option d'une liste (pondérée)",
  index: "Une ligne d'un index (filtrée, pondérée)",
  column: "Une des valeurs d'une autre colonne de la ligne",
  formula: "Le résultat d'une formule",
}

export type RandomSettings = {
  source: RandomSource
  min?: number
  max?: number
  /** Nombre : décimales (0 : entier). */
  decimals?: number
  dice?: string
  options?: Array<{ value: string; weight?: number }>
  /** Ligne d'un index : l'index, l'onglet (« * » : tous), une condition et une colonne de poids. */
  index?: { index: WorldIndexKey | "self"; tab: string; filter?: string; weightColumn?: string; field?: string }
  column?: string
  formula?: string
  /** Nombre de tirages. */
  count?: number
  /** Plusieurs tirages : jamais deux fois la même valeur. */
  unique?: boolean
  /** « fixed » : figé après le premier tirage ; « reroll » : relançable à volonté. */
  mode?: "fixed" | "reroll"
}

/** Une étape d'un bouton de la colonne Boutons. Les textes marqués « formule » en acceptent une. */
export type ActionStep =
  | { type: "open-sheet" }
  | { type: "open-url"; url: string }
  | { type: "open-linked"; column: string }
  | { type: "open-index"; index: string }
  | { type: "set"; column: string; value: string }
  | { type: "increment"; column: string; amount: string; min?: string; max?: string }
  | { type: "toggle"; column: string }
  | { type: "clear"; column: string }
  | { type: "roll"; column: string }
  | { type: "duplicate" }
  | { type: "delete" }
  | { type: "move"; tab: string }
  | { type: "create"; index: WorldIndexKey; tab: string; values: Record<string, string>; open?: boolean }
  | { type: "copy"; value: string }
  | { type: "copy-card" }
  | { type: "notify"; message: string }
  | { type: "chat"; message: string; audience?: "public" | "gm" }
  | { type: "campaign-inventory" }

export type ActionButton = {
  id: string
  label: string
  icon?: string
  color?: string
  /** Seulement l'icône, le libellé au survol. */
  iconOnly?: boolean
  /** Message de confirmation (formule possible) ; vide : pas de confirmation. */
  confirm?: string
  /** Condition d'affichage (formule) ; vide : toujours affiché. */
  condition?: string
  steps: ActionStep[]
}

export type IndexColumnSpec = {
  kind: IndexColumnKind
  /** Types secondaires (ancien réglage) : « Nom » + « Affichage fixe »… */
  also?: IndexColumnKind[]
  /** Ancien réglage : colonne de la fiche seulement (voir `placement`). */
  form?: boolean
  /** Où la colonne s'affiche. */
  placement?: ColumnPlacement
  /** Ancien réglage : apparence imposée (voir `style`). */
  display?: "bold" | "skills" | "muted"
  /** Style imposé à toute la colonne. */
  style?: ColumnStyle
  /** Liste : les choix. */
  options?: ChoiceOption[]
  /** Liste : une valeur hors liste peut être saisie (ou, pour un index, créée). */
  allowCustom?: boolean
  /** Liste : plusieurs choix par case. */
  multiple?: boolean
  /** Liste : les groupes d'options, dans l'ordre (statut). */
  groups?: Array<{ name: string; color?: string }>
  /** Liste venant d'un index : l'index et l'onglet d'où viennent les noms. */
  source?: ChoiceSource
  /**
   * Colonne liée créée depuis l'éditeur : la colonne qui lui répond dans l'autre index
   * (`tab: "*"` : n'importe quel onglet). Les liens prévus par Eraser n'en ont pas besoin.
   */
  link?: { index: WorldIndexKey; tab: string; column: string }
  gauge?: GaugeSettings
  spells?: { source: SpellSource; category?: "actif" | "passif" }
  /** Nombre (et résultat numérique d'une formule) : unité, décimales, plage, pourcentage… */
  number?: NumberFormat
  /** Fichier : ce qui est accepté, un seul ou plusieurs. */
  file?: { accept: FileAccept; multiple?: boolean }
  /** Recherche : la colonne de relation à suivre et la colonne à afficher en face. */
  lookup?: { via: string; field: string }
  /** Agrégat : la colonne de relation, la colonne calculée en face et le calcul. */
  rollup?: { via: string; field?: string; fn: RollupFunction }
  /** Formule : l'expression et le type du résultat. */
  formula?: { expression: string; result?: FormulaResult }
  /** Aléatoire : ce qu'on tire. */
  random?: RandomSettings
  /** Boutons : les boutons de chaque case. */
  actions?: ActionButton[]
  /** Colonne masquée : cachée du tableau, qu'on peut montrer d'un clic. */
  hidden?: boolean
  /** Explication de la colonne, montrée au survol de son en-tête. */
  description?: string
  /** Case à cocher : une cellule vide compte comme cochée (« Actif » d'un objet). */
  emptyChecked?: boolean
  /** Nombre : bornes. */
  min?: number
  max?: number
  /** Ligne d'onglet du schéma (`kind: "tab"`) : la place de l'onglet dans l'index. */
  position?: number
}

/** Tous les types d'une colonne, principal d'abord. */
export function kindsOf(spec: IndexColumnSpec): IndexColumnKind[] {
  return [spec.kind, ...(spec.also ?? []).filter((kind) => kind !== spec.kind)]
}

const displayStyles: Record<NonNullable<IndexColumnSpec["display"]>, ColumnStyle> = {
  bold: { bold: true },
  skills: { bold: true, color: "#b3261e" },
  muted: { color: "muted" },
}

/**
 * La forme actuelle d'un réglage de colonne. Les anciens réglages restent lisibles :
 * « Affichage fixe » devient un style imposé, « Nom formulaire » un Nom qui ouvre la
 * fiche, « Formulaire » l'emplacement « Fiche seulement ».
 */
export function normalizeSpec(input: IndexColumnSpec): IndexColumnSpec {
  const spec: IndexColumnSpec = { ...input }
  const also = spec.also ?? []
  const fixed = spec.kind === "fixed" || also.includes("fixed")
  const legacyStyle = spec.display ? displayStyles[spec.display] : undefined
  if (spec.kind === "fixed") spec.kind = "rich"
  // Tous les noms ouvrent la fiche de leur ligne : l'ancien « Nom » est un Nom formulaire.
  if (spec.kind === "name") spec.kind = "name-form"
  const isName = spec.kind === "name-form"
  if (fixed) spec.style = { ...(isName ? { bold: true } : {}), ...legacyStyle, ...spec.style }
  // « Description » des sorts : grisée, mais chaque case garde sa mise en forme.
  else if (legacyStyle) spec.style = { ...legacyStyle, keepCellFormatting: true, ...spec.style }
  // Un nom sans mise en forme propre (« Nom » des index du monde) est en gras.
  if (isName && !spec.style && !also.includes("rich")) spec.style = { bold: true }
  if (spec.form && !spec.placement) spec.placement = "sheet"
  if (spec.gauge?.mode === "count" && !spec.gauge.scale) spec.gauge = { ...spec.gauge, scale: "cell" }
  delete spec.display
  delete spec.form
  const rest = also.filter((kind) => kind !== "fixed" && kind !== "rich" && kind !== spec.kind)
  if (rest.length) spec.also = rest
  else delete spec.also
  return spec
}

export function placementOf(spec: IndexColumnSpec): ColumnPlacement {
  return spec.placement ?? (spec.form ? "sheet" : "both")
}

/** Un clic sur le nom ouvre la fiche de la ligne (type Nom formulaire). */
export function opensSheet(spec: IndexColumnSpec) {
  return spec.kind === "name-form"
}

/** Deux types qui gardent exactement la même donnée : passer de l'un à l'autre ne casse rien. */
export function isSameDataKind(from: IndexColumnKind, to: IndexColumnKind) {
  const families: IndexColumnKind[][] = [["name", "name-form"], ["rich", "fixed"]]
  return from === to || families.some((family) => family.includes(from) && family.includes(to))
}

/** Les deux sortes de listes (options écrites ici, noms d'un index) sont un seul type « Liste ». */
export function isListSpec(spec: IndexColumnSpec) {
  return spec.kind === "choice" || spec.kind === "linked-choice"
}

/** « Liste (plusieurs choix) · Fiche seulement » : ce qu'affiche l'en-tête au survol. */
export function columnTypeLabel(input: IndexColumnSpec) {
  const spec = normalizeSpec(input)
  const details: string[] = []
  if (spec.kind === "gauge" && spec.gauge) {
    const scale = gaugeScaleOf(spec.gauge)
    details.push(spec.gauge.style === "bar" ? "barre" : spec.gauge.style === "icons" ? "icônes" : "anneau")
    details.push(scale === "cell" ? "propre à chaque case" : scale === "from-column" ? `maximum : ${spec.gauge.maxColumn || "?"}` : `sur ${spec.gauge.max}`)
  }
  if (spec.kind === "spells" && spec.spells) details.push(spec.spells.source === "class" ? "sorts de classe" : spec.spells.source === "creature" ? "sorts de créature" : "tous les sorts")
  if (spec.kind === "file" && spec.file) details.push(fileAcceptLabels[spec.file.accept].toLocaleLowerCase("fr"), spec.file.multiple ? "plusieurs" : "un seul")
  if (spec.kind === "number" && spec.number) {
    if (spec.number.unit && spec.number.unit !== "none") details.push({ money: "monnaie", distance: "distance", weight: "poids" }[spec.number.unit])
    if (spec.number.range) details.push("plage")
    if (spec.number.percent) details.push("%")
  }
  if (isListSpec(spec)) {
    if (spec.multiple) details.push("plusieurs choix")
    if (spec.allowCustom && spec.kind === "choice") details.push("ajout libre")
  }
  if (spec.kind === "rollup" && spec.rollup) details.push(rollupLabels[spec.rollup.fn].toLocaleLowerCase("fr"))
  if (spec.kind === "formula" && spec.formula?.result && spec.formula.result !== "auto") details.push(formulaResultLabels[spec.formula.result].toLocaleLowerCase("fr"))
  if (spec.kind === "random" && spec.random) details.push(spec.random.mode === "fixed" ? "figé" : "relançable")
  if (spec.kind === "actions") details.push(`${spec.actions?.length ?? 0} bouton${(spec.actions?.length ?? 0) > 1 ? "s" : ""}`)
  const labels = [`${indexColumnKinds[spec.kind].label}${details.length ? ` (${details.join(", ")})` : ""}`]
  // Types doubles : « Jauge (icônes) · Nombre », « Nom · Style imposé », « Liste · Formulaire ».
  for (const kind of spec.also ?? []) labels.push(indexColumnKinds[kind].label)
  if (spec.style && !spec.style.keepCellFormatting) labels.push("Style imposé")
  const placement = placementOf(spec)
  if (placement === "sheet") labels.push("Formulaire")
  if (placement === "table") labels.push("Tableau seulement")
  if (spec.hidden) labels.push("Masquée")
  return labels.join(" · ")
}

/** Le texte d'une colonne de ce type est-il enregistré avec sa mise en forme ? */
export function isRichSpec(input: IndexColumnSpec) {
  const spec = normalizeSpec(input)
  if (spec.style && !spec.style.keepCellFormatting) return false
  return spec.kind === "rich" || spec.kind === "linked" || spec.kind === "name" || spec.kind === "name-form"
}

/** La colonne apparaît-elle dans le tableau ? */
export function isGridSpec(spec: IndexColumnSpec) {
  return spec.kind !== "archived" && placementOf(spec) !== "sheet"
}

/** La colonne apparaît-elle dans la fiche (et le formulaire d'ajout) ? */
export function isSheetSpec(spec: IndexColumnSpec) {
  return spec.kind !== "archived" && placementOf(spec) !== "table"
}

/** Colonne calculée par Eraser : rien ne s'y saisit ni ne s'y colle. */
export function isComputedSpec(spec: IndexColumnSpec) {
  return spec.kind === "lookup" || spec.kind === "rollup" || spec.kind === "auto-links" || spec.kind === "formula" || spec.kind === "actions"
}

/**
 * Les valeurs d'une case à plusieurs choix. Le séparateur est la virgule, mais une
 * option qui en contient une (« Bluff, mensonge ») reste entière.
 */
export function splitListValue(value: string, options: ChoiceOption[] = []) {
  const tokens = value.split(/\s*[,;\n]\s*/).map((token) => token.trim()).filter(Boolean)
  const known = new Set(options.map((option) => choiceKey(option.value)))
  const result: string[] = []
  for (let index = 0; index < tokens.length; index += 1) {
    let current = tokens[index]
    for (let end = tokens.length - 1; end > index; end -= 1) {
      const candidate = tokens.slice(index, end + 1).join(", ")
      if (known.has(choiceKey(candidate))) { current = candidate; index = end; break }
    }
    result.push(current)
  }
  return result
}

export function joinListValue(values: string[]) {
  return values.map((value) => value.trim()).filter(Boolean).join(", ")
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
  if (nameHeader && foldName(nameHeader) === folded) return { kind: "name-form", also: ["rich"] }
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
