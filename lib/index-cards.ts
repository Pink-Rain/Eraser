/**
 * Les cartes d'un onglet d'index, réglées dans « Modifier » › Cartes sans écrire de code.
 *
 * Une carte, c'est une forme (image en haut, à gauche, en fond… ; couleur d'accent ;
 * cadre ; largeur dans la grille) et une pile de blocs (titre, ligne composée de
 * plusieurs colonnes, texte, pastilles, jauge, tuiles de valeurs, image, détails
 * repliables…). Chaque bloc nomme les colonnes qu'il affiche : une colonne renommée suit,
 * une colonne disparue est simplement sautée. Un onglet peut avoir plusieurs cartes.
 *
 * Les index qui avaient déjà des cartes codées à la main (personnages, campagnes,
 * classes, sorts, PNJ, succès…) partent avec ces cartes, refaites avec ce moteur.
 *
 * Sans dépendance : l'éditeur, la grille de cartes, le serveur et les tests s'en servent.
 * Gardé sur le serveur partagé d'Eraser (lib/index-cards-store.ts), jamais dans Google Sheets.
 */
import { cleanActionStep } from "@/lib/index-actions"
import { foldName, isNameColumnSpec, normalizeSpec, type ActionButton, type ActionStep, type IndexColumnSpec } from "@/lib/index-columns"
import { cleanViewRoles, type ViewRole } from "@/lib/view-roles"

// ---------------------------------------------------------------------------
// Le modèle
// ---------------------------------------------------------------------------

/** Une couleur de texte : normale, discrète, celle de l'accent, celle de la colonne (style, choix), ou un code. */
export type CardTone = "default" | "muted" | "accent" | "column" | (string & {})
export type CardTextSize = "xs" | "sm" | "md" | "lg" | "xl"
export type CardAspect = "1/1" | "4/5" | "3/4" | "2/3" | "4/3" | "16/9" | "16/6" | "2/1" | "3/1"
export type CardFit = "cover" | "contain"
export type CardShape = "rect" | "rounded" | "circle"

/** Un morceau d'une ligne : une colonne, avec ce qu'on écrit avant et après sa valeur. */
export type CardPart = { column: string; prefix?: string; suffix?: string; tone?: CardTone; bold?: boolean; italic?: boolean }

export type CardBlockType = "title" | "line" | "text" | "pills" | "field" | "bar" | "stats" | "image" | "value" | "divider" | "details" | "zone" | "space" | "buttons"

/**
 * Un bouton du bloc « Boutons » : un bouton de la colonne Boutons (libellé, icône, couleur,
 * confirmation, condition, étapes), avec les rôles qui le voient et peuvent s'en servir
 * (aucun : tout le monde) et son allure.
 */
export type CardButton = ActionButton & { roles?: ViewRole[]; look?: "solid" | "outline" | "ghost" }

/** Au clic sur la carte : sa fiche (d'office), un formulaire choisi ici, sa page, rien. La forme qui contient la carte (une vue, un bloc de page) l'emporte quand elle règle le sien. */
export type CardClick = "sheet" | "form" | "page" | "none"
export const cardClicks: Array<{ value: CardClick; label: string; hint: string }> = [
  { value: "sheet", label: "Ouvrir sa fiche", hint: "Son formulaire à l’étoile, dans une fenêtre, là où l’on est (d’office)." },
  { value: "form", label: "Ouvrir un de ses formulaires", hint: "Le formulaire choisi ci-dessous, dans une fenêtre, là où l’on est (index ou page)." },
  { value: "page", label: "Ouvrir la page", hint: "La page de la ligne, si l’index en a une (sinon sa fiche)." },
  { value: "none", label: "Rien", hint: "La carte ne réagit pas au clic (ses boutons, si elle en a, restent)." },
]

/**
 * Un bloc de la carte. Un seul type d'objet, dont chaque type de bloc lit les réglages qui
 * le concernent (l'éditeur ne montre que ceux-là).
 */
export type CardBlock = {
  id: string
  type: CardBlockType
  /** Une icône devant le titre, la ligne, le texte, le libellé (nom d'icône ou émoji). */
  icon?: string
  /** Titre, texte, champ, jauge, image, valeur : la colonne. */
  column?: string
  /** Pastilles, tuiles, détails : les colonnes. */
  columns?: string[]
  /** Ligne : ses morceaux, et ce qui les sépare. */
  parts?: CardPart[]
  separator?: string
  /**
   * Le libellé écrit. Vide : le nom de la colonne pour un champ (et pour un texte, une valeur ou
   * des pastilles avec « showLabel ») ; rien pour une jauge ; « Détails » pour les détails.
   */
  label?: string
  /** Texte, valeur, pastilles : écrire le nom de la colonne au-dessus. */
  showLabel?: boolean
  size?: CardTextSize
  tone?: CardTone
  font?: "display" | "sans"
  bold?: boolean
  italic?: boolean
  caps?: boolean
  /** Nombre de lignes au plus (0 : tout). */
  clamp?: number
  /** Texte : un trait à la couleur de l'accent sur sa gauche, comme une citation. */
  quote?: boolean
  align?: "left" | "center" | "right"
  /** Titre : des pastilles juste après le titre (le type d'un sort…). */
  badges?: string[]
  /** Jauge : le maximum (nombre), ou la colonne qui le donne ; montrer « 3 / 10 ». */
  max?: number
  maxColumn?: string
  showValue?: boolean
  unit?: string
  /** Pastilles : douces, pleines ou au contour ; empilées (une par ligne) ou côte à côte. */
  pill?: "soft" | "solid" | "outline"
  stacked?: boolean
  /** Image : format, recadrage, forme et largeur (en % de la carte). */
  aspect?: CardAspect
  fit?: CardFit
  shape?: CardShape
  width?: number
  /** Image, zone : les proportions libres (largeur ÷ hauteur, 0,3 à 4) et l'arrondi des coins (en pixels). */
  ratio?: number
  radiusPx?: number
  /** Zone de couleur, espace : la hauteur (en pixels). */
  height?: number
  /** Zone de couleur : son dessin. */
  zone?: "block" | "line" | "pill" | "dot"
  /** Détails : ouverts d'emblée. */
  open?: boolean
  /** Boutons : les boutons, dans l'ordre ; étirés sur toute la largeur. */
  buttons?: CardButton[]
  stretch?: boolean
} & ImageBox

/** Une case d'une ligne de la carte : des blocs côte à côte, chacune sa largeur et son alignement. */
export type CardCell = {
  id: string
  /** Les blocs posés dans la case, de haut en bas (leurs identifiants dans `blocks`). */
  blocks: string[]
  /** La largeur : « auto » (sa taille), « fill » (le reste), ou une part en % de la carte. */
  width?: "auto" | "fill" | number
  align?: "left" | "center" | "right"
  valign?: "top" | "center" | "bottom"
}

/** Une ligne de la carte : ses cases, de gauche à droite. */
export type CardRow = { id: string; cells: CardCell[]; gap?: "none" | "sm" | "md" | "lg" }

export type CardMediaPosition = "top" | "bottom" | "left" | "right" | "background"

/** Un bord de l'élément auquel une image est collée (elle le touche et suit la taille de l'élément). */
export type ImageEdge = "top" | "bottom" | "left" | "right"
export const imageEdges: ImageEdge[] = ["top", "bottom", "left", "right"]

/**
 * La taille libre d'une image, la même partout (cartes, vues, survols) : la largeur et la
 * hauteur en % de la largeur de l'élément (100 / 100 : un carré aussi large que la carte),
 * « hauteur automatique » : celle de l'image ; liées, bouger l'une bouge l'autre ; collée à
 * un ou plusieurs bords.
 */
export type ImageBox = {
  widthPct?: number
  heightPct?: number
  autoHeight?: boolean
  linked?: boolean
  edges?: ImageEdge[]
  /** Sans fond ni cadre derrière l'image (une image détourée, un pictogramme) : rien que l'image. */
  bare?: boolean
}

/** L'image principale de la carte (portrait, bannière, icône…). */
export type CardMedia = {
  column: string
  position: CardMediaPosition
  aspect?: CardAspect
  fit?: CardFit
  shape?: CardShape
  /** Image à gauche ou à droite : sa largeur. */
  size?: "xs" | "sm" | "md" | "lg"
  /** Une icône ou une image absente : un fond à la couleur de l'accent. */
  tint?: boolean
  /** Les proportions libres (largeur ÷ hauteur) et l'arrondi des coins (en pixels). */
  ratio?: number
  radiusPx?: number
  /** À gauche ou à droite : collée en haut et en bas (toute la hauteur), ou seulement en haut, ou en bas. */
  anchor?: "stretch" | "top" | "bottom"
  /** En haut ou en bas : sa hauteur suit ses proportions, ou une hauteur fixe (en pixels). */
  sizing?: "aspect" | "height"
  heightPx?: number
  /** Une marge autour de l'image (sinon collée aux bords). */
  inset?: boolean
} & ImageBox

export type CardWidth = "xs" | "sm" | "md" | "lg" | "xl" | "full"

export type CardTemplate = {
  id: string
  name: string
  /** Au passage de la souris sur la carte (vue Cartes) : cette version du survol de la ligne ; absent : l'étoilée ; « - » : aucun. */
  hover?: string
  /** Au clic sur la carte : absent, sa fiche ; « form » : le formulaire `clickForm` (« principal » : l'étoilé). */
  click?: CardClick
  clickForm?: string
  media?: CardMedia
  /** La couleur d'accent : prise dans une colonne (couleur, choix coloré) et, sinon, celle-ci. */
  accent?: { column?: string; color?: string }
  /** Un liseré à la couleur de l'accent (sous l'image, ou en haut). */
  band?: boolean
  border?: "none" | "subtle" | "accent" | "left" | "top"
  surface?: "card" | "tint" | "glow" | "plain"
  radius?: "sm" | "md" | "lg"
  shadow?: boolean
  align?: "left" | "center"
  density?: "compact" | "normal" | "airy"
  /** La largeur d'une carte dans la grille ; « full » : une carte par ligne (liste). */
  width?: CardWidth
  /** Une petite pastille en haut à droite (« Nouveau », un rang…). */
  corner?: string
  /** Une flèche à droite (ligne de liste). */
  chevron?: boolean
  /** La carte se soulève au survol. */
  lift?: boolean
  blocks: CardBlock[]
  /**
   * La composition libre : des lignes de cases où les blocs sont posés (gauche, centre,
   * droite, pleine largeur…). Sans lignes, les blocs s'empilent de haut en bas. Un bloc
   * qui n'est dans aucune case s'affiche à la suite.
   */
  rows?: CardRow[]
  /** La taille libre : la largeur dans la grille (en rem, 6 à 48), l'arrondi des coins (en pixels). */
  widthRem?: number
  radiusPx?: number
  /** Une hauteur minimale (en pixels), ou des proportions fixes pour toute la carte (largeur ÷ hauteur). */
  minHeightPx?: number
  ratio?: number
  /** Largeur et hauteur liées dans l'éditeur (bouger l'une bouge l'autre : `ratio` les tient). */
  sizeLinked?: boolean
  /** La grille : au plus tant de cartes par ligne ; sur téléphone, une ou deux par ligne. */
  grid?: { max?: number; phone?: 1 | 2 }
}

/**
 * La boîte d'une image principale, nouvelle forme ou déduite des anciens réglages (taille,
 * format, accroche, marge) : le rendu n'a qu'un chemin.
 */
export function mediaBox(media: CardMedia): Required<Pick<ImageBox, "widthPct" | "edges">> & Pick<ImageBox, "heightPct" | "autoHeight"> {
  const side = media.position === "left" || media.position === "right"
  const ratioOf = () => media.ratio ?? (media.aspect ? Number(media.aspect.split("/")[0]) / Number(media.aspect.split("/")[1]) : side ? 1 : 4 / 3)
  if (media.widthPct !== undefined || media.heightPct !== undefined || media.autoHeight || media.edges) {
    const widthPct = media.widthPct ?? (side ? 40 : 100)
    const edges: ImageEdge[] = media.edges ?? (side ? [media.position as ImageEdge, "top"] : [media.position === "bottom" ? "bottom" : "top", "left", "right"])
    return { widthPct, edges, ...(media.autoHeight ? { autoHeight: true } : { heightPct: media.heightPct ?? Math.round(widthPct / ratioOf()) }) }
  }
  if (side) {
    const widthPct = { xs: 20, sm: 30, md: 40, lg: 55 }[media.size ?? "md"]
    const inset = (media.shape && media.shape !== "rect") || media.inset
    const anchor = media.anchor ?? "top"
    const sideEdge = media.position as ImageEdge
    const edges: ImageEdge[] = inset ? [] : anchor === "stretch" ? ["top", "bottom", sideEdge] : anchor === "bottom" ? ["bottom", sideEdge] : ["top", sideEdge]
    return { widthPct, edges, heightPct: anchor === "stretch" ? widthPct : Math.round(widthPct / ratioOf()) }
  }
  const edges: ImageEdge[] = media.inset ? [] : media.position === "background" ? ["top", "bottom", "left", "right"] : [media.position === "bottom" ? "bottom" : "top", "left", "right"]
  const widthPct = media.shape === "circle" ? 50 : 100
  if (media.sizing === "height") return { widthPct, edges, heightPct: Math.round((media.heightPx ?? 160) / 2.4) }
  return { widthPct, edges, heightPct: Math.round(widthPct / ratioOf()) }
}

/** La boîte d'un bloc image, nouvelle forme ou déduite des anciens réglages (largeur en %, format, place). */
export function blockBox(block: CardBlock): Required<Pick<ImageBox, "widthPct" | "edges">> & Pick<ImageBox, "heightPct" | "autoHeight"> {
  const widthPct = block.widthPct ?? block.width ?? 100
  const ratio = block.ratio ?? (block.aspect ? Number(block.aspect.split("/")[0]) / Number(block.aspect.split("/")[1]) : 1)
  const edges = block.edges ?? (block.align === "center" ? [] : block.align === "right" ? ["right"] : ["left"])
  return { widthPct, edges, ...(block.autoHeight ? { autoHeight: true } : { heightPct: block.heightPct ?? Math.round(widthPct / ratio) }) }
}

/** Les cartes d'un onglet, et celle qu'on montre d'abord. */
export type TabCards = { cards: CardTemplate[]; defaultId?: string }

/** Une carte enregistrée sous un nom, pour la reprendre dans un autre onglet ou un autre index. */
export type CardPreset = { id: string; name: string; card: CardTemplate; updatedAt: string }

// ---------------------------------------------------------------------------
// Les choix proposés (avec leurs libellés, pour l'éditeur)
// ---------------------------------------------------------------------------

export const cardBlockTypes: Array<{ value: CardBlockType; label: string; hint: string }> = [
  { value: "title", label: "Titre", hint: "Le nom, en grand, avec des pastilles après si besoin." },
  { value: "line", label: "Ligne composée", hint: "Plusieurs colonnes sur une ligne : « Lame · rang 4 »." },
  { value: "text", label: "Texte", hint: "Une description, un effet : le texte mis en forme, coupé après N lignes." },
  { value: "pills", label: "Pastilles", hint: "Des valeurs en pastilles (mots-clés, type, rareté), aux couleurs de la liste." },
  { value: "field", label: "Libellé : valeur", hint: "« Difficulté ……… Facile » sur une ligne." },
  { value: "bar", label: "Barre de progression", hint: "Un nombre sur un maximum : PV, finition, charges." },
  { value: "stats", label: "Tuiles de valeurs", hint: "Plusieurs nombres en petites tuiles (FOR, DEX…)." },
  { value: "image", label: "Image dans la carte", hint: "Une image ou une icône au milieu du contenu." },
  { value: "value", label: "Valeur telle quelle", hint: "Une colonne affichée selon son type : jauge, icône, case, galerie…" },
  { value: "details", label: "Détails repliables", hint: "Des textes cachés sous un titre, qu'on déplie (notes, lore)." },
  { value: "divider", label: "Séparateur", hint: "Un trait fin." },
  { value: "zone", label: "Zone de couleur", hint: "Un aplat, un trait, une pastille ou un point à la couleur de l'accent (ou une autre) : pour composer." },
  { value: "space", label: "Espace", hint: "Un peu d'air, de la hauteur voulue." },
  { value: "buttons", label: "Boutons", hint: "Des boutons : un formulaire ouvert ici, une page, une carte, une ligne au hasard, supprimer… réservés aux rôles choisis." },
]

export const cardAspects: Array<{ value: CardAspect; label: string }> = [
  { value: "1/1", label: "Carré" },
  { value: "4/5", label: "Portrait 4:5" },
  { value: "3/4", label: "Portrait 3:4" },
  { value: "2/3", label: "Affiche 2:3" },
  { value: "4/3", label: "Paysage 4:3" },
  { value: "16/9", label: "Large 16:9" },
  { value: "16/6", label: "Bannière 16:6" },
  { value: "2/1", label: "Bannière 2:1" },
  { value: "3/1", label: "Bandeau 3:1" },
]

export const cardWidths: Array<{ value: CardWidth; label: string; rem: number }> = [
  { value: "xs", label: "Très petite", rem: 9 },
  { value: "sm", label: "Petite", rem: 11.5 },
  { value: "md", label: "Moyenne", rem: 15 },
  { value: "lg", label: "Grande", rem: 19 },
  { value: "xl", label: "Très grande", rem: 26 },
  { value: "full", label: "Toute la ligne (liste)", rem: 0 },
]

/** Les couleurs proposées pour un accent ou un texte (les mêmes que les styles de colonne). */
export const cardPalette: Array<{ value: string; label: string }> = [
  { value: "#927640", label: "Or" },
  { value: "#682522", label: "Bordeaux" },
  { value: "#b3261e", label: "Rouge" },
  { value: "#c2410c", label: "Orange" },
  { value: "#b7791f", label: "Ambre" },
  { value: "#4d7c0f", label: "Vert" },
  { value: "#315b55", label: "Sapin" },
  { value: "#397f88", label: "Turquoise" },
  { value: "#285f8f", label: "Bleu" },
  { value: "#1e3a8a", label: "Nuit" },
  { value: "#6b4c9a", label: "Violet" },
  { value: "#9d174d", label: "Framboise" },
  { value: "#78716c", label: "Pierre" },
]

export const DEFAULT_CARD_ACCENT = "#927640"

// ---------------------------------------------------------------------------
// Lecture d'une carte enregistrée (bornée, nettoyée)
// ---------------------------------------------------------------------------

const MAX_BLOCKS = 24
const MAX_COLUMNS = 12
const MAX_CARDS = 12

const blockTypeSet = new Set<string>(cardBlockTypes.map((entry) => entry.value))
const aspectSet = new Set<string>(cardAspects.map((entry) => entry.value))
const widthSet = new Set<string>(cardWidths.map((entry) => entry.value))
const sizeSet = new Set<string>(["xs", "sm", "md", "lg", "xl"])

export function cardId(prefix = "c") {
  return `${prefix}${Math.random().toString(36).slice(2, 9)}`
}

function text(value: unknown, max = 80) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : ""
}

/** Un texte court qui garde ses espaces de bord (« · », « rang ») : un préfixe, un séparateur. */
function affix(value: unknown, max = 24) {
  return typeof value === "string" ? value.replace(/[\r\n\t]+/g, " ").slice(0, max) : ""
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[] | Set<string>): T | undefined {
  if (typeof value !== "string") return undefined
  const ok = allowed instanceof Set ? allowed.has(value) : (allowed as readonly string[]).includes(value)
  return ok ? (value as T) : undefined
}

function tone(value: unknown): CardTone | undefined {
  if (typeof value !== "string") return undefined
  if (["default", "muted", "accent", "column"].includes(value)) return value
  // Une couleur prise dans une autre colonne de la ligne (« {Couleur} »).
  if (/^\{[^{}]{1,120}\}$/.test(value.trim())) return value.trim()
  return /^#[0-9a-f]{3,8}$/i.test(value.trim()) ? value.trim() : undefined
}

function columnList(value: unknown) {
  const seen = new Set<string>()
  return (Array.isArray(value) ? value : []).map((item) => text(item, 120)).filter((item) => {
    if (!item || seen.has(foldName(item))) return false
    seen.add(foldName(item))
    return true
  }).slice(0, MAX_COLUMNS)
}

/** La taille libre d'une image, lue et bornée ; les champs absents restent absents. */
export function cleanImageBox(raw: Record<string, unknown>): ImageBox {
  const box: ImageBox = {}
  if (typeof raw.widthPct === "number" && Number.isFinite(raw.widthPct)) box.widthPct = Math.max(5, Math.min(100, Math.round(raw.widthPct)))
  if (typeof raw.heightPct === "number" && Number.isFinite(raw.heightPct)) box.heightPct = Math.max(5, Math.min(300, Math.round(raw.heightPct)))
  if (raw.autoHeight === true) box.autoHeight = true
  if (raw.linked === true) box.linked = true
  if (raw.bare === true) box.bare = true
  const edges = Array.isArray(raw.edges) ? raw.edges.filter((edge): edge is ImageEdge => imageEdges.includes(edge as ImageEdge)) : []
  if (Array.isArray(raw.edges)) box.edges = [...new Set(edges)]
  return box
}

function cleanPart(input: unknown): CardPart | null {
  if (!input || typeof input !== "object") return null
  const raw = input as Record<string, unknown>
  const column = text(raw.column, 120)
  if (!column) return null
  const part: CardPart = { column }
  const prefix = affix(raw.prefix)
  const suffix = affix(raw.suffix)
  if (prefix) part.prefix = prefix
  if (suffix) part.suffix = suffix
  const partTone = tone(raw.tone)
  if (partTone) part.tone = partTone
  if (raw.bold === true) part.bold = true
  if (raw.italic === true) part.italic = true
  return part
}

function cleanBlock(input: unknown): CardBlock | null {
  if (!input || typeof input !== "object") return null
  const raw = input as Record<string, unknown>
  const type = oneOf<CardBlockType>(raw.type, blockTypeSet)
  if (!type) return null
  const block: CardBlock = { id: text(raw.id, 20) || cardId("b"), type }
  const icon = text(raw.icon, 40)
  if (icon) block.icon = icon
  const column = text(raw.column, 120)
  if (column) block.column = column
  const columns = columnList(raw.columns)
  if (columns.length) block.columns = columns
  const parts = (Array.isArray(raw.parts) ? raw.parts : []).map(cleanPart).filter((part): part is CardPart => Boolean(part)).slice(0, MAX_COLUMNS)
  if (parts.length) block.parts = parts
  if (typeof raw.separator === "string") block.separator = affix(raw.separator, 12)
  const label = text(raw.label, 60)
  if (label) block.label = label
  if (raw.showLabel === true) block.showLabel = true
  const size = oneOf<CardTextSize>(raw.size, sizeSet)
  if (size) block.size = size
  const blockTone = tone(raw.tone)
  if (blockTone) block.tone = blockTone
  const font = oneOf<"display" | "sans">(raw.font, ["display", "sans"])
  if (font) block.font = font
  if (raw.bold === true) block.bold = true
  if (raw.italic === true) block.italic = true
  if (raw.caps === true) block.caps = true
  if (typeof raw.clamp === "number" && Number.isFinite(raw.clamp)) block.clamp = Math.max(0, Math.min(12, Math.round(raw.clamp)))
  if (raw.quote === true) block.quote = true
  const align = oneOf<"left" | "center" | "right">(raw.align, ["left", "center", "right"])
  if (align) block.align = align
  const badges = columnList(raw.badges)
  if (badges.length) block.badges = badges
  if (typeof raw.max === "number" && Number.isFinite(raw.max) && raw.max > 0) block.max = Math.min(1_000_000, raw.max)
  const maxColumn = text(raw.maxColumn, 120)
  if (maxColumn) block.maxColumn = maxColumn
  if (raw.showValue === true) block.showValue = true
  const unit = affix(raw.unit, 12)
  if (unit) block.unit = unit
  const pill = oneOf<"soft" | "solid" | "outline">(raw.pill, ["soft", "solid", "outline"])
  if (pill) block.pill = pill
  if (raw.stacked === true) block.stacked = true
  const aspect = oneOf<CardAspect>(raw.aspect, aspectSet)
  if (aspect) block.aspect = aspect
  const fit = oneOf<CardFit>(raw.fit, ["cover", "contain"])
  if (fit) block.fit = fit
  const shape = oneOf<CardShape>(raw.shape, ["rect", "rounded", "circle"])
  if (shape) block.shape = shape
  if (typeof raw.width === "number" && Number.isFinite(raw.width)) block.width = Math.max(10, Math.min(100, Math.round(raw.width)))
  if (typeof raw.ratio === "number" && Number.isFinite(raw.ratio)) block.ratio = Math.max(0.3, Math.min(4, Math.round(raw.ratio * 100) / 100))
  if (typeof raw.radiusPx === "number" && Number.isFinite(raw.radiusPx)) block.radiusPx = Math.max(0, Math.min(200, Math.round(raw.radiusPx)))
  if (typeof raw.height === "number" && Number.isFinite(raw.height)) block.height = Math.max(1, Math.min(400, Math.round(raw.height)))
  const zone = oneOf<"block" | "line" | "pill" | "dot">(raw.zone, ["block", "line", "pill", "dot"])
  if (zone) block.zone = zone
  if (raw.open === true) block.open = true
  if (type === "buttons") {
    const buttons = (Array.isArray(raw.buttons) ? raw.buttons : []).map(cleanCardButton).filter((button): button is CardButton => Boolean(button)).slice(0, 8)
    if (buttons.length) block.buttons = buttons
    if (raw.stretch === true) block.stretch = true
  }
  Object.assign(block, cleanImageBox(raw))
  return block
}

/** Un bouton de carte propre : ses textes bornés, ses rôles connus, ses étapes connues. */
export function cleanCardButton(input: unknown): CardButton | null {
  if (!input || typeof input !== "object") return null
  const raw = input as Record<string, unknown>
  const steps = (Array.isArray(raw.steps) ? raw.steps : []).map(cleanActionStep).filter((step): step is ActionStep => Boolean(step)).slice(0, 8)
  const button: CardButton = { id: text(raw.id, 20) || cardId("btn"), label: typeof raw.label === "string" ? raw.label.slice(0, 60) : "", steps }
  const icon = text(raw.icon, 40)
  if (icon) button.icon = icon
  if (typeof raw.color === "string" && /^#[0-9a-f]{6}$/i.test(raw.color)) button.color = raw.color
  if (raw.iconOnly === true) button.iconOnly = true
  if (typeof raw.confirm === "string" && raw.confirm.trim()) button.confirm = raw.confirm.slice(0, 200)
  if (typeof raw.condition === "string" && raw.condition.trim()) button.condition = raw.condition.slice(0, 400)
  const roles = cleanViewRoles(raw.roles)
  if (roles) button.roles = roles
  const look = oneOf<"solid" | "outline" | "ghost">(raw.look, ["solid", "outline", "ghost"])
  if (look && look !== "solid") button.look = look
  return button
}

function cleanCell(input: unknown): CardCell | null {
  if (!input || typeof input !== "object") return null
  const raw = input as Record<string, unknown>
  const blocks = (Array.isArray(raw.blocks) ? raw.blocks : []).map((item) => text(item, 20)).filter(Boolean).slice(0, MAX_BLOCKS)
  const cell: CardCell = { id: text(raw.id, 20) || cardId("k"), blocks }
  if (raw.width === "auto" || raw.width === "fill") cell.width = raw.width
  else if (typeof raw.width === "number" && Number.isFinite(raw.width)) cell.width = Math.max(5, Math.min(100, Math.round(raw.width)))
  const align = oneOf<"left" | "center" | "right">(raw.align, ["left", "center", "right"])
  if (align) cell.align = align
  const valign = oneOf<"top" | "center" | "bottom">(raw.valign, ["top", "center", "bottom"])
  if (valign) cell.valign = valign
  return cell
}

/** Les lignes de la carte lues ; un bloc n'est dans une case qu'une fois. */
function cleanRows(input: unknown, blockIds: Set<string>): CardRow[] {
  const used = new Set<string>()
  return (Array.isArray(input) ? input : []).slice(0, 24).flatMap((entry): CardRow[] => {
    if (!entry || typeof entry !== "object") return []
    const raw = entry as Record<string, unknown>
    const cells = (Array.isArray(raw.cells) ? raw.cells : []).map(cleanCell).filter((cell): cell is CardCell => Boolean(cell)).slice(0, 6).map((cell) => ({ ...cell, blocks: cell.blocks.filter((id) => blockIds.has(id) && !used.has(id) && Boolean(used.add(id))) }))
    const gap = oneOf<"none" | "sm" | "md" | "lg">(raw.gap, ["none", "sm", "md", "lg"])
    return [{ id: text(raw.id, 20) || cardId("r"), cells, ...(gap ? { gap } : {}) }]
  })
}

function cleanMedia(input: unknown): CardMedia | undefined {
  if (!input || typeof input !== "object") return undefined
  const raw = input as Record<string, unknown>
  const column = text(raw.column, 120)
  const position = oneOf<CardMediaPosition>(raw.position, ["top", "bottom", "left", "right", "background"])
  if (!column || !position) return undefined
  const media: CardMedia = { column, position }
  const aspect = oneOf<CardAspect>(raw.aspect, aspectSet)
  if (aspect) media.aspect = aspect
  const fit = oneOf<CardFit>(raw.fit, ["cover", "contain"])
  if (fit) media.fit = fit
  const shape = oneOf<CardShape>(raw.shape, ["rect", "rounded", "circle"])
  if (shape) media.shape = shape
  const size = oneOf<"xs" | "sm" | "md" | "lg">(raw.size, ["xs", "sm", "md", "lg"])
  if (size) media.size = size
  if (raw.tint === true) media.tint = true
  if (typeof raw.ratio === "number" && Number.isFinite(raw.ratio)) media.ratio = Math.max(0.3, Math.min(4, Math.round(raw.ratio * 100) / 100))
  if (typeof raw.radiusPx === "number" && Number.isFinite(raw.radiusPx)) media.radiusPx = Math.max(0, Math.min(200, Math.round(raw.radiusPx)))
  const anchor = oneOf<"stretch" | "top" | "bottom">(raw.anchor, ["stretch", "top", "bottom"])
  if (anchor) media.anchor = anchor
  const sizing = oneOf<"aspect" | "height">(raw.sizing, ["aspect", "height"])
  if (sizing) media.sizing = sizing
  if (typeof raw.heightPx === "number" && Number.isFinite(raw.heightPx)) media.heightPx = Math.max(16, Math.min(800, Math.round(raw.heightPx)))
  if (raw.inset === true) media.inset = true
  Object.assign(media, cleanImageBox(raw))
  return media
}

/**
 * Une carte lue (JSON du serveur ou envoyée par l'éditeur), bornée et nettoyée ; null si
 * illisible. Une carte vidée de ses blocs reste (vide, avec son nom) : seul « Supprimer » la retire.
 */
export function parseCardTemplate(input: unknown): CardTemplate | null {
  let value = input
  if (typeof value === "string") {
    if (!value.trim()) return null
    try { value = JSON.parse(value) } catch { return null }
  }
  if (!value || typeof value !== "object") return null
  const raw = value as Record<string, unknown>
  const blocks = (Array.isArray(raw.blocks) ? raw.blocks : []).map(cleanBlock).filter((block): block is CardBlock => Boolean(block)).slice(0, MAX_BLOCKS)
  const media = cleanMedia(raw.media)
  if (!blocks.length && !media && !text(raw.id, 40)) return null
  const card: CardTemplate = { id: text(raw.id, 40) || cardId(), name: text(raw.name, 60) || "Carte", blocks }
  if (text(raw.hover, 40)) card.hover = text(raw.hover, 40)
  const click = oneOf<CardClick>(raw.click, ["sheet", "form", "page", "none"])
  if (click && click !== "sheet") card.click = click
  if (click === "form" && text(raw.clickForm, 40)) card.clickForm = text(raw.clickForm, 40)
  if (media) card.media = media
  if (raw.accent && typeof raw.accent === "object") {
    const accent = raw.accent as Record<string, unknown>
    const column = text(accent.column, 120)
    const color = tone(accent.color)
    const clean = { ...(column ? { column } : {}), ...(color && color.startsWith("#") ? { color } : {}) }
    if (Object.keys(clean).length) card.accent = clean
  }
  if (raw.band === true) card.band = true
  const border = oneOf<NonNullable<CardTemplate["border"]>>(raw.border, ["none", "subtle", "accent", "left", "top"])
  if (border) card.border = border
  const surface = oneOf<NonNullable<CardTemplate["surface"]>>(raw.surface, ["card", "tint", "glow", "plain"])
  if (surface) card.surface = surface
  const radius = oneOf<NonNullable<CardTemplate["radius"]>>(raw.radius, ["sm", "md", "lg"])
  if (radius) card.radius = radius
  if (raw.shadow === true) card.shadow = true
  const align = oneOf<"left" | "center">(raw.align, ["left", "center"])
  if (align) card.align = align
  const density = oneOf<NonNullable<CardTemplate["density"]>>(raw.density, ["compact", "normal", "airy"])
  if (density) card.density = density
  const width = oneOf<CardWidth>(raw.width, widthSet)
  if (width) card.width = width
  const corner = text(raw.corner, 120)
  if (corner) card.corner = corner
  if (raw.chevron === true) card.chevron = true
  if (raw.lift === true) card.lift = true
  const rows = cleanRows(raw.rows, new Set(blocks.map((block) => block.id)))
  if (rows.length) card.rows = rows
  if (typeof raw.widthRem === "number" && Number.isFinite(raw.widthRem)) card.widthRem = Math.max(6, Math.min(48, Math.round(raw.widthRem * 2) / 2))
  if (typeof raw.radiusPx === "number" && Number.isFinite(raw.radiusPx)) card.radiusPx = Math.max(0, Math.min(64, Math.round(raw.radiusPx)))
  if (typeof raw.minHeightPx === "number" && Number.isFinite(raw.minHeightPx)) card.minHeightPx = Math.max(0, Math.min(1200, Math.round(raw.minHeightPx)))
  if (typeof raw.ratio === "number" && Number.isFinite(raw.ratio)) card.ratio = Math.max(0.3, Math.min(4, Math.round(raw.ratio * 100) / 100))
  if (raw.sizeLinked === true) card.sizeLinked = true
  if (raw.grid && typeof raw.grid === "object") {
    const grid = raw.grid as Record<string, unknown>
    const clean: NonNullable<CardTemplate["grid"]> = {}
    if (typeof grid.max === "number" && Number.isFinite(grid.max) && grid.max >= 1) clean.max = Math.min(12, Math.round(grid.max))
    if (grid.phone === 1 || grid.phone === 2) clean.phone = grid.phone
    if (Object.keys(clean).length) card.grid = clean
  }
  return card
}

/** Les cartes d'un onglet lues ; `null` si l'entrée est illisible. Une liste vide reste vide (cartes retirées). */
export function parseTabCards(input: unknown): TabCards | null {
  let value = input
  if (typeof value === "string") {
    try { value = JSON.parse(value) } catch { return null }
  }
  if (!value || typeof value !== "object") return null
  const raw = value as Record<string, unknown>
  if (!Array.isArray(raw.cards)) return null
  const seen = new Set<string>()
  const cards = raw.cards.map(parseCardTemplate).filter((card): card is CardTemplate => {
    if (!card || seen.has(card.id)) return false
    seen.add(card.id)
    return true
  }).slice(0, MAX_CARDS)
  const defaultId = text(raw.defaultId, 40)
  return { cards, ...(defaultId && seen.has(defaultId) ? { defaultId } : {}) }
}

export function serializeTabCards(value: TabCards) {
  return JSON.stringify(parseTabCards(value) ?? { cards: [] })
}

// ---------------------------------------------------------------------------
// Colonnes : celles qu'une carte nomme, renommées, présentes ou non
// ---------------------------------------------------------------------------

/** Toutes les colonnes qu'une carte nomme, dans l'ordre. */
/** La colonne d'une couleur prise dans la ligne (« {Couleur} »), sinon rien. */
export const toneColumnOf = (tone: string | undefined) => tone?.match(/^\{([^{}]+)\}$/)?.[1].trim()

export function cardColumns(card: CardTemplate): string[] {
  const list: string[] = []
  const add = (column: string | undefined) => { if (column && !list.some((item) => foldName(item) === foldName(column))) list.push(column) }
  add(card.media?.column)
  add(card.accent?.column)
  add(card.corner)
  for (const block of card.blocks) {
    add(block.column)
    block.columns?.forEach(add)
    block.parts?.forEach((part) => add(part.column))
    block.badges?.forEach(add)
    add(block.maxColumn)
    add(toneColumnOf(block.tone))
  }
  return list
}

/** Une carte dont les colonnes renommées (ancien nom plié → nouveau) suivent leur nouveau nom. */
export function renameCardColumns(card: CardTemplate, renames: Map<string, string>): CardTemplate {
  if (!renames.size) return card
  const rename = (column: string) => renames.get(foldName(column)) ?? column
  const maybe = (column: string | undefined) => column === undefined ? undefined : rename(column)
  return {
    ...card,
    ...(card.media ? { media: { ...card.media, column: rename(card.media.column) } } : {}),
    ...(card.accent ? { accent: { ...card.accent, ...(card.accent.column ? { column: rename(card.accent.column) } : {}) } } : {}),
    ...(card.corner ? { corner: rename(card.corner) } : {}),
    blocks: card.blocks.map((block) => {
      const next: CardBlock = { ...block }
      if (block.column) next.column = maybe(block.column)
      if (block.columns) next.columns = block.columns.map(rename)
      if (block.parts) next.parts = block.parts.map((part) => ({ ...part, column: rename(part.column) }))
      if (block.badges) next.badges = block.badges.map(rename)
      if (block.maxColumn) next.maxColumn = maybe(block.maxColumn)
      const toneColumn = toneColumnOf(block.tone)
      if (toneColumn) next.tone = `{${rename(toneColumn)}}`
      return next
    }),
  }
}

/** Les colonnes nommées par la carte que l'onglet n'a pas (l'éditeur les signale ; la carte les saute). */
export function missingCardColumns(card: CardTemplate, headers: string[]) {
  const known = new Set(headers.map(foldName))
  return cardColumns(card).filter((column) => !known.has(foldName(column)))
}

// ---------------------------------------------------------------------------
// Valeurs : le texte qu'une case montre sur une carte
// ---------------------------------------------------------------------------

function decodeEntities(value: string) {
  return value.replace(/&nbsp;/gi, " ").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&quot;/gi, "\"").replace(/&#39;/gi, "'").replace(/&amp;/gi, "&")
}

/** Le texte d'une case mise en forme : sans balises, sur une ligne. */
export function plainCardText(value: string) {
  return decodeEntities(value.replace(/<br\s*\/?>/gi, " ").replace(/<\/(p|div|li)>/gi, " ").replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim()
}

/**
 * Une liste enregistrée en JSON (« ["Orc"] », « {"values": […], "selected": "…"} ») :
 * ses valeurs lisibles. Toute autre valeur reste telle quelle.
 */
export function readableListValue(value: string) {
  const trimmed = value.trim()
  if (!/^[[{]/.test(trimmed)) return value
  try {
    const parsed = JSON.parse(trimmed) as unknown
    if (Array.isArray(parsed)) return parsed.filter((item) => typeof item === "string" && item.trim()).join(", ")
    if (parsed && typeof parsed === "object") {
      const entry = parsed as { values?: unknown; selected?: unknown }
      if (typeof entry.selected === "string" && entry.selected.trim()) return entry.selected
      if (Array.isArray(entry.values)) return entry.values.filter((item) => typeof item === "string" && item.trim()).join(", ")
    }
  } catch { /* pas du JSON : la valeur telle quelle */ }
  return value
}

/** Les valeurs d'une case à plusieurs choix (« Feu, Glace », « A | B », une par ligne). */
export function cardListValues(value: string) {
  return readableListValue(plainCardText(value.replace(/<br\s*\/?>/gi, "\n"))).split(/\s*(?:[,;|\n]|\s·\s)\s*/).map((item) => item.trim()).filter(Boolean)
}

/** Un nombre lu dans une case (« 12 », « 3,5 », « 18 / 24 » → 18). */
export function cardNumber(value: string): number | null {
  const match = plainCardText(value).replace(/\s/g, "").replace(",", ".").match(/-?\d+(?:\.\d+)?/)
  return match ? Number(match[0]) : null
}

/** Une couleur écrite dans une case (« #aa3355 », « rgb(…) »). */
export function isCardColor(value: string) {
  return /^(#[0-9a-f]{3,8}|rgba?\([^)]*\)|hsla?\([^)]*\))$/i.test(value.trim())
}

// ---------------------------------------------------------------------------
// Les cartes de départ (« Nouvelle carte ») : une forme, remplie avec les colonnes de l'onglet
// ---------------------------------------------------------------------------

export type CardColumn = { header: string; spec: IndexColumnSpec }

type Roles = {
  name?: string
  image?: string
  glyph?: string
  color?: string
  description?: string
  choices: string[]
  numbers: string[]
  texts: string[]
}

const imageWords = /portrait|image|banni[eè]re|illustration|photo|avatar|ic[oô]ne|icon|token|blason|embl[eè]me/i
const descriptionWords = /description|effet|contenu|r[ée]sum[ée]|histoire|lore|biographie|d[ée]finition|note/i

/** Ce que chaque colonne d'un onglet peut être sur une carte (le nom, l'image, la description…). */
export function cardRoles(columns: CardColumn[]): Roles {
  const usable = columns.filter((column) => !["id", "archived", "tab", "auto-links", "ranked-links", "actions"].includes(normalizeSpec(column.spec).kind))
  const kind = (column: CardColumn) => normalizeSpec(column.spec).kind
  const name = usable.find((column) => isNameColumnSpec(column.spec))?.header ?? usable.find((column) => /^nom\b/i.test(column.header))?.header ?? usable[0]?.header
  const images = usable.filter((column) => { const spec = normalizeSpec(column.spec); return spec.kind === "file" && spec.file?.accept === "image" })
  const image = images.find((column) => !/ic[oô]ne|icon/i.test(column.header))?.header ?? usable.find((column) => imageWords.test(column.header) && !/ic[oô]ne|icon/i.test(column.header) && kind(column) !== "glyph")?.header ?? images[0]?.header
  const glyph = usable.find((column) => kind(column) === "glyph")?.header ?? usable.find((column) => /ic[oô]ne|icon/i.test(column.header))?.header
  const color = usable.find((column) => kind(column) === "color")?.header ?? usable.find((column) => /couleur|color/i.test(column.header))?.header
  const rich = usable.filter((column) => column.header !== name && ["rich", "fixed", "linked"].includes(kind(column)) && !imageWords.test(column.header))
  const description = rich.find((column) => descriptionWords.test(column.header))?.header ?? rich.find((column) => !/classe|peuple|type|joueur|titre|niveau|level|rang/i.test(column.header))?.header
  const choices = usable.filter((column) => ["choice", "linked-choice", "tab-sort"].includes(kind(column))).map((column) => column.header)
  const numbers = usable.filter((column) => ["number", "gauge", "formula", "rollup"].includes(kind(column))).map((column) => column.header)
  const texts = rich.filter((column) => column.header !== description).map((column) => column.header)
  return { name, image, glyph, color, description, choices, numbers, texts }
}

export type CardStarter = { key: string; label: string; hint: string; build: (columns: CardColumn[]) => CardTemplate }

const block = (type: CardBlockType, settings: Omit<CardBlock, "id" | "type"> = {}): CardBlock => ({ id: cardId("b"), type, ...settings })
const present = (value: unknown): value is CardBlock => typeof value === "object" && value !== null

/** Les formes de départ : choisies dans « Nouvelle carte », remplies d'office avec les colonnes de l'onglet. */
export const cardStarters: CardStarter[] = [
  {
    key: "gallery",
    label: "Galerie illustrée",
    hint: "L’image en haut, le nom, une ligne de types, la description coupée.",
    build: (columns) => {
      const roles = cardRoles(columns)
      return {
        id: cardId(), name: "Galerie", width: "md", lift: true, band: Boolean(roles.color), border: "subtle",
        ...(roles.image ? { media: { column: roles.image, position: "top" as const, aspect: "4/3" as const, fit: "cover" as const } } : {}),
        ...(roles.color ? { accent: { column: roles.color } } : {}),
        blocks: [
          roles.name && block("title", { column: roles.name, size: "lg", font: "display" }),
          roles.choices.length > 0 && block("line", { parts: roles.choices.slice(0, 2).map((column) => ({ column, tone: "column" })), separator: " · ", size: "xs", caps: true, tone: "muted" }),
          roles.description && block("text", { column: roles.description, clamp: 3, size: "sm", tone: "muted" }),
        ].filter(present),
      }
    },
  },
  {
    key: "portrait",
    label: "Portrait",
    hint: "Une grande image verticale, le nom et deux lignes courtes : un personnage, un PNJ.",
    build: (columns) => {
      const roles = cardRoles(columns)
      return {
        id: cardId(), name: "Portrait", width: "sm", lift: true, band: true, border: "subtle",
        accent: roles.color ? { column: roles.color } : { color: DEFAULT_CARD_ACCENT },
        ...(roles.image ? { media: { column: roles.image, position: "top" as const, aspect: "4/5" as const, fit: "cover" as const } } : {}),
        blocks: [
          roles.name && block("title", { column: roles.name, size: "md", font: "display" }),
          roles.choices[0] && block("line", { parts: [{ column: roles.choices[0] }], tone: "accent", bold: true, size: "xs" }),
          (roles.choices[1] ?? roles.texts[0]) && block("line", { parts: [{ column: (roles.choices[1] ?? roles.texts[0])! }], italic: true, tone: "muted", size: "xs" }),
        ].filter(present),
      }
    },
  },
  {
    key: "side",
    label: "Fiche horizontale",
    hint: "L’image à gauche, le contenu à droite : une jauge, des valeurs, la description.",
    build: (columns) => {
      const roles = cardRoles(columns)
      return {
        id: cardId(), name: "Fiche horizontale", width: "xl", border: "subtle",
        ...(roles.color ? { accent: { column: roles.color } } : {}),
        ...(roles.image ? { media: { column: roles.image, position: "left" as const, aspect: "4/5" as const, fit: "cover" as const, size: "md" as const, shape: "rounded" as const } } : {}),
        blocks: [
          roles.name && block("title", { column: roles.name, size: "lg", font: "display", ...(roles.choices[0] ? { badges: [roles.choices[0]] } : {}) }),
          roles.choices.length > 1 && block("line", { parts: roles.choices.slice(1, 3).map((column) => ({ column })), separator: " · ", size: "xs", tone: "muted" }),
          roles.numbers.length > 2 ? block("stats", { columns: roles.numbers.slice(0, 7) }) : roles.numbers[0] ? block("field", { column: roles.numbers[0] }) : null,
          roles.description && block("text", { column: roles.description, clamp: 4, size: "sm", quote: true }),
        ].filter(present),
      }
    },
  },
  {
    key: "list",
    label: "Ligne de liste",
    hint: "Une vignette, le nom et une ligne de détails, sur toute la largeur.",
    build: (columns) => {
      const roles = cardRoles(columns)
      const details = [...roles.choices.slice(0, 2), ...roles.texts.slice(0, 1)]
      return {
        id: cardId(), name: "Liste", width: "full", border: roles.color ? "left" : "subtle", chevron: true, density: "compact",
        ...(roles.color ? { accent: { column: roles.color } } : {}),
        ...(roles.image || roles.glyph ? { media: { column: (roles.image ?? roles.glyph)!, position: "left" as const, aspect: "1/1" as const, fit: "cover" as const, size: "xs" as const, shape: "rounded" as const, tint: !roles.image } } : {}),
        blocks: [
          roles.name && block("title", { column: roles.name, size: "md", font: "display" }),
          details.length > 0 && block("line", { parts: details.map((column) => ({ column })), separator: " · ", size: "xs", tone: "muted", clamp: 1 }),
        ].filter(present),
      }
    },
  },
  {
    key: "medallion",
    label: "Médaillon",
    hint: "Une icône ou une image ronde, à la couleur de la ligne : un succès, un état, un modificateur.",
    build: (columns) => {
      const roles = cardRoles(columns)
      const media = roles.glyph ?? roles.image
      return {
        id: cardId(), name: "Médaillon", width: "lg", border: "accent", surface: "glow", lift: true,
        accent: roles.color ? { column: roles.color } : { color: DEFAULT_CARD_ACCENT },
        ...(media ? { media: { column: media, position: "left" as const, aspect: "1/1" as const, fit: "cover" as const, size: "sm" as const, shape: "circle" as const, tint: true } } : {}),
        blocks: [
          roles.choices.length > 0 && block("line", { parts: roles.choices.slice(0, 2).map((column) => ({ column, tone: "column" })), separator: " · ", size: "xs", caps: true, bold: true }),
          roles.name && block("title", { column: roles.name, size: "lg", font: "display", tone: "accent" }),
          roles.description && block("text", { column: roles.description, clamp: 3, size: "xs", tone: "muted" }),
        ].filter(present),
      }
    },
  },
  {
    key: "badge",
    label: "Insigne centré",
    hint: "Le titre en haut, l’image au centre, les pastilles empilées : une classe, un blason.",
    build: (columns) => {
      const roles = cardRoles(columns)
      return {
        id: cardId(), name: "Insigne", width: "md", align: "center", border: "accent", shadow: true, lift: true,
        accent: roles.color ? { column: roles.color } : { color: DEFAULT_CARD_ACCENT },
        blocks: [
          roles.name && block("title", { column: roles.name, size: "xl", font: "display", tone: "accent", align: "center" }),
          (roles.image ?? roles.glyph) && block("image", { column: (roles.image ?? roles.glyph)!, aspect: "1/1", fit: "contain", width: 80 }),
          roles.choices.length > 0 && block("pills", { columns: roles.choices.slice(0, 3), stacked: true }),
          roles.numbers[0] && block("divider"),
          roles.numbers[0] && block("field", { column: roles.numbers[0] }),
        ].filter(present),
      }
    },
  },
  {
    key: "text",
    label: "Texte seul",
    hint: "Sans image : le nom en titre et tout le texte, comme une entrée de glossaire.",
    build: (columns) => {
      const roles = cardRoles(columns)
      return {
        id: cardId(), name: "Texte", width: "xl", border: "none", surface: "plain",
        blocks: [
          roles.name && block("title", { column: roles.name, size: "xl", font: "display" }),
          roles.description && block("text", { column: roles.description, clamp: 0, size: "md" }),
        ].filter(present),
      }
    },
  },
  {
    key: "playing",
    label: "Carte à jouer",
    hint: "Grande illustration, titre centré, pastilles et petites tuiles en bas : un sort, un objet, une créature.",
    build: (columns) => {
      const roles = cardRoles(columns)
      return {
        id: cardId(), name: "Carte à jouer", width: "sm", align: "center", border: "accent", shadow: true, lift: true, radius: "lg",
        accent: roles.color ? { column: roles.color } : { color: DEFAULT_CARD_ACCENT },
        ...(roles.image || roles.glyph ? { media: { column: (roles.image ?? roles.glyph)!, position: "top" as const, aspect: "3/4" as const, fit: "cover" as const, tint: !roles.image } } : {}),
        blocks: [
          roles.name && block("title", { column: roles.name, size: "lg", font: "display", align: "center" }),
          roles.choices.length > 0 && block("pills", { columns: roles.choices.slice(0, 2), align: "center" }),
          roles.description && block("text", { column: roles.description, clamp: 3, size: "xs", align: "center", italic: true, tone: "muted" }),
          roles.numbers.length > 0 && block("divider"),
          roles.numbers.length > 0 && block("stats", { columns: roles.numbers.slice(0, 4) }),
        ].filter(present),
      }
    },
  },
  {
    key: "combat",
    label: "Fiche de combat",
    hint: "Le nom et son rang, une barre de vie, les caractéristiques en tuiles, le reste replié : un PNJ, un monstre.",
    build: (columns) => {
      const roles = cardRoles(columns)
      const life = roles.numbers.find((column) => /pv|vie|sant[ée]|hp|points/i.test(column)) ?? roles.numbers[0]
      const lifeMax = roles.numbers.find((column) => column !== life && /max/i.test(column))
      const tiles = roles.numbers.filter((column) => column !== life && column !== lifeMax).slice(0, 7)
      return {
        id: cardId(), name: "Fiche de combat", width: "lg", border: "left", density: "compact",
        accent: roles.color ? { column: roles.color } : { color: "#a83a33" },
        ...(roles.image ? { media: { column: roles.image, position: "left" as const, aspect: "1/1" as const, fit: "cover" as const, size: "sm" as const, shape: "rounded" as const } } : {}),
        blocks: [
          roles.name && block("title", { column: roles.name, size: "md", font: "display", ...(roles.choices[0] ? { badges: [roles.choices[0]] } : {}) }),
          life && block("bar", { column: life, ...(lifeMax ? { maxColumn: lifeMax } : { max: 100 }), label: life, showValue: true }),
          tiles.length > 0 && block("stats", { columns: tiles }),
          (roles.description || roles.texts.length > 0) && block("details", { label: "Détails", columns: [roles.description, ...roles.texts].filter((column): column is string => Boolean(column)).slice(0, 4) }),
        ].filter(present),
      }
    },
  },
  {
    key: "dossier",
    label: "Dossier",
    hint: "Une fiche d’enquête : portrait à gauche, champs libellés, la description en citation.",
    build: (columns) => {
      const roles = cardRoles(columns)
      const fields = [...roles.choices, ...roles.numbers].slice(0, 3)
      return {
        id: cardId(), name: "Dossier", width: "xl", border: "top", surface: "tint",
        accent: roles.color ? { column: roles.color } : { color: DEFAULT_CARD_ACCENT },
        ...(roles.image ? { media: { column: roles.image, position: "left" as const, aspect: "4/5" as const, fit: "cover" as const, size: "md" as const } } : {}),
        blocks: [
          roles.name && block("title", { column: roles.name, size: "xl", font: "display" }),
          ...fields.map((column) => block("field", { column })),
          roles.description && block("text", { column: roles.description, clamp: 4, size: "sm", quote: true, italic: true }),
        ].filter(present),
      }
    },
  },
  {
    key: "banner",
    label: "Bannière",
    hint: "Une image large en bandeau, le nom en grand, une ligne et deux lignes de texte : une campagne, un lieu, une faction.",
    build: (columns) => {
      const roles = cardRoles(columns)
      return {
        id: cardId(), name: "Bannière", width: "xl", lift: true, band: true, border: "subtle",
        ...(roles.color ? { accent: { column: roles.color } } : {}),
        ...(roles.image ? { media: { column: roles.image, position: "top" as const, aspect: "16/6" as const, fit: "cover" as const } } : {}),
        blocks: [
          roles.name && block("title", { column: roles.name, size: "xl", font: "display", tone: "accent" }),
          roles.choices.length > 0 && block("line", { parts: roles.choices.slice(0, 3).map((column) => ({ column })), separator: " • ", size: "xs", caps: true, tone: "muted" }),
          roles.description && block("text", { column: roles.description, clamp: 2, size: "sm" }),
        ].filter(present),
      }
    },
  },
  {
    key: "token",
    label: "Vignette ronde",
    hint: "Petite et centrée : un portrait rond et le nom, pour un trombinoscope serré.",
    build: (columns) => {
      const roles = cardRoles(columns)
      return {
        id: cardId(), name: "Vignette ronde", width: "xs", align: "center", border: "none", surface: "plain", density: "compact", lift: true,
        accent: roles.color ? { column: roles.color } : { color: DEFAULT_CARD_ACCENT },
        blocks: [
          (roles.image ?? roles.glyph) && block("image", { column: (roles.image ?? roles.glyph)!, aspect: "1/1", fit: "cover", shape: "circle", width: 75, align: "center" }),
          roles.name && block("title", { column: roles.name, size: "sm", font: "display", align: "center", clamp: 2 }),
          roles.choices[0] && block("line", { parts: [{ column: roles.choices[0], tone: "column" }], size: "xs", align: "center" }),
        ].filter(present),
      }
    },
  },
  {
    key: "cover",
    label: "Image de fond",
    hint: "L’image couvre toute la carte, le texte posé dessus : un lieu, une scène.",
    build: (columns) => {
      const roles = cardRoles(columns)
      return {
        id: cardId(), name: "Image de fond", width: "lg", lift: true, radius: "lg",
        ...(roles.image ? { media: { column: roles.image, position: "background" as const, aspect: "4/3" as const, fit: "cover" as const } } : {}),
        blocks: [
          roles.choices[0] && block("line", { parts: [{ column: roles.choices[0] }], size: "xs", caps: true, bold: true }),
          roles.name && block("title", { column: roles.name, size: "xl", font: "display" }),
          roles.description && block("text", { column: roles.description, clamp: 2, size: "xs" }),
        ].filter(present),
      }
    },
  },
]

// ---------------------------------------------------------------------------
// Les cartes déjà présentes dans Eraser, refaites avec ce moteur
// ---------------------------------------------------------------------------

/**
 * Les cartes que chaque index avait déjà, codées à la main ailleurs dans Eraser (accueil,
 * profil, règles, campagne…). Elles sont proposées d'office tant que l'onglet n'a pas de
 * cartes enregistrées : on peut les modifier, les dupliquer ou les retirer.
 * Identifiants fixes : les retrouver après un enregistrement.
 */
function builtinCardsFor(index: string, tab: string): CardTemplate[] {
  const tabKey = foldName(tab)
  switch (index) {
    case "characters":
      return [
        {
          id: "eraser-personnage-grille", name: "Carte en grille", width: "sm", lift: true, band: true, border: "subtle",
          accent: { color: DEFAULT_CARD_ACCENT },
          media: { column: "Portrait", position: "top", aspect: "4/5", fit: "cover" },
          blocks: [
            { id: "b1", type: "title", column: "Nom personnage", size: "md", font: "display" },
            { id: "b2", type: "line", parts: [{ column: "Classe" }, { column: "Level", prefix: "rang " }], separator: " · ", size: "xs", tone: "accent", bold: true, clamp: 1 },
            { id: "b3", type: "line", parts: [{ column: "Titre honorifique" }], size: "xs", tone: "muted", italic: true, clamp: 1 },
            { id: "b4", type: "line", parts: [{ column: "Joueur" }], size: "xs", tone: "accent", caps: true, clamp: 1 },
            // Ses campagnes, aux couleurs des campagnes (colonne dérivée des pages ; vide dans l'index).
            { id: "b5", type: "pills", columns: ["Campagnes"], tone: "column" },
          ],
        },
        {
          id: "eraser-personnage-liste", name: "Ligne de liste", width: "full", border: "left", chevron: true, density: "compact",
          accent: { color: DEFAULT_CARD_ACCENT },
          media: { column: "Portrait", position: "left", aspect: "1/1", fit: "cover", size: "xs", shape: "rounded" },
          blocks: [
            { id: "b1", type: "title", column: "Nom personnage", size: "md", font: "display" },
            { id: "b2", type: "line", parts: [{ column: "Classe" }, { column: "Level", prefix: "rang " }, { column: "Titre honorifique" }, { column: "Joueur" }], separator: " · ", size: "xs", tone: "muted", clamp: 1 },
          ],
        },
        {
          id: "eraser-personnage-session", name: "Carte de session", width: "md", border: "subtle", density: "compact",
          accent: { color: DEFAULT_CARD_ACCENT },
          media: { column: "Portrait", position: "left", aspect: "4/5", fit: "cover", size: "sm", anchor: "stretch" },
          blocks: [
            { id: "b1", type: "title", column: "Nom personnage", size: "md", font: "display" },
            { id: "b2", type: "line", parts: [{ column: "Classe" }, { column: "Level", prefix: "rang " }], separator: " · ", size: "xs", tone: "accent", bold: true, clamp: 1 },
            { id: "b3", type: "line", parts: [{ column: "Joueur" }], size: "xs", tone: "muted", clamp: 1 },
          ],
        },
        {
          id: "eraser-personnage-relation", name: "Ligne de relation", width: "md", border: "none", surface: "plain", density: "compact",
          accent: { color: DEFAULT_CARD_ACCENT },
          media: { column: "Portrait", position: "left", aspect: "1/1", fit: "cover", size: "xs", shape: "circle", tint: true },
          blocks: [
            { id: "b1", type: "title", column: "Nom personnage", size: "sm", font: "sans", bold: true },
            { id: "b2", type: "line", parts: [{ column: "Joueur" }, { column: "Peuple" }], separator: " • ", size: "xs", tone: "muted", clamp: 1 },
          ],
        },
      ]
    case "campaigns":
      return [
        {
          id: "eraser-campagne-grille", name: "Carte en grille", width: "lg", lift: true, band: true, border: "accent",
          accent: { column: "Couleur d’accent", color: DEFAULT_CARD_ACCENT },
          media: { column: "Bannière", position: "top", aspect: "16/6", fit: "cover" },
          blocks: [
            { id: "b1", type: "title", column: "Nom de la campagne", size: "lg", font: "display", tone: "accent", clamp: 1 },
            { id: "b2", type: "text", column: "Description", size: "xs", tone: "muted", clamp: 2 },
            { id: "b3", type: "line", parts: [{ column: "MJ", prefix: "MJ : " }], size: "xs", tone: "muted", caps: true, clamp: 1 },
          ],
        },
        {
          id: "eraser-campagne-liste", name: "Ligne de liste", width: "full", border: "left", chevron: true, density: "compact",
          accent: { column: "Couleur d’accent", color: DEFAULT_CARD_ACCENT },
          media: { column: "Bannière", position: "left", aspect: "16/9", fit: "cover", size: "sm", shape: "rounded" },
          blocks: [
            { id: "b1", type: "title", column: "Nom de la campagne", size: "md", font: "display", tone: "accent", clamp: 1 },
            { id: "b2", type: "text", column: "Description", size: "xs", tone: "muted", clamp: 1 },
          ],
        },
      ]
    case "classes":
      return [
        {
          id: "eraser-classe-carte", name: "Carte de classe", width: "md", align: "center", border: "accent", shadow: true, lift: true, radius: "lg",
          accent: { column: "Couleur d’accent sombre", color: DEFAULT_CARD_ACCENT },
          blocks: [
            { id: "b1", type: "title", column: "Nom de la classe", size: "xl", font: "display", tone: "accent", align: "center" },
            { id: "b2", type: "image", column: "Image", aspect: "1/1", fit: "contain", width: 80 },
            { id: "b3", type: "pills", columns: ["Mots-clés 1", "Mots-clés 2", "Mots-clés 3"], stacked: true, tone: "accent" },
            { id: "b4", type: "divider" },
            { id: "b5", type: "field", column: "Difficulté" },
            { id: "b6", type: "bar", column: "Finition", label: "Finition", showValue: true, unit: "%" },
          ],
        },
        {
          id: "eraser-classe-liste", name: "Ligne de liste", width: "full", border: "left", chevron: true, density: "compact",
          accent: { column: "Couleur d’accent sombre", color: DEFAULT_CARD_ACCENT },
          media: { column: "Image", position: "left", aspect: "1/1", fit: "contain", size: "xs", shape: "rounded" },
          blocks: [
            { id: "b1", type: "title", column: "Nom de la classe", size: "md", font: "display", tone: "accent", badges: ["Type"] },
            { id: "b2", type: "line", parts: [{ column: "Mots-clés 1" }, { column: "Mots-clés 2" }, { column: "Mots-clés 3" }, { column: "Difficulté", prefix: "difficulté " }], separator: " · ", size: "xs", tone: "muted", clamp: 1 },
          ],
        },
      ]
    // Les bonus gagnés à chaque rang (la page d'une classe les montre rang par rang).
    case "rank-bonuses":
      return [{
        id: "eraser-bonus-rang", name: "Bonus d’un rang", width: "md", border: "subtle", density: "compact", accent: { color: DEFAULT_CARD_ACCENT },
        blocks: [
          { id: "b1", type: "line", parts: [{ column: "Rang", prefix: "Rang " }], size: "lg", font: "display", bold: true, tone: "accent" },
          { id: "b2", type: "line", parts: [{ column: "Cible 1", suffix: " " }, { column: "Valeur 1", bold: true }], separator: "", size: "sm" },
          { id: "b3", type: "line", parts: [{ column: "Cible 2", suffix: " " }, { column: "Valeur 2", bold: true }], separator: "", size: "sm" },
          { id: "b4", type: "line", parts: [{ column: "Cible 3", suffix: " " }, { column: "Valeur 3", bold: true }], separator: "", size: "sm" },
          { id: "b5", type: "line", parts: [{ column: "Cible 4", suffix: " " }, { column: "Valeur 4", bold: true }], separator: "", size: "sm" },
          { id: "b6", type: "pills", columns: ["Choix", "Sort sur mesure", "Autre"], tone: "accent" },
        ],
      }]
    case "class-spells":
    case "creature-spells":
      return [
        {
          id: "eraser-sort-carte", name: "Carte de sort", width: "lg", border: "top", accent: { column: "Type", color: DEFAULT_CARD_ACCENT },
          blocks: [
            { id: "b1", type: "title", column: "Nom", size: "lg", font: "display", badges: ["Type"] },
            { id: "b2", type: "text", column: "Effet", size: "sm", bold: true, quote: true, clamp: 0 },
            { id: "b3", type: "text", column: "Description", size: "sm", tone: "muted", quote: true, clamp: 4 },
            { id: "b4", type: "line", parts: [{ column: "Compétences", tone: "#b3261e", bold: true }, { column: "Distance", prefix: "Distance : " }, { column: "Charges", prefix: "Charges : " }], separator: "   ", size: "xs", tone: "muted" },
          ],
        },
        {
          id: "eraser-sort-selecteur", name: "Carte du sélecteur de sorts", width: "lg", border: "left", density: "compact", accent: { column: "Type", color: DEFAULT_CARD_ACCENT },
          blocks: [
            { id: "b1", type: "title", column: "Nom", size: "sm", font: "display", badges: ["Type"] },
            { id: "b2", type: "text", column: "Effet", size: "sm", bold: true, clamp: 0 },
            { id: "b3", type: "text", column: "Description", size: "sm", tone: "muted", clamp: 0 },
            { id: "b4", type: "line", parts: [{ column: "Compétences", tone: "#b3261e", bold: true }, { column: "Distance", prefix: "⌖ Distance : " }], separator: "   ", size: "xs", tone: "muted" },
          ],
        },
        {
          id: "eraser-sort-compacte", name: "Carte compacte", width: "md", border: "left", density: "compact", accent: { column: "Type", color: DEFAULT_CARD_ACCENT },
          blocks: [
            { id: "b1", type: "title", column: "Nom", size: "md", font: "display", badges: ["Type"] },
            { id: "b2", type: "text", column: "Effet", size: "xs", clamp: 2 },
            { id: "b3", type: "line", parts: [{ column: "Compétences", tone: "#b3261e", bold: true }, { column: "Distance", prefix: "⌖ " }], separator: "   ", size: "xs", tone: "muted", clamp: 1 },
          ],
        },
      ]
    case "npcs":
      return [
        {
          id: "eraser-pnj-carte", name: "Carte PNJ", width: "xl", border: "subtle",
          media: { column: "Portrait", position: "left", aspect: "4/5", fit: "cover", size: "md", shape: "rounded" },
          blocks: [
            { id: "b1", type: "title", column: "Nom du PNJ", size: "lg", font: "display" },
            { id: "b2", type: "line", parts: [{ column: "Classe / métier" }, { column: "Peuple" }, { column: "Genre" }, { column: "Âge" }], separator: " · ", size: "xs", tone: "muted", clamp: 1 },
            { id: "b3", type: "bar", column: "Vie actuelle", maxColumn: "Vie totale", label: "PV", showValue: true },
            { id: "b4", type: "stats", columns: ["Force", "Dextérité", "Intelligence", "Sagesse", "Charisme", "Rapidité", "Vie totale"] },
            { id: "b5", type: "details", label: "Notes", columns: ["Notes joueurs", "Notes MJ"] },
          ],
        },
        {
          id: "eraser-pnj-groupe", name: "Carte du groupe", width: "lg", border: "subtle",
          media: { column: "Portrait", position: "left", aspect: "3/4", fit: "cover", size: "sm" },
          blocks: [
            { id: "b1", type: "title", column: "Nom du PNJ", size: "lg", font: "display" },
            { id: "b2", type: "line", parts: [{ column: "Classe / métier" }, { column: "Peuple" }], separator: " · ", size: "xs", tone: "muted", clamp: 1 },
            { id: "b3", type: "bar", column: "Vie actuelle", maxColumn: "Vie totale", label: "Points de vie", showValue: true },
            { id: "b4", type: "details", label: "Notes", columns: ["Notes joueurs"] },
          ],
        },
      ]
    case "achievements":
      if (tabKey !== foldName("Succès")) return []
      return [{
        id: "eraser-succes-carte", name: "Carte de succès", width: "lg", border: "accent", surface: "glow", lift: true, radius: "lg",
        accent: { column: "Couleur", color: DEFAULT_CARD_ACCENT },
        media: { column: "Icône", position: "left", aspect: "1/1", fit: "cover", size: "sm", shape: "circle", tint: true },
        blocks: [
          { id: "b1", type: "line", parts: [{ column: "Type", tone: "column" }, { column: "Sous-type" }], separator: " · ", size: "xs", caps: true, bold: true, tone: "muted" },
          { id: "b2", type: "title", column: "Nom", size: "lg", font: "display", tone: "accent" },
          { id: "b3", type: "text", column: "Description", size: "xs", tone: "muted", clamp: 3 },
        ],
      }]
    case "states":
      if (tabKey !== foldName("États")) return []
      return [{
        id: "eraser-etat-carte", name: "Carte d’état", width: "lg", border: "left", accent: { column: "Type", color: "#78716c" },
        blocks: [
          { id: "b1", type: "title", column: "Nom", size: "lg", font: "display", tone: "accent", badges: ["Type"] },
          { id: "b2", type: "text", column: "Effet", size: "sm", clamp: 3 },
          { id: "b3", type: "line", parts: [{ column: "Durée", prefix: "Durée : " }, { column: "Cumul", prefix: "Cumul : " }], separator: " · ", size: "xs", tone: "muted" },
        ],
      }]
    case "weapon-modifiers":
      return [{
        id: "eraser-modificateur-carte", name: "Pastille détaillée", width: "lg", border: "subtle",
        accent: { column: "Couleur", color: "#7f5a3a" },
        media: { column: "Icône", position: "left", aspect: "1/1", fit: "cover", size: "xs", shape: "circle", tint: true },
        blocks: [
          { id: "b1", type: "title", column: "Nom", size: "md", font: "display", tone: "accent", badges: ["Type"] },
          { id: "b2", type: "text", column: "Description", size: "xs", tone: "muted", clamp: 3 },
          { id: "b3", type: "line", parts: [{ column: "Nombre", prefix: "Nombre : " }, { column: "Charges", prefix: "Charges : " }], separator: " · ", size: "xs", tone: "muted" },
        ],
      }]
    case "vocabulary":
      return [{
        id: "eraser-vocabulaire-entree", name: "Entrée de glossaire", width: "full", border: "none", surface: "plain",
        blocks: [
          { id: "b1", type: "line", parts: [{ column: "Nom", suffix: " :" }], size: "xl", font: "display", bold: true },
          { id: "b2", type: "text", column: "Contenu", size: "md", clamp: 0 },
        ],
      }]
    case "creatures":
      return [{
        id: "eraser-creature-carte", name: "Carte de créature", width: "md", lift: true, border: "subtle",
        media: { column: "Portrait", position: "top", aspect: "4/5", fit: "cover" },
        blocks: [
          { id: "b1", type: "title", column: "Nom", size: "lg", font: "display" },
          { id: "b2", type: "line", parts: [{ column: "Type" }, { column: "Sous-type" }], separator: " · ", size: "xs", tone: "muted", caps: true },
          { id: "b3", type: "pills", columns: ["Rang", "Rareté"] },
          { id: "b4", type: "line", parts: [{ column: "Comportement" }], size: "xs", italic: true, tone: "muted", clamp: 1 },
        ],
      }]
    case "objects":
      return [{
        id: "eraser-objet-carte", name: "Carte d’item", width: "lg", border: "subtle",
        media: { column: "Icône", position: "left", aspect: "1/1", fit: "contain", size: "sm", shape: "rounded", tint: true },
        blocks: [
          { id: "b1", type: "title", column: "Nom", size: "lg", font: "display" },
          { id: "b2", type: "line", parts: [{ column: "Type" }, { column: "Sous-type" }, { column: "Prix" }], separator: " · ", size: "xs", tone: "muted", caps: true },
          { id: "b3", type: "text", column: "Description", size: "xs", tone: "muted", clamp: 3 },
          { id: "b4", type: "text", column: "Effet", label: "Effet", showLabel: true, size: "xs", clamp: 2 },
        ],
      }]
    default:
      return []
  }
}

/**
 * Les cartes d'un onglet : celles enregistrées (même une liste vide : on les a retirées),
 * sinon celles qu'Eraser avait déjà pour cet index.
 */
export function tabCardsOf(stored: Record<string, TabCards> | null | undefined, index: string, tab: string): TabCards & { builtin: boolean } {
  const found = stored ? Object.entries(stored).find(([name]) => foldName(name) === foldName(tab)) : undefined
  if (found) return { ...found[1], builtin: false }
  return { cards: builtinCardsFor(index, tab), builtin: true }
}

/**
 * Les cartes des pages d'Eraser (la carte de classe de Règles › Classes, celle des campagnes de
 * l'accueil…), proposées comme presets dans tous les index : on les reprend, puis on les
 * adapte aux colonnes de l'onglet.
 */
export const eraserCardSources: Array<{ index: string; tab: string; label: string }> = [
  { index: "classes", tab: "Classes", label: "Classes" },
  { index: "campaigns", tab: "Campagnes", label: "Campagnes" },
  { index: "characters", tab: "Personnages", label: "Personnages" },
  { index: "npcs", tab: "PNJs", label: "PNJs" },
  { index: "creatures", tab: "Créatures", label: "Créatures" },
  { index: "class-spells", tab: "Sorts", label: "Sorts" },
  { index: "rank-bonuses", tab: "Bonus de rang", label: "Bonus de rang" },
  { index: "achievements", tab: "Succès", label: "Succès" },
  { index: "states", tab: "États", label: "États" },
  { index: "weapon-modifiers", tab: "Tout", label: "Modificateurs d’armes" },
  { index: "vocabulary", tab: "Vocabulaire", label: "Vocabulaire" },
  { index: "objects", tab: "Objets", label: "Items" },
]

export function eraserCardPresets(exceptIndex = ""): Array<{ index: string; label: string; card: CardTemplate }> {
  return eraserCardSources.filter((source) => source.index !== exceptIndex).flatMap((source) => builtinCardsFor(source.index, source.tab).map((card) => ({ index: source.index, label: source.label, card })))
}

/** La carte à montrer : celle choisie, sinon celle par défaut, sinon la première. */
export function pickCard(entry: TabCards, wanted?: string | null) {
  return entry.cards.find((card) => card.id === wanted) ?? entry.cards.find((card) => card.id === entry.defaultId) ?? entry.cards[0] ?? null
}
