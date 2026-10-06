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
import { foldName, isNameColumnSpec, normalizeSpec, type IndexColumnSpec } from "@/lib/index-columns"

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

export type CardBlockType = "title" | "line" | "text" | "pills" | "field" | "bar" | "stats" | "image" | "value" | "divider" | "details"

/**
 * Un bloc de la carte. Un seul type d'objet, dont chaque type de bloc lit les réglages qui
 * le concernent (l'éditeur ne montre que ceux-là).
 */
export type CardBlock = {
  id: string
  type: CardBlockType
  /** Titre, texte, champ, jauge, image, valeur : la colonne. */
  column?: string
  /** Pastilles, tuiles, détails : les colonnes. */
  columns?: string[]
  /** Ligne : ses morceaux, et ce qui les sépare. */
  parts?: CardPart[]
  separator?: string
  /** Le libellé écrit (champ, jauge, détails, texte) ; vide : le nom de la colonne. */
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
  /** Détails : ouverts d'emblée. */
  open?: boolean
}

export type CardMediaPosition = "top" | "left" | "right" | "background"

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
}

export type CardWidth = "xs" | "sm" | "md" | "lg" | "xl" | "full"

export type CardTemplate = {
  id: string
  name: string
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
  if (typeof raw.width === "number" && Number.isFinite(raw.width)) block.width = Math.max(15, Math.min(100, Math.round(raw.width)))
  if (raw.open === true) block.open = true
  return block
}

function cleanMedia(input: unknown): CardMedia | undefined {
  if (!input || typeof input !== "object") return undefined
  const raw = input as Record<string, unknown>
  const column = text(raw.column, 120)
  const position = oneOf<CardMediaPosition>(raw.position, ["top", "left", "right", "background"])
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
  return media
}

/** Une carte lue (JSON du serveur ou envoyée par l'éditeur), bornée et nettoyée ; null si illisible. */
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
  if (!blocks.length && !media) return null
  const card: CardTemplate = { id: text(raw.id, 40) || cardId(), name: text(raw.name, 60) || "Carte", blocks }
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
            { id: "b6", type: "bar", column: "Finition", label: "Finition", max: 100, showValue: true, unit: "%" },
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
        id: "eraser-objet-carte", name: "Carte d’objet", width: "lg", border: "subtle",
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

/** La carte à montrer : celle choisie, sinon celle par défaut, sinon la première. */
export function pickCard(entry: TabCards, wanted?: string | null) {
  return entry.cards.find((card) => card.id === wanted) ?? entry.cards.find((card) => card.id === entry.defaultId) ?? entry.cards[0] ?? null
}
