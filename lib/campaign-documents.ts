import {
  addShopLine,
  appendRows,
  campaignDocumentSheetHeaders,
  canonicalRow,
  canonicalRows,
  canonicalWrites,
  clearSpreadsheetReadCache,
  columnName,
  createCharacterInventoryItem,
  ensureJdrSheet,
  getCharacterInventorySummary,
  ensureNamedColumns,
  namedAppendRange,
  namedRowWrites,
  readNamedSheet,
  resolveJdrSheet,
  updateRanges,
} from "@/lib/google-sheets"
import { withAsyncLock } from "@/lib/async-lock"
import { cleanDocumentBackground, cleanDocumentContent, cleanDocumentFolder, cleanDocumentPages, DOCUMENT_ITEM_TYPE, documentAssets, documentItemModifiers, documentPageCount, documentShopLine, MAX_DOCUMENT_PAGES, type CampaignDocumentRecord, type DocumentBackground, type DocumentPage } from "@/lib/document-model"
import { GROUND_CATEGORY } from "@/lib/inventory-schema"
import { pdfFromJpegs } from "@/lib/document-pdf"
import { getSharedMedia, putSharedMedia } from "@/lib/shared-media"

/**
 * Les documents d'une campagne (éditeur : extension Eraser Doc) : une ligne par document dans la
 * feuille « Documents de campagne » (titre, fond et contenu de la première page en JSON, dossier,
 * modèle, et les pages suivantes dans « Pages (JSON) »), et dans Drive les fonds envoyés depuis
 * l'ordinateur, les images posées et les calques de dessin (« pièces »), le rendu de chaque page
 * (WebP, lu dans l'application et par Roll20) et son impression (JPEG sur fond blanc, dont est
 * fait le PDF, une page par page).
 */

const COLUMNS = campaignDocumentSheetHeaders.length
const LAST_COLUMN = columnName(COLUMNS)
/** Une case Google Sheets tient 50 000 caractères : le contenu (et les pages suivantes) reste en dessous. */
const MAX_CONTENT_LENGTH = 48_000

async function documentsSheet() {
  const sheet = await ensureJdrSheet("campaign_documents")
  if (!sheet) throw new Error("DOCUMENTS_SHEET_UNAVAILABLE")
  return sheet
}

async function readDocumentRows() {
  const sheet = await documentsSheet()
  const named = await readNamedSheet(sheet.spreadsheetId, sheet.tabName, campaignDocumentSheetHeaders, { fresh: true })
  const columns = await ensureNamedColumns(sheet.spreadsheetId, sheet.tabName, named.columns)
  return { sheet, columns, rows: named.rows.map((row) => canonicalRow(columns, row)), raw: named.rows, startRow: 2 }
}

function parsed(value: string | undefined) {
  try { return JSON.parse(value || "null") as unknown } catch { return null }
}

function documentFromRow(row: string[]): CampaignDocumentRecord | null {
  if (!row[0] || !row[1]) return null
  return {
    id: row[0],
    campaignId: row[1],
    sessionId: row[2] || "",
    title: row[3] || "Document sans titre",
    background: cleanDocumentBackground(parsed(row[4])),
    content: cleanDocumentContent(parsed(row[5])),
    renderVersion: row[6] || "",
    createdByUid: row[7] || "",
    createdAt: row[8] || "",
    updatedAt: row[9] || "",
    folder: cleanDocumentFolder(row[10]),
    template: row[11] === "oui",
    pages: cleanDocumentPages(parsed(row[12])),
    journal: (row[13] || "").slice(0, 200),
  }
}

function documentRow(document: CampaignDocumentRecord) {
  return [document.id, document.campaignId, document.sessionId, document.title, JSON.stringify(document.background), JSON.stringify(document.content), document.renderVersion, document.createdByUid, document.createdAt, document.updatedAt, document.folder, document.template ? "oui" : "", document.pages.length ? JSON.stringify(document.pages) : "", document.journal]
}

function documentCells(document: CampaignDocumentRecord): Record<string, string> {
  const row = documentRow(document)
  return Object.fromEntries(campaignDocumentSheetHeaders.map((header, index) => [header, row[index] ?? ""]))
}

/**
 * Les documents d'une campagne, pour l'affichage : la feuille n'est jamais créée ici (elle
 * l'est au premier document enregistré) et la lecture est partagée entre installations.
 */
export async function listCampaignDocuments(campaignId: string) {
  const sheet = await resolveJdrSheet("campaign_documents")
  if (!sheet) return []
  const named = await readNamedSheet(sheet.spreadsheetId, sheet.tabName, campaignDocumentSheetHeaders)
  return named.rows.map((row) => documentFromRow(canonicalRow(named.columns, row)))
    .filter((document): document is CampaignDocumentRecord => Boolean(document && document.campaignId === campaignId))
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.title.localeCompare(right.title, "fr"))
}

export async function getCampaignDocument(campaignId: string, documentId: string) {
  return (await listCampaignDocuments(campaignId)).find((document) => document.id === documentId) ?? null
}

/** Les modèles d'un compte, dans toutes ses campagnes (« Nouveau document » de l'éditeur). */
export async function listDocumentTemplates(createdByUid: string) {
  const sheet = await resolveJdrSheet("campaign_documents")
  if (!sheet) return []
  const named = await readNamedSheet(sheet.spreadsheetId, sheet.tabName, campaignDocumentSheetHeaders)
  return named.rows.map((row) => documentFromRow(canonicalRow(named.columns, row)))
    .filter((document): document is CampaignDocumentRecord => Boolean(document?.template && document.createdByUid === createdByUid))
    .sort((left, right) => left.title.localeCompare(right.title, "fr"))
}

/**
 * Une image du document dans Drive : le fond importé (`fond` pour la première page, `fond-<id>`
 * pour une autre), le rendu et l'impression d'une page (`rendu`, `impression` pour la première,
 * `rendu-<n>`, `impression-<n>` pour la n-ième), une pièce (image posée, calque de dessin : son
 * nom dans le contenu).
 */
export type DocumentPart = "fond" | `fond-${string}` | "rendu" | `rendu-${number}` | "impression" | `impression-${number}` | `piece-${string}`
export const isDocumentPiece = (part: string): part is `piece-${string}` => /^piece-[\w-]{1,80}$/.test(part)
/** Le fond importé d'une page après la première. */
export const isDocumentPageBackground = (part: string): part is `fond-${string}` => /^fond-[\w-]{1,80}$/.test(part)
/** Le rendu (ou l'impression) d'une page : la première garde son ancien nom, lu par les versions d'avant. */
export const documentRenderPart = (page: number, kind: "rendu" | "impression" = "rendu"): DocumentPart => page > 1 ? `${kind}-${page}` : kind

const mediaKey = (campaignId: string, documentId: string, part: DocumentPart) => `campaigns/${campaignId}/documents/${documentId}/${part}`

/**
 * Les images d'un enregistrement : celles de la première page (`render`, `print`, `background`),
 * celles des pages suivantes (`pageBackgrounds` par identifiant de page, `pageRenders` et
 * `pagePrints` par numéro de page, à partir de 2) et les pièces.
 */
export type DocumentFiles = {
  render?: File | null
  print?: File | null
  background?: File | null
  pieces?: Map<string, File>
  pageBackgrounds?: Map<string, File>
  pageRenders?: Map<number, File>
  pagePrints?: Map<number, File>
}

function checkedImage(file: File | null | undefined, types: RegExp, maxBytes: number) {
  if (!file) return null
  if (!types.test(file.type) || file.size <= 0 || file.size > maxBytes) throw new Error("INVALID_DOCUMENT_FILE")
  return file
}

/**
 * Crée ou modifie un document : relu juste avant d'écrire, sous verrou. Les images arrivent
 * d'abord dans Drive, la ligne ensuite : une ligne ne désigne jamais un rendu absent.
 * Une modification garde son créateur et sa date de création ; un document d'une autre
 * campagne est refusé.
 */
export async function saveCampaignDocument(campaignId: string, input: { id?: unknown; sessionId?: unknown; title?: unknown; background?: unknown; content?: unknown; pages?: unknown; folder?: unknown; template?: unknown }, files: DocumentFiles, createdByUid: string) {
  const id = typeof input.id === "string" && /^[\w-]{1,80}$/.test(input.id) ? input.id : crypto.randomUUID()
  const title = (typeof input.title === "string" ? input.title : "").trim().slice(0, 160) || "Document sans titre"
  const sessionId = typeof input.sessionId === "string" ? input.sessionId.slice(0, 200) : ""
  const background: DocumentBackground = cleanDocumentBackground(input.background)
  const content = cleanDocumentContent(input.content)
  if (JSON.stringify(content).length > MAX_CONTENT_LENGTH) throw new Error("DOCUMENT_TOO_LONG")
  // Absentes de l'envoi (une version de l'éditeur qui ne connaît pas les pages) : celles d'avant restent.
  const sentPages = input.pages === undefined ? null : cleanDocumentPages(input.pages)
  if (sentPages && JSON.stringify(sentPages).length > MAX_CONTENT_LENGTH) throw new Error("DOCUMENT_TOO_LONG")
  const imageFile = (file: File | null | undefined) => checkedImage(file, /^image\/(webp|png|jpeg)$/, 15 * 1024 * 1024)
  const render = imageFile(files.render)
  const print = checkedImage(files.print, /^image\/jpeg$/, 15 * 1024 * 1024)
  const uploaded = checkedImage(files.background, /^image\//, 15 * 1024 * 1024)
  return withAsyncLock("campaign-documents", async () => {
    const { sheet, columns, rows, raw, startRow } = await readDocumentRows()
    const index = rows.findIndex((row) => row[0] === id)
    const current = index >= 0 ? documentFromRow(rows[index]) : null
    if (index >= 0 && current?.campaignId !== campaignId) throw new Error("DOCUMENT_NOT_FOUND")
    const pages: DocumentPage[] = sentPages ?? current?.pages ?? []
    if (background.kind === "upload" && !uploaded && current?.background.kind !== "upload") throw new Error("DOCUMENT_BACKGROUND_MISSING")
    // Le fond importé d'une page arrive avec elle, ou l'a déjà été (la page existait, sur un fond importé).
    const pageBackgrounds = pages.flatMap((page) => {
      if (page.background.kind !== "upload") return []
      const file = checkedImage(files.pageBackgrounds?.get(page.id), /^image\//, 15 * 1024 * 1024)
      if (!file && current?.pages.find((candidate) => candidate.id === page.id)?.background.kind !== "upload") throw new Error("DOCUMENT_BACKGROUND_MISSING")
      return file ? [[`fond-${page.id}`, file] as [DocumentPart, File]] : []
    })
    // Le rendu et l'impression des pages qui existent ; les autres sont ignorés.
    const count = documentPageCount({ pages })
    const pageImages = (found: Map<number, File> | undefined, kind: "rendu" | "impression") => [...(found ?? new Map<number, File>())]
      .filter(([page]) => Number.isInteger(page) && page >= 2 && page <= count)
      .map(([page, file]) => [documentRenderPart(page, kind), kind === "rendu" ? imageFile(file)! : checkedImage(file, /^image\/jpeg$/, 15 * 1024 * 1024)!] as [DocumentPart, File])
    const pageRenders = pageImages(files.pageRenders, "rendu")
    const pagePrints = pageImages(files.pagePrints, "impression")
    // Seules les pièces que le contenu désigne sont gardées.
    const assets = new Set(documentAssets(content, pages))
    const pieces = [...(files.pieces ?? new Map<string, File>())].flatMap(([asset, file]) => assets.has(asset) ? [[asset, checkedImage(file, /^image\/(webp|png|jpeg|gif)$/, 15 * 1024 * 1024)!] as const] : [])
    // Les images partent ensemble vers Drive (une à une, un document de plusieurs images attendait
    // plusieurs secondes) ; la ligne n'est écrite qu'une fois toutes arrivées.
    const media: Array<[DocumentPart, File]> = [
      ...(uploaded ? [["fond", uploaded] as [DocumentPart, File]] : []),
      ...pageBackgrounds,
      ...pieces.map(([asset, file]) => [`piece-${asset}`, file] as [DocumentPart, File]),
      ...(render ? [["rendu", render] as [DocumentPart, File]] : []),
      ...(print ? [["impression", print] as [DocumentPart, File]] : []),
      ...pageRenders,
      ...pagePrints,
    ]
    await Promise.all(media.map(async ([part, file]) => putSharedMedia(mediaKey(campaignId, id, part), await file.arrayBuffer(), file.type)))
    const now = new Date().toISOString()
    const document: CampaignDocumentRecord = {
      id, campaignId, sessionId, title, background, content, pages,
      // Un rendu (de n'importe quelle page) change la version : les images versionnées sont relues.
      renderVersion: render || pageRenders.length ? now : current?.renderVersion || "",
      createdByUid: current?.createdByUid || createdByUid,
      createdAt: current?.createdAt || now,
      updatedAt: now,
      // Absents de l'envoi (une version de l'éditeur qui ne les connaît pas) : ceux d'avant restent.
      folder: input.folder === undefined ? current?.folder ?? "" : cleanDocumentFolder(input.folder),
      template: input.template === undefined ? current?.template ?? false : input.template === true,
      // Révélé au journal de sa session ; rangé dans une autre session, il y est de nouveau caché.
      journal: current?.journal && current.journal === sessionId ? current.journal : "",
    }
    if (index >= 0) {
      await updateRanges(sheet.spreadsheetId, namedRowWrites(sheet.tabName, columns, startRow + index, documentCells(document)), { valueInputOption: "RAW" })
    } else {
      // Une ligne blanchie par une suppression est réutilisée avant d'ajouter à la fin.
      const free = raw.findIndex((row) => !row.some((cell) => cell?.trim()))
      if (free >= 0) {
        const rowNumber = startRow + free
        await updateRanges(sheet.spreadsheetId, canonicalWrites(sheet.tabName, columns, `A${rowNumber}:${LAST_COLUMN}${rowNumber}`, [documentRow(document)]), { valueInputOption: "RAW" })
      } else {
        await appendRows(sheet.spreadsheetId, namedAppendRange(sheet.tabName, columns), canonicalRows(columns, [documentRow(document)]), { valueInputOption: "RAW" })
      }
    }
    clearSpreadsheetReadCache(sheet.spreadsheetId)
    return document
  })
}

/**
 * Range un document sans le redessiner : sa session (ou aucune), son dossier, s'il est un modèle,
 * s'il est visible dans le journal de sa session (`journal`). Seules les cases données changent ;
 * un document qui change de session y est caché tant que le MJ ne l'a pas révélé.
 */
export async function updateCampaignDocumentPlace(campaignId: string, documentId: string, change: { sessionId?: string; folder?: string; template?: boolean; journal?: boolean }) {
  return withAsyncLock("campaign-documents", async () => {
    const { sheet, columns, rows, startRow } = await readDocumentRows()
    const index = rows.findIndex((row) => row[0] === documentId && row[1] === campaignId)
    const current = index >= 0 ? documentFromRow(rows[index]) : null
    if (!current) throw new Error("DOCUMENT_NOT_FOUND")
    const next = {
      ...current,
      ...(change.sessionId === undefined ? {} : { sessionId: change.sessionId.slice(0, 200) }),
      ...(change.folder === undefined ? {} : { folder: cleanDocumentFolder(change.folder) }),
      ...(change.template === undefined ? {} : { template: change.template }),
      updatedAt: new Date().toISOString(),
    }
    const journal = change.journal !== undefined ? change.journal && next.sessionId ? next.sessionId : "" : current.journal === next.sessionId ? current.journal : ""
    if (journal !== current.journal) next.journal = journal
    const cells: Record<string, string> = { "Modifié le": next.updatedAt }
    if (change.sessionId !== undefined) cells["ID session"] = next.sessionId
    if (change.folder !== undefined) cells.Dossier = next.folder
    if (change.template !== undefined) cells["Modèle"] = next.template ? "oui" : ""
    if (journal !== current.journal) cells.Journal = journal
    await updateRanges(sheet.spreadsheetId, namedRowWrites(sheet.tabName, columns, startRow + index, cells), { valueInputOption: "RAW" })
    clearSpreadsheetReadCache(sheet.spreadsheetId)
    return next
  })
}

/** Range un document dans une session (ou l'en sort) : seule sa case « ID session » change. */
export async function setCampaignDocumentSession(campaignId: string, documentId: string, sessionId: string) {
  return updateCampaignDocumentPlace(campaignId, documentId, { sessionId })
}

/**
 * Supprime un document (sa ligne est blanchie). Ses images restent dans Drive : les
 * exemplaires déjà donnés aux joueurs restent lisibles.
 */
export async function deleteCampaignDocument(campaignId: string, documentId: string) {
  return withAsyncLock("campaign-documents", async () => {
    const { sheet, columns, rows, startRow } = await readDocumentRows()
    const index = rows.findIndex((row) => row[0] === documentId && row[1] === campaignId)
    if (index < 0) throw new Error("DOCUMENT_NOT_FOUND")
    const rowNumber = startRow + index
    await updateRanges(sheet.spreadsheetId, canonicalWrites(sheet.tabName, columns, `A${rowNumber}:${LAST_COLUMN}${rowNumber}`, [Array(COLUMNS).fill("")]), { valueInputOption: "RAW" })
    clearSpreadsheetReadCache(sheet.spreadsheetId)
  })
}

async function bytesOf(object: { body: unknown }) {
  return object.body instanceof ArrayBuffer ? object.body : await new Response(object.body as BodyInit).arrayBuffer()
}

export async function readDocumentImage(campaignId: string, documentId: string, part: DocumentPart) {
  return getSharedMedia(mediaKey(campaignId, documentId, part))
}

/** Le rendu d'une page (la première par défaut), lu dans l'application et par Roll20. */
export async function readDocumentRender(campaignId: string, documentId: string, page = 1) {
  return readDocumentImage(campaignId, documentId, documentRenderPart(Number.isInteger(page) && page > 1 ? page : 1))
}

/**
 * Le PDF du document, une page par page, fait de leurs impressions ; `null` tant qu'aucun rendu
 * n'est enregistré. Une page dont l'impression manque (un enregistrement interrompu) est sautée.
 */
export async function documentPdf(campaignId: string, documentId: string, title: string, pages = 1) {
  const prints = await Promise.all(Array.from({ length: Math.max(1, Math.min(pages, MAX_DOCUMENT_PAGES)) }, (_, index) => readDocumentImage(campaignId, documentId, documentRenderPart(index + 1, "impression"))))
  if (!prints[0]) return null
  const jpegs: Uint8Array[] = []
  for (const print of prints) if (print) jpegs.push(new Uint8Array(await bytesOf(print)))
  return pdfFromJpegs(jpegs, title)
}

/** Un nom de fichier sûr pour le téléchargement (« Lettre du baron.pdf »). */
export function documentFileName(title: string, extension: string) {
  const base = title.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9 _-]+/g, "").trim().replace(/\s+/g, " ").slice(0, 80) || "document"
  return `${base}.${extension}`
}

const documentItem = (document: CampaignDocumentRecord) => ({
  name: document.title,
  description: "Un document remis par le MJ : « Lire » l’ouvre en grand.",
  type: DOCUMENT_ITEM_TYPE,
  subtype: "",
  effect: "",
  modifiers: documentItemModifiers(document.campaignId, document.id),
})

/**
 * Le document donné à un personnage : un item personnalisé dans son sac (le premier
 * contenant « Inventaire »), au sol s'il est plein. L'exemplaire désigne le document, qui
 * s'ouvre d'un clic depuis l'inventaire.
 */
export async function giveDocumentToCharacter(document: CampaignDocumentRecord, characterId: string) {
  const inventory = await getCharacterInventorySummary(characterId)
  const container = inventory.containers.find((candidate) => candidate.category === "Inventaire")
    ?? inventory.containers.find((candidate) => candidate.category !== "Bourse" && candidate.category !== "Esthétique" && candidate.category !== GROUND_CATEGORY)
  if (!container) throw new Error("INVENTORY_NO_COMPATIBLE_CONTAINER")
  return createCharacterInventoryItem(characterId, container.id, documentItem(document))
}

/**
 * Le document donné à un PNJ (un marchand ou un autre) : il arrive dans son Sac à dos, d'où le MJ
 * le lit, le garde pour une scène ou le fait passer à un joueur comme tout objet.
 */
export async function giveDocumentToNpc(document: CampaignDocumentRecord, npcId: string) {
  return createCharacterInventoryItem(npcId, "", documentItem(document), "npc")
}

/**
 * Le document mis en vente dans un magasin sauvegardé de sa campagne : une ligne du stock, à son
 * prix, avec ses exemplaires (le même document déjà en rayon reçoit le prix et les exemplaires en
 * plus). Un joueur qui l'achète le reçoit dans son inventaire, prêt à être lu.
 */
export async function sellDocumentInShop(document: CampaignDocumentRecord, shopId: string, price: string, quantity: number) {
  return addShopLine(document.campaignId, shopId, documentShopLine(document, price, quantity))
}
