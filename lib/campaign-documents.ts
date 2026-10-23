import {
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
import { cleanDocumentBackground, cleanDocumentContent, DOCUMENT_ITEM_TYPE, documentItemModifiers, type CampaignDocumentRecord, type DocumentBackground } from "@/lib/document-model"
import { GROUND_CATEGORY } from "@/lib/inventory-schema"
import { pdfFromJpeg } from "@/lib/document-pdf"
import { getSharedMedia, putSharedMedia } from "@/lib/shared-media"

/**
 * Les documents d'une campagne (page Document) : une ligne par document dans la feuille
 * « Documents de campagne » (titre, fond, zones de texte en JSON), et dans Drive le fond
 * envoyé depuis l'ordinateur, le rendu (WebP, lu dans l'application et par Roll20) et
 * l'impression (JPEG sur fond blanc, dont est fait le PDF).
 */

const COLUMNS = campaignDocumentSheetHeaders.length
const LAST_COLUMN = columnName(COLUMNS)
/** Une case Google Sheets tient 50 000 caractères : le contenu reste en dessous. */
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
  }
}

function documentRow(document: CampaignDocumentRecord) {
  return [document.id, document.campaignId, document.sessionId, document.title, JSON.stringify(document.background), JSON.stringify(document.content), document.renderVersion, document.createdByUid, document.createdAt, document.updatedAt]
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

const mediaKey = (campaignId: string, documentId: string, part: "fond" | "rendu" | "impression") => `campaigns/${campaignId}/documents/${documentId}/${part}`

export type DocumentFiles = { render?: File | null; print?: File | null; background?: File | null }

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
export async function saveCampaignDocument(campaignId: string, input: { id?: unknown; sessionId?: unknown; title?: unknown; background?: unknown; content?: unknown }, files: DocumentFiles, createdByUid: string) {
  const id = typeof input.id === "string" && /^[\w-]{1,80}$/.test(input.id) ? input.id : crypto.randomUUID()
  const title = (typeof input.title === "string" ? input.title : "").trim().slice(0, 160) || "Document sans titre"
  const sessionId = typeof input.sessionId === "string" ? input.sessionId.slice(0, 200) : ""
  const background: DocumentBackground = cleanDocumentBackground(input.background)
  const content = cleanDocumentContent(input.content)
  if (JSON.stringify(content).length > MAX_CONTENT_LENGTH) throw new Error("DOCUMENT_TOO_LONG")
  const render = checkedImage(files.render, /^image\/(webp|png|jpeg)$/, 15 * 1024 * 1024)
  const print = checkedImage(files.print, /^image\/jpeg$/, 15 * 1024 * 1024)
  const uploaded = checkedImage(files.background, /^image\//, 15 * 1024 * 1024)
  return withAsyncLock("campaign-documents", async () => {
    const { sheet, columns, rows, raw, startRow } = await readDocumentRows()
    const index = rows.findIndex((row) => row[0] === id)
    const current = index >= 0 ? documentFromRow(rows[index]) : null
    if (index >= 0 && current?.campaignId !== campaignId) throw new Error("DOCUMENT_NOT_FOUND")
    if (background.kind === "upload" && !uploaded && current?.background.kind !== "upload") throw new Error("DOCUMENT_BACKGROUND_MISSING")
    if (uploaded) await putSharedMedia(mediaKey(campaignId, id, "fond"), await uploaded.arrayBuffer(), uploaded.type)
    if (render) await putSharedMedia(mediaKey(campaignId, id, "rendu"), await render.arrayBuffer(), render.type)
    if (print) await putSharedMedia(mediaKey(campaignId, id, "impression"), await print.arrayBuffer(), print.type)
    const now = new Date().toISOString()
    const document: CampaignDocumentRecord = {
      id, campaignId, sessionId, title, background, content,
      renderVersion: render ? now : current?.renderVersion || "",
      createdByUid: current?.createdByUid || createdByUid,
      createdAt: current?.createdAt || now,
      updatedAt: now,
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

/** Range un document dans une session (ou l'en sort) : seule sa case « ID session » change. */
export async function setCampaignDocumentSession(campaignId: string, documentId: string, sessionId: string) {
  return withAsyncLock("campaign-documents", async () => {
    const { sheet, columns, rows, startRow } = await readDocumentRows()
    const index = rows.findIndex((row) => row[0] === documentId && row[1] === campaignId)
    const current = index >= 0 ? documentFromRow(rows[index]) : null
    if (!current) throw new Error("DOCUMENT_NOT_FOUND")
    const updatedAt = new Date().toISOString()
    await updateRanges(sheet.spreadsheetId, namedRowWrites(sheet.tabName, columns, startRow + index, { "ID session": sessionId.slice(0, 200), "Modifié le": updatedAt }), { valueInputOption: "RAW" })
    clearSpreadsheetReadCache(sheet.spreadsheetId)
    return { ...current, sessionId: sessionId.slice(0, 200), updatedAt }
  })
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

export async function readDocumentImage(campaignId: string, documentId: string, part: "fond" | "rendu" | "impression") {
  return getSharedMedia(mediaKey(campaignId, documentId, part))
}

/** Le PDF du document, fait de son impression ; `null` tant qu'aucun rendu n'est enregistré. */
export async function documentPdf(campaignId: string, documentId: string, title: string) {
  const print = await readDocumentImage(campaignId, documentId, "impression")
  if (!print) return null
  return pdfFromJpeg(new Uint8Array(await bytesOf(print)), title)
}

/** Un nom de fichier sûr pour le téléchargement (« Lettre du baron.pdf »). */
export function documentFileName(title: string, extension: string) {
  const base = title.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9 _-]+/g, "").trim().replace(/\s+/g, " ").slice(0, 80) || "document"
  return `${base}.${extension}`
}

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
  return createCharacterInventoryItem(characterId, container.id, {
    name: document.title,
    description: "Un document remis par le MJ : « Lire » l’ouvre en grand.",
    type: DOCUMENT_ITEM_TYPE,
    subtype: "",
    effect: "",
    modifiers: documentItemModifiers(document.campaignId, document.id),
  })
}
