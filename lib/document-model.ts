/**
 * Les documents d'une campagne (page « Document » du Créateur de session) : une image de fond
 * et des zones de texte posées dessus, chacune avec sa police, sa taille, sa couleur et son
 * inclinaison. Règle pure, sans navigateur : la page (éditeur et rendu) et le serveur
 * (enregistrement, PDF, Roll20) s'en servent.
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

export const documentFontKeys = ["fell", "cinzel", "dancing", "caveat", "uncial", "medieval", "pirata", "georgia", "manuscrit", "moderne"] as const
export type DocumentFontKey = (typeof documentFontKeys)[number]

export type DocumentFont = {
  label: string
  /** La famille CSS (et le canvas) : la police embarquée d'abord, des remplaçantes ensuite. */
  family: string
  /** Les fichiers embarqués (public/documents/polices) ; aucun pour une police de Windows. */
  files: Array<{ file: string; weight: number; style: "normal" | "italic" }>
}

const font = (label: string, name: string, fallback: string, files: DocumentFont["files"] = []): DocumentFont => ({ label, family: `"${name}", ${fallback}`, files })
const embedded = (slug: string, variants: Array<[number, "normal" | "italic"]>) => variants.map(([weight, style]) => ({ file: `/documents/polices/${slug}-latin-${weight}-${style}.woff2`, weight, style }))

export const documentFonts: Record<DocumentFontKey, DocumentFont> = {
  fell: font("Vieux livre", "IM Fell English", "Georgia, serif", embedded("im-fell-english", [[400, "normal"], [400, "italic"]])),
  cinzel: font("Inscription", "Cinzel", "Georgia, serif", embedded("cinzel", [[400, "normal"], [700, "normal"]])),
  dancing: font("Plume élégante", "Dancing Script", "\"Segoe Script\", cursive", embedded("dancing-script", [[400, "normal"], [700, "normal"]])),
  caveat: font("Écriture pressée", "Caveat", "\"Segoe Print\", cursive", embedded("caveat", [[400, "normal"], [700, "normal"]])),
  uncial: font("Onciale", "Uncial Antiqua", "Georgia, serif", embedded("uncial-antiqua", [[400, "normal"]])),
  medieval: font("Médiéval", "MedievalSharp", "Georgia, serif", embedded("medievalsharp", [[400, "normal"]])),
  pirata: font("Gothique", "Pirata One", "Georgia, serif", embedded("pirata-one", [[400, "normal"]])),
  georgia: font("Georgia", "Georgia", "\"Times New Roman\", serif"),
  manuscrit: font("Manuscrit", "Segoe Print", "\"Comic Sans MS\", cursive"),
  moderne: font("Moderne", "Segoe UI", "Arial, Helvetica, sans-serif"),
}

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
  paragraphs: DocumentParagraph[]
}

export const builtinBackgroundKeys = ["parchemin", "rouleau", "livre"] as const
export type BuiltinBackgroundKey = (typeof builtinBackgroundKeys)[number]

export type DocumentBackground =
  | { kind: "builtin"; key: BuiltinBackgroundKey }
  /** Une image envoyée depuis l'ordinateur, rangée dans Drive avec le document. */
  | { kind: "upload" }
  | { kind: "url"; url: string }

type ZonePreset = Pick<DocumentZone, "x" | "y" | "width" | "height" | "font" | "size" | "align"> & Partial<Pick<DocumentZone, "rotation" | "valign">> & { text: string }

/** Les fonds fournis avec Eraser (2000 × 2000, bords transparents) et des zones prêtes à remplir. */
export const builtinBackgrounds: Record<BuiltinBackgroundKey, { label: string; src: string; width: number; height: number; zones: ZonePreset[] }> = {
  parchemin: {
    label: "Parchemin brûlé", src: "/documents/fonds/parchemin.webp", width: 2000, height: 2000,
    zones: [
      { x: 190, y: 110, width: 620, height: 110, font: "cinzel", size: 46, align: "center", valign: "middle", text: "Titre du document" },
      { x: 190, y: 245, width: 620, height: 640, font: "fell", size: 30, align: "justify", text: "Écris ici le contenu du document…" },
    ],
  },
  rouleau: {
    label: "Rouleau", src: "/documents/fonds/rouleau.webp", width: 2000, height: 2000,
    zones: [
      { x: 185, y: 200, width: 630, height: 95, font: "cinzel", size: 44, align: "center", valign: "middle", text: "Proclamation" },
      { x: 185, y: 310, width: 630, height: 480, font: "dancing", size: 32, align: "center", text: "Écris ici le contenu du rouleau…" },
    ],
  },
  livre: {
    label: "Livre ouvert", src: "/documents/fonds/livre.webp", width: 2000, height: 2000,
    zones: [
      { x: 175, y: 140, width: 290, height: 660, font: "fell", size: 24, align: "justify", text: "Page de gauche…" },
      { x: 530, y: 140, width: 290, height: 660, font: "fell", size: 24, align: "justify", text: "Page de droite…" },
    ],
  },
}

export type DocumentContent = { version: 1; height: number; zones: DocumentZone[] }

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

export function plainParagraphs(content: string): DocumentParagraph[] {
  return content.split("\n").map((line) => line ? [{ text: line }] : [])
}

export function newDocumentZone(partial: Partial<DocumentZone> = {}): DocumentZone {
  return cleanDocumentZone({
    id: crypto.randomUUID(), x: 200, y: 200, width: 600, height: 200, rotation: 0, font: "fell", size: 30, color: DEFAULT_INK,
    align: "left", valign: "top", lineHeight: 1.35, letterSpacing: 0, opacity: 0.92, ink: true, paragraphs: plainParagraphs("Nouveau texte"),
    ...partial,
  }, 2000)!
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
    paragraphs,
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
  return { version: 1, height, zones }
}

/** Le texte brut d'un document (recherche, accessibilité). */
export function documentPlainText(content: DocumentContent) {
  return content.zones.map((zone) => zone.paragraphs.map((paragraph) => paragraph.map((run) => run.text).join("")).join("\n")).join("\n\n").trim()
}

/** Un nouveau document sur un fond fourni : ses zones prêtes à remplir. */
export function documentFromBuiltin(key: BuiltinBackgroundKey): DocumentContent {
  const background = builtinBackgrounds[key]
  const height = DOCUMENT_WIDTH * background.height / background.width
  return {
    version: 1,
    height,
    zones: background.zones.map(({ text: content, ...zone }) => newDocumentZone({ ...zone, paragraphs: plainParagraphs(content) })),
  }
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

export function documentImageUrl(campaignId: string, documentId: string, version = "") {
  return `/api/campaigns/${encodeURIComponent(campaignId)}/documents/${encodeURIComponent(documentId)}/image${version ? `?v=${encodeURIComponent(version.replace(/[^0-9A-Za-z]/g, ""))}` : ""}`
}

export function documentPdfUrl(campaignId: string, documentId: string, version = "") {
  return `/api/campaigns/${encodeURIComponent(campaignId)}/documents/${encodeURIComponent(documentId)}/pdf${version ? `?v=${encodeURIComponent(version.replace(/[^0-9A-Za-z]/g, ""))}` : ""}`
}
