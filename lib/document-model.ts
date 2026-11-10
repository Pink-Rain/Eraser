/**
 * Les documents d'une campagne : une image de fond et, posés dessus, des zones de texte (chacune
 * avec sa police, sa taille, sa couleur et son inclinaison), des lignes droites, des formes
 * (contour, remplissage uni ou en dégradé), des images et des calques de dessin (tracés à la main,
 * gardés comme images), chacun avec son mode de fusion. Règle pure, sans navigateur : le
 * serveur (enregistrement, PDF, Roll20), l'inventaire (un document donné) et l'extension Eraser
 * Doc (`Pink-Rain/Eraser_doc`, qui l'emprunte) s'en servent. L'éditeur, son rendu, ses polices
 * et ses fonds sont dans l'extension ; ici, seulement les clés qu'Eraser vérifie à
 * l'enregistrement (`documentFontKeys`, `builtinBackgroundKeys` : ne jamais en renommer une).
 *
 * Les mesures sont en unités du document : sa largeur vaut toujours `DOCUMENT_WIDTH`, sa
 * hauteur suit les proportions du fond. L'éditeur et le rendu agrandissent le tout d'un même
 * facteur : une zone et son texte gardent leur place sur tous les écrans.
 */

export const DOCUMENT_WIDTH = 1000
/** Largeur du rendu enregistré (image lue dans l'application, envoyée à Roll20, PDF). */
export const DOCUMENT_RENDER_WIDTH = 2000

export type DocumentRun = { text: string; bold?: boolean; italic?: boolean; underline?: boolean; strike?: boolean; color?: string }
/** Un paragraphe : ses morceaux de texte ; « \n » dans un texte est un retour à la ligne. */
export type DocumentParagraph = DocumentRun[]

/** Les polices d'un document (leurs fichiers et leurs noms sont dans l'extension Eraser Doc). */
export const documentFontKeys = ["fell", "cinzel", "dancing", "caveat", "uncial", "medieval", "pirata", "georgia", "manuscrit", "moderne"] as const
export type DocumentFontKey = (typeof documentFontKeys)[number]

export type DocumentAlign = "left" | "center" | "right" | "justify"
export type DocumentVerticalAlign = "top" | "middle" | "bottom"

export type DocumentZone = {
  id: string
  /** Le coin haut gauche, la largeur et la hauteur, avant l'inclinaison (autour du centre). */
  x: number
  y: number
  width: number
  height: number
  /** En degrés, sens des aiguilles d'une montre. */
  rotation: number
  font: DocumentFontKey
  size: number
  color: string
  align: DocumentAlign
  valign: DocumentVerticalAlign
  lineHeight: number
  letterSpacing: number
  opacity: number
  /** L'encre se mêle au papier (mode « produit ») au lieu de le recouvrir. */
  ink: boolean
  /** Le mode de fusion choisi ; absent, celui d'`ink` (produit ou normal). */
  blend?: DocumentBlendMode
  paragraphs: DocumentParagraph[]
}

/**
 * Les modes de fusion d'un élément avec ce qui est dessous (fond, autres éléments), les mêmes dans
 * l'éditeur et dans le rendu. Clés enregistrées : ne jamais en renommer une.
 */
export const documentBlendModes = ["normal", "multiply", "screen", "overlay", "darken", "lighten", "soft-light", "color", "saturation", "luminosity", "addition"] as const
export type DocumentBlendMode = (typeof documentBlendModes)[number]

export const documentLineStyles = ["solid", "dashed", "dotted"] as const
export type DocumentLineStyle = (typeof documentLineStyles)[number]

/** Une ligne droite, d'un point à l'autre (unités du document). */
export type DocumentLine = {
  id: string
  x1: number
  y1: number
  x2: number
  y2: number
  /** L'épaisseur du trait. */
  width: number
  color: string
  style: DocumentLineStyle
  opacity: number
  blend: DocumentBlendMode
}

export const documentShapeKinds = ["rectangle", "ellipse", "triangle", "diamond", "star"] as const
export type DocumentShapeKind = (typeof documentShapeKinds)[number]
/** Le remplissage d'une forme : aucun, uni, dégradé linéaire (selon `gradientAngle`) ou radial. */
export const documentShapeFills = ["none", "solid", "linear", "radial"] as const
export type DocumentShapeFill = (typeof documentShapeFills)[number]

/** Une forme : sa boîte (avant inclinaison), son contour et son remplissage. */
export type DocumentShape = {
  id: string
  shape: DocumentShapeKind
  x: number
  y: number
  width: number
  height: number
  rotation: number
  /** L'arrondi des coins d'un rectangle. */
  radius: number
  /** L'épaisseur du contour ; 0 : pas de contour. */
  strokeWidth: number
  strokeColor: string
  strokeStyle: DocumentLineStyle
  fill: DocumentShapeFill
  fillColor: string
  /** La couleur d'arrivée d'un dégradé, et son opacité (0 : un fondu vers le transparent). */
  fillColor2: string
  fillOpacity2: number
  /** Le sens d'un dégradé linéaire, en degrés (0 : de gauche à droite, 90 : de haut en bas). */
  gradientAngle: number
  opacity: number
  blend: DocumentBlendMode
}

/**
 * Une image posée sur le document (`image`, venue de l'ordinateur) ou un calque de dessin
 * (`drawing`, tracé à la main dans l'éditeur, enregistré comme image). Son fichier est rangé dans
 * Drive avec le document, sous le nom `asset` (`?part=piece-<asset>`).
 */
export type DocumentPicture = {
  id: string
  kind: "image" | "drawing"
  asset: string
  x: number
  y: number
  width: number
  height: number
  rotation: number
  opacity: number
  blend: DocumentBlendMode
}

/** Les fonds fournis (leurs images et leurs zones prêtes à remplir sont dans l'extension Eraser Doc). */
export const builtinBackgroundKeys = ["parchemin", "rouleau", "livre"] as const
export type BuiltinBackgroundKey = (typeof builtinBackgroundKeys)[number]

export type DocumentBackground =
  | { kind: "builtin"; key: BuiltinBackgroundKey }
  /** Une image envoyée depuis l'ordinateur, rangée dans Drive avec le document. */
  | { kind: "upload" }
  | { kind: "url"; url: string }

export type DocumentContent = {
  version: 1
  height: number
  zones: DocumentZone[]
  lines: DocumentLine[]
  shapes: DocumentShape[]
  pictures: DocumentPicture[]
  /** Les identifiants de tous les éléments, du plus bas au plus haut (l'ordre des calques). */
  order: string[]
}

export type CampaignDocumentRecord = {
  id: string
  campaignId: string
  /** La session où le document sert (Créateur de session), ou vide. */
  sessionId: string
  title: string
  background: DocumentBackground
  content: DocumentContent
  /** Change à chaque enregistrement du rendu : sert de version aux images et au PDF. */
  renderVersion: string
  createdByUid: string
  createdAt: string
  updatedAt: string
  /** Le dossier où le MJ l'a rangé dans l'éditeur, ou vide. */
  folder: string
  /** Un modèle : proposé à son auteur dans « Nouveau document », dans toutes ses campagnes. */
  template: boolean
}

const clamp = (value: unknown, min: number, max: number, fallback: number) => {
  const number = typeof value === "number" ? value : Number(value)
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback
}
const text = (value: unknown, max: number) => typeof value === "string" ? value.slice(0, max) : ""
const hexColor = (value: unknown, fallback: string) => /^#[0-9a-f]{6}$/i.test(text(value, 7)) ? text(value, 7).toLowerCase() : fallback

export const DEFAULT_INK = "#2b1d12"

export function cleanDocumentRun(value: unknown): DocumentRun | null {
  if (!value || typeof value !== "object") return null
  const raw = value as Record<string, unknown>
  const content = text(raw.text, 6000)
  if (!content) return null
  const run: DocumentRun = { text: content }
  if (raw.bold === true) run.bold = true
  if (raw.italic === true) run.italic = true
  if (raw.underline === true) run.underline = true
  if (raw.strike === true) run.strike = true
  const color = hexColor(raw.color, "")
  if (color) run.color = color
  return run
}

/** Deux morceaux voisins de même style n'en font qu'un. */
export function mergeRuns(runs: DocumentRun[]) {
  const merged: DocumentRun[] = []
  for (const run of runs) {
    const last = merged.at(-1)
    if (last && Boolean(last.bold) === Boolean(run.bold) && Boolean(last.italic) === Boolean(run.italic) && Boolean(last.underline) === Boolean(run.underline) && Boolean(last.strike) === Boolean(run.strike) && (last.color || "") === (run.color || "")) last.text += run.text
    else merged.push({ ...run })
  }
  return merged
}

export function cleanDocumentZone(value: unknown, height: number): DocumentZone | null {
  if (!value || typeof value !== "object") return null
  const raw = value as Record<string, unknown>
  const paragraphs = Array.isArray(raw.paragraphs)
    ? raw.paragraphs.slice(0, 400).map((paragraph) => Array.isArray(paragraph) ? mergeRuns(paragraph.slice(0, 200).flatMap((run) => cleanDocumentRun(run) ?? [])) : [])
    : []
  const fontKey = (documentFontKeys as readonly string[]).includes(text(raw.font, 20)) ? text(raw.font, 20) as DocumentFontKey : "fell"
  const align = (["left", "center", "right", "justify"] as const).find((candidate) => candidate === raw.align) ?? "left"
  const valign = (["top", "middle", "bottom"] as const).find((candidate) => candidate === raw.valign) ?? "top"
  const width = clamp(raw.width, 20, DOCUMENT_WIDTH * 2, 300)
  const zoneHeight = clamp(raw.height, 12, height * 2, 120)
  return {
    id: /^[\w-]{1,80}$/.test(text(raw.id, 80)) ? text(raw.id, 80) : crypto.randomUUID(),
    x: clamp(raw.x, -DOCUMENT_WIDTH, DOCUMENT_WIDTH * 2, 100),
    y: clamp(raw.y, -height, height * 2, 100),
    width,
    height: zoneHeight,
    rotation: clamp(raw.rotation, -180, 180, 0),
    font: fontKey,
    size: clamp(raw.size, 6, 400, 30),
    color: hexColor(raw.color, DEFAULT_INK),
    align,
    valign,
    lineHeight: clamp(raw.lineHeight, 0.7, 3, 1.35),
    letterSpacing: clamp(raw.letterSpacing, -10, 60, 0),
    opacity: clamp(raw.opacity, 0.05, 1, 1),
    ink: raw.ink !== false,
    ...(isBlendMode(raw.blend) ? { blend: raw.blend } : {}),
    paragraphs,
  }
}

const isBlendMode = (value: unknown): value is DocumentBlendMode => (documentBlendModes as readonly unknown[]).includes(value)
const elementId = (value: unknown) => /^[\w-]{1,80}$/.test(text(value, 80)) ? text(value, 80) : crypto.randomUUID()

export function cleanDocumentLine(value: unknown, height: number): DocumentLine | null {
  if (!value || typeof value !== "object") return null
  const raw = value as Record<string, unknown>
  return {
    id: elementId(raw.id),
    x1: clamp(raw.x1, -DOCUMENT_WIDTH, DOCUMENT_WIDTH * 2, 100),
    y1: clamp(raw.y1, -height, height * 2, 100),
    x2: clamp(raw.x2, -DOCUMENT_WIDTH, DOCUMENT_WIDTH * 2, 300),
    y2: clamp(raw.y2, -height, height * 2, 100),
    width: clamp(raw.width, 0.5, 80, 3),
    color: hexColor(raw.color, DEFAULT_INK),
    style: (documentLineStyles as readonly unknown[]).includes(raw.style) ? raw.style as DocumentLineStyle : "solid",
    opacity: clamp(raw.opacity, 0.05, 1, 1),
    blend: isBlendMode(raw.blend) ? raw.blend : "multiply",
  }
}

export function cleanDocumentShape(value: unknown, height: number): DocumentShape | null {
  if (!value || typeof value !== "object") return null
  const raw = value as Record<string, unknown>
  return {
    id: elementId(raw.id),
    shape: (documentShapeKinds as readonly unknown[]).includes(raw.shape) ? raw.shape as DocumentShapeKind : "rectangle",
    x: clamp(raw.x, -DOCUMENT_WIDTH, DOCUMENT_WIDTH * 2, 100),
    y: clamp(raw.y, -height, height * 2, 100),
    width: clamp(raw.width, 2, DOCUMENT_WIDTH * 3, 200),
    height: clamp(raw.height, 2, height * 3, 200),
    rotation: clamp(raw.rotation, -180, 180, 0),
    radius: clamp(raw.radius, 0, DOCUMENT_WIDTH, 0),
    strokeWidth: clamp(raw.strokeWidth, 0, 80, 3),
    strokeColor: hexColor(raw.strokeColor, DEFAULT_INK),
    strokeStyle: (documentLineStyles as readonly unknown[]).includes(raw.strokeStyle) ? raw.strokeStyle as DocumentLineStyle : "solid",
    fill: (documentShapeFills as readonly unknown[]).includes(raw.fill) ? raw.fill as DocumentShapeFill : "none",
    fillColor: hexColor(raw.fillColor, "#8b1a1a"),
    fillColor2: hexColor(raw.fillColor2, "#f4ead6"),
    fillOpacity2: clamp(raw.fillOpacity2, 0, 1, 1),
    gradientAngle: clamp(raw.gradientAngle, -360, 360, 90),
    opacity: clamp(raw.opacity, 0.05, 1, 1),
    blend: isBlendMode(raw.blend) ? raw.blend : "multiply",
  }
}

export function cleanDocumentPicture(value: unknown, height: number): DocumentPicture | null {
  if (!value || typeof value !== "object") return null
  const raw = value as Record<string, unknown>
  const asset = text(raw.asset, 80)
  if (!/^[\w-]{1,80}$/.test(asset)) return null
  return {
    id: elementId(raw.id),
    kind: raw.kind === "drawing" ? "drawing" : "image",
    asset,
    x: clamp(raw.x, -DOCUMENT_WIDTH, DOCUMENT_WIDTH * 2, 100),
    y: clamp(raw.y, -height, height * 2, 100),
    width: clamp(raw.width, 4, DOCUMENT_WIDTH * 3, 300),
    height: clamp(raw.height, 4, height * 3, 300),
    rotation: clamp(raw.rotation, -180, 180, 0),
    opacity: clamp(raw.opacity, 0.05, 1, 1),
    blend: isBlendMode(raw.blend) ? raw.blend : "normal",
  }
}

export function cleanDocumentBackground(value: unknown): DocumentBackground {
  if (value && typeof value === "object") {
    const raw = value as Record<string, unknown>
    if (raw.kind === "upload") return { kind: "upload" }
    if (raw.kind === "url") {
      try {
        const url = new URL(text(raw.url, 2000))
        if (url.protocol === "https:" || url.protocol === "http:") return { kind: "url", url: url.toString() }
      } catch { /* adresse illisible : le fond par défaut */ }
    }
    if (raw.kind === "builtin" && (builtinBackgroundKeys as readonly string[]).includes(text(raw.key, 20))) return { kind: "builtin", key: raw.key as BuiltinBackgroundKey }
  }
  return { kind: "builtin", key: "parchemin" }
}

export function cleanDocumentContent(value: unknown): DocumentContent {
  const raw = value && typeof value === "object" ? value as Record<string, unknown> : {}
  const height = clamp(raw.height, DOCUMENT_WIDTH * 0.2, DOCUMENT_WIDTH * 4, DOCUMENT_WIDTH)
  const zones = Array.isArray(raw.zones) ? raw.zones.slice(0, 60).flatMap((zone) => cleanDocumentZone(zone, height) ?? []) : []
  const lines = Array.isArray(raw.lines) ? raw.lines.slice(0, 200).flatMap((line) => cleanDocumentLine(line, height) ?? []) : []
  const shapes = Array.isArray(raw.shapes) ? raw.shapes.slice(0, 100).flatMap((shape) => cleanDocumentShape(shape, height) ?? []) : []
  const pictures = Array.isArray(raw.pictures) ? raw.pictures.slice(0, 40).flatMap((picture) => cleanDocumentPicture(picture, height) ?? []) : []
  // Deux éléments ne partagent jamais un identifiant : l'ordre des calques les désigne.
  const seen = new Set<string>()
  const unique = <T extends { id: string }>(element: T) => {
    if (seen.has(element.id)) element.id = crypto.randomUUID()
    seen.add(element.id)
    return element
  }
  zones.forEach(unique); lines.forEach(unique); shapes.forEach(unique); pictures.forEach(unique)
  // L'ordre des calques : ceux qu'il nomme, puis les autres (texte, lignes, formes, images), au-dessus.
  const listed = Array.isArray(raw.order) ? raw.order.filter((id): id is string => typeof id === "string" && seen.has(id)) : []
  const order = [...new Set([...listed, ...zones.map((zone) => zone.id), ...lines.map((line) => line.id), ...shapes.map((shape) => shape.id), ...pictures.map((picture) => picture.id)])]
  return { version: 1, height, zones, lines, shapes, pictures, order }
}

/** Les fichiers d'images d'un document (images posées, calques de dessin). */
export function documentAssets(content: DocumentContent) {
  return [...new Set(content.pictures.map((picture) => picture.asset))]
}

/** Le texte brut d'un document (recherche, accessibilité). */
export function documentPlainText(content: DocumentContent) {
  return content.zones.map((zone) => zone.paragraphs.map((paragraph) => paragraph.map((run) => run.text).join("")).join("\n")).join("\n\n").trim()
}

/* ---------- le document dans un inventaire ---------- */

/**
 * Un document donné à un joueur est un item personnalisé de son inventaire : son nom, et dans
 * le JSON de l'exemplaire (colonne des liens) une entrée « document » qui le désigne. Les
 * versions d'Eraser qui ne la connaissent pas l'ignorent, comme les autres entrées.
 */
export const DOCUMENT_ITEM_TARGET = "document"
export const DOCUMENT_ITEM_TYPE = "Document"

export function documentItemModifiers(campaignId: string, documentId: string) {
  return JSON.stringify([{ target: DOCUMENT_ITEM_TARGET, value: `${campaignId}/${documentId}` }])
}

export function documentOfItem(modifiers: string): { campaignId: string; documentId: string } | null {
  if (!modifiers.includes(`"${DOCUMENT_ITEM_TARGET}"`)) return null
  try {
    const parsed = JSON.parse(modifiers) as unknown
    if (!Array.isArray(parsed)) return null
    for (const entry of parsed) {
      if (!entry || typeof entry !== "object" || (entry as { target?: unknown }).target !== DOCUMENT_ITEM_TARGET) continue
      const match = /^([^/]{1,200})\/([\w-]{1,80})$/.exec(String((entry as { value?: unknown }).value ?? ""))
      if (match) return { campaignId: match[1], documentId: match[2] }
    }
  } catch { /* JSON illisible : pas un document */ }
  return null
}

/** Les entrées « document » d'un JSON d'exemplaire, à garder quand il est réécrit. */
export function documentItemEntries(modifiers: string): Array<{ target: string; value: string }> {
  const found = documentOfItem(modifiers)
  return found ? [{ target: DOCUMENT_ITEM_TARGET, value: `${found.campaignId}/${found.documentId}` }] : []
}

/** Le dossier d'un document : un nom court, sans espaces superflus. */
export function cleanDocumentFolder(value: unknown) {
  return text(value, 200).replace(/\s+/g, " ").trim().slice(0, 80)
}

/** Un fichier d'image du document (fond importé, image posée, calque de dessin), pour l'éditeur. */
export function documentPartUrl(campaignId: string, documentId: string, part: "fond" | `piece-${string}`, version = "") {
  const query = new URLSearchParams({ part })
  if (version) query.set("v", version.replace(/[^0-9A-Za-z]/g, ""))
  return `/api/campaigns/${encodeURIComponent(campaignId)}/documents/${encodeURIComponent(documentId)}/image?${query}`
}

export function documentImageUrl(campaignId: string, documentId: string, version = "") {
  return `/api/campaigns/${encodeURIComponent(campaignId)}/documents/${encodeURIComponent(documentId)}/image${version ? `?v=${encodeURIComponent(version.replace(/[^0-9A-Za-z]/g, ""))}` : ""}`
}

export function documentPdfUrl(campaignId: string, documentId: string, version = "") {
  return `/api/campaigns/${encodeURIComponent(campaignId)}/documents/${encodeURIComponent(documentId)}/pdf${version ? `?v=${encodeURIComponent(version.replace(/[^0-9A-Za-z]/g, ""))}` : ""}`
}

/**
 * L'éditeur des documents d'une campagne, dans l'extension Eraser Doc (l'ancienne page
 * `/campagne/[id]/document` y renvoie) : `document` en ouvre un, `nouveau` en commence un,
 * `session` le range dans cette session.
 */
export function documentStudioHref(campaignId: string, query: { document?: string; nouveau?: boolean; session?: string } = {}) {
  const params = new URLSearchParams()
  if (query.document) params.set("document", query.document)
  if (query.nouveau) params.set("nouveau", "1")
  if (query.session) params.set("session", query.session)
  const search = params.toString()
  return `/extension/doc/campagne/${encodeURIComponent(campaignId)}${search ? `?${search}` : ""}`
}
