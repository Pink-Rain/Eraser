import {
  googleServiceAuthorizedFetch,
  runtimeEnv,
} from "@/lib/google-service-account"
import { driveImageFormula, isGeneratedObjectIcon, objectIconDriveFileId, suggestedObjectIconKey } from "@/lib/object-icons"
import { ensureObjectIconsOnDrive } from "@/lib/object-icon-drive"
import { cache } from "react"
import { and, desc, eq, inArray, isNotNull, isNull, or, sql, type SQL } from "drizzle-orm"
import type { AnySQLiteColumn } from "drizzle-orm/sqlite-core"
import { getDb } from "@/db"
import { campaignCharacters, campaignIndex, characterIndex, classIndex, sheetIndexSyncs, userIdentityLinks, users } from "@/db/schema"
import {
  createGoogleSpreadsheet,
  findGoogleSpreadsheetByName,
  findDriveFolderByName,
  isDriveImageFile,
  listAllDriveImages,
  listAllDriveFiles,
  listDriveFolderFiles,
  trashDriveFile,
  type DriveFile,
} from "@/lib/google-drive"
import { signClassImageId } from "@/lib/class-image-signing"
import {
  applyClassImagesWithAppsScript,
  readClassImagesWithAppsScript,
  type ClassImageScriptAction,
} from "@/lib/google-apps-script"
import { runInBackground } from "@/lib/background-work"
import { withAsyncLock } from "@/lib/async-lock"
import { objectCombatColumn, objectPriceColumn, objectTraitLooks, planObjectCombatHeaders } from "@/lib/object-combat"
import { isEntityWorldIndexKey, worldIndexDefinitions, type BuiltinWorldIndexKey, type EntityWorldIndexKey } from "@/lib/world-index-definitions"
import { foldName, isImageSource, type IndexColumnSpec } from "@/lib/index-columns"
import { forgetJdrSheet, getJdrSheet, saveJdrSheet, type JdrSheetKey, type JdrSheetRecord } from "@/lib/jdr-sheets"
import { googleOAuthAuthorizedFetch, warmGoogleOAuthAccessToken } from "@/lib/google-oauth"
import { traced } from "@/lib/perf-trace"
import { remoteAccountsConfig } from "@/lib/accounts-remote"
import { listAccounts } from "@/lib/site-auth"
import {
  htmlToRichText,
  hexColorToRgb,
  rgbColorToHex,
  richTextHtml,
  type GoogleRgbColor,
  type GoogleTextFormat,
  type GoogleTextFormatRun,
} from "@/lib/google-sheet-rich-text"
import { copyNpcPortrait } from "@/lib/npc-portraits"
import { copyToken } from "@/lib/tokens"
import {
  characterClassChoicesIndex,
  characterSheetHeaders,
  characterSecondaryCalculatedFields,
  characterSecondaryCalculationValueIndex,
  characterValueHeaders,
} from "@/lib/character-sheet-schema"
import { planCatalogColumns, type CharacterCatalog, type CharacterLayout } from "@/lib/character-catalog"
import { characterSheetAliases, characterSheetMap, characterSheetRow, characterValuesOf, type CharacterSheetMap } from "@/lib/character-sheet-map"
import { applyCharacteristicDefaults, applySkillCells, characterValueCell, computedCellIndexes } from "@/lib/character-sheet-cells"
import {
  baseInventoryContainerTypes,
  baseInventoryTypeIds,
  canItemBeAutoPlacedInInventoryCategory,
  canItemGoInInventoryCategory,
  inventoryCategories,
  inventoryWorkbookTabs,
  objectCombatColumns,
  type ObjectCombatFields,
  parseInventoryCategory,
  type CharacterInventoryRecord,
  type InventoryCategory,
  type InventoryContainerTypeRecord,
  type InventoryItemRecord,
  type InventorySlotExpectation,
  type InventoryTransferTarget,
} from "@/lib/inventory-schema"
import { parseItemAttachments, parseItemCharges, parseItemModifiers, parseItemOverrides, serializeItemLinks } from "@/lib/item-modifiers"
import { ownedBy, ownersCell, ownersOf } from "@/lib/ownership"
import { displayedMultipleValue } from "@/lib/multiple-values"
import type { CampaignNpcRecord, CityKey, GeneratedShop, SavedShopRecord, ShopKey, ShopSize } from "@/lib/shop-schema"
import type { TabletopActivityRecord, TabletopEntityRecord, TabletopFolderRecord, TabletopMapRecord, TabletopTokenRecord } from "@/lib/tabletop-schema"
import { matchValueRanges, normalizeGoogleSheetRows, sheetRangeStartRow, textCell, type GoogleSheetCellValue } from "@/lib/google-sheet-values"
import { campaignSheetHeaders, classDifficultyValues, classSheetHeaders, classTypeValues, npcSheetHeaders } from "@/lib/entity-sheets"
import { foldSheetHeader, headerAdditions, sheetColumns, withSheetHeaders, type SheetCell, type SheetColumns } from "@/lib/sheet-columns"
import { getIdentityLink, identityUidsForUser } from "@/lib/identity-links"
import { listSharedRecords, sharedStoreAvailable, writeSharedRecord } from "@/lib/shared-store"

export type CharacterRecord = {
  id: string
  ownerUid: string
  name: string
  subtitle: string
  updatedAt: string
  campaigns: Array<{ id: string; name: string; accentColor: string }>
  /** Classes lues dans la fiche (« Samouraï · Oracle »), quand elles sont connues. */
  classes?: string
  /** Rang du personnage, quand il est connu. */
  level?: string
  /** Le nom de son joueur (compte propriétaire), ajouté par les pages qui l'affichent. */
  playerName?: string
}

/**
 * Une fiche : ses valeurs (colonne C et suivantes) et l'en-tête de chacune. Les
 * colonnes d'origine gardent leur place ; celles des caractéristiques et compétences
 * ajoutées à leur index viennent à la suite.
 */
export type CharacterSheetRecord = CharacterRecord & { values: string[]; headers: string[] }

export type CampaignMemberRecord = CharacterRecord & {
  people: string
  classes: string
  level: string
  honoraryTitle: string
}

export type CampaignRecord = {
  id: string
  mjUid: string
  name: string
  description: string
  bannerUrl: string
  accentColor: string
  updatedAt: string
}

export type AdminTodoRecord = {
  id: string
  creatorUid: string
  creatorName: string
  name: string
  content: string
  priority: "haute" | "moyenne" | "basse"
  label: string
  labelColor: string
  completed: "oui" | "non"
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

export const classTypes = classTypeValues
export type ClassType = (typeof classTypes)[number]
export const classDifficulties = classDifficultyValues
export type ClassDifficulty = (typeof classDifficulties)[number]

export type ClassRecord = {
  id: string
  type: ClassType
  name: string
  image: string
  keywords: [string, string, string]
  difficulty: ClassDifficulty
  completion: number
  accentDark: string
  accentLight: string
  accentReady: boolean
}

const classAccentFallbacks: Record<ClassType, { dark: string; light: string }> = {
  Solide: { dark: "#714333", light: "#d8b08d" },
  Protectrice: { dark: "#35685f", light: "#9fd3c7" },
  Brutale: { dark: "#7b3038", light: "#e4a0a4" },
  Fourbe: { dark: "#574273", light: "#bca7d7" },
  Éclectique: { dark: "#74612f", light: "#d9c36f" },
}

function validHexColor(value: string | undefined) {
  return /^#[0-9a-f]{6}$/i.test((value || "").trim())
}

function classAccents(type: ClassType, dark: string | undefined, light: string | undefined) {
  const fallback = classAccentFallbacks[type]
  return {
    accentDark: validHexColor(dark) ? dark!.trim() : fallback.dark,
    accentLight: validHexColor(light) ? light!.trim() : fallback.light,
    accentReady: validHexColor(dark) && validHexColor(light),
  }
}

type ValuesResponse = { values?: GoogleSheetCellValue[][] }
type UpdateValuesResponse = {
  updatedRange?: string
  updatedRows?: number
  updatedColumns?: number
  updatedCells?: number
  updatedData?: { values?: GoogleSheetCellValue[][] }
}
type AppendValuesResponse = {
  updates?: UpdateValuesResponse
}

export type AppendRowsResult = {
  updatedRange: string
  updatedRows: number
  updatedColumns: number
  updatedCells: number
  updatedValues: string[][]
}

type WriteValuesOptions = {
  valueInputOption?: "RAW" | "USER_ENTERED"
  includeValuesInResponse?: boolean
}
type GridNotesResponse = {
  sheets?: Array<{
    data?: Array<{
      rowData?: Array<{ values?: Array<{ note?: string }> }>
    }>
  }>
}

type GoogleGridCell = {
  formattedValue?: string
  userEnteredValue?: { stringValue?: string; numberValue?: number; boolValue?: boolean; formulaValue?: string }
  textFormatRuns?: GoogleTextFormatRun[]
  effectiveFormat?: {
    backgroundColor?: GoogleRgbColor
    backgroundColorStyle?: { rgbColor?: GoogleRgbColor }
    textFormat?: GoogleTextFormat
  }
}

export type FormattedSheetCell = {
  value: string
  html: string
  backgroundColor: string
  foregroundColor: string
}

export type FormattedSheet = {
  sheetId: number
  tabName: string
  rows: FormattedSheetCell[][]
}

// The sheet-id mapping (jdr_google_sheets) lives in each installation's own
// local database, while the sheets themselves are shared in Drive. A copy of
// Eraser whose admin never ran "Relier mes feuilles existantes" therefore has
// an empty mapping, and every read path used to silently return "no data"
// instead of the shared content — classes disappeared, campaigns never synced,
// and any account on a fresh installation saw an empty app. Write paths never
// had that problem because ensureJdrSheet() links the sheet on the fly.
//
// This is the read-side equivalent: it links an existing Drive sheet into this
// installation when the mapping is missing, but never creates one (AGENTS.md:
// never recreate a sheet that already exists in the connected Drive).
const missingJdrSheetRetryAt = new Map<JdrSheetKey, number>()
const pendingJdrSheetResolutions = new Map<JdrSheetKey, Promise<JdrSheetRecord | null>>()
// Une feuille absente du Drive n'y est recherchée qu'une fois toutes les dix minutes : la
// chercher à chaque page coûtait une recherche Drive par minute. « Relier mes feuilles
// existantes » la retrouve aussitôt.
const MISSING_JDR_SHEET_RETRY_MS = 10 * 60_000

export async function resolveJdrSheet(key: JdrSheetKey): Promise<JdrSheetRecord | null> {
  const stored = await getJdrSheet(key)
  if (stored) return stored
  const retryAt = missingJdrSheetRetryAt.get(key) ?? 0
  if (retryAt > Date.now()) return null
  const pending = pendingJdrSheetResolutions.get(key)
  if (pending) return pending
  const resolution = (async () => {
    const definition = jdrSheetDefinitions.find((item) => item.key === key)
    if (!definition) return null
    try {
      const file = await findGoogleSpreadsheetByName(definition.name)
      if (!file) {
        missingJdrSheetRetryAt.set(key, Date.now() + MISSING_JDR_SHEET_RETRY_MS)
        return null
      }
      const linked = await saveJdrSheet({
        key,
        spreadsheetId: file.id,
        name: definition.name,
        tabName: definition.tabName,
        webViewLink: file.webViewLink || `https://docs.google.com/spreadsheets/d/${file.id}/edit`,
      })
      return linked ? await verifyJdrSheetTab(linked, definition) : linked
    } catch (error) {
      console.error("JDR_SHEET_AUTOLINK_FAILED", key, error instanceof Error ? error.message : "UNKNOWN_ERROR")
      missingJdrSheetRetryAt.set(key, Date.now() + MISSING_JDR_SHEET_RETRY_MS)
      return null
    }
  })().finally(() => pendingJdrSheetResolutions.delete(key))
  pendingJdrSheetResolutions.set(key, resolution)
  return resolution
}

// Same family of problem as resolveJdrSheet above, one level up: the
// character/campaign indexes are a per-installation cache of the shared
// sheets. An installation that has never synced them answers "introuvable"
// for content everyone else can see, so the lookups that gate access retry
// once behind this instead of trusting an empty cache. Deduplicated and
// rate-limited so a genuinely missing id doesn't re-read Sheets every time.
let identityIndexSyncPromise: Promise<unknown> | null = null
let identityIndexSyncedAt = 0
const IDENTITY_INDEX_SYNC_TTL_MS = 120_000
// Une page n'attend pas plus longtemps la resynchronisation : au-delà, elle
// s'affiche avec l'index local et la synchro se termine en arrière-plan.
const IDENTITY_INDEX_SYNC_WAIT_MS = 2_500
const IDENTITY_INDEX_RETRY_MS = 20_000

async function ensureIdentityIndexes(options: { maxAgeMs?: number; waitMs?: number } = {}) {
  if (Date.now() - identityIndexSyncedAt < (options.maxAgeMs ?? IDENTITY_INDEX_SYNC_TTL_MS)) return
  if (!identityIndexSyncPromise) {
    identityIndexSyncPromise = syncExistingIdentityIndexes()
      .then(() => { identityIndexSyncedAt = Date.now() })
      .catch((error) => {
        console.error("IDENTITY_INDEX_SYNC_FAILED", error instanceof Error ? error.message : "UNKNOWN_ERROR")
        // Un échec (Google lent ou saturé) est retenté dans 20 s, pas à chaque page :
        // sinon chaque page attendait de nouveau la resynchronisation.
        identityIndexSyncedAt = Date.now() - IDENTITY_INDEX_SYNC_TTL_MS + IDENTITY_INDEX_RETRY_MS
      })
      .finally(() => { identityIndexSyncPromise = null })
  }
  if (options.waitMs === undefined) {
    await identityIndexSyncPromise
    return
  }
  await Promise.race([identityIndexSyncPromise, new Promise((resolve) => setTimeout(resolve, options.waitMs))])
}

/**
 * Les personnages, campagnes et liens « personnage ↔ campagne » sont écrits par
 * toutes les installations dans les feuilles partagées. L'index local n'était
 * resynchronisé que s'il était vide ou qu'un identifiant y manquait : un
 * personnage créé chez un joueur restait invisible pour un autre MJ, et un
 * joueur ne voyait jamais la campagne où un MJ l'avait ajouté. Désormais, les
 * lectures qui en dépendent le rafraîchissent au plus une fois par minute.
 */
function refreshIdentityIndexes() {
  // Déjà lu une fois depuis le démarrage : la page s'affiche avec l'index connu et la
  // relecture se fait en arrière-plan (les accès refusés relisent d'eux-mêmes au besoin).
  return ensureIdentityIndexes({ waitMs: identityIndexSyncedAt ? 0 : IDENTITY_INDEX_SYNC_WAIT_MS })
}

async function charactersSource() {
  const runtime = runtimeEnv()
  const spreadsheetId = runtime.GOOGLE_CHARACTERS_SHEET_ID
  const tab = runtime.GOOGLE_CHARACTERS_TAB || "Personnages"
  if (spreadsheetId) return { spreadsheetId, tabName: tab }
  const stored = await resolveJdrSheet("characters")
  return stored ? { spreadsheetId: stored.spreadsheetId, tabName: stored.tabName } : null
}

/** Quelques colonnes de la feuille des personnages, par leur nom (la feuille entière est très large). */
function readCharacterColumns(source: { spreadsheetId: string; tabName: string }, wanted: readonly string[], options: { fresh?: boolean } = {}) {
  return readNamedColumns(source.spreadsheetId, source.tabName, characterSheetHeaders, ["ID", ...wanted], { aliases: characterSheetAliases, fresh: options.fresh })
}

async function classesSource() {
  const runtime = runtimeEnv()
  const spreadsheetId = runtime.GOOGLE_CLASSES_SHEET_ID
  const tab = runtime.GOOGLE_CLASSES_TAB || "Classes"
  if (spreadsheetId) return { spreadsheetId, tabName: tab }
  const stored = await resolveJdrSheet("classes")
  return stored ? { spreadsheetId: stored.spreadsheetId, tabName: stored.tabName } : null
}

/** La feuille Classes (formules comprises : l'image est souvent une formule), colonnes par leur nom. */
function readClassSheet(source: { spreadsheetId: string; tabName: string }, options: { fresh?: boolean } = {}) {
  return readNamedSheet(source.spreadsheetId, source.tabName, classSheetHeaders, { render: "FORMULA", fresh: options.fresh })
}

/** La lettre de la colonne Image (les illustrations et leurs notes y sont posées). */
function classImageColumn(columns: SheetColumns) {
  return Math.max(0, columns.at("Image")) + 1
}

/**
 * Le classeur et l'onglet d'un index d'entités, pour le moteur des index : la feuille
 * que lit le reste d'Eraser (reliée, jamais recréée si elle existe dans Drive).
 */
export async function entitySheetLocation(key: "npcs" | "campaigns" | "characters" | "classes") {
  const runtime = runtimeEnv()
  const configured = key === "characters" ? runtime.GOOGLE_CHARACTERS_SHEET_ID : key === "classes" ? runtime.GOOGLE_CLASSES_SHEET_ID : ""
  if (configured) {
    const tabName = (key === "characters" ? runtime.GOOGLE_CHARACTERS_TAB || "Personnages" : runtime.GOOGLE_CLASSES_TAB || "Classes")
    return { spreadsheetId: configured, tabName, webViewLink: `https://docs.google.com/spreadsheets/d/${configured}/edit` }
  }
  const sheet = await ensureJdrSheet(key)
  if (!sheet) throw new Error("WORLD_INDEX_SHEET_UNAVAILABLE")
  return { spreadsheetId: sheet.spreadsheetId, tabName: sheet.tabName, webViewLink: sheet.webViewLink }
}

/** Les classes ont été modifiées ailleurs que par leurs pages : la liste locale sera relue. */
export async function forgetClassIndexSync() {
  await getDb().delete(sheetIndexSyncs).where(eq(sheetIndexSyncs.key, "classes:global"))
}

async function campaignsSource() {
  const stored = await resolveJdrSheet("campaigns")
  return stored ? { spreadsheetId: stored.spreadsheetId, tabName: stored.tabName } : null
}

/** La feuille « Personnages des campagnes » : un lien par ligne. */
const campaignCharacterHeaders = ["ID campagne", "ID personnage"]
/** Les colonnes de la feuille Magasins, lues par leur nom. */
const shopSheetHeaders = ["ID", "Page lié", "Ville", "Taille de ville", "Type de magasin", "Nom du magasin", "Taille du magasin", "Objets JSON", "Ajouté à la campagne", "ID PNJ lié", "Créé le", "Modifié le"]

/** La to-do de l'administration. */
const todoSheetHeaders = ["ID", "ID admin", "Admin créateur", "Nom", "Contenu", "Priorité", "Étiquette", "Couleur", "Réalisée", "Créée le", "Modifiée le", "Supprimée le"]
/** Les relations d'un personnage (PNJ ou personnage ciblé). */
const characterRelationHeaders = ["ID", "ID personnage", "Type de cible", "ID cible", "Nom", "Niveau", "Notes personnelles", "Créé par", "ID campagne", "Créée le", "Modifiée le"]

function campaignFromRow(row: readonly (string | undefined)[], columns: SheetColumns) {
  const id = columns.get(row, "ID")
  if (!id) return null
  return {
    id,
    mjUid: columns.get(row, "MJ"),
    name: columns.get(row, "Nom de la campagne") || "Campagne sans nom",
    description: columns.get(row, "Description"),
    bannerUrl: columns.get(row, "Bannière"),
    accentColor: columns.get(row, "Couleur d’accent") || "#927640",
  }
}

function campaignCells(campaign: Pick<CampaignRecord, "id" | "mjUid" | "name" | "description" | "bannerUrl" | "accentColor">): Record<string, SheetCell> {
  return {
    "ID": campaign.id,
    "MJ": campaign.mjUid,
    "Nom de la campagne": campaign.name,
    "Description": campaign.description,
    "Bannière": campaign.bannerUrl,
    "Couleur d’accent": campaign.accentColor,
  }
}

/**
 * Ceux qui gardent en mémoire le contenu d'un classeur (le moteur des index) et doivent
 * l'oublier quand Eraser y écrit ailleurs : un PNJ enregistré dans sa campagne, une
 * classe créée, un personnage modifié dans sa fiche.
 */
const spreadsheetWriteListeners = new Set<(spreadsheetId: string) => void>()

export function onSpreadsheetWrite(listener: (spreadsheetId: string) => void) {
  spreadsheetWriteListeners.add(listener)
  return () => { spreadsheetWriteListeners.delete(listener) }
}

function announceSpreadsheetWrite(path: string, method: string) {
  // Les lectures en POST (batchGet…) n'écrivent rien.
  if (method === "GET" || /batchGet|getByDataFilter/i.test(path)) return
  const spreadsheetId = path.match(/^spreadsheets\/([^/:?]+)/)?.[1]
  if (!spreadsheetId) return
  for (const listener of spreadsheetWriteListeners) {
    try { listener(spreadsheetId) } catch { /* un auditeur en échec n'empêche pas l'écriture */ }
  }
}

async function googleSheetsFetch(path: string, init?: RequestInit) {
  const url = `https://sheets.googleapis.com/v4/${path}`
  let response: Response | null = null
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const label = `${init?.method ?? "GET"} ${path}`
    try {
      response = await traced("sheets", label, () => googleOAuthAuthorizedFetch(url, init), (reply) => String(reply.status))
    } catch (error) {
      if (!(error instanceof Error) || error.message !== "GOOGLE_DRIVE_NOT_AUTHORIZED") throw error
      response = await traced("sheets", label, () => googleServiceAuthorizedFetch(url, init), (reply) => String(reply.status))
    }
    // 429 : Google a refusé sans rien faire. Une erreur 5xx, elle, peut arriver après coup :
    // rejouer un ajout ou une suppression de ligne l'aurait fait deux fois (ligne suivante
    // supprimée, ligne ajoutée en double).
    const retry = response.status === 429 || ([500, 502, 503, 504].includes(response.status) && repeatableRequest(path, init))
    if (!retry || attempt === 2) break
    // Trop de requêtes (429) : Google compte par minute, on attend plus longtemps.
    await new Promise((resolve) => setTimeout(resolve, response?.status === 429 ? 2_000 * (attempt + 1) : 250 * (attempt + 1)))
  }
  if (!response?.ok) {
    const status = response?.status ?? 0
    let detail = ""
    try {
      const payload = await response?.clone().json() as { error?: { message?: string } } | undefined
      detail = payload?.error?.message?.trim() || ""
    } catch { /* réponse Google non JSON */ }
    throw new Error(`SHEETS_API_ERROR:${status}${detail ? `:${detail}` : ""}`)
  }
  forgetAfterStructureChange(path, init)
  announceSpreadsheetWrite(path, (init?.method ?? "GET").toUpperCase())
  return response
}

/** Une requête qu'on peut renvoyer telle quelle : une lecture, ou des valeurs écrites à des cases fixes. */
function repeatableRequest(path: string, init?: RequestInit) {
  const method = (init?.method ?? "GET").toUpperCase()
  if (method === "GET" || method === "PUT") return true
  const verb = /:(\w+)(?:\?|$)/.exec(path)?.[1] ?? ""
  if (["batchGet", "batchGetByDataFilter", "getByDataFilter", "batchClear", "batchClearByDataFilter", "clear"].includes(verb)) return true
  if (/\/values:batchUpdate/.test(path)) return true
  // Mise en forme, filtre, largeurs : oui. Ajouter, supprimer, insérer, coller, trier : non.
  return verb === "batchUpdate" && typeof init?.body === "string"
    && !/"(?:add|append|delete|insert|duplicate|copyPaste|cutPaste|pasteData|sortRange|moveDimension|autoFill|randomizeRange|textToColumns|trimWhitespace)\w*"\s*:/.test(init.body)
}

/**
 * Des lignes ou colonnes ajoutées, supprimées ou déplacées (par n'importe quel chemin
 * d'Eraser, ajout de lignes compris) décalent toutes les suivantes : ce qui était gardé en
 * mémoire pour ce classeur (plages lues, en-têtes, colonnes de la feuille des personnages)
 * ne vaut plus rien. Le garder faisait écrire ou supprimer à côté de la bonne case.
 */
function forgetAfterStructureChange(path: string, init?: RequestInit) {
  const structural = /:append\b/.test(path)
    || (typeof init?.body === "string" && /"(deleteDimension|insertDimension|moveDimension|appendDimension|deleteRange|insertRange|addSheet|deleteSheet|updateSheetProperties)"/.test(init.body))
  if (!structural) return
  const spreadsheetId = /^spreadsheets\/([^/:?]+)/.exec(path)?.[1]
  if (spreadsheetId) clearSpreadsheetReadCache(spreadsheetId)
  characterColumnsCache = null
  // L'inventaire et le catalogue des objets gardés en mémoire portent des numéros de ligne.
  if (spreadsheetId && inventoryWorkbookCache?.workbook.spreadsheetId === spreadsheetId) clearInventoryWorkbookCache()
  if (spreadsheetId && objectIndexTableCache?.tables.some((table) => table.fileId === spreadsheetId)) clearObjectIndexTableCache()
}

export async function googleSheetsJson<T>(path: string, init?: RequestInit) {
  const response = await googleSheetsFetch(path, init)
  return response.json() as Promise<T>
}

// Any write through the app (updateRange/appendRows) clears this cache for the
// spreadsheet it touches, so a longer window here only risks staleness against
// edits made outside Eraser (directly in Google Sheets) — an accepted tradeoff
// for cutting down repeated round-trips while navigating within a session.
const RANGE_CACHE_MS = 180_000
/**
 * Passé RANGE_CACHE_MS, une plage déjà lue est rendue aussitôt (la page n'attend plus
 * Google) et relue en arrière-plan ; la lecture suivante a la version fraîche. Au-delà de
 * RANGE_STALE_MS, ou si la relecture a échoué, on attend Google comme avant. Une écriture
 * d'Eraser vide le cache de son classeur : ses propres changements ne sont jamais servis
 * en retard.
 */
const RANGE_STALE_MS = 30 * 60_000
type RangeCacheEntry = { expiresAt: number; promise: Promise<string[][]>; value?: string[][]; loadedAt?: number; refreshing?: boolean; refreshFailed?: boolean }
const rangeReadCache = new Map<string, RangeCacheEntry>()

/** La valeur à rendre sans attendre (et la relecture lancée), ou null s'il faut lire Google. */
function staleRange(cacheKey: string, refresh: () => Promise<string[][]>) {
  const cached = rangeReadCache.get(cacheKey)
  if (!cached || cached.expiresAt > Date.now()) return null
  if (!cached.value || cached.refreshFailed || Date.now() - (cached.loadedAt ?? 0) > RANGE_STALE_MS) return null
  if (!cached.refreshing) {
    cached.refreshing = true
    refresh().then((rows) => {
      // Un classeur vidé entre-temps (écriture) : on ne remet pas l'ancienne entrée.
      if (rangeReadCache.get(cacheKey) !== cached) return
      rangeReadCache.set(cacheKey, { expiresAt: Date.now() + RANGE_CACHE_MS, promise: Promise.resolve(rows), value: rows, loadedAt: Date.now() })
    }, () => { cached.refreshing = false; cached.refreshFailed = true })
  }
  return Promise.resolve(cached.value)
}

function rangeCacheKey(
  spreadsheetId: string,
  range: string,
  valueRenderOption?: "FORMATTED_VALUE" | "UNFORMATTED_VALUE" | "FORMULA",
) {
  return `${spreadsheetId}:${range}:${valueRenderOption || "FORMATTED_VALUE"}`
}

/** Une plage relue depuis le cache passe en fin de file : ce sont les plus utilisées qui restent. */
function touchRange(cacheKey: string, entry: RangeCacheEntry) {
  rangeReadCache.delete(cacheKey)
  rangeReadCache.set(cacheKey, entry)
  return entry.promise
}

function cacheRangePromise(cacheKey: string, promise: Promise<string[][]>) {
  if (rangeReadCache.size >= 500) {
    const oldestKey = rangeReadCache.keys().next().value
    if (oldestKey) rangeReadCache.delete(oldestKey)
  }
  const entry: RangeCacheEntry = { expiresAt: Date.now() + RANGE_CACHE_MS, promise }
  rangeReadCache.set(cacheKey, entry)
  promise.then((rows) => { entry.value = rows; entry.loadedAt = Date.now() }, () => { if (rangeReadCache.get(cacheKey) === entry) rangeReadCache.delete(cacheKey) })
  return promise
}

export function clearSpreadsheetReadCache(spreadsheetId: string) {
  const prefix = `${spreadsheetId}:`
  for (const key of rangeReadCache.keys()) {
    if (key.startsWith(prefix)) rangeReadCache.delete(key)
  }
  // Les en-têtes gardés une minute (namedColumnsOf) sont relus eux aussi.
  const headers = `${spreadsheetId}\u0001`
  for (const key of sheetHeaderCache.keys()) {
    if (key.startsWith(headers)) sheetHeaderCache.delete(key)
  }
}

/** Une plage lue dans Google Sheets, sans passer par le cache. */
function fetchRange(spreadsheetId: string, range: string, valueRenderOption?: "FORMATTED_VALUE" | "UNFORMATTED_VALUE" | "FORMULA") {
  const parameters = valueRenderOption ? `?valueRenderOption=${encodeURIComponent(valueRenderOption)}` : ""
  return googleSheetsFetch(`spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}${parameters}`)
    .then(async (response) => normalizeGoogleSheetRows(((await response.json()) as ValuesResponse).values))
}

export async function readRange(
  spreadsheetId: string,
  range: string,
  valueRenderOption?: "FORMATTED_VALUE" | "UNFORMATTED_VALUE" | "FORMULA",
) {
  const cacheKey = rangeCacheKey(spreadsheetId, range, valueRenderOption)
  const cached = rangeReadCache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) return touchRange(cacheKey, cached)
  const load = () => fetchRange(spreadsheetId, range, valueRenderOption)
  return staleRange(cacheKey, load) ?? cacheRangePromise(cacheKey, load())
}

/**
 * Lit directement Google Sheets sans passer par le cache mémoire du bundle.
 *
 * Cette lecture utilise volontairement batchGetByDataFilter (POST). Le serveur
 * desktop peut dédupliquer deux GET Sheets identiques même avec `no-store` :
 * après une écriture, la prétendue relecture recevait alors encore la réponse
 * antérieure. Un POST n'entre pas dans ce cache et force Google à relire la
 * plage demandée. Les magasins utilisent ce chemin pour leurs lectures et
 * pour la vérification de persistance.
 */
export async function readRangeFreshWithOffset(
  spreadsheetId: string,
  range: string,
  valueRenderOption: "FORMATTED_VALUE" | "UNFORMATTED_VALUE" | "FORMULA" = "FORMATTED_VALUE",
) {
  const payload = await googleSheetsJson<{
    valueRanges?: Array<{ valueRange?: { range?: string; values?: GoogleSheetCellValue[][] } }>
  }>(`spreadsheets/${spreadsheetId}/values:batchGetByDataFilter`, {
    method: "POST",
    cache: "no-store",
    body: JSON.stringify({
      dataFilters: [{ a1Range: range }],
      majorDimension: "ROWS",
      valueRenderOption,
      dateTimeRenderOption: "FORMATTED_STRING",
    }),
  })
  const matched = payload.valueRanges?.[0]?.valueRange
  return {
    rows: normalizeGoogleSheetRows(matched?.values),
    // Google renvoie la plage réellement lue. Elle ne commence pas forcément là
    // où on l'a demandée, donc le numéro de ligne se déduit d'elle, jamais d'une
    // constante : c'est ce décalage qui faisait écrire par-dessus la mauvaise ligne.
    startRow: sheetRangeStartRow(matched?.range) ?? sheetRangeStartRow(range) ?? 1,
  }
}

async function readRangeFresh(
  spreadsheetId: string,
  range: string,
  valueRenderOption: "FORMATTED_VALUE" | "UNFORMATTED_VALUE" | "FORMULA" = "FORMATTED_VALUE",
) {
  return (await readRangeFreshWithOffset(spreadsheetId, range, valueRenderOption)).rows
}

async function readRanges(
  spreadsheetId: string,
  ranges: string[],
  valueRenderOption?: "FORMATTED_VALUE" | "UNFORMATTED_VALUE" | "FORMULA",
) {
  const results: Array<Promise<string[][]>> = Array(ranges.length)
  const missing: Array<{ range: string; index: number; cacheKey: string }> = []
  ranges.forEach((range, index) => {
    const cacheKey = rangeCacheKey(spreadsheetId, range, valueRenderOption)
    const cached = rangeReadCache.get(cacheKey)
    const stale = cached && cached.expiresAt > Date.now() ? null : staleRange(cacheKey, () => fetchRange(spreadsheetId, range, valueRenderOption))
    if (cached && cached.expiresAt > Date.now()) results[index] = touchRange(cacheKey, cached)
    else if (stale) results[index] = stale
    else missing.push({ range, index, cacheKey })
  })
  if (missing.length) {
    const parameters = new URLSearchParams()
    missing.forEach(({ range }) => parameters.append("ranges", range))
    if (valueRenderOption) parameters.set("valueRenderOption", valueRenderOption)
    const batch = googleSheetsJson<{ valueRanges?: Array<{ values?: GoogleSheetCellValue[][] }> }>(
      `spreadsheets/${spreadsheetId}/values:batchGet?${parameters.toString()}`,
    )
    missing.forEach(({ index, cacheKey }, missingIndex) => {
      results[index] = cacheRangePromise(
        cacheKey,
        batch.then((payload) => normalizeGoogleSheetRows(payload.valueRanges?.[missingIndex]?.values)),
      )
    })
  }
  return Promise.all(results)
}

async function readCellNotes(spreadsheetId: string, range: string) {
  const parameters = new URLSearchParams({
    ranges: range,
    includeGridData: "true",
    fields: "sheets.data.rowData.values.note",
  })
  const payload = await googleSheetsJson<GridNotesResponse>(
    `spreadsheets/${spreadsheetId}?${parameters.toString()}`,
  )
  return (payload.sheets?.[0]?.data?.[0]?.rowData ?? []).map(
    (row) => row.values?.[0]?.note ?? "",
  )
}

function gridCellValue(cell: GoogleGridCell, keepImageFormula = false) {
  // Une image (=IMAGE) n'a pas de texte : les index d'objets gardent la formule,
  // qui dit où est l'image de la colonne « Icône ».
  const formula = cell.userEnteredValue?.formulaValue
  if (keepImageFormula && formula && /^=IMAGE\(/i.test(formula)) return formula
  if (cell.formattedValue !== undefined) return String(cell.formattedValue)
  const entered = cell.userEnteredValue
  if (entered?.stringValue !== undefined) return entered.stringValue
  if (entered?.numberValue !== undefined) return String(entered.numberValue)
  if (entered?.boolValue !== undefined) return String(entered.boolValue)
  return entered?.formulaValue || ""
}

/**
 * Mise en forme du texte seulement : gras, italique, souligné, barré, lien, couleur.
 * C'est tout ce que l'éditeur sait afficher ; la police, la taille et le fond de chaque
 * cellule alourdissaient la réponse de Google sans servir à rien.
 */
const LIGHT_TEXT_FORMAT = "bold,italic,underline,strikethrough,link,foregroundColor,foregroundColorStyle"
const LIGHT_CELL_FIELDS = `formattedValue,textFormatRuns(startIndex,format(${LIGHT_TEXT_FORMAT})),effectiveFormat.textFormat(${LIGHT_TEXT_FORMAT})`
const FULL_CELL_FIELDS = "formattedValue,userEnteredValue,textFormatRuns,effectiveFormat(backgroundColor,backgroundColorStyle,textFormat)"

/** `range` (sans l'onglet, ex. « A5:Z5 ») limite la lecture à une zone : une ligne se lit bien plus vite que la feuille. */
export async function readFormattedSheet(spreadsheetId: string, candidates: string[], options: { light?: boolean; range?: string; ranges?: string[] } = {}): Promise<FormattedSheet> {
  let lastError: unknown = null
  for (const candidate of candidates) {
    try {
      const tab = `'${candidate.replaceAll("'", "''")}'`
      const parameters = new URLSearchParams({
        includeGridData: "true",
        fields: `sheets(properties(sheetId,title),data(startRow,startColumn,rowData(values(${options.light ? LIGHT_CELL_FIELDS : FULL_CELL_FIELDS}))))`,
      })
      // Plusieurs zones (« C:C », « H:H »…) : seules ces colonnes d'une feuille très large sont lues.
      const zones = options.ranges?.length ? options.ranges : [options.range ?? ""]
      for (const zone of zones) parameters.append("ranges", zone ? `${tab}!${zone}` : tab)
      const payload = await googleSheetsJson<{
        sheets?: Array<{
          properties?: { sheetId?: number; title?: string }
          data?: Array<{ startRow?: number; startColumn?: number; rowData?: Array<{ values?: GoogleGridCell[] }> }>
        }>
      }>(`spreadsheets/${spreadsheetId}?${parameters.toString()}`)
      const sheet = payload.sheets?.find((item) => item.properties?.title === candidate) ?? payload.sheets?.[0]
      const sheetId = sheet?.properties?.sheetId
      const tabName = sheet?.properties?.title
      if (sheetId === undefined || !tabName) throw new Error("SHEET_TAB_NOT_FOUND")
      const rows: FormattedSheetCell[][] = []
      for (const block of sheet.data ?? []) {
        const startRow = block.startRow ?? 0
        const startColumn = block.startColumn ?? 0
        for (const [rowOffset, row] of (block.rowData ?? []).entries()) {
          const rowIndex = startRow + rowOffset
          rows[rowIndex] ||= []
          for (const [columnOffset, cell] of (row.values ?? []).entries()) {
            const value = gridCellValue(cell)
            const textFormat = cell.effectiveFormat?.textFormat
            rows[rowIndex][startColumn + columnOffset] = {
              value,
              html: richTextHtml(value, cell.textFormatRuns, textFormat),
              backgroundColor: rgbColorToHex(cell.effectiveFormat?.backgroundColorStyle?.rgbColor || cell.effectiveFormat?.backgroundColor),
              foregroundColor: rgbColorToHex(textFormat?.foregroundColorStyle?.rgbColor || textFormat?.foregroundColor),
            }
          }
        }
      }
      return { sheetId, tabName, rows }
    } catch (error) {
      lastError = error
    }
  }
  throw lastError instanceof Error ? lastError : new Error("SHEET_TAB_NOT_FOUND")
}

export async function updateFormattedCell(input: {
  spreadsheetId: string
  sheetId: number
  rowNumber: number
  column: number
  html: string
}) {
  if (!Number.isInteger(input.rowNumber) || input.rowNumber < 1 || !Number.isInteger(input.column) || input.column < 0) throw new Error("INVALID_SHEET_CELL")
  const richText = htmlToRichText(input.html.slice(0, 50_000))
  await googleSheetsJson(`spreadsheets/${input.spreadsheetId}:batchUpdate`, {
    method: "POST",
    body: JSON.stringify({ requests: [{ updateCells: {
      range: {
        sheetId: input.sheetId,
        startRowIndex: input.rowNumber - 1,
        endRowIndex: input.rowNumber,
        startColumnIndex: input.column,
        endColumnIndex: input.column + 1,
      },
      rows: [{ values: [{ userEnteredValue: { stringValue: richText.text }, textFormatRuns: richText.runs }] }],
      fields: "userEnteredValue,textFormatRuns",
    } }] }),
  })
  clearSpreadsheetReadCache(input.spreadsheetId)
}

export type RowCellWrite = {
  column: number
  /** Texte simple : un nombre (« 12 », « 0.5 ») est écrit comme nombre, comme une saisie dans Sheets. */
  value?: string
  /** Texte mis en forme : remplace la valeur de la cellule et ses mises en forme de texte. */
  html?: string
  colors?: { background: string; foreground: string }
}

/**
 * Écrit plusieurs cellules d'une même ligne en un seul appel à Google, au lieu d'un
 * appel par valeur, par texte mis en forme puis par couleur.
 */
export async function updateRowCells(input: { spreadsheetId: string; sheetId: number; rowNumber: number; cells: RowCellWrite[] }) {
  if (!Number.isInteger(input.rowNumber) || input.rowNumber < 1) throw new Error("INVALID_SHEET_CELL")
  const requests = input.cells.flatMap((cell) => {
    if (!Number.isInteger(cell.column) || cell.column < 0) throw new Error("INVALID_SHEET_CELL")
    const range = { sheetId: input.sheetId, startRowIndex: input.rowNumber - 1, endRowIndex: input.rowNumber, startColumnIndex: cell.column, endColumnIndex: cell.column + 1 }
    const value: Record<string, unknown> = {}
    const fields: string[] = []
    if (cell.html !== undefined) {
      const richText = htmlToRichText(cell.html.slice(0, 50_000))
      value.userEnteredValue = { stringValue: richText.text }
      value.textFormatRuns = richText.runs
      fields.push("userEnteredValue", "textFormatRuns")
    } else if (cell.value !== undefined) {
      const trimmed = cell.value.trim()
      value.userEnteredValue = /^-?\d+(?:\.\d+)?$/.test(trimmed) ? { numberValue: Number(trimmed) } : { stringValue: cell.value }
      fields.push("userEnteredValue")
    }
    const background = cell.colors ? hexColorToRgb(cell.colors.background) : null
    const foreground = cell.colors ? hexColorToRgb(cell.colors.foreground) : null
    if (background && foreground) {
      value.userEnteredFormat = { backgroundColorStyle: { rgbColor: background }, textFormat: { foregroundColorStyle: { rgbColor: foreground } } }
      fields.push("userEnteredFormat.backgroundColorStyle", "userEnteredFormat.textFormat.foregroundColorStyle")
    }
    return fields.length ? [{ updateCells: { range, rows: [{ values: [value] }], fields: fields.join(",") } }] : []
  })
  if (!requests.length) return
  await googleSheetsJson(`spreadsheets/${input.spreadsheetId}:batchUpdate`, { method: "POST", body: JSON.stringify({ requests }) })
  clearSpreadsheetReadCache(input.spreadsheetId)
}

export async function ensureSheetColumnCount(spreadsheetId: string, tabName: string, minimum: number) {
  const metadata = await googleSheetsJson<{ sheets?: Array<{ properties?: { sheetId?: number; title?: string; gridProperties?: { columnCount?: number } } }> }>(
    `spreadsheets/${spreadsheetId}?fields=sheets.properties(sheetId,title,gridProperties.columnCount)`,
  )
  const sheet = metadata.sheets?.find((item) => item.properties?.title === tabName)?.properties
  if (sheet?.sheetId === undefined) throw new Error("SHEET_TAB_NOT_FOUND")
  const current = sheet.gridProperties?.columnCount ?? 0
  if (current >= minimum) return
  await googleSheetsJson(`spreadsheets/${spreadsheetId}:batchUpdate`, {
    method: "POST",
    body: JSON.stringify({ requests: [{ appendDimension: { sheetId: sheet.sheetId, dimension: "COLUMNS", length: minimum - current } }] }),
  })
}

// ---------------------------------------------------------------------------
// Les feuilles lues par le nom de leurs colonnes (lib/sheet-columns.ts)
// ---------------------------------------------------------------------------

/** Un onglet entier dans la notation A1 : toutes ses colonnes, en-têtes compris. */
export function sheetTabAll(tabName: string) {
  return `'${tabName.replaceAll("'", "''")}'`
}

export type NamedSheet = { columns: SheetColumns; rows: string[][] }

/**
 * Un onglet entier, en-têtes compris, en une seule lecture (mise en cache comme les
 * autres), ses colonnes retrouvées par leur nom. `rows[i]` est la ligne i + 2.
 */
export async function readNamedSheet(spreadsheetId: string, tabName: string, expected: readonly string[], options: { aliases?: Record<string, readonly string[]>; fresh?: boolean; render?: "FORMULA" } = {}): Promise<NamedSheet> {
  let all: string[][]
  if (options.fresh) {
    const read = await readRangeFreshWithOffset(spreadsheetId, sheetTabAll(tabName), options.render)
    // Google peut renvoyer la plage à partir de la première ligne remplie.
    all = [...Array.from({ length: Math.max(0, read.startRow - 1) }, () => [] as string[]), ...read.rows]
  } else {
    all = await readRange(spreadsheetId, sheetTabAll(tabName), options.render)
  }
  const [headers = [], ...rows] = all
  rememberSheetHeaders(spreadsheetId, tabName, headers)
  return { columns: sheetColumns(headers, expected, options.aliases), rows }
}

/**
 * Plusieurs plages lues sans cache, chacune avec la ligne où elle commence vraiment.
 *
 * Google ne rend pas forcément les plages d'une lecture par filtres dans l'ordre demandé :
 * chaque réponse est rattachée à SA plage (le filtre qui l'a trouvée, sinon sa colonne),
 * jamais à sa position. Les prendre dans l'ordre mélangeait les colonnes (l'« ID » d'un
 * personnage lu dans « Joueur » ou « Nom personnage ») et créait des fiches fantômes.
 */
async function readRangesFresh(spreadsheetId: string, ranges: string[]) {
  if (!ranges.length) return [] as Array<{ rows: string[][]; startRow: number }>
  const payload = await googleSheetsJson<{
    valueRanges?: Array<{ valueRange?: { range?: string; values?: GoogleSheetCellValue[][] }; dataFilters?: Array<{ a1Range?: string }> }>
  }>(`spreadsheets/${spreadsheetId}/values:batchGetByDataFilter`, {
    method: "POST",
    cache: "no-store",
    body: JSON.stringify({ dataFilters: ranges.map((a1Range) => ({ a1Range })), majorDimension: "ROWS", valueRenderOption: "FORMATTED_VALUE", dateTimeRenderOption: "FORMATTED_STRING" }),
  })
  return matchValueRanges(ranges, payload.valueRanges ?? []).map((matched, index) => ({
    rows: normalizeGoogleSheetRows(matched?.values),
    startRow: sheetRangeStartRow(matched?.range) ?? sheetRangeStartRow(ranges[index]) ?? 1,
  }))
}

/**
 * Quelques colonnes d'un onglet, retrouvées par leur nom : la ligne 1 d'abord, puis
 * seulement les colonnes demandées, en une lecture groupée (une feuille très large,
 * comme celle des personnages, n'est pas lue en entier). Chaque ligne rendue garde
 * les places de la feuille : `columns.get(row, nom)` s'y applique. `rows[i]` est la
 * ligne i + 2.
 */
export async function readNamedColumns(spreadsheetId: string, tabName: string, expected: readonly string[], wanted: readonly string[], options: { aliases?: Record<string, readonly string[]>; fresh?: boolean } = {}): Promise<NamedSheet> {
  const headerRange = sheetTabRange(tabName, "1:1")
  const [header = []] = options.fresh ? (await readRangesFresh(spreadsheetId, [headerRange]))[0]?.rows ?? [] : await readRange(spreadsheetId, headerRange)
  const columns = sheetColumns(header, expected, options.aliases)
  const indexes = [...new Set(wanted.map((name) => columns.at(name)).filter((index) => index >= 0))]
  const ranges = indexes.map((index) => sheetTabRange(tabName, `${columnName(index + 1)}:${columnName(index + 1)}`))
  const reads = options.fresh
    ? await readRangesFresh(spreadsheetId, ranges)
    : (await readRanges(spreadsheetId, ranges)).map((rows) => ({ rows, startRow: 1 }))
  const rows: string[][] = []
  reads.forEach((read, position) => {
    const column = indexes[position]
    read.rows.forEach((cells, offset) => {
      const rowNumber = read.startRow + offset
      if (rowNumber < 2) return
      const row = rows[rowNumber - 2] ?? (rows[rowNumber - 2] = [])
      row[column] = String(cells[0] ?? "")
    })
  })
  for (let index = 0; index < rows.length; index += 1) rows[index] ??= []
  return { columns, rows }
}

const sheetHeaderCache = new Map<string, { expiresAt: number; headers: string[] }>()

function rememberSheetHeaders(spreadsheetId: string, tabName: string, headers: readonly string[]) {
  sheetHeaderCache.set(`${spreadsheetId}\u0001${tabName}`, { expiresAt: Date.now() + 60_000, headers: [...headers] })
}

/**
 * Les colonnes d'un onglet d'après sa seule ligne 1, gardée une minute : une écriture
 * fréquente (le journal du tabletop) ne relit pas les en-têtes à chaque fois.
 */
export async function namedColumnsOf(spreadsheetId: string, tabName: string, expected: readonly string[], aliases?: Record<string, readonly string[]>) {
  const cached = sheetHeaderCache.get(`${spreadsheetId}\u0001${tabName}`)
  let headers = cached && cached.expiresAt > Date.now() ? cached.headers : null
  if (!headers) {
    headers = (await readRange(spreadsheetId, sheetTabRange(tabName, "1:1")))[0] ?? []
    rememberSheetHeaders(spreadsheetId, tabName, headers)
  }
  return sheetColumns(headers, expected, aliases)
}

/** Aucune colonne prévue n'est trouvée par son nom alors que la ligne 1 est remplie : ce sont des données. */
function headerRowHoldsData(columns: SheetColumns) {
  const unnamed = new Set(columns.unnamed.map((item) => item.name))
  return columns.headers.some(Boolean) && !columns.expected.some((name) => columns.at(name) >= 0 && !unnamed.has(name))
}

/**
 * Donne à chaque colonne prévue son en-tête, sans rien déplacer ni remplacer : une case
 * d'origine restée vide reçoit son nom, une colonne absente est ajoutée à droite.
 */
export async function ensureNamedColumns(spreadsheetId: string, tabName: string, columns: SheetColumns) {
  if (!columns.missing.length && !columns.unnamed.length) return columns
  if (headerRowHoldsData(columns)) throw new Error("SHEET_HEADER_ROW_MISSING")
  const { cells, headers } = headerAdditions(columns)
  await ensureSheetColumnCount(spreadsheetId, tabName, headers.length)
  await updateRanges(spreadsheetId, cells.map((cell) => ({ range: sheetTabRange(tabName, `${columnName(cell.index + 1)}1`), values: [[cell.header]] })), { valueInputOption: "RAW" })
  console.info("SHEET_COLUMNS_ADDED", tabName, cells.map((cell) => cell.header).join(" | "))
  rememberSheetHeaders(spreadsheetId, tabName, headers)
  return withSheetHeaders(columns, headers)
}

/** Les écritures d'une ligne : seulement les cases nommées, par morceaux contigus. */
export function namedRowWrites(tabName: string, columns: SheetColumns, rowNumber: number, values: Record<string, SheetCell>) {
  return columns.runs(values).map((run) => ({
    range: sheetTabRange(tabName, `${columnName(run.start + 1)}${rowNumber}:${columnName(run.start + run.values.length)}${rowNumber}`),
    values: [run.values],
  }))
}

/**
 * Une ligne lue, remise dans l'ordre des colonnes prévues par Eraser : le code qui lit
 * `row[3]` lit alors la colonne prévue en 4e position, où qu'elle soit dans Sheets.
 */
export function canonicalRow(columns: SheetColumns, row: readonly (string | undefined)[]) {
  return columns.expected.map((name) => columns.get(row, name))
}

/** « A » → 0, « AA » → 26. */
function columnIndexOf(letters: string) {
  return [...letters].reduce((total, letter) => total * 26 + letter.charCodeAt(0) - 64, 0) - 1
}

/**
 * Une écriture décrite dans l'ordre prévu par Eraser (« I12 », « A12:Q12 ») envoyée
 * à la vraie place de chaque colonne, retrouvée par son nom. Une seule ligne à la fois.
 */
export function canonicalWrites(tabName: string, columns: SheetColumns, cells: string, values: SheetCell[][]) {
  const match = /^([A-Z]+)(\d+)(?::([A-Z]+)(\d+))?$/.exec(cells)
  if (!match || (match[4] && match[4] !== match[2]) || values.length > 1) throw new Error(`CANONICAL_RANGE_INVALID:${cells}`)
  const start = columnIndexOf(match[1])
  const named: Record<string, SheetCell> = {}
  ;(values[0] ?? []).forEach((value, offset) => {
    const name = columns.expected[start + offset]
    if (name) named[name] = value
  })
  return namedRowWrites(tabName, columns, Number(match[2]), named)
}

/** Des lignes entières décrites dans l'ordre prévu, chaque valeur rangée sous son en-tête. */
export function canonicalRows(columns: SheetColumns, rows: SheetCell[][]) {
  return rows.map((row) => columns.row(Object.fromEntries(columns.expected.map((name, index) => [name, row[index] ?? ""]))))
}

/** La plage d'une ligne entière (de A à la dernière colonne connue). */
export function namedRowRange(tabName: string, columns: SheetColumns, rowNumber: number) {
  return sheetTabRange(tabName, `A${rowNumber}:${columnName(Math.max(1, columns.width))}${rowNumber}`)
}

/** La plage où ajouter des lignes entières. */
export function namedAppendRange(tabName: string, columns: SheetColumns) {
  return sheetTabRange(tabName, `A:${columnName(Math.max(1, columns.width))}`)
}

export async function appendRows(
  spreadsheetId: string,
  range: string,
  values: Array<Array<string | number | boolean>>,
  options: WriteValuesOptions = {},
) {
  const parameters = new URLSearchParams({
    valueInputOption: options.valueInputOption || "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
  })
  if (options.includeValuesInResponse) {
    parameters.set("includeValuesInResponse", "true")
    parameters.set("responseValueRenderOption", "FORMATTED_VALUE")
  }
  const response = await googleSheetsFetch(
    `spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}:append?${parameters.toString()}`,
    { method: "POST", body: JSON.stringify({ values }) },
  )
  clearSpreadsheetReadCache(spreadsheetId)
  const updates = ((await response.json()) as AppendValuesResponse).updates
  const updatedRange = updates?.updatedRange?.trim() || ""
  if (values.length && !updatedRange) throw new Error("SHEETS_APPEND_RANGE_MISSING")

  const tabFromRange = (value: string) => {
    const raw = value.split("!", 1)[0]?.trim() || ""
    return raw.startsWith("'") && raw.endsWith("'")
      ? raw.slice(1, -1).replace(/''/g, "'")
      : raw
  }
  if (updatedRange && tabFromRange(updatedRange) !== tabFromRange(range)) {
    throw new Error(`SHEETS_APPEND_WRONG_RANGE:${updatedRange}`)
  }
  if (typeof updates?.updatedRows === "number" && updates.updatedRows !== values.length) {
    throw new Error(`SHEETS_APPEND_ROW_COUNT_MISMATCH:${updates.updatedRows}/${values.length}:${updatedRange}`)
  }
  return {
    updatedRange,
    updatedRows: updates?.updatedRows ?? values.length,
    updatedColumns: updates?.updatedColumns ?? 0,
    updatedCells: updates?.updatedCells ?? 0,
    updatedValues: normalizeGoogleSheetRows(updates?.updatedData?.values),
  } satisfies AppendRowsResult
}

export async function updateRange(
  spreadsheetId: string,
  range: string,
  values: Array<Array<string | number | boolean>>,
  options: Pick<WriteValuesOptions, "valueInputOption"> = {},
) {
  await googleSheetsFetch(
    `spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}?valueInputOption=${options.valueInputOption || "USER_ENTERED"}`,
    { method: "PUT", body: JSON.stringify({ values }) },
  )
  clearSpreadsheetReadCache(spreadsheetId)
}

async function updateRangeAndReturnValues(
  spreadsheetId: string,
  range: string,
  values: Array<Array<string | number | boolean>>,
) {
  const parameters = new URLSearchParams({
    valueInputOption: "USER_ENTERED",
    includeValuesInResponse: "true",
    responseValueRenderOption: "FORMATTED_VALUE",
  })
  const response = await googleSheetsFetch(
    `spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}?${parameters.toString()}`,
    { method: "PUT", body: JSON.stringify({ values }) },
  )
  clearSpreadsheetReadCache(spreadsheetId)
  return normalizeGoogleSheetRows(((await response.json()) as UpdateValuesResponse).updatedData?.values)
}

export async function updateRanges(
  spreadsheetId: string,
  data: Array<{ range: string; values: Array<Array<string | number | boolean>> }>,
  options: WriteValuesOptions = {},
) {
  if (!data.length) return [] as UpdateValuesResponse[]
  const response = await googleSheetsFetch(`spreadsheets/${spreadsheetId}/values:batchUpdate`, {
    method: "POST",
    body: JSON.stringify({
      valueInputOption: options.valueInputOption || "USER_ENTERED",
      includeValuesInResponse: options.includeValuesInResponse || false,
      responseValueRenderOption: "FORMATTED_VALUE",
      data,
    }),
  })
  clearSpreadsheetReadCache(spreadsheetId)
  const payload = (await response.json()) as { responses?: UpdateValuesResponse[] }
  return payload.responses ?? []
}

export type ObjectIndexRow = {
  rowNumber: number
  values: string[]
  /** Même contenu que `values`, mais avec la mise en forme Google Sheets conservée. */
  html: string[]
}

export type ObjectIndexTable = {
  fileId: string
  fileName: string
  webViewLink: string
  sheetId: number
  tabName: string
  headers: string[]
  rows: ObjectIndexRow[]
  /** En-têtes absents de la feuille (case vide en ligne 1), repris des autres index. */
  borrowedHeaders?: number[]
  /** Réglages enregistrés dans « Modifier », par en-tête replié (`foldName`). */
  columnSpecs?: Record<string, IndexColumnSpec>
}

let objectIndexTableCache: { expiresAt: number; tables: ObjectIndexTable[] } | null = null
const OBJECT_INDEX_CACHE_MS = 5 * 60_000

function normalizedHeader(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/gi, " ")
    .trim()
    .toLowerCase()
}

async function objectIndexSpreadsheetFiles() {
  const folder = await findDriveFolderByName("Objets")
  if (!folder) throw new Error("OBJECT_INDEX_FOLDER_NOT_FOUND")
  const files = await listDriveFolderFiles(folder.id)
  return files.flatMap((file) => {
    if (file.mimeType === "application/vnd.google-apps.spreadsheet") return [file]
    if (file.mimeType === "application/vnd.google-apps.shortcut" && file.shortcutDetails?.targetMimeType === "application/vnd.google-apps.spreadsheet") {
      return [{ ...file, id: file.shortcutDetails.targetId, mimeType: file.shortcutDetails.targetMimeType }]
    }
    return []
  })
}

/**
 * Les tableaux d'un classeur d'objets, lus tels qu'ils sont dans Sheets (sans les
 * en-têtes repris des autres index). Le regroupement s'en sert aussi pour vérifier
 * sa copie avant de basculer.
 */
export async function readObjectIndexSpreadsheet(file: { id: string; name: string; webViewLink?: string }): Promise<ObjectIndexTable[]> {
  const metadata = await googleSheetsJson<{
    sheets?: Array<{ properties?: { sheetId?: number; title?: string; gridProperties?: { columnCount?: number } } }>
  }>(`spreadsheets/${file.id}?fields=sheets.properties(sheetId,title,gridProperties.columnCount)`)
  const sheets = (metadata.sheets ?? []).flatMap((sheet) => {
    const sheetId = sheet.properties?.sheetId
    const tabName = sheet.properties?.title
    // L'onglet « Eraser · colonnes » décrit les colonnes : ce n'est pas un tableau d'objets.
    return sheetId === undefined || !tabName || tabName.startsWith("Eraser ·") ? [] : [{ sheetId, tabName }]
  })
  // Un tableau mis à la corbeille depuis « Modifier » n'est plus lu : ni l'index, ni
  // l'inventaire, ni les boutiques ne le voient, mais ses lignes restent dans Sheets.
  const hasSchema = (metadata.sheets ?? []).some((sheet) => sheet.properties?.title === "Eraser · colonnes")
  const schemaRows = hasSchema ? await readRange(file.id, sheetTabRange("Eraser · colonnes", "A2:F")).catch(() => [] as string[][]) : []
  const trashedTabs = new Set(schemaRows.filter((row) => row[0]?.trim() && !row[1]?.trim() && (row[5]?.trim() || /supprim/i.test(row[4] ?? ""))).map((row) => row[0].trim()))
  // Les réglages de colonnes choisis dans « Modifier » (style imposé, options…), par onglet
  // puis par en-tête : l'inventaire et les magasins affichent les objets dans ce style.
  const columnSpecs = new Map<string, Record<string, IndexColumnSpec>>()
  for (const row of schemaRows) {
    const tab = row[0]?.trim()
    const column = row[1]?.trim()
    if (!tab || !column || !row[3]?.trim() || row[5]?.trim() || /supprim/i.test(row[4] ?? "")) continue
    try {
      const spec = JSON.parse(row[3]) as IndexColumnSpec
      if (spec && typeof spec === "object" && typeof spec.kind === "string") columnSpecs.set(tab, { ...(columnSpecs.get(tab) ?? {}), [foldName(column)]: spec })
    } catch { /* un réglage illisible : la colonne garde son type par défaut */ }
  }
  sheets.splice(0, sheets.length, ...sheets.filter((sheet) => !trashedTabs.has(sheet.tabName)))
  // Les cellules sont lues avec leur mise en forme (couleurs, gras, liens) afin que
  // l’Index des objets l’affiche et la conserve, comme l’Index des classes.
  const parameters = new URLSearchParams({
    includeGridData: "true",
    fields: "sheets(properties(sheetId,title),data(startRow,startColumn,rowData(values(formattedValue,userEnteredValue,textFormatRuns,effectiveFormat(textFormat)))))",
  })
  sheets.forEach((sheet) => parameters.append("ranges", sheetTabRange(sheet.tabName, "A1:AZ")))
  const payload = sheets.length ? await googleSheetsJson<{
    sheets?: Array<{
      properties?: { sheetId?: number; title?: string }
      data?: Array<{ startRow?: number; startColumn?: number; rowData?: Array<{ values?: GoogleGridCell[] }> }>
    }>
  }>(`spreadsheets/${file.id}?${parameters.toString()}`) : { sheets: [] }
  return sheets.map((sheet) => {
    const grid = payload.sheets?.find((candidate) => candidate.properties?.title === sheet.tabName)
    const cells: Array<Array<{ value: string; html: string }>> = []
    for (const block of grid?.data ?? []) {
      const startRow = block.startRow ?? 0
      const startColumn = block.startColumn ?? 0
      for (const [rowOffset, row] of (block.rowData ?? []).entries()) {
        const target = cells[startRow + rowOffset] ||= []
        for (const [columnOffset, cell] of (row.values ?? []).entries()) {
          const value = gridCellValue(cell, true)
          target[startColumn + columnOffset] = { value, html: richTextHtml(value, cell.textFormatRuns, cell.effectiveFormat?.textFormat) }
        }
      }
    }
    const usedWidth = Math.max(1, ...cells.map((row) => row.length))
    const rawHeaders = cells[0] ?? []
    const headers = Array.from({ length: usedWidth }, (_, index) => rawHeaders[index]?.value.trim() || `Colonne ${index + 1}`)
    const lastFilled = lastFilledRow(cells.slice(1))
    return {
      fileId: file.id,
      fileName: file.name,
      webViewLink: file.webViewLink || `https://docs.google.com/spreadsheets/d/${file.id}/edit`,
      sheetId: sheet.sheetId,
      tabName: sheet.tabName,
      headers,
      columnSpecs: columnSpecs.get(sheet.tabName),
      // Les lignes vides entre deux lignes remplies restent affichées, comme dans
      // Sheets : ce sont celles qu'on vient d'insérer.
      rows: cells.slice(1).flatMap((row, index) => row.some((cell) => cell?.value.trim()) || index < lastFilled
        ? [{
            rowNumber: index + 2,
            values: headers.map((_, column) => row[column]?.value ?? ""),
            html: headers.map((_, column) => row[column]?.html ?? ""),
          }]
        : []),
    } satisfies ObjectIndexTable
  })
}

/** Le dernier catalogue lu en entier : rendu si une relecture échoue (Google indisponible un instant). */
let lastGoodObjectIndexTables: ObjectIndexTable[] | null = null
/** Une seule lecture à la fois : l'inventaire, les magasins et l'index la partagent. */
let objectIndexTablesRequest: Promise<ObjectIndexTable[]> | null = null

export function listObjectIndexTables(): Promise<ObjectIndexTable[]> {
  if (objectIndexTableCache && objectIndexTableCache.expiresAt > Date.now()) return Promise.resolve(objectIndexTableCache.tables)
  if (!objectIndexTablesRequest) {
    objectIndexTablesRequest = loadObjectIndexTables().finally(() => { objectIndexTablesRequest = null })
  }
  return objectIndexTablesRequest
}

/** Quand le catalogue a été lu en entier pour la dernière fois. */
let objectIndexLoadedAt = 0
const OBJECT_INDEX_STALE_MS = 30 * 60_000

/**
 * Le catalogue pour l'affichage (page de l'index, inventaires, magasins, références) :
 * un catalogue expiré depuis moins de 30 minutes est rendu tout de suite et relu en
 * arrière-plan, au lieu de faire attendre la relecture de tous les classeurs. Une écriture
 * d'Eraser vide le catalogue : elle n'est jamais suivie d'une copie périmée. Les écritures
 * (numéros de ligne, colonnes) passent par `listObjectIndexTables`, toujours exact.
 */
export function listObjectIndexTablesForDisplay(): Promise<ObjectIndexTable[]> {
  const cache = objectIndexTableCache
  if (cache && cache.expiresAt > Date.now()) return Promise.resolve(cache.tables)
  if (cache && Date.now() - objectIndexLoadedAt < OBJECT_INDEX_STALE_MS) {
    listObjectIndexTables().catch(() => undefined)
    return Promise.resolve(cache.tables)
  }
  return listObjectIndexTables()
}

async function readObjectIndexSpreadsheetWithRetry(file: { id: string; name: string; webViewLink?: string }) {
  try {
    return await readObjectIndexSpreadsheet(file)
  } catch (error) {
    console.error("OBJECT_INDEX_READ_FAILED", file.name, error instanceof Error ? error.message : "UNKNOWN_ERROR")
    // Une seconde tentative : la lecture (toutes les cellules, mise en forme comprise) est lourde.
    await new Promise((resolve) => setTimeout(resolve, 1_500))
    return readObjectIndexSpreadsheet(file)
  }
}

async function loadObjectIndexTables(): Promise<ObjectIndexTable[]> {
  let results: Array<{ tables: ObjectIndexTable[]; error: unknown }>
  try {
    const files = await objectIndexSpreadsheetFiles()
    results = await Promise.all(files.map(async (file) => {
      try {
        return { tables: await readObjectIndexSpreadsheetWithRetry(file), error: null }
      } catch (error) {
        console.error("OBJECT_INDEX_READ_FAILED", file.name, error instanceof Error ? error.message : "UNKNOWN_ERROR")
        return { tables: [] as ObjectIndexTable[], error }
      }
    }))
  } catch (error) {
    results = [{ tables: [], error }]
  }
  const firstError = results.find((result) => result.error)?.error
  // Un classeur illisible à l'instant : le dernier catalogue complet plutôt qu'un catalogue
  // vide (les objets des inventaires perdraient leurs colonnes). Relu dans une minute.
  if (firstError && lastGoodObjectIndexTables) {
    objectIndexTableCache = { expiresAt: Date.now() + 60_000, tables: lastGoodObjectIndexTables }
    return lastGoodObjectIndexTables
  }
  const tables = fillMissingObjectIndexHeaders(results.flatMap((result) => result.tables))
  if (!tables.length && firstError) throw firstError
  tables.sort((left, right) => left.fileName.localeCompare(right.fileName, "fr") || left.tabName.localeCompare(right.tabName, "fr"))
  objectIndexTableCache = { expiresAt: Date.now() + OBJECT_INDEX_CACHE_MS, tables }
  if (!firstError) { lastGoodObjectIndexTables = tables; objectIndexLoadedAt = Date.now() }
  // Les icônes s'écrivent par numéro de colonne : jamais pendant une réparation des en-têtes.
  if (tables.some(needsObjectIndexHeaderRepair)) scheduleObjectIndexHeaderRepair(tables)
  else {
    scheduleObjectIndexIconSync(tables)
    // Des en-têtes ajoutés après la dernière colonne ne déplacent pas la colonne Icône.
    if (tables.some(needsObjectCombatHeaders)) scheduleObjectCombatColumns(tables)
  }
  return tables
}

/** Un tableau d'objets à qui il manque une colonne de combat, ou qui a encore l'ancien en-tête. */
function needsObjectCombatHeaders(table: ObjectIndexTable) {
  const plan = planObjectCombatHeaders(table.headers)
  return plan.renames.length > 0 || plan.append.length > 0
}

let objectCombatColumnsAttemptAt = 0

function scheduleObjectCombatColumns(tables: ObjectIndexTable[]) {
  if (Date.now() - objectCombatColumnsAttemptAt < 10 * 60_000) return
  objectCombatColumnsAttemptAt = Date.now()
  runInBackground(updateObjectCombatHeaders(tables), "OBJECT_COMBAT_COLUMNS_FAILED")
}

/**
 * Met la ligne 1 des tableaux d'objets à jour (voir `planObjectCombatHeaders`) : une
 * « Valeur » qui sert de prix devient « Prix », l'ancienne « Dégâts » devient « Valeur »,
 * les colonnes absentes sont ajoutées après la dernière colonne utilisée. Seuls des
 * en-têtes changent : aucune colonne ne bouge et aucune case en dessous n'est touchée
 * (les magasins lisent certaines colonnes par leur position).
 */
async function updateObjectCombatHeaders(tables: ObjectIndexTable[]) {
  for (const table of tables) {
    if (!needsObjectCombatHeaders(table) || needsObjectIndexHeaderRepair(table)) continue
    // On relit la ligne 1 : un en-tête changé entre-temps (à la main, dans Sheets) est respecté.
    const [firstRow = []] = await readRange(table.fileId, sheetTabRange(table.tabName, "A1:AZ1")).catch(() => [[] as string[]])
    if (!firstRow.some((header) => header?.trim())) continue
    const plan = planObjectCombatHeaders(firstRow.map((header) => header ?? ""))
    // Après la dernière colonne qui contient quelque chose, en-tête ou valeur.
    const start = Math.max(table.headers.length, firstRow.length)
    if (start + plan.append.length > 52) continue
    const writes = plan.renames.map((rename) => ({ range: sheetTabRange(table.tabName, `${columnName(rename.index + 1)}1`), values: [[rename.header]] }))
    if (plan.append.length) {
      await ensureSheetColumnCount(table.fileId, table.tabName, start + plan.append.length)
      writes.push({ range: sheetTabRange(table.tabName, `${columnName(start + 1)}1:${columnName(start + plan.append.length)}1`), values: [plan.append] })
    }
    if (!writes.length) continue
    await updateRanges(table.fileId, writes, { valueInputOption: "RAW" })
    console.info("OBJECT_COMBAT_HEADERS_UPDATED", table.fileName, table.tabName, { renamed: plan.renames.map((rename) => `${firstRow[rename.index]} → ${rename.header}`), added: plan.append })
    clearSpreadsheetReadCache(table.fileId)
  }
  clearObjectIndexTableCache()
}

/**
 * Les colonnes en double entièrement vides d'un tableau d'objets : la « Description »
 * qu'une ancienne version ajoutait en fin de tableau quand la ligne d'en-têtes était
 * vide. La première colonne du nom (celle qui contient le texte) est toujours gardée,
 * et une colonne qui contient quoi que ce soit n'est jamais retenue.
 */
export function emptyDuplicateObjectColumns(table: Pick<ObjectIndexTable, "headers" | "rows">) {
  const seen = new Set<string>()
  const duplicates: number[] = []
  table.headers.forEach((header, index) => {
    const key = normalizedHeader(header)
    if (!key || blankObjectIndexHeader.test(header)) return
    // Seules les colonnes qu'Eraser ajoute lui-même en fin de tableau sont concernées.
    if (seen.has(key) && ERASER_APPENDED_OBJECT_HEADERS.has(key) && table.rows.every((row) => !(row.values[index] ?? "").trim())) duplicates.push(index)
    seen.add(key)
  })
  return duplicates
}

const ERASER_APPENDED_OBJECT_HEADERS = new Set(["description", "icone", "icon", "nombre max"])

function needsObjectIndexHeaderRepair(table: ObjectIndexTable) {
  return Boolean(table.borrowedHeaders?.length) || emptyDuplicateObjectColumns(table).length > 0
}

let objectHeaderRepairAttemptAt = 0

function scheduleObjectIndexHeaderRepair(tables: ObjectIndexTable[]) {
  if (Date.now() - objectHeaderRepairAttemptAt < 10 * 60_000) return
  objectHeaderRepairAttemptAt = Date.now()
  runInBackground(repairObjectIndexHeaders(tables.filter(needsObjectIndexHeaderRepair)), "OBJECT_HEADER_REPAIR_FAILED")
}

/**
 * Répare la ligne d'en-têtes des tableaux d'objets, sans toucher à une seule valeur :
 * les en-têtes repris des autres index sont écrits dans les cases vides de la ligne 1
 * (la feuille devient lisible et modifiable dans Sheets comme dans Eraser), puis les
 * colonnes en double entièrement vides sont supprimées.
 */
async function repairObjectIndexHeaders(tables: ObjectIndexTable[]) {
  for (const table of tables) {
    const duplicates = emptyDuplicateObjectColumns(table)
    // On relit la ligne 1 : on n'écrit que dans des cases réellement vides.
    const [firstRow = []] = await readRange(table.fileId, sheetTabRange(table.tabName, "A1:AZ1")).catch(() => [[] as string[]])
    const writes = (table.borrowedHeaders ?? [])
      .filter((index) => !duplicates.includes(index) && !(firstRow[index] ?? "").trim())
      .map((index) => ({ range: sheetTabRange(table.tabName, `${columnName(index + 1)}1`), values: [[table.headers[index]]] }))
    if (writes.length) await updateRanges(table.fileId, writes)
    if (duplicates.length) {
      await googleSheetsJson(`spreadsheets/${table.fileId}:batchUpdate`, {
        method: "POST",
        body: JSON.stringify({ requests: [...duplicates].sort((left, right) => right - left).map((index) => ({ deleteDimension: { range: { sheetId: table.sheetId, dimension: "COLUMNS", startIndex: index, endIndex: index + 1 } } })) }),
      })
    }
    if (writes.length || duplicates.length) {
      console.info("OBJECT_HEADER_REPAIRED", table.fileName, table.tabName, { headersWritten: writes.length, emptyDuplicatesRemoved: duplicates.map((index) => table.headers[index]) })
      clearSpreadsheetReadCache(table.fileId)
    }
  }
  clearObjectIndexTableCache()
}

const blankObjectIndexHeader = /^Colonne \d+$/

/**
 * Une feuille dont la ligne d'en-têtes est vide (ou incomplète) n'avait pas de colonne
 * « Nom » : tous ses objets disparaissaient du catalogue, des inventaires et des
 * magasins. Les en-têtes manquants sont repris des autres index, qui partagent la même
 * disposition (Nom, Description, Type…). Rien n'est écrit dans la feuille.
 */
function fillMissingObjectIndexHeaders(tables: ObjectIndexTable[]) {
  const votes: Array<Map<string, number>> = []
  for (const table of tables) {
    table.headers.forEach((header, index) => {
      if (blankObjectIndexHeader.test(header)) return
      const counts = votes[index] ||= new Map()
      counts.set(header, (counts.get(header) ?? 0) + 1)
    })
  }
  const nameAliases = new Set(["nom", "nom de l objet", "objet", "arme", "equipement", "ressource", "livre", "titre"])
  return tables.map((table) => {
    if (!table.headers.some((header) => blankObjectIndexHeader.test(header))) return table
    // Un nom en double reste possible (une « Description » ajoutée en fin de tableau) :
    // la recherche de colonne prend la première, celle qui contient vraiment le texte.
    const headers = table.headers.map((header, index) => {
      if (!blankObjectIndexHeader.test(header)) return header
      const candidates = [...(votes[index]?.entries() ?? [])].sort((left, right) => right[1] - left[1])
      return candidates[0]?.[0] || header
    })
    if (!headers.some((header) => nameAliases.has(normalizedHeader(header))) && blankObjectIndexHeader.test(table.headers[0] ?? "")) headers[0] = "Nom"
    const borrowedHeaders = table.headers.flatMap((header, index) => blankObjectIndexHeader.test(header) && !blankObjectIndexHeader.test(headers[index]) ? [index] : [])
    return { ...table, headers, borrowedHeaders }
  })
}

/** « #REF! », « #N/A »… : une formule cassée dans Sheets, pas une vraie valeur. */
function isSheetErrorValue(value: string) {
  return /^#(REF!|N\/A|VALUE!|NAME\?|DIV\/0!|NUM!|NULL!|ERROR!)$/i.test(value.trim())
}

/**
 * Les tableaux d'objets relus à l'instant, en-têtes réparés d'abord (sans attendre la
 * tâche de fond) : le regroupement copie ainsi des feuilles qui ne bougent plus.
 */
export async function objectIndexTablesForRegroup() {
  clearObjectIndexTableCache()
  objectHeaderRepairAttemptAt = Date.now()
  let tables = await listObjectIndexTables()
  const broken = tables.filter(needsObjectIndexHeaderRepair)
  if (broken.length) {
    await repairObjectIndexHeaders(broken)
    tables = await listObjectIndexTables()
  }
  return tables
}

/** Le nom d'un objet d'un tableau (colonne Nom ou ses variantes). */
export function objectIndexRowName(table: ObjectIndexTable, row: ObjectIndexRow) {
  return objectIndexCell(table, row, ["Nom", "Nom de l'objet", "Objet", "Arme", "Équipement", "Equipement", "Ressource", "Livre", "Titre"])
}

export async function refreshObjectIndexTables() {
  clearObjectIndexTableCache()
  return listObjectIndexTables()
}

/** Position de la dernière ligne qui contient quelque chose. */
function lastFilledRow(rows: Array<Array<{ value: string } | undefined> | undefined>) {
  for (let index = rows.length - 1; index >= 0; index -= 1) if (rows[index]?.some((cell) => cell?.value.trim())) return index
  return -1
}

export function clearObjectIndexTableCache() {
  objectIndexTableCache = null
  // Une lecture lancée avant une écriture ne doit pas servir après elle.
  objectIndexTablesRequest = null
  clearInventoryWorkbookCache()
}

async function validatedObjectIndexTable(fileId: string, tabName: string) {
  if (!/^[A-Za-z0-9_-]+$/.test(fileId) || !tabName.trim()) throw new Error("INVALID_OBJECT_INDEX")
  const table = (await listObjectIndexTables()).find((candidate) => candidate.fileId === fileId && candidate.tabName === tabName)
  if (!table) throw new Error("OBJECT_INDEX_NOT_FOUND")
  return table
}

export async function addObjectIndexRow(fileId: string, tabName: string) {
  const table = await validatedObjectIndexTable(fileId, tabName)
  const values = table.headers.map((header) => normalizedHeader(header) === "id" ? crypto.randomUUID() : "")
  await appendRows(fileId, sheetTabRange(tabName, `A:${columnName(table.headers.length)}`), [values])
  clearObjectIndexTableCache()
}

/**
 * Enregistre une seule cellule avec sa mise en forme. L’éditeur de l’Index des objets
 * sauvegarde cellule par cellule : deux colonnes modifiées coup sur coup ne s’écrasent
 * plus l’une l’autre, et la mise en forme des autres cellules reste intacte.
 */
export async function updateObjectIndexCell(fileId: string, tabName: string, rowNumber: number, column: number, html: string) {
  const table = await validatedObjectIndexTable(fileId, tabName)
  const row = table.rows.find((candidate) => candidate.rowNumber === rowNumber)
  if (!row || !Number.isInteger(column) || column < 0 || column >= table.headers.length) throw new Error("OBJECT_INDEX_ROW_NOT_FOUND")
  // Une vraie case à cocher de Sheets (TRUE/FALSE) reste une case : la valeur est écrite en booléen.
  if (/^(true|false)$/i.test((row.values[column] ?? "").trim()) && /^(true|false)$/i.test(html.trim())) {
    await googleSheetsJson(`spreadsheets/${fileId}:batchUpdate`, {
      method: "POST",
      body: JSON.stringify({ requests: [{ updateCells: {
        range: { sheetId: table.sheetId, startRowIndex: rowNumber - 1, endRowIndex: rowNumber, startColumnIndex: column, endColumnIndex: column + 1 },
        rows: [{ values: [{ userEnteredValue: { boolValue: /^true$/i.test(html.trim()) } }] }],
        fields: "userEnteredValue",
      } }] }),
    })
    clearSpreadsheetReadCache(fileId)
  } else await updateFormattedCell({ spreadsheetId: fileId, sheetId: table.sheetId, rowNumber, column, html })
  const plain = htmlToRichText(html.slice(0, 50_000)).text
  if (objectIndexTableCache) {
    objectIndexTableCache = {
      expiresAt: objectIndexTableCache.expiresAt,
      tables: objectIndexTableCache.tables.map((candidate) => candidate.fileId === fileId && candidate.tabName === tabName
        ? { ...candidate, rows: candidate.rows.map((candidateRow) => candidateRow.rowNumber === rowNumber
            ? {
                ...candidateRow,
                values: candidateRow.values.map((value, index) => index === column ? plain : value),
                html: candidateRow.html.map((value, index) => index === column ? html : value),
              }
            : candidateRow) }
        : candidate),
    }
  }
  clearInventoryWorkbookCache()
}

export async function updateObjectIndexRow(fileId: string, tabName: string, rowNumber: number, values: string[]) {
  const table = await validatedObjectIndexTable(fileId, tabName)
  const row = table.rows.find((candidate) => candidate.rowNumber === rowNumber)
  if (!row || !Number.isInteger(rowNumber) || rowNumber < 2 || values.length > table.headers.length) throw new Error("OBJECT_INDEX_ROW_NOT_FOUND")
  const normalizedValues = table.headers.map((_, index) => String(values[index] ?? ""))
  await updateRange(fileId, sheetTabRange(tabName, `A${rowNumber}:${columnName(table.headers.length)}${rowNumber}`), [normalizedValues])
  if (objectIndexTableCache) {
    objectIndexTableCache = {
      expiresAt: Date.now() + OBJECT_INDEX_CACHE_MS,
      tables: objectIndexTableCache.tables.map((candidate) => candidate.fileId === fileId && candidate.tabName === tabName
        ? { ...candidate, rows: candidate.rows.map((candidateRow) => candidateRow.rowNumber === rowNumber ? { ...candidateRow, values: normalizedValues, html: normalizedValues } : candidateRow) }
        : candidate),
    }
  }
  clearInventoryWorkbookCache()
}

/**
 * Insère une ligne vide et la remplit, juste sous `afterRowNumber`. Contrairement à
 * `addObjectIndexRow` qui ajoute à la fin, la ligne apparaît là où on l’a demandée —
 * c’est ce qu’attend quelqu’un qui vient de Google Sheets.
 */
async function insertObjectIndexRowAfter(fileId: string, table: { sheetId: number; headers: string[] }, tabName: string, afterRowNumber: number, values: string[][]) {
  await googleSheetsJson(`spreadsheets/${fileId}:batchUpdate`, {
    method: "POST",
    body: JSON.stringify({ requests: [{ insertDimension: { range: { sheetId: table.sheetId, dimension: "ROWS", startIndex: afterRowNumber, endIndex: afterRowNumber + values.length }, inheritFromBefore: afterRowNumber > 1 } }] }),
  })
  const target = afterRowNumber + 1
  // Des lignes entièrement vides n'ont rien à écrire (et une plage vide serait refusée).
  if (values.some((row) => row.some(Boolean))) await updateRange(fileId, sheetTabRange(tabName, `A${target}:${columnName(table.headers.length)}${target + values.length - 1}`), values)
  clearObjectIndexTableCache()
}

/** Des lignes vides sous `afterRowNumber` ; chacune reçoit un identifiant s'il y a une colonne ID. */
export async function insertObjectIndexRow(fileId: string, tabName: string, afterRowNumber: number, count = 1) {
  const table = await validatedObjectIndexTable(fileId, tabName)
  if (!Number.isInteger(afterRowNumber) || afterRowNumber < 1) throw new Error("OBJECT_INDEX_ROW_NOT_FOUND")
  const rows = Math.max(1, Math.min(100, Math.trunc(count) || 1))
  const values = Array.from({ length: rows }, () => table.headers.map((header) => normalizedHeader(header) === "id" ? crypto.randomUUID() : ""))
  await insertObjectIndexRowAfter(fileId, table, tabName, afterRowNumber, values)
}

/** Ajoute une ligne à la fin, déjà remplie : c’est le formulaire « Ajouter un objet ». */
export async function addObjectIndexRowWithValues(fileId: string, tabName: string, provided: string[]) {
  const table = await validatedObjectIndexTable(fileId, tabName)
  const values = table.headers.map((header, index) => normalizedHeader(header) === "id" && !String(provided[index] ?? "").trim() ? crypto.randomUUID() : String(provided[index] ?? ""))
  // Le formulaire envoie du texte enrichi : la ligne est écrite en texte, puis chaque
  // cellule mise en forme reçoit sa mise en forme (et non ses balises).
  const formatted = values.flatMap((value, column) => /<[a-z]/i.test(value) ? [{ column, html: value.slice(0, 50_000) }] : [])
  const appended = await appendRows(fileId, sheetTabRange(tabName, `A:${columnName(table.headers.length)}`), [values.map((value) => /<[a-z]/i.test(value) ? htmlToRichText(value).text : value)])
  const rowNumber = Number.parseInt(appended.updatedRange?.match(/![A-Z]+(\d+)/)?.[1] || "", 10)
  if (Number.isInteger(rowNumber) && rowNumber > 1) {
    for (const cell of formatted) await updateFormattedCell({ spreadsheetId: fileId, sheetId: table.sheetId, rowNumber, column: cell.column, html: cell.html })
  }
  clearObjectIndexTableCache()
}

export async function duplicateObjectIndexRow(fileId: string, tabName: string, rowNumber: number) {
  const table = await validatedObjectIndexTable(fileId, tabName)
  const row = table.rows.find((candidate) => candidate.rowNumber === rowNumber)
  if (!row) throw new Error("OBJECT_INDEX_ROW_NOT_FOUND")
  const values = table.headers.map((header, index) => normalizedHeader(header) === "id" ? crypto.randomUUID() : row.values[index] ?? "")
  // La copie apparaît juste sous l’originale, comme dans Google Sheets.
  await insertObjectIndexRowAfter(fileId, table, tabName, rowNumber, [values])
}

export async function deleteObjectIndexRow(fileId: string, tabName: string, rowNumber: number) {
  const table = await validatedObjectIndexTable(fileId, tabName)
  if (!table.rows.some((candidate) => candidate.rowNumber === rowNumber) || !Number.isInteger(rowNumber) || rowNumber < 2) throw new Error("OBJECT_INDEX_ROW_NOT_FOUND")
  await deleteGoogleSheetRow(fileId, tabName, rowNumber, table.sheetId)
  clearObjectIndexTableCache()
}

export async function deleteGoogleSheetRow(spreadsheetId: string, tabName: string, rowNumber: number, knownSheetId?: number) {
  if (!/^[A-Za-z0-9_-]+$/.test(spreadsheetId) || !tabName.trim() || !Number.isInteger(rowNumber) || rowNumber < 2) throw new Error("INVALID_SHEET_ROW")
  let sheetId = knownSheetId
  if (sheetId === undefined) {
    const metadata = await googleSheetsJson<{ sheets?: Array<{ properties?: { sheetId?: number; title?: string } }> }>(`spreadsheets/${spreadsheetId}?fields=sheets.properties(sheetId,title)`)
    sheetId = metadata.sheets?.find((sheet) => sheet.properties?.title === tabName)?.properties?.sheetId
  }
  if (sheetId === undefined) throw new Error("SHEET_TAB_NOT_FOUND")
  await googleSheetsJson(`spreadsheets/${spreadsheetId}:batchUpdate`, {
    method: "POST",
    body: JSON.stringify({ requests: [{ deleteDimension: { range: { sheetId, dimension: "ROWS", startIndex: rowNumber - 1, endIndex: rowNumber } } }] }),
  })
  clearSpreadsheetReadCache(spreadsheetId)
}

const oldGeneratedDescriptions = new Set([
  "Une sphère bleu pâle, veinée de givre ; son cœur tinte doucement lorsqu’on la remue.",
  "Une petite coque dense, marquée de fines rainures et d’un mécanisme aussi simple qu’inquiétant.",
  "Un cercle délicatement ouvragé, assez discret pour passer inaperçu jusqu’à ce que la lumière l’accroche.",
  "Une chaîne souple retient un motif patiné, poli par les doigts de ses anciens porteurs.",
  "Des plaques ajustées portent les traces mates d’un usage patient, entretenues avec un soin presque rituel.",
  "Sa surface cabossée raconte plusieurs chocs ; la poignée, elle, demeure étonnamment confortable.",
  "Une arme bien équilibrée, dont les marques d’usure dessinent une histoire plus longue que son tranchant.",
  "Le liquide accroche la paroi en lentes volutes colorées et laisse un parfum vif dès qu’on approche le bouchon.",
  "Le papier craque sous les doigts ; l’encre semble plus sombre au centre de chaque signe.",
  "Une reliure fatiguée protège des pages annotées, cornées aux passages que quelqu’un jugeait essentiels.",
  "Un outil robuste, poli aux endroits où la main revient toujours, avec juste assez de poids pour inspirer confiance.",
  "Quatre dents légèrement irrégulières et un manche gravé lui donnent le charme modeste d’un objet souvent utilisé.",
  "Une matière brute aux nuances changeantes, choisie pour ce qu’un artisan attentif pourrait encore en tirer.",
  "Un objet sobre aux détails soignés, marqué par quelques traces qui suggèrent qu’il a déjà beaucoup voyagé.",
  "Sa forme familière cache une fabrication attentive ; un petit défaut lui donne un caractère presque unique.",
  "Une pièce compacte, agréable en main, dont la patine raconte mieux l’usage que n’importe quelle étiquette.",
])

function descriptionHash(value: string) {
  return [...value].reduce((hash, character) => Math.imul(hash ^ character.codePointAt(0)!, 16777619), 2166136261) >>> 0
}

function suggestedObjectDescription(name: string, type: string, subtype: string, effect: string, salt: string) {
  const value = normalizedHeader(`${subtype} ${name} ${type} ${effect}`)
  const hash = descriptionHash(`${name}|${type}|${subtype}|${salt}`)
  const pick = <T,>(items: readonly T[], divisor = 1) => items[Math.floor(hash / divisor) % items.length]
  const metals = ["acier bleui", "fer noirci", "bronze rouge", "argent mat", "cuivre sombre", "alliage pâle"] as const
  const woods = ["if sombre", "frêne blond", "noyer veiné", "bouleau blanc", "chêne fumé", "ébène strié"] as const
  const colors = ["bleu d’orage", "vert mousse", "rouge sombre", "ivoire", "gris de cendre", "violet profond"] as const
  const details = ["trois encoches fines", "un motif spiralé", "une ligne de points blancs", "un sceau fendu", "une nervure nacrée", "un fil doré discontinu", "une marque triangulaire", "un bord dentelé"] as const
  const finish = ["mate et régulière", "striée de lignes pâles", "ponctuée de reflets froids", "assombrie près des bords", "polie comme un galet", "marquée d’ondes concentriques"] as const
  const metal = pick(metals)
  const wood = pick(woods, 7)
  const color = pick(colors, 11)
  const detail = pick(details, 17)
  const surface = pick(finish, 29)
  const magicalDetail = /glace|froid|givre/.test(value) ? "Une buée froide perle à sa surface."
    : /feu|flamme|brul|incend/.test(value) ? "Une odeur de braise s’en dégage."
      : /foudre|eclair|electri/.test(value) ? "De minuscules étincelles sautent sous les doigts."
        : /poison|toxique|venin/.test(value) ? "Un reflet vert remonte lorsqu’on l’incline."
          : /soin|guerison|vie/.test(value) ? "La matière devient tiède dans la paume."
            : /ombre|tenebre|obscur/.test(value) ? "La lumière s’émousse le long de ses contours."
              : /lumiere|solaire|sacre/.test(value) ? "Un éclat laiteux demeure au creux de ses reliefs."
                : /eau|marin|ocean/.test(value) ? "Une fraîche odeur de pluie accompagne chaque mouvement."
                  : /vent|air|tempete/.test(value) ? "Un souffle ténu suit ses mouvements."
                    : ""
  const finishSentence = magicalDetail || `${detail[0].toUpperCase()}${detail.slice(1)} complète l’ensemble.`
  if (/bombe|grenade/.test(value)) return `Coque ronde, ${color}, cerclée de ${metal}. ${magicalDetail || "Le mécanisme claque d’un son sec."}`
  if (/epee|sabre|rapiere|lame/.test(value)) return `Lame ${surface}. Garde en ${metal}, marquée de ${detail}. ${magicalDetail}`.trim()
  if (/dague|couteau/.test(value)) return `Lame courte ${surface}. Manche en ${wood}, creusé de ${detail}. ${magicalDetail}`.trim()
  if (/arc(?!h)|longbow/.test(value)) return `Branches en ${wood}, renforcées de fil sombre. La poignée porte ${detail}. ${magicalDetail}`.trim()
  if (/arbalete/.test(value)) return `Fût en ${wood}, mécanisme de ${metal}. ${detail[0].toUpperCase()}${detail.slice(1)} longe la rainure. ${magicalDetail}`.trim()
  if (/bouclier|ecu/.test(value)) return `Face ${surface}, bordée de ${metal}. ${detail[0].toUpperCase()}${detail.slice(1)} entoure l’umbo. ${magicalDetail}`.trim()
  if (/hache/.test(value)) return `Fer ${surface}, fixé sur un manche de ${wood}. ${finishSentence}`
  if (/marteau|masse/.test(value)) return `Tête en ${metal}, manche gainé de cuir ${color}. ${finishSentence}`
  if (/lance|pique|javelot/.test(value)) return `Hampe en ${wood}, pointe de ${metal}. ${finishSentence}`
  if (/anneau|bague/.test(value)) return `Anneau fin en ${metal}. ${detail[0].toUpperCase()}${detail.slice(1)} court sur sa face intérieure. ${magicalDetail}`.trim()
  if (/collier|amulette|pendentif/.test(value)) return `Pendentif ${color} suspendu à une chaîne de ${metal}. Son revers porte ${detail}. ${magicalDetail}`.trim()
  if (/armure|cuirasse|plastron/.test(value)) return `Plaques de ${metal}, doublure ${color}. Les attaches dessinent ${detail}. ${magicalDetail}`.trim()
  if (/casque|heaume/.test(value)) return `Calotte de ${metal}, visière ${surface}. ${finishSentence}`
  if (/botte/.test(value)) return `Cuir ${color}, semelle cousue de fil clair. ${finishSentence}`
  if (/gant|gantelet/.test(value)) return `Paume souple, phalanges renforcées de ${metal}. ${finishSentence}`
  if (/cape|manteau/.test(value)) return `Étoffe ${color}, lourde sur les épaules. L’ourlet suit ${detail}. ${magicalDetail}`.trim()
  if (/livre|grimoire|ouvrage|manuel/.test(value)) return `Reliure ${color}, fermoir de ${metal}. Les marges sont ponctuées de ${detail}. ${magicalDetail}`.trim()
  if (/parchemin|rouleau/.test(value)) return `Feuille ivoire roulée autour d’une baguette de ${wood}. L’encre forme ${detail}. ${magicalDetail}`.trim()
  if (/potion|elixir|fiole/.test(value)) return `Flacon de verre ${color}, bouché à la cire. Le liquide se sépare en fines volutes. ${magicalDetail}`.trim()
  if (/fourchette/.test(value)) return `Quatre dents de ${metal}, manche gravé de ${detail}. Le bord accroche un reflet ${color}.`
  if (/outil|marteau|pioche|pelle/.test(value)) return `Poignée de ${wood}, tête de ${metal}. ${detail[0].toUpperCase()}${detail.slice(1)} indique la prise.`
  if (/gemme|cristal|pierre/.test(value)) return `Éclat ${color}, taillé en facettes irrégulières. ${magicalDetail || "Une nervure claire traverse son cœur."}`
  if (/plante|herbe|fleur/.test(value)) return `Tiges ${color}, feuilles bordées d’un duvet pâle. Une odeur nette se libère lorsqu’on les froisse.`
  if (/bois|branche|planche/.test(value)) return `Fibre de ${wood}, serrée autour d’un nœud clair. La coupe exhale encore une pointe de résine.`
  if (/minerai|metal|lingot|ressource|materiau/.test(value)) return `Matière ${surface}, traversée de ${detail}. ${magicalDetail || "Les arêtes laissent une poussière fine sur la peau."}`
  return `Assemblage de ${metal} et de ${wood}, teinté de ${color}. Surface ${surface}. ${finishSentence}`
}

export async function enrichObjectIndexTables() {
  const tables = await listObjectIndexTables()
  let descriptionsAdded = 0
  let iconsAdded = 0
  for (const table of tables) {
    const headers = [...table.headers]
    const updates: Array<{ range: string; values: Array<Array<string | number | boolean>> }> = []
    let descriptionColumn = headers.findIndex((header) => normalizedHeader(header) === "description")
    if (descriptionColumn < 0) {
      descriptionColumn = headers.length
      headers.push("Description")
      updates.push({ range: sheetTabRange(table.tabName, `${columnName(descriptionColumn + 1)}1`), values: [["Description"]] })
    }
    let iconColumn = headers.findIndex((header) => ["icone", "icon"].includes(normalizedHeader(header)))
    if (iconColumn < 0) {
      iconColumn = headers.length
      headers.push("Icône")
      updates.push({ range: sheetTabRange(table.tabName, `${columnName(iconColumn + 1)}1`), values: [["Icône"]] })
    }
    for (const row of table.rows) {
      const name = objectIndexCell(table, row, ["Nom", "Nom de l'objet", "Objet", "Arme", "Équipement", "Equipement", "Ressource", "Livre", "Titre"]).trim()
      if (!name) continue
      const type = objectIndexCell(table, row, ["Type", "Catégorie", "Categorie"]) || inferredObjectType(table)
      const subtype = objectIndexCell(table, row, ["Sous-type", "Sous type", "Subtype"])
      const effect = objectIndexCell(table, row, ["Effet", "Effets", "Propriété", "Proprieté", "Propriétés", "Proprietes"])
      const currentDescription = (row.values[descriptionColumn] || "").trim()
      if (!currentDescription || oldGeneratedDescriptions.has(currentDescription)) {
        updates.push({ range: sheetTabRange(table.tabName, `${columnName(descriptionColumn + 1)}${row.rowNumber}`), values: [[suggestedObjectDescription(name, type, subtype, effect, `${table.fileId}:${table.sheetId}:${row.rowNumber}`)]] })
        descriptionsAdded += 1
      }
    }
    await updateRanges(table.fileId, updates)
  }
  clearObjectIndexTableCache()
  iconsAdded = (await syncObjectIndexIcons()).iconsUpdated
  return { descriptionsAdded, iconsAdded }
}

const OBJECT_INDEX_NAME_ALIASES = ["Nom", "Nom de l'objet", "Objet", "Arme", "Équipement", "Equipement", "Ressource", "Livre", "Titre"]

function objectIndexIconColumn(table: ObjectIndexTable) {
  return table.headers.findIndex((header) => ["icone", "icon"].includes(normalizedHeader(header)))
}

/** Cases « Icône » qu'Eraser peut remplir : vides, ou tenant une ancienne icône générée. */
function objectIndexRowsNeedingIcon(table: ObjectIndexTable) {
  const iconColumn = objectIndexIconColumn(table)
  if (iconColumn < 0) return []
  return table.rows.flatMap((row) => {
    const name = objectIndexCell(table, row, OBJECT_INDEX_NAME_ALIASES).trim()
    if (!name || !isGeneratedObjectIcon(row.values[iconColumn] || "")) return []
    const type = objectIndexCell(table, row, ["Type", "Catégorie", "Categorie"]) || inferredObjectType(table)
    const subtype = objectIndexCell(table, row, ["Sous-type", "Sous type", "Subtype"])
    return [{ row, iconColumn, key: suggestedObjectIconKey(name, type, subtype) }]
  })
}

/**
 * Remplit la colonne « Icône » des index avec les images du dossier « icone objet »
 * du Drive (envoyées au premier passage). Seules les cases vides ou tenant une
 * ancienne icône générée changent : une icône choisie à la main n'est jamais touchée.
 */
export async function syncObjectIndexIcons() {
  const tables = await listObjectIndexTables()
  const pending = tables.map((table) => ({ table, rows: objectIndexRowsNeedingIcon(table) })).filter(({ rows }) => rows.length)
  if (!pending.length) return { iconsUpdated: 0 }
  const fileIds = await ensureObjectIconsOnDrive(pending.flatMap(({ rows }) => rows.map(({ key }) => key)))
  let iconsUpdated = 0
  for (const { table, rows } of pending) {
    const updates = rows.flatMap(({ row, iconColumn, key }) => {
      const fileId = fileIds.get(key)
      return fileId ? [{ range: sheetTabRange(table.tabName, `${columnName(iconColumn + 1)}${row.rowNumber}`), values: [[driveImageFormula(fileId)]] }] : []
    })
    await updateRanges(table.fileId, updates)
    iconsUpdated += updates.length
  }
  clearObjectIndexTableCache()
  return { iconsUpdated }
}

let objectIconSyncRunning = false
let objectIconSyncAttemptAt = 0

/** Passage automatique, au plus toutes les dix minutes, seulement s'il reste des cases à remplir. */
function scheduleObjectIndexIconSync(tables: ObjectIndexTable[]) {
  if (objectIconSyncRunning || Date.now() - objectIconSyncAttemptAt < 10 * 60_000) return
  if (!tables.some((table) => objectIndexRowsNeedingIcon(table).length)) return
  objectIconSyncRunning = true
  objectIconSyncAttemptAt = Date.now()
  runInBackground(syncObjectIndexIcons().finally(() => { objectIconSyncRunning = false }), "OBJECT_ICON_SYNC_FAILED")
}

/** Pose une image importée à la main dans la case « Icône » d'une ligne. */
export async function setObjectIndexIcon(fileId: string, tabName: string, rowNumber: number, driveFileId: string) {
  const table = await validatedObjectIndexTable(fileId, tabName)
  const iconColumn = objectIndexIconColumn(table)
  if (iconColumn < 0) throw new Error("OBJECT_INDEX_ICON_COLUMN_MISSING")
  if (!table.rows.some((row) => row.rowNumber === rowNumber)) throw new Error("OBJECT_INDEX_ROW_NOT_FOUND")
  await updateRanges(fileId, [{ range: sheetTabRange(tabName, `${columnName(iconColumn + 1)}${rowNumber}`), values: [[driveImageFormula(driveFileId)]] }])
  clearObjectIndexTableCache()
}

/** Images du Drive citées dans une colonne « Icône » : Eraser accepte de les afficher. */
export async function objectIndexIconDriveFileIds() {
  const ids = new Set<string>()
  // Chaque icône affichée passe par ici : le catalogue d'affichage, sans attendre une relecture.
  for (const table of await listObjectIndexTablesForDisplay()) {
    const iconColumn = objectIndexIconColumn(table)
    if (iconColumn < 0) continue
    for (const row of table.rows) {
      const id = objectIconDriveFileId(row.values[iconColumn] || "")
      if (id) ids.add(id)
    }
  }
  return ids
}

function suggestedObjectStackLimit(name: string, type: string, subtype: string) {
  const value = normalizedHeader(`${name} ${type} ${subtype}`)
  if (/fleche|carreau|munition|bille|projectile/.test(value)) return 20
  if (/ressource|materiau|ingredient|minerai|plante|poudre|tissu|bois|pierre|gemme/.test(value)) return 99
  if (/dague.*lancer|couteau.*lancer|shuriken|kunai/.test(value)) return 3
  if (/consommable|potion|elixir|fiole|bombe|ration|nourriture|boisson/.test(value)) return 5
  if (/parchemin/.test(value)) return 3
  return 1
}

export async function ensureObjectIndexStackLimits() {
  const tables = await listObjectIndexTables()
  let stackLimitsAdded = 0
  let columnsAdded = 0
  for (const table of tables) {
    const headers = [...table.headers]
    const updates: Array<{ range: string; values: Array<Array<string | number | boolean>> }> = []
    let maximumColumn = headers.findIndex((header) => ["nombre max", "quantite max", "maximum", "max"].includes(normalizedHeader(header)))
    if (maximumColumn < 0) {
      maximumColumn = headers.length
      headers.push("Nombre max")
      updates.push({ range: sheetTabRange(table.tabName, `${columnName(maximumColumn + 1)}1`), values: [["Nombre max"]] })
      columnsAdded += 1
    }
    for (const row of table.rows) {
      if ((row.values[maximumColumn] || "").trim()) continue
      const name = objectIndexCell(table, row, ["Nom", "Nom de l'objet", "Objet", "Arme", "Équipement", "Equipement", "Ressource", "Livre", "Titre"]).trim()
      if (!name) continue
      const type = objectIndexCell(table, row, ["Type", "Catégorie", "Categorie"]) || inferredObjectType(table)
      const subtype = objectIndexCell(table, row, ["Sous-type", "Sous type", "Subtype"])
      updates.push({ range: sheetTabRange(table.tabName, `${columnName(maximumColumn + 1)}${row.rowNumber}`), values: [[suggestedObjectStackLimit(name, type, subtype)]] })
      stackLimitsAdded += 1
    }
    await updateRanges(table.fileId, updates)
  }
  clearObjectIndexTableCache()
  return { stackLimitsAdded, columnsAdded }
}

/**
 * Une case de propriétaires (« Joueur » d'un personnage, « MJ » d'une campagne) qui nomme
 * l'un de ces comptes : seule (« uid ») ou parmi d'autres (« uid1 · uid2 »).
 */
function ownedByAny(column: AnySQLiteColumn, uids: readonly string[]): SQL {
  return or(inArray(column, [...uids]), ...uids.map((uid) => sql`instr(' · ' || ${column} || ' · ', ${` · ${uid} · `}) > 0`)) ?? sql`0`
}

/**
 * Les ID lus dans les feuilles des personnages et des campagnes à leur dernière relecture
 * complète. Une entrée de l'index local absente des feuilles (ligne supprimée à la main,
 * ancienne ligne mal lue, qui s'affichait sous son identifiant) n'est plus listée nulle
 * part ; elle reste dans l'index local, sans être effacée. Une entrée enregistrée après
 * la relecture (une fiche qui vient d'être créée) reste visible.
 */
const sheetPresence: Record<"characters" | "campaigns", { ids: Set<string>; readAt: number } | null> = { characters: null, campaigns: null }

function inSheets(kind: "characters" | "campaigns", item: { id: string; updatedAt?: string | null }) {
  const presence = sheetPresence[kind]
  if (!presence || presence.ids.has(item.id)) return true
  const updated = Date.parse(item.updatedAt ?? "")
  return Number.isFinite(updated) && updated > presence.readAt - 120_000
}

/**
 * Une liste sans ses entrées absentes des feuilles. Garde-fou : si le tri en écarterait
 * la moitié ou plus, la relecture n'est pas digne de confiance et rien n'est écarté. Jamais
 * appliqué à l'ouverture d'une fiche ou d'une campagne : seulement aux listes.
 */
function listedInSheets<T extends { id: string; updatedAt?: string | null }>(kind: "characters" | "campaigns", items: T[]) {
  const kept = items.filter((item) => inSheets(kind, item))
  const hidden = items.length - kept.length
  if (hidden > 2 && hidden * 2 >= items.length) {
    console.error("SHEET_PRESENCE_SUSPICIOUS", kind, hidden, items.length)
    return items
  }
  return kept
}

async function listCharactersForUserUncached(uid: string) {
  await refreshIdentityIndexes()
  const db = getDb()
  const identityUids = await identityUidsForUser(uid)
  let characters = await db.select().from(characterIndex)
    .where(and(ownedByAny(characterIndex.ownerUid, identityUids), isNull(characterIndex.deletedAt))).orderBy(desc(characterIndex.updatedAt)).limit(100)
  if (characters.length) return decorateCharacters(listedInSheets("characters", characters))
  const syncKey = `characters:${identityUids.slice().sort().join(":")}`
  const [sync] = await db.select().from(sheetIndexSyncs).where(eq(sheetIndexSyncs.key, syncKey)).limit(1)
  if (!sync) {
    const source = await charactersSource()
    if (source) {
      const { columns, rows } = await readCharacterColumns(source, ["Joueur", "Nom personnage", "Peuple"])
      for (const row of rows) {
        const id = columns.get(row, "ID")
        const ownerUid = columns.get(row, "Joueur")
        if (!id || !ownedBy(ownerUid, identityUids)) continue
        const fields = { ownerUid, name: columns.get(row, "Nom personnage") || "Personnage sans nom", subtitle: displayedMultipleValue(columns.get(row, "Peuple"), "all"), updatedAt: new Date().toISOString() }
        await db.insert(characterIndex).values({ id, ...fields }).onConflictDoUpdate({ target: characterIndex.id, set: { ...fields, deletedAt: null } })
      }
    }
    await db.insert(sheetIndexSyncs).values({ key: syncKey }).onConflictDoNothing()
    characters = await db.select().from(characterIndex)
      .where(and(ownedByAny(characterIndex.ownerUid, identityUids), isNull(characterIndex.deletedAt))).orderBy(desc(characterIndex.updatedAt)).limit(100)
  }
  return decorateCharacters(listedInSheets("characters", characters))
}

export const listCharactersForUser = cache(listCharactersForUserUncached)

export async function getCharacterForUser(uid: string, id: string) {
  const listed = (await listCharactersForUser(uid)).find((character) => character.id === id)
  if (listed) return listed
  const identityUids = await identityUidsForUser(uid)
  const [character] = await getDb().select().from(characterIndex)
    .where(and(ownedByAny(characterIndex.ownerUid, identityUids), eq(characterIndex.id, id), isNull(characterIndex.deletedAt))).limit(1)
  return character ? (await decorateCharacters([character]))[0] ?? null : null
}

async function getCharacterByIdUncached(id: string) {
  await refreshIdentityIndexes()
  const read = async () => (await getDb().select().from(characterIndex)
    .where(and(eq(characterIndex.id, id), isNull(characterIndex.deletedAt))).limit(1))[0]
  let character = await read()
  if (!character) {
    await ensureIdentityIndexes()
    character = await read()
  }
  if (!character) return null
  return (await decorateCharacters([character]))[0] ?? null
}

export const getCharacterById = cache(getCharacterByIdUncached)

async function decorateCharacters<T extends { id: string; ownerUid: string; name: string; subtitle: string; updatedAt: string }>(characters: T[]) {
  if (!characters.length) return []
  const links = await getDb().select({
    characterId: campaignCharacters.characterId,
    id: campaignIndex.id,
    name: campaignIndex.name,
    accentColor: campaignIndex.accentColor,
  }).from(campaignCharacters)
    .innerJoin(campaignIndex, eq(campaignCharacters.campaignId, campaignIndex.id))
    .where(and(inArray(campaignCharacters.characterId, characters.map((item) => item.id)), isNull(campaignIndex.deletedAt)))
  return characters.map<CharacterRecord>((character) => ({
    id: character.id, ownerUid: character.ownerUid, name: character.name,
    subtitle: character.subtitle, updatedAt: character.updatedAt,
    campaigns: links.filter((link) => link.characterId === character.id).map(({ id, name, accentColor }) => ({ id, name, accentColor })),
  }))
}

async function listCampaignsForMjUncached(uid: string) {
  await refreshIdentityIndexes()
  const db = getDb()
  const identityUids = await identityUidsForUser(uid)
  let campaigns = await db.select({ id: campaignIndex.id, mjUid: campaignIndex.mjUid, name: campaignIndex.name, description: campaignIndex.description, bannerUrl: campaignIndex.bannerUrl, accentColor: campaignIndex.accentColor, updatedAt: campaignIndex.updatedAt })
    .from(campaignIndex).where(and(ownedByAny(campaignIndex.mjUid, identityUids), isNull(campaignIndex.deletedAt))).orderBy(desc(campaignIndex.updatedAt)).limit(100)
  if (campaigns.length) return listedInSheets("campaigns", campaigns)
  const syncKey = `campaigns:${identityUids.slice().sort().join(":")}`
  const [sync] = await db.select().from(sheetIndexSyncs).where(eq(sheetIndexSyncs.key, syncKey)).limit(1)
  if (!sync) {
    const source = await campaignsSource()
    if (source) {
      const { columns, rows } = await readNamedSheet(source.spreadsheetId, source.tabName, campaignSheetHeaders)
      for (const campaign of rows.map((row) => campaignFromRow(row, columns))) {
        if (!campaign || !ownedBy(campaign.mjUid, identityUids)) continue
        await db.insert(campaignIndex).values(campaign).onConflictDoUpdate({
          target: campaignIndex.id,
          set: { mjUid: campaign.mjUid, name: campaign.name, description: campaign.description, bannerUrl: campaign.bannerUrl, accentColor: campaign.accentColor, updatedAt: new Date().toISOString(), deletedAt: null },
        })
      }
    }
    await db.insert(sheetIndexSyncs).values({ key: syncKey }).onConflictDoNothing()
    campaigns = await db.select({ id: campaignIndex.id, mjUid: campaignIndex.mjUid, name: campaignIndex.name, description: campaignIndex.description, bannerUrl: campaignIndex.bannerUrl, accentColor: campaignIndex.accentColor, updatedAt: campaignIndex.updatedAt })
      .from(campaignIndex).where(and(ownedByAny(campaignIndex.mjUid, identityUids), isNull(campaignIndex.deletedAt))).orderBy(desc(campaignIndex.updatedAt)).limit(100)
  }
  return listedInSheets("campaigns", campaigns)
}

export const listCampaignsForMj = cache(listCampaignsForMjUncached)

async function listCampaignsForPlayerUncached(uid: string) {
  const characters = await listCharactersForUser(uid)
  const campaignIds = [...new Set(characters.flatMap((character) => character.campaigns.map((campaign) => campaign.id)))]
  if (!campaignIds.length) return []
  return getDb().select({ id: campaignIndex.id, mjUid: campaignIndex.mjUid, name: campaignIndex.name, description: campaignIndex.description, bannerUrl: campaignIndex.bannerUrl, accentColor: campaignIndex.accentColor, updatedAt: campaignIndex.updatedAt })
    .from(campaignIndex).where(and(inArray(campaignIndex.id, campaignIds), isNull(campaignIndex.deletedAt))).orderBy(desc(campaignIndex.updatedAt)).limit(100)
}

export const listCampaignsForPlayer = cache(listCampaignsForPlayerUncached)

export async function getCampaignForPlayer(uid: string, id: string) {
  return (await listCampaignsForPlayer(uid)).find((campaign) => campaign.id === id) ?? null
}

async function getCharacterForMjUncached(uid: string, id: string) {
  await refreshIdentityIndexes()
  const identityUids = await identityUidsForUser(uid)
  const read = async () => (await getDb().select({ character: characterIndex }).from(characterIndex)
    .innerJoin(campaignCharacters, eq(characterIndex.id, campaignCharacters.characterId))
    .innerJoin(campaignIndex, eq(campaignCharacters.campaignId, campaignIndex.id))
    .where(and(eq(characterIndex.id, id), ownedByAny(campaignIndex.mjUid, identityUids), isNull(characterIndex.deletedAt), isNull(campaignIndex.deletedAt))).limit(1))[0]
  // Un MJ joue aussi : ses propres personnages lui restent ouverts, même hors de ses
  // campagnes (sinon la fiche qu'il vient de créer répondait « introuvable »).
  const readOwn = async () => (await getDb().select().from(characterIndex)
    .where(and(eq(characterIndex.id, id), ownedByAny(characterIndex.ownerUid, identityUids), isNull(characterIndex.deletedAt))).limit(1))[0]
  let character = (await read())?.character ?? await readOwn()
  if (!character) {
    await ensureIdentityIndexes()
    character = (await read())?.character ?? await readOwn()
  }
  if (!character) return null
  return (await decorateCharacters([character]))[0] ?? null
}

export const getCharacterForMj = cache(getCharacterForMjUncached)

export async function getCampaignForMj(uid: string, id: string) {
  const listed = (await listCampaignsForMj(uid)).find((campaign) => campaign.id === id)
  if (listed) return listed
  const identityUids = await identityUidsForUser(uid)
  const [campaign] = await getDb().select({ id: campaignIndex.id, mjUid: campaignIndex.mjUid, name: campaignIndex.name, description: campaignIndex.description, bannerUrl: campaignIndex.bannerUrl, accentColor: campaignIndex.accentColor, updatedAt: campaignIndex.updatedAt })
    .from(campaignIndex).where(and(ownedByAny(campaignIndex.mjUid, identityUids), eq(campaignIndex.id, id), isNull(campaignIndex.deletedAt))).limit(1)
  return campaign ?? null
}

function numberFromCell(value: unknown, fallback = 0) {
  const parsed = Number.parseFloat(String(value ?? "").replace(",", "."))
  return Number.isFinite(parsed) ? parsed : fallback
}

async function loadClassesFromGoogle() {
  const source = await classesSource()
  // Returning [] here would surface as "aucune classe" instead of telling the
  // admin the sheet simply isn't reachable from this installation.
  if (!source) throw new Error("CLASSES_SHEET_NOT_LINKED")
  const { tabName } = source
  const read = await readClassSheet(source)
  // Les colonnes absentes (couleurs d'accent…) sont ajoutées à droite ; rien n'est déplacé.
  // Une lecture ne dépend pas de cet ajout : en cas d'échec, les colonnes présentes suffisent.
  const columns = await ensureNamedColumns(source.spreadsheetId, tabName, read.columns).catch((error) => {
    console.error("CLASS_COLUMNS_CHECK_FAILED", error instanceof Error ? error.message : "UNKNOWN_ERROR")
    return read.columns
  })
  const { rows } = read
  const hasImageColumn = columns.at("Image") >= 0
  const imageLetter = columnName(classImageColumn(columns))
  const imageNotes = hasImageColumn ? await readCellNotes(source.spreadsheetId, sheetTabRange(tabName, `${imageLetter}2:${imageLetter}1000`)) : []
  let nativeImageUrls: string[] = []
  if (hasImageColumn) try {
    nativeImageUrls = await Promise.race([
      readClassImagesWithAppsScript({
        spreadsheetId: source.spreadsheetId,
        tabName,
        startRow: 2,
        rowCount: rows.length,
        column: classImageColumn(columns),
      }),
      new Promise<string[]>((resolve) => setTimeout(() => resolve([]), 1500)),
    ])
  } catch (error) {
    console.error(
      "CLASS_IMAGE_READ_FAILED",
      error instanceof Error ? error.message : "UNKNOWN_ERROR",
    )
  }
  return rows
    .map((row, index) => ({
      row,
      imageNote: imageNotes[index] || "",
      nativeImageUrl: nativeImageUrls[index] || "",
    }))
    .filter(({ row }) => columns.get(row, "ID") && columns.get(row, "Nom de la classe"))
    .map<ClassRecord>(({ row, imageNote, nativeImageUrl }) => {
      const cell = (name: string) => columns.get(row, name)
      const type = classTypes.includes(cell("Type") as ClassType) ? (cell("Type") as ClassType) : "Éclectique"
      return {
        id: cell("ID"),
        type,
        name: cell("Nom de la classe"),
        // Une image importée ou collée dans la case (texte) l'emporte sur l'ancienne note
        // du Drive et sur l'image de la cellule : c'est le dernier choix fait à la main.
        image: (isImageSource(cell("Image")) ? cell("Image").trim() : "") || imageNote || nativeImageUrl || cell("Image"),
        keywords: [cell("Mots-clés 1"), cell("Mots-clés 2"), cell("Mots-clés 3")],
        difficulty: classDifficulties.includes(cell("Difficulté") as ClassDifficulty)
          ? (cell("Difficulté") as ClassDifficulty)
          : "X",
        completion: Math.min(100, Math.max(0, Math.round(numberFromCell(cell("Finition"), 0)))),
        ...classAccents(type, cell("Couleur d’accent sombre"), cell("Couleur d’accent clair")),
      }
    })
}

let classIndexRefreshPromise: Promise<(typeof classIndex.$inferSelect)[]> | null = null

function refreshClassIndex(currentRows: (typeof classIndex.$inferSelect)[]) {
  if (classIndexRefreshPromise) return classIndexRefreshPromise
  classIndexRefreshPromise = (async () => {
    const db = getDb()
    const classes = await loadClassesFromGoogle()
    let rows = currentRows
    if (classes.length) {
      const updatedAt = new Date().toISOString()
      const existingById = new Map(rows.map((row) => [row.id, row]))
      let changed = false
      for (const item of classes) {
        const keywordsJson = JSON.stringify(item.keywords)
        const existing = existingById.get(item.id)
        if (existing
          && existing.type === item.type
          && existing.name === item.name
          && existing.image === item.image
          && existing.keywordsJson === keywordsJson
          && existing.difficulty === item.difficulty
          && existing.completion === item.completion
          && existing.accentDark === (item.accentReady ? item.accentDark : "")
          && existing.accentLight === (item.accentReady ? item.accentLight : "")) continue
        changed = true
        await db.insert(classIndex).values({
          id: item.id, type: item.type, name: item.name, image: item.image,
          keywordsJson, difficulty: item.difficulty,
          completion: item.completion,
          accentDark: item.accentReady ? item.accentDark : "",
          accentLight: item.accentReady ? item.accentLight : "",
          updatedAt,
        }).onConflictDoUpdate({ target: classIndex.id, set: {
          type: item.type, name: item.name, image: item.image, keywordsJson,
          difficulty: item.difficulty, completion: item.completion,
          accentDark: item.accentReady ? item.accentDark : "",
          accentLight: item.accentReady ? item.accentLight : "",
          updatedAt,
        } })
      }
      await db.insert(sheetIndexSyncs).values({ key: "classes:global", syncedAt: updatedAt }).onConflictDoUpdate({
        target: sheetIndexSyncs.key,
        set: { syncedAt: updatedAt },
      })
      if (changed) rows = await db.select().from(classIndex).orderBy(classIndex.name)
    }
    return rows
  })().finally(() => {
    classIndexRefreshPromise = null
  })
  return classIndexRefreshPromise
}

function classRecordsFromIndex(rows: (typeof classIndex.$inferSelect)[]) {
  return rows.map<ClassRecord>((row) => {
    const type = classTypes.includes(row.type as ClassType) ? row.type as ClassType : "Éclectique"
    return {
      id: row.id,
      type,
      name: row.name,
      image: row.image,
      keywords: (() => { try { const values = JSON.parse(row.keywordsJson) as string[]; return [values[0] || "", values[1] || "", values[2] || ""] as [string, string, string] } catch { return ["", "", ""] } })(),
      difficulty: classDifficulties.includes(row.difficulty as ClassDifficulty) ? row.difficulty as ClassDifficulty : "X",
      completion: row.completion,
      ...classAccents(type, row.accentDark, row.accentLight),
    }
  })
}

export async function updateClassAccentColors(updates: Array<{ id: string; dark: string; light: string }>) {
  const source = await classesSource()
  if (!source) throw new Error("CLASSES_SHEET_NOT_CONFIGURED")
  const safeUpdates = updates.filter((item) => item.id && validHexColor(item.dark) && validHexColor(item.light)).slice(0, 30)
  if (!safeUpdates.length) return
  const { tabName } = source
  const read = await readClassSheet(source, { fresh: true })
  const columns = await ensureNamedColumns(source.spreadsheetId, tabName, read.columns)
  const rowById = new Map(read.rows.map((row, index) => [columns.get(row, "ID"), index + 2]))
  await updateRanges(source.spreadsheetId, safeUpdates.flatMap((item) => {
    const rowNumber = rowById.get(item.id)
    return rowNumber ? namedRowWrites(tabName, columns, rowNumber, { "Couleur d’accent sombre": item.dark, "Couleur d’accent clair": item.light }) : []
  }))
  const updatedAt = new Date().toISOString()
  for (const item of safeUpdates) {
    if (!rowById.has(item.id)) continue
    await getDb().update(classIndex).set({ accentDark: item.dark, accentLight: item.light, updatedAt }).where(eq(classIndex.id, item.id))
  }
}

/** Les classes connues de l'index local, sans rien relire ni synchroniser (références « {} »). */
export async function listIndexedClasses() {
  return classRecordsFromIndex(await getDb().select().from(classIndex).orderBy(classIndex.name))
}

/**
 * Les feuilles des PNJ, des campagnes et des personnages telles qu'elles sont rangées
 * (en-têtes réels, lignes brutes), pour les références « {PNJ:Aldor} ». Lecture seule :
 * une feuille absente du Drive n'est jamais créée ici.
 */
export async function npcReferenceTable() {
  const sheet = await resolveJdrSheet("npcs")
  if (!sheet) return null
  const { columns, rows } = await readNpcSheet(sheet)
  return { headers: columns.headers, columns, rows }
}

export async function campaignReferenceTable() {
  const source = await campaignsSource()
  if (!source) return null
  const { columns, rows } = await readNamedSheet(source.spreadsheetId, source.tabName, campaignSheetHeaders)
  return { headers: columns.headers, columns, rows }
}

/** Quelques colonnes de la feuille des personnages (elle est trop large pour être lue en entier). */
export async function characterReferenceTable(wanted: readonly string[]) {
  const source = await charactersSource()
  if (!source) return null
  const { columns, rows } = await readCharacterColumns(source, wanted)
  return { headers: columns.headers, columns, rows }
}

export async function listClasses() {
  const db = getDb()
  // Warmed here, in the foreground, so the background work below (which may run
  // after this request has already responded — see warmGoogleOAuthAccessToken)
  // can reuse the cached token instead of failing to authenticate.
  await warmGoogleOAuthAccessToken()
  runInBackground(ensureClassImagesSynced(), "CLASS_IMAGE_AUTO_SYNC_FAILED")
  let rows = await db.select().from(classIndex).orderBy(classIndex.name)
  const [sync] = await db.select().from(sheetIndexSyncs).where(eq(sheetIndexSyncs.key, "classes:global")).limit(1)
  const syncedAt = sync ? Date.parse(sync.syncedAt) : 0
  const shouldRefresh = !rows.length || !Number.isFinite(syncedAt) || Date.now() - syncedAt > 10 * 60_000
  if (shouldRefresh) {
    const refresh = refreshClassIndex(rows)
    if (!rows.length) {
      // Nothing cached yet: a failed refresh here must not be swallowed into an
      // empty list, or the page shows "no classes yet" instead of the real
      // "Sheets is unavailable" message (see app/regles/classes/page.tsx).
      try {
        rows = await refresh
      } catch (error) {
        console.error("CLASS_INDEX_REFRESH_FAILED", error instanceof Error ? error.message : "UNKNOWN_ERROR")
        throw error
      }
    } else {
      runInBackground(refresh, "CLASS_INDEX_REFRESH_FAILED")
    }
  }
  return classRecordsFromIndex(rows)
}

export async function listClassOptions() {
  const rows = await getDb().select({ id: classIndex.id, name: classIndex.name }).from(classIndex).orderBy(classIndex.name)
  if (rows.length) return rows
  return (await listClasses()).map(({ id, name }) => ({ id, name }))
}

const CLASS_IMAGES_FOLDER = "Images Classe"
const CLASS_IMAGE_ORIGIN = "https://eraser-jdr.eliot-myr-0.chatgpt.site"
const CLASS_IMAGE_SYNC_REVISION = "class-images:renamed-v2"
const classImageAliases: Record<string, string[]> = {
  "CLA-0001": ["berserker", "berserk", "barbare", "barb"],
  "CLA-0003": ["paladin ops", "paladin op", "paladin obs", "paladin obscur", "ops", "ombre"],
  "CLA-0005": ["paladin lume", "paladin lum", "paladin lumiere", "lume", "lumiere"],
  "CLA-0006": ["mage terre", "terre mage", "terre"],
  "CLA-0007": ["image o", "mage o", "mage eau", "eau", "o"],
  "CLA-0011": ["mage mort", "mort mage", "mort", "necro", "necromancien"],
  "CLA-0012": ["mage sang", "sang mage", "sang", "blood"],
  "CLA-0013": ["adepte epaux", "adepte hepo", "adepte epo", "epaux", "hepo", "epo"],
  "CLA-0016": ["serviteuse", "serviteuse kimtai", "serviteuse kintai"],
  "CLA-0017": ["illusionniste", "illusion", "illu"],
}

function stripInclusiveSuffixes(value: string) {
  return value.replace(
    /·(?:euses?|eaux|elles?|ères?|eurs?|rices?|trices?|nes?|es?|s)\b/giu,
    "",
  )
}

function normalizedImageLabel(value: string) {
  return stripInclusiveSuffixes(value.replace(/\.[a-z0-9]{2,5}$/iu, ""))
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’']/g, " ")
    .replace(/[^a-z0-9]+/gi, " ")
    .toLowerCase()
    .split(" ")
    .filter((token) => token && !["image", "img", "icone", "icon", "classe"].includes(token))
    .join(" ")
    .trim()
}

const ignoredMatchTokens = new Set(["a", "au", "aux", "d", "de", "des", "du", "l", "la", "le", "les"])

function imageMatchScore(fileName: string, candidates: string[]) {
  const fileLabel = normalizedImageLabel(fileName)
  if (!fileLabel) return 0
  let score = 0

  for (const candidate of candidates) {
    const candidateLabel = normalizedImageLabel(candidate)
    if (!candidateLabel) continue
    if (fileLabel === candidateLabel) return 100
    if (
      Math.min(fileLabel.length, candidateLabel.length) >= 5 &&
      (fileLabel.includes(candidateLabel) || candidateLabel.includes(fileLabel))
    ) {
      score = Math.max(score, 90)
    }

    const fileTokens = new Set(fileLabel.split(" ").filter((token) => !ignoredMatchTokens.has(token)))
    const candidateTokens = new Set(
      candidateLabel.split(" ").filter((token) => !ignoredMatchTokens.has(token)),
    )
    const commonTokens = [...candidateTokens].filter((token) => fileTokens.has(token)).length
    if (commonTokens) {
      score = Math.max(
        score,
        Math.round((commonTokens / Math.max(fileTokens.size, candidateTokens.size)) * 80),
      )
    }

    const longest = Math.max(fileLabel.length, candidateLabel.length)
    if (longest > 0) {
      const distances = Array.from({ length: candidateLabel.length + 1 }, (_, index) => index)
      for (let fileIndex = 1; fileIndex <= fileLabel.length; fileIndex += 1) {
        let previous = distances[0]
        distances[0] = fileIndex
        for (let candidateIndex = 1; candidateIndex <= candidateLabel.length; candidateIndex += 1) {
          const current = distances[candidateIndex]
          distances[candidateIndex] = Math.min(
            distances[candidateIndex] + 1,
            distances[candidateIndex - 1] + 1,
            previous + (fileLabel[fileIndex - 1] === candidateLabel[candidateIndex - 1] ? 0 : 1),
          )
          previous = current
        }
      }
      const similarity = 1 - distances[candidateLabel.length] / longest
      score = Math.max(score, Math.round(similarity * 70))
    }
  }
  return score
}

function bestImageForClass(
  id: string,
  name: string,
  files: DriveFile[],
  usedFileIds: Set<string>,
) {
  const candidates = [id, id.replace("-", " "), id.slice(-4), name, ...(classImageAliases[id] ?? [])]
  return files
    .filter((file) => !usedFileIds.has(file.id))
    .map((file) => ({ file, score: imageMatchScore(file.name, candidates) }))
    .filter((candidate) => candidate.score >= 65)
    .sort((left, right) => right.score - left.score || left.file.name.localeCompare(right.file.name))[0]
    ?.file ?? null
}

function resolvedDriveImage(file: DriveFile) {
  if (
    file.mimeType === "application/vnd.google-apps.shortcut" &&
    file.shortcutDetails?.targetId
  ) {
    return {
      ...file,
      id: file.shortcutDetails.targetId,
      mimeType: file.shortcutDetails.targetMimeType,
    }
  }
  return file
}

function uniqueDriveImages(files: DriveFile[]) {
  const images = new Map<string, DriveFile>()
  for (const sourceFile of files) {
    if (!isDriveImageFile(sourceFile)) continue
    const file = resolvedDriveImage(sourceFile)
    if (!images.has(file.id)) images.set(file.id, file)
  }
  return [...images.values()]
}

function isPlaceholderImage(file: DriveFile) {
  const label = normalizedImageLabel(file.name)
  return ["sans", "sans illustration", "pas d", "aucune", "manquante", "placeholder", "no"].includes(label)
}

/** Pose dans « Classes » les images trouvées dans le Drive, par le script Google déjà installé. */
async function syncClassImagesFromDrive() {
  const source = await classesSource()
  if (!source) throw new Error("CLASSES_SHEET_NOT_CONFIGURED")
  const { tabName } = source
  const { columns, rows: sheetRows } = await readClassSheet(source, { fresh: true })
  // Sans colonne « Image », rien n'est posé : les images atterrissaient dans la colonne A.
  if (columns.at("Image") < 0) throw new Error("CLASS_IMAGE_COLUMN_MISSING")
  const imageLetter = columnName(classImageColumn(columns))
  const imageNotes = await readCellNotes(source.spreadsheetId, sheetTabRange(tabName, `${imageLetter}2:${imageLetter}1000`))
  // Chaque ligne réduite à ce que la synchronisation lit, par nom de colonne.
  const rows = sheetRows
    .map((cells, index) => ({ row: [columns.get(cells, "ID"), columns.get(cells, "Type"), columns.get(cells, "Nom de la classe"), columns.get(cells, "Image")], imageNote: imageNotes[index] || "", sheetRow: index + 2 }))
    .filter(({ row }) => row[0] && row[2])

  const locatedFolder = await findDriveFolderByName(CLASS_IMAGES_FOLDER)
  // The dedicated account is entirely reserved for Eraser. If the folder was
  // renamed, pluralized, moved through a shortcut, or cannot be resolved by
  // name, matching the images from the whole Drive is the safe fallback.
  // Le compte Google est dédié à Eraser : on réunit les fichiers placés
  // directement dans « Images Classe » et toutes les images du Drive. Cela
  // couvre aussi les images rangées dans un sous-dossier, déplacées, ou
  // ajoutées comme raccourcis sans perdre le nom abrégé du raccourci.
  const [folderFiles, allDriveImages] = await Promise.all([
    locatedFolder ? listDriveFolderFiles(locatedFolder.id) : Promise.resolve([]),
    listAllDriveImages(),
  ])
  const files = uniqueDriveImages([...folderFiles, ...allDriveImages])
  const placeholder = files.find(isPlaceholderImage)
  const regularFiles = files.filter((file) => file.id !== placeholder?.id)
  // Rebuild every association from the current filenames. Old cell notes are
  // deliberately ignored: they describe the previous filenames and were the
  // source of several incorrect pairings.
  const usedFileIds = new Set<string>()
  const fileByClassId = new Map<string, DriveFile>()
  const matched: Array<{ classId: string; className: string; fileName: string }> = []
  const placeholders: string[] = []
  const unmatchedClasses: string[] = []
  const actions: ClassImageScriptAction[] = []

  for (const { row } of rows) {
    const [classId, , className] = row
    const matchedFile = bestImageForClass(classId, className, regularFiles, usedFileIds)
    if (!matchedFile) continue
    fileByClassId.set(classId, matchedFile)
    usedFileIds.add(matchedFile.id)
  }

  const requiredIllustratedClassIds = new Set(["CLA-0001", "CLA-0003", "CLA-0007", "CLA-0012"])
  const pendingRequiredRows = rows.filter(({ row }) => requiredIllustratedClassIds.has(row[0]) && !fileByClassId.has(row[0]))
  const remainingFiles = regularFiles.filter((file) => !usedFileIds.has(file.id))
  const possiblePairs = pendingRequiredRows.flatMap(({ row }) => {
    const [classId, , className] = row
    const candidates = [classId, classId.replace("-", " "), classId.slice(-4), className, ...(classImageAliases[classId] ?? [])]
    return remainingFiles.map((file) => ({ classId, file, score: imageMatchScore(file.name, candidates) }))
  }).sort((left, right) => right.score - left.score || left.file.name.localeCompare(right.file.name))
  for (const pair of possiblePairs) {
    if (fileByClassId.has(pair.classId) || usedFileIds.has(pair.file.id)) continue
    fileByClassId.set(pair.classId, pair.file)
    usedFileIds.add(pair.file.id)
  }

  for (const { row, imageNote, sheetRow } of rows) {
    const [classId, , className, currentImage = ""] = row
    const matchedFile = fileByClassId.get(classId) ?? null
    const selectedFile = matchedFile ?? placeholder ?? null
    if (!matchedFile && placeholder) {
      placeholders.push(className)
    }

    if (matchedFile) {
      matched.push({ classId, className, fileName: matchedFile.name })
    }

    if (!selectedFile) {
      unmatchedClasses.push(className)
      if (currentImage.startsWith("=IMAGE(")) {
        actions.push({ action: "clear", row: sheetRow })
      }
      continue
    }

    const note = `ERASER_DRIVE_FILE_ID:${selectedFile.id}`
    if (imageNote === note && !currentImage.startsWith("=IMAGE(")) continue
    const signature = await signClassImageId(selectedFile.id)
    const sourceUrl = `${CLASS_IMAGE_ORIGIN}/api/sheet-images/${encodeURIComponent(selectedFile.id)}?sig=${encodeURIComponent(signature)}`
    actions.push({
      action: "set",
      row: sheetRow,
      url: sourceUrl,
      title: className,
      note,
    })
  }

  if (actions.length > 0) {
    await applyClassImagesWithAppsScript({
      spreadsheetId: source.spreadsheetId,
      tabName,
      rowCount: rows.length,
      column: classImageColumn(columns),
      actions: actions.sort((left, right) => left.row - right.row),
    })
  }

  console.info(
    "CLASS_IMAGE_SYNC_COMPLETED",
    JSON.stringify({
      availableImages: files.length,
      matched: matched.map(({ classId, fileName }) => ({ classId, fileName })),
      placeholders,
      unmatchedClasses,
      updated: actions.length,
    }),
  )

  await getDb().delete(sheetIndexSyncs).where(eq(sheetIndexSyncs.key, "classes:global"))
}

async function ensureClassImagesSynced() {
  const db = getDb()
  const [completed] = await db.select().from(sheetIndexSyncs).where(eq(sheetIndexSyncs.key, CLASS_IMAGE_SYNC_REVISION)).limit(1)
  if (completed) return
  await syncClassImagesFromDrive()
  await db.insert(sheetIndexSyncs).values({
    key: CLASS_IMAGE_SYNC_REVISION,
    syncedAt: new Date().toISOString(),
  }).onConflictDoNothing()
}

export type StructuredSheetDefinition = {
  key: JdrSheetKey
  name: string
  tabName: string
  headers: string[]
  frozenColumns: number
  columnWidths: number[]
}

/** Dernière colonne d'une feuille des PNJ neuve (AK) : sert seulement à la créer et aux anciennes versions. */
const NPC_LAST_COLUMN = columnName(npcSheetHeaders.length)

export const sessionSheetHeaders = ["ID", "ID campagne", "Titre", "Bannière", "Personnages (JSON)", "PNJs (JSON)", "Magasins (JSON)", "Créée par", "Créée le", "Modifiée le"]

const npcSheetColumnWidths = [
  180, 190, 220, 180, 110, 110, 110, 100, 100, 110, 100, 100, 130, 120, 130, 120, 110,
  150, 120, 90, 100, 100, 360, 320, 420, 480, 190, 170, 170, 180, 170, 150, 190, 200, 420, 320, 320,
]

const tabletopWorkbookTabs = [
  {
    name: "Cartes",
    headers: ["ID", "Page liée", "Nom", "Image", "Largeur", "Hauteur", "Taille case (px)", "Distance par case", "Unité", "Clé de salon", "Créé par", "Créée le", "Modifiée le", "Dossier"],
    widths: [180, 170, 240, 360, 100, 100, 130, 140, 100, 220, 190, 180, 180, 180],
  },
  {
    name: "Tokens",
    headers: ["ID", "ID carte", "Type d’entité", "ID entité", "X", "Y", "Créé le", "Modifié le", "Nom", "Icône", "Échelle pion", "Échelle icône", "Couleur"],
    widths: [180, 180, 130, 190, 100, 100, 180, 180, 220, 100, 110, 110, 110],
  },
  {
    name: "Dossiers",
    headers: ["ID", "Page liée", "Nom", "Ordre", "Créé le", "Modifié le"],
    widths: [180, 190, 240, 90, 180, 180],
  },
  {
    name: "Journal",
    headers: ["ID", "ID carte", "Type", "ID auteur", "Auteur", "Contenu", "Formule", "Résultat", "Horodatage", "Audience", "ID destinataire", "Destinataire"],
    widths: [180, 180, 110, 190, 180, 420, 150, 280, 180, 120, 190, 190],
  },
] as const

export const jdrSheetDefinitions: StructuredSheetDefinition[] = [
  {
    key: "classes",
    name: "Classes",
    tabName: "Classes",
    frozenColumns: 1,
    headers: classSheetHeaders,
    columnWidths: [120, 150, 220, 300, 150, 150, 150, 110, 110, 150, 150],
  },
  {
    key: "characters",
    name: "Feuille de personnage",
    tabName: "Personnages",
    frozenColumns: 3,
    headers: characterSheetHeaders,
    columnWidths: characterSheetHeaders.map((_, index) => index < 3 ? [120, 180, 190][index] : 150),
  },
  {
    key: "campaigns",
    name: "Campagnes",
    tabName: "Campagnes",
    frozenColumns: 2,
    headers: campaignSheetHeaders,
    columnWidths: [160, 200, 280, 420, 340, 140],
  },
  {
    key: "admin_todos",
    name: "To-do administration",
    tabName: "To-do",
    frozenColumns: 3,
    headers: todoSheetHeaders,
    columnWidths: [160, 200, 180, 220, 360, 110, 150, 100, 100, 170, 170, 170],
  },
  {
    key: "campaign_characters",
    name: "Personnages des campagnes",
    tabName: "Personnages par campagne",
    frozenColumns: 2,
    headers: campaignCharacterHeaders,
    columnWidths: [180, 180],
  },
  {
    key: "character_relations",
    name: "Relations des personnages",
    tabName: "Relations",
    frozenColumns: 2,
    headers: characterRelationHeaders,
    columnWidths: [170, 190, 130, 190, 220, 100, 420, 190, 190, 170, 170],
  },
  {
    key: "inventory",
    name: "Arme, équipement, inventaire",
    tabName: inventoryWorkbookTabs[0].name,
    frozenColumns: 1,
    headers: [...inventoryWorkbookTabs[0].headers],
    columnWidths: [...inventoryWorkbookTabs[0].widths],
  },
  {
    key: "shops",
    name: "Magasins",
    tabName: "Magasins",
    frozenColumns: 2,
    headers: shopSheetHeaders,
    columnWidths: [180, 190, 170, 150, 170, 220, 150, 520, 160, 180, 170, 170],
  },
  {
    key: "vocabulary",
    name: "Vocabulaire",
    tabName: "Vocabulaire",
    frozenColumns: 1,
    headers: ["Titre", "Contenu"],
    columnWidths: [240, 720],
  },
  // Index du monde (Ressources) : colonnes, onglets supplémentaires et liens entre
  // index sont décrits dans lib/world-index-definitions.ts. Seul le premier onglet
  // de chaque classeur est déclaré ici ; les suivants sont ajoutés par lib/world-indexes.ts.
  // Les index d'entités (PNJs, campagnes…) gardent ci-dessous leur propre déclaration.
  ...(Object.keys(worldIndexDefinitions) as BuiltinWorldIndexKey[]).filter((key) => !isEntityWorldIndexKey(key)).map((key) => worldIndexDefinitions[key]).map((index): StructuredSheetDefinition => ({
    key: index.key as Exclude<BuiltinWorldIndexKey, EntityWorldIndexKey>,
    name: index.sheetName,
    tabName: index.tabs[0].name,
    frozenColumns: 1,
    headers: index.tabs[0].headers,
    columnWidths: index.tabs[0].widths,
  })),
  {
    key: "npcs",
    name: "PNJs",
    tabName: "PNJs",
    frozenColumns: 2,
    headers: npcSheetHeaders,
    columnWidths: npcSheetColumnWidths,
  },
  {
    // Les sessions d'une campagne (Créateur de session). Les listes d'identifiants
    // renvoient vers les feuilles Personnages, PNJs et Magasins.
    key: "sessions",
    name: "Sessions de campagne",
    tabName: "Sessions",
    frozenColumns: 3,
    headers: sessionSheetHeaders,
    columnWidths: [180, 180, 260, 320, 320, 320, 320, 190, 170, 170],
  },
  {
    key: "tabletop",
    name: "Tabletop",
    tabName: "Cartes",
    frozenColumns: 2,
    headers: [...tabletopWorkbookTabs[0].headers],
    columnWidths: [...tabletopWorkbookTabs[0].widths],
  },
]

/**
 * Met en forme un onglet structuré : le premier du classeur par défaut, ou celui
 * désigné par `targetSheetId` pour les classeurs à plusieurs onglets.
 */
export async function configureStructuredSheet(spreadsheetId: string, definition: StructuredSheetDefinition, targetSheetId?: number) {
  const metadata = targetSheetId === undefined ? await googleSheetsJson<{
    sheets?: Array<{ properties?: { sheetId?: number } }>
  }>(`spreadsheets/${spreadsheetId}?fields=sheets.properties.sheetId`) : null
  const sheetId = targetSheetId ?? metadata?.sheets?.[0]?.properties?.sheetId
  if (sheetId === undefined) throw new Error("SHEETS_METADATA_UNAVAILABLE")

  const requests: Array<Record<string, unknown>> = [
    {
      updateSheetProperties: {
        properties: {
          sheetId,
          title: definition.tabName,
          gridProperties: {
            rowCount: 1000,
            columnCount: definition.headers.length,
            frozenRowCount: 1,
            frozenColumnCount: definition.frozenColumns,
          },
        },
        fields: "title,gridProperties.rowCount,gridProperties.columnCount,gridProperties.frozenRowCount,gridProperties.frozenColumnCount",
      },
    },
    {
      repeatCell: {
        range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: definition.headers.length },
        cell: {
          userEnteredFormat: {
            backgroundColor: { red: 0.34, green: 0.125, blue: 0.118 },
            textFormat: { bold: true, foregroundColor: { red: 1, green: 0.98, blue: 0.94 } },
            horizontalAlignment: "CENTER",
            verticalAlignment: "MIDDLE",
            wrapStrategy: "WRAP",
          },
        },
        fields: "userEnteredFormat",
      },
    },
    {
      updateDimensionProperties: {
        range: { sheetId, dimension: "ROWS", startIndex: 0, endIndex: 1 },
        properties: { pixelSize: 48 },
        fields: "pixelSize",
      },
    },
    {
      addBanding: {
        bandedRange: {
          range: { sheetId, startRowIndex: 0, endRowIndex: 1000, startColumnIndex: 0, endColumnIndex: definition.headers.length },
          rowProperties: {
            headerColor: { red: 0.34, green: 0.125, blue: 0.118 },
            firstBandColor: { red: 0.969, green: 0.945, blue: 0.902 },
            secondBandColor: { red: 0.91, green: 0.867, blue: 0.788 },
          },
        },
      },
    },
    {
      setBasicFilter: {
        filter: { range: { sheetId, startRowIndex: 0, endRowIndex: 1000, startColumnIndex: 0, endColumnIndex: definition.headers.length } },
      },
    },
  ]

  definition.columnWidths.forEach((pixelSize, index) => {
    requests.push({
      updateDimensionProperties: {
        range: { sheetId, dimension: "COLUMNS", startIndex: index, endIndex: index + 1 },
        properties: { pixelSize },
        fields: "pixelSize",
      },
    })
  })

  if (definition.key === "classes") {
    requests.push(
      {
        setDataValidation: {
          range: { sheetId, startRowIndex: 1, endRowIndex: 1000, startColumnIndex: 1, endColumnIndex: 2 },
          rule: {
            condition: { type: "ONE_OF_LIST", values: classTypes.map((value) => ({ userEnteredValue: value })) },
            strict: true,
            showCustomUi: true,
          },
        },
      },
      {
        setDataValidation: {
          range: { sheetId, startRowIndex: 1, endRowIndex: 1000, startColumnIndex: 7, endColumnIndex: 8 },
          rule: {
            condition: { type: "ONE_OF_LIST", values: classDifficulties.map((value) => ({ userEnteredValue: value })) },
            strict: true,
            showCustomUi: true,
          },
        },
      },
      {
        setDataValidation: {
          range: { sheetId, startRowIndex: 1, endRowIndex: 1000, startColumnIndex: 8, endColumnIndex: 9 },
          rule: {
            condition: { type: "NUMBER_BETWEEN", values: [{ userEnteredValue: "0" }, { userEnteredValue: "100" }] },
            strict: true,
          },
        },
      },
    )
  }

  await googleSheetsJson(`spreadsheets/${spreadsheetId}:batchUpdate`, {
    method: "POST",
    body: JSON.stringify({ requests }),
  })
  const lastColumn = columnName(definition.headers.length)
  await updateRange(spreadsheetId, sheetTabRange(definition.tabName, `A1:${lastColumn}1`), [definition.headers])
}

export function columnName(columnCount: number) {
  let current = columnCount
  let result = ""
  while (current > 0) {
    const remainder = (current - 1) % 26
    result = String.fromCharCode(65 + remainder) + result
    current = Math.floor((current - 1) / 26)
  }
  return result
}

const npcSheetSchemaReady = new Set<string>()

async function ensureNpcSheetSchema(spreadsheetId: string, tabName: string) {
  const schemaKey = `${spreadsheetId}:${tabName}:v9`
  if (npcSheetSchemaReady.has(schemaKey)) return
  const persistentKey = `npc-sheet-schema:${schemaKey}`
  const [alreadySynced] = await getDb().select().from(sheetIndexSyncs).where(eq(sheetIndexSyncs.key, persistentKey)).limit(1)
  if (alreadySynced) {
    npcSheetSchemaReady.add(schemaKey)
    return
  }

  const metadata = await googleSheetsJson<{ sheets?: Array<{ properties?: InventorySheetProperties }> }>(
    `spreadsheets/${spreadsheetId}?fields=sheets.properties(sheetId,title,gridProperties(rowCount,columnCount))`,
  )
  const properties = metadata.sheets?.map((sheet) => sheet.properties ?? {}).find((sheet) => sheet.title === tabName)
  if (properties?.sheetId === undefined) throw new Error("NPCS_SHEET_TAB_UNAVAILABLE")

  const requests: Array<Record<string, unknown>> = []
  if ((properties.gridProperties?.columnCount || 0) < npcSheetHeaders.length) {
    requests.push({
      updateSheetProperties: {
        properties: { sheetId: properties.sheetId, gridProperties: { columnCount: npcSheetHeaders.length, frozenRowCount: 1, frozenColumnCount: 2 } },
        fields: "gridProperties.columnCount,gridProperties.frozenRowCount,gridProperties.frozenColumnCount",
      },
    })
  }
  if (requests.length) {
    await googleSheetsJson(`spreadsheets/${spreadsheetId}:batchUpdate`, {
      method: "POST",
      body: JSON.stringify({ requests }),
    })
  }

  clearSpreadsheetReadCache(spreadsheetId)
  const [headers = []] = await readRange(spreadsheetId, sheetTabRange(tabName, "1:1"))
  // Les deux toutes premières versions de la feuille, reconnues à leurs en-têtes : leurs
  // lignes sont recopiées une fois dans l'ordre actuel (elles datent d'avant les noms).
  const legacyV1 = headers[0] === "ID" && headers[1] === "ID campagne" && !headers.includes("Page lié")
  const legacyV2 = headers[0] === "ID" && headers[1] === "Page lié" && headers[18] === "Âge" && headers[28] !== "Modifié le" && !headers.includes("Genre")
  const columns = sheetColumns(headers, npcSheetHeaders)
  const blank = !headers.some((value) => value.trim())
  if (legacyV1 || legacyV2 || blank || headerRowHoldsData(columns)) {
    const rowOneContainsData = !blank && !legacyV1 && !legacyV2
    const formattingRequests: Array<Record<string, unknown>> = [
      ...(rowOneContainsData ? [{ insertDimension: { range: { sheetId: properties.sheetId, startIndex: 0, endIndex: 1, dimension: "ROWS" }, inheritFromBefore: false } }] : []),
      {
        repeatCell: {
          range: { sheetId: properties.sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: npcSheetHeaders.length },
          cell: { userEnteredFormat: { backgroundColor: { red: 0.34, green: 0.125, blue: 0.118 }, textFormat: { bold: true, foregroundColor: { red: 1, green: 0.98, blue: 0.94 } }, horizontalAlignment: "CENTER", verticalAlignment: "MIDDLE", wrapStrategy: "WRAP" } },
          fields: "userEnteredFormat",
        },
      },
      { setBasicFilter: { filter: { range: { sheetId: properties.sheetId, startRowIndex: 0, endRowIndex: 1000, startColumnIndex: 0, endColumnIndex: npcSheetHeaders.length } } } },
    ]
    npcSheetColumnWidths.forEach((pixelSize, index) => formattingRequests.push({
      updateDimensionProperties: {
        range: { sheetId: properties.sheetId, dimension: "COLUMNS", startIndex: index, endIndex: index + 1 },
        properties: { pixelSize },
        fields: "pixelSize",
      },
    }))
    await googleSheetsJson(`spreadsheets/${spreadsheetId}:batchUpdate`, {
      method: "POST",
      body: JSON.stringify({ requests: formattingRequests }),
    })
    clearSpreadsheetReadCache(spreadsheetId)
    const legacyRows = legacyV1
      ? await readRange(spreadsheetId, `${tabName}!A2:I`)
      : legacyV2 ? await readRange(spreadsheetId, `${tabName}!A2:AB`) : []
    await updateRange(spreadsheetId, `${tabName}!A1:${NPC_LAST_COLUMN}1`, [npcSheetHeaders])
    if (legacyRows.length) {
      const migratedRows = legacyRows.map((row) => {
        if (!row[0]) return Array(npcSheetHeaders.length).fill("")
        if (legacyV2) return [...row.slice(0, 18), "", ...row.slice(18)]
        const migrated = Array<string>(npcSheetHeaders.length).fill("")
        migrated[0] = row[0]
        migrated[1] = row[1] || ""
        migrated[2] = row[2] || ""
        migrated[3] = row[3] || ""
        migrated[22] = row[6] || ""
        migrated[23] = row[5] || ""
        migrated[24] = row[4] || ""
        migrated[25] = "[]"
        migrated[26] = "Non"
        migrated[27] = row[7] || ""
        migrated[28] = row[8] || ""
        return migrated
      })
      await updateRange(spreadsheetId, `${tabName}!A2:${NPC_LAST_COLUMN}${legacyRows.length + 1}`, migratedRows)
    }
  } else {
    // La feuille actuelle : ses colonnes sont retrouvées par leur nom, quelle que soit
    // leur place. Celles qui manquent sont ajoutées à droite ; rien n'est réécrit.
    await ensureNamedColumns(spreadsheetId, tabName, columns)
  }
  npcSheetSchemaReady.add(schemaKey)
  await getDb().insert(sheetIndexSyncs).values({ key: persistentKey }).onConflictDoNothing()
}

export function sheetTabRange(tabName: string, cells: string) {
  return `'${tabName.replaceAll("'", "''")}'!${cells}`
}

type InventorySheetProperties = {
  sheetId?: number
  title?: string
  gridProperties?: { rowCount?: number; columnCount?: number }
}

async function inventoryWorkbookProperties(spreadsheetId: string) {
  const metadata = await googleSheetsJson<{ sheets?: Array<{ properties?: InventorySheetProperties }> }>(
    `spreadsheets/${spreadsheetId}?fields=sheets.properties(sheetId,title,gridProperties(rowCount,columnCount))`,
  )
  return (metadata.sheets ?? []).map((sheet) => sheet.properties ?? {})
}

async function ensureInventoryWorkbookSchema(spreadsheetId: string) {
  const syncKey = `inventory-workbook:v5:${spreadsheetId}`
  const [alreadySynced] = await getDb().select().from(sheetIndexSyncs).where(eq(sheetIndexSyncs.key, syncKey)).limit(1)
  if (alreadySynced) return

  let properties = await inventoryWorkbookProperties(spreadsheetId)
  const missingTabs = inventoryWorkbookTabs.filter((tab) => !properties.some((sheet) => sheet.title === tab.name))
  if (missingTabs.length) {
    await googleSheetsJson(`spreadsheets/${spreadsheetId}:batchUpdate`, {
      method: "POST",
      body: JSON.stringify({
        requests: missingTabs.map((tab) => ({
          addSheet: {
            properties: {
              title: tab.name,
              gridProperties: { rowCount: 1000, columnCount: tab.headers.length, frozenRowCount: 1 },
            },
          },
        })),
      }),
    })
    properties = await inventoryWorkbookProperties(spreadsheetId)
  }

  const newlyCreatedNames = new Set(missingTabs.map((tab) => tab.name))
  // Les colonnes de chaque onglet, retrouvées par leur nom : les réglages visent leur vraie place.
  const headerRows = await readRanges(spreadsheetId, inventoryWorkbookTabs.map((tab) => sheetTabRange(tab.name, "1:1")))
  const tabColumns = new Map(inventoryWorkbookTabs.map((tab, index) => [tab.name, sheetColumns(newlyCreatedNames.has(tab.name) ? [] : headerRows[index]?.[0] ?? [], tab.headers)]))
  const requests: Array<Record<string, unknown>> = []
  for (const tab of inventoryWorkbookTabs) {
    const sheet = properties.find((candidate) => candidate.title === tab.name)
    if (sheet?.sheetId === undefined) throw new Error("INVENTORY_SHEET_TAB_UNAVAILABLE")
    const columns = tabColumns.get(tab.name)!
    const column = (name: string) => {
      const index = columns.at(name)
      return index >= 0 ? { startColumnIndex: index, endColumnIndex: index + 1 } : null
    }
    const rowCount = Math.max(1000, sheet.gridProperties?.rowCount || 0)
    const columnCount = Math.max(tab.headers.length, sheet.gridProperties?.columnCount || 0)
    requests.push(
      {
        updateSheetProperties: {
          properties: {
            sheetId: sheet.sheetId,
            gridProperties: { rowCount, columnCount, frozenRowCount: 1 },
          },
          fields: "gridProperties.rowCount,gridProperties.columnCount,gridProperties.frozenRowCount",
        },
      },
      {
        repeatCell: {
          range: { sheetId: sheet.sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: tab.headers.length },
          cell: {
            userEnteredFormat: {
              backgroundColor: { red: 0.34, green: 0.125, blue: 0.118 },
              textFormat: { bold: true, foregroundColor: { red: 1, green: 0.98, blue: 0.94 } },
              horizontalAlignment: "CENTER",
              verticalAlignment: "MIDDLE",
              wrapStrategy: "WRAP",
            },
          },
          fields: "userEnteredFormat",
        },
      },
      {
        updateDimensionProperties: {
          range: { sheetId: sheet.sheetId, dimension: "ROWS", startIndex: 0, endIndex: 1 },
          properties: { pixelSize: 48 },
          fields: "pixelSize",
        },
      },
      {
        setBasicFilter: {
          filter: { range: { sheetId: sheet.sheetId, startRowIndex: 0, endRowIndex: rowCount, startColumnIndex: 0, endColumnIndex: tab.headers.length } },
        },
      },
    )
    // Les largeurs d'origine seulement pour un onglet neuf : celles choisies dans Sheets restent.
    if (newlyCreatedNames.has(tab.name)) tab.widths.forEach((pixelSize, index) => {
      requests.push({
        updateDimensionProperties: {
          range: { sheetId: sheet.sheetId, dimension: "COLUMNS", startIndex: index, endIndex: index + 1 },
          properties: { pixelSize },
          fields: "pixelSize",
        },
      })
    })
    if (newlyCreatedNames.has(tab.name)) {
      requests.push({
        addBanding: {
          bandedRange: {
            range: { sheetId: sheet.sheetId, startRowIndex: 0, endRowIndex: rowCount, startColumnIndex: 0, endColumnIndex: tab.headers.length },
            rowProperties: {
              headerColor: { red: 0.34, green: 0.125, blue: 0.118 },
              firstBandColor: { red: 0.969, green: 0.945, blue: 0.902 },
              secondBandColor: { red: 0.91, green: 0.867, blue: 0.788 },
            },
          },
        },
      })
    }
    const validation = (name: string, values: readonly string[], strict: boolean) => {
      const span = column(name)
      if (span) requests.push({
        setDataValidation: {
          range: { sheetId: sheet.sheetId, startRowIndex: 1, endRowIndex: rowCount, ...span },
          rule: { condition: { type: "ONE_OF_LIST", values: values.map((value) => ({ userEnteredValue: value })) }, strict, showCustomUi: true },
        },
      })
    }
    if (tab.name === "Types de contenants") {
      validation("Catégorie", inventoryCategories, true)
      validation("Actif", ["Oui", "Non"], true)
    }
    if (tab.name === "Objets") {
      validation("Type", ["Arme", "Armure", "Objet", "Ressource", "Monnaie"], false)
      validation("Actif", ["Oui", "Non"], true)
    }
    if (tab.name === inventoryContentsTab) validation("Équipé", ["Oui", "Non"], true)
  }

  await googleSheetsJson(`spreadsheets/${spreadsheetId}:batchUpdate`, {
    method: "POST",
    body: JSON.stringify({ requests }),
  })
  // Les en-têtes, par leur nom : un onglet neuf reçoit les siens, un onglet existant
  // seulement ceux qui lui manquent, à droite. Aucun en-tête existant n'est réécrit.
  for (const tab of inventoryWorkbookTabs) {
    const columns = tabColumns.get(tab.name)!
    if (!columns.headers.some(Boolean)) await updateRange(spreadsheetId, sheetTabRange(tab.name, `A1:${columnName(tab.headers.length)}1`), [[...tab.headers]])
    else tabColumns.set(tab.name, await ensureNamedColumns(spreadsheetId, tab.name, columns))
  }

  const types = await readNamedSheet(spreadsheetId, "Types de contenants", inventoryWorkbookTabs[0].headers)
  const existingIds = new Set(types.rows.map((row) => types.columns.get(row, "ID")).filter(Boolean))
  const missingBaseTypes = baseInventoryContainerTypes.filter((type) => !existingIds.has(type.id))
  if (missingBaseTypes.length) {
    await appendRows(spreadsheetId, namedAppendRange("Types de contenants", types.columns), canonicalRows(types.columns, missingBaseTypes.map((type) => [
      type.id,
      type.name,
      type.category,
      type.capacity,
      type.columns.join(" | "),
      "Oui",
    ])))
  }
  await getDb().insert(sheetIndexSyncs).values({ key: syncKey }).onConflictDoNothing()
}

async function ensureTabletopWorkbookSchema(spreadsheetId: string) {
  const syncKey = `tabletop-workbook:v4:${spreadsheetId}`
  const [alreadySynced] = await getDb().select().from(sheetIndexSyncs).where(eq(sheetIndexSyncs.key, syncKey)).limit(1)
  if (alreadySynced) return

  let properties = await inventoryWorkbookProperties(spreadsheetId)
  const missingTabs = tabletopWorkbookTabs.filter((tab) => !properties.some((sheet) => sheet.title === tab.name))
  if (missingTabs.length) {
    await googleSheetsJson(`spreadsheets/${spreadsheetId}:batchUpdate`, {
      method: "POST",
      body: JSON.stringify({
        requests: missingTabs.map((tab) => ({
          addSheet: {
            properties: {
              title: tab.name,
              gridProperties: { rowCount: 1000, columnCount: tab.headers.length, frozenRowCount: 1 },
            },
          },
        })),
      }),
    })
    properties = await inventoryWorkbookProperties(spreadsheetId)
  }

  const newlyCreatedNames = new Set(missingTabs.map((tab) => tab.name))
  // Les colonnes de chaque onglet existant, retrouvées par leur nom : rien n'est réécrit par place.
  const headerRows = await readRanges(spreadsheetId, tabletopWorkbookTabs.map((tab) => sheetTabRange(tab.name, "1:1")))
  const tabColumns = new Map(tabletopWorkbookTabs.map((tab, index) => [tab.name, sheetColumns(newlyCreatedNames.has(tab.name) ? [] : headerRows[index]?.[0] ?? [], tab.headers)]))
  const requests: Array<Record<string, unknown>> = []
  for (const tab of tabletopWorkbookTabs) {
    const sheet = properties.find((candidate) => candidate.title === tab.name)
    if (sheet?.sheetId === undefined) throw new Error("TABLETOP_SHEET_TAB_UNAVAILABLE")
    const columns = tabColumns.get(tab.name)!
    const fresh = !columns.headers.some(Boolean)
    const column = (name: string) => {
      const index = columns.at(name)
      return index >= 0 ? { startColumnIndex: index, endColumnIndex: index + 1 } : null
    }
    const rowCount = Math.max(1000, sheet.gridProperties?.rowCount || 0)
    requests.push(
      {
        updateSheetProperties: {
          properties: { sheetId: sheet.sheetId, gridProperties: { rowCount, columnCount: Math.max(tab.headers.length, sheet.gridProperties?.columnCount || 0), frozenRowCount: 1 } },
          fields: "gridProperties.rowCount,gridProperties.columnCount,gridProperties.frozenRowCount",
        },
      },
      {
        repeatCell: {
          range: { sheetId: sheet.sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: tab.headers.length },
          cell: { userEnteredFormat: { backgroundColor: { red: 0.34, green: 0.125, blue: 0.118 }, textFormat: { bold: true, foregroundColor: { red: 1, green: 0.98, blue: 0.94 } }, horizontalAlignment: "CENTER", verticalAlignment: "MIDDLE", wrapStrategy: "WRAP" } },
          fields: "userEnteredFormat",
        },
      },
      {
        setBasicFilter: {
          filter: { range: { sheetId: sheet.sheetId, startRowIndex: 0, endRowIndex: rowCount, startColumnIndex: 0, endColumnIndex: tab.headers.length } },
        },
      },
      // Les en-têtes d'origine seulement sur une ligne 1 vide (onglet neuf) ; sinon les
      // colonnes manquantes sont ajoutées à droite après ce lot, par leur nom.
      ...(fresh ? [{
        updateCells: {
          range: { sheetId: sheet.sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: tab.headers.length },
          rows: [{
            values: tab.headers.map((header) => ({ userEnteredValue: { stringValue: header } })),
          }],
          fields: "userEnteredValue",
        },
      }] : []),
    )
    if (fresh) tab.widths.forEach((pixelSize, index) => requests.push({
      updateDimensionProperties: {
        range: { sheetId: sheet.sheetId, dimension: "COLUMNS", startIndex: index, endIndex: index + 1 },
        properties: { pixelSize },
        fields: "pixelSize",
      },
    }))
    if (newlyCreatedNames.has(tab.name)) {
      requests.push({
        addBanding: {
          bandedRange: {
            range: { sheetId: sheet.sheetId, startRowIndex: 0, endRowIndex: rowCount, startColumnIndex: 0, endColumnIndex: tab.headers.length },
            rowProperties: {
              headerColor: { red: 0.34, green: 0.125, blue: 0.118 },
              firstBandColor: { red: 0.969, green: 0.945, blue: 0.902 },
              secondBandColor: { red: 0.91, green: 0.867, blue: 0.788 },
            },
          },
        },
      })
    }
    const entityKind = column("Type d’entité")
    if (tab.name === "Tokens" && entityKind) {
      requests.push({
        setDataValidation: {
          range: { sheetId: sheet.sheetId, startRowIndex: 1, endRowIndex: rowCount, ...entityKind },
          rule: { condition: { type: "ONE_OF_LIST", values: ["npc", "character", "shop", "marker"].map((value) => ({ userEnteredValue: value })) }, strict: true, showCustomUi: true },
        },
      })
    }
    const activityKind = column("Type")
    if (tab.name === "Journal" && activityKind) {
      requests.push({
        setDataValidation: {
          range: { sheetId: sheet.sheetId, startRowIndex: 1, endRowIndex: rowCount, ...activityKind },
          rule: { condition: { type: "ONE_OF_LIST", values: ["chat", "dice"].map((value) => ({ userEnteredValue: value })) }, strict: true, showCustomUi: true },
        },
      })
    }
  }

  await googleSheetsJson(`spreadsheets/${spreadsheetId}:batchUpdate`, {
    method: "POST",
    body: JSON.stringify({ requests }),
  })
  clearSpreadsheetReadCache(spreadsheetId)
  for (const tab of tabletopWorkbookTabs) {
    const columns = tabColumns.get(tab.name)!
    if (columns.headers.some(Boolean)) await ensureNamedColumns(spreadsheetId, tab.name, columns)
  }
  await getDb().insert(sheetIndexSyncs).values({ key: syncKey }).onConflictDoNothing()
}

let tabletopWorkbookPromise: Promise<JdrSheetRecord | null> | null = null

export async function isTabletopWorkbookReady() {
  const sheet = await resolveJdrSheet("tabletop")
  if (!sheet) return false
  const [synced] = await getDb()
    .select()
    .from(sheetIndexSyncs)
    .where(eq(sheetIndexSyncs.key, `tabletop-workbook:v4:${sheet.spreadsheetId}`))
    .limit(1)
  return Boolean(synced)
}

async function prepareTabletopWorkbook() {
  let sheet = await getJdrSheet("tabletop")
  if (!sheet) {
    const definition = jdrSheetDefinitions.find((item) => item.key === "tabletop")
    if (!definition) throw new Error("UNKNOWN_JDR_SHEET")
    const file = await findGoogleSpreadsheetByName(definition.name) ?? await createGoogleSpreadsheet(definition.name)
    sheet = await saveJdrSheet({
      key: definition.key,
      spreadsheetId: file.id,
      name: definition.name,
      tabName: definition.tabName,
      webViewLink: file.webViewLink || `https://docs.google.com/spreadsheets/d/${file.id}/edit`,
    })
    if (!sheet) throw new Error("TABLETOP_SHEET_UNAVAILABLE")
  }
  await ensureTabletopWorkbookSchema(sheet.spreadsheetId)
  return sheet
}

export function ensureTabletopWorkbook() {
  if (!tabletopWorkbookPromise) {
    tabletopWorkbookPromise = prepareTabletopWorkbook().finally(() => {
      tabletopWorkbookPromise = null
    })
  }
  return tabletopWorkbookPromise
}

export function prepareTabletopWorkbookInBackground() {
  return runInBackground(ensureTabletopWorkbook(), "TABLETOP_WORKBOOK_PREPARATION_FAILED")
}

export async function ensureJdrSheets() {
  const output = []
  for (const definition of jdrSheetDefinitions) {
    if (definition.key === "tabletop") {
      const sheet = await ensureTabletopWorkbook()
      if (sheet) output.push(sheet)
      continue
    }
    const existing = await getJdrSheet(definition.key)
    if (existing) {
      if (definition.key === "inventory") await ensureInventoryWorkbookSchema(existing.spreadsheetId)
      if (definition.key === "tabletop") await ensureTabletopWorkbookSchema(existing.spreadsheetId)
      output.push(existing)
      continue
    }
    const existingFile = await findGoogleSpreadsheetByName(definition.name)
    const file = existingFile ?? await createGoogleSpreadsheet(definition.name)
    if (!existingFile) await configureStructuredSheet(file.id, definition)
    if (definition.key === "inventory") await ensureInventoryWorkbookSchema(file.id)
    if (definition.key === "npcs") await ensureNpcSheetSchema(file.id, definition.tabName)
    if (definition.key === "tabletop") await ensureTabletopWorkbookSchema(file.id)
    const stored = await saveJdrSheet({
      key: definition.key,
      spreadsheetId: file.id,
      name: definition.name,
      tabName: definition.tabName,
      webViewLink: file.webViewLink || `https://docs.google.com/spreadsheets/d/${file.id}/edit`,
    })
    if (stored) output.push(stored)
  }
  return output
}

export type LegacyIdentityCandidate = {
  uid: string
  campaigns: string[]
  characters: string[]
  linkedToCurrentAccount: boolean
  available: boolean
}

/**
 * Imports only the lightweight ownership indexes from the already linked sheets.
 * This never writes to Google Sheets; it lets the desktop account recognize data
 * created by the live site without changing that site's identifiers.
 */
export async function syncExistingIdentityIndexes() {
  const [campaignSource, characterSource, relationSource] = await Promise.all([
    campaignsSource(),
    charactersSource(),
    resolveJdrSheet("campaign_characters"),
  ])
  let relationsRead = false
  const empty: NamedSheet | null = null
  // Chaque feuille est lue par le nom de ses colonnes : les déplacer dans Sheets ne change rien.
  const [campaignSheet, characterSheet, relationSheet] = await Promise.all([
    campaignSource ? readNamedSheet(campaignSource.spreadsheetId, campaignSource.tabName, campaignSheetHeaders, { fresh: true }).catch((error) => { console.error("IDENTITY_SYNC_CAMPAIGNS_READ_FAILED", error instanceof Error ? error.message : "UNKNOWN_ERROR"); return empty }) : Promise.resolve(empty),
    characterSource ? readCharacterColumns(characterSource, ["Joueur", "Nom personnage", "Peuple"], { fresh: true }).catch((error) => { console.error("IDENTITY_SYNC_CHARACTERS_READ_FAILED", error instanceof Error ? error.message : "UNKNOWN_ERROR"); return empty }) : Promise.resolve(empty),
    relationSource ? readNamedSheet(relationSource.spreadsheetId, relationSource.tabName, campaignCharacterHeaders, { fresh: true }).then((sheet) => { relationsRead = sheet.columns.headers.length > 0; return sheet }).catch((error) => { console.error("IDENTITY_SYNC_RELATIONS_READ_FAILED", error instanceof Error ? error.message : "UNKNOWN_ERROR"); return empty }) : Promise.resolve(empty),
  ])
  const campaignRows = campaignSheet?.rows ?? []
  const characterRows = characterSheet?.rows ?? []
  const relationLinks = relationSheet
    ? relationSheet.rows.map((row) => ({ campaignId: relationSheet.columns.get(row, "ID campagne"), characterId: relationSheet.columns.get(row, "ID personnage") })).filter((link) => link.campaignId && link.characterId)
    : []
  const now = new Date().toISOString()
  const db = getDb()
  // Only write rows that actually changed. This used to upsert every row of
  // every sheet on each call — hundreds of sequential writes per page load,
  // even when nothing had moved. In steady state it now writes nothing.
  const [existingCampaigns, existingCharacters, existingLinks] = await Promise.all([
    db.select().from(campaignIndex),
    db.select().from(characterIndex),
    db.select().from(campaignCharacters),
  ])
  const campaignById = new Map(existingCampaigns.map((row) => [row.id, row]))
  const characterById = new Map(existingCharacters.map((row) => [row.id, row]))
  const linkKeys = new Set(existingLinks.map((row) => `${row.campaignId}::${row.characterId}`))

  for (const row of campaignRows) {
    const campaign = campaignSheet ? campaignFromRow(row, campaignSheet.columns) : null
    if (!campaign) continue
    const { id, ...next } = campaign
    const current = campaignById.get(id)
    if (current
      && !current.deletedAt
      && current.mjUid === next.mjUid
      && current.name === next.name
      && current.description === next.description
      && current.bannerUrl === next.bannerUrl
      && current.accentColor === next.accentColor) continue
    await db.insert(campaignIndex).values({ id, ...next, updatedAt: now, deletedAt: null })
      .onConflictDoUpdate({ target: campaignIndex.id, set: { ...next, updatedAt: now } })
  }

  for (const row of characterRows) {
    const columns = characterSheet?.columns
    const id = columns?.get(row, "ID").trim() ?? ""
    if (!columns || !id) continue
    const next = {
      ownerUid: columns.get(row, "Joueur"),
      name: columns.get(row, "Nom personnage") || "Personnage sans nom",
      subtitle: displayedMultipleValue(columns.get(row, "Peuple"), "all"),
    }
    const current = characterById.get(id)
    if (current
      && !current.deletedAt
      && current.ownerUid === next.ownerUid
      && current.name === next.name
      && current.subtitle === next.subtitle) continue
    // La feuille n'a pas de date de modification : celle de l'index local avance seulement quand la fiche change.
    // Un ancien sous-titre en JSON (`["Elfe"]`) réécrit en clair n'est pas un changement de la fiche.
    const sameSheet = current && !current.deletedAt && current.ownerUid === next.ownerUid && current.name === next.name
      && displayedMultipleValue(current.subtitle ?? "", "all") === next.subtitle
    const updatedAt = sameSheet ? current.updatedAt : now
    await db.insert(characterIndex).values({ id, ...next, updatedAt, deletedAt: null })
      .onConflictDoUpdate({ target: characterIndex.id, set: { ...next, updatedAt } })
  }

  // Les feuilles font foi : ce qu'elles contiennent est retenu, et une entrée de l'index
  // local absente des feuilles n'est plus listée (voir `inSheets`).
  if (characterSheet && characterSheet.columns.at("ID") >= 0 && characterRows.length) {
    sheetPresence.characters = { ids: new Set(characterRows.map((row) => characterSheet.columns.get(row, "ID").trim()).filter(Boolean)), readAt: Date.now() }
  }
  if (campaignSheet && campaignSheet.columns.at("ID") >= 0 && campaignRows.length) {
    sheetPresence.campaigns = { ids: new Set(campaignRows.map((row) => campaignSheet.columns.get(row, "ID").trim()).filter(Boolean)), readAt: Date.now() }
  }

  for (const link of relationLinks) {
    if (linkKeys.has(`${link.campaignId}::${link.characterId}`)) continue
    await db.insert(campaignCharacters).values(link).onConflictDoNothing()
  }

  // La feuille « Personnages des campagnes » fait foi : un personnage qu'un MJ a
  // retiré de sa campagne depuis une autre installation disparaît aussi d'ici.
  // Seulement si la feuille a bien été lue (en-tête compris) : une lecture en
  // échec ou vide ne doit jamais vider l'index local.
  if (relationsRead) {
    const sharedKeys = new Set(relationLinks.map((link) => `${link.campaignId}::${link.characterId}`))
    for (const link of existingLinks) {
      if (sharedKeys.has(`${link.campaignId}::${link.characterId}`)) continue
      await db.delete(campaignCharacters).where(and(eq(campaignCharacters.campaignId, link.campaignId), eq(campaignCharacters.characterId, link.characterId)))
    }
  }
  // Les mises à la corbeille faites sur les autres installations.
  await applySharedTrash().catch((error) => console.error("IDENTITY_SYNC_TRASH_FAILED", error instanceof Error ? error.message : "UNKNOWN_ERROR"))
  return { campaigns: campaignRows.length, characters: characterRows.length }
}

export async function listLegacyIdentityCandidates(localUserId: string): Promise<LegacyIdentityCandidate[]> {
  await ensureIdentityIndexes()
  const [campaigns, characters, links, currentLink] = await Promise.all([
    getDb().select({ uid: campaignIndex.mjUid, name: campaignIndex.name }).from(campaignIndex).where(isNull(campaignIndex.deletedAt)),
    getDb().select({ uid: characterIndex.ownerUid, name: characterIndex.name }).from(characterIndex).where(isNull(characterIndex.deletedAt)),
    getDb().select().from(userIdentityLinks),
    getIdentityLink(localUserId),
  ])
  const candidates = new Map<string, { campaigns: string[]; characters: string[] }>()
  // Une case peut nommer plusieurs propriétaires : chacun est un candidat.
  for (const campaign of campaigns) for (const uid of ownersOf(campaign.uid)) {
    if (uid === localUserId) continue
    const entry = candidates.get(uid) ?? { campaigns: [], characters: [] }
    entry.campaigns.push(campaign.name)
    candidates.set(uid, entry)
  }
  for (const character of characters) for (const uid of ownersOf(character.uid)) {
    if (uid === localUserId) continue
    const entry = candidates.get(uid) ?? { campaigns: [], characters: [] }
    entry.characters.push(character.name)
    candidates.set(uid, entry)
  }
  const claimed = new Map(links.map((link) => [link.legacyUid, link.localUserId]))
  return [...candidates.entries()].map(([uid, data]) => ({
    uid,
    campaigns: [...new Set(data.campaigns)].sort((a, b) => a.localeCompare(b, "fr")),
    characters: [...new Set(data.characters)].sort((a, b) => a.localeCompare(b, "fr")),
    linkedToCurrentAccount: currentLink?.legacyUid === uid,
    available: !claimed.has(uid) || claimed.get(uid) === localUserId,
  })).sort((left, right) => Number(right.linkedToCurrentAccount) - Number(left.linkedToCurrentAccount)
    || (right.campaigns.length + right.characters.length) - (left.campaigns.length + left.characters.length))
}

export type DriveSpreadsheetDuplicate = DriveFile & { inUse: boolean; keep: boolean }
export type DriveSpreadsheetDuplicateGroup = { label: string; files: DriveSpreadsheetDuplicate[] }

function normalizedDriveSpreadsheetName(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/gi, " ").trim().toLowerCase()
}

export async function listDriveSpreadsheetDuplicates(): Promise<DriveSpreadsheetDuplicateGroup[]> {
  const [files, registeredSheets] = await Promise.all([
    listAllDriveFiles(),
    Promise.all(jdrSheetDefinitions.map((definition) => getJdrSheet(definition.key))),
  ])
  const registeredIds = new Set(registeredSheets.flatMap((sheet) => sheet ? [sheet.spreadsheetId] : []))
  const groups = new Map<string, DriveFile[]>()
  for (const file of files) {
    if (file.mimeType !== "application/vnd.google-apps.spreadsheet") continue
    const label = normalizedDriveSpreadsheetName(file.name)
    groups.set(label, [...(groups.get(label) ?? []), file])
  }
  return [...groups.entries()].flatMap(([label, candidates]) => {
    if (candidates.length < 2) return []
    const sorted = [...candidates].sort((left, right) => (right.modifiedTime || "").localeCompare(left.modifiedTime || ""))
    const registered = sorted.filter((file) => registeredIds.has(file.id))
    const keepId = registered[0]?.id ?? sorted[0].id
    return [{
      label,
      files: sorted.map((file) => ({ ...file, inUse: registeredIds.has(file.id), keep: file.id === keepId })),
    }]
  }).sort((left, right) => left.label.localeCompare(right.label, "fr"))
}

export async function trashRedundantDriveSpreadsheet(fileId: string) {
  const groups = await listDriveSpreadsheetDuplicates()
  const candidate = groups.flatMap((group) => group.files).find((file) => file.id === fileId)
  if (!candidate || candidate.inUse || candidate.keep) throw new Error("DRIVE_FILE_PROTECTED")
  return trashDriveFile(candidate.id)
}

const jdrSheetHeaderChecked = new Set<string>()

// Le nom d'onglet enregistré est celui que la définition *attend*. Quand un
// classeur a été relié (trouvé par son nom dans le Drive) au lieu d'avoir été
// créé par l'app, son onglet porte encore le nom par défaut de Google
// (« Feuille 1 »). Toutes les plages A1 étaient alors construites sur un nom
// d'onglet inexistant : chaque lecture et chaque écriture échouaient avec une
// erreur d'analyse de plage, y compris l'ajout d'un personnage à une campagne.
const verifiedJdrSheetTabs = new Set<string>()

/**
 * Réparation après une modification faite à la main dans Drive ou Sheets (onglet
 * supprimé ou renommé, classeur supprimé). Les vérifications gardées en mémoire
 * sont oubliées ; si le classeur n'existe plus, son lien local l'est aussi.
 * Aucune donnée n'est modifiée ni supprimée.
 */
export async function repairJdrSheet(key: JdrSheetKey) {
  const stored = await getJdrSheet(key)
  for (const cache of [verifiedJdrSheetTabs, jdrSheetHeaderChecked]) {
    for (const entry of [...cache]) if (entry.endsWith(`:${key}`)) cache.delete(entry)
  }
  if (!stored) return
  clearSpreadsheetReadCache(stored.spreadsheetId)
  const exists = await spreadsheetTabs(stored.spreadsheetId).then(() => true).catch((error) => {
    const code = error instanceof Error ? error.message : ""
    return !/^SHEETS_API_ERROR:404/.test(code)
  })
  if (!exists) await forgetJdrSheet(key)
}

export async function spreadsheetTabs(spreadsheetId: string) {
  const metadata = await googleSheetsJson<{ sheets?: Array<{ properties?: { sheetId?: number; title?: string } }> }>(
    `spreadsheets/${spreadsheetId}?fields=sheets.properties(sheetId,title)`,
  )
  return (metadata.sheets ?? []).flatMap((item) => item.properties?.title
    ? [{ sheetId: item.properties.sheetId, title: item.properties.title }]
    : [])
}

function storeTabName(sheet: JdrSheetRecord, tabName: string) {
  return saveJdrSheet({ key: sheet.key, spreadsheetId: sheet.spreadsheetId, name: sheet.name, tabName, webViewLink: sheet.webViewLink })
}

async function verifyJdrSheetTab(sheet: JdrSheetRecord, definition: StructuredSheetDefinition) {
  const cacheKey = `${sheet.spreadsheetId}:${definition.key}`
  if (verifiedJdrSheetTabs.has(cacheKey)) return sheet
  try {
    const tabs = await spreadsheetTabs(sheet.spreadsheetId)
    if (!tabs.length || tabs.some((tab) => tab.title === definition.tabName)) {
      verifiedJdrSheetTabs.add(cacheKey)
      return sheet.tabName === definition.tabName ? sheet : (await storeTabName(sheet, definition.tabName)) ?? sheet
    }
    // Un seul onglet : c'est forcément celui du classeur qu'on a relié, on le
    // renomme pour ne perdre aucune ligne. Plusieurs onglets : on en ajoute un.
    const requests = tabs.length === 1
      ? [{ updateSheetProperties: { properties: { sheetId: tabs[0].sheetId, title: definition.tabName }, fields: "title" } }]
      : [{ addSheet: { properties: { title: definition.tabName, gridProperties: { rowCount: 1000, columnCount: definition.headers.length, frozenRowCount: 1, frozenColumnCount: definition.frozenColumns } } } }]
    await googleSheetsJson(`spreadsheets/${sheet.spreadsheetId}:batchUpdate`, { method: "POST", body: JSON.stringify({ requests }) })
    clearSpreadsheetReadCache(sheet.spreadsheetId)
    verifiedJdrSheetTabs.add(cacheKey)
    console.error("JDR_SHEET_TAB_REPAIRED", definition.key, tabs.map((tab) => tab.title).join(" | "), "->", definition.tabName)
    return (await storeTabName(sheet, definition.tabName)) ?? { ...sheet, tabName: definition.tabName }
  } catch (error) {
    console.error("JDR_SHEET_TAB_CHECK_FAILED", definition.key, error instanceof Error ? error.message : "UNKNOWN_ERROR")
    return sheet
  }
}

/**
 * La ligne d'en-têtes d'une feuille d'Eraser, vérifiée par le nom des colonnes : celles
 * qui manquent sont ajoutées à droite, rien n'est déplacé ni renommé. Déplacer une
 * colonne dans Sheets ne déclenche plus rien. Seule une ligne 1 qui porte des données
 * (feuille sans en-têtes) reçoit une ligne d'en-têtes insérée au-dessus.
 */
async function ensureJdrSheetHeaderRow(sheet: JdrSheetRecord, definition: StructuredSheetDefinition) {
  const cacheKey = `${sheet.spreadsheetId}:${sheet.tabName}:${definition.key}`
  if (jdrSheetHeaderChecked.has(cacheKey)) return
  try {
    clearSpreadsheetReadCache(sheet.spreadsheetId)
    const [firstRow = []] = await readRange(sheet.spreadsheetId, sheetTabRange(sheet.tabName, "1:1"))
    const columns = sheetColumns(firstRow, definition.headers)
    if (headerRowHoldsData(columns)) {
      const tabs = await spreadsheetTabs(sheet.spreadsheetId)
      const sheetId = tabs.find((tab) => tab.title === sheet.tabName)?.sheetId
      if (sheetId === undefined) throw new Error("SHEET_TAB_NOT_FOUND")
      await googleSheetsJson(`spreadsheets/${sheet.spreadsheetId}:batchUpdate`, {
        method: "POST",
        body: JSON.stringify({ requests: [{
          insertDimension: {
            range: { sheetId, dimension: "ROWS", startIndex: 0, endIndex: 1 },
            inheritFromBefore: false,
          },
        }] }),
      })
      clearSpreadsheetReadCache(sheet.spreadsheetId)
      await updateRange(sheet.spreadsheetId, sheetTabRange(sheet.tabName, `A1:${columnName(definition.headers.length)}1`), [definition.headers])
      console.info("JDR_SHEET_HEADER_ROW_INSERTED", definition.key)
    } else {
      await ensureNamedColumns(sheet.spreadsheetId, sheet.tabName, columns)
    }
    jdrSheetHeaderChecked.add(cacheKey)
  } catch (error) {
    console.error("JDR_SHEET_HEADER_CHECK_FAILED", definition.key, error instanceof Error ? error.message : "UNKNOWN_ERROR")
    throw error
  }
}

export type JdrSheetDiagnostic = {
  key: JdrSheetKey
  name: string
  expectedTab: string
  linked: boolean
  spreadsheetId: string
  webViewLink: string
  actualTabs: string[]
  rows: number | null
  status: "ok" | "not-linked" | "error"
  detail: string
}

/**
 * Teste réellement chaque feuille, une par une, et rapporte l'erreur brute de
 * Google. Sans cela, toutes les pannes se ressemblaient à l'écran
 * (« la connexion à Google Sheets a échoué ») quelle qu'en soit la cause.
 */
/**
 * Écrit une ligne témoin, la relit, puis l'efface. C'est le seul moyen de
 * distinguer « Google refuse l'écriture » de « Google accepte l'écriture mais
 * la ligne n'arrive pas là où l'app la relit » — les deux se présentaient à
 * l'écran comme un simple échec d'enregistrement.
 */
async function testJdrSheetWrite(spreadsheetId: string, definition: StructuredSheetDefinition) {
  const marker = `diagnostic:${crypto.randomUUID()}`
  const lastColumn = columnName(definition.headers.length)
  const range = sheetTabRange(definition.tabName, `A:${lastColumn}`)
  let writtenRange = ""
  try {
    const probe = [marker, ...Array(Math.max(0, definition.headers.length - 1)).fill("")]
    const write = await appendRows(spreadsheetId, range, [probe], { valueInputOption: "RAW" })
    writtenRange = write.updatedRange
    clearSpreadsheetReadCache(spreadsheetId)
    const rows = await readRangeFresh(spreadsheetId, writtenRange)
    if (!rows.some((row) => row[0] === marker)) {
      return `\u00c9criture accept\u00e9e par Google dans ${writtenRange}, mais la ligne t\u00e9moin est introuvable \u00e0 la relecture.`
    }
    // La relecture ci-dessus vise la plage écrite. L'application, elle, relit
    // toujours la plage complète à partir de la ligne 2 : une ligne visible
    // dans la première et absente de la seconde est exactement ce qui faisait
    // échouer l'enregistrement après un succès annoncé. Le diagnostic doit donc
    // contrôler les deux, et vérifier au passage le numéro de ligne renvoyé.
    const listing = await readRangeFreshWithOffset(spreadsheetId, sheetTabRange(definition.tabName, `A2:${lastColumn}`))
    const markerIndex = listing.rows.findIndex((row) => row[0] === marker)
    if (markerIndex < 0) {
      return `La ligne t\u00e9moin est lisible dans ${writtenRange}, mais absente de la plage ${definition.tabName}!A2:${lastColumn} que l'application relit. C'est ce d\u00e9calage qui emp\u00eache de retrouver les magasins apr\u00e8s leur enregistrement.`
    }
    const writtenRow = sheetRangeStartRow(writtenRange)
    const listedRow = listing.startRow + markerIndex
    if (writtenRow !== null && writtenRow !== listedRow) {
      return `Google annonce la ligne ${writtenRow} (${writtenRange}) mais la relecture compl\u00e8te la place en ligne ${listedRow}. Les \u00e9critures suivantes viseraient la mauvaise ligne.`
    }
    return ""
  } catch (error) {
    return error instanceof Error ? error.message : "UNKNOWN_ERROR"
  } finally {
    if (writtenRange) {
      await updateRanges(spreadsheetId, [{
        range: writtenRange,
        values: [[""]],
      }], { valueInputOption: "RAW" }).catch(() => undefined)
    }
  }
}

export async function diagnoseJdrSheets(withWriteTest = false): Promise<JdrSheetDiagnostic[]> {
  return Promise.all(jdrSheetDefinitions.map(async (definition): Promise<JdrSheetDiagnostic> => {
    const base = {
      key: definition.key,
      name: definition.name,
      expectedTab: definition.tabName,
      linked: false,
      spreadsheetId: "",
      webViewLink: "",
      actualTabs: [] as string[],
      rows: null as number | null,
    }
    const stored = await getJdrSheet(definition.key)
    if (!stored) {
      return { ...base, status: "not-linked", detail: "Aucun classeur relié pour cette feuille." }
    }
    const linked = { ...base, linked: true, spreadsheetId: stored.spreadsheetId, webViewLink: stored.webViewLink }
    try {
      const tabs = await spreadsheetTabs(stored.spreadsheetId)
      const titles = tabs.map((tab) => tab.title)
      if (!titles.includes(definition.tabName)) {
        return { ...linked, actualTabs: titles, status: "error", detail: `L’onglet « ${definition.tabName} » est absent de ce classeur.` }
      }
      const rows = await readRange(stored.spreadsheetId, sheetTabRange(definition.tabName, "A:A"))
      const readOnly = { ...linked, actualTabs: titles, rows: Math.max(0, rows.length - 1) }
      if (!withWriteTest) return { ...readOnly, status: "ok", detail: "" }
      const write = await testJdrSheetWrite(stored.spreadsheetId, definition)
      return write
        ? { ...readOnly, status: "error", detail: write }
        : { ...readOnly, status: "ok", detail: "Lecture et \u00e9criture OK." }
    } catch (error) {
      return { ...linked, status: "error", detail: error instanceof Error ? error.message : "UNKNOWN_ERROR" }
    }
  }))
}

const worldIndexKeys = new Set<string>(Object.keys(worldIndexDefinitions).filter((key) => !isEntityWorldIndexKey(key)))

export async function ensureJdrSheet(key: JdrSheetKey) {
  if (key === "tabletop") return ensureTabletopWorkbook()
  const stored = await getJdrSheet(key)
  if (stored) {
    const knownDefinition = jdrSheetDefinitions.find((item) => item.key === key)
    const existing = knownDefinition ? await verifyJdrSheetTab(stored, knownDefinition) : stored
    if (key === "inventory") await ensureInventoryWorkbookSchema(existing.spreadsheetId)
    if (key === "npcs") await ensureNpcSheetSchema(existing.spreadsheetId, existing.tabName)
    // Les index du monde gèrent leurs en-têtes par nom (lib/world-indexes.ts) : une
    // colonne ajoutée s'écrit à la suite au lieu d'insérer une nouvelle ligne d'en-têtes.
    if (knownDefinition && !worldIndexKeys.has(key)) await ensureJdrSheetHeaderRow(existing, knownDefinition)
    return existing
  }
  const definition = jdrSheetDefinitions.find((item) => item.key === key)
  if (!definition) throw new Error("UNKNOWN_JDR_SHEET")
  // Deux demandes en même temps ne cherchent (et au besoin ne créent) la feuille qu'une
  // fois : chacune ne la trouvant pas encore, elles en créaient deux du même nom.
  const pending = pendingJdrSheetCreations.get(key)
  if (pending) return pending
  const creation = linkOrCreateJdrSheet(key, definition).finally(() => pendingJdrSheetCreations.delete(key))
  pendingJdrSheetCreations.set(key, creation)
  return creation
}

const pendingJdrSheetCreations = new Map<JdrSheetKey, Promise<JdrSheetRecord>>()

async function linkOrCreateJdrSheet(key: JdrSheetKey, definition: StructuredSheetDefinition) {
  const existingFile = await findGoogleSpreadsheetByName(definition.name)
  const file = existingFile ?? await createGoogleSpreadsheet(definition.name)
  if (!existingFile) await configureStructuredSheet(file.id, definition)
  const saved = await saveJdrSheet({
    key: definition.key,
    spreadsheetId: file.id,
    name: definition.name,
    tabName: definition.tabName,
    webViewLink: file.webViewLink || `https://docs.google.com/spreadsheets/d/${file.id}/edit`,
  })
  if (!saved) throw new Error("JDR_SHEET_LINK_FAILED")
  const verified = await verifyJdrSheetTab(saved, definition)
  if (key === "inventory") await ensureInventoryWorkbookSchema(verified.spreadsheetId)
  if (key === "npcs") {
    if (existingFile) await ensureNpcSheetSchema(verified.spreadsheetId, verified.tabName)
    else npcSheetSchemaReady.add(`${verified.spreadsheetId}:${verified.tabName}:v7`)
  }
  if (!worldIndexKeys.has(key)) await ensureJdrSheetHeaderRow(verified, definition)
  return verified
}

export async function createCampaignForMj(mjUid: string, input: { name: string; description?: string; bannerUrl?: string; accentColor?: string }) {
  const normalizedName = input.name.trim()
  if (!normalizedName || normalizedName.length > 120) throw new Error("INVALID_CAMPAIGN_NAME")
  const [sheet] = await Promise.all([ensureJdrSheet("campaigns"), ensureJdrSheet("shops"), ensureJdrSheet("npcs")])
  if (!sheet) throw new Error("CAMPAIGNS_SHEET_UNAVAILABLE")
  const campaign: CampaignRecord = {
    id: crypto.randomUUID(), mjUid, name: normalizedName,
    description: input.description?.trim() || "", bannerUrl: input.bannerUrl?.trim() || "",
    accentColor: input.accentColor && /^#[0-9a-f]{6}$/i.test(input.accentColor) ? input.accentColor : "#927640",
    updatedAt: new Date().toISOString(),
  }
  // Les en-têtes sont vérifiés par leur nom (ensureJdrSheet) ; la ligne est rangée d'après eux.
  const { columns } = await readNamedSheet(sheet.spreadsheetId, sheet.tabName, campaignSheetHeaders)
  const ready = await ensureNamedColumns(sheet.spreadsheetId, sheet.tabName, columns)
  await appendRows(sheet.spreadsheetId, namedAppendRange(sheet.tabName, ready), [ready.row(campaignCells(campaign))])
  await getDb().insert(campaignIndex).values(campaign).onConflictDoUpdate({
    target: campaignIndex.id,
    set: { name: campaign.name, updatedAt: new Date().toISOString() },
  })
  return campaign
}

const shopKeys = new Set<ShopKey>(["market", "bookshop", "antique", "armory", "black-market", "alchemist", "tavern"])
const shopSizes = new Set<ShopSize>(["Minuscule", "Petit", "Moyen", "Grand", "Géant"])
const cityKeys = new Set<CityKey>(["bourg", "village", "small-city", "medium-city", "large-city", "capital"])

/** La feuille Magasins relue sans cache (les écritures y sont vérifiées), colonnes par leur nom. */
async function readShopSheet(sheet: JdrSheetRecord) {
  return readNamedSheet(sheet.spreadsheetId, sheet.tabName, shopSheetHeaders, { fresh: true })
}

function savedShopFromRow(cells: readonly (string | undefined)[], columns: SheetColumns): SavedShopRecord | null {
  // La ligne réduite à ce que lit un magasin, dans l'ordre d'origine des colonnes.
  const row = shopSheetHeaders.map((name) => columns.get(cells, name))
  if (!row[0] || !row[1]) return null
  let items: GeneratedShop["items"] = []
  try {
    const parsed = JSON.parse(row[7] || "[]") as unknown
    if (Array.isArray(parsed)) items = parsed.flatMap((value, index) => {
      if (!value || typeof value !== "object") return []
      const item = value as Record<string, unknown>
      const name = typeof item.name === "string" ? item.name : ""
      if (!name) return []
      const rarity = ["very-common", "common", "rare", "very-rare", "ultimate"].includes(String(item.rarity))
        ? item.rarity as GeneratedShop["items"][number]["rarity"]
        : "common"
      return [{
        id: typeof item.id === "string" && item.id ? item.id : `legacy-${row[0]}-${index}`,
        name,
        description: typeof item.description === "string" ? item.description : "",
        effect: typeof item.effect === "string" ? item.effect : "",
        // Les magasins enregistrés avant la mise en forme n'ont pas ces champs :
        // ils retombent simplement sur leur texte brut.
        nameHtml: typeof item.nameHtml === "string" ? item.nameHtml : "",
        descriptionHtml: typeof item.descriptionHtml === "string" ? item.descriptionHtml : "",
        effectHtml: typeof item.effectHtml === "string" ? item.effectHtml : "",
        type: typeof item.type === "string" ? item.type : "Objet",
        subtype: typeof item.subtype === "string" ? item.subtype : "",
        price: typeof item.price === "string" ? item.price : "",
        icon: typeof item.icon === "string" ? item.icon : "",
        locations: Array.isArray(item.locations) ? item.locations as Array<{ place: string; rarity: string }> : [],
        rarity,
      }]
    })
  } catch {
    items = []
  }
  return {
    id: row[0],
    pageLinked: row[1],
    cityName: row[2] || "Ville",
    cityKey: cityKeys.has(row[3] as CityKey) ? row[3] as CityKey : "village",
    key: shopKeys.has(row[4] as ShopKey) ? row[4] as ShopKey : "market",
    name: row[5] || "Magasin",
    size: shopSizes.has(row[6] as ShopSize) ? row[6] as ShopSize : "Petit",
    items,
    inCampaign: sheetValueIsChecked(row[8]),
    npcId: row[9] || "",
    createdAt: row[10] || "",
    updatedAt: row[11] || "",
  }
}

function shopCells(shop: GeneratedShop, pageLinked: string, current: SavedShopRecord | null, options: { inCampaign?: boolean; npcId?: string }): Record<string, SheetCell> {
  const now = new Date().toISOString()
  return {
    "ID": shop.id,
    "Page lié": pageLinked,
    "Ville": shop.cityName,
    "Taille de ville": shop.cityKey,
    "Type de magasin": shop.key,
    "Nom du magasin": shop.name,
    "Taille du magasin": shop.size,
    "Objets JSON": JSON.stringify(shop.items),
    "Ajouté à la campagne": (options.inCampaign ?? current?.inCampaign ?? false) ? "Oui" : "Non",
    "ID PNJ lié": options.npcId ?? current?.npcId ?? "",
    "Créé le": current?.createdAt || now,
    "Modifié le": now,
  }
}

/** Les cases d'Eraser vidées (une ligne de magasin libérée) : les autres colonnes restent. */
const blankShopCells: Record<string, SheetCell> = Object.fromEntries(shopSheetHeaders.map((name) => [name, ""]))

export async function listSavedShops(pageLinked: string, onlyInCampaign = false) {
  const sheet = await ensureJdrSheet("shops")
  if (!sheet) throw new Error("SHOPS_SHEET_UNAVAILABLE")
  const { columns, rows } = await readShopSheet(sheet)
  return rows.map((row) => savedShopFromRow(row, columns)).filter((shop): shop is SavedShopRecord => Boolean(shop && !shop.id.startsWith("latest:") && shop.pageLinked === pageLinked && (!onlyInCampaign || shop.inCampaign)))
}

/**
 * Le dernier tirage d'une campagne est enregistré avec des identifiants
 * préfixés « latest: » pour ne pas se mélanger aux magasins sauvegardés.
 * Sans cette lecture, le message « Dernier tirage sauvegardé » était faux :
 * l'écriture avait bien lieu, mais plus rien ne relisait ces lignes.
 */
export async function listLatestShops(pageLinked: string): Promise<GeneratedShop[]> {
  const sheet = await ensureJdrSheet("shops")
  if (!sheet) throw new Error("SHOPS_SHEET_UNAVAILABLE")
  const { columns, rows } = await readShopSheet(sheet)
  return rows.map((row) => savedShopFromRow(row, columns)).flatMap((shop) => shop && shop.pageLinked === pageLinked && shop.id.startsWith("latest:")
    ? [{ id: shop.id.slice("latest:".length), key: shop.key, name: shop.name, size: shop.size, cityKey: shop.cityKey, cityName: shop.cityName, items: shop.items }]
    : [])
}

export async function saveGeneratedShops(pageLinked: string, shops: GeneratedShop[], options: { replace?: boolean; replaceLatest?: boolean; inCampaign?: boolean; npcId?: string } = {}) {
  const receipts = await writeShopRows(pageLinked, shops, options)
  // La vérification relit la feuille entière, comme listSavedShops et
  // listLatestShops. Relire seulement la plage
  // renvoyée par l'écriture laissait passer le cas qui bloquait l'application :
  // Google confirmait la ligne à l'endroit écrit, le serveur annonçait un
  // succès, et la liste que l'interface recharge juste après ne la contenait
  // pas. Vérifier par le même chemin que la lecture rend ce cas impossible.
  if (!shops.length) return []
  const sheet = await ensureJdrSheet("shops")
  if (!sheet) throw new Error("SHOPS_SHEET_UNAVAILABLE")
  let storedById = new Map<string, SavedShopRecord>()
  const delays = [0, 100, 250, 500]
  for (const delay of delays) {
    if (delay) await new Promise((resolve) => setTimeout(resolve, delay))
    clearSpreadsheetReadCache(sheet.spreadsheetId)
    const listed = await readShopSheet(sheet)
    storedById = new Map(listed.rows.map((row) => savedShopFromRow(row, listed.columns)).flatMap((shop) => shop ? [[shop.id, shop] as const] : []))
    if (shops.every((shop) => storedById.has(shop.id))) break
  }
  const invalid = shops.filter((shop) => {
    const stored = storedById.get(shop.id)
    if (!stored || stored.pageLinked !== pageLinked) return true
    if (options.inCampaign !== undefined && stored.inCampaign !== options.inCampaign) return true
    if (options.npcId !== undefined && stored.npcId !== options.npcId) return true
    return false
  })
  if (invalid.length) throw new Error(`SHOPS_WRITE_NOT_PERSISTED:${invalid.length}/${shops.length}:${sheet.tabName}:${receipts.map((receipt) => receipt.range).join(",") || "aucune plage"}`)
  return shops.flatMap((shop) => {
    const stored = storedById.get(shop.id)
    return stored ? [stored] : []
  })
}

type ShopWriteReceipt = { range: string }

async function appendShopRows(spreadsheetId: string, tabName: string, columns: SheetColumns, rows: Array<Record<string, SheetCell>>): Promise<ShopWriteReceipt[]> {
  if (!rows.length) return []
  const result = await appendRows(spreadsheetId, namedAppendRange(tabName, columns), rows.map((cells) => columns.row(cells)), { valueInputOption: "RAW" })
  return [{ range: result.updatedRange }]
}

async function updateShopRows(spreadsheetId: string, writes: Array<{ range: string; values: Array<Array<string | number | boolean>> }>): Promise<ShopWriteReceipt[]> {
  if (!writes.length) return []
  const responses = await updateRanges(spreadsheetId, writes, { valueInputOption: "RAW" })
  return writes.map((write, index) => ({
    range: responses[index]?.updatedRange || write.range,
  }))
}

/**
 * Les lignes libérées par une suppression ou un remplacement sont blanchies,
 * pas retirées : la feuille se retrouve trouée. `values.append` doit alors
 * deviner seul où s'arrête le « tableau » à l'intérieur de A:L, et il peut
 * s'arrêter au premier trou. Or writeShopRows vient justement de lire toute la
 * plage : il sait exactement quelles lignes sont libres. On les réutilise donc
 * explicitement, et on ne laisse à l'append que le surplus.
 */
function freeShopRows(stored: Array<SavedShopRecord | null>, startRow: number, reserved: Set<number>) {
  return stored.flatMap((shop, index) => {
    const rowNumber = startRow + index
    return shop || reserved.has(rowNumber) ? [] : [rowNumber]
  })
}

async function placeShopRows(spreadsheetId: string, tabName: string, columns: SheetColumns, values: Array<Record<string, SheetCell>>, freeRows: number[]) {
  if (!values.length) return []
  const reused = values.slice(0, freeRows.length).flatMap((cells, index) => namedRowWrites(tabName, columns, freeRows[index], cells))
  return [
    ...await updateShopRows(spreadsheetId, reused),
    ...await appendShopRows(spreadsheetId, tabName, columns, values.slice(freeRows.length)),
  ]
}

async function writeShopRows(pageLinked: string, shops: GeneratedShop[], options: { replace?: boolean; replaceLatest?: boolean; inCampaign?: boolean; npcId?: string }) {
  const sheet = await ensureJdrSheet("shops")
  if (!sheet) throw new Error("SHOPS_SHEET_UNAVAILABLE")
  const read = await readShopSheet(sheet)
  const columns = await ensureNamedColumns(sheet.spreadsheetId, sheet.tabName, read.columns)
  const { rows } = read
  const startRow = 2
  const stored = rows.map((row) => savedShopFromRow(row, columns))
  const existingById = new Map<string, { shop: SavedShopRecord; rowNumber: number }>()
  stored.forEach((shop, index) => {
    if (shop) existingById.set(shop.id, { shop, rowNumber: startRow + index })
  })

  if (options.replace || options.replaceLatest) {
    const targetRows = stored.flatMap((shop, index) => shop?.pageLinked === pageLinked && (!options.replaceLatest || shop.id.startsWith("latest:")) ? [startRow + index] : [])
    const replacements = shops.slice(0, targetRows.length).flatMap((shop, index) => namedRowWrites(sheet.tabName, columns, targetRows[index], shopCells(shop, pageLinked, null, options)))
    const clear = targetRows.slice(shops.length).flatMap((rowNumber) => namedRowWrites(sheet.tabName, columns, rowNumber, blankShopCells))
    const receipts = await updateShopRows(sheet.spreadsheetId, replacements)
    await updateRanges(sheet.spreadsheetId, clear, { valueInputOption: "RAW" })
    const additions = shops.slice(targetRows.length)
    const freeRows = freeShopRows(stored, startRow, new Set(targetRows))
    return [...receipts, ...await placeShopRows(sheet.spreadsheetId, sheet.tabName, columns, additions.map((shop) => shopCells(shop, pageLinked, null, options)), freeRows)]
  }

  const updates: Array<{ range: string; values: SheetCell[][] }> = []
  const additions: Array<Record<string, SheetCell>> = []
  const reserved = new Set<number>()
  for (const shop of shops) {
    const existing = existingById.get(shop.id)
    const cells = shopCells(shop, pageLinked, existing?.shop ?? null, options)
    if (existing) {
      reserved.add(existing.rowNumber)
      updates.push(...namedRowWrites(sheet.tabName, columns, existing.rowNumber, cells))
    } else additions.push(cells)
  }
  return [
    ...await updateShopRows(sheet.spreadsheetId, updates),
    ...await placeShopRows(sheet.spreadsheetId, sheet.tabName, columns, additions, freeShopRows(stored, startRow, reserved)),
  ]
}

export async function deleteSavedShops(pageLinked: string, shopIds: string[]) {
  if (!shopIds.length) return
  const sheet = await ensureJdrSheet("shops")
  if (!sheet) throw new Error("SHOPS_SHEET_UNAVAILABLE")
  const selectedIds = new Set(shopIds)
  const { columns, rows } = await readShopSheet(sheet)
  const clear = rows.flatMap((row, index) => columns.get(row, "Page lié") === pageLinked && selectedIds.has(columns.get(row, "ID"))
    ? namedRowWrites(sheet.tabName, columns, index + 2, blankShopCells)
    : [])
  await updateRanges(sheet.spreadsheetId, clear, { valueInputOption: "RAW" })
}

export async function copySavedShopsToPage(sourcePageLinked: string, targetPageLinked: string, shopIds: string[]) {
  const selectedIds = new Set(shopIds)
  const source = (await listSavedShops(sourcePageLinked)).filter((shop) => selectedIds.has(shop.id))
  const copies: GeneratedShop[] = source.map((shop) => ({
    id: crypto.randomUUID(), key: shop.key, name: shop.name, size: shop.size,
    cityKey: shop.cityKey, cityName: shop.cityName, items: shop.items,
  }))
  if (copies.length) await saveGeneratedShops(targetPageLinked, copies)
  return copies
}

function npcNumber(value: string | undefined) {
  const parsed = Number.parseInt(value || "0", 10)
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0
}

type LegacyNpcInventoryItem = { id: string; name: string; quantity: number; notes: string }

function npcInventoryFromCell(value: string | undefined): LegacyNpcInventoryItem[] {
  try {
    const parsed = JSON.parse(value || "[]") as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.flatMap<LegacyNpcInventoryItem>((item) => {
      if (!item || typeof item !== "object") return []
      const candidate = item as Partial<LegacyNpcInventoryItem>
      if (!candidate.name?.trim()) return []
      return [{
        // Sans identifiant : vide (le sac du PNJ en donne un fixe, d'après la place dans la liste).
        id: typeof candidate.id === "string" && candidate.id ? candidate.id : "",
        name: candidate.name.trim(),
        quantity: Math.max(1, Math.trunc(Number(candidate.quantity) || 1)),
        notes: typeof candidate.notes === "string" ? candidate.notes : "",
      }]
    })
  } catch {
    return []
  }
}

async function npcSheet() {
  const sheet = await ensureJdrSheet("npcs")
  if (!sheet) throw new Error("NPCS_SHEET_UNAVAILABLE")
  return sheet
}

/** La feuille des PNJ, colonnes retrouvées par leur nom (ligne 1). */
async function readNpcSheet(sheet: JdrSheetRecord, options: { fresh?: boolean } = {}) {
  return readNamedSheet(sheet.spreadsheetId, sheet.tabName, npcSheetHeaders, { fresh: options.fresh })
}

function npcFromRow(row: readonly (string | undefined)[], columns: SheetColumns): CampaignNpcRecord | null {
  const cell = (name: string) => columns.get(row, name)
  const id = cell("ID")
  const pageLinked = cell("Page lié")
  if (!id || !pageLinked) return null
  const number = (name: string) => npcNumber(cell(name))
  return {
    id, pageLinked, name: cell("Nom du PNJ") || "PNJ sans nom",
    title: cell("Titre"), occupation: cell("Classe / métier"), people: cell("Peuple"),
    currentHp: number("Vie actuelle"), totalHp: number("Vie totale"), speed: number("Rapidité"),
    strength: number("Force"), dexterity: number("Dextérité"), intelligence: number("Intelligence"),
    wisdom: number("Sagesse"), charisma: number("Charisme"), constitution: number("Constitution"),
    gmNotes: cell("Notes MJ"), portrait: cell("Portrait"), playerNotes: cell("Notes joueurs"),
    inCampaign: sheetValueIsChecked(cell("Ajouté au créateur de session")), inPlayerGroup: sheetValueIsChecked(cell("Dans le groupe joueur")), important: sheetValueIsChecked(cell("PNJ important")),
    createdAt: cell("Créé le"), updatedAt: cell("Modifié le"), createdByUid: cell("Créé par"), lore: cell("Histoire / Lore"),
    activeSpells: cell("Sorts actifs"), passiveSpells: cell("Sorts passifs"),
  }
}

/** Les cases qu'écrit Eraser pour un PNJ, par nom de colonne : les autres colonnes ne sont jamais touchées. */
function npcCells(npc: CampaignNpcRecord, pageLinked: string, current: CampaignNpcRecord | null, options: { inCampaign?: boolean } = {}): Record<string, SheetCell> {
  const now = new Date().toISOString()
  return {
    "ID": npc.id,
    "Page lié": pageLinked,
    "Nom du PNJ": npc.name,
    "Classe / métier": npc.occupation,
    "Vie actuelle": npc.currentHp,
    "Vie totale": npc.totalHp,
    "Rapidité": npc.speed,
    "Peuple": npc.people,
    "Titre": npc.title,
    "Force": npc.strength,
    "Dextérité": npc.dexterity,
    "Intelligence": npc.intelligence,
    "Sagesse": npc.wisdom,
    "Charisme": npc.charisma,
    "Constitution": npc.constitution,
    "Notes MJ": npc.gmNotes,
    "Portrait": npc.portrait,
    "Notes joueurs": npc.playerNotes,
    "Ajouté au créateur de session": (options.inCampaign ?? npc.inCampaign ?? current?.inCampaign ?? false) ? "Oui" : "Non",
    // Une ancienne version de l'application n'envoie pas ce champ : la valeur de la feuille est gardée.
    "PNJ important": (npc.important ?? current?.important ?? false) ? "Oui" : "Non",
    // « Dans le groupe joueur » : les PNJs du groupe, visibles des joueurs sur la page de campagne.
    "Dans le groupe joueur": (npc.inPlayerGroup ?? current?.inPlayerGroup ?? false) ? "Oui" : "Non",
    "Histoire / Lore": npc.lore ?? current?.lore ?? "",
    // Une ancienne version de l'application n'envoie pas les sorts : ceux de la feuille restent.
    "Sorts actifs": npc.activeSpells ?? current?.activeSpells ?? "",
    "Sorts passifs": npc.passiveSpells ?? current?.passiveSpells ?? "",
    "Créé le": current?.createdAt || npc.createdAt || now,
    "Modifié le": now,
    "Créé par": npc.createdByUid || current?.createdByUid || "",
  }
}

export async function listNpcs(pageLinked: string, onlyInCampaign = false) {
  const sheet = await npcSheet()
  const { columns, rows } = await readNpcSheet(sheet)
  return rows.map((row) => npcFromRow(row, columns)).filter((npc): npc is CampaignNpcRecord => Boolean(npc && npc.pageLinked === pageLinked && (!onlyInCampaign || npc.inCampaign)))
}

/** Tous les PNJ, toutes pages confondues : l'Index des PNJs y cherche les campagnes de chacun. */
export async function listAllNpcs() {
  const sheet = await ensureJdrSheet("npcs")
  if (!sheet) return []
  const { columns, rows } = await readNpcSheet(sheet)
  return rows.map((row) => npcFromRow(row, columns)).filter((npc): npc is CampaignNpcRecord => Boolean(npc))
}

export async function getNpcById(id: string) {
  const sheet = await npcSheet()
  const { columns, rows } = await readNpcSheet(sheet)
  const row = rows.find((candidate) => columns.get(candidate, "ID") === id)
  return row ? npcFromRow(row, columns) : null
}

export async function listCampaignNpcs(campaignId: string) {
  return listNpcs(campaignId)
}

export async function saveNpcs(pageLinked: string, npcs: CampaignNpcRecord[], options: { inCampaign?: boolean } = {}) {
  const sheet = await npcSheet()
  const read = await readNpcSheet(sheet, { fresh: true })
  const columns = await ensureNamedColumns(sheet.spreadsheetId, sheet.tabName, read.columns)
  const { rows } = read
  const updates: Array<{ range: string; values: SheetCell[][] }> = []
  const additions: SheetCell[][] = []
  const saved: CampaignNpcRecord[] = []
  for (const npc of npcs) {
    const existingIndex = rows.findIndex((row) => columns.get(row, "ID") === npc.id && columns.get(row, "Page lié") === pageLinked)
    const original = existingIndex >= 0 ? rows[existingIndex] : null
    const cells = npcCells(npc, pageLinked, original ? npcFromRow(original, columns) : null, options)
    if (existingIndex >= 0) updates.push(...namedRowWrites(sheet.tabName, columns, existingIndex + 2, cells))
    else additions.push(columns.row(cells))
    const record = npcFromRow(columns.row(cells, original).map(String), columns)
    if (record) saved.push(record)
  }
  await updateRanges(sheet.spreadsheetId, updates)
  if (additions.length) await appendRows(sheet.spreadsheetId, namedAppendRange(sheet.tabName, columns), additions)
  return saved
}

export async function saveNpc(pageLinked: string, npc: CampaignNpcRecord, options: { inCampaign?: boolean } = {}) {
  const [saved] = await saveNpcs(pageLinked, [npc], options)
  return saved
}

export async function deleteNpcs(pageLinked: string, npcIds: string[]) {
  if (!npcIds.length) return
  const sheet = await npcSheet()
  const selectedIds = new Set(npcIds)
  const { columns, rows } = await readNpcSheet(sheet, { fresh: true })
  const clear = rows.flatMap((row, index) => columns.get(row, "Page lié") === pageLinked && selectedIds.has(columns.get(row, "ID"))
    ? [{ range: namedRowRange(sheet.tabName, columns, index + 2), values: [columns.blank()] }]
    : [])
  await updateRanges(sheet.spreadsheetId, clear)
}

export async function copyNpcsToPage(sourcePageLinked: string, targetPageLinked: string, npcIds: string[]) {
  const selectedIds = new Set(npcIds)
  const source = (await listNpcs(sourcePageLinked)).filter((npc) => selectedIds.has(npc.id))
  const copies: CampaignNpcRecord[] = []
  for (const npc of source) {
    const id = crypto.randomUUID()
    let portrait = npc.portrait
    if (npc.portrait.startsWith("/api/npcs/portrait/")) {
      const copied = await copyNpcPortrait(npc.id, id).catch(() => false)
      if (copied) portrait = `/api/npcs/portrait/${encodeURIComponent(id)}`
    }
    await copyCharacterInventory(npc.id, id)
    await copyToken("npc", npc.id, id)
    copies.push({ ...npc, id, pageLinked: targetPageLinked, portrait, inCampaign: false, inPlayerGroup: false, createdAt: "", updatedAt: "" })
  }
  return copies.length ? saveNpcs(targetPageLinked, copies) : []
}

export async function moveNpcsToPage(sourcePageLinked: string, targetPageLinked: string, npcIds: string[]) {
  const selectedIds = new Set(npcIds)
  const source = (await listNpcs(sourcePageLinked)).filter((npc) => selectedIds.has(npc.id))
  if (!source.length) return []
  const moved = await saveNpcs(targetPageLinked, source.map((npc) => ({
    ...npc,
    pageLinked: targetPageLinked,
    inCampaign: false,
    inPlayerGroup: false,
    createdAt: "",
    updatedAt: "",
  })))
  await deleteNpcs(sourcePageLinked, source.map((npc) => npc.id))
  return moved
}

function tabletopNumber(value: unknown, fallback: number, minimum: number, maximum: number) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.max(minimum, Math.min(maximum, parsed)) : fallback
}

type TabletopTabName = (typeof tabletopWorkbookTabs)[number]["name"]

function tabletopHeaders(tab: TabletopTabName) {
  return tabletopWorkbookTabs.find((candidate) => candidate.name === tab)?.headers ?? []
}

/**
 * Un onglet du Tabletop : ses colonnes retrouvées par leur nom, chaque ligne remise dans
 * l'ordre prévu (les lectures ci-dessous en dépendent). `rows[i]` est la ligne i + 2.
 */
async function readTabletopTab(spreadsheetId: string, tab: TabletopTabName, options: { fresh?: boolean } = {}) {
  // `fresh` pour une écriture : la ligne visée est retrouvée dans la feuille telle qu'elle
  // est maintenant (un autre joueur a pu ajouter ou retirer un pion entre-temps).
  const read = await readNamedSheet(spreadsheetId, tab, tabletopHeaders(tab), { fresh: options.fresh })
  const columns = await ensureNamedColumns(spreadsheetId, tab, read.columns).catch((error) => {
    console.error("TABLETOP_COLUMNS_CHECK_FAILED", tab, error instanceof Error ? error.message : "UNKNOWN_ERROR")
    return read.columns
  })
  return { columns, rows: read.rows.map((row) => canonicalRow(columns, row)) }
}

/** Ajoute des lignes (décrites dans l'ordre prévu) à un onglet du Tabletop, chaque valeur sous son en-tête. */
async function appendTabletopRows(spreadsheetId: string, tab: TabletopTabName, rows: SheetCell[][], known?: SheetColumns) {
  const columns = known ?? await ensureNamedColumns(spreadsheetId, tab, await namedColumnsOf(spreadsheetId, tab, tabletopHeaders(tab)))
  return appendRows(spreadsheetId, namedAppendRange(tab, columns), canonicalRows(columns, rows))
}

function tabletopMapFromRow(row: string[]): TabletopMapRecord | null {
  if (!row[0] || !row[1]) return null
  return {
    id: row[0],
    pageLinked: row[1],
    name: row[2] || "Carte sans nom",
    backgroundUrl: row[3] || "",
    width: tabletopNumber(row[4], 1600, 320, 12000),
    height: tabletopNumber(row[5], 900, 240, 12000),
    gridSize: tabletopNumber(row[6], 70, 8, 500),
    distancePerGrid: tabletopNumber(row[7], 1, 0.01, 10000),
    distanceUnit: row[8] || "m",
    roomKey: row[9] || "",
    createdByUid: row[10] || "",
    createdAt: row[11] || "",
    updatedAt: row[12] || "",
    folder: row[13] || "Sans dossier",
  }
}

function tabletopMapRow(map: TabletopMapRecord) {
  return [map.id, map.pageLinked, map.name, map.backgroundUrl, map.width, map.height, map.gridSize, map.distancePerGrid, map.distanceUnit, map.roomKey, map.createdByUid, map.createdAt, map.updatedAt, map.folder]
}

export async function listTabletopMaps(pageLinked: string) {
  const sheet = await ensureJdrSheet("tabletop")
  const { rows } = await readTabletopTab(sheet.spreadsheetId, "Cartes")
  return rows.map(tabletopMapFromRow).filter((map): map is TabletopMapRecord => Boolean(map && map.pageLinked === pageLinked))
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
}

export async function getTabletopMap(id: string) {
  const sheet = await ensureJdrSheet("tabletop")
  const { rows } = await readTabletopTab(sheet.spreadsheetId, "Cartes")
  const row = rows.find((candidate) => candidate[0] === id)
  return row ? tabletopMapFromRow(row) : null
}

export async function createTabletopMap(pageLinked: string, createdByUid: string, name: string, folder = "Sans dossier") {
  const sheet = await ensureJdrSheet("tabletop")
  const now = new Date().toISOString()
  const map: TabletopMapRecord = {
    id: crypto.randomUUID(),
    pageLinked,
    name: name.trim().slice(0, 120) || "Nouvelle carte",
    backgroundUrl: "",
    width: 1600,
    height: 900,
    gridSize: 70,
    distancePerGrid: 1,
    distanceUnit: "m",
    roomKey: crypto.randomUUID().replaceAll("-", ""),
    createdByUid,
    createdAt: now,
    updatedAt: now,
    folder: folder.trim().slice(0, 80) || "Sans dossier",
  }
  await appendTabletopRows(sheet.spreadsheetId, "Cartes", [tabletopMapRow(map)])
  return map
}

export async function updateTabletopMap(id: string, patch: Partial<Pick<TabletopMapRecord, "name" | "backgroundUrl" | "width" | "height" | "gridSize" | "distancePerGrid" | "distanceUnit" | "folder">>) {
  const sheet = await ensureJdrSheet("tabletop")
  const { columns, rows } = await readTabletopTab(sheet.spreadsheetId, "Cartes", { fresh: true })
  const index = rows.findIndex((candidate) => candidate[0] === id)
  if (index < 0) return null
  const current = tabletopMapFromRow(rows[index])
  if (!current) return null
  const next: TabletopMapRecord = {
    ...current,
    name: typeof patch.name === "string" ? patch.name.trim().slice(0, 120) || current.name : current.name,
    backgroundUrl: typeof patch.backgroundUrl === "string" ? patch.backgroundUrl.slice(0, 1500) : current.backgroundUrl,
    width: patch.width === undefined ? current.width : tabletopNumber(patch.width, current.width, 320, 12000),
    height: patch.height === undefined ? current.height : tabletopNumber(patch.height, current.height, 240, 12000),
    gridSize: patch.gridSize === undefined ? current.gridSize : tabletopNumber(patch.gridSize, current.gridSize, 8, 500),
    distancePerGrid: patch.distancePerGrid === undefined ? current.distancePerGrid : tabletopNumber(patch.distancePerGrid, current.distancePerGrid, 0.01, 10000),
    distanceUnit: typeof patch.distanceUnit === "string" ? patch.distanceUnit.trim().slice(0, 20) || current.distanceUnit : current.distanceUnit,
    folder: typeof patch.folder === "string" ? patch.folder.trim().slice(0, 80) || "Sans dossier" : current.folder,
    updatedAt: new Date().toISOString(),
  }
  await updateRanges(sheet.spreadsheetId, canonicalWrites("Cartes", columns, `A${index + 2}:N${index + 2}`, [tabletopMapRow(next)]))
  return next
}

function tabletopFolderFromRow(row: string[]): TabletopFolderRecord | null {
  if (!row[0] || !row[1] || !row[2]) return null
  return {
    id: row[0],
    pageLinked: row[1],
    name: row[2],
    sortOrder: tabletopNumber(row[3], 0, 0, 100000),
    createdAt: row[4] || "",
    updatedAt: row[5] || "",
  }
}

function normalizedTabletopFolder(value: string) {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("fr")
}

export async function listTabletopFolders(pageLinked: string, knownMaps?: TabletopMapRecord[]) {
  const sheet = await ensureJdrSheet("tabletop")
  const [{ rows: folderRows }, mapRows] = await Promise.all([
    readTabletopTab(sheet.spreadsheetId, "Dossiers"),
    knownMaps ? Promise.resolve(null) : readTabletopTab(sheet.spreadsheetId, "Cartes").then((read) => read.rows),
  ])
  const stored = folderRows.map(tabletopFolderFromRow).filter((folder): folder is TabletopFolderRecord => Boolean(folder && folder.pageLinked === pageLinked))
  const known = new Set(stored.map((folder) => normalizedTabletopFolder(folder.name)))
  const maps = knownMaps ?? (mapRows || []).map(tabletopMapFromRow).filter((map): map is TabletopMapRecord => Boolean(map && map.pageLinked === pageLinked))
  const derivedNames = [...new Set(maps.map((map) => map.folder || "Sans dossier"))]
    .filter((name) => normalizedTabletopFolder(name) !== normalizedTabletopFolder("Sans dossier") && !known.has(normalizedTabletopFolder(name)))
  const derived = derivedNames.map<TabletopFolderRecord>((name, index) => ({ id: `legacy:${encodeURIComponent(normalizedTabletopFolder(name))}`, pageLinked, name, sortOrder: 10000 + index, createdAt: "", updatedAt: "" }))
  return [
    { id: "__unfiled__", pageLinked, name: "Sans dossier", sortOrder: -1, createdAt: "", updatedAt: "" },
    ...stored,
    ...derived,
  ].sort((left, right) => left.sortOrder - right.sortOrder || left.name.localeCompare(right.name, "fr"))
}

export async function createTabletopFolder(pageLinked: string, name: string) {
  const cleaned = name.trim().replace(/\s+/g, " ").slice(0, 80)
  if (!cleaned || normalizedTabletopFolder(cleaned) === normalizedTabletopFolder("Sans dossier")) return (await listTabletopFolders(pageLinked))[0]
  const folders = await listTabletopFolders(pageLinked)
  const existing = folders.find((folder) => normalizedTabletopFolder(folder.name) === normalizedTabletopFolder(cleaned))
  if (existing && !existing.id.startsWith("legacy:")) return existing
  const sheet = await ensureJdrSheet("tabletop")
  const now = new Date().toISOString()
  const folder: TabletopFolderRecord = { id: crypto.randomUUID(), pageLinked, name: cleaned, sortOrder: Math.max(0, ...folders.map((item) => item.sortOrder)) + 1, createdAt: now, updatedAt: now }
  await appendTabletopRows(sheet.spreadsheetId, "Dossiers", [[folder.id, folder.pageLinked, folder.name, folder.sortOrder, folder.createdAt, folder.updatedAt]])
  return folder
}

export async function renameTabletopFolder(pageLinked: string, folderId: string, currentName: string, name: string) {
  const cleaned = name.trim().replace(/\s+/g, " ").slice(0, 80)
  if (!cleaned || normalizedTabletopFolder(cleaned) === normalizedTabletopFolder("Sans dossier")) throw new Error("INVALID_TABLETOP_FOLDER")
  const sheet = await ensureJdrSheet("tabletop")
  const [{ columns: folderColumns, rows: folderRows }, { columns: mapColumns, rows: mapRows }] = await Promise.all([
    readTabletopTab(sheet.spreadsheetId, "Dossiers", { fresh: true }),
    readTabletopTab(sheet.spreadsheetId, "Cartes", { fresh: true }),
  ])
  const folderIndex = folderRows.findIndex((row) => row[0] === folderId && row[1] === pageLinked)
  const storedFolder = folderIndex >= 0 ? tabletopFolderFromRow(folderRows[folderIndex]) : null
  const oldName = storedFolder?.name || currentName.trim()
  if (!oldName || normalizedTabletopFolder(oldName) === normalizedTabletopFolder("Sans dossier")) throw new Error("INVALID_TABLETOP_FOLDER")
  const normalizedOldName = normalizedTabletopFolder(oldName)
  const duplicate = folderRows.map(tabletopFolderFromRow).some((folder) => folder?.pageLinked === pageLinked && folder.id !== folderId && normalizedTabletopFolder(folder.name) === normalizedTabletopFolder(cleaned))
    || mapRows.map(tabletopMapFromRow).some((map) => map?.pageLinked === pageLinked && normalizedTabletopFolder(map.folder) !== normalizedOldName && normalizedTabletopFolder(map.folder) === normalizedTabletopFolder(cleaned))
  if (duplicate) throw new Error("TABLETOP_FOLDER_EXISTS")
  const now = new Date().toISOString()
  const updates: Array<{ range: string; values: SheetCell[][] }> = []
  let folder: TabletopFolderRecord
  if (storedFolder) {
    folder = { ...storedFolder, name: cleaned, updatedAt: now }
    updates.push(...canonicalWrites("Dossiers", folderColumns, `C${folderIndex + 2}:F${folderIndex + 2}`, [[folder.name, folder.sortOrder, folder.createdAt, folder.updatedAt]]))
  } else {
    folder = await createTabletopFolder(pageLinked, cleaned)
  }
  mapRows.forEach((row, index) => {
    const map = tabletopMapFromRow(row)
    if (map?.pageLinked === pageLinked && normalizedTabletopFolder(map.folder) === normalizedTabletopFolder(oldName)) {
      updates.push(...canonicalWrites("Cartes", mapColumns, `M${index + 2}:N${index + 2}`, [[now, cleaned]]))
    }
  })
  if (updates.length) await updateRanges(sheet.spreadsheetId, updates)
  return folder
}

export async function deleteTabletopFolder(pageLinked: string, folderId: string, currentName: string) {
  const sheet = await ensureJdrSheet("tabletop")
  const [{ columns: folderColumns, rows: folderRows }, { columns: mapColumns, rows: mapRows }] = await Promise.all([
    readTabletopTab(sheet.spreadsheetId, "Dossiers", { fresh: true }),
    readTabletopTab(sheet.spreadsheetId, "Cartes", { fresh: true }),
  ])
  const folderIndex = folderRows.findIndex((row) => row[0] === folderId && row[1] === pageLinked)
  const storedFolder = folderIndex >= 0 ? tabletopFolderFromRow(folderRows[folderIndex]) : null
  const oldName = storedFolder?.name || currentName.trim()
  if (!oldName || normalizedTabletopFolder(oldName) === normalizedTabletopFolder("Sans dossier")) return false
  const now = new Date().toISOString()
  const updates: Array<{ range: string; values: SheetCell[][] }> = []
  if (folderIndex >= 0) updates.push(...canonicalWrites("Dossiers", folderColumns, `A${folderIndex + 2}:F${folderIndex + 2}`, [["", "", "", "", "", ""]]))
  mapRows.forEach((row, index) => {
    const map = tabletopMapFromRow(row)
    if (map?.pageLinked === pageLinked && normalizedTabletopFolder(map.folder) === normalizedTabletopFolder(oldName)) {
      updates.push(...canonicalWrites("Cartes", mapColumns, `M${index + 2}:N${index + 2}`, [[now, "Sans dossier"]]))
    }
  })
  if (updates.length) await updateRanges(sheet.spreadsheetId, updates)
  return true
}

export async function copyTabletopMapToPage(sourceMapId: string, targetPageLinked: string, createdByUid: string, folder: string, allowedEntityKeys: Set<string>) {
  const source = await getTabletopMap(sourceMapId)
  if (!source) return null
  let copy = await createTabletopMap(targetPageLinked, createdByUid, `${source.name} — copie`, folder || source.folder)
  const backgroundUrl = source.backgroundUrl.startsWith("/api/tabletop/background/") ? "" : source.backgroundUrl
  copy = (await updateTabletopMap(copy.id, { backgroundUrl, width: source.width, height: source.height, gridSize: source.gridSize, distancePerGrid: source.distancePerGrid, distanceUnit: source.distanceUnit })) || copy
  const sourceTokens = await listTabletopTokens(source.id)
  for (const token of sourceTokens) {
    if (token.entityKind !== "marker" && !allowedEntityKeys.has(`${token.entityKind}:${token.entityId}`)) continue
    await addTabletopToken(copy.id, token.entityKind, token.entityKind === "marker" ? crypto.randomUUID() : token.entityId, token.x, token.y, token.label, token.icon, token.scale, token.iconScale, token.color)
  }
  return copy
}

function tabletopTokenFromRow(row: string[]): TabletopTokenRecord | null {
  if (!row[0] || !row[1] || !["npc", "character", "shop", "marker"].includes(row[2]) || !row[3]) return null
  return {
    id: row[0],
    mapId: row[1],
    entityKind: row[2] as TabletopTokenRecord["entityKind"],
    entityId: row[3],
    x: tabletopNumber(row[4], 0, -12000, 24000),
    y: tabletopNumber(row[5], 0, -12000, 24000),
    createdAt: row[6] || "",
    updatedAt: row[7] || "",
    label: row[8] || "",
    icon: row[9] || "",
    scale: tabletopNumber(row[10], 1, 0.35, 3),
    iconScale: tabletopNumber(row[11], 1, 0.45, 2.25),
    color: /^#[0-9a-f]{6}$/i.test(row[12] || "") ? row[12] : "#7f3430",
  }
}

export async function listTabletopTokens(mapId: string) {
  const sheet = await ensureJdrSheet("tabletop")
  const { rows } = await readTabletopTab(sheet.spreadsheetId, "Tokens")
  return rows.map(tabletopTokenFromRow).filter((token): token is TabletopTokenRecord => Boolean(token && token.mapId === mapId))
}

export async function addTabletopToken(mapId: string, entityKind: TabletopTokenRecord["entityKind"], entityId: string, x: number, y: number, label = "", icon = "", scale = 1, iconScale = 1, color = "#7f3430") {
  const sheet = await ensureJdrSheet("tabletop")
  const { columns, rows } = await readTabletopTab(sheet.spreadsheetId, "Tokens", { fresh: true })
  const existing = rows.map(tabletopTokenFromRow).find((token) => token?.mapId === mapId && token.entityKind === entityKind && token.entityId === entityId)
  if (existing) return existing
  const now = new Date().toISOString()
  const token: TabletopTokenRecord = {
    id: crypto.randomUUID(), mapId, entityKind, entityId,
    x: tabletopNumber(x, 800, -12000, 24000), y: tabletopNumber(y, 450, -12000, 24000),
    createdAt: now, updatedAt: now, label: label.trim().slice(0, 120), icon: icon.trim().slice(0, 20),
    scale: tabletopNumber(scale, 1, 0.35, 3), iconScale: tabletopNumber(iconScale, 1, 0.45, 2.25),
    color: /^#[0-9a-f]{6}$/i.test(color) ? color : "#7f3430",
  }
  await appendTabletopRows(sheet.spreadsheetId, "Tokens", [[token.id, token.mapId, token.entityKind, token.entityId, token.x, token.y, token.createdAt, token.updatedAt, token.label, token.icon, token.scale, token.iconScale, token.color]], columns)
  return token
}

export async function moveTabletopToken(mapId: string, tokenId: string, x: number, y: number) {
  const sheet = await ensureJdrSheet("tabletop")
  const { columns, rows } = await readTabletopTab(sheet.spreadsheetId, "Tokens", { fresh: true })
  const index = rows.findIndex((candidate) => candidate[0] === tokenId && candidate[1] === mapId)
  if (index < 0) return null
  const token = tabletopTokenFromRow(rows[index])
  if (!token) return null
  const next = { ...token, x: tabletopNumber(x, token.x, -12000, 24000), y: tabletopNumber(y, token.y, -12000, 24000), updatedAt: new Date().toISOString() }
  await updateRanges(sheet.spreadsheetId, [
    ...canonicalWrites("Tokens", columns, `E${index + 2}:F${index + 2}`, [[next.x, next.y]]),
    ...canonicalWrites("Tokens", columns, `H${index + 2}:H${index + 2}`, [[next.updatedAt]]),
  ])
  return next
}

export async function updateTabletopTokenAppearance(mapId: string, tokenId: string, patch: Partial<Pick<TabletopTokenRecord, "scale" | "iconScale" | "label" | "icon" | "color">>) {
  const sheet = await ensureJdrSheet("tabletop")
  const { columns, rows } = await readTabletopTab(sheet.spreadsheetId, "Tokens", { fresh: true })
  const index = rows.findIndex((candidate) => candidate[0] === tokenId && candidate[1] === mapId)
  if (index < 0) return null
  const token = tabletopTokenFromRow(rows[index])
  if (!token) return null
  const next = {
    ...token,
    scale: patch.scale === undefined ? token.scale : tabletopNumber(patch.scale, token.scale, 0.35, 3),
    iconScale: patch.iconScale === undefined ? token.iconScale : tabletopNumber(patch.iconScale, token.iconScale, 0.45, 2.25),
    label: typeof patch.label === "string" ? patch.label.trim().slice(0, 120) : token.label,
    icon: typeof patch.icon === "string" ? patch.icon.trim().slice(0, 20) || "✦" : token.icon,
    color: typeof patch.color === "string" && /^#[0-9a-f]{6}$/i.test(patch.color) ? patch.color : token.color,
    updatedAt: new Date().toISOString(),
  }
  const updates = canonicalWrites("Tokens", columns, `H${index + 2}:H${index + 2}`, [[next.updatedAt]])
  if (patch.label !== undefined || patch.icon !== undefined) updates.push(...canonicalWrites("Tokens", columns, `I${index + 2}:J${index + 2}`, [[next.label, next.icon]]))
  if (patch.scale !== undefined || patch.iconScale !== undefined) updates.push(...canonicalWrites("Tokens", columns, `K${index + 2}:L${index + 2}`, [[next.scale, next.iconScale]]))
  if (patch.color !== undefined) updates.push(...canonicalWrites("Tokens", columns, `M${index + 2}:M${index + 2}`, [[next.color]]))
  await updateRanges(sheet.spreadsheetId, updates)
  return next
}

export async function updateTabletopTokenStates(mapId: string, patches: Array<{ tokenId: string } & Partial<Pick<TabletopTokenRecord, "x" | "y" | "scale" | "iconScale" | "label" | "icon" | "color">>>) {
  if (!patches.length) return []
  const sheet = await ensureJdrSheet("tabletop")
  const { columns, rows } = await readTabletopTab(sheet.spreadsheetId, "Tokens", { fresh: true })
  const updates: Array<{ range: string; values: SheetCell[][] }> = []
  const saved: TabletopTokenRecord[] = []
  for (const patch of patches) {
    const index = rows.findIndex((candidate) => candidate[0] === patch.tokenId && candidate[1] === mapId)
    if (index < 0) continue
    const token = tabletopTokenFromRow(rows[index])
    if (!token) continue
    const next: TabletopTokenRecord = {
      ...token,
      x: patch.x === undefined ? token.x : tabletopNumber(patch.x, token.x, -12000, 24000),
      y: patch.y === undefined ? token.y : tabletopNumber(patch.y, token.y, -12000, 24000),
      scale: patch.scale === undefined ? token.scale : tabletopNumber(patch.scale, token.scale, 0.35, 3),
      iconScale: patch.iconScale === undefined ? token.iconScale : tabletopNumber(patch.iconScale, token.iconScale, 0.45, 2.25),
      label: typeof patch.label === "string" ? patch.label.trim().slice(0, 120) : token.label,
      icon: typeof patch.icon === "string" ? patch.icon.trim().slice(0, 20) || "✦" : token.icon,
      color: typeof patch.color === "string" && /^#[0-9a-f]{6}$/i.test(patch.color) ? patch.color : token.color,
      updatedAt: new Date().toISOString(),
    }
    const rowNumber = index + 2
    if (patch.x !== undefined || patch.y !== undefined) updates.push(...canonicalWrites("Tokens", columns, `E${rowNumber}:F${rowNumber}`, [[next.x, next.y]]))
    if (patch.label !== undefined || patch.icon !== undefined) updates.push(...canonicalWrites("Tokens", columns, `I${rowNumber}:J${rowNumber}`, [[next.label, next.icon]]))
    if (patch.scale !== undefined || patch.iconScale !== undefined) updates.push(...canonicalWrites("Tokens", columns, `K${rowNumber}:L${rowNumber}`, [[next.scale, next.iconScale]]))
    if (patch.color !== undefined) updates.push(...canonicalWrites("Tokens", columns, `M${rowNumber}:M${rowNumber}`, [[next.color]]))
    updates.push(...canonicalWrites("Tokens", columns, `H${rowNumber}:H${rowNumber}`, [[next.updatedAt]]))
    saved.push(next)
  }
  if (updates.length) await updateRanges(sheet.spreadsheetId, updates)
  return saved
}

export async function removeTabletopToken(mapId: string, tokenId: string) {
  const sheet = await ensureJdrSheet("tabletop")
  const { columns, rows } = await readTabletopTab(sheet.spreadsheetId, "Tokens", { fresh: true })
  const index = rows.findIndex((candidate) => candidate[0] === tokenId && candidate[1] === mapId)
  if (index < 0) return false
  await updateRanges(sheet.spreadsheetId, canonicalWrites("Tokens", columns, `A${index + 2}:M${index + 2}`, [Array(13).fill("")]))
  return true
}

function tabletopActivityFromRow(row: string[]): TabletopActivityRecord | null {
  if (!row[0] || !row[1] || (row[2] !== "chat" && row[2] !== "dice")) return null
  return {
    id: row[0], mapId: row[1], kind: row[2], authorUid: row[3] || "", authorName: row[4] || "Joueur",
    text: row[5] || "", diceExpression: row[6] || "", diceResult: row[7] || "", createdAt: row[8] || "",
    audience: row[9] === "gm" || row[9] === "character" ? row[9] : "public",
    recipientId: row[10] || "",
    recipientName: row[11] || "",
  }
}

export async function listTabletopActivities(mapId: string, limit = 200) {
  const sheet = await ensureJdrSheet("tabletop")
  const { rows } = await readTabletopTab(sheet.spreadsheetId, "Journal")
  return rows.map(tabletopActivityFromRow).filter((activity): activity is TabletopActivityRecord => Boolean(activity && activity.mapId === mapId))
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt)).slice(-Math.max(1, Math.min(500, limit)))
}

export async function saveTabletopActivity(activity: TabletopActivityRecord) {
  const sheet = await ensureJdrSheet("tabletop")
  await appendTabletopRows(sheet.spreadsheetId, "Journal", [[
    activity.id, activity.mapId, activity.kind, activity.authorUid, activity.authorName,
    activity.text, activity.diceExpression, activity.diceResult, activity.createdAt,
    activity.audience, activity.recipientId, activity.recipientName,
  ]])
  return activity
}

/** Une cellule « Classe » de la fiche (« A · B », ou ancien JSON) : les classes séparées par « · ». */
export function formatCharacterClasses(value: string) {
  return displayedMultipleValue(value, "all")
}

/**
 * Classe, rang et portrait de chaque fiche, en une lecture (mise en cache) de la
 * feuille des personnages. Le portrait est la cellule « Portrait » : un lien
 * d'image ou l'adresse d'un portrait envoyé dans Eraser.
 */
export async function characterSheetSummaries() {
  const source = await charactersSource()
  const summaries = new Map<string, { classes: string; level: string; portrait: string; title: string }>()
  if (!source) return summaries
  const { columns, rows } = await readCharacterColumns(source, ["Classe", "Level", "Portrait", "Titre honorifique"])
  for (const row of rows) {
    const id = columns.get(row, "ID")
    if (!id) continue
    // Le titre honorifique choisi, lisible (la cellule garde la liste en JSON).
    summaries.set(id, { classes: formatCharacterClasses(columns.get(row, "Classe")), level: columns.get(row, "Level").trim(), portrait: columns.get(row, "Portrait").trim(), title: displayedMultipleValue(columns.get(row, "Titre honorifique"), "selected") })
  }
  return summaries
}

/** Ajoute classes et rang aux personnages ; en cas d'échec de lecture, la liste reste utilisable. */
export async function withCharacterClasses<T extends CharacterRecord>(characters: T[]): Promise<T[]> {
  if (!characters.length) return characters
  const summaries = await characterSheetSummaries().catch((error) => {
    console.error("CHARACTER_CLASSES_READ_FAILED", error instanceof Error ? error.message : "UNKNOWN_ERROR")
    return null
  })
  if (!summaries) return characters
  return characters.map((character) => {
    const summary = summaries.get(character.id)
    return summary ? { ...character, classes: summary.classes, level: summary.level } : character
  })
}

export async function listTabletopCharacterEntitiesByIds(ids: string[]) {
  const selected = new Set(ids)
  if (!selected.size) return []
  const source = await charactersSource()
  if (!source) return []
  const { columns, rows } = await readCharacterColumns(source, ["Joueur", "Nom personnage", "Peuple", "Classe", "Vie actuelle", "Vie totale", "Rapidité", "Portrait"])
  return rows.flatMap<TabletopEntityRecord>((row) => {
    const cell = (name: string) => columns.get(row, name)
    const id = cell("ID")
    if (!selected.has(id)) return []
    return [{
      id,
      kind: "character",
      name: cell("Nom personnage") || "Personnage sans nom",
      // Classe et peuple sont parfois des listes (JSON) : lisibles, jamais « ["…"] ».
      subtitle: [formatCharacterClasses(cell("Classe")), displayedMultipleValue(cell("Peuple"), "all")].filter(Boolean).join(" · "),
      portrait: cell("Portrait") || `/api/characters/portrait/${encodeURIComponent(id)}`,
      currentHp: tabletopNumber(cell("Vie actuelle"), 0, 0, 99999),
      totalHp: tabletopNumber(cell("Vie totale"), 0, 0, 99999),
      speed: tabletopNumber(cell("Rapidité"), 0, 0, 99999),
      ownerUid: cell("Joueur"),
    }]
  })
}

export async function listTabletopNpcEntitiesByIds(ids: string[], pageLinked = "bac-a-sable") {
  const selected = new Set(ids)
  if (!selected.size) return []
  const npcs = await listNpcs(pageLinked)
  return npcs.filter((npc) => selected.has(npc.id)).map<TabletopEntityRecord>((npc) => ({
    id: npc.id,
    kind: "npc",
    name: npc.name,
    subtitle: "PNJ",
    portrait: npc.portrait,
    currentHp: npc.currentHp,
    totalHp: npc.totalHp,
    speed: 0,
    ownerUid: npc.createdByUid,
  }))
}

export type CharacterRelationRecord = {
  id: string
  characterId: string
  targetKind: "npc" | "character"
  targetId: string
  name: string
  level: number
  personalNotes: string
  createdByUid: string
  campaignId: string
  createdAt: string
  updatedAt: string
}

function characterRelationFromRow(row: readonly (string | undefined)[], columns: SheetColumns): CharacterRelationRecord | null {
  const cell = (name: string) => columns.get(row, name)
  if (!cell("ID") || !cell("ID personnage") || !cell("ID cible")) return null
  return {
    id: cell("ID"), characterId: cell("ID personnage"), targetKind: cell("Type de cible") === "character" ? "character" : "npc",
    targetId: cell("ID cible"), name: cell("Nom") || "Relation sans nom", level: Math.max(-3, Math.min(3, Math.trunc(Number(cell("Niveau")) || 0))),
    personalNotes: cell("Notes personnelles"), createdByUid: cell("Créé par"), campaignId: cell("ID campagne"),
    createdAt: cell("Créée le"), updatedAt: cell("Modifiée le"),
  }
}

async function readRelationSheet(options: { fresh?: boolean } = {}) {
  const sheet = await ensureJdrSheet("character_relations")
  if (!sheet) throw new Error("CHARACTER_RELATIONS_SHEET_UNAVAILABLE")
  return { sheet, ...await readNamedSheet(sheet.spreadsheetId, sheet.tabName, characterRelationHeaders, { fresh: options.fresh }) }
}

export async function listCharacterRelations(characterId: string) {
  const { columns, rows } = await readRelationSheet()
  return rows.map((row) => characterRelationFromRow(row, columns)).filter((relation): relation is CharacterRelationRecord => Boolean(relation && relation.characterId === characterId))
}

export async function getCharacterRelationById(characterId: string, relationId: string) {
  return (await listCharacterRelations(characterId)).find((relation) => relation.id === relationId) ?? null
}

export async function saveCharacterRelation(input: Omit<CharacterRelationRecord, "createdAt" | "updatedAt"> & Partial<Pick<CharacterRelationRecord, "createdAt" | "updatedAt">>) {
  const read = await readRelationSheet({ fresh: true })
  const { sheet, rows } = read
  const columns = await ensureNamedColumns(sheet.spreadsheetId, sheet.tabName, read.columns)
  const existingIndex = rows.findIndex((row) => columns.get(row, "ID") === input.id && columns.get(row, "ID personnage") === input.characterId)
  const current = existingIndex >= 0 ? characterRelationFromRow(rows[existingIndex], columns) : null
  const now = new Date().toISOString()
  const cells: Record<string, SheetCell> = {
    "ID": input.id, "ID personnage": input.characterId, "Type de cible": input.targetKind, "ID cible": input.targetId, "Nom": input.name,
    "Niveau": Math.max(-3, Math.min(3, Math.trunc(input.level))), "Notes personnelles": input.personalNotes, "Créé par": input.createdByUid,
    "ID campagne": input.campaignId, "Créée le": current?.createdAt || input.createdAt || now, "Modifiée le": now,
  }
  if (existingIndex >= 0) await updateRanges(sheet.spreadsheetId, namedRowWrites(sheet.tabName, columns, existingIndex + 2, cells))
  else await appendRows(sheet.spreadsheetId, namedAppendRange(sheet.tabName, columns), [columns.row(cells)])
  return characterRelationFromRow(columns.row(cells).map(String), columns)
}

export async function deleteCharacterRelation(characterId: string, relationId: string) {
  const { sheet, columns, rows } = await readRelationSheet({ fresh: true })
  const index = rows.findIndex((row) => columns.get(row, "ID") === relationId && columns.get(row, "ID personnage") === characterId)
  if (index >= 0) await updateRange(sheet.spreadsheetId, namedRowRange(sheet.tabName, columns, index + 2), [columns.blank()])
}

async function getCampaignDashboardUncached(mjUid: string | null, id: string) {
  if (mjUid) return getCampaignForMj(mjUid, id)
  const read = async () => (await getDb().select({ id: campaignIndex.id, mjUid: campaignIndex.mjUid, name: campaignIndex.name, description: campaignIndex.description, bannerUrl: campaignIndex.bannerUrl, accentColor: campaignIndex.accentColor, updatedAt: campaignIndex.updatedAt })
    .from(campaignIndex).where(and(eq(campaignIndex.id, id), isNull(campaignIndex.deletedAt))).limit(1))[0] ?? null
  const campaign = await read()
  if (campaign) return campaign
  await ensureIdentityIndexes()
  return read()
}

export const getCampaignDashboard = cache(getCampaignDashboardUncached)

// In remote-accounts mode the local `users` table is empty — every real
// account lives on the shared accounts Worker instead (see
// accounts-remote.ts). Anything that used to join/look accounts up locally
// has to go through listAccounts()/this helper instead, or it silently
// treats every account as nonexistent.
async function accountLookup(sessionToken?: string) {
  const remote = remoteAccountsConfig(runtimeEnv())
  if (remote) {
    // Sans session, le serveur partagé refuse la liste : rien à attendre.
    if (!sessionToken) return new Map<string, { displayName: string; email: string }>()
    const accounts = await listAccounts(sessionToken).catch(() => [])
    return new Map(accounts.map((account) => [account.uid, { displayName: account.displayName, email: account.email }]))
  }
  const rows = await getDb().select({ id: users.id, displayName: users.displayName, email: users.email }).from(users)
  return new Map(rows.map((row) => [row.id, { displayName: row.displayName, email: row.email }]))
}

export async function listAllCharactersForAdmin(sessionToken?: string) {
  // Comme pour les joueurs : la liste connue s'affiche, la relecture des feuilles se fait derrière.
  await refreshIdentityIndexes()
  const [rows, owners] = await Promise.all([
    getDb().select({ character: characterIndex }).from(characterIndex)
      .where(isNull(characterIndex.deletedAt)).orderBy(characterIndex.name).limit(500),
    accountLookup(sessionToken),
  ])
  const decorated = await withCharacterClasses(await decorateCharacters(listedInSheets("characters", rows.map((row) => row.character))))
  return decorated.map((character) => ({ ...character, ...ownerLabels(character.ownerUid, owners) }))
}

/** Les noms (et adresses) de tous les propriétaires d'une case « Joueur » ou « MJ ». */
function ownerLabels(cell: string, accounts: Map<string, { displayName?: string; email?: string }>) {
  const uids = ownersOf(cell)
  if (!uids.length) return { ownerName: "Sans propriétaire", ownerEmail: "", ownerUids: uids }
  const found = uids.map((uid) => accounts.get(uid))
  return {
    ownerName: found.map((account) => account?.displayName || account?.email || "Identifiant historique").join(" & "),
    ownerEmail: found.map((account) => account?.email || "").filter(Boolean).join(", "),
    ownerUids: uids,
  }
}

export async function listAllCampaignsForAdmin(sessionToken?: string) {
  await refreshIdentityIndexes()
  const [rows, owners, links] = await Promise.all([
    getDb().select({ campaign: campaignIndex }).from(campaignIndex)
      .where(isNull(campaignIndex.deletedAt)).orderBy(campaignIndex.name).limit(500),
    accountLookup(sessionToken),
    getDb().select({ campaignId: campaignCharacters.campaignId, characterId: characterIndex.id, characterName: characterIndex.name })
      .from(campaignCharacters).innerJoin(characterIndex, eq(campaignCharacters.characterId, characterIndex.id))
      .where(isNull(characterIndex.deletedAt)),
  ])
  const listed = new Set(listedInSheets("campaigns", rows.map((row) => row.campaign)))
  return rows.filter((row) => listed.has(row.campaign)).map((row) => {
    return {
      ...row.campaign,
      ...ownerLabels(row.campaign.mjUid, owners),
      characters: links.filter((link) => link.campaignId === row.campaign.id).map((link) => ({ id: link.characterId, name: link.characterName })),
    }
  })
}

/**
 * Les propriétaires d'un personnage (« Joueur ») ou d'une campagne (« MJ ») : un ou
 * plusieurs comptes, écrits « uid1 · uid2 » dans la feuille. La ligne et ses propriétaires
 * actuels sont lus dans la feuille elle-même, d'une seule lecture : l'index local peut ne
 * pas la connaître. Un identifiant historique déjà présent peut rester ; tout nouveau
 * propriétaire doit être un compte existant.
 */
export async function updateAdminItemOwner(
  kind: "character" | "campaign",
  id: string,
  ownerUids: readonly string[],
  sessionToken?: string,
) {
  const wanted = [...new Set(ownerUids.map((uid) => uid.trim()).filter(Boolean))]
  const source = kind === "character" ? await charactersSource() : await campaignsSource()
  if (!source) throw new Error(kind === "character" ? "CHARACTERS_SHEET_NOT_FOUND" : "CAMPAIGNS_SHEET_NOT_FOUND")
  const header = kind === "character" ? "Joueur" : "MJ"
  const sheet = kind === "character"
    ? await readCharacterColumns(source, [header], { fresh: true })
    : await readNamedSheet(source.spreadsheetId, source.tabName, campaignSheetHeaders, { fresh: true })
  const index = sheet.rows.findIndex((row) => sheet.columns.get(row, "ID").trim() === id)
  if (index < 0) throw new Error(kind === "character" ? "CHARACTER_SHEET_ROW_NOT_FOUND" : "CAMPAIGN_SHEET_ROW_NOT_FOUND")
  const kept = new Set(ownersOf(sheet.columns.get(sheet.rows[index], header)))
  const added = wanted.filter((uid) => !kept.has(uid))
  if (added.length) {
    const accounts = await accountLookup(sessionToken)
    if (added.some((uid) => !accounts.has(uid))) throw new Error("OWNER_NOT_FOUND")
  }
  const cell = ownersCell(wanted)
  await updateRanges(source.spreadsheetId, namedRowWrites(source.tabName, sheet.columns, index + 2, { [header]: cell }))
  await ensureIndexedFromSheet(kind, id)
  const db = getDb()
  if (kind === "character") await db.update(characterIndex).set({ ownerUid: cell, updatedAt: new Date().toISOString() }).where(eq(characterIndex.id, id))
  else await db.update(campaignIndex).set({ mjUid: cell, updatedAt: new Date().toISOString() }).where(eq(campaignIndex.id, id))
}

export async function updateCampaignForMj(mjUid: string | null, id: string, patch: Partial<Pick<CampaignRecord, "name" | "description" | "bannerUrl" | "accentColor">>) {
  const existing = mjUid
    ? await getCampaignForMj(mjUid, id)
    : (await getDb().select({ id: campaignIndex.id, mjUid: campaignIndex.mjUid, name: campaignIndex.name, description: campaignIndex.description, bannerUrl: campaignIndex.bannerUrl, accentColor: campaignIndex.accentColor, updatedAt: campaignIndex.updatedAt }).from(campaignIndex).where(and(eq(campaignIndex.id, id), isNull(campaignIndex.deletedAt))).limit(1))[0] ?? null
  if (!existing) throw new Error("CAMPAIGN_NOT_FOUND")
  const updatedAt = new Date().toISOString()
  const next = {
    ...existing,
    ...patch,
    name: patch.name?.trim() || existing.name,
    accentColor: patch.accentColor && /^#[0-9a-f]{6}$/i.test(patch.accentColor) ? patch.accentColor : existing.accentColor,
    updatedAt,
  }
  await getDb().update(campaignIndex).set({ name: next.name, description: next.description, bannerUrl: next.bannerUrl, accentColor: next.accentColor, updatedAt }).where(eq(campaignIndex.id, id))
  const source = await campaignsSource()
  if (source) {
    const rowNumber = await findSheetRowById(source.spreadsheetId, source.tabName, id)
    if (rowNumber) {
      const read = await readNamedSheet(source.spreadsheetId, source.tabName, campaignSheetHeaders, { fresh: true })
      const columns = await ensureNamedColumns(source.spreadsheetId, source.tabName, read.columns)
      await updateRanges(source.spreadsheetId, namedRowWrites(source.tabName, columns, rowNumber, campaignCells({ ...next, id })))
    }
  }
  return next
}

/**
 * Ce que les fiches de personnage disent du jeu, pour les statistiques : classes,
 * rang, sorts choisis et charges (colonne « Sorts de classe choisis JSON »), et
 * campagnes. Les personnages à la corbeille sont exclus.
 */
export type CharacterPlayRow = { id: string; name: string; classes: string; level: number; choices: string; campaignIds: string[] }

export async function listCharacterPlayRows(): Promise<CharacterPlayRow[]> {
  await refreshIdentityIndexes()
  const source = await charactersSource()
  if (!source) return []
  const choicesHeader = characterValueHeaders[characterClassChoicesIndex]
  const { columns, rows: characterRows } = await readCharacterColumns(source, ["Nom personnage", "Classe", "Level", choicesHeader])
  const db = getDb()
  const [active, links] = await Promise.all([
    db.select({ id: characterIndex.id }).from(characterIndex).where(isNull(characterIndex.deletedAt)),
    db.select({ campaignId: campaignCharacters.campaignId, characterId: campaignCharacters.characterId }).from(campaignCharacters)
      .innerJoin(campaignIndex, eq(campaignCharacters.campaignId, campaignIndex.id)).where(isNull(campaignIndex.deletedAt)),
  ])
  const activeIds = new Set(active.map((row) => row.id))
  return characterRows.flatMap((row): CharacterPlayRow[] => {
    const id = columns.get(row, "ID").trim()
    if (!id || !activeIds.has(id)) return []
    return [{
      id,
      name: columns.get(row, "Nom personnage") || "Personnage sans nom",
      classes: columns.get(row, "Classe"),
      level: Math.max(0, Math.min(20, Math.trunc(Number(columns.get(row, "Level")) || 0))),
      choices: columns.get(row, choicesHeader),
      campaignIds: links.filter((link) => link.characterId === id).map((link) => link.campaignId),
    }]
  })
}

export async function listCampaignMembers(campaignId: string) {
  await refreshIdentityIndexes()
  const read = () => getDb().select().from(characterIndex)
    .innerJoin(campaignCharacters, eq(characterIndex.id, campaignCharacters.characterId))
    .where(and(eq(campaignCharacters.campaignId, campaignId), isNull(characterIndex.deletedAt)))
    .orderBy(characterIndex.name)
  let rows = await read()
  if (!rows.length) {
    await ensureIdentityIndexes()
    rows = await read()
  }
  const characters = await decorateCharacters(rows.map((row) => row.character_index))
  if (!characters.length) return []
  const fallback = () => characters.map((character) => ({ ...character, people: character.subtitle, classes: "", level: "", honoraryTitle: "" }))
  const source = await charactersSource()
  if (!source) return fallback()
  // This enrichment (class/level/title columns) is best-effort: the caller
  // already has the D1-backed member list above, which is the part that
  // must not fail. A transient Sheets read failure here used to throw and
  // make the whole operation look like it failed (e.g. addCharacterToCampaign
  // reporting an error even though the character had already been added).
  let sheet: NamedSheet
  try {
    sheet = await readCharacterColumns(source, ["Nom personnage", "Peuple", "Classe", "Level", "Titre honorifique"])
  } catch (error) {
    console.error("CAMPAIGN_MEMBERS_ENRICHMENT_FAILED", error instanceof Error ? error.message : "UNKNOWN_ERROR")
    return fallback()
  }
  const { columns } = sheet
  const rowsById = new Map(sheet.rows.flatMap((row) => columns.get(row, "ID") ? [[columns.get(row, "ID"), row] as const] : []))
  return characters.map<CampaignMemberRecord>((character) => {
    const row = rowsById.get(character.id)
    return {
      ...character,
      name: (row && columns.get(row, "Nom personnage")) || character.name,
      people: (row && columns.get(row, "Peuple")) || character.subtitle,
      classes: row ? columns.get(row, "Classe") : "",
      level: row ? columns.get(row, "Level") : "",
      honoraryTitle: row ? columns.get(row, "Titre honorifique") : "",
    }
  })
}

export async function listInventoryTransferTargets(
  campaignId: string,
  excludedOwnerId = "",
  playerVisibility?: { uid: string; relatedNpcIds: Set<string> },
): Promise<InventoryTransferTarget[]> {
  const [campaign, characters, npcs] = await Promise.all([
    getCampaignDashboard(null, campaignId),
    listCampaignMembers(campaignId),
    listNpcs(campaignId),
  ])
  if (!campaign) return []
  const campaignOwnerId = campaignInventoryOwnerId(campaignId)
  const visibleNpcs = playerVisibility
    ? npcs.filter((npc) => npc.inCampaign || npc.inPlayerGroup || npc.createdByUid === playerVisibility.uid || playerVisibility.relatedNpcIds.has(npc.id))
    : npcs
  return [
    ...(campaignOwnerId === excludedOwnerId ? [] : [{ id: campaignOwnerId, name: "Inventaire de campagne", kind: "campaign" as const, campaignId, campaignName: campaign.name }]),
    ...characters.filter((character) => character.id !== excludedOwnerId).map((character) => ({ id: character.id, name: character.name, kind: "character" as const, campaignId, campaignName: campaign.name })),
    ...visibleNpcs.filter((npc) => npc.id !== excludedOwnerId).map((npc) => ({ id: npc.id, name: npc.name, kind: "npc" as const, campaignId, campaignName: campaign.name })),
  ]
}

export async function listAvailableCampaignCharacters() {
  // Le MJ ouvre la liste pour y trouver un personnage qui vient souvent d'être
  // créé ailleurs : on relit les feuilles partagées à chaque ouverture (sauf
  // si une relecture date de quelques secondes).
  await ensureIdentityIndexes({ maxAgeMs: 5_000 })
  const rows = await getDb().select().from(characterIndex).where(isNull(characterIndex.deletedAt)).orderBy(characterIndex.name).limit(500)
  return decorateCharacters(listedInSheets("characters", rows))
}

export async function addCharacterToCampaign(mjUid: string | null, campaignId: string, characterId: string, duplicate: boolean) {
  const campaign = await getCampaignDashboard(mjUid, campaignId)
  if (!campaign) throw new Error("CAMPAIGN_NOT_FOUND")
  const readSource = async () => (await getDb().select().from(characterIndex)
    .where(and(eq(characterIndex.id, characterId), isNull(characterIndex.deletedAt))).limit(1))[0]
  let sourceCharacter = await readSource()
  if (!sourceCharacter) {
    await ensureIdentityIndexes()
    sourceCharacter = await readSource()
  }
  if (!sourceCharacter) throw new Error("CHARACTER_NOT_FOUND")
  let targetId = characterId
  if (duplicate) {
    targetId = crypto.randomUUID()
    const sheet = await ensureJdrSheet("characters")
    if (!sheet) throw new Error("CHARACTERS_SHEET_UNAVAILABLE")
    await ensureCharacterSheetSchema(sheet.spreadsheetId, sheet.tabName)
    const { map } = await characterColumns(sheet.spreadsheetId, sheet.tabName)
    const sourceRowNumber = await findSheetRowById(sheet.spreadsheetId, sheet.tabName, characterId)
    if (!sourceRowNumber) throw new Error("CHARACTER_SHEET_ROW_NOT_FOUND")
    const [sourceRow] = await readRange(sheet.spreadsheetId, sheetTabRange(sheet.tabName, `A${sourceRowNumber}:${columnName(map.width)}${sourceRowNumber}`))
    if (!sourceRow) throw new Error("CHARACTER_SHEET_ROW_NOT_FOUND")
    const copiedRow: SheetCell[] = Array.from({ length: map.width }, (_, index) => sourceRow[index] ?? "")
    copiedRow[map.columns.at("ID")] = targetId
    await appendRows(sheet.spreadsheetId, sheetTabRange(sheet.tabName, `A:${columnName(map.width)}`), [copiedRow])
    await getDb().insert(characterIndex).values({ ...sourceCharacter, id: targetId, updatedAt: new Date().toISOString(), deletedAt: null })
  }
  // On tente d'abord la feuille partagée, mais son échec ne doit plus bloquer
  // l'ajout : la version précédente écrivait l'index local d'abord et
  // affichait quand même une erreur (personnage présent après actualisation),
  // la suivante refusait tout. Ici le lien est toujours créé, et l'app dit
  // franchement quand il n'a pas encore pu être partagé.
  const shared = await writeCampaignRelation(campaignId, targetId)
  await getDb().insert(campaignCharacters).values({ campaignId, characterId: targetId }).onConflictDoNothing()
  const fallbackMember = {
    id: targetId,
    ownerUid: sourceCharacter.ownerUid,
    name: sourceCharacter.name,
    subtitle: sourceCharacter.subtitle,
    updatedAt: sourceCharacter.updatedAt,
    campaigns: [{ id: campaign.id, name: campaign.name, accentColor: campaign.accentColor }],
    people: sourceCharacter.subtitle,
    classes: "",
    level: "",
    honoraryTitle: "",
  } satisfies CampaignMemberRecord
  let member = fallbackMember
  try {
    member = (await listCampaignMembers(campaignId)).find((character) => character.id === targetId) ?? fallbackMember
  } catch (error) {
    console.error("CAMPAIGN_MEMBER_RELOAD_FAILED", error instanceof Error ? error.message : "UNKNOWN_ERROR")
  }
  return { member, sharedError: shared }
}

// Renvoie null si la ligne est bien dans la feuille partagée, sinon le code
// d'erreur Google, que l'appelant remonte tel quel à l'administrateur.
async function writeCampaignRelation(campaignId: string, characterId: string) {
  try {
    const relationSheet = await ensureJdrSheet("campaign_characters")
    if (!relationSheet) return "CAMPAIGN_CHARACTERS_SHEET_UNAVAILABLE"
    const read = await readNamedSheet(relationSheet.spreadsheetId, relationSheet.tabName, campaignCharacterHeaders, { fresh: true })
    if (read.rows.some((row) => read.columns.get(row, "ID campagne") === campaignId && read.columns.get(row, "ID personnage") === characterId)) return null
    const columns = await ensureNamedColumns(relationSheet.spreadsheetId, relationSheet.tabName, read.columns)
    await appendRows(relationSheet.spreadsheetId, namedAppendRange(relationSheet.tabName, columns), [columns.row({ "ID campagne": campaignId, "ID personnage": characterId })])
    return null
  } catch (error) {
    const code = error instanceof Error ? error.message : "UNKNOWN_ERROR"
    console.error("CAMPAIGN_RELATION_WRITE_FAILED", code)
    return code
  }
}

export async function removeCharacterFromCampaign(mjUid: string | null, campaignId: string, characterId: string) {
  const campaign = await getCampaignDashboard(mjUid, campaignId)
  if (!campaign) throw new Error("CAMPAIGN_NOT_FOUND")
  // La feuille partagée fait foi : si on ne retirait la ligne que de l'index
  // local, la prochaine resynchronisation la réimporterait aussitôt. Le retrait
  // local a quand même lieu si la feuille est injoignable, avec un avertissement.
  let sharedError: string | null = null
  try {
    const relationSheet = await ensureJdrSheet("campaign_characters")
    if (!relationSheet) throw new Error("CAMPAIGN_CHARACTERS_SHEET_UNAVAILABLE")
    const { columns, rows } = await readNamedSheet(relationSheet.spreadsheetId, relationSheet.tabName, campaignCharacterHeaders, { fresh: true })
    const cleared = rows.flatMap((row, index) => columns.get(row, "ID campagne") === campaignId && columns.get(row, "ID personnage") === characterId
      ? namedRowWrites(relationSheet.tabName, columns, index + 2, { "ID campagne": "", "ID personnage": "" })
      : [])
    await updateRanges(relationSheet.spreadsheetId, cleared)
  } catch (error) {
    sharedError = error instanceof Error ? error.message : "UNKNOWN_ERROR"
    console.error("CAMPAIGN_RELATION_REMOVE_FAILED", sharedError)
  }
  await getDb().delete(campaignCharacters)
    .where(and(eq(campaignCharacters.campaignId, campaignId), eq(campaignCharacters.characterId, characterId)))
  return { id: characterId, sharedError }
}

export async function createCharacterForUser(uid: string, input: string[], id: string = crypto.randomUUID()) {
  const name = String(input[0] ?? "").trim()
  if (!name || name.length > 120) throw new Error("INVALID_CHARACTER_NAME")
  const sheet = await ensureJdrSheet("characters")
  if (!sheet) throw new Error("CHARACTERS_SHEET_UNAVAILABLE")
  await ensureCharacterSheetSchema(sheet.spreadsheetId, sheet.tabName)
  const { map, layout, catalog } = await characterColumns(sheet.spreadsheetId, sheet.tabName)
  const width = layout.headers.length
  const values = Array.from({ length: width }, (_, index) => String(input[index] ?? ""))
  // Les valeurs de départ viennent de l'Index des caractéristiques et compétences
  // (seuils critiques 96 et 5, compteurs à 0… dans la liste d'origine).
  applyCharacteristicDefaults(values, layout, catalog)
  await appendRows(sheet.spreadsheetId, sheetTabRange(sheet.tabName, `A:${columnName(map.width)}`), [characterSheetRow(map, id, uid, values)])
  const rowNumber = await findSheetRowById(sheet.spreadsheetId, sheet.tabName, id)
  if (rowNumber) {
    const prepared = applyCharacterDefaultsAndFormulas(values, rowNumber, layout, catalog)
    await writeCharacterValues(sheet, map, rowNumber, prepared, catalog)
  }
  await getDb().insert(characterIndex).values({
    id, ownerUid: uid, name, subtitle: displayedMultipleValue(values[1] || "", "all"), updatedAt: new Date().toISOString(),
  }).onConflictDoUpdate({
    target: characterIndex.id,
    set: { name, subtitle: displayedMultipleValue(values[1] || "", "all"), updatedAt: new Date().toISOString() },
  })
  return { id, name }
}

/** Anciens noms de compétences d'origine : leur en-tête est réécrit sur place sous le nom actuel. */
const characterSkillAliases: Record<string, string> = {
  "Maîtrise des armes d’assaut": "Maîtrise des armes d’aste",
  "Volonté physique": "Volonté psychique",
  "Résistance au traumatisme": "Résistance aux traumatismes",
  "Dépeçage": "Dépistage",
  "Conduite / Monture": "Conduite monture",
  "Navigation": "Navigation / Canotage",
  "Connaissances historiques / géographiques": "Connaissance historique / géographique",
  "Connaissances des sciences": "Connaissance des sciences",
  "Arts du spectacle": "Art du spectacle",
  "Marchandage": "Marchandage / Persuasion",
  "Persuasion": "Marchandage / Persuasion",
}

const characterSchemaReady = new Set<string>()

/**
 * Les en-têtes de la feuille des personnages, vérifiés par leur nom : une compétence
 * renommée par Eraser voit son ancien en-tête réécrit sur place (ses valeurs ne bougent
 * pas), les colonnes absentes sont ajoutées à droite. Aucune ligne n'est déplacée ni
 * réécrite : les colonnes peuvent être rangées dans Sheets dans n'importe quel ordre.
 */
async function ensureCharacterSheetSchema(spreadsheetId: string, tabName: string) {
  const syncKey = `character-schema:v5:${characterSheetHeaders.length}`
  if (characterSchemaReady.has(`${spreadsheetId}:${syncKey}`)) return
  const [alreadySynced] = await getDb().select().from(sheetIndexSyncs).where(eq(sheetIndexSyncs.key, syncKey)).limit(1)
  if (!alreadySynced) {
    clearSpreadsheetReadCache(spreadsheetId)
    const [headerRow = []] = await readRange(spreadsheetId, sheetTabRange(tabName, "1:1"))
    const headers = headerRow.map((header) => String(header ?? "").trim())
    const present = new Set(headers.map(foldSheetHeader))
    const renames: Array<{ index: number; header: string }> = []
    for (const header of characterSheetHeaders) {
      if (present.has(foldSheetHeader(header))) continue
      const separator = header.indexOf(" — ")
      const skillName = separator > 0 ? header.slice(0, separator) : header
      const aliased = characterSkillAliases[skillName]
      if (!aliased) continue
      const legacy = foldSheetHeader(separator > 0 ? `${aliased}${header.slice(separator)}` : aliased)
      const index = headers.findIndex((candidate) => foldSheetHeader(candidate) === legacy)
      if (index < 0) continue
      renames.push({ index, header })
      headers[index] = header
      present.add(foldSheetHeader(header))
    }
    if (renames.length) {
      await updateRanges(spreadsheetId, renames.map((item) => ({ range: sheetTabRange(tabName, `${columnName(item.index + 1)}1`), values: [[item.header]] })), { valueInputOption: "RAW" })
      console.info("CHARACTER_HEADERS_RENAMED", renames.map((item) => item.header).join(" | "))
    }
    await ensureNamedColumns(spreadsheetId, tabName, sheetColumns(headers, characterSheetHeaders, characterSheetAliases))
    await getDb().insert(sheetIndexSyncs).values({ key: syncKey }).onConflictDoNothing()
  }
  characterSchemaReady.add(`${spreadsheetId}:${syncKey}`)
}

/** Les écritures de cases d'une ligne, par morceaux contigus. */
function cellRuns(tabName: string, rowNumber: number, cells: Map<number, SheetCell>) {
  const runs: Array<{ start: number; values: SheetCell[] }> = []
  for (const [index, value] of [...cells.entries()].sort((left, right) => left[0] - right[0])) {
    const last = runs[runs.length - 1]
    if (last && last.start + last.values.length === index) last.values.push(value)
    else runs.push({ start: index, values: [value] })
  }
  return runs.map((run) => ({ range: sheetTabRange(tabName, `${columnName(run.start + 1)}${rowNumber}:${columnName(run.start + run.values.length)}${rowNumber}`), values: [run.values] }))
}

/** Les valeurs d'une fiche, lues dans la feuille et rangées dans l'ordre de la fiche. */
async function readCharacterValues(source: { spreadsheetId: string; tabName: string }, map: CharacterSheetMap, rowNumber: number) {
  const [row = []] = await readRange(source.spreadsheetId, sheetTabRange(source.tabName, `A${rowNumber}:${columnName(map.width)}${rowNumber}`))
  return characterValuesOf(map, row)
}

/**
 * Écrit les valeurs d'une fiche, chacune dans sa colonne. Index des caractéristiques
 * injoignable : les colonnes ajoutées par l'index ne sont pas réécrites (leurs formules
 * ne sont pas connues sans lui). `returnValues` : rend les valeurs recalculées par Sheets.
 */
async function writeCharacterValues(source: { spreadsheetId: string; tabName: string }, map: CharacterSheetMap, rowNumber: number, values: readonly string[], catalog: CharacterCatalog, options: { returnValues?: boolean } = {}) {
  const width = Math.min(values.length, map.valueColumns.length)
  const writeWidth = catalog.source === "index" ? width : Math.min(width, characterValueHeaders.length)
  if (map.contiguous && map.writable.slice(0, writeWidth).every(Boolean)) {
    const range = sheetTabRange(source.tabName, `C${rowNumber}:${columnName(writeWidth + 2)}${rowNumber}`)
    if (!options.returnValues) {
      await updateRange(source.spreadsheetId, range, [values.slice(0, writeWidth)])
      return null
    }
    const [calculated = []] = await updateRangeAndReturnValues(source.spreadsheetId, range, [values.slice(0, writeWidth)])
    if (calculated.length && writeWidth >= map.valueColumns.length) {
      const output = calculated.slice(0, map.valueColumns.length).map(String)
      while (output.length < map.valueColumns.length) output.push("")
      return output
    }
    return readCharacterValues(source, map, rowNumber)
  }
  const cells = new Map<number, SheetCell>()
  for (let index = 0; index < writeWidth; index += 1) {
    const column = map.valueColumns[index] ?? -1
    if (column >= 0 && map.writable[index]) cells.set(column, values[index] ?? "")
  }
  const data = cellRuns(source.tabName, rowNumber, cells)
  for (let start = 0; start < data.length; start += 200) await updateRanges(source.spreadsheetId, data.slice(start, start + 200))
  return options.returnValues ? readCharacterValues(source, map, rowNumber) : null
}

function isGoogleSheetsCalculationError(value: GoogleSheetCellValue) {
  return /^#(?:REF|VALUE|N\/A|NAME|DIV\/0|NUM|ERROR|NULL)/i.test(String(value ?? "").trim())
}

function applyCharacterDefaultsAndFormulas(input: string[], rowNumber: number, layout: CharacterLayout, catalog: CharacterCatalog) {
  const width = Math.max(layout.headers.length, characterValueHeaders.length)
  const values = input.slice(0, width)
  while (values.length < width) values.push("")
  const cellOf = layout.cell ?? characterValueCell
  characterSecondaryCalculatedFields.forEach((field, fieldIndex) => {
    const bonusIndex = characterSecondaryCalculationValueIndex(fieldIndex, "bonus")
    const modifierIndex = characterSecondaryCalculationValueIndex(fieldIndex, "modifier")
    if (!values[bonusIndex] || isGoogleSheetsCalculationError(values[bonusIndex])) values[bonusIndex] = isGoogleSheetsCalculationError(values[field.valueIndex]) ? "0" : values[field.valueIndex] || "0"
    values[modifierIndex] = "=0"
    values[field.valueIndex] = `=${cellOf(bonusIndex, rowNumber)}+${cellOf(modifierIndex, rowNumber)}`
  })
  return applySkillCells(values, rowNumber, layout, catalog)
}

/**
 * Les colonnes de la feuille de personnage pour le catalogue actuel. Une caractéristique
 * ou une compétence ajoutée à son index reçoit ses colonnes à la suite des autres (jamais
 * au milieu : aucune colonne existante ne bouge), puis chaque fiche existante y reçoit
 * sa valeur de départ et ses formules. Une ligne d'index renommée renomme seulement
 * l'en-tête de ses colonnes.
 */
// Une minute : une colonne déplacée à la main dans Sheets n'est pas suivie plus longtemps
// en écriture (un changement fait par Eraser l'oublie aussitôt, voir forgetAfterStructureChange).
const CHARACTER_COLUMNS_CACHE_MS = 60_000
type CharacterColumns = { map: CharacterSheetMap; layout: CharacterLayout; catalog: CharacterCatalog }
let characterColumnsCache: { signature: string; expiresAt: number; map: CharacterSheetMap } | null = null
let characterColumnsTask: Promise<CharacterColumns> | null = null

async function loadCharacterCatalog(): Promise<CharacterCatalog> {
  const { getCharacterCatalog } = await import("@/lib/character-catalog-server")
  return getCharacterCatalog()
}

async function characterColumns(spreadsheetId: string, tabName: string): Promise<CharacterColumns> {
  const catalog = await loadCharacterCatalog()
  const signature = `${spreadsheetId}:${tabName}:${JSON.stringify([catalog.characteristics.map((item) => [item.key, item.name, item.kind]), catalog.skills.map((skill) => [skill.key, skill.name, skill.characteristicKey])])}`
  const cached = () => characterColumnsCache?.signature === signature && characterColumnsCache.expiresAt > Date.now() ? characterColumnsCache.map : null
  const known = cached()
  if (known) return { map: known, layout: known.layout, catalog }
  // Une seule mise à jour à la fois : deux fiches ouvertes ensemble n'ajoutent pas deux fois les mêmes colonnes.
  while (characterColumnsTask) await characterColumnsTask.catch(() => undefined)
  const settled = cached()
  if (settled) return { map: settled, layout: settled.layout, catalog }
  const task = syncCharacterColumns(spreadsheetId, tabName, catalog, signature)
  characterColumnsTask = task
  try {
    return await task
  } finally {
    characterColumnsTask = null
  }
}

async function syncCharacterColumns(spreadsheetId: string, tabName: string, catalog: CharacterCatalog, signature: string): Promise<CharacterColumns> {
  // Seule la ligne d'en-têtes est relue fraîche : vider le cache de tout le classeur faisait
  // relire toutes les fiches (accueil, campagnes, index) toutes les 5 minutes.
  const [headerRow = []] = (await readRangeFreshWithOffset(spreadsheetId, sheetTabRange(tabName, "1:1"))).rows
  // Les colonnes d'origine manquantes d'abord (à droite), pour que chaque valeur ait sa colonne.
  let headers = (await ensureNamedColumns(spreadsheetId, tabName, sheetColumns(headerRow, characterSheetHeaders, characterSheetAliases))).headers
  let map = characterSheetMap(headers)
  const plan = planCatalogColumns(map.layout.headers, catalog)
  if (plan.rename.length) {
    const renames = plan.rename.flatMap((item) => (map.valueColumns[item.index] ?? -1) >= 0 ? [{ column: map.valueColumns[item.index], header: item.header }] : [])
    await updateRanges(spreadsheetId, renames.map((item) => ({ range: sheetTabRange(tabName, `${columnName(item.column + 1)}1`), values: [[item.header]] })), { valueInputOption: "RAW" })
    headers = [...headers]
    for (const item of renames) headers[item.column] = item.header
    map = characterSheetMap(headers)
  }
  if (plan.append.length) {
    let used = headers.length
    while (used > 0 && !headers[used - 1]) used -= 1
    const end = used + plan.append.length
    await ensureSheetColumnCount(spreadsheetId, tabName, end)
    await updateRange(spreadsheetId, sheetTabRange(tabName, `${columnName(used + 1)}1:${columnName(end)}1`), [plan.append.map((column) => column.header)], { valueInputOption: "RAW" })
    headers = [...headers.slice(0, used), ...plan.append.map((column) => column.header)]
    map = characterSheetMap(headers)
    const { layout } = map
    const added = new Set(plan.append.map((column) => column.key))
    // Les fiches existantes : valeur de départ et formules dans les nouvelles colonnes seulement.
    const idLetter = columnName(Math.max(0, map.columns.at("ID")) + 1)
    const idRead = await readRangeFreshWithOffset(spreadsheetId, sheetTabRange(tabName, `${idLetter}:${idLetter}`))
    const data = idRead.rows.flatMap((row, offset) => {
      const rowNumber = idRead.startRow + offset
      if (rowNumber < 2 || !String(row[0] ?? "").trim()) return []
      const values = Array<string>(layout.headers.length).fill("")
      applyCharacteristicDefaults(values, layout, catalog, added)
      applySkillCells(values, rowNumber, layout, catalog, added)
      const cells = new Map<number, SheetCell>()
      map.valueColumns.forEach((column, index) => { if (column >= used) cells.set(column, values[index] ?? "") })
      return cellRuns(tabName, rowNumber, cells)
    })
    for (let index = 0; index < data.length; index += 200) await updateRanges(spreadsheetId, data.slice(index, index + 200))
    console.info("CHARACTER_COLUMNS_ADDED", plan.append.length, "rows", idRead.rows.length)
  }
  characterColumnsCache = { signature, expiresAt: Date.now() + CHARACTER_COLUMNS_CACHE_MS, map }
  return { map, layout: map.layout, catalog }
}

export async function getCharacterSheet(accountUid: string | null, id: string) {
  const [indexed, source] = await Promise.all([
    accountUid ? getCharacterForUser(accountUid, id) : getCharacterById(id),
    charactersSource(),
  ])
  if (!indexed) return null
  if (!source) return null
  const cached = characterSheetCache.get(id)
  if (cached && cached.expiresAt > Date.now()) return { ...cached.character, ...indexed, name: cached.character.name, subtitle: cached.character.subtitle }
  await ensureCharacterSheetSchema(source.spreadsheetId, source.tabName)
  const { map, layout, catalog } = await characterColumns(source.spreadsheetId, source.tabName)
  const rowNumber = await findSheetRowById(source.spreadsheetId, source.tabName, id)
  if (!rowNumber) return null
  let values = await readCharacterValues(source, map, rowNumber)
  if (characterSecondaryCalculatedFields.some((field) => isGoogleSheetsCalculationError(values[field.valueIndex]))) {
    values = await writeCharacterValues(source, map, rowNumber, applyCharacterDefaultsAndFormulas(values, rowNumber, layout, catalog), catalog, { returnValues: true }) ?? values
  }
  const character = { ...indexed, name: values[0] || indexed.name, subtitle: displayedMultipleValue(values[1] || "", "all") || indexed.subtitle, values, headers: layout.headers } satisfies CharacterSheetRecord
  characterSheetCache.set(id, { expiresAt: Date.now() + 30_000, character })
  return character
}

/**
 * Enregistre seulement les cases changées d'une fiche, chacune à sa place. Deux
 * personnes sur la même fiche (le joueur et le MJ) ne s'écrasent plus : chacune n'écrit
 * que ce qu'elle a modifié. Les colonnes calculées par la feuille ne sont jamais
 * remplacées ; la fiche relue après l'écriture porte les totaux recalculés.
 */
export async function patchCharacterSheet(accountUid: string | null, id: string, changes: Record<string, string>) {
  const existing = accountUid ? await getCharacterForUser(accountUid, id) : await getCharacterById(id)
  if (!existing) throw new Error("CHARACTER_NOT_FOUND")
  const source = await charactersSource()
  if (!source) throw new Error("CHARACTERS_SHEET_UNAVAILABLE")
  await ensureCharacterSheetSchema(source.spreadsheetId, source.tabName)
  const { map, layout, catalog } = await characterColumns(source.spreadsheetId, source.tabName)
  const width = layout.headers.length
  const rowNumber = await findSheetRowById(source.spreadsheetId, source.tabName, id)
  if (!rowNumber) throw new Error("CHARACTER_SHEET_ROW_NOT_FOUND")
  const computed = computedCellIndexes(layout, catalog, [...characterSecondaryCalculatedFields], (fieldIndex) => characterSecondaryCalculationValueIndex(fieldIndex, "modifier"))
  const entries = Object.entries(changes).flatMap(([key, raw]) => {
    const index = Number(key)
    if (!Number.isInteger(index) || index < 0 || index >= width || computed.has(index)) return []
    // Chaque valeur va dans sa colonne, retrouvée par son nom ; une colonne ajoutée à la main n'est pas écrite.
    if ((map.valueColumns[index] ?? -1) < 0 || !map.writable[index]) return []
    return [[index, String(raw ?? "").slice(0, 50_000)] as const]
  })
  const name = entries.find(([index]) => index === 0)?.[1]
  if (name !== undefined && (!name.trim() || name.trim().length > 120)) throw new Error("INVALID_CHARACTER_NAME")
  // Une saisie reste du texte (« - se méfie de lui » n'est pas une formule) : seule Eraser écrit des formules.
  const data = entries.map(([index, value]) => ({ range: sheetTabRange(source.tabName, `${columnName(map.valueColumns[index] + 1)}${rowNumber}`), values: [[textCell(value)]] }))
  for (let start = 0; start < data.length; start += 200) await updateRanges(source.spreadsheetId, data.slice(start, start + 200))
  let values = await readCharacterValues(source, map, rowNumber)
  // Une fiche jamais passée par l'enregistrement complet (ou abîmée dans Sheets) retrouve ses formules.
  if (characterSecondaryCalculatedFields.some((field) => isGoogleSheetsCalculationError(values[field.valueIndex]))) {
    values = await writeCharacterValues(source, map, rowNumber, applyCharacterDefaultsAndFormulas(values, rowNumber, layout, catalog), catalog, { returnValues: true }) ?? values
  }
  const updatedAt = new Date().toISOString()
  const nextName = values[0]?.trim() || existing.name
  await getDb().update(characterIndex).set({ name: nextName, subtitle: displayedMultipleValue(values[1] || "", "all"), updatedAt }).where(eq(characterIndex.id, id))
  const character = { ...existing, name: nextName, subtitle: displayedMultipleValue(values[1] || "", "all"), updatedAt, values, headers: layout.headers } satisfies CharacterSheetRecord
  characterSheetCache.set(id, { expiresAt: Date.now() + 30_000, character })
  return character
}

type StoredInventoryContainer = {
  id: string
  characterId: string
  typeId: string
  customName: string
  category: string
  capacity: number
  order: number
  createdAt: string
  deletedAt: string
  rowNumber: number
}

type StoredInventoryContent = {
  id: string
  characterId: string
  containerId: string
  index: number
  itemId: string
  quantity: number
  customName: string
  customDescription: string
  type: string
  subtype: string
  effect: string
  updatedAt: string
  equipped: boolean
  modifiers: string
  /**
   * Copie mise en forme du texte de l'Index des objets. L'inventaire conserve déjà
   * une copie du texte brut ; garder la version mise en forme à côté évite de relire
   * tout le catalogue Drive à chaque ouverture de fiche pour afficher un mot en gras.
   */
  nameHtml: string
  descriptionHtml: string
  effectHtml: string
  rowNumber: number
}

type InventoryWorkbook = {
  spreadsheetId: string
  /** Les colonnes de chaque onglet, retrouvées par leur nom : les écritures visent leur vraie place. */
  columns: Record<string, SheetColumns>
  containerTypes: InventoryContainerTypeRecord[]
  containers: StoredInventoryContainer[]
  items: InventoryItemRecord[]
  contents: StoredInventoryContent[]
  /** Le catalogue des objets n'a pas pu être lu : les objets n'ont pas leurs colonnes. */
  catalogMissing?: boolean
}

let inventoryWorkbookCache: { expiresAt: number; workbook: InventoryWorkbook; includesCatalog: boolean } | null = null
const INVENTORY_WORKBOOK_CACHE_MS = 60_000
/** Change à chaque écriture : une lecture partie avant elle ne remplit pas le cache après. */
let inventoryWorkbookVersion = 0

const characterSheetCache = new Map<string, { expiresAt: number; character: CharacterSheetRecord }>()

function cacheInventoryWorkbook(workbook: InventoryWorkbook, includesCatalog: boolean, version: number) {
  if (version !== inventoryWorkbookVersion) return
  inventoryWorkbookCache = { expiresAt: Date.now() + INVENTORY_WORKBOOK_CACHE_MS, workbook, includesCatalog }
}

/** Après une écriture : la lecture suivante relit la feuille (le cache n'est jamais prolongé). */
function clearInventoryWorkbookCache() {
  inventoryWorkbookCache = null
  inventoryWorkbookVersion += 1
}

/**
 * Les modifications d'inventaire passent une à une (par classeur) : deux transferts lancés
 * ensemble visaient la même « première case vide » et le premier objet était perdu ; le
 * résumé et la fiche complète, chargés ensemble, créaient chacun les contenants. Chacune
 * relit la feuille sans cache sous ce verrou avant d'écrire, ce qui la protège aussi, en
 * grande partie, des écritures d'une autre installation.
 */
async function withInventoryLock<T>(run: () => Promise<T>) {
  const sheet = await ensureJdrSheet("inventory")
  if (!sheet) throw new Error("INVENTORY_SHEET_UNAVAILABLE")
  return withAsyncLock(`inventaire:${sheet.spreadsheetId}`, run)
}

/** Ce que décide une lecture de l'inventaire. */
type InventoryReadOptions = {
  /** Relue sans cache (POST) : ce qu'on y lit décide d'une écriture. */
  fresh?: boolean
  /** Le catalogue à jour, pas la copie d'affichage (30 min) : son texte est recopié dans une case. */
  currentCatalog?: boolean
}

const inventoryContainerTab = "Contenants personnages"
const inventoryItemsTab = "Objets"
const inventoryContentsTab = "Contenu inventaire"

function positiveInteger(value: string | number | undefined, fallback: number) {
  const parsed = Number.parseInt(String(value ?? ""), 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function nonNegativeInteger(value: string | number | undefined, fallback = 0) {
  const parsed = Number.parseInt(String(value ?? ""), 10)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback
}

function sheetValueIsActive(value: string | undefined) {
  const normalized = (value || "").trim().toLocaleLowerCase("fr")
  return !["non", "faux", "false", "0", "inactif", "inactive"].includes(normalized)
}

function sheetValueIsChecked(value: string | undefined) {
  const normalized = (value || "").trim().toLocaleLowerCase("fr")
  return ["oui", "vrai", "true", "1", "equipe", "équipé", "equipee", "équipée"].includes(normalized)
}

function parseContainerTypeRows(rows: string[][]): InventoryContainerTypeRecord[] {
  return rows.flatMap((row) => {
    const id = row[0]?.trim()
    const name = row[1]?.trim()
    const category = parseInventoryCategory(row[2] || "")
    if (!id || !name || !category) return []
    return [{
      id,
      name,
      category,
      capacity: positiveInteger(row[3], 1),
      columns: (row[4] || "").split(/\s*[|,]\s*/).map((value) => value.trim()).filter(Boolean),
      active: sheetValueIsActive(row[5]),
    }]
  })
}

function parseInventoryItemRows(rows: string[][]): InventoryItemRecord[] {
  return rows.flatMap((row) => {
    const id = row[0]?.trim()
    const name = row[1]?.trim()
    if (!id || !name) return []
    return [{
      nameHtml: "",
      descriptionHtml: "",
      effectHtml: "",
      id,
      name,
      description: row[2] || "",
      type: row[3] || "Objet",
      subtype: row[4] || "",
      effect: row[5] || "",
      maxQuantity: positiveInteger(row[6], 1),
      weight: row[7] || "",
      price: row[8] || "",
      bulk: row[9] || "",
      image: row[10] || "",
      icon: isSheetErrorValue(row[18] || "") ? "" : row[18] || "",
      notes: row[11] || "",
      link: row[12] || "",
      rarity: row[13] || "",
      attributes: row[14] || "",
      prerequisites: row[15] || "",
      edition: row[16] || "",
      active: sheetValueIsActive(row[17]),
    }]
  })
}

function objectIndexColumn(table: ObjectIndexTable, aliases: string[]) {
  const expected = new Set(aliases.map(normalizedHeader))
  return table.headers.findIndex((header) => expected.has(normalizedHeader(header)))
}

function objectIndexCell(table: ObjectIndexTable, row: ObjectIndexRow, aliases: string[]) {
  const index = objectIndexColumn(table, aliases)
  return index >= 0 ? row.values[index] || "" : ""
}

/** Même cellule, mise en forme comprise : les inventaires et magasins l'affichent telle quelle. */
function objectIndexCellHtml(table: ObjectIndexTable, row: ObjectIndexRow, aliases: string[]) {
  const index = objectIndexColumn(table, aliases)
  return index >= 0 ? row.html?.[index] || "" : ""
}

function inferredObjectType(table: ObjectIndexTable) {
  const source = normalizedHeader(`${table.fileName} ${table.tabName}`)
  if (/\barmes?\b/.test(source)) return "Arme"
  if (/\b(equipement|equipements|armure|armures)\b/.test(source)) return "Équipement"
  if (/\b(monnaie|monnaies|bourse|bourses)\b/.test(source)) return "Monnaie"
  if (/\b(ressource|ressources)\b/.test(source)) return "Ressource"
  if (/\b(livre|livres|ouvrage|ouvrages)\b/.test(source)) return "Livre"
  return "Objet"
}

function parseObjectIndexItems(tables: ObjectIndexTable[]): InventoryItemRecord[] {
  return tables.flatMap((table) => table.rows.flatMap((row) => {
    const name = objectIndexCell(table, row, ["Nom", "Nom de l'objet", "Objet", "Arme", "Équipement", "Equipement", "Ressource", "Livre", "Titre"]).trim()
    if (!name) return []
    const id = objectIndexCell(table, row, ["ID", "Identifiant"]).trim() || `DRIVE-${table.fileId}-${table.sheetId}-${row.rowNumber}`
    return [{
      id,
      name,
      description: objectIndexCell(table, row, ["Description", "Déscription"]),
      type: objectIndexCell(table, row, ["Type", "Catégorie", "Categorie"]) || inferredObjectType(table),
      subtype: objectIndexCell(table, row, ["Sous-type", "Sous type", "Subtype"]),
      effect: objectIndexCell(table, row, ["Effet", "Effets"]),
      nameHtml: objectIndexCellHtml(table, row, ["Nom", "Nom de l'objet", "Objet", "Arme", "Équipement", "Equipement", "Ressource", "Livre", "Titre"]),
      descriptionHtml: objectIndexCellHtml(table, row, ["Description", "Déscription"]),
      effectHtml: objectIndexCellHtml(table, row, ["Effet", "Effets"]),
      maxQuantity: positiveInteger(objectIndexCell(table, row, ["Nombre max", "Quantité max", "Quantite max", "Maximum", "Max"]), 1),
      weight: objectIndexCell(table, row, ["Poids", "Masse"]),
      price: objectIndexPrice(table, row),
      bulk: objectIndexCell(table, row, ["Encombrement"]),
      image: objectIndexCell(table, row, ["Image", "Illustration", "URL image"]),
      icon: (() => {
        // Une case vide ou en erreur (« #REF! ») prend l'icône d'Eraser à l'affichage.
        const storedIcon = objectIndexCell(table, row, ["Icône", "Icone", "Icon"])
        return isSheetErrorValue(storedIcon) ? "" : storedIcon
      })(),
      notes: objectIndexCell(table, row, ["Notes", "Note"]),
      link: objectIndexCell(table, row, ["Lien", "URL"]),
      rarity: objectIndexCell(table, row, ["Rareté principale", "Rareté principal", "Rareté", "Rarete"]),
      attributes: objectIndexCell(table, row, ["Attributs", "Attribut"]),
      prerequisites: objectIndexCell(table, row, ["Prérequis", "Prerequis"]),
      edition: objectIndexCell(table, row, ["Édition", "Edition"]),
      active: sheetValueIsActive(objectIndexCell(table, row, ["Actif", "Active", "Disponible"])),
      ...objectCombatFields(table, row),
    }]
  }))
}

/** Compétence, Distance, Action, Valeur, Attributs d'un objet (les cases vides sont omises). */
export function objectCombatFields(table: ObjectIndexTable, row: ObjectIndexRow): ObjectCombatFields {
  const fields: ObjectCombatFields = {}
  for (const column of objectCombatColumns) {
    const index = objectCombatColumn(table.headers, column.key)
    const value = index >= 0 ? (row.values[index] || "").trim() : ""
    if (value && !isSheetErrorValue(value)) fields[column.key] = value
  }
  // Le rendu de leurs colonnes (style imposé, couleur des options choisies), pour l'inventaire
  // et les magasins. Le style de chaque colonne présente (une case vide peut être remplie pour
  // un seul exemplaire), mais seulement les options utilisées : la liste des actions est longue.
  let tableLooks = objectTraitLooksCache.get(table)
  if (!tableLooks) { tableLooks = objectTraitLooks(table.headers, table.columnSpecs); objectTraitLooksCache.set(table, tableLooks) }
  const looks: NonNullable<ObjectCombatFields["looks"]> = {}
  for (const [key, look] of Object.entries(tableLooks) as Array<[keyof typeof tableLooks, NonNullable<(typeof tableLooks)[keyof typeof tableLooks]>]>) {
    const value = fields[key] ?? ""
    const used = new Set(value.split(/\s*[|,;\n]\s*/).map((part) => foldName(part)).filter(Boolean))
    const options = look.options?.filter((option) => used.has(foldName(option.value)))
    const slim = { ...(look.style ? { style: look.style } : {}), ...(options?.length ? { options } : {}), ...(look.unit ? { unit: look.unit } : {}) }
    if (Object.keys(slim).length) looks[key] = slim
  }
  if (Object.keys(looks).length) fields.looks = looks
  return fields
}

const objectTraitLooksCache = new WeakMap<ObjectIndexTable, ReturnType<typeof objectTraitLooks>>()

/** Le prix d'un objet (« Prix », « Coût », ou l'ancienne « Valeur » d'un tableau sans prix). */
export function objectIndexPrice(table: ObjectIndexTable, row: ObjectIndexRow) {
  const index = objectPriceColumn(table.headers)
  return index >= 0 ? row.values[index] || "" : ""
}

/** Les onglets de l'inventaire en une lecture, pour l'affichage. */
async function readInventoryTabs(spreadsheetId: string, ranges: string[]) {
  const parameters = new URLSearchParams()
  ranges.forEach((range) => parameters.append("ranges", range))
  const payload = await googleSheetsJson<{ valueRanges?: Array<{ values?: GoogleSheetCellValue[][] }> }>(
    `spreadsheets/${spreadsheetId}/values:batchGet?${parameters.toString()}`,
  )
  return ranges.map((_, index) => normalizeGoogleSheetRows(payload.valueRanges?.[index]?.values))
}

/** Les mêmes, relus sans cache (POST), chacun calé sur la ligne où Google le fait commencer. */
async function readInventoryTabsFresh(spreadsheetId: string, ranges: string[]) {
  return (await readRangesFresh(spreadsheetId, ranges)).map((read) => [...Array.from({ length: Math.max(0, read.startRow - 1) }, () => [] as string[]), ...read.rows])
}

async function readInventoryWorkbook(includeCatalog = true, options: InventoryReadOptions = {}): Promise<InventoryWorkbook> {
  const sheet = await ensureJdrSheet("inventory")
  if (!sheet) throw new Error("INVENTORY_SHEET_UNAVAILABLE")
  const cached = inventoryWorkbookCache
  if (!options.fresh && cached && cached.expiresAt > Date.now() && cached.workbook.spreadsheetId === sheet.spreadsheetId && (!includeCatalog || cached.includesCatalog)) {
    return cached.workbook
  }
  const version = inventoryWorkbookVersion
  let catalogFailed = false
  // Chaque onglet entier, en-têtes compris : ses colonnes sont retrouvées par leur nom,
  // puis chaque ligne est remise dans l'ordre prévu (la lecture ci-dessous en dépend).
  const tabs = ["Types de contenants", inventoryContainerTab, inventoryItemsTab, inventoryContentsTab]
  const ranges = tabs.map(sheetTabAll)
  const [grids, objectIndexTables] = await Promise.all([
    options.fresh ? readInventoryTabsFresh(sheet.spreadsheetId, ranges) : readInventoryTabs(sheet.spreadsheetId, ranges),
    // Sans le catalogue (lecture rapide), les objets prennent quand même ses colonnes
    // s'il est déjà en mémoire : rien de plus à lire dans Google Sheets.
    includeCatalog
      ? (options.currentCatalog ? listObjectIndexTables() : listObjectIndexTablesForDisplay()).catch(() => { catalogFailed = true; return [] })
      : Promise.resolve(objectIndexTableCache && objectIndexTableCache.expiresAt > Date.now() ? objectIndexTableCache.tables : lastGoodObjectIndexTables ?? []),
  ])
  const columns: Record<string, SheetColumns> = {}
  const [typeRows, containerRows, itemRows, contentRows] = tabs.map((tab, index) => {
    const [headers = [], ...rows] = grids[index] ?? []
    const expected = inventoryWorkbookTabs.find((candidate) => candidate.name === tab)?.headers ?? []
    columns[tab] = sheetColumns(headers, expected)
    return rows.map((row) => canonicalRow(columns[tab], row))
  })
  // Une colonne prévue absente est ajoutée à droite (rien ne bouge) ; la lecture n'en dépend pas.
  for (const tab of tabs) {
    if (!columns[tab].missing.length && !columns[tab].unnamed.length) continue
    columns[tab] = await ensureNamedColumns(sheet.spreadsheetId, tab, columns[tab]).catch((error) => {
      console.error("INVENTORY_COLUMNS_CHECK_FAILED", tab, error instanceof Error ? error.message : "UNKNOWN_ERROR")
      return columns[tab]
    })
  }
  const mergedItems = [...parseInventoryItemRows(itemRows), ...parseObjectIndexItems(objectIndexTables)]
  const items = [...new Map(mergedItems.map((item) => [item.id, item])).values()]
  const configuredTypes = parseContainerTypeRows(typeRows)
  const containerTypes = [...new Map([...baseInventoryContainerTypes, ...configuredTypes].map((type) => [type.id, type])).values()]
  const workbook: InventoryWorkbook = {
    spreadsheetId: sheet.spreadsheetId,
    columns,
    containerTypes,
    containers: containerRows.flatMap((row, index) => row[0] ? [{
      id: row[0],
      characterId: row[1] || "",
      typeId: row[2] || "",
      customName: row[3] || "",
      category: row[4] || "",
      capacity: positiveInteger(row[5], 1),
      order: nonNegativeInteger(row[6], index),
      createdAt: row[7] || "",
      deletedAt: row[8] || "",
      rowNumber: index + 2,
    }] : []),
    items,
    contents: contentRows.flatMap((row, index) => row[0] ? [{
      id: row[0],
      characterId: row[1] || "",
      containerId: row[2] || "",
      index: positiveInteger(row[3], index + 1),
      itemId: row[4] || "",
      quantity: nonNegativeInteger(row[5]),
      customName: row[6] || "",
      customDescription: row[7] || "",
      type: row[8] || "",
      subtype: row[9] || "",
      effect: row[10] || "",
      updatedAt: row[11] || "",
      equipped: sheetValueIsChecked(row[12]),
      modifiers: row[13] || "",
      nameHtml: row[14] || "",
      descriptionHtml: row[15] || "",
      effectHtml: row[16] || "",
      rowNumber: index + 2,
    }] : []),
  }
  // Un catalogue qui n'a pas pu être lu n'est pas gardé comme complet : la prochaine
  // lecture complète le redemande (et la page la relance d'elle-même).
  if (includeCatalog && catalogFailed) workbook.catalogMissing = true
  cacheInventoryWorkbook(workbook, includeCatalog && !catalogFailed, version)
  return workbook
}

/** Une case écrite en USER_ENTERED : un texte saisi reste du texte, un nombre reste un nombre. */
function inventoryCell(value: SheetCell) {
  return typeof value === "string" ? textCell(value) : value
}

/** Ajoute des lignes (décrites dans l'ordre prévu) à un onglet de l'inventaire, chaque valeur sous son en-tête. */
function appendInventoryRows(workbook: InventoryWorkbook, tab: string, rows: SheetCell[][]) {
  const columns = workbook.columns[tab]
  if (!columns) throw new Error(`INVENTORY_TAB_COLUMNS_UNKNOWN:${tab}`)
  return appendRows(workbook.spreadsheetId, namedAppendRange(tab, columns), canonicalRows(columns, rows.map((row) => row.map(inventoryCell))))
}

/**
 * Les cases d'une ligne relue à l'instant qui changent vraiment, chacune sous son en-tête :
 * rien d'autre n'est réécrit (ni l'ID, ni une case modifiée ailleurs, ni une colonne ajoutée
 * à la main).
 */
function inventoryRowWrites(workbook: InventoryWorkbook, tab: string, rowNumber: number, before: readonly SheetCell[], after: readonly SheetCell[]) {
  const columns = workbook.columns[tab]
  if (!columns) throw new Error(`INVENTORY_TAB_COLUMNS_UNKNOWN:${tab}`)
  if (!Number.isInteger(rowNumber) || rowNumber < 2) throw new Error("INVENTORY_ROW_UNKNOWN")
  const changed: Record<string, SheetCell> = {}
  columns.expected.forEach((name, index) => {
    if (String(before[index] ?? "") !== String(after[index] ?? "")) changed[name] = inventoryCell(after[index] ?? "")
  })
  return namedRowWrites(tab, columns, rowNumber, changed)
}

/**
 * Écrit des lignes de l'inventaire d'après leur état relu sous le verrou (`before`, avec son
 * numéro de ligne) : seules les cases qui changent, toutes en une seule écriture. Le cache
 * est oublié, jamais prolongé ; l'inventaire rendu tient compte des changements.
 */
async function writeInventoryChanges(workbook: InventoryWorkbook, changes: { contents?: Array<[StoredInventoryContent, StoredInventoryContent]>; containers?: Array<[StoredInventoryContainer, StoredInventoryContainer]> }): Promise<InventoryWorkbook> {
  const writes = [
    ...(changes.containers ?? []).flatMap(([before, after]) => inventoryRowWrites(workbook, inventoryContainerTab, before.rowNumber, inventoryContainerRow(before), inventoryContainerRow(after))),
    ...(changes.contents ?? []).flatMap(([before, after]) => inventoryRowWrites(workbook, inventoryContentsTab, before.rowNumber, inventoryContentRow(before), inventoryContentRow(after))),
  ]
  if (writes.length) await updateRanges(workbook.spreadsheetId, writes)
  clearInventoryWorkbookCache()
  const contents = new Map((changes.contents ?? []).map(([, after]) => [after.id, after]))
  const containers = new Map((changes.containers ?? []).map(([, after]) => [after.id, after]))
  return {
    ...workbook,
    contents: workbook.contents.map((content) => contents.get(content.id) ?? content),
    containers: workbook.containers.map((container) => containers.get(container.id) ?? container),
  }
}

/** La case que la page modifie tient-elle toujours ce qu'elle montrait ? Sinon, rien n'est écrit. */
function assertExpectedSlot(content: StoredInventoryContent | undefined, expected: InventorySlotExpectation | undefined) {
  if (!expected) return
  if (!content || (expected.itemId !== undefined && content.itemId !== expected.itemId) || (expected.quantity !== undefined && content.quantity !== expected.quantity)) {
    throw new Error("INVENTORY_CHANGED")
  }
}

function inventoryContainerRow(container: StoredInventoryContainer): SheetCell[] {
  return [
    container.id,
    container.characterId,
    container.typeId,
    container.customName,
    container.category,
    container.capacity,
    container.order,
    container.createdAt,
    container.deletedAt,
  ]
}

function inventoryContentRow(content: StoredInventoryContent) {
  return [
    content.id,
    content.characterId,
    content.containerId,
    content.index,
    content.itemId,
    content.quantity,
    content.customName,
    content.customDescription,
    content.type,
    content.subtype,
    content.effect,
    content.updatedAt,
    content.equipped ? "Oui" : "Non",
    content.modifiers,
    content.nameHtml,
    content.descriptionHtml,
    content.effectHtml,
  ]
}

function makeEmptyInventorySlot(characterId: string, containerId: string, index: number): StoredInventoryContent {
  return {
    id: crypto.randomUUID(),
    characterId,
    containerId,
    index,
    itemId: "",
    quantity: 0,
    customName: "",
    customDescription: "",
    type: "",
    subtype: "",
    effect: "",
    updatedAt: new Date().toISOString(),
    equipped: false,
    modifiers: "",
    nameHtml: "",
    descriptionHtml: "",
    effectHtml: "",
    rowNumber: 0,
  }
}

function inventoryContainerCategory(container: StoredInventoryContainer, types: Map<string, InventoryContainerTypeRecord>): InventoryCategory {
  return parseInventoryCategory(container.category) ?? types.get(container.typeId)?.category ?? "Inventaire"
}

const requiredInventoryCurrencies = ["Or", "Cuivre", "Or noir"]

function inventoryCurrencyKey(value: string) {
  const normalized = normalizedHeader(value).replace(/\b(piece|pieces|monnaie|monnaies|de|d)\b/g, " ").replace(/\s+/g, " ").trim()
  if (normalized.includes("or noir")) return "or noir"
  if (normalized.includes("cuivre")) return "cuivre"
  if (normalized === "or" || normalized.includes(" or ")) return "or"
  return normalized
}

/** Les emplacements qui manquent à un contenant, d'après une lecture (rien n'est écrit ici). */
function missingInventorySlots(workbook: InventoryWorkbook, container: StoredInventoryContainer) {
  const type = workbook.containerTypes.find((candidate) => candidate.id === container.typeId)
  const existing = workbook.contents.filter((content) => content.containerId === container.id)
  const existingIndexes = new Set(existing.map((content) => content.index))
  const category = inventoryContainerCategory(container, new Map(workbook.containerTypes.map((item) => [item.id, item])))
  const rows: StoredInventoryContent[] = []
  if (category === "Bourse") {
    const currencies = [...requiredInventoryCurrencies, ...(type?.columns ?? [])]
      .filter((currency, index, values) => values.findIndex((candidate) => inventoryCurrencyKey(candidate) === inventoryCurrencyKey(currency)) === index)
    const existingCurrencies = new Set(existing.map((content) => inventoryCurrencyKey(content.customName || content.subtype)))
    let nextIndex = existing.reduce((maximum, content) => Math.max(maximum, content.index), 0) + 1
    currencies.forEach((currency) => {
      if (existingCurrencies.has(inventoryCurrencyKey(currency))) return
      rows.push({
        ...makeEmptyInventorySlot(container.characterId, container.id, nextIndex),
        customName: currency,
        type: "Monnaie",
        subtype: currency,
      })
      nextIndex += 1
    })
  } else {
    for (let index = 1; index <= container.capacity; index += 1) {
      if (!existingIndexes.has(index)) rows.push(makeEmptyInventorySlot(container.characterId, container.id, index))
    }
  }
  return rows
}

/**
 * Ajoute en une fois les emplacements qui manquent à ces contenants, d'après une lecture
 * faite sous le verrou. Vrai si des lignes ont été ajoutées : la feuille est alors à relire.
 */
async function appendMissingInventorySlots(workbook: InventoryWorkbook, containers: StoredInventoryContainer[]) {
  const rows = containers.flatMap((container) => missingInventorySlots(workbook, container))
  if (!rows.length) return false
  await appendInventoryRows(workbook, inventoryContentsTab, rows.map(inventoryContentRow))
  clearInventoryWorkbookCache()
  return true
}

export function campaignInventoryOwnerId(campaignId: string) {
  return `CAMPAGNE:${campaignId}`
}

function isCampaignInventoryOwner(ownerId: string) {
  return ownerId.startsWith("CAMPAGNE:")
}

function activeInventoryContainers(ownerId: string, workbook: InventoryWorkbook) {
  return workbook.containers.filter((container) => container.characterId === ownerId && !container.deletedAt)
}

/**
 * L'inventaire de campagne : un contenant et ses emplacements. Ce qui manque est créé sous
 * le verrou, d'après une relecture sans cache (`fresh` : l'inventaire rendu est lui aussi
 * relu sans cache, pour écrire).
 */
async function ensureCampaignInventoryStorage(ownerId: string, includeCatalog = true, options: InventoryReadOptions = {}): Promise<InventoryWorkbook> {
  if (!options.fresh) {
    const known = await readInventoryWorkbook(includeCatalog)
    const container = activeInventoryContainers(ownerId, known)[0]
    if (container && !missingInventorySlots(known, container).length) return known
  }
  return withInventoryLock(async () => {
    const read = () => readInventoryWorkbook(includeCatalog, { ...options, fresh: true })
    let workbook = await read()
    if (!activeInventoryContainers(ownerId, workbook).length) {
      const container: StoredInventoryContainer = {
        id: crypto.randomUUID(),
        characterId: ownerId,
        typeId: "",
        customName: "Inventaire de la campagne",
        category: "Inventaire",
        capacity: 50,
        order: 0,
        createdAt: new Date().toISOString(),
        deletedAt: "",
        rowNumber: 0,
      }
      await appendInventoryRows(workbook, inventoryContainerTab, [inventoryContainerRow(container)])
      clearInventoryWorkbookCache()
      workbook = await read()
    }
    const container = activeInventoryContainers(ownerId, workbook)[0]
    if (container && await appendMissingInventorySlots(workbook, [container])) workbook = await read()
    return workbook
  })
}

/** Les contenants de base qui manquent à un personnage. */
function missingBaseInventoryContainers(characterId: string, workbook: InventoryWorkbook) {
  const typeById = new Map(workbook.containerTypes.map((type) => [type.id, type]))
  const knownContainers = workbook.containers.filter((container) => container.characterId === characterId)
  return baseInventoryContainerTypes.filter((baseType) =>
    baseType.category === "Esthétique"
      ? !knownContainers.some((container) => !container.deletedAt && inventoryContainerCategory(container, typeById) === "Esthétique")
      : !knownContainers.some((container) => container.typeId === baseType.id),
  )
}

/** Les rangements esthétiques vides en trop d'un personnage : le plus rempli (sinon celui de base) est gardé. */
function emptyAestheticDuplicates(characterId: string, workbook: InventoryWorkbook) {
  const typeById = new Map(workbook.containerTypes.map((type) => [type.id, type]))
  const filled = (containerId: string) => workbook.contents.filter((content) => content.containerId === containerId && Boolean(content.itemId || (content.customName && content.quantity > 0))).length
  return activeInventoryContainers(characterId, workbook)
    .filter((container) => inventoryContainerCategory(container, typeById) === "Esthétique")
    .sort((left, right) => filled(right.id) - filled(left.id)
      || Number(right.typeId === "TYPE-ESTHETIQUE-BASE") - Number(left.typeId === "TYPE-ESTHETIQUE-BASE")
      || left.order - right.order)
    .slice(1)
    .filter((container) => !filled(container.id))
}

function characterInventoryReady(characterId: string, workbook: InventoryWorkbook) {
  return !missingBaseInventoryContainers(characterId, workbook).length
    && !emptyAestheticDuplicates(characterId, workbook).length
    && activeInventoryContainers(characterId, workbook).every((container) => !missingInventorySlots(workbook, container).length)
}

/**
 * Les contenants de base d'un personnage et leurs emplacements. Ce qui manque est créé sous
 * le verrou, d'après une relecture sans cache : le résumé et la fiche complète, chargés
 * ensemble, ne créent plus chacun leurs contenants (`fresh` : rendu relu sans cache, pour écrire).
 */
async function ensureCharacterInventoryStorage(characterId: string, includeCatalog = true, options: InventoryReadOptions = {}): Promise<InventoryWorkbook> {
  if (isCampaignInventoryOwner(characterId)) return ensureCampaignInventoryStorage(characterId, includeCatalog, options)
  if (!options.fresh) {
    const known = await readInventoryWorkbook(includeCatalog)
    if (characterInventoryReady(characterId, known)) return known
  }
  return withInventoryLock(async () => {
    const read = () => readInventoryWorkbook(includeCatalog, { ...options, fresh: true })
    let workbook = await read()
    const now = new Date().toISOString()
    const missing = missingBaseInventoryContainers(characterId, workbook)
    if (missing.length) {
      const typeById = new Map(workbook.containerTypes.map((type) => [type.id, type]))
      const nextOrder = workbook.containers
        .filter((container) => container.characterId === characterId)
        .reduce((maximum, container) => Math.max(maximum, container.order), -1) + 1
      const created = missing.map((baseType, index): StoredInventoryContainer => {
        const configuredType = typeById.get(baseType.id) ?? baseType
        return {
          id: crypto.randomUUID(),
          characterId,
          typeId: configuredType.id,
          customName: "",
          category: configuredType.category,
          capacity: configuredType.capacity,
          order: nextOrder + index,
          createdAt: now,
          deletedAt: "",
          rowNumber: 0,
        }
      })
      await appendInventoryRows(workbook, inventoryContainerTab, created.map(inventoryContainerRow))
      clearInventoryWorkbookCache()
      workbook = await read()
    }
    const duplicates = emptyAestheticDuplicates(characterId, workbook)
    if (duplicates.length) workbook = await writeInventoryChanges(workbook, { containers: duplicates.map((container) => [container, { ...container, deletedAt: now }]) })
    if (await appendMissingInventorySlots(workbook, activeInventoryContainers(characterId, workbook))) workbook = await read()
    return workbook
  })
}

type InventoryOwnerMode = "character" | "npc"

const npcBackpackTypeId = "TYPE-SAC-BASE"

/** Le sac d'un PNJ, et s'il est déjà son seul contenant (« Sac à dos »). */
function npcBackpackOf(npcId: string, workbook: InventoryWorkbook) {
  const typeById = new Map(workbook.containerTypes.map((type) => [type.id, type]))
  const active = activeInventoryContainers(npcId, workbook)
  const backpack = active.find((container) => container.typeId === npcBackpackTypeId)
    ?? active.find((container) => inventoryContainerCategory(container, typeById) === "Inventaire")
  const migrated = active.length === 1 && backpack?.typeId === npcBackpackTypeId && backpack.customName === "Sac à dos"
  return { active, backpack, migrated }
}

/**
 * Le sac à dos d'un PNJ. La première fois, ses autres contenants (un PNJ pris pour un
 * personnage en avait cinq) sont mis à la corbeille et leurs objets rejoignent le sac, à la
 * suite de ses cases, sans rien changer d'autre (« Équipé » compris) ; l'ancien inventaire
 * JSON de la feuille des PNJ y est recopié avec des identifiants fixes. Relancé, rien n'est
 * ajouté deux fois.
 */
async function ensureNpcBackpackInventoryStorage(npcId: string, includeCatalog = true, options: InventoryReadOptions = {}): Promise<InventoryWorkbook> {
  if (!options.fresh) {
    const known = await readInventoryWorkbook(includeCatalog)
    const { backpack, migrated } = npcBackpackOf(npcId, known)
    if (migrated && backpack && !missingInventorySlots(known, backpack).length) return known
  }
  return withInventoryLock(async () => {
    const read = () => readInventoryWorkbook(includeCatalog, { ...options, fresh: true })
    let workbook = await read()
    let state = npcBackpackOf(npcId, workbook)
    if (state.migrated && state.backpack) {
      if (await appendMissingInventorySlots(workbook, [state.backpack])) workbook = await read()
      return workbook
    }
    const now = new Date().toISOString()
    if (!state.backpack) {
      const created: StoredInventoryContainer = {
        id: crypto.randomUUID(), characterId: npcId, typeId: npcBackpackTypeId, customName: "Sac à dos",
        category: "Inventaire", capacity: 15, order: 0, createdAt: now, deletedAt: "", rowNumber: 0,
      }
      await appendInventoryRows(workbook, inventoryContainerTab, [inventoryContainerRow(created)])
      clearInventoryWorkbookCache()
      workbook = await read()
      state = npcBackpackOf(npcId, workbook)
    }
    const backpack = state.backpack
    if (!backpack) throw new Error("INVENTORY_CONTAINER_NOT_FOUND")
    const { columns: npcColumns, rows: npcRows } = await readNpcSheet(await npcSheet(), { fresh: true })
    const legacyRow = npcRows.find((row) => npcColumns.get(row, "ID") === npcId)
    const legacy = npcInventoryFromCell(legacyRow ? npcColumns.get(legacyRow, "Inventaire JSON (archive)") : undefined)
      .map((item, index) => ({ item, id: `NPC-LEGACY-${npcId}-${item.id || index}` }))
      .filter(({ id }) => !workbook.contents.some((content) => content.id === id))
    const order = new Map(state.active.map((container) => [container.id, container.order]))
    const occupied = workbook.contents
      .filter((content) => content.characterId === npcId && order.has(content.containerId) && content.quantity > 0 && Boolean(content.itemId || content.customName))
      .sort((left, right) => (order.get(left.containerId) ?? 0) - (order.get(right.containerId) ?? 0) || left.index - right.index)
    const capacity = Math.max(15, backpack.capacity, occupied.length + legacy.length)
    let nextIndex = workbook.contents.filter((content) => content.containerId === backpack.id).reduce((maximum, content) => Math.max(maximum, content.index), 0) + 1
    workbook = await writeInventoryChanges(workbook, {
      containers: [
        [backpack, { ...backpack, typeId: npcBackpackTypeId, customName: "Sac à dos", category: "Inventaire", capacity, order: 0, createdAt: backpack.createdAt || now, deletedAt: "" }],
        ...state.active.filter((container) => container.id !== backpack.id).map((container): [StoredInventoryContainer, StoredInventoryContainer] => [container, { ...container, deletedAt: now }]),
      ],
      contents: occupied.filter((content) => content.containerId !== backpack.id).map((content): [StoredInventoryContent, StoredInventoryContent] => [content, { ...content, containerId: backpack.id, index: nextIndex++, updatedAt: now }]),
    })
    if (legacy.length) {
      await appendInventoryRows(workbook, inventoryContentsTab, legacy.map(({ item, id }) => inventoryContentRow({
        ...makeEmptyInventorySlot(npcId, backpack.id, nextIndex++),
        id, quantity: item.quantity, customName: item.name, customDescription: item.notes, type: "Objet", updatedAt: now,
      })))
      clearInventoryWorkbookCache()
    }
    workbook = await read()
    const refreshed = workbook.containers.find((container) => container.id === backpack.id && !container.deletedAt)
    if (!refreshed) throw new Error("INVENTORY_CONTAINER_NOT_FOUND")
    if (await appendMissingInventorySlots(workbook, [refreshed])) workbook = await read()
    return workbook
  })
}

async function inventoryStorageFor(ownerId: string, includeCatalog: boolean, mode: InventoryOwnerMode, options: InventoryReadOptions = {}) {
  return mode === "npc" ? ensureNpcBackpackInventoryStorage(ownerId, includeCatalog, options) : ensureCharacterInventoryStorage(ownerId, includeCatalog, options)
}

function customInventoryItem(content: StoredInventoryContent): InventoryItemRecord | null {
  if (!content.customName) return null
  return {
    id: content.itemId || `PERSONNALISE-${content.id}`,
    name: content.customName,
    description: content.customDescription,
    nameHtml: content.nameHtml,
    descriptionHtml: content.descriptionHtml,
    effectHtml: content.effectHtml,
    type: content.type,
    subtype: content.subtype,
    effect: content.effect,
    maxQuantity: 99,
    weight: "",
    price: "",
    bulk: "",
    image: "",
    icon: "",
    notes: "",
    link: "",
    rarity: "",
    attributes: "",
    prerequisites: "",
    edition: "",
    active: true,
  }
}

function inventoryItemForContent(content: StoredInventoryContent, indexedItem: InventoryItemRecord | undefined) {
  if (!indexedItem) return customInventoryItem(content)
  // L'inventaire garde sa propre copie du texte et de sa mise en forme. Elle prime,
  // car c'est elle qui reflète ce que la personne voit et modifie ; on ne retombe sur
  // celle du catalogue que si l'emplacement n'en a pas encore (inventaires remplis
  // avant que la mise en forme ne soit conservée).
  return {
    ...indexedItem,
    name: content.customName || indexedItem.name,
    description: content.customDescription || indexedItem.description,
    effect: content.effect || indexedItem.effect,
    nameHtml: content.nameHtml || (content.customName && content.customName !== indexedItem.name ? "" : indexedItem.nameHtml),
    descriptionHtml: content.descriptionHtml || (content.customDescription && content.customDescription !== indexedItem.description ? "" : indexedItem.descriptionHtml),
    effectHtml: content.effectHtml || (content.effect && content.effect !== indexedItem.effect ? "" : indexedItem.effectHtml),
    type: content.type || indexedItem.type,
    subtype: content.subtype || indexedItem.subtype,
  }
}

function buildCharacterInventory(characterId: string, workbook: InventoryWorkbook): CharacterInventoryRecord {
  const typeById = new Map(workbook.containerTypes.map((type) => [type.id, type]))
  const itemById = new Map(workbook.items.map((item) => [item.id, item]))
  const containers = workbook.containers
    .filter((container) => container.characterId === characterId && !container.deletedAt)
    .sort((left, right) => left.order - right.order)
    .map((container) => {
      const type = typeById.get(container.typeId)
      const category = inventoryContainerCategory(container, typeById)
      const slots = workbook.contents
        .filter((content) => content.characterId === characterId && content.containerId === container.id)
        .filter((content) => category === "Bourse" || category === "Esthétique" || content.index <= container.capacity || Boolean(content.itemId || content.customName))
        .sort((left, right) => {
          if (category !== "Bourse") return left.index - right.index
          const order = new Map(requiredInventoryCurrencies.map((currency, index) => [inventoryCurrencyKey(currency), index]))
          return (order.get(inventoryCurrencyKey(left.customName || left.subtype)) ?? 99) - (order.get(inventoryCurrencyKey(right.customName || right.subtype)) ?? 99) || left.index - right.index
        })
        .map((content) => ({
          id: content.id,
          index: content.index,
          itemId: content.itemId,
          quantity: content.quantity,
          equipped: content.equipped,
          modifiers: content.modifiers,
          item: inventoryItemForContent(content, itemById.get(content.itemId)),
        }))
      const used = category === "Bourse"
        ? slots.reduce((total, slot) => total + slot.quantity, 0)
        : slots.filter((slot) => slot.item && slot.quantity > 0).length
      return {
        id: container.id,
        typeId: container.typeId,
        name: container.customName || type?.name || "Contenant",
        category,
        capacity: container.capacity,
        order: container.order,
        isBase: baseInventoryTypeIds.has(container.typeId),
        used,
        slots,
      }
    })
  return {
    containerTypes: workbook.containerTypes.filter((type) => type.active),
    containers,
    items: workbook.items.filter((item) => item.active),
    ...(workbook.catalogMissing ? { catalogMissing: true } : {}),
  }
}

export async function getCharacterInventory(characterId: string) {
  return buildCharacterInventory(characterId, await ensureCharacterInventoryStorage(characterId))
}

export async function getCharacterInventorySummary(characterId: string) {
  return { ...buildCharacterInventory(characterId, await ensureCharacterInventoryStorage(characterId, false)), items: [] }
}

export async function getNpcBackpackInventory(npcId: string, includeCatalog = true) {
  return buildCharacterInventory(npcId, await ensureNpcBackpackInventoryStorage(npcId, includeCatalog))
}

export async function listNpcBackpackSummaries(npcIds: string[]) {
  const uniqueIds = [...new Set(npcIds)]
  for (const npcId of uniqueIds) await ensureNpcBackpackInventoryStorage(npcId, false)
  const workbook = await readInventoryWorkbook(false)
  const entries = uniqueIds.map((npcId) => {
    const inventory = buildCharacterInventory(npcId, workbook)
    const items = inventory.containers.flatMap((container) => container.slots.flatMap((slot) => slot.item && slot.quantity > 0 ? [{
      id: slot.item.id, name: slot.item.name, quantity: slot.quantity, notes: slot.item.notes || slot.item.description,
    }] : []))
    return [npcId, items] as const
  })
  return Object.fromEntries(entries) as Record<string, Array<{ id: string; name: string; quantity: number; notes: string }>>
}

export async function getCampaignInventory(campaignId: string) {
  return getCharacterInventory(campaignInventoryOwnerId(campaignId))
}

export async function getCampaignInventorySummary(campaignId: string) {
  return getCharacterInventorySummary(campaignInventoryOwnerId(campaignId))
}

export async function copyCharacterInventory(sourceCharacterId: string, targetCharacterId: string) {
  await withInventoryLock(async () => {
    // Relu sans cache : un inventaire déjà copié (ou créé entre-temps) ne l'est pas une seconde fois.
    const workbook = await readInventoryWorkbook(false, { fresh: true })
    const sourceContainers = activeInventoryContainers(sourceCharacterId, workbook)
    const targetAlreadyExists = activeInventoryContainers(targetCharacterId, workbook).length > 0
    if (!sourceContainers.length || targetAlreadyExists) return
    const now = new Date().toISOString()
    const containerIds = new Map(sourceContainers.map((container) => [container.id, crypto.randomUUID()]))
    await appendInventoryRows(workbook, inventoryContainerTab, sourceContainers.map((container) => inventoryContainerRow({
      ...container,
      id: containerIds.get(container.id)!,
      characterId: targetCharacterId,
      createdAt: now,
      deletedAt: "",
      rowNumber: 0,
    })))
    const clonedContents = workbook.contents
      .filter((content) => content.characterId === sourceCharacterId && containerIds.has(content.containerId))
      .map((content) => ({
        ...content,
        id: crypto.randomUUID(),
        characterId: targetCharacterId,
        containerId: containerIds.get(content.containerId)!,
        updatedAt: now,
        rowNumber: 0,
      }))
    if (clonedContents.length) await appendInventoryRows(workbook, inventoryContentsTab, clonedContents.map(inventoryContentRow))
    clearInventoryWorkbookCache()
  })
}

/** Ajoute un contenant et ses emplacements (sous le verrou), puis relit l'inventaire. */
async function appendInventoryContainer(workbook: InventoryWorkbook, container: StoredInventoryContainer) {
  await appendInventoryRows(workbook, inventoryContainerTab, [inventoryContainerRow(container)])
  const slots = missingInventorySlots(workbook, container)
  if (slots.length) await appendInventoryRows(workbook, inventoryContentsTab, slots.map(inventoryContentRow))
  clearInventoryWorkbookCache()
  return readInventoryWorkbook(true, { fresh: true })
}

function nextInventoryContainerOrder(ownerId: string, workbook: InventoryWorkbook) {
  return activeInventoryContainers(ownerId, workbook).reduce((maximum, container) => Math.max(maximum, container.order), -1) + 1
}

export async function addCharacterInventoryContainer(characterId: string, typeId: string) {
  return withInventoryLock(async () => {
    const workbook = await ensureCharacterInventoryStorage(characterId, true, { fresh: true })
    const type = workbook.containerTypes.find((candidate) => candidate.id === typeId && candidate.active)
    if (!type) throw new Error("INVENTORY_CONTAINER_TYPE_NOT_FOUND")
    return buildCharacterInventory(characterId, await appendInventoryContainer(workbook, {
      id: crypto.randomUUID(),
      characterId,
      typeId: type.id,
      customName: "",
      category: type.category,
      capacity: type.capacity,
      order: nextInventoryContainerOrder(characterId, workbook),
      createdAt: new Date().toISOString(),
      deletedAt: "",
      rowNumber: 0,
    }))
  })
}

export async function createCharacterInventoryContainer(characterId: string, input: { name: string; category: string; capacity: number }) {
  const name = input.name.trim()
  const category = parseInventoryCategory(input.category)
  const capacity = Math.trunc(input.capacity)
  if (!name || name.length > 120 || !category || !Number.isFinite(capacity) || capacity < 1 || capacity > 10000) {
    throw new Error("INVALID_INVENTORY_CONTAINER")
  }
  return withInventoryLock(async () => {
    const workbook = await ensureCharacterInventoryStorage(characterId, true, { fresh: true })
    return buildCharacterInventory(characterId, await appendInventoryContainer(workbook, {
      id: crypto.randomUUID(),
      characterId,
      typeId: "",
      customName: name,
      category,
      capacity,
      order: nextInventoryContainerOrder(characterId, workbook),
      createdAt: new Date().toISOString(),
      deletedAt: "",
      rowNumber: 0,
    }))
  })
}

export async function updateCharacterInventoryContainer(characterId: string, containerId: string, input: { name: string; capacity: number }) {
  return withInventoryLock(async () => {
    let workbook = await ensureCharacterInventoryStorage(characterId, true, { fresh: true })
    const container = workbook.containers.find((candidate) => candidate.id === containerId && candidate.characterId === characterId && !candidate.deletedAt)
    const name = input.name.trim()
    const capacity = Math.trunc(input.capacity)
    if (!container || !name || name.length > 120 || !Number.isFinite(capacity) || capacity < 1 || capacity > 10000) {
      throw new Error("INVALID_INVENTORY_CONTAINER")
    }
    workbook = await writeInventoryChanges(workbook, { containers: [[container, { ...container, customName: name, capacity }]] })
    const updated = workbook.containers.find((candidate) => candidate.id === container.id)
    if (updated && await appendMissingInventorySlots(workbook, [updated])) workbook = await readInventoryWorkbook(true, { fresh: true })
    return buildCharacterInventory(characterId, workbook)
  })
}

export async function deleteCharacterInventoryContainer(characterId: string, containerId: string) {
  return withInventoryLock(async () => {
    const workbook = await ensureCharacterInventoryStorage(characterId, true, { fresh: true })
    const container = workbook.containers.find((candidate) => candidate.id === containerId && candidate.characterId === characterId && !candidate.deletedAt)
    if (!container) throw new Error("INVENTORY_CONTAINER_NOT_FOUND")
    const category = inventoryContainerCategory(container, new Map(workbook.containerTypes.map((type) => [type.id, type])))
    // Vu sur la feuille relue à l'instant : un objet arrivé entre-temps n'est jamais caché avec son contenant.
    const hasContent = workbook.contents
      .filter((content) => content.containerId === container.id)
      .some((content) => category === "Bourse" ? content.quantity > 0 : Boolean(content.itemId || (content.customName && content.quantity > 0)))
    if (hasContent) throw new Error("INVENTORY_CONTAINER_NOT_EMPTY")
    return buildCharacterInventory(characterId, await writeInventoryChanges(workbook, { containers: [[container, { ...container, deletedAt: new Date().toISOString() }]] }))
  })
}

export async function addCharacterInventoryItem(characterId: string, itemId: string, requestedContainerId?: string, mode: InventoryOwnerMode = "character") {
  return withInventoryLock(async () => {
    // Le texte de l'objet est recopié dans la case : le catalogue à jour, pas la copie d'affichage.
    const read = () => readInventoryWorkbook(true, { fresh: true, currentCatalog: true })
    let workbook = await inventoryStorageFor(characterId, true, mode, { fresh: true, currentCatalog: true })
    const item = workbook.items.find((candidate) => candidate.id === itemId && candidate.active)
    if (!item) throw new Error("INVENTORY_ITEM_NOT_FOUND")
    const typeById = new Map(workbook.containerTypes.map((type) => [type.id, type]))
    let containers = activeInventoryContainers(characterId, workbook)
      .filter((container) => {
        if (isCampaignInventoryOwner(characterId)) return true
        const category = inventoryContainerCategory(container, typeById)
        const itemType = `${item.type} ${item.subtype}`
        return container.id === requestedContainerId
          ? canItemGoInInventoryCategory(itemType, category)
          : canItemBeAutoPlacedInInventoryCategory(itemType, category)
      })
      .sort((left, right) => left.order - right.order)
    if (mode === "npc") containers = containers.filter((container) => container.typeId === npcBackpackTypeId)
    else if (requestedContainerId) containers = containers.filter((container) => container.id === requestedContainerId)
    if (!containers.length) throw new Error("INVENTORY_NO_COMPATIBLE_CONTAINER")

    const containerIds = new Set(containers.map((container) => container.id))
    const compatibleContents = workbook.contents
      .filter((content) => content.characterId === characterId && containerIds.has(content.containerId))
      .filter((content) => {
        const container = containers.find((candidate) => candidate.id === content.containerId)
        return Boolean(container && (inventoryContainerCategory(container, typeById) === "Esthétique" || content.index <= container.capacity))
      })
      .sort((left, right) => {
        const leftOrder = containers.find((container) => container.id === left.containerId)?.order ?? 0
        const rightOrder = containers.find((container) => container.id === right.containerId)?.order ?? 0
        return leftOrder - rightOrder || left.index - right.index
      })
    const stacked = compatibleContents.find((content) => content.itemId === item.id && content.quantity < item.maxQuantity)
    let target = stacked ?? compatibleContents.find((content) => !content.itemId && !content.customName)
    if (!target) {
      const unlimitedContainer = containers.find((container) => inventoryContainerCategory(container, typeById) === "Esthétique")
      if (!unlimitedContainer) throw new Error("INVENTORY_FULL")
      const nextIndex = workbook.contents.filter((content) => content.containerId === unlimitedContainer.id).reduce((maximum, content) => Math.max(maximum, content.index), 0) + 1
      const addedSlot = makeEmptyInventorySlot(characterId, unlimitedContainer.id, nextIndex)
      await appendInventoryRows(workbook, inventoryContentsTab, [inventoryContentRow(addedSlot)])
      clearInventoryWorkbookCache()
      workbook = await read()
      target = workbook.contents.find((content) => content.id === addedSlot.id)
      if (!target) throw new Error("INVENTORY_FULL")
    }
    const now = new Date().toISOString()
    // Un exemplaire de plus sur une pile : seul le nombre change, la case garde son texte.
    const updated: StoredInventoryContent = stacked
      ? { ...target, quantity: target.quantity + 1, updatedAt: now }
      : {
          ...target,
          itemId: item.id,
          quantity: 1,
          customName: item.name,
          customDescription: item.description,
          type: item.type,
          subtype: item.subtype,
          effect: item.effect,
          nameHtml: item.nameHtml,
          descriptionHtml: item.descriptionHtml,
          effectHtml: item.effectHtml,
          updatedAt: now,
        }
    return buildCharacterInventory(characterId, await writeInventoryChanges(workbook, { contents: [[target, updated]] }))
  })
}

export async function createCharacterInventoryItem(
  characterId: string,
  requestedContainerId: string,
  input: { name: string; description: string; type: string; subtype: string; effect: string },
  mode: InventoryOwnerMode = "character",
) {
  return withInventoryLock(async () => {
    const workbook = await inventoryStorageFor(characterId, true, mode, { fresh: true })
    const container = workbook.containers.find((candidate) => candidate.characterId === characterId && !candidate.deletedAt && (mode === "npc" ? candidate.typeId === npcBackpackTypeId : candidate.id === requestedContainerId))
    const name = input.name.trim()
    const type = input.type.trim() || "Objet"
    if (!container || !name || name.length > 160 || input.description.length > 1200 || input.effect.length > 1200) throw new Error("INVALID_INVENTORY_ITEM")
    const category = inventoryContainerCategory(container, new Map(workbook.containerTypes.map((candidate) => [candidate.id, candidate])))
    if (!isCampaignInventoryOwner(characterId) && !canItemGoInInventoryCategory(`${type} ${input.subtype}`, category)) throw new Error("INVENTORY_ITEM_WRONG_CATEGORY")
    const target = workbook.contents
      .filter((content) => content.containerId === container.id && content.index <= container.capacity)
      .sort((left, right) => left.index - right.index)
      .find((content) => !content.itemId && !content.customName)
    if (!target) throw new Error("INVENTORY_FULL")
    return buildCharacterInventory(characterId, await writeInventoryChanges(workbook, { contents: [[target, {
      ...target,
      itemId: "",
      quantity: 1,
      customName: name,
      customDescription: input.description.trim(),
      type,
      subtype: input.subtype.trim(),
      effect: input.effect.trim(),
      nameHtml: "",
      descriptionHtml: "",
      effectHtml: "",
      updatedAt: new Date().toISOString(),
    }]] }))
  })
}

/** Une case vidée : plus d'objet, plus de copie de son texte. */
function emptiedInventorySlot(content: StoredInventoryContent, updatedAt: string): StoredInventoryContent {
  return { ...content, itemId: "", quantity: 0, customName: "", customDescription: "", type: "", subtype: "", effect: "", equipped: false, modifiers: "", nameHtml: "", descriptionHtml: "", effectHtml: "", updatedAt }
}

/**
 * `expected` : ce que la page montrait dans cette case. Le nombre est relu dans la feuille ;
 * s'il a changé depuis (un autre exemplaire reçu, un retrait ailleurs), rien n'est écrit.
 */
export async function setCharacterInventoryItemQuantity(characterId: string, slotId: string, quantity: number, mode: InventoryOwnerMode = "character", expected?: InventorySlotExpectation) {
  return withInventoryLock(async () => {
    const workbook = await inventoryStorageFor(characterId, true, mode, { fresh: true })
    const content = workbook.contents.find((candidate) => candidate.id === slotId && candidate.characterId === characterId)
    assertExpectedSlot(content, expected)
    if (!content || (!content.itemId && !content.customName)) throw new Error("INVENTORY_SLOT_NOT_FOUND")
    const container = workbook.containers.find((candidate) => candidate.id === content.containerId && !candidate.deletedAt)
    const typeById = new Map(workbook.containerTypes.map((type) => [type.id, type]))
    if (!container || inventoryContainerCategory(container, typeById) === "Bourse") throw new Error("INVENTORY_SLOT_NOT_FOUND")
    const item = workbook.items.find((candidate) => candidate.id === content.itemId)
    const maximum = item?.maxQuantity ?? 99
    const nextQuantity = Math.max(0, Math.min(maximum, Math.trunc(quantity)))
    const now = new Date().toISOString()
    const updated: StoredInventoryContent = nextQuantity === 0 ? emptiedInventorySlot(content, now) : { ...content, quantity: nextQuantity, updatedAt: now }
    return buildCharacterInventory(characterId, await writeInventoryChanges(workbook, { contents: [[content, updated]] }))
  })
}

/** La case d'un objet d'un personnage (hors bourse), relue sous le verrou. */
async function characterItemSlot(characterId: string, slotId: string) {
  const workbook = await ensureCharacterInventoryStorage(characterId, true, { fresh: true })
  const content = workbook.contents.find((candidate) => candidate.id === slotId && candidate.characterId === characterId)
  const container = content && workbook.containers.find((candidate) => candidate.id === content.containerId && !candidate.deletedAt)
  const typeById = new Map(workbook.containerTypes.map((type) => [type.id, type]))
  if (!content || !container || (!content.itemId && !content.customName) || inventoryContainerCategory(container, typeById) === "Bourse") {
    throw new Error("INVENTORY_SLOT_NOT_FOUND")
  }
  return { workbook, content }
}

export async function setCharacterInventoryItemEquipped(characterId: string, slotId: string, equipped: boolean) {
  return withInventoryLock(async () => {
    const { workbook, content } = await characterItemSlot(characterId, slotId)
    return buildCharacterInventory(characterId, await writeInventoryChanges(workbook, { contents: [[content, { ...content, equipped, updatedAt: new Date().toISOString() }]] }))
  })
}

export async function setCharacterInventoryItemModifiers(characterId: string, slotId: string, modifiers: string) {
  const normalized = serializeItemLinks(parseItemModifiers(modifiers), parseItemAttachments(modifiers), parseItemOverrides(modifiers), parseItemCharges(modifiers))
  if (normalized.length > 4000) throw new Error("INVALID_INVENTORY_MODIFIERS")
  return withInventoryLock(async () => {
    const { workbook, content } = await characterItemSlot(characterId, slotId)
    return buildCharacterInventory(characterId, await writeInventoryChanges(workbook, { contents: [[content, { ...content, modifiers: normalized, updatedAt: new Date().toISOString() }]] }))
  })
}

export async function updateCharacterInventoryItem(characterId: string, slotId: string, input: { name: string; description: string; type: string; subtype: string; effect: string; nameHtml?: string; descriptionHtml?: string; effectHtml?: string }, mode: InventoryOwnerMode = "character") {
  return withInventoryLock(async () => {
    const workbook = await inventoryStorageFor(characterId, true, mode, { fresh: true })
    const content = workbook.contents.find((candidate) => candidate.id === slotId && candidate.characterId === characterId)
    const container = content && workbook.containers.find((candidate) => candidate.id === content.containerId && !candidate.deletedAt)
    const name = input.name.trim()
    const type = input.type.trim() || "Objet"
    if (!content || !container || (!content.itemId && !content.customName) || !name || name.length > 160 || input.description.length > 1200 || input.effect.length > 1200) {
      throw new Error("INVALID_INVENTORY_ITEM")
    }
    const category = inventoryContainerCategory(container, new Map(workbook.containerTypes.map((candidate) => [candidate.id, candidate])))
    if (!isCampaignInventoryOwner(characterId) && !canItemGoInInventoryCategory(`${type} ${input.subtype}`, category)) throw new Error("INVENTORY_ITEM_WRONG_CATEGORY")
    return buildCharacterInventory(characterId, await writeInventoryChanges(workbook, { contents: [[content, {
      ...content,
      customName: name,
      customDescription: input.description.trim(),
      type,
      subtype: input.subtype.trim(),
      effect: input.effect.trim(),
      // La mise en forme envoyée par l'éditeur prime ; sinon celle d'origine n'est
      // conservée que pour les champs dont le texte n'a pas bougé.
      nameHtml: input.nameHtml !== undefined ? input.nameHtml : name === content.customName ? content.nameHtml : "",
      descriptionHtml: input.descriptionHtml !== undefined ? input.descriptionHtml : input.description.trim() === content.customDescription ? content.descriptionHtml : "",
      effectHtml: input.effectHtml !== undefined ? input.effectHtml : input.effect.trim() === content.effect ? content.effectHtml : "",
      updatedAt: new Date().toISOString(),
    }]] }))
  })
}

/** L'objet d'une case posé dans une autre (pile ou case vide) : tout son contenu le suit. */
function movedInventoryItem(target: StoredInventoryContent, source: StoredInventoryContent, stacked: boolean, equipped: boolean, updatedAt: string): StoredInventoryContent {
  return {
    ...target,
    itemId: source.itemId,
    quantity: stacked ? target.quantity + source.quantity : source.quantity,
    customName: source.customName,
    customDescription: source.customDescription,
    type: source.type,
    subtype: source.subtype,
    effect: source.effect,
    equipped,
    modifiers: source.modifiers,
    nameHtml: source.nameHtml,
    descriptionHtml: source.descriptionHtml,
    effectHtml: source.effectHtml,
    updatedAt,
  }
}

/** Déplace un objet entre deux contenants du même inventaire : la case d'arrivée et celle de départ en une seule écriture. */
export async function moveCharacterInventoryItem(characterId: string, slotId: string, targetContainerId: string, expected?: InventorySlotExpectation) {
  return withInventoryLock(async () => {
    let workbook = await ensureCharacterInventoryStorage(characterId, true, { fresh: true })
    const source = workbook.contents.find((content) => content.id === slotId && content.characterId === characterId)
    assertExpectedSlot(source, expected)
    if (!source || (!source.itemId && !source.customName)) throw new Error("INVENTORY_SLOT_NOT_FOUND")
    if (source.containerId === targetContainerId) return buildCharacterInventory(characterId, workbook)
    const sourceItem = workbook.items.find((item) => item.id === source.itemId) ?? customInventoryItem(source)
    if (!sourceItem) throw new Error("INVENTORY_ITEM_NOT_FOUND")
    const typeById = new Map(workbook.containerTypes.map((type) => [type.id, type]))
    const targetContainer = workbook.containers.find((container) => container.id === targetContainerId && container.characterId === characterId && !container.deletedAt)
    if (!targetContainer || (!isCampaignInventoryOwner(characterId) && !canItemGoInInventoryCategory(`${sourceItem.type} ${sourceItem.subtype}`, inventoryContainerCategory(targetContainer, typeById)))) {
      throw new Error("INVENTORY_NO_COMPATIBLE_CONTAINER")
    }
    const targetCategory = inventoryContainerCategory(targetContainer, typeById)
    const targets = workbook.contents.filter((content) => content.containerId === targetContainer.id && (targetCategory === "Esthétique" || content.index <= targetContainer.capacity)).sort((left, right) => left.index - right.index)
    const stack = source.itemId
      ? targets.find((content) => content.itemId === source.itemId && content.quantity + source.quantity <= sourceItem.maxQuantity)
      : undefined
    let target = stack ?? targets.find((content) => !content.itemId && !content.customName)
    let current = source
    if (!target && targetCategory === "Esthétique") {
      const nextIndex = targets.reduce((maximum, content) => Math.max(maximum, content.index), 0) + 1
      const addedSlot = makeEmptyInventorySlot(characterId, targetContainer.id, nextIndex)
      await appendInventoryRows(workbook, inventoryContentsTab, [inventoryContentRow(addedSlot)])
      clearInventoryWorkbookCache()
      workbook = await readInventoryWorkbook(true, { fresh: true })
      target = workbook.contents.find((content) => content.id === addedSlot.id)
      // La case de départ, relue avec le reste : elle doit tenir toujours le même objet.
      const reread = workbook.contents.find((content) => content.id === source.id)
      if (!reread || reread.itemId !== source.itemId || reread.customName !== source.customName || reread.quantity !== source.quantity) throw new Error("INVENTORY_CHANGED")
      current = reread
    }
    if (!target) throw new Error("INVENTORY_FULL")
    const now = new Date().toISOString()
    return buildCharacterInventory(characterId, await writeInventoryChanges(workbook, { contents: [
      [target, movedInventoryItem(target, current, Boolean(stack), targetCategory !== "Bourse" && current.equipped, now)],
      [current, emptiedInventorySlot(current, now)],
    ] }))
  })
}

/** Ce qui vient de changer de sac : sert à prévenir le destinataire. */
export type InventoryTransferMoved = { name: string; quantity: number; targetId: string; targetMode: InventoryOwnerMode; /** La case où l'objet est arrivé (pastille « nouveau »). */ slotId?: string }

export async function transferCharacterInventoryItem(sourceId: string, slotId: string, targetId: string, sourceMode: InventoryOwnerMode = "character", onMoved?: (moved: InventoryTransferMoved) => void, expected?: InventorySlotExpectation) {
  // Une feuille des PNJ illisible à l'instant arrête le transfert : un PNJ n'est jamais pris
  // pour un personnage (il recevait alors les cinq contenants d'un personnage).
  const targetMode: InventoryOwnerMode = !isCampaignInventoryOwner(targetId) && await getNpcById(targetId) ? "npc" : "character"
  return withInventoryLock(async () => {
    await inventoryStorageFor(sourceId, true, sourceMode)
    // Relu sous le verrou, sans cache : la case visée est vide maintenant, pas il y a une minute.
    const workbook = await inventoryStorageFor(targetId, true, targetMode, { fresh: true })
    const source = workbook.contents.find((content) => content.id === slotId && content.characterId === sourceId)
    assertExpectedSlot(source, expected)
    if (!source || (!source.itemId && !source.customName) || sourceId === targetId) throw new Error("INVENTORY_SLOT_NOT_FOUND")
    const sourceItem = workbook.items.find((item) => item.id === source.itemId) ?? customInventoryItem(source)
    if (!sourceItem) throw new Error("INVENTORY_ITEM_NOT_FOUND")
    const typeById = new Map(workbook.containerTypes.map((type) => [type.id, type]))
    const containers = activeInventoryContainers(targetId, workbook)
      .filter((container) => isCampaignInventoryOwner(targetId) || canItemBeAutoPlacedInInventoryCategory(`${sourceItem.type} ${sourceItem.subtype}`, inventoryContainerCategory(container, typeById)))
      .sort((left, right) => left.order - right.order)
    if (!containers.length) throw new Error("INVENTORY_NO_COMPATIBLE_CONTAINER")
    const containerIds = new Set(containers.map((container) => container.id))
    const targets = workbook.contents
      .filter((content) => containerIds.has(content.containerId))
      .filter((content) => {
        const container = containers.find((candidate) => candidate.id === content.containerId)
        return Boolean(container && (inventoryContainerCategory(container, typeById) === "Esthétique" || content.index <= container.capacity))
      })
      .sort((left, right) => {
        const leftOrder = containers.find((container) => container.id === left.containerId)?.order ?? 0
        const rightOrder = containers.find((container) => container.id === right.containerId)?.order ?? 0
        return leftOrder - rightOrder || left.index - right.index
      })
    const stack = source.itemId ? targets.find((content) => content.itemId === source.itemId && content.quantity + source.quantity <= sourceItem.maxQuantity) : undefined
    const target = stack ?? targets.find((content) => !content.itemId && !content.customName)
    if (!target) throw new Error("INVENTORY_FULL")
    const targetContainer = containers.find((container) => container.id === target.containerId)
    const now = new Date().toISOString()
    const equipped = targetContainer ? inventoryContainerCategory(targetContainer, typeById) !== "Bourse" && source.equipped : false
    const updated = await writeInventoryChanges(workbook, { contents: [
      [target, movedInventoryItem(target, source, Boolean(stack), equipped, now)],
      [source, emptiedInventorySlot(source, now)],
    ] })
    onMoved?.({ name: source.customName || sourceItem.name, quantity: source.quantity, targetId, targetMode, slotId: target.id })
    return buildCharacterInventory(sourceId, updated)
  })
}

/** `expectedAmount` : le montant que la page montrait ; s'il a changé depuis, rien n'est écrit. */
export async function setCharacterInventoryCurrency(characterId: string, containerId: string, currency: string, amount: number, expectedAmount?: number) {
  return withInventoryLock(async () => {
    const workbook = await ensureCharacterInventoryStorage(characterId, true, { fresh: true })
    const typeById = new Map(workbook.containerTypes.map((type) => [type.id, type]))
    const container = workbook.containers.find((candidate) => candidate.id === containerId && candidate.characterId === characterId && !candidate.deletedAt)
    if (!container || inventoryContainerCategory(container, typeById) !== "Bourse") throw new Error("INVENTORY_CONTAINER_NOT_FOUND")
    const rows = workbook.contents.filter((content) => content.containerId === container.id)
    const target = rows.find((content) => inventoryCurrencyKey(content.customName || content.subtype) === inventoryCurrencyKey(currency))
    if (!target) throw new Error("INVENTORY_CURRENCY_NOT_FOUND")
    if (expectedAmount !== undefined && target.quantity !== expectedAmount) throw new Error("INVENTORY_CHANGED")
    const otherAmount = rows.filter((content) => content.id !== target.id).reduce((total, content) => total + content.quantity, 0)
    const nextAmount = Math.max(0, Math.min(container.capacity - otherAmount, Math.trunc(amount)))
    return buildCharacterInventory(characterId, await writeInventoryChanges(workbook, { contents: [[target, { ...target, quantity: nextAmount, updatedAt: new Date().toISOString() }]] }))
  })
}

function todoRow(todo: AdminTodoRecord) {
  return [todo.id, todo.creatorUid, todo.creatorName, todo.name, todo.content, todo.priority, todo.label, todo.labelColor, todo.completed, todo.createdAt, todo.updatedAt, todo.deletedAt || ""]
}

/**
 * La ligne d'un ID, toujours lue dans la feuille elle-même au moment de s'en servir (une
 * copie en mémoire peut dater d'avant une ligne ajoutée, supprimée ou déplacée, ici ou sur
 * une autre installation : écrire à ce numéro touchait alors la fiche voisine). La colonne
 * ID est retrouvée par son en-tête ; si l'en-tête gardé ne la trouve pas, il est relu.
 */
async function findSheetRowById(spreadsheetId: string, tabName: string, id: string) {
  const wanted = id.trim()
  if (!wanted) return null
  for (const fresh of [false, true]) {
    const columns = fresh
      ? sheetColumns((await readRangesFresh(spreadsheetId, [sheetTabRange(tabName, "1:1")]))[0]?.rows[0] ?? [], ["ID"])
      : await namedColumnsOf(spreadsheetId, tabName, ["ID"])
    const at = columns.at("ID")
    if (at < 0) continue
    const letter = columnName(at + 1)
    const [read] = await readRangesFresh(spreadsheetId, [sheetTabRange(tabName, `${letter}:${letter}`)])
    const offset = (read?.rows ?? []).findIndex((row, index) => read!.startRow + index >= 2 && String(row[0] ?? "").trim() === wanted)
    if (read && offset >= 0) return read.startRow + offset
  }
  return null
}

async function todoColumns(source: JdrSheetRecord) {
  return ensureNamedColumns(source.spreadsheetId, source.tabName, await namedColumnsOf(source.spreadsheetId, source.tabName, todoSheetHeaders))
}

async function updateTodoSheetRow(todo: AdminTodoRecord) {
  const source = await ensureJdrSheet("admin_todos")
  if (!source) throw new Error("TODOS_SHEET_UNAVAILABLE")
  const rowNumber = await findSheetRowById(source.spreadsheetId, source.tabName, todo.id)
  if (!rowNumber) throw new Error("TODO_NOT_FOUND")
  await updateRanges(source.spreadsheetId, canonicalWrites(source.tabName, await todoColumns(source), `A${rowNumber}:L${rowNumber}`, [todoRow(todo)]))
}

async function findAdminTodoInGoogleSheet(id: string) {
  const source = await ensureJdrSheet("admin_todos")
  if (!source) throw new Error("TODOS_SHEET_UNAVAILABLE")
  const rowNumber = await findSheetRowById(source.spreadsheetId, source.tabName, id)
  if (!rowNumber) return null
  const columns = await namedColumnsOf(source.spreadsheetId, source.tabName, todoSheetHeaders)
  const [row] = await readRange(source.spreadsheetId, namedRowRange(source.tabName, columns, rowNumber))
  return adminTodoFromSheetRow(canonicalRow(columns, row || []))
}

const requestedAdminTodoSeed = [
  { id: "roadmap-home-definition", name: "Définir le contenu de la page d’accueil", content: "Décider ce que les joueurs, MJ et administrateurs doivent voir et pouvoir faire depuis l’accueil.", priority: "haute", label: "Structure du site", labelColor: "#6d5bd0" },
  { id: "roadmap-home-build", name: "Créer la page d’accueil", content: "Concevoir puis intégrer la page d’accueil à partir du contenu défini.", priority: "haute", label: "Structure du site", labelColor: "#6d5bd0" },
  { id: "roadmap-lore", name: "Créer la partie Lore", content: "Définir l’organisation du lore et préparer ses pages, catégories et contenus.", priority: "moyenne", label: "Univers", labelColor: "#0f766e" },
  { id: "roadmap-map", name: "Créer la partie Carte", content: "Définir les besoins de la carte puis construire son espace dans le site.", priority: "moyenne", label: "Univers", labelColor: "#0f766e" },
  { id: "roadmap-rules-vocabulary", name: "Rédiger les règles — Vocabulaire", content: "Compléter la page de vocabulaire des règles.", priority: "moyenne", label: "Règles", labelColor: "#7c3aed" },
  { id: "roadmap-rules-combat", name: "Rédiger les règles — Combat", content: "Compléter et structurer la page des règles de combat.", priority: "haute", label: "Règles", labelColor: "#7c3aed" },
  { id: "roadmap-rules-out-combat", name: "Rédiger les règles — Hors combat", content: "Compléter et structurer la page des règles hors combat.", priority: "haute", label: "Règles", labelColor: "#7c3aed" },
  { id: "roadmap-classes-sheets", name: "Créer les Google Sheets des classes", content: "Préparer les feuilles et colonnes nécessaires aux données complètes des classes.", priority: "haute", label: "Classes", labelColor: "#2563eb" },
  { id: "roadmap-classes-content", name: "Rédiger le contenu de toutes les classes", content: "Compléter les informations, capacités et contenus de chaque classe.", priority: "moyenne", label: "Classes", labelColor: "#2563eb" },
  { id: "roadmap-classes-images", name: "Renommer les illustrations de classes", content: "Uniformiser les noms des fichiers afin que le site puisse enfin les associer automatiquement aux classes.", priority: "haute", label: "Ressources", labelColor: "#be123c" },
  { id: "roadmap-import-class-resources", name: "Importer les ressources de classes", content: "Importer et organiser les ressources nécessaires aux classes.", priority: "moyenne", label: "Ressources", labelColor: "#be123c" },
  { id: "roadmap-import-npc-resources", name: "Importer les ressources de PNJ", content: "Importer et organiser les illustrations et ressources nécessaires aux PNJ.", priority: "moyenne", label: "Ressources", labelColor: "#be123c" },
  { id: "roadmap-import-creature-resources", name: "Importer les ressources de créatures", content: "Importer et organiser les illustrations et ressources nécessaires aux créatures.", priority: "moyenne", label: "Ressources", labelColor: "#be123c" },
  { id: "roadmap-npc-content", name: "Créer les PNJ", content: "Préparer les premiers PNJ et les informations qui composent leur fiche.", priority: "haute", label: "PNJ", labelColor: "#c2410c" },
  { id: "roadmap-npc-creation", name: "Créer le système de création des PNJ", content: "Construire la page et le formulaire permettant de créer et modifier un PNJ.", priority: "haute", label: "PNJ", labelColor: "#c2410c" },
  { id: "roadmap-inventory-campaign-link", name: "Lier les inventaires des personnages à la campagne", content: "Faire dépendre les transferts et les objets disponibles de la campagne liée au personnage.", priority: "haute", label: "Inventaire", labelColor: "#b45309" },
  { id: "roadmap-campaign-inventory", name: "Créer l’inventaire commun de campagne", content: "Créer un espace partagé où le groupe peut conserver les objets de la campagne.", priority: "haute", label: "Inventaire", labelColor: "#b45309" },
  { id: "roadmap-class-tab", name: "Relier l’onglet Classe aux classes", content: "Afficher dans la fiche de personnage les données de la classe réellement sélectionnée.", priority: "haute", label: "Fiche personnage", labelColor: "#4f46e5" },
  { id: "roadmap-relational-journal", name: "Finir le journal relationnel", content: "Compléter le journal de personnage et relier ses entrées relationnelles aux PNJ.", priority: "moyenne", label: "Fiche personnage", labelColor: "#4f46e5" },
  { id: "roadmap-item-effects", name: "Mettre en forme les attributs et effets des objets", content: "Définir un affichage clair pour les effets et attributs des armes, outils et équipements.", priority: "moyenne", label: "Objets", labelColor: "#0369a1" },
  { id: "roadmap-wallet-capacity", name: "Rétablir la capacité visuelle de la bourse", content: "Ajouter la barre de remplissage, afficher la capacité maximale et empêcher d’ajouter trop de monnaie.", priority: "moyenne", label: "Inventaire", labelColor: "#b45309" },
  { id: "roadmap-campaign-item-transfers", name: "Créer les transferts via l’inventaire commun", content: "Permettre d’ajouter des objets à l’inventaire commun puis de les transférer entre personnages.", priority: "haute", label: "Inventaire", labelColor: "#b45309" },
  { id: "roadmap-npc-portability", name: "Rendre les PNJ transférables", content: "Permettre de déplacer ou copier des PNJ entre le bac à sable et différentes campagnes.", priority: "moyenne", label: "PNJ", labelColor: "#c2410c" },
  { id: "roadmap-sandbox-shops", name: "Enregistrer les magasins du bac à sable dans une campagne", content: "Permettre de sélectionner une campagne de destination pour un magasin créé dans le bac à sable.", priority: "moyenne", label: "Magasins", labelColor: "#9f1239" },
  { id: "roadmap-shop-names", name: "Permettre de nommer les magasins", content: "Ajouter un nom personnalisable aux magasins de campagne afin de pouvoir les réutiliser.", priority: "basse", label: "Magasins", labelColor: "#9f1239" },
  { id: "roadmap-shop-line-reroll", name: "Relancer une seule ligne d’objet d’un magasin", content: "Permettre de remplacer individuellement un objet dans un magasin sauvegardé ou lié à une campagne.", priority: "moyenne", label: "Magasins", labelColor: "#9f1239" },
  { id: "roadmap-peoples-index", name: "Créer l’index des peuples", content: "Créer l’index des peuples et autoriser l’ajout d’un peuple inventé pour une campagne.", priority: "haute", label: "Index", labelColor: "#15803d" },
  { id: "roadmap-languages-index", name: "Créer l’index des langues", content: "Créer l’index des langues et autoriser l’ajout d’une langue inventée pour une campagne.", priority: "haute", label: "Index", labelColor: "#15803d" },
  { id: "roadmap-religions-index", name: "Créer l’index des religions", content: "Créer l’index des religions et autoriser l’ajout d’une religion inventée pour une campagne.", priority: "haute", label: "Index", labelColor: "#15803d" },
  { id: "roadmap-dashboard-roles", name: "Différencier le tableau de bord selon le rôle", content: "Créer une version joueur et une version MJ/administrateur du tableau de bord de campagne.", priority: "haute", label: "Campagne", labelColor: "#166534" },
] as const satisfies ReadonlyArray<{ id: string; name: string; content: string; priority: AdminTodoRecord["priority"]; label: string; labelColor: string }>

const deliveredRoadmapTodoIds = new Set([
  "roadmap-npc-content",
  "roadmap-npc-creation",
  "roadmap-npc-portability",
  "roadmap-sandbox-shops",
  "roadmap-shop-names",
  "roadmap-shop-line-reroll",
])
const DELIVERED_ROADMAP_SYNC_KEY = "roadmap:shops-npcs:v1"

function adminTodoFromSheetRow(row: string[]): AdminTodoRecord | null {
  if (!row[0] || !row[4]) return null
  const priority = row[5] === "haute" || row[5] === "basse" ? row[5] : "moyenne"
  const completed = row[8]?.trim().toLowerCase() === "oui" ? "oui" : "non"
  return {
    id: row[0], creatorUid: row[1] || "admin", creatorName: row[2] || "Administrateur",
    name: row[3] || "", content: row[4], priority, label: row[6] || "",
    labelColor: /^#[0-9a-f]{6}$/i.test(row[7] || "") ? row[7] : "#927640",
    completed, createdAt: row[9] || new Date().toISOString(), updatedAt: row[10] || row[9] || new Date().toISOString(),
    deletedAt: row[11] || null,
  }
}

async function adminTodosFromGoogleSheet(owner?: { creatorUid: string; creatorName: string }) {
  const sheet = await ensureJdrSheet("admin_todos")
  if (!sheet) throw new Error("TODOS_SHEET_UNAVAILABLE")
  const read = await readNamedSheet(sheet.spreadsheetId, sheet.tabName, todoSheetHeaders)
  const existingRecords = read.rows.map((row) => adminTodoFromSheetRow(canonicalRow(read.columns, row))).filter((todo): todo is AdminTodoRecord => Boolean(todo))
  if (!owner) return existingRecords

  const existingSheetIds = new Set(existingRecords.map((todo) => todo.id))
  const baseTime = Date.now()
  const missingRecords: AdminTodoRecord[] = requestedAdminTodoSeed.filter((todo) => !existingSheetIds.has(todo.id)).map((todo, index) => {
    const createdAt = new Date(baseTime + index).toISOString()
    return { ...todo, creatorUid: owner.creatorUid, creatorName: owner.creatorName, completed: "non", createdAt, updatedAt: createdAt, deletedAt: null }
  })
  if (missingRecords.length) {
    const columns = await ensureNamedColumns(sheet.spreadsheetId, sheet.tabName, read.columns)
    await appendRows(sheet.spreadsheetId, namedAppendRange(sheet.tabName, columns), canonicalRows(columns, missingRecords.map(todoRow)))
  }
  let records = [...existingRecords, ...missingRecords]
  const db = getDb()
  const [roadmapSynced] = await db.select().from(sheetIndexSyncs).where(eq(sheetIndexSyncs.key, DELIVERED_ROADMAP_SYNC_KEY)).limit(1)
  if (!roadmapSynced) {
    const now = new Date().toISOString()
    for (const todo of records.filter((record) => deliveredRoadmapTodoIds.has(record.id) && record.completed !== "oui")) {
      await updateTodoSheetRow({ ...todo, completed: "oui", updatedAt: now })
    }
    records = records.map((todo) => deliveredRoadmapTodoIds.has(todo.id) ? { ...todo, completed: "oui", updatedAt: now } : todo)
    await db.insert(sheetIndexSyncs).values({ key: DELIVERED_ROADMAP_SYNC_KEY, syncedAt: now }).onConflictDoNothing()
  }
  return records
}

export async function listAdminTodos(owner?: { creatorUid: string; creatorName: string }) {
  const records = await adminTodosFromGoogleSheet(owner)
  return records.filter((todo) => !todo.deletedAt).sort((left, right) => left.completed.localeCompare(right.completed) || left.createdAt.localeCompare(right.createdAt)).slice(0, 200)
}

export async function createAdminTodo(input: {
  creatorUid: string
  creatorName: string
  name: string
  content: string
  priority: AdminTodoRecord["priority"]
  label: string
  labelColor: string
}) {
  const content = input.content.trim()
  if (!content) throw new Error("INVALID_TODO_CONTENT")
  const now = new Date().toISOString()
  const todo: AdminTodoRecord = {
    id: crypto.randomUUID(), creatorUid: input.creatorUid, creatorName: input.creatorName,
    name: input.name.trim(), content, priority: input.priority,
    label: input.label.trim(), labelColor: /^#[0-9a-f]{6}$/i.test(input.labelColor) ? input.labelColor : "#927640",
    completed: "non", createdAt: now, updatedAt: now, deletedAt: null,
  }
  const sheet = await ensureJdrSheet("admin_todos")
  if (!sheet) throw new Error("TODOS_SHEET_UNAVAILABLE")
  const columns = await todoColumns(sheet)
  await appendRows(sheet.spreadsheetId, namedAppendRange(sheet.tabName, columns), canonicalRows(columns, [todoRow(todo)]))
  return todo
}

export async function updateAdminTodo(id: string, patch: Partial<Pick<AdminTodoRecord, "name" | "content" | "priority" | "label" | "labelColor" | "completed">>) {
  const existing = await findAdminTodoInGoogleSheet(id)
  if (!existing || existing.deletedAt) throw new Error("TODO_NOT_FOUND")
  const values = { ...patch, updatedAt: new Date().toISOString() }
  if (values.content !== undefined && !values.content.trim()) throw new Error("INVALID_TODO_CONTENT")
  if (values.labelColor !== undefined && !/^#[0-9a-f]{6}$/i.test(values.labelColor)) values.labelColor = "#927640"
  const updated = { ...existing, ...values } as AdminTodoRecord
  await updateTodoSheetRow(updated)
  return updated
}

/**
 * Corbeille partagée des personnages et campagnes. L'index local ne voyait que les
 * suppressions faites sur cette installation : un personnage mis à la corbeille
 * restait visible chez les autres MJ. Chaque mise à la corbeille, restauration ou
 * suppression définitive est désormais annoncée dans le Worker partagé, et chaque
 * installation l'applique à son index lors de la synchronisation.
 */
const TRASH_SCOPE = "corbeille"
type TrashKind = "character" | "campaign"
type TrashState = "deleted" | "restored" | "purged"

async function shareTrashState(kind: TrashKind, id: string, state: TrashState, at = new Date().toISOString()) {
  if (!sharedStoreAvailable()) return
  await writeSharedRecord(TRASH_SCOPE, `${kind}:${id}`, JSON.stringify({ state, at }))
}

async function applySharedTrash() {
  if (!sharedStoreAvailable()) return
  const records = await listSharedRecords(TRASH_SCOPE)
  const db = getDb()
  for (const record of records) {
    const separator = record.key.indexOf(":")
    const kind = record.key.slice(0, separator)
    const id = record.key.slice(separator + 1)
    let parsed: { state?: unknown; at?: unknown }
    try { parsed = JSON.parse(record.value) as typeof parsed } catch { continue }
    const at = typeof parsed.at === "string" ? parsed.at : record.updatedAt
    if (!id || (kind !== "character" && kind !== "campaign")) continue
    // La feuille fait foi : une ligne « supprimée définitivement » qui y est encore (ou y est
    // revenue, par l'historique des versions de Google Sheets) n'est pas effacée de l'index
    // local ; elle reste à la corbeille, d'où un administrateur la restaure ou la supprime.
    const stillInSheet = sheetPresence[kind === "character" ? "characters" : "campaigns"]?.ids.has(id) ?? false
    const state = parsed.state === "purged" && stillInSheet ? "deleted" : parsed.state
    if (kind === "character") {
      if (state === "deleted") await db.update(characterIndex).set({ deletedAt: at }).where(and(eq(characterIndex.id, id), isNull(characterIndex.deletedAt)))
      else if (state === "restored") await db.update(characterIndex).set({ deletedAt: null }).where(and(eq(characterIndex.id, id), isNotNull(characterIndex.deletedAt)))
      else if (state === "purged") await db.delete(characterIndex).where(eq(characterIndex.id, id))
    } else {
      if (state === "deleted") await db.update(campaignIndex).set({ deletedAt: at }).where(and(eq(campaignIndex.id, id), isNull(campaignIndex.deletedAt)))
      else if (state === "restored") await db.update(campaignIndex).set({ deletedAt: null }).where(and(eq(campaignIndex.id, id), isNotNull(campaignIndex.deletedAt)))
      else if (state === "purged") await db.delete(campaignIndex).where(eq(campaignIndex.id, id))
    }
  }
}

/**
 * L'entrée locale d'une fiche ou d'une campagne, recréée d'après sa ligne de la feuille si
 * elle manque : l'index local n'est qu'une copie, une ligne présente dans la feuille doit
 * toujours pouvoir être attribuée, mise à la corbeille ou restaurée. Faux si la feuille
 * n'a pas cette ligne.
 */
async function ensureIndexedFromSheet(kind: "character" | "campaign", id: string) {
  const db = getDb()
  if (kind === "character") {
    const [known] = await db.select({ id: characterIndex.id }).from(characterIndex).where(eq(characterIndex.id, id)).limit(1)
    if (known) return true
    const source = await charactersSource()
    if (!source) return false
    const { columns, rows } = await readCharacterColumns(source, ["Joueur", "Nom personnage", "Peuple"], { fresh: true })
    const row = rows.find((candidate) => columns.get(candidate, "ID").trim() === id)
    if (!row) return false
    await db.insert(characterIndex).values({
      id,
      ownerUid: columns.get(row, "Joueur"),
      name: columns.get(row, "Nom personnage") || "Personnage sans nom",
      subtitle: displayedMultipleValue(columns.get(row, "Peuple"), "all"),
      updatedAt: new Date().toISOString(),
    }).onConflictDoNothing()
    return true
  }
  const [known] = await db.select({ id: campaignIndex.id }).from(campaignIndex).where(eq(campaignIndex.id, id)).limit(1)
  if (known) return true
  const source = await campaignsSource()
  if (!source) return false
  const { columns, rows } = await readNamedSheet(source.spreadsheetId, source.tabName, campaignSheetHeaders, { fresh: true })
  const campaign = rows.map((row) => campaignFromRow(row, columns)).find((candidate) => candidate?.id.trim() === id)
  if (!campaign) return false
  await db.insert(campaignIndex).values(campaign).onConflictDoNothing()
  return true
}

/** Les noms et adresses des propriétaires de chaque case « Joueur » ou « MJ » (une ou plusieurs personnes). */
export async function describeOwners(cells: readonly string[], sessionToken?: string) {
  const accounts = await accountLookup(sessionToken).catch(() => new Map<string, { displayName: string; email: string }>())
  return new Map([...new Set(cells)].map((cell) => [cell, ownerLabels(cell, accounts)] as const))
}

export async function softDeleteItem(kind: "todo" | "character" | "campaign", id: string) {
  const deletedAt = new Date().toISOString()
  if (kind === "todo") {
    const todo = await findAdminTodoInGoogleSheet(id)
    if (!todo) throw new Error("TODO_NOT_FOUND")
    await updateTodoSheetRow({ ...todo, deletedAt, updatedAt: deletedAt })
    return
  }
  // Une ligne de la feuille absente de l'index local y est d'abord recopiée : sinon la mise
  // à la corbeille ne se verrait pas.
  if (!await ensureIndexedFromSheet(kind, id)) throw new Error(kind === "character" ? "CHARACTER_NOT_FOUND" : "CAMPAIGN_NOT_FOUND")
  // Annoncé d'abord aux autres installations : un échec du Worker n'est pas masqué.
  await shareTrashState(kind, id, "deleted", deletedAt)
  if (kind === "character") await getDb().update(characterIndex).set({ deletedAt }).where(eq(characterIndex.id, id))
  else await getDb().update(campaignIndex).set({ deletedAt }).where(eq(campaignIndex.id, id))
}

/** Les personnages ou campagnes à la corbeille (identifiants) : leurs lignes restent dans Sheets. */
export async function trashedItemIds(kind: "character" | "campaign") {
  const db = getDb()
  const rows = kind === "character"
    ? await db.select({ id: characterIndex.id }).from(characterIndex).where(isNotNull(characterIndex.deletedAt))
    : await db.select({ id: campaignIndex.id }).from(campaignIndex).where(isNotNull(campaignIndex.deletedAt))
  return new Set(rows.map((row) => row.id))
}

export async function listTrash() {
  await refreshIdentityIndexes()
  const db = getDb()
  const [todos, characters, campaigns] = await Promise.all([
    adminTodosFromGoogleSheet().then((records) => records.filter((todo) => Boolean(todo.deletedAt))),
    db.select().from(characterIndex).where(isNotNull(characterIndex.deletedAt)),
    db.select().from(campaignIndex).where(isNotNull(campaignIndex.deletedAt)),
  ])
  return { todos, characters, campaigns }
}

export async function restoreItem(kind: "todo" | "character" | "campaign", id: string) {
  if (kind === "todo") {
    const todo = await findAdminTodoInGoogleSheet(id)
    if (!todo) throw new Error("TODO_NOT_FOUND")
    const updatedAt = new Date().toISOString()
    await updateTodoSheetRow({ ...todo, deletedAt: null, updatedAt })
  } else if (kind === "character") {
    await shareTrashState(kind, id, "restored")
    await ensureIndexedFromSheet(kind, id)
    await getDb().update(characterIndex).set({ deletedAt: null }).where(eq(characterIndex.id, id))
  } else {
    await shareTrashState(kind, id, "restored")
    await ensureIndexedFromSheet(kind, id)
    await getDb().update(campaignIndex).set({ deletedAt: null }).where(eq(campaignIndex.id, id))
  }
}

/**
 * Supprime la ligne d'un ID. Sa place est relue dans la feuille juste avant, puis sa case
 * ID est vérifiée : si elle ne porte pas cet ID, rien n'est supprimé.
 */
async function deleteSheetRow(spreadsheetId: string, tabName: string, id: string) {
  const rowNumber = await findSheetRowById(spreadsheetId, tabName, id)
  if (!rowNumber) return
  const columns = sheetColumns((await readRangesFresh(spreadsheetId, [sheetTabRange(tabName, "1:1")]))[0]?.rows[0] ?? [], ["ID"])
  const idColumn = columns.at("ID")
  if (idColumn < 0) throw new Error("SHEET_ROW_CHECK_FAILED")
  const [check] = await readRangesFresh(spreadsheetId, [sheetTabRange(tabName, `${columnName(idColumn + 1)}${rowNumber}`)])
  if (check?.startRow !== rowNumber || (check.rows[0]?.[0] ?? "").trim() !== id) throw new Error("SHEET_ROW_CHECK_FAILED")
  const metadata = await googleSheetsJson<{ sheets?: Array<{ properties?: { sheetId?: number; title?: string } }> }>(`spreadsheets/${spreadsheetId}?fields=sheets.properties(sheetId,title)`)
  const sheetId = metadata.sheets?.find((sheet) => sheet.properties?.title === tabName)?.properties?.sheetId
  if (sheetId === undefined) return
  await googleSheetsJson(`spreadsheets/${spreadsheetId}:batchUpdate`, {
    method: "POST",
    body: JSON.stringify({ requests: [{ deleteDimension: { range: { sheetId, dimension: "ROWS", startIndex: rowNumber - 1, endIndex: rowNumber } } }] }),
  })
}

export async function permanentlyDeleteItem(kind: "todo" | "character" | "campaign", id: string) {
  if (kind === "todo") {
    const todo = await findAdminTodoInGoogleSheet(id)
    if (!todo?.deletedAt) throw new Error("TODO_NOT_FOUND")
    const source = await ensureJdrSheet("admin_todos")
    await deleteSheetRow(source.spreadsheetId, source.tabName, id)
  } else if (kind === "character") {
    // Seulement ce qui est à la corbeille : une suppression définitive ne touche jamais une
    // fiche en service, même si on la demande par erreur.
    const [trashed] = await getDb().select({ id: characterIndex.id }).from(characterIndex).where(and(eq(characterIndex.id, id), isNotNull(characterIndex.deletedAt))).limit(1)
    if (!trashed) throw new Error("ITEM_NOT_IN_TRASH")
    const source = await charactersSource()
    if (source) await deleteSheetRow(source.spreadsheetId, source.tabName, id)
    await shareTrashState("character", id, "purged")
    await getDb().delete(characterIndex).where(and(eq(characterIndex.id, id), isNotNull(characterIndex.deletedAt)))
  } else {
    const [trashed] = await getDb().select({ id: campaignIndex.id }).from(campaignIndex).where(and(eq(campaignIndex.id, id), isNotNull(campaignIndex.deletedAt))).limit(1)
    if (!trashed) throw new Error("ITEM_NOT_IN_TRASH")
    const source = await campaignsSource()
    if (source) await deleteSheetRow(source.spreadsheetId, source.tabName, id)
    await shareTrashState("campaign", id, "purged")
    await getDb().delete(campaignIndex).where(and(eq(campaignIndex.id, id), isNotNull(campaignIndex.deletedAt)))
  }
}

