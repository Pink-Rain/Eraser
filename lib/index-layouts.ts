/**
 * La mise en page d'un onglet d'index, réglée dans « Modifier » sans écrire de code :
 *
 * - la fiche (et le formulaire d'ajout) : une colonne latérale (portrait, image…), puis des
 *   sections, chacune faite de lignes de champs côte à côte, chacun de sa largeur ;
 * - le survol d'une ligne citée en entier (« {État:Sérénité} ») : la même chose, en
 *   lecture, avec en tête l'image et la ligne de sous-titre choisies.
 *
 * Un onglet sans mise en page garde l'affichage automatique. Une colonne absente de la mise
 * en page (ajoutée plus tard, par exemple) s'affiche à la suite, sauf si la mise en page
 * dit de masquer le reste. Rien n'est jamais perdu : une colonne renommée ou supprimée
 * disparaît simplement de la mise en page.
 *
 * Sans dépendance : l'éditeur, la fiche et la résolution des références (serveur) s'en
 * servent. Gardé sur le serveur partagé d'Eraser (lib/index-layouts-store.ts), jamais dans
 * Google Sheets.
 */
import { foldName } from "@/lib/index-columns"

/** La largeur d'un champ, sur une ligne de 12 : ¼, ⅓, ½, ⅔, ¾, toute la ligne. */
export type LayoutSpan = 3 | 4 | 6 | 8 | 9 | 12

export const layoutSpans: Array<{ value: LayoutSpan; label: string; short: string }> = [
  { value: 3, label: "Un quart de la ligne", short: "¼" },
  { value: 4, label: "Un tiers de la ligne", short: "⅓" },
  { value: 6, label: "La moitié de la ligne", short: "½" },
  { value: 8, label: "Deux tiers de la ligne", short: "⅔" },
  { value: 9, label: "Trois quarts de la ligne", short: "¾" },
  { value: 12, label: "Toute la ligne", short: "Plein" },
]

/**
 * Un bloc qui n'est pas une simple colonne : ce qu'Eraser dessinait à la main dans ses
 * fiches et ses survols (les niveaux d'un état, les tuiles de caractéristiques, le sac d'un
 * PNJ…), rendu réglable et réutilisable dans n'importe quel index.
 */
export type LayoutBlock =
  /** Des paliers (« Niveau 1 », « Niveau 2 »…) : chacun lit sa colonne, le niveau en cours est mis en avant. */
  | { kind: "levels"; levels: Array<{ label: string; column: string }>; /** La colonne (ou la jauge) qui dit le niveau en cours, si elle existe. */ current?: string; /** Un texte sous les paliers (règles liées). */ rules?: string; rulesLabel?: string }
  /** Des tuiles de valeurs (FOR, DEX…), chacune de sa couleur. */
  | { kind: "tiles"; columns: string[]; /** La couleur de chaque tuile (nom de colonne → couleur) ; sinon la couleur d'accent. */ colors?: Record<string, string>; /** Les tuiles par ligne (0 : toutes). */ perRow?: number; /** Abréger les noms (FOR, DEX…). */ short?: boolean }
  /** Un inventaire de la ligne : tout, ou une seule famille d'items. */
  | { kind: "inventory"; accept: "all" | "Armes" | "Équipement" | "Esthétique" | "Bourse"; title?: string }
  /** Un texte libre écrit dans la mise en page (une consigne, un titre, une note). */
  | { kind: "text"; html: string; tone?: "normal" | "muted" | "accent" | "callout" }
  /**
   * Un trait, un ornement, ou un peu d'air. `color` : celle du trait et de l'ornement (sinon
   * l'accent) ; l'ornement au milieu : une icône, ou des caractères tapés (« ✦ », « ~ • ~ »).
   */
  | { kind: "divider"; style?: "line" | "space" | "ornament"; color?: string; icon?: string; ornament?: string }
  /** Un bouton : ouvre la fiche de la ligne, une page ou une adresse. */
  | { kind: "button"; label: string; icon?: string; action: "open-form" | "open-page" | "link"; href?: string; formId?: string; tone?: "default" | "outline" | "accent" }

export type LayoutBlockKind = LayoutBlock["kind"]

export const layoutBlockKinds: Array<{ value: LayoutBlockKind; label: string; hint: string; hover?: boolean; form?: boolean }> = [
  { value: "levels", label: "Paliers", hint: "Des niveaux (« Niveau 1 », « Niveau 2 »…), chacun avec son texte ; le niveau en cours est mis en avant. Comme le survol d’un état.", hover: true, form: true },
  { value: "tiles", label: "Tuiles de valeurs", hint: "Des nombres en petites tuiles colorées (FOR, DEX…). Comme les caractéristiques d’un PNJ.", hover: true, form: true },
  { value: "inventory", label: "Inventaire", hint: "Un inventaire propre à la ligne : tout ce qu’on veut, ou une seule famille d’items (armes, équipement…).", form: true },
  { value: "text", label: "Texte libre", hint: "Une consigne, une note, un sous-titre écrit dans la mise en page.", hover: true, form: true },
  { value: "divider", label: "Séparateur", hint: "Un trait fin, un ornement, ou un peu d’air.", hover: true, form: true },
  { value: "button", label: "Bouton", hint: "Ouvre la fiche de la ligne, une page créée ou une adresse.", hover: true, form: true },
]

/** Le préfixe de la clé d'un bloc (sa « colonne ») : il ne peut pas être le nom d'une colonne. */
export const BLOCK_KEY_PREFIX = "bloc:"

export const isBlockKey = (column: string) => column.startsWith(BLOCK_KEY_PREFIX)

export type LayoutField = {
  column: string
  span?: LayoutSpan
  /** Le nom de la colonne n'est pas écrit au-dessus du champ. */
  hideLabel?: boolean
  /** Le champ en grand (un nom, un titre). */
  large?: boolean
  /** Le texte écrit au-dessus du champ à la place du nom de la colonne (« Actifs »). */
  label?: string
  /** Un bloc (paliers, tuiles, inventaire…) à la place d'une colonne ; `column` est alors sa clé « bloc:… ». */
  block?: LayoutBlock
  /** Une icône devant le libellé du champ. */
  icon?: string
  /** La couleur du libellé (et de l'icône). */
  color?: string
}

export type LayoutRow = { id: string; fields: LayoutField[] }

/** L'allure d'une section : nue, encadrée, teintée de sa couleur, ou avec un bandeau coloré en titre. */
export type SectionLook = "plain" | "framed" | "tinted" | "banner"

export type LayoutSection = {
  id: string
  /** Titre écrit au-dessus de la section (« Caractéristiques »). */
  title?: string
  /** Section dans un cadre (ancien réglage ; vaut `look: "framed"`). */
  framed?: boolean
  /** L'allure de la section. */
  look?: SectionLook
  /** La couleur de la section (titre, icône, cadre teinté, bandeau) ; sinon la couleur d'accent. */
  color?: string
  /** Une icône devant le titre. */
  icon?: string
  /** Repliable (fermée d'emblée si `collapsed`). */
  collapsible?: boolean
  collapsed?: boolean
  /** Les colonnes de la section, côte à côte : 1 (lignes pleines), 2 ou 3 colonnes égales où les lignes se suivent. */
  columns?: 1 | 2 | 3
  rows: LayoutRow[]
}

export type IndexLayout = {
  /** La colonne latérale : portrait, image, icône… empilés. */
  aside: LayoutField[]
  asideWidth?: "sm" | "md" | "lg"
  /** La colonne latérale à gauche (d'office) ou à droite. */
  asideSide?: "left" | "right"
  sections: LayoutSection[]
  /** Les colonnes que la mise en page ne place pas : à la suite, ou masquées. */
  rest?: "show" | "hide"
  /** La couleur d'accent de la mise en page : fixe (« #927640 ») ou lue dans une colonne (« {Couleur} »). */
  accent?: string
  /** Survol seulement : la colonne de l'image (ou de l'icône) en tête, et celle du sous-titre (ancien réglage, voir `subtitles`). */
  image?: string
  subtitle?: string
  /** Survol : les colonnes du sous-titre, écrites l'une après l'autre, séparées par « • ». */
  subtitles?: string[]
  /** Survol : la colonne de l'icône devant le nom ; l'image ou l'icône sur un médaillon à la couleur de l'accent (ancien réglage, voir `medallion`). */
  icon?: string
  tint?: boolean
  /**
   * Survol : le médaillon en tête (« Ajouter un médaillon ») : sa colonne (une image ou une
   * icône, au choix de la case ; absente : l'image ou l'icône de la ligne), sa taille en
   * pixels, rond ou carré, sur un fond à la couleur de l'accent.
   */
  medallion?: { column?: string; size?: number; round?: boolean; tint?: boolean; /** Sans fond ni cadre (image détourée). */ bare?: boolean }
  /** Survol : une image en bannière au-dessus du nom (une colonne image ; sa hauteur en pixels). */
  banner?: { column?: string; height?: number }
  /** Survol : le nom prend la couleur de l'accent. */
  nameInAccent?: boolean
  /** La largeur de la carte de survol. */
  width?: "sm" | "md" | "lg"
  /** Les sections deviennent des onglets (une à la fois, la première ouverte) ; la colonne latérale reste. */
  tabs?: boolean
  /** Le style d'ensemble : le fond, l'allure des libellés. Le réglage d'un champ l'emporte toujours. */
  look?: LayoutLook
}

/**
 * Le style d'ensemble d'une mise en page. `background` : « tint » (une teinte de l'accent), une
 * couleur fixe (« #… ») ou lue dans une colonne (« {Couleur} », en teinte). Les libellés : leur
 * couleur, leur taille, en capitales ou non, en gras ou non.
 */
export type LayoutLook = {
  background?: string
  labelColor?: string
  labelSize?: "sm" | "md" | "lg"
  labelCase?: "upper" | "normal"
  labelWeight?: "normal" | "bold"
}

/** Les colonnes du sous-titre d'un survol (la nouvelle liste, sinon l'ancien sous-titre seul). */
export function subtitleColumnsOf(layout: Pick<IndexLayout, "subtitle" | "subtitles">): string[] {
  return layout.subtitles?.length ? layout.subtitles : layout.subtitle ? [layout.subtitle] : []
}

function cleanLook(input: unknown): LayoutLook | undefined {
  if (!input || typeof input !== "object") return undefined
  const raw = input as Record<string, unknown>
  const look: LayoutLook = {}
  const background = raw.background === "tint" ? "tint" : cleanColor(raw.background)
  if (background) look.background = background
  const labelColor = cleanColor(raw.labelColor)
  if (labelColor) look.labelColor = labelColor
  if (raw.labelSize === "sm" || raw.labelSize === "md" || raw.labelSize === "lg") look.labelSize = raw.labelSize
  if (raw.labelCase === "upper" || raw.labelCase === "normal") look.labelCase = raw.labelCase
  if (raw.labelWeight === "normal" || raw.labelWeight === "bold") look.labelWeight = raw.labelWeight
  return Object.keys(look).length ? look : undefined
}

/** Un formulaire de plus, sous son nom (« Fiche courte », « Fiche de combat »). */
export type NamedLayout = { id: string; name: string; layout: IndexLayout }

/**
 * Les mises en page d'un onglet : `form` est le formulaire étoilé (celui qu'ouvre le nom
 * d'une ligne), `forms` les autres formulaires, `hover` le survol étoilé (celui des
 * citations « { »), `hovers` les autres survols, gardés pour passer de l'un à l'autre.
 */
export type TabLayouts = { form?: IndexLayout; hover?: IndexLayout; forms?: NamedLayout[]; hovers?: NamedLayout[] }

export type LayoutKind = "form" | "hover"

/** L'identifiant du formulaire étoilé dans la liste des formulaires d'un onglet. */
export const DEFAULT_FORM_ID = "principal"

/** Tous les formulaires d'un onglet, le formulaire étoilé en tête (sous l'identifiant `principal`). */
export function tabFormsOf(entry: TabLayouts | null | undefined): NamedLayout[] {
  const others = (entry?.forms ?? []).filter((item) => item.id !== DEFAULT_FORM_ID)
  return [...(entry?.form ? [{ id: DEFAULT_FORM_ID, name: "Formulaire principal", layout: entry.form }] : []), ...others]
}

/** Un formulaire d'un onglet par son identifiant ; absent ou inconnu : le formulaire étoilé. */
export function formOf(entry: TabLayouts | null | undefined, formId?: string | null): IndexLayout | null {
  if (!entry) return null
  if (formId && formId !== DEFAULT_FORM_ID) return entry.forms?.find((item) => item.id === formId)?.layout ?? entry.form ?? null
  return entry.form ?? null
}

/** Le survol d'un onglet par l'identifiant de sa version (choisie par une présentation) ; absent ou inconnu : l'étoilé. */
export function hoverVersionOf(entry: TabLayouts | null | undefined, hoverId?: string | null): IndexLayout | null {
  if (!entry) return null
  if (hoverId && hoverId !== DEFAULT_FORM_ID) return entry.hovers?.find((item) => item.id === hoverId)?.layout ?? entry.hover ?? null
  return entry.hover ?? null
}

/** Une mise en page (fiche ou survol) enregistrée sous un nom, pour l'appliquer à d'autres onglets. */
export type LayoutPreset = { id: string; name: string; kind: LayoutKind; layout: IndexLayout; updatedAt: string }

const MAX_SECTIONS = 30
const MAX_ROWS = 40
const MAX_FIELDS = 12
const spans = new Set<number>(layoutSpans.map((span) => span.value))

export function layoutId() {
  return Math.random().toString(36).slice(2, 10)
}

function cleanText(value: unknown, max = 80) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : ""
}

const colorPattern = /^(#[0-9a-f]{3,8}|\{[^{}]{1,120}\}|muted|accent)$/i

function cleanColor(value: unknown) {
  const text = cleanText(value, 130)
  return colorPattern.test(text) ? text : ""
}

const inventoryAccepts = new Set(["all", "Armes", "Équipement", "Esthétique", "Bourse"])

/** Un bloc lu, borné ; `null` s'il est illisible. */
export function cleanLayoutBlock(input: unknown): LayoutBlock | null {
  if (!input || typeof input !== "object") return null
  const raw = input as Record<string, unknown>
  switch (raw.kind) {
    case "levels": {
      const levels = (Array.isArray(raw.levels) ? raw.levels : []).flatMap((item): Array<{ label: string; column: string }> => {
        if (!item || typeof item !== "object") return []
        const level = item as Record<string, unknown>
        const column = cleanText(level.column, 120)
        return column ? [{ label: cleanText(level.label, 40) || "Niveau", column }] : []
      }).slice(0, 6)
      if (!levels.length) return null
      const block: LayoutBlock = { kind: "levels", levels }
      const current = cleanText(raw.current, 120)
      const rules = cleanText(raw.rules, 120)
      const rulesLabel = cleanText(raw.rulesLabel, 40)
      if (current) block.current = current
      if (rules) block.rules = rules
      if (rulesLabel) block.rulesLabel = rulesLabel
      return block
    }
    case "tiles": {
      const columns = (Array.isArray(raw.columns) ? raw.columns : []).map((item) => cleanText(item, 120)).filter(Boolean).slice(0, 12)
      if (!columns.length) return null
      const block: LayoutBlock = { kind: "tiles", columns }
      if (raw.colors && typeof raw.colors === "object") {
        const colors = Object.fromEntries(Object.entries(raw.colors as Record<string, unknown>).flatMap(([column, color]) => { const clean = cleanColor(color); return clean && columns.includes(column) ? [[column, clean]] : [] }))
        if (Object.keys(colors).length) block.colors = colors
      }
      if (typeof raw.perRow === "number" && raw.perRow >= 1 && raw.perRow <= 12) block.perRow = Math.round(raw.perRow)
      // « Noms abrégés » décoché s'enregistre `false` : sans réglage, la fiche en lecture abrège.
      if (typeof raw.short === "boolean") block.short = raw.short
      return block
    }
    case "inventory": {
      const accept = typeof raw.accept === "string" && inventoryAccepts.has(raw.accept) ? raw.accept as Extract<LayoutBlock, { kind: "inventory" }>["accept"] : "all"
      const title = cleanText(raw.title, 60)
      return { kind: "inventory", accept, ...(title ? { title } : {}) }
    }
    case "text": {
      const html = typeof raw.html === "string" ? raw.html.trim().slice(0, 4000) : ""
      const tone = raw.tone === "muted" || raw.tone === "accent" || raw.tone === "callout" ? raw.tone : undefined
      return { kind: "text", html, ...(tone ? { tone } : {}) }
    }
    case "divider": {
      const style = raw.style === "space" || raw.style === "ornament" ? raw.style : undefined
      const color = cleanColor(raw.color)
      const icon = cleanText(raw.icon, 40)
      const ornament = cleanText(raw.ornament, 16)
      return { kind: "divider", ...(style ? { style } : {}), ...(color ? { color } : {}), ...(icon ? { icon } : {}), ...(ornament ? { ornament } : {}) }
    }
    case "button": {
      const action = raw.action === "open-page" || raw.action === "link" ? raw.action : "open-form"
      const block: LayoutBlock = { kind: "button", label: cleanText(raw.label, 60) || "Ouvrir", action }
      const icon = cleanText(raw.icon, 40)
      const href = cleanText(raw.href, 400)
      const formId = cleanText(raw.formId, 40)
      if (icon) block.icon = icon
      if (href) block.href = href
      if (formId) block.formId = formId
      if (raw.tone === "outline" || raw.tone === "accent") block.tone = raw.tone
      return block
    }
    default: return null
  }
}

function cleanField(input: unknown): LayoutField | null {
  if (!input || typeof input !== "object") return null
  const raw = input as Record<string, unknown>
  const column = cleanText(raw.column, 120)
  if (!column) return null
  const field: LayoutField = { column }
  if (typeof raw.span === "number" && spans.has(raw.span)) field.span = raw.span as LayoutSpan
  if (raw.hideLabel === true) field.hideLabel = true
  if (raw.large === true) field.large = true
  const label = cleanText(raw.label, 60)
  if (label) field.label = label
  const icon = cleanText(raw.icon, 40)
  if (icon) field.icon = icon
  const color = cleanColor(raw.color)
  if (color) field.color = color
  if (isBlockKey(column)) {
    const block = cleanLayoutBlock(raw.block)
    if (!block) return null
    field.block = block
  }
  return field
}

/**
 * Une mise en page lue (JSON de la feuille ou envoyé par l'éditeur), bornée et nettoyée ; null si
 * illisible, ou si vide (l'onglet garde alors l'affichage automatique). `keepEmpty` : un
 * formulaire ou un survol nommé vidé reste, vide, avec son nom, jusqu'à « Supprimer ».
 */
export function parseIndexLayout(input: unknown, options: { keepEmpty?: boolean } = {}): IndexLayout | null {
  let value = input
  if (typeof value === "string") {
    if (!value.trim()) return null
    try { value = JSON.parse(value) } catch { return null }
  }
  if (!value || typeof value !== "object") return null
  const raw = value as Record<string, unknown>
  const seen = new Set<string>()
  const keep = (field: LayoutField | null) => {
    if (!field || seen.has(foldName(field.column))) return null
    seen.add(foldName(field.column))
    return field
  }
  const aside = (Array.isArray(raw.aside) ? raw.aside : []).map(cleanField).map(keep).filter((field): field is LayoutField => Boolean(field)).slice(0, MAX_FIELDS)
  const sections = (Array.isArray(raw.sections) ? raw.sections : []).slice(0, MAX_SECTIONS).flatMap((entry): LayoutSection[] => {
    if (!entry || typeof entry !== "object") return []
    const section = entry as Record<string, unknown>
    const rows = (Array.isArray(section.rows) ? section.rows : []).slice(0, MAX_ROWS).flatMap((rowEntry): LayoutRow[] => {
      if (!rowEntry || typeof rowEntry !== "object") return []
      const row = rowEntry as Record<string, unknown>
      const fields = (Array.isArray(row.fields) ? row.fields : []).map(cleanField).map(keep).filter((field): field is LayoutField => Boolean(field)).slice(0, MAX_FIELDS)
      return [{ id: cleanText(row.id, 20) || layoutId(), fields }]
    })
    const title = cleanText(section.title)
    const look = section.look === "plain" || section.look === "framed" || section.look === "tinted" || section.look === "banner" ? section.look : undefined
    const color = cleanColor(section.color)
    const icon = cleanText(section.icon, 40)
    const columns = section.columns === 2 || section.columns === 3 ? section.columns : undefined
    return [{
      id: cleanText(section.id, 20) || layoutId(),
      ...(title ? { title } : {}),
      ...(section.framed === true ? { framed: true } : {}),
      ...(look ? { look } : {}),
      ...(color ? { color } : {}),
      ...(icon ? { icon } : {}),
      ...(section.collapsible === true ? { collapsible: true } : {}),
      ...(section.collapsed === true ? { collapsed: true } : {}),
      ...(columns ? { columns } : {}),
      rows,
    }]
  })
  const layout: IndexLayout = { aside, sections }
  if (raw.asideWidth === "sm" || raw.asideWidth === "md" || raw.asideWidth === "lg") layout.asideWidth = raw.asideWidth
  if (raw.asideSide === "right") layout.asideSide = "right"
  if (raw.rest === "hide") layout.rest = "hide"
  else if (raw.rest === "show") layout.rest = "show"
  const accent = cleanColor(raw.accent)
  if (accent) layout.accent = accent
  const image = cleanText(raw.image, 120)
  const subtitle = cleanText(raw.subtitle, 120)
  const subtitles = (Array.isArray(raw.subtitles) ? raw.subtitles : []).map((item) => cleanText(item, 120)).filter(Boolean).slice(0, 4)
  const icon = cleanText(raw.icon, 120)
  if (image) layout.image = image
  if (subtitles.length) layout.subtitles = subtitles
  else if (subtitle) layout.subtitle = subtitle
  if (icon) layout.icon = icon
  if (raw.tint === true) layout.tint = true
  if (raw.medallion && typeof raw.medallion === "object") {
    const medallion = raw.medallion as Record<string, unknown>
    const column = cleanText(medallion.column, 120)
    const size = typeof medallion.size === "number" && Number.isFinite(medallion.size) ? Math.max(20, Math.min(160, Math.round(medallion.size))) : undefined
    layout.medallion = { ...(column ? { column } : {}), ...(size ? { size } : {}), ...(medallion.round === true ? { round: true } : {}), ...(medallion.tint === true ? { tint: true } : {}), ...(medallion.bare === true ? { bare: true } : {}) }
  }
  if (raw.banner && typeof raw.banner === "object") {
    const banner = raw.banner as Record<string, unknown>
    const column = cleanText(banner.column, 120)
    const height = typeof banner.height === "number" && Number.isFinite(banner.height) ? Math.max(40, Math.min(400, Math.round(banner.height))) : undefined
    layout.banner = { ...(column ? { column } : {}), ...(height ? { height } : {}) }
  }
  if (raw.nameInAccent === true) layout.nameInAccent = true
  if (raw.width === "sm" || raw.width === "lg") layout.width = raw.width
  if (raw.tabs === true) layout.tabs = true
  const look = cleanLook(raw.look)
  if (look) layout.look = look
  // Vide gardé seulement pour une vraie mise en page (des sections ou une colonne de côté), pas un objet quelconque.
  const keepEmpty = options.keepEmpty && (Array.isArray(raw.sections) || Array.isArray(raw.aside))
  if (!keepEmpty && !aside.length && !sections.some((section) => section.rows.some((row) => row.fields.length)) && !image && !subtitle && !subtitles.length && !layout.medallion && !layout.banner) return null
  return layout
}

/** Un formulaire nommé lu (identifiant, nom, mise en page, vide compris) ; `null` s'il est illisible. */
export function parseNamedLayout(input: unknown): NamedLayout | null {
  if (!input || typeof input !== "object") return null
  const raw = input as Record<string, unknown>
  const id = cleanText(raw.id, 40).replace(/[^A-Za-z0-9-]/g, "")
  const layout = parseIndexLayout(raw.layout, { keepEmpty: true })
  if (!id || !layout) return null
  return { id, name: cleanText(raw.name, 60) || "Formulaire", layout }
}

/** Les mises en page d'un onglet lues d'un enregistrement (`{ form, hover, forms }`). */
export function parseTabLayouts(input: unknown): TabLayouts | null {
  let value = input
  if (typeof value === "string") {
    if (!value.trim()) return null
    try { value = JSON.parse(value) } catch { return null }
  }
  if (!value || typeof value !== "object") return null
  const raw = value as Record<string, unknown>
  const form = parseIndexLayout(raw.form)
  const hover = parseIndexLayout(raw.hover)
  const forms = parseNamedLayouts(raw.forms)
  const hovers = parseNamedLayouts(raw.hovers)
  if (!form && !hover && !forms.length && !hovers.length) return null
  return { ...(form ? { form } : {}), ...(hover ? { hover } : {}), ...(forms.length ? { forms } : {}), ...(hovers.length ? { hovers } : {}) }
}

/** Une liste de mises en page nommées (formulaires ou survols de plus) : lisibles, sans doublon, 12 au plus. */
export function parseNamedLayouts(input: unknown): NamedLayout[] {
  const seen = new Set<string>([DEFAULT_FORM_ID])
  return (Array.isArray(input) ? input : []).map(parseNamedLayout).filter((item): item is NamedLayout => Boolean(item) && !seen.has(item!.id) && Boolean(seen.add(item!.id))).slice(0, 12)
}

/** Le texte JSON d'un formulaire nommé. */
export function serializeNamedLayouts(forms: NamedLayout[] | undefined) {
  return JSON.stringify((forms ?? []).map((item) => ({ id: item.id, name: item.name, layout: serializeIndexLayout(item.layout, { keepEmpty: true }) })))
}

/** Le texte JSON gardé dans la feuille (vide : pas de mise en page). */
export function serializeIndexLayout(layout: IndexLayout | null | undefined, options: { keepEmpty?: boolean } = {}) {
  const clean = layout ? parseIndexLayout(layout, options) : null
  return clean ? JSON.stringify(clean) : ""
}

/** Une mise en page dont les colonnes renommées (ancien nom → nouveau) suivent leur nouveau nom. */
export function renameLayoutColumns(layout: IndexLayout, renames: Map<string, string>): IndexLayout {
  if (!renames.size) return layout
  const rename = (column: string) => renames.get(foldName(column)) ?? column
  const block = (item: LayoutBlock): LayoutBlock => {
    switch (item.kind) {
      case "levels": return { ...item, levels: item.levels.map((level) => ({ ...level, column: rename(level.column) })), ...(item.current ? { current: rename(item.current) } : {}), ...(item.rules ? { rules: rename(item.rules) } : {}) }
      case "tiles": return { ...item, columns: item.columns.map(rename), ...(item.colors ? { colors: Object.fromEntries(Object.entries(item.colors).map(([column, color]) => [rename(column), color])) } : {}) }
      default: return item
    }
  }
  const field = (item: LayoutField) => item.block ? { ...item, block: block(item.block) } : { ...item, column: rename(item.column) }
  return {
    ...layout,
    aside: layout.aside.map(field),
    sections: layout.sections.map((section) => ({ ...section, rows: section.rows.map((row) => ({ ...row, fields: row.fields.map(field) })) })),
    ...(layout.image ? { image: rename(layout.image) } : {}),
    ...(layout.subtitle ? { subtitle: rename(layout.subtitle) } : {}),
    ...(layout.subtitles ? { subtitles: layout.subtitles.map(rename) } : {}),
    ...(layout.icon ? { icon: rename(layout.icon) } : {}),
    ...(layout.medallion?.column ? { medallion: { ...layout.medallion, column: rename(layout.medallion.column) } } : {}),
    ...(layout.banner?.column ? { banner: { ...layout.banner, column: rename(layout.banner.column) } } : {}),
  }
}

/** Les mises en page d'un onglet (étoilée, autres formulaires, survol) dont les colonnes renommées suivent leur nouveau nom. */
export function renameTabLayouts(entry: TabLayouts, renames: Map<string, string>): TabLayouts {
  if (!renames.size) return entry
  return {
    ...(entry.form ? { form: renameLayoutColumns(entry.form, renames) } : {}),
    ...(entry.hover ? { hover: renameLayoutColumns(entry.hover, renames) } : {}),
    ...(entry.forms ? { forms: entry.forms.map((item) => ({ ...item, layout: renameLayoutColumns(item.layout, renames) })) } : {}),
    ...(entry.hovers ? { hovers: entry.hovers.map((item) => ({ ...item, layout: renameLayoutColumns(item.layout, renames) })) } : {}),
  }
}

export type ArrangedField<T> = LayoutField & { item: T }
export type ArrangedSection<T> = Pick<LayoutSection, "id" | "title" | "framed" | "look" | "color" | "icon" | "collapsible" | "collapsed" | "columns"> & { rows: Array<{ id: string; fields: Array<ArrangedField<T>> }> }
export type ArrangedLayout<T> = {
  aside: Array<ArrangedField<T>>
  asideWidth: "sm" | "md" | "lg"
  asideSide: "left" | "right"
  accent?: string
  look?: LayoutLook
  sections: Array<ArrangedSection<T>>
  /** Les sections en onglets. */
  tabs?: boolean
  /** Les éléments que la mise en page ne place pas (affichés à la suite, sauf « masquées »). */
  rest: T[]
}

/**
 * Range des éléments (champs de la fiche, cases du survol) selon la mise en page. `keyOf`
 * donne la colonne de chaque élément. Une colonne de la mise en page absente des éléments
 * est sautée ; une ligne ou une section vide disparaît. Un bloc (paliers, tuiles…) est
 * gardé si `blockItem` lui donne un élément.
 */
export function arrangeLayout<T>(layout: IndexLayout, items: T[], keyOf: (item: T) => string, blockItem?: (field: LayoutField & { block: LayoutBlock }) => T | null): ArrangedLayout<T> {
  const byColumn = new Map(items.map((item) => [foldName(keyOf(item)), item]))
  const used = new Set<string>()
  const take = (field: LayoutField): ArrangedField<T>[] => {
    if (field.block) {
      const item = blockItem?.({ ...field, block: field.block })
      return item ? [{ ...field, item }] : []
    }
    const key = foldName(field.column)
    const item = byColumn.get(key)
    if (!item || used.has(key)) return []
    used.add(key)
    return [{ ...field, item }]
  }
  const aside = layout.aside.flatMap(take)
  const sections = layout.sections.map((section): ArrangedSection<T> => ({
    id: section.id,
    title: section.title,
    framed: section.framed,
    look: section.look,
    color: section.color,
    icon: section.icon,
    collapsible: section.collapsible,
    collapsed: section.collapsed,
    columns: section.columns,
    rows: section.rows.map((row) => ({ id: row.id, fields: row.fields.flatMap(take) })).filter((row) => row.fields.length),
  })).filter((section) => section.rows.length || section.title)
  const rest = layout.rest === "hide" ? [] : items.filter((item) => !used.has(foldName(keyOf(item))))
  return { aside, asideWidth: layout.asideWidth ?? "md", asideSide: layout.asideSide ?? "left", ...(layout.accent ? { accent: layout.accent } : {}), ...(layout.look ? { look: layout.look } : {}), sections, ...(layout.tabs ? { tabs: true } : {}), rest }
}

/** La clé d'un nouveau bloc. */
export function blockKey() {
  return `${BLOCK_KEY_PREFIX}${layoutId()}`
}

/** Toutes les colonnes qu'un bloc lit. */
export function blockColumns(block: LayoutBlock): string[] {
  switch (block.kind) {
    case "levels": return [...block.levels.map((level) => level.column), ...(block.current ? [block.current] : []), ...(block.rules ? [block.rules] : [])]
    case "tiles": return block.columns
    default: return []
  }
}

/** Une couleur réglée (« #… », « {Colonne} », « accent ») résolue pour une ligne. */
export function resolveLayoutColor(value: string | undefined, accent: string, valueOf?: (column: string) => string): string {
  if (!value || value === "accent") return accent
  if (value === "muted") return "var(--muted-foreground)"
  const match = value.match(/^\{([^{}]+)\}$/)
  if (match) {
    const read = valueOf?.(match[1].trim()) ?? ""
    return /^#[0-9a-f]{3,8}$/i.test(read.trim()) ? read.trim() : accent
  }
  return value
}

/**
 * Une mise en page de départ, proche de l'affichage automatique : les images dans la
 * colonne latérale, le nom en grand sur toute la ligne, le reste deux par deux et les
 * textes longs sur toute la ligne.
 */
export function startingLayout(columns: Array<{ header: string; picture?: boolean; long?: boolean; name?: boolean }>): IndexLayout {
  const aside = columns.filter((column) => column.picture).map((column): LayoutField => ({ column: column.header }))
  const rows: LayoutRow[] = []
  let pending: LayoutField[] = []
  const flush = () => { if (pending.length) rows.push({ id: layoutId(), fields: pending }); pending = [] }
  for (const column of columns) {
    if (column.picture) continue
    if (column.name || column.long) { flush(); rows.push({ id: layoutId(), fields: [{ column: column.header, span: 12, ...(column.name ? { large: true } : {}) }] }); continue }
    pending.push({ column: column.header, span: 6 })
    if (pending.length === 2) flush()
  }
  flush()
  return { aside, sections: [{ id: layoutId(), rows }] }
}

/**
 * Les colonnes qu'un onglet affiche « deux par ligne », les textes longs et les sorts sur
 * toute la ligne : ce que la fiche automatique faisait. Exprimé en mise en page pour que
 * l'éditeur montre le formulaire réellement utilisé et qu'on parte de lui.
 */
export function automaticFormLayout(columns: Array<{ header: string; picture?: boolean; wide?: boolean }>): IndexLayout {
  const aside = columns.filter((column) => column.picture).map((column): LayoutField => ({ column: column.header, hideLabel: false }))
  const rows: LayoutRow[] = []
  let pending: LayoutField[] = []
  const flush = () => { if (pending.length) rows.push({ id: layoutId(), fields: pending }); pending = [] }
  for (const column of columns) {
    if (column.picture) continue
    if (column.wide) { flush(); rows.push({ id: layoutId(), fields: [{ column: column.header, span: 12 }] }); continue }
    pending.push({ column: column.header, span: 6 })
    if (pending.length === 2) flush()
  }
  flush()
  return { aside, asideSide: "right", asideWidth: "md", sections: [{ id: layoutId(), rows }], rest: "show" }
}

/**
 * Le survol automatique d'une ligne (image ou icône, nom, type, description) exprimé en
 * mise en page : l'éditeur part de lui au lieu d'une page vide.
 */
export function automaticHoverLayout(columns: Array<{ header: string; picture?: boolean; description?: boolean; type?: boolean; color?: boolean; glyph?: boolean }>): IndexLayout {
  const description = columns.find((column) => column.description)
  const type = columns.find((column) => column.type)
  const image = columns.find((column) => column.picture)
  const glyph = columns.find((column) => column.glyph)
  const color = columns.find((column) => column.color)
  return {
    aside: [],
    sections: [{ id: layoutId(), rows: description ? [{ id: layoutId(), fields: [{ column: description.header, span: 12, hideLabel: true }] }] : [] }],
    rest: "hide",
    ...(image || glyph ? { medallion: { column: (image ?? glyph)!.header, size: 48 } } : {}),
    ...(type ? { subtitle: type.header } : {}),
    ...(color ? { accent: `{${color.header}}` } : {}),
  }
}

/** La mise en page place-t-elle cette colonne (colonne latérale, sections, image ou sous-titre du survol) ? */
export function layoutPlaces(layout: IndexLayout | null | undefined, column: string) {
  if (!layout) return false
  const key = foldName(column)
  const fields = [...layout.aside, ...layout.sections.flatMap((section) => section.rows.flatMap((row) => row.fields))]
  return fields.some((field) => field.block ? blockColumns(field.block).some((column) => foldName(column) === key) : foldName(field.column) === key) || [layout.image, ...subtitleColumnsOf(layout), layout.icon, layout.medallion?.column, layout.banner?.column].some((value) => value !== undefined && foldName(value) === key)
}

/** Tous les formulaires d'un onglet (étoilé compris) placent-ils cette colonne ? L'un d'eux suffit. */
export function anyFormPlaces(entry: TabLayouts | null | undefined, column: string) {
  return tabFormsOf(entry).some((item) => layoutPlaces(item.layout, column))
}

/** La mise en page d'un onglet parmi celles d'un index (nom d'onglet sans accents ni casse). */
export function tabLayout(layouts: Record<string, TabLayouts> | null | undefined, tab: string, kind: LayoutKind): IndexLayout | null {
  if (!layouts) return null
  const found = Object.entries(layouts).find(([name]) => foldName(name) === foldName(tab))
  return found?.[1][kind] ?? null
}
