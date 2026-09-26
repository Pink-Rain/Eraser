import {
  googleServiceAuthorizedFetch,
  googleServiceConfigured,
  runtimeEnv,
} from "@/lib/google-service-account"
import { driveImageFormula, isGeneratedObjectIcon, objectIconDriveFileId, suggestedObjectIconKey } from "@/lib/object-icons"
import { ensureObjectIconsOnDrive } from "@/lib/object-icon-drive"
import { cache } from "react"
import { and, desc, eq, inArray, isNotNull, isNull } from "drizzle-orm"
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
import { worldIndexDefinitions } from "@/lib/world-index-definitions"
import { forgetJdrSheet, getJdrSheet, saveJdrSheet, type JdrSheetKey, type JdrSheetRecord } from "@/lib/jdr-sheets"
import { googleOAuthAuthorizedFetch, warmGoogleOAuthAccessToken } from "@/lib/google-oauth"
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
  characterCriticalValueIndex,
  characterCharacteristics,
  characterSheetHeaders,
  characterSecondaryCalculatedFields,
  characterSecondaryCalculationValueIndex,
  characterSkills,
  characterSkillValueIndex,
  characterValueHeaders,
  innateCharacterSkills,
} from "@/lib/character-sheet-schema"
import {
  baseInventoryContainerTypes,
  baseInventoryTypeIds,
  canItemBeAutoPlacedInInventoryCategory,
  canItemGoInInventoryCategory,
  inventoryCategories,
  inventoryWorkbookTabs,
  parseInventoryCategory,
  type CharacterInventoryRecord,
  type InventoryCategory,
  type InventoryContainerTypeRecord,
  type InventoryItemRecord,
  type InventoryTransferTarget,
} from "@/lib/inventory-schema"
import { parseItemModifiers, serializeItemModifiers } from "@/lib/item-modifiers"
import type { CampaignNpcRecord, CityKey, GeneratedShop, SavedShopRecord, ShopKey, ShopSize } from "@/lib/shop-schema"
import type { TabletopActivityRecord, TabletopEntityRecord, TabletopFolderRecord, TabletopMapRecord, TabletopTokenRecord } from "@/lib/tabletop-schema"
import { normalizeGoogleSheetRows, sheetRangeStartRow, type GoogleSheetCellValue } from "@/lib/google-sheet-values"
import { getIdentityLink, identityUidsForUser } from "@/lib/identity-links"

export type CharacterRecord = {
  id: string
  ownerUid: string
  name: string
  subtitle: string
  updatedAt: string
  campaigns: Array<{ id: string; name: string; accentColor: string }>
}

export type CharacterSheetRecord = CharacterRecord & { values: string[] }

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

export const classTypes = ["Solide", "Protectrice", "Brutale", "Fourbe", "Éclectique"] as const
export type ClassType = (typeof classTypes)[number]
export const classDifficulties = ["Facile", "Intermédiaire", "Difficile", "Expert", "X"] as const
export type ClassDifficulty = (typeof classDifficulties)[number]

type ClassSheetRow = [
  string,
  ClassType,
  string,
  string,
  string,
  string,
  string,
  ClassDifficulty,
  number,
]

export const defaultClassRows: ClassSheetRow[] = [
  ["CLA-0001", "Solide", "Berserker", "", "Scarification", "Régénération de points de vie", "Dommages", "Intermédiaire", 100],
  ["CLA-0002", "Solide", "Guerrier·e", "", "Armure", "Maîtrise de la lame", "Aura de guerre", "Facile", 100],
  ["CLA-0003", "Solide", "Paladin·e obscur·e", "", "Forme d’ombre", "Colosse", "Soin", "Facile", 100],
  ["CLA-0004", "Solide", "Géomancien·ne", "", "Armure", "Maîtrise de la roche", "Golem", "X", 0],
  ["CLA-0005", "Solide", "Paladin·e de la lumière", "", "Forme de lumière", "Prière", "Soin", "Facile", 0],
  ["CLA-0006", "Protectrice", "Mage de la terre", "", "Invocation sylvestre", "Soin et bonus", "Bénédiction naturelle", "Facile", 50],
  ["CLA-0007", "Protectrice", "Mage de l’eau", "", "Maîtrise de l’eau", "Soin et bouclier", "Contre-sort", "Intermédiaire", 95],
  ["CLA-0008", "Protectrice", "Oracle", "", "Maîtrise du temps", "Sibylle", "Contrôle", "Facile", 100],
  ["CLA-0009", "Protectrice", "Barde", "", "Musicien·ne", "Enchanteur·euse", "Contrôle", "Difficile", 0],
  ["CLA-0010", "Protectrice", "Ingénieur·e", "", "X", "X", "X", "Expert", 0],
  ["CLA-0011", "Brutale", "Mage de la mort", "", "Sibylle", "Nécromancie", "Soin", "Intermédiaire", 100],
  ["CLA-0012", "Brutale", "Mage de sang", "", "Scarification", "Invocation sanguine", "Puits de sang", "Difficile", 95],
  ["CLA-0013", "Brutale", "Adepte d’HEPO", "", "Transformation démoniaque", "Perte de contrôle", "Ravage", "Difficile", 100],
  ["CLA-0014", "Brutale", "Samouraï", "", "Duelliste", "Rapide comme l’éclair", "Lame dansante", "Facile", 100],
  ["CLA-0015", "Brutale", "Cartomancien·ne", "", "Aléatoire", "Critique", "Déplacement", "Expert", 100],
  ["CLA-0016", "Fourbe", "Serviteuse de Kimtai", "", "Déguisement", "Assassinat", "Poison", "Facile", 100],
  ["CLA-0017", "Fourbe", "Illusionniste", "", "Clonage", "Hypnotisme", "Mirage", "Intermédiaire", 90],
  ["CLA-0018", "Fourbe", "Roublard·e", "", "Bombe", "Vol à la tire", "Mensonge", "Intermédiaire", 100],
  ["CLA-0019", "Fourbe", "Sorcier·ère", "", "Mauvais œil", "Gris-gris", "Vaudou", "Intermédiaire", 0],
  ["CLA-0020", "Fourbe", "Mage de l’air", "", "Déplacement", "Intouchable", "X", "Intermédiaire", 0],
  ["CLA-0021", "Éclectique", "Moine élémentaire", "", "Maîtrise des sphères élémentaires", "Rapide comme l’éclair", "Poing de fer", "Difficile", 100],
  ["CLA-0022", "Éclectique", "Druide", "", "Métamorphe animal", "Bénédiction naturelle", "Instinct animal", "Intermédiaire", 100],
  ["CLA-0023", "Éclectique", "Rôdeur·euse", "", "Maîtrise des pièges", "Compagnon animal", "Archer·ère", "Facile", 100],
  ["CLA-0024", "Éclectique", "Alchimiste", "", "Mutagène", "Abomination", "Expérience hasardeuse", "Expert", 0],
  ["CLA-0025", "Éclectique", "Chamane", "", "Totem élémentaire", "Aura chamanique", "Bénédiction naturelle", "Difficile", 0],
]

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
const MISSING_JDR_SHEET_RETRY_MS = 60_000

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
const IDENTITY_INDEX_SYNC_TTL_MS = 60_000
// Une page n'attend pas plus longtemps la resynchronisation : au-delà, elle
// s'affiche avec l'index local et la synchro se termine en arrière-plan.
const IDENTITY_INDEX_SYNC_WAIT_MS = 2_500

async function ensureIdentityIndexes(options: { maxAgeMs?: number; waitMs?: number } = {}) {
  if (Date.now() - identityIndexSyncedAt < (options.maxAgeMs ?? IDENTITY_INDEX_SYNC_TTL_MS)) return
  if (!identityIndexSyncPromise) {
    identityIndexSyncPromise = syncExistingIdentityIndexes()
      .then(() => { identityIndexSyncedAt = Date.now() })
      .catch((error) => console.error("IDENTITY_INDEX_SYNC_FAILED", error instanceof Error ? error.message : "UNKNOWN_ERROR"))
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
  return ensureIdentityIndexes({ waitMs: IDENTITY_INDEX_SYNC_WAIT_MS })
}

async function charactersSource() {
  const runtime = runtimeEnv()
  const spreadsheetId = runtime.GOOGLE_CHARACTERS_SHEET_ID
  const tab = runtime.GOOGLE_CHARACTERS_TAB || "Personnages"
  if (spreadsheetId) return { spreadsheetId, tabName: tab, range: `${tab}!A:E` }
  const stored = await resolveJdrSheet("characters")
  return stored ? { spreadsheetId: stored.spreadsheetId, tabName: stored.tabName, range: `${stored.tabName}!A:E` } : null
}

async function classesSource() {
  const runtime = runtimeEnv()
  const spreadsheetId = runtime.GOOGLE_CLASSES_SHEET_ID
  const tab = runtime.GOOGLE_CLASSES_TAB || "Classes"
  if (spreadsheetId) return { spreadsheetId, range: `${tab}!A:K` }
  const stored = await resolveJdrSheet("classes")
  return stored ? { spreadsheetId: stored.spreadsheetId, range: `${stored.tabName}!A:K` } : null
}

async function campaignsSource() {
  const stored = await resolveJdrSheet("campaigns")
  return stored ? { spreadsheetId: stored.spreadsheetId, range: `${stored.tabName}!A:F` } : null
}

async function googleSheetsFetch(path: string, init?: RequestInit) {
  const url = `https://sheets.googleapis.com/v4/${path}`
  let response: Response | null = null
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      response = await googleOAuthAuthorizedFetch(url, init)
    } catch (error) {
      if (!(error instanceof Error) || error.message !== "GOOGLE_DRIVE_NOT_AUTHORIZED") throw error
      response = await googleServiceAuthorizedFetch(url, init)
    }
    if (![429, 500, 502, 503, 504].includes(response.status) || attempt === 2) break
    await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)))
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
  return response
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
const rangeReadCache = new Map<string, { expiresAt: number; promise: Promise<string[][]> }>()

function rangeCacheKey(
  spreadsheetId: string,
  range: string,
  valueRenderOption?: "FORMATTED_VALUE" | "UNFORMATTED_VALUE" | "FORMULA",
) {
  return `${spreadsheetId}:${range}:${valueRenderOption || "FORMATTED_VALUE"}`
}

function cacheRangePromise(cacheKey: string, promise: Promise<string[][]>) {
  if (rangeReadCache.size >= 200) {
    const oldestKey = rangeReadCache.keys().next().value
    if (oldestKey) rangeReadCache.delete(oldestKey)
  }
  rangeReadCache.set(cacheKey, { expiresAt: Date.now() + RANGE_CACHE_MS, promise })
  promise.catch(() => rangeReadCache.delete(cacheKey))
  return promise
}

export function clearSpreadsheetReadCache(spreadsheetId: string) {
  const prefix = `${spreadsheetId}:`
  for (const key of rangeReadCache.keys()) {
    if (key.startsWith(prefix)) rangeReadCache.delete(key)
  }
}

export async function readRange(
  spreadsheetId: string,
  range: string,
  valueRenderOption?: "FORMATTED_VALUE" | "UNFORMATTED_VALUE" | "FORMULA",
) {
  const cacheKey = rangeCacheKey(spreadsheetId, range, valueRenderOption)
  const cached = rangeReadCache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) return cached.promise
  const parameters = valueRenderOption
    ? `?valueRenderOption=${encodeURIComponent(valueRenderOption)}`
    : ""
  const promise = googleSheetsFetch(
    `spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}${parameters}`,
  ).then(async (response) => normalizeGoogleSheetRows(((await response.json()) as ValuesResponse).values))
  return cacheRangePromise(cacheKey, promise)
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
    if (cached && cached.expiresAt > Date.now()) results[index] = cached.promise
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
export async function readFormattedSheet(spreadsheetId: string, candidates: string[], options: { light?: boolean; range?: string } = {}): Promise<FormattedSheet> {
  let lastError: unknown = null
  for (const candidate of candidates) {
    try {
      const parameters = new URLSearchParams({
        includeGridData: "true",
        ranges: `'${candidate.replaceAll("'", "''")}'${options.range ? `!${options.range}` : ""}`,
        fields: `sheets(properties(sheetId,title),data(startRow,startColumn,rowData(values(${options.light ? LIGHT_CELL_FIELDS : FULL_CELL_FIELDS}))))`,
      })
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

export async function updateCellColors(input: {
  spreadsheetId: string
  sheetId: number
  rowNumber: number
  column: number
  background: string
  foreground: string
}) {
  const background = hexColorToRgb(input.background)
  const foreground = hexColorToRgb(input.foreground)
  if (!background || !foreground) return
  await googleSheetsJson(`spreadsheets/${input.spreadsheetId}:batchUpdate`, {
    method: "POST",
    body: JSON.stringify({ requests: [{ repeatCell: {
      range: {
        sheetId: input.sheetId,
        startRowIndex: input.rowNumber - 1,
        endRowIndex: input.rowNumber,
        startColumnIndex: input.column,
        endColumnIndex: input.column + 1,
      },
      cell: { userEnteredFormat: { backgroundColorStyle: { rgbColor: background }, textFormat: { foregroundColorStyle: { rgbColor: foreground } } } },
      fields: "userEnteredFormat.backgroundColorStyle,userEnteredFormat.textFormat.foregroundColorStyle",
    } }] }),
  })
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

export async function listObjectIndexTables(): Promise<ObjectIndexTable[]> {
  if (objectIndexTableCache && objectIndexTableCache.expiresAt > Date.now()) return objectIndexTableCache.tables
  const files = await objectIndexSpreadsheetFiles()
  const results = await Promise.all(files.map(async (file) => {
    try {
      const metadata = await googleSheetsJson<{
        sheets?: Array<{ properties?: { sheetId?: number; title?: string; gridProperties?: { columnCount?: number } } }>
      }>(`spreadsheets/${file.id}?fields=sheets.properties(sheetId,title,gridProperties.columnCount)`)
      const sheets = (metadata.sheets ?? []).flatMap((sheet) => {
        const sheetId = sheet.properties?.sheetId
        const tabName = sheet.properties?.title
        return sheetId === undefined || !tabName ? [] : [{ sheetId, tabName }]
      })
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
      return { tables: sheets.map((sheet) => {
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
      }), error: null }
    } catch (error) {
      return { tables: [] as ObjectIndexTable[], error }
    }
  }))
  const tables = fillMissingObjectIndexHeaders(results.flatMap((result) => result.tables))
  const firstError = results.find((result) => result.error)?.error
  if (!tables.length && firstError) throw firstError
  tables.sort((left, right) => left.fileName.localeCompare(right.fileName, "fr") || left.tabName.localeCompare(right.tabName, "fr"))
  objectIndexTableCache = { expiresAt: Date.now() + OBJECT_INDEX_CACHE_MS, tables }
  scheduleObjectIndexIconSync(tables)
  return tables
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
    return { ...table, headers }
  })
}

/** « #REF! », « #N/A »… : une formule cassée dans Sheets, pas une vraie valeur. */
function isSheetErrorValue(value: string) {
  return /^#(REF!|N\/A|VALUE!|NAME\?|DIV\/0!|NUM!|NULL!|ERROR!)$/i.test(value.trim())
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

function clearObjectIndexTableCache() {
  objectIndexTableCache = null
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
  await updateFormattedCell({ spreadsheetId: fileId, sheetId: table.sheetId, rowNumber, column, html })
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
  await appendRows(fileId, sheetTabRange(tabName, `A:${columnName(table.headers.length)}`), [values])
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

function isGeneratedObjectDescription(description: string, name: string) {
  return !description || oldGeneratedDescriptions.has(description) || description.includes(`« ${name} »`)
}

export async function refineGeneratedObjectDescriptions() {
  const tables = await listObjectIndexTables()
  let descriptionsRefined = 0
  const used = new Set<string>()
  for (const table of tables) {
    const descriptionColumn = table.headers.findIndex((header) => normalizedHeader(header) === "description")
    const iconColumn = table.headers.findIndex((header) => ["icone", "icon"].includes(normalizedHeader(header)))
    if (descriptionColumn < 0 && iconColumn < 0) continue
    const updates: Array<{ range: string; values: Array<Array<string | number | boolean>> }> = []
    for (const row of table.rows) {
      const name = objectIndexCell(table, row, ["Nom", "Nom de l'objet", "Objet", "Arme", "Équipement", "Equipement", "Ressource", "Livre", "Titre"]).trim()
      if (!name) continue
      const type = objectIndexCell(table, row, ["Type", "Catégorie", "Categorie"]) || inferredObjectType(table)
      const subtype = objectIndexCell(table, row, ["Sous-type", "Sous type", "Subtype"])
      const effect = objectIndexCell(table, row, ["Effet", "Effets", "Propriété", "Proprieté", "Propriétés", "Proprietes"])
      if (descriptionColumn >= 0) {
        const currentDescription = (row.values[descriptionColumn] || "").trim()
        if (isGeneratedObjectDescription(currentDescription, name)) {
          let description = suggestedObjectDescription(name, type, subtype, effect, `${table.fileId}:${table.sheetId}:${row.rowNumber}`)
          let attempt = 1
          while (used.has(description) && attempt <= 128) {
            description = suggestedObjectDescription(name, type, subtype, effect, `${table.fileId}:${table.sheetId}:${row.rowNumber}:${attempt}`)
            attempt += 1
          }
          if (used.has(description)) description = `${description} Un poinçon de ${row.rowNumber} points se cache sous la base.`
          used.add(description)
          if (description !== currentDescription) {
            updates.push({ range: sheetTabRange(table.tabName, `${columnName(descriptionColumn + 1)}${row.rowNumber}`), values: [[description]] })
            descriptionsRefined += 1
          }
        }
      }
    }
    await updateRanges(table.fileId, updates)
  }
  clearObjectIndexTableCache()
  return { descriptionsRefined }
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
  for (const table of await listObjectIndexTables()) {
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

async function listCharactersForUserUncached(uid: string) {
  await refreshIdentityIndexes()
  const db = getDb()
  const identityUids = await identityUidsForUser(uid)
  let characters = await db.select().from(characterIndex)
    .where(and(inArray(characterIndex.ownerUid, identityUids), isNull(characterIndex.deletedAt))).orderBy(desc(characterIndex.updatedAt)).limit(100)
  if (characters.length) return decorateCharacters(characters)
  const syncKey = `characters:${identityUids.slice().sort().join(":")}`
  const [sync] = await db.select().from(sheetIndexSyncs).where(eq(sheetIndexSyncs.key, syncKey)).limit(1)
  if (!sync) {
    const source = await charactersSource()
    if (source) {
      const rows = await readRange(source.spreadsheetId, source.range)
      for (const row of rows.slice(1).filter((item) => item[0] && identityUids.includes(item[1]))) {
        await db.insert(characterIndex).values({
          id: row[0], ownerUid: row[1], name: row[2] || "Personnage sans nom",
          subtitle: row[3] || "", updatedAt: row[4] || new Date().toISOString(),
        }).onConflictDoUpdate({
          target: characterIndex.id,
          set: { ownerUid: row[1], name: row[2] || "Personnage sans nom", subtitle: row[3] || "", updatedAt: row[4] || new Date().toISOString(), deletedAt: null },
        })
      }
    }
    await db.insert(sheetIndexSyncs).values({ key: syncKey }).onConflictDoNothing()
    characters = await db.select().from(characterIndex)
      .where(and(inArray(characterIndex.ownerUid, identityUids), isNull(characterIndex.deletedAt))).orderBy(desc(characterIndex.updatedAt)).limit(100)
  }
  return decorateCharacters(characters)
}

export const listCharactersForUser = cache(listCharactersForUserUncached)

export async function getCharacterForUser(uid: string, id: string) {
  const listed = (await listCharactersForUser(uid)).find((character) => character.id === id)
  if (listed) return listed
  const identityUids = await identityUidsForUser(uid)
  const [character] = await getDb().select().from(characterIndex)
    .where(and(inArray(characterIndex.ownerUid, identityUids), eq(characterIndex.id, id), isNull(characterIndex.deletedAt))).limit(1)
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
    .from(campaignIndex).where(and(inArray(campaignIndex.mjUid, identityUids), isNull(campaignIndex.deletedAt))).orderBy(desc(campaignIndex.updatedAt)).limit(100)
  if (campaigns.length) return campaigns
  const syncKey = `campaigns:${identityUids.slice().sort().join(":")}`
  const [sync] = await db.select().from(sheetIndexSyncs).where(eq(sheetIndexSyncs.key, syncKey)).limit(1)
  if (!sync) {
    const source = await campaignsSource()
    if (source) {
      const rows = await readRange(source.spreadsheetId, source.range)
      for (const row of rows.slice(1).filter((item) => item[0] && identityUids.includes(item[1]))) {
        await db.insert(campaignIndex).values({
          id: row[0], mjUid: row[1], name: row[2] || "Campagne sans nom", description: row[3] || "", bannerUrl: row[4] || "", accentColor: row[5] || "#927640",
        }).onConflictDoUpdate({ target: campaignIndex.id, set: { mjUid: row[1], name: row[2] || "Campagne sans nom", description: row[3] || "", bannerUrl: row[4] || "", accentColor: row[5] || "#927640", updatedAt: new Date().toISOString(), deletedAt: null } })
      }
    }
    await db.insert(sheetIndexSyncs).values({ key: syncKey }).onConflictDoNothing()
    campaigns = await db.select({ id: campaignIndex.id, mjUid: campaignIndex.mjUid, name: campaignIndex.name, description: campaignIndex.description, bannerUrl: campaignIndex.bannerUrl, accentColor: campaignIndex.accentColor, updatedAt: campaignIndex.updatedAt })
      .from(campaignIndex).where(and(inArray(campaignIndex.mjUid, identityUids), isNull(campaignIndex.deletedAt))).orderBy(desc(campaignIndex.updatedAt)).limit(100)
  }
  return campaigns
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
    .where(and(eq(characterIndex.id, id), inArray(campaignIndex.mjUid, identityUids), isNull(characterIndex.deletedAt), isNull(campaignIndex.deletedAt))).limit(1))[0]
  // Un MJ joue aussi : ses propres personnages lui restent ouverts, même hors de ses
  // campagnes (sinon la fiche qu'il vient de créer répondait « introuvable »).
  const readOwn = async () => (await getDb().select().from(characterIndex)
    .where(and(eq(characterIndex.id, id), inArray(characterIndex.ownerUid, identityUids), isNull(characterIndex.deletedAt))).limit(1))[0]
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
    .from(campaignIndex).where(and(inArray(campaignIndex.mjUid, identityUids), eq(campaignIndex.id, id), isNull(campaignIndex.deletedAt))).limit(1)
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
  const tabName = source.range.split("!")[0]
  await ensureSheetColumnCount(source.spreadsheetId, tabName, 11)
  const [headers = []] = await readRange(source.spreadsheetId, `${tabName}!A1:K1`, "FORMULA")
  if (normalizedHeader(headers[9] || "") !== "couleur d accent sombre" || normalizedHeader(headers[10] || "") !== "couleur d accent clair") {
    await updateRange(source.spreadsheetId, `${tabName}!J1:K1`, [["Couleur d’accent sombre", "Couleur d’accent clair"]])
  }
  const [rows, imageNotes] = await Promise.all([
    readRange(source.spreadsheetId, source.range, "FORMULA"),
    readCellNotes(source.spreadsheetId, `${tabName}!D2:D1000`),
  ])
  let nativeImageUrls: string[] = []
  try {
    nativeImageUrls = await Promise.race([
      readClassImagesWithAppsScript({
        spreadsheetId: source.spreadsheetId,
        tabName,
        startRow: 2,
        rowCount: Math.max(0, rows.length - 1),
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
    .slice(1)
    .map((row, index) => ({
      row,
      imageNote: imageNotes[index] || "",
      nativeImageUrl: nativeImageUrls[index] || "",
    }))
    .filter(({ row }) => row[0] && row[2])
    .map<ClassRecord>(({ row, imageNote, nativeImageUrl }) => {
      const type = classTypes.includes(row[1] as ClassType) ? (row[1] as ClassType) : "Éclectique"
      return {
        id: row[0],
        type,
        name: row[2],
        image: imageNote || nativeImageUrl || row[3] || "",
        keywords: [row[4] || "", row[5] || "", row[6] || ""],
        difficulty: classDifficulties.includes(row[7] as ClassDifficulty)
          ? (row[7] as ClassDifficulty)
          : "X",
        completion: Math.min(100, Math.max(0, Math.round(numberFromCell(row[8], 0)))),
        ...classAccents(type, row[9], row[10]),
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
  const tabName = source.range.split("!")[0]
  const rows = await readRange(source.spreadsheetId, `${tabName}!A2:A1000`)
  const rowById = new Map(rows.map((row, index) => [row[0], index + 2]))
  await updateRanges(source.spreadsheetId, safeUpdates.flatMap((item) => {
    const rowNumber = rowById.get(item.id)
    return rowNumber ? [{ range: sheetTabRange(tabName, `J${rowNumber}:K${rowNumber}`), values: [[item.dark, item.light]] }] : []
  }))
  const updatedAt = new Date().toISOString()
  for (const item of safeUpdates) {
    if (!rowById.has(item.id)) continue
    await getDb().update(classIndex).set({ accentDark: item.dark, accentLight: item.light, updatedAt }).where(eq(classIndex.id, item.id))
  }
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

export async function getClassById(id: string) {
  const classes = await listClasses()
  return classes.find((item) => item.id === id) ?? null
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

export type ClassImageSyncResult = {
  folder: DriveFile
  matched: Array<{ classId: string; className: string; fileName: string }>
  placeholders: string[]
  unmatchedClasses: string[]
  unusedFiles: string[]
  updated: number
  skipped: boolean
}

export async function syncClassImagesFromDrive(options?: { onlyIfMissing?: boolean }) {
  const source = await classesSource()
  if (!source) throw new Error("CLASSES_SHEET_NOT_CONFIGURED")
  const tabName = source.range.split("!")[0]
  const [sheetRows, imageNotes] = await Promise.all([
    readRange(source.spreadsheetId, source.range, "FORMULA"),
    readCellNotes(source.spreadsheetId, `${tabName}!D2:D1000`),
  ])
  const rows = sheetRows
    .slice(1)
    .map((row, index) => ({ row, imageNote: imageNotes[index] || "", sheetRow: index + 2 }))
    .filter(({ row }) => row[0] && row[2])

  if (
    options?.onlyIfMissing &&
    rows.length > 0 &&
    rows.every(({ imageNote }) => imageNote.startsWith("ERASER_DRIVE_FILE_ID:"))
  ) {
    return {
      folder: { id: "", name: CLASS_IMAGES_FOLDER, mimeType: "application/vnd.google-apps.folder" },
      matched: [],
      placeholders: [],
      unmatchedClasses: [],
      unusedFiles: [],
      updated: 0,
      skipped: true,
    } satisfies ClassImageSyncResult
  }

  const locatedFolder = await findDriveFolderByName(CLASS_IMAGES_FOLDER)
  const folder = locatedFolder ?? {
    id: "",
    name: "Images du Drive",
    mimeType: "application/vnd.google-apps.folder",
  }
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
  const matched: ClassImageSyncResult["matched"] = []
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

  return {
    folder,
    matched,
    placeholders,
    unmatchedClasses,
    unusedFiles: regularFiles.filter((file) => !usedFileIds.has(file.id)).map((file) => file.name),
    updated: actions.length,
    skipped: false,
  } satisfies ClassImageSyncResult
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

const npcSheetHeaders = [
  "ID", "Page lié", "Nom du PNJ", "Classe / métier", "Vie actuelle", "Vie totale", "Rapidité",
  "Force", "Dextérité", "Intelligence", "Sagesse", "Charisme", "Capacité de combat",
  "Capacité de tir", "Capacité magique", "Force mentale", "Constitution", "Peuple", "Genre", "Âge",
  "Poids", "Taille", "Notes MJ", "Portrait", "Notes joueurs", "Inventaire JSON (archive)",
  "Ajouté au créateur de session", "Créé le", "Modifié le", "Dossier", "Dans le groupe joueur", "PNJ important", "Créé par",
  // Ajoutées à la fin : aucune colonne existante ne bouge.
  "Titre", "Histoire / Lore",
  // Sorts du PNJ, noms séparés par des virgules comme pour les créatures.
  "Sorts actifs", "Sorts passifs",
]
/** Dernière colonne de la feuille des PNJ (AK) : suit les en-têtes quand on en ajoute. */
const NPC_LAST_COLUMN = "AK"

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
    headers: [
      "ID",
      "Type",
      "Nom de la classe",
      "Image",
      "Mots-clés 1",
      "Mots-clés 2",
      "Mots-clés 3",
      "Difficulté",
      "Finition",
      "Couleur d’accent sombre",
      "Couleur d’accent clair",
    ],
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
    headers: ["ID", "MJ", "Nom de la campagne", "Description", "Bannière", "Couleur d’accent"],
    columnWidths: [160, 200, 280, 420, 340, 140],
  },
  {
    key: "admin_todos",
    name: "To-do administration",
    tabName: "To-do",
    frozenColumns: 3,
    headers: ["ID", "ID admin", "Admin créateur", "Nom", "Contenu", "Priorité", "Étiquette", "Couleur", "Réalisée", "Créée le", "Modifiée le", "Supprimée le"],
    columnWidths: [160, 200, 180, 220, 360, 110, 150, 100, 100, 170, 170, 170],
  },
  {
    key: "campaign_characters",
    name: "Personnages des campagnes",
    tabName: "Personnages par campagne",
    frozenColumns: 2,
    headers: ["ID campagne", "ID personnage"],
    columnWidths: [180, 180],
  },
  {
    key: "character_relations",
    name: "Relations des personnages",
    tabName: "Relations",
    frozenColumns: 2,
    headers: ["ID", "ID personnage", "Type de cible", "ID cible", "Nom", "Niveau", "Notes personnelles", "Créé par", "ID campagne", "Créée le", "Modifiée le"],
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
    headers: ["ID", "Page lié", "Ville", "Taille de ville", "Type de magasin", "Nom du magasin", "Taille du magasin", "Objets JSON", "Ajouté à la campagne", "ID PNJ lié", "Créé le", "Modifié le"],
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
  ...Object.values(worldIndexDefinitions).map((index): StructuredSheetDefinition => ({
    key: index.key,
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

  const [headers = []] = await readRange(spreadsheetId, `${tabName}!A1:${NPC_LAST_COLUMN}1`)
  const alreadyCurrent = npcSheetHeaders.every((header, index) => headers[index] === header)
  if (!alreadyCurrent) {
    const rowOneContainsData = headers.some((value) => value.trim()) && headers[0] !== "ID"
    const formattingRequests: Array<Record<string, unknown>> = [
      ...(rowOneContainsData ? [{ insertDimension: { range: { sheetId: properties.sheetId, dimension: "ROWS", startIndex: 0, endIndex: 1 }, inheritFromBefore: false } }] : []),
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
    const legacyV1 = headers[0] === "ID" && headers[1] === "ID campagne"
    const legacyV2 = headers[0] === "ID" && headers[1] === "Page lié" && headers[18] === "Âge" && headers[28] !== "Modifié le"
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
  const requests: Array<Record<string, unknown>> = []
  for (const tab of inventoryWorkbookTabs) {
    const sheet = properties.find((candidate) => candidate.title === tab.name)
    if (sheet?.sheetId === undefined) throw new Error("INVENTORY_SHEET_TAB_UNAVAILABLE")
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
    tab.widths.forEach((pixelSize, index) => {
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
    if (tab.name === "Types de contenants") {
      requests.push(
        {
          setDataValidation: {
            range: { sheetId: sheet.sheetId, startRowIndex: 1, endRowIndex: rowCount, startColumnIndex: 2, endColumnIndex: 3 },
            rule: { condition: { type: "ONE_OF_LIST", values: inventoryCategories.map((value) => ({ userEnteredValue: value })) }, strict: true, showCustomUi: true },
          },
        },
        {
          setDataValidation: {
            range: { sheetId: sheet.sheetId, startRowIndex: 1, endRowIndex: rowCount, startColumnIndex: 5, endColumnIndex: 6 },
            rule: { condition: { type: "ONE_OF_LIST", values: ["Oui", "Non"].map((value) => ({ userEnteredValue: value })) }, strict: true, showCustomUi: true },
          },
        },
      )
    }
    if (tab.name === "Objets") {
      requests.push(
        {
          setDataValidation: {
            range: { sheetId: sheet.sheetId, startRowIndex: 1, endRowIndex: rowCount, startColumnIndex: 3, endColumnIndex: 4 },
            rule: { condition: { type: "ONE_OF_LIST", values: ["Arme", "Armure", "Objet", "Ressource", "Monnaie"].map((value) => ({ userEnteredValue: value })) }, strict: false, showCustomUi: true },
          },
        },
        {
          setDataValidation: {
            range: { sheetId: sheet.sheetId, startRowIndex: 1, endRowIndex: rowCount, startColumnIndex: 17, endColumnIndex: 18 },
            rule: { condition: { type: "ONE_OF_LIST", values: ["Oui", "Non"].map((value) => ({ userEnteredValue: value })) }, strict: true, showCustomUi: true },
          },
        },
      )
    }
    if (tab.name === inventoryContentsTab) {
      requests.push({
        setDataValidation: {
          range: { sheetId: sheet.sheetId, startRowIndex: 1, endRowIndex: rowCount, startColumnIndex: 12, endColumnIndex: 13 },
          rule: { condition: { type: "ONE_OF_LIST", values: ["Oui", "Non"].map((value) => ({ userEnteredValue: value })) }, strict: true, showCustomUi: true },
        },
      })
    }
  }

  await googleSheetsJson(`spreadsheets/${spreadsheetId}:batchUpdate`, {
    method: "POST",
    body: JSON.stringify({ requests }),
  })
  for (const tab of inventoryWorkbookTabs) {
    await updateRange(spreadsheetId, sheetTabRange(tab.name, `A1:${columnName(tab.headers.length)}1`), [[...tab.headers]])
  }

  const existingTypes = await readRange(spreadsheetId, sheetTabRange("Types de contenants", "A2:F"))
  const existingIds = new Set(existingTypes.map((row) => row[0]).filter(Boolean))
  const missingBaseTypes = baseInventoryContainerTypes.filter((type) => !existingIds.has(type.id))
  if (missingBaseTypes.length) {
    await appendRows(spreadsheetId, sheetTabRange("Types de contenants", "A:F"), missingBaseTypes.map((type) => [
      type.id,
      type.name,
      type.category,
      type.capacity,
      type.columns.join(" | "),
      "Oui",
    ]))
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
  const requests: Array<Record<string, unknown>> = []
  for (const tab of tabletopWorkbookTabs) {
    const sheet = properties.find((candidate) => candidate.title === tab.name)
    if (sheet?.sheetId === undefined) throw new Error("TABLETOP_SHEET_TAB_UNAVAILABLE")
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
      {
        updateCells: {
          range: { sheetId: sheet.sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: tab.headers.length },
          rows: [{
            values: tab.headers.map((header) => ({ userEnteredValue: { stringValue: header } })),
          }],
          fields: "userEnteredValue",
        },
      },
    )
    tab.widths.forEach((pixelSize, index) => requests.push({
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
    if (tab.name === "Tokens") {
      requests.push({
        setDataValidation: {
          range: { sheetId: sheet.sheetId, startRowIndex: 1, endRowIndex: rowCount, startColumnIndex: 2, endColumnIndex: 3 },
          rule: { condition: { type: "ONE_OF_LIST", values: ["npc", "character", "shop", "marker"].map((value) => ({ userEnteredValue: value })) }, strict: true, showCustomUi: true },
        },
      })
    }
    if (tab.name === "Journal") {
      requests.push({
        setDataValidation: {
          range: { sheetId: sheet.sheetId, startRowIndex: 1, endRowIndex: rowCount, startColumnIndex: 2, endColumnIndex: 3 },
          rule: { condition: { type: "ONE_OF_LIST", values: ["chat", "dice"].map((value) => ({ userEnteredValue: value })) }, strict: true, showCustomUi: true },
        },
      })
    }
  }

  await googleSheetsJson(`spreadsheets/${spreadsheetId}:batchUpdate`, {
    method: "POST",
    body: JSON.stringify({ requests }),
  })
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
  const [campaignRows, characterRows, relationRows] = await Promise.all([
    campaignSource ? readRangeFresh(campaignSource.spreadsheetId, campaignSource.range).catch((error) => { console.error("IDENTITY_SYNC_CAMPAIGNS_READ_FAILED", error instanceof Error ? error.message : "UNKNOWN_ERROR"); return [] }) : Promise.resolve([]),
    characterSource ? readRangeFresh(characterSource.spreadsheetId, characterSource.range).catch((error) => { console.error("IDENTITY_SYNC_CHARACTERS_READ_FAILED", error instanceof Error ? error.message : "UNKNOWN_ERROR"); return [] }) : Promise.resolve([]),
    // Le nom de cet onglet contient des espaces ("Personnages par campagne") : il doit être
    // entre quotes dans la notation A1, sinon l'API Sheets renvoie une erreur de parsing.
    relationSource ? readRangeFresh(relationSource.spreadsheetId, sheetTabRange(relationSource.tabName, "A:B")).then((rows) => { relationsRead = true; return rows }).catch((error) => { console.error("IDENTITY_SYNC_RELATIONS_READ_FAILED", error instanceof Error ? error.message : "UNKNOWN_ERROR"); return [] }) : Promise.resolve([]),
  ])
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

  for (const row of campaignRows.slice(1)) {
    if (!row[0]) continue
    const next = {
      mjUid: row[1] || "",
      name: row[2] || "Campagne sans nom",
      description: row[3] || "",
      bannerUrl: row[4] || "",
      accentColor: row[5] || "#927640",
    }
    const current = campaignById.get(row[0])
    if (current
      && !current.deletedAt
      && current.mjUid === next.mjUid
      && current.name === next.name
      && current.description === next.description
      && current.bannerUrl === next.bannerUrl
      && current.accentColor === next.accentColor) continue
    await db.insert(campaignIndex).values({ id: row[0], ...next, updatedAt: now, deletedAt: null })
      .onConflictDoUpdate({ target: campaignIndex.id, set: { ...next, updatedAt: now } })
  }

  for (const row of characterRows.slice(1)) {
    if (!row[0]) continue
    const next = {
      ownerUid: row[1] || "",
      name: row[2] || "Personnage sans nom",
      subtitle: row[3] || "",
      updatedAt: row[4] || now,
    }
    const current = characterById.get(row[0])
    if (current
      && !current.deletedAt
      && current.ownerUid === next.ownerUid
      && current.name === next.name
      && current.subtitle === next.subtitle
      && current.updatedAt === next.updatedAt) continue
    await db.insert(characterIndex).values({ id: row[0], ...next, deletedAt: null })
      .onConflictDoUpdate({ target: characterIndex.id, set: next })
  }

  for (const row of relationRows.slice(1)) {
    if (!row[0] || !row[1] || linkKeys.has(`${row[0]}::${row[1]}`)) continue
    await db.insert(campaignCharacters).values({ campaignId: row[0], characterId: row[1] }).onConflictDoNothing()
  }

  // La feuille « Personnages des campagnes » fait foi : un personnage qu'un MJ a
  // retiré de sa campagne depuis une autre installation disparaît aussi d'ici.
  // Seulement si la feuille a bien été lue (en-tête compris) : une lecture en
  // échec ou vide ne doit jamais vider l'index local.
  if (relationsRead && relationRows.length > 0) {
    const sharedKeys = new Set(relationRows.slice(1).filter((row) => row[0] && row[1]).map((row) => `${row[0]}::${row[1]}`))
    for (const link of existingLinks) {
      if (sharedKeys.has(`${link.campaignId}::${link.characterId}`)) continue
      await db.delete(campaignCharacters).where(and(eq(campaignCharacters.campaignId, link.campaignId), eq(campaignCharacters.characterId, link.characterId)))
    }
  }
  return { campaigns: Math.max(0, campaignRows.length - 1), characters: Math.max(0, characterRows.length - 1) }
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
  for (const campaign of campaigns) {
    if (!campaign.uid || campaign.uid === localUserId) continue
    const entry = candidates.get(campaign.uid) ?? { campaigns: [], characters: [] }
    entry.campaigns.push(campaign.name)
    candidates.set(campaign.uid, entry)
  }
  for (const character of characters) {
    if (!character.uid || character.uid === localUserId) continue
    const entry = candidates.get(character.uid) ?? { campaigns: [], characters: [] }
    entry.characters.push(character.name)
    candidates.set(character.uid, entry)
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

async function ensureJdrSheetHeaderRow(sheet: JdrSheetRecord, definition: StructuredSheetDefinition) {
  const cacheKey = `${sheet.spreadsheetId}:${sheet.tabName}:${definition.key}`
  if (jdrSheetHeaderChecked.has(cacheKey)) return
  try {
    const lastColumn = columnName(definition.headers.length)
    const [firstRow = []] = await readRange(sheet.spreadsheetId, sheetTabRange(sheet.tabName, `A1:${lastColumn}1`))
    if (definition.headers.every((header, index) => firstRow[index] === header)) {
      jdrSheetHeaderChecked.add(cacheKey)
      return
    }

    const hasExistingValues = firstRow.some((value) => value.trim())
    if (hasExistingValues) {
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
    }
    await updateRange(sheet.spreadsheetId, sheetTabRange(sheet.tabName, `A1:${lastColumn}1`), [definition.headers])
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

const worldIndexKeys = new Set<string>(Object.keys(worldIndexDefinitions))

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
  await updateRange(sheet.spreadsheetId, `${sheet.tabName}!A1:F1`, [["ID", "MJ", "Nom de la campagne", "Description", "Bannière", "Couleur d’accent"]])
  const campaign: CampaignRecord = {
    id: crypto.randomUUID(), mjUid, name: normalizedName,
    description: input.description?.trim() || "", bannerUrl: input.bannerUrl?.trim() || "",
    accentColor: input.accentColor && /^#[0-9a-f]{6}$/i.test(input.accentColor) ? input.accentColor : "#927640",
    updatedAt: new Date().toISOString(),
  }
  await appendRows(sheet.spreadsheetId, `${sheet.tabName}!A:F`, [[campaign.id, campaign.mjUid, campaign.name, campaign.description, campaign.bannerUrl, campaign.accentColor]])
  await getDb().insert(campaignIndex).values(campaign).onConflictDoUpdate({
    target: campaignIndex.id,
    set: { name: campaign.name, updatedAt: new Date().toISOString() },
  })
  return campaign
}

const shopKeys = new Set<ShopKey>(["market", "bookshop", "antique", "armory", "black-market", "alchemist", "tavern"])
const shopSizes = new Set<ShopSize>(["Minuscule", "Petit", "Moyen", "Grand", "Géant"])
const cityKeys = new Set<CityKey>(["bourg", "village", "small-city", "medium-city", "large-city", "capital"])

function savedShopFromRow(row: string[]): SavedShopRecord | null {
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

function shopRow(shop: GeneratedShop, pageLinked: string, current: SavedShopRecord | null, options: { inCampaign?: boolean; npcId?: string }) {
  const now = new Date().toISOString()
  return [
    shop.id,
    pageLinked,
    shop.cityName,
    shop.cityKey,
    shop.key,
    shop.name,
    shop.size,
    JSON.stringify(shop.items),
    (options.inCampaign ?? current?.inCampaign ?? false) ? "Oui" : "Non",
    options.npcId ?? current?.npcId ?? "",
    current?.createdAt || now,
    now,
  ]
}

export async function listSavedShops(pageLinked: string, onlyInCampaign = false) {
  const sheet = await ensureJdrSheet("shops")
  if (!sheet) throw new Error("SHOPS_SHEET_UNAVAILABLE")
  const rows = await readRangeFresh(sheet.spreadsheetId, sheetTabRange(sheet.tabName, "A2:L"))
  return rows.map(savedShopFromRow).filter((shop): shop is SavedShopRecord => Boolean(shop && !shop.id.startsWith("latest:") && shop.pageLinked === pageLinked && (!onlyInCampaign || shop.inCampaign)))
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
  const rows = await readRangeFresh(sheet.spreadsheetId, sheetTabRange(sheet.tabName, "A2:L"))
  return rows.map(savedShopFromRow).flatMap((shop) => shop && shop.pageLinked === pageLinked && shop.id.startsWith("latest:")
    ? [{ id: shop.id.slice("latest:".length), key: shop.key, name: shop.name, size: shop.size, cityKey: shop.cityKey, cityName: shop.cityName, items: shop.items }]
    : [])
}

export async function saveGeneratedShops(pageLinked: string, shops: GeneratedShop[], options: { replace?: boolean; replaceLatest?: boolean; inCampaign?: boolean; npcId?: string } = {}) {
  const receipts = await writeShopRows(pageLinked, shops, options)
  // La vérification relit la feuille par la plage complète « A2:L », celle que
  // listSavedShops et listLatestShops utilisent. Relire seulement la plage
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
    const listed = await readRangeFresh(sheet.spreadsheetId, sheetTabRange(sheet.tabName, "A2:L"))
    storedById = new Map(listed.map(savedShopFromRow).flatMap((shop) => shop ? [[shop.id, shop] as const] : []))
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

async function appendShopRows(spreadsheetId: string, tabName: string, rows: Array<Array<string | number | boolean>>): Promise<ShopWriteReceipt[]> {
  if (!rows.length) return []
  const result = await appendRows(spreadsheetId, sheetTabRange(tabName, "A:L"), rows, { valueInputOption: "RAW" })
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

async function placeShopRows(spreadsheetId: string, tabName: string, values: Array<Array<string | number | boolean>>, freeRows: number[]) {
  if (!values.length) return []
  const reused = values.slice(0, freeRows.length).map((row, index) => ({
    range: sheetTabRange(tabName, `A${freeRows[index]}:L${freeRows[index]}`),
    values: [row],
  }))
  return [
    ...await updateShopRows(spreadsheetId, reused),
    ...await appendShopRows(spreadsheetId, tabName, values.slice(freeRows.length)),
  ]
}

async function writeShopRows(pageLinked: string, shops: GeneratedShop[], options: { replace?: boolean; replaceLatest?: boolean; inCampaign?: boolean; npcId?: string }) {
  const sheet = await ensureJdrSheet("shops")
  if (!sheet) throw new Error("SHOPS_SHEET_UNAVAILABLE")
  const { rows, startRow } = await readRangeFreshWithOffset(sheet.spreadsheetId, sheetTabRange(sheet.tabName, "A2:L"))
  const stored = rows.map(savedShopFromRow)
  const existingById = new Map<string, { shop: SavedShopRecord; rowNumber: number }>()
  stored.forEach((shop, index) => {
    if (shop) existingById.set(shop.id, { shop, rowNumber: startRow + index })
  })

  if (options.replace || options.replaceLatest) {
    const targetRows = stored.flatMap((shop, index) => shop?.pageLinked === pageLinked && (!options.replaceLatest || shop.id.startsWith("latest:")) ? [startRow + index] : [])
    const replacements = shops.slice(0, targetRows.length).map((shop, index) => ({
      range: sheetTabRange(sheet.tabName, `A${targetRows[index]}:L${targetRows[index]}`),
      values: [shopRow(shop, pageLinked, null, options)],
    }))
    const clear = targetRows.slice(shops.length).map((rowNumber) => ({
      range: sheetTabRange(sheet.tabName, `A${rowNumber}:L${rowNumber}`),
      values: [Array(12).fill("")],
    }))
    const receipts = await updateShopRows(sheet.spreadsheetId, replacements)
    await updateRanges(sheet.spreadsheetId, clear, { valueInputOption: "RAW" })
    const additions = shops.slice(targetRows.length)
    const freeRows = freeShopRows(stored, startRow, new Set(targetRows))
    return [...receipts, ...await placeShopRows(sheet.spreadsheetId, sheet.tabName, additions.map((shop) => shopRow(shop, pageLinked, null, options)), freeRows)]
  }

  const updates: Array<{ range: string; values: Array<Array<string | number | boolean>> }> = []
  const additions: Array<Array<string | number | boolean>> = []
  const reserved = new Set<number>()
  for (const shop of shops) {
    const existing = existingById.get(shop.id)
    const values = shopRow(shop, pageLinked, existing?.shop ?? null, options)
    if (existing) {
      reserved.add(existing.rowNumber)
      updates.push({ range: sheetTabRange(sheet.tabName, `A${existing.rowNumber}:L${existing.rowNumber}`), values: [values] })
    } else additions.push(values)
  }
  return [
    ...await updateShopRows(sheet.spreadsheetId, updates),
    ...await placeShopRows(sheet.spreadsheetId, sheet.tabName, additions, freeShopRows(stored, startRow, reserved)),
  ]
}

export async function deleteSavedShops(pageLinked: string, shopIds: string[]) {
  if (!shopIds.length) return
  const sheet = await ensureJdrSheet("shops")
  if (!sheet) throw new Error("SHOPS_SHEET_UNAVAILABLE")
  const selectedIds = new Set(shopIds)
  const { rows, startRow } = await readRangeFreshWithOffset(sheet.spreadsheetId, sheetTabRange(sheet.tabName, "A2:L"))
  const clear = rows.flatMap((row, index) => row[1] === pageLinked && selectedIds.has(row[0])
    ? [{ range: sheetTabRange(sheet.tabName, `A${startRow + index}:L${startRow + index}`), values: [Array(12).fill("")] }]
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
        id: typeof candidate.id === "string" && candidate.id ? candidate.id : crypto.randomUUID(),
        name: candidate.name.trim(),
        quantity: Math.max(1, Math.trunc(Number(candidate.quantity) || 1)),
        notes: typeof candidate.notes === "string" ? candidate.notes : "",
      }]
    })
  } catch {
    return []
  }
}

function npcFromRow(row: string[]): CampaignNpcRecord | null {
  if (!row[0] || !row[1]) return null
  return {
    id: row[0], pageLinked: row[1], name: row[2] || "PNJ sans nom",
    title: row[33] || "", occupation: row[3] || "", people: row[17] || "",
    currentHp: npcNumber(row[4]), totalHp: npcNumber(row[5]), speed: npcNumber(row[6]),
    strength: npcNumber(row[7]), dexterity: npcNumber(row[8]), intelligence: npcNumber(row[9]),
    wisdom: npcNumber(row[10]), charisma: npcNumber(row[11]), constitution: npcNumber(row[16]),
    gmNotes: row[22] || "", portrait: row[23] || "", playerNotes: row[24] || "",
    inCampaign: sheetValueIsChecked(row[26]), inPlayerGroup: sheetValueIsChecked(row[30]), important: sheetValueIsChecked(row[31]),
    createdAt: row[27] || "", updatedAt: row[28] || "", createdByUid: row[32] || "", lore: row[34] || "",
    activeSpells: row[35] || "", passiveSpells: row[36] || "",
  }
}

function npcRow(npc: CampaignNpcRecord, pageLinked: string, original: string[] | null, options: { inCampaign?: boolean } = {}) {
  const now = new Date().toISOString()
  const values: Array<string | number | boolean> = Array.from({ length: npcSheetHeaders.length }, (_, index) => original?.[index] || "")
  const current = original ? npcFromRow(original) : null
  values[0] = npc.id
  values[1] = pageLinked
  values[2] = npc.name
  values[3] = npc.occupation
  values[4] = npc.currentHp
  values[5] = npc.totalHp
  values[6] = npc.speed
  values[17] = npc.people
  values[33] = npc.title
  values[7] = npc.strength
  values[8] = npc.dexterity
  values[9] = npc.intelligence
  values[10] = npc.wisdom
  values[11] = npc.charisma
  values[16] = npc.constitution
  values[22] = npc.gmNotes
  values[23] = npc.portrait
  values[24] = npc.playerNotes
  values[26] = (options.inCampaign ?? npc.inCampaign ?? current?.inCampaign ?? false) ? "Oui" : "Non"
  // Une ancienne version de l'application n'envoie pas ce champ : la valeur de la feuille est gardée.
  values[31] = (npc.important ?? current?.important ?? false) ? "Oui" : "Non"
  // « Dans le groupe joueur » : les PNJs du groupe, visibles des joueurs sur la page de campagne.
  values[30] = (npc.inPlayerGroup ?? current?.inPlayerGroup ?? false) ? "Oui" : "Non"
  values[34] = npc.lore ?? current?.lore ?? ""
  // Une ancienne version de l'application n'envoie pas les sorts : ceux de la feuille restent.
  values[35] = npc.activeSpells ?? current?.activeSpells ?? ""
  values[36] = npc.passiveSpells ?? current?.passiveSpells ?? ""
  values[27] = current?.createdAt || npc.createdAt || now
  values[28] = now
  values[32] = npc.createdByUid || current?.createdByUid || ""
  return values
}

export async function listNpcs(pageLinked: string, onlyInCampaign = false) {
  const sheet = await ensureJdrSheet("npcs")
  const rows = await readRange(sheet.spreadsheetId, `${sheet.tabName}!A2:${NPC_LAST_COLUMN}`)
  return rows.map(npcFromRow).filter((npc): npc is CampaignNpcRecord => Boolean(npc && npc.pageLinked === pageLinked && (!onlyInCampaign || npc.inCampaign)))
}

/** Tous les PNJ, toutes pages confondues : l'Index des PNJs y cherche les campagnes de chacun. */
export async function listAllNpcs() {
  const sheet = await ensureJdrSheet("npcs")
  if (!sheet) return []
  const rows = await readRange(sheet.spreadsheetId, `${sheet.tabName}!A2:${NPC_LAST_COLUMN}`)
  return rows.map(npcFromRow).filter((npc): npc is CampaignNpcRecord => Boolean(npc))
}

export async function getNpcById(id: string) {
  const sheet = await ensureJdrSheet("npcs")
  const rows = await readRange(sheet.spreadsheetId, `${sheet.tabName}!A2:${NPC_LAST_COLUMN}`)
  const row = rows.find((candidate) => candidate[0] === id)
  return row ? npcFromRow(row) : null
}

export async function listCampaignNpcs(campaignId: string) {
  return listNpcs(campaignId)
}

export async function saveNpcs(pageLinked: string, npcs: CampaignNpcRecord[], options: { inCampaign?: boolean } = {}) {
  const sheet = await ensureJdrSheet("npcs")
  const rows = await readRange(sheet.spreadsheetId, `${sheet.tabName}!A2:${NPC_LAST_COLUMN}`)
  const updates: Array<{ range: string; values: Array<Array<string | number | boolean>> }> = []
  const additions: Array<Array<string | number | boolean>> = []
  const saved: CampaignNpcRecord[] = []
  for (const npc of npcs) {
    const existingIndex = rows.findIndex((row) => row[0] === npc.id && row[1] === pageLinked)
    const original = existingIndex >= 0 ? rows[existingIndex] : null
    const values = npcRow(npc, pageLinked, original, options)
    if (existingIndex >= 0) updates.push({ range: `${sheet.tabName}!A${existingIndex + 2}:${NPC_LAST_COLUMN}${existingIndex + 2}`, values: [values] })
    else additions.push(values)
    const record = npcFromRow(values.map(String))
    if (record) saved.push(record)
  }
  await updateRanges(sheet.spreadsheetId, updates)
  if (additions.length) await appendRows(sheet.spreadsheetId, `${sheet.tabName}!A:${NPC_LAST_COLUMN}`, additions)
  return saved
}

export async function saveNpc(pageLinked: string, npc: CampaignNpcRecord, options: { inCampaign?: boolean } = {}) {
  const [saved] = await saveNpcs(pageLinked, [npc], options)
  return saved
}

export async function deleteNpcs(pageLinked: string, npcIds: string[]) {
  if (!npcIds.length) return
  const sheet = await ensureJdrSheet("npcs")
  const selectedIds = new Set(npcIds)
  const rows = await readRange(sheet.spreadsheetId, `${sheet.tabName}!A2:${NPC_LAST_COLUMN}`)
  const clear = rows.flatMap((row, index) => row[1] === pageLinked && selectedIds.has(row[0])
    ? [{ range: `${sheet.tabName}!A${index + 2}:${NPC_LAST_COLUMN}${index + 2}`, values: [Array(npcSheetHeaders.length).fill("")] }]
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
  const rows = await readRange(sheet.spreadsheetId, sheetTabRange("Cartes", "A2:N"))
  return rows.map(tabletopMapFromRow).filter((map): map is TabletopMapRecord => Boolean(map && map.pageLinked === pageLinked))
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
}

export async function getTabletopMap(id: string) {
  const sheet = await ensureJdrSheet("tabletop")
  const rows = await readRange(sheet.spreadsheetId, sheetTabRange("Cartes", "A2:N"))
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
  await appendRows(sheet.spreadsheetId, sheetTabRange("Cartes", "A:N"), [tabletopMapRow(map)])
  return map
}

export async function updateTabletopMap(id: string, patch: Partial<Pick<TabletopMapRecord, "name" | "backgroundUrl" | "width" | "height" | "gridSize" | "distancePerGrid" | "distanceUnit" | "folder">>) {
  const sheet = await ensureJdrSheet("tabletop")
  const rows = await readRange(sheet.spreadsheetId, sheetTabRange("Cartes", "A2:N"))
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
  await updateRange(sheet.spreadsheetId, sheetTabRange("Cartes", `A${index + 2}:N${index + 2}`), [tabletopMapRow(next)])
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
  const [folderRows, mapRows] = await Promise.all([
    readRange(sheet.spreadsheetId, sheetTabRange("Dossiers", "A2:F")),
    knownMaps ? Promise.resolve(null) : readRange(sheet.spreadsheetId, sheetTabRange("Cartes", "A2:N")),
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
  await appendRows(sheet.spreadsheetId, sheetTabRange("Dossiers", "A:F"), [[folder.id, folder.pageLinked, folder.name, folder.sortOrder, folder.createdAt, folder.updatedAt]])
  return folder
}

export async function renameTabletopFolder(pageLinked: string, folderId: string, currentName: string, name: string) {
  const cleaned = name.trim().replace(/\s+/g, " ").slice(0, 80)
  if (!cleaned || normalizedTabletopFolder(cleaned) === normalizedTabletopFolder("Sans dossier")) throw new Error("INVALID_TABLETOP_FOLDER")
  const sheet = await ensureJdrSheet("tabletop")
  const [folderRows, mapRows] = await Promise.all([
    readRange(sheet.spreadsheetId, sheetTabRange("Dossiers", "A2:F")),
    readRange(sheet.spreadsheetId, sheetTabRange("Cartes", "A2:N")),
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
  const updates: Array<{ range: string; values: Array<Array<string | number>> }> = []
  let folder: TabletopFolderRecord
  if (storedFolder) {
    folder = { ...storedFolder, name: cleaned, updatedAt: now }
    updates.push({ range: sheetTabRange("Dossiers", `C${folderIndex + 2}:F${folderIndex + 2}`), values: [[folder.name, folder.sortOrder, folder.createdAt, folder.updatedAt]] })
  } else {
    folder = await createTabletopFolder(pageLinked, cleaned)
  }
  mapRows.forEach((row, index) => {
    const map = tabletopMapFromRow(row)
    if (map?.pageLinked === pageLinked && normalizedTabletopFolder(map.folder) === normalizedTabletopFolder(oldName)) {
      updates.push({ range: sheetTabRange("Cartes", `M${index + 2}:N${index + 2}`), values: [[now, cleaned]] })
    }
  })
  if (updates.length) await updateRanges(sheet.spreadsheetId, updates)
  return folder
}

export async function deleteTabletopFolder(pageLinked: string, folderId: string, currentName: string) {
  const sheet = await ensureJdrSheet("tabletop")
  const [folderRows, mapRows] = await Promise.all([
    readRange(sheet.spreadsheetId, sheetTabRange("Dossiers", "A2:F")),
    readRange(sheet.spreadsheetId, sheetTabRange("Cartes", "A2:N")),
  ])
  const folderIndex = folderRows.findIndex((row) => row[0] === folderId && row[1] === pageLinked)
  const storedFolder = folderIndex >= 0 ? tabletopFolderFromRow(folderRows[folderIndex]) : null
  const oldName = storedFolder?.name || currentName.trim()
  if (!oldName || normalizedTabletopFolder(oldName) === normalizedTabletopFolder("Sans dossier")) return false
  const now = new Date().toISOString()
  const updates: Array<{ range: string; values: Array<Array<string | number>> }> = []
  if (folderIndex >= 0) updates.push({ range: sheetTabRange("Dossiers", `A${folderIndex + 2}:F${folderIndex + 2}`), values: [["", "", "", "", "", ""]] })
  mapRows.forEach((row, index) => {
    const map = tabletopMapFromRow(row)
    if (map?.pageLinked === pageLinked && normalizedTabletopFolder(map.folder) === normalizedTabletopFolder(oldName)) {
      updates.push({ range: sheetTabRange("Cartes", `M${index + 2}:N${index + 2}`), values: [[now, "Sans dossier"]] })
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
  const rows = await readRange(sheet.spreadsheetId, sheetTabRange("Tokens", "A2:M"))
  return rows.map(tabletopTokenFromRow).filter((token): token is TabletopTokenRecord => Boolean(token && token.mapId === mapId))
}

export async function addTabletopToken(mapId: string, entityKind: TabletopTokenRecord["entityKind"], entityId: string, x: number, y: number, label = "", icon = "", scale = 1, iconScale = 1, color = "#7f3430") {
  const sheet = await ensureJdrSheet("tabletop")
  const rows = await readRange(sheet.spreadsheetId, sheetTabRange("Tokens", "A2:M"))
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
  await appendRows(sheet.spreadsheetId, sheetTabRange("Tokens", "A:M"), [[token.id, token.mapId, token.entityKind, token.entityId, token.x, token.y, token.createdAt, token.updatedAt, token.label, token.icon, token.scale, token.iconScale, token.color]])
  return token
}

export async function moveTabletopToken(mapId: string, tokenId: string, x: number, y: number) {
  const sheet = await ensureJdrSheet("tabletop")
  const rows = await readRange(sheet.spreadsheetId, sheetTabRange("Tokens", "A2:M"))
  const index = rows.findIndex((candidate) => candidate[0] === tokenId && candidate[1] === mapId)
  if (index < 0) return null
  const token = tabletopTokenFromRow(rows[index])
  if (!token) return null
  const next = { ...token, x: tabletopNumber(x, token.x, -12000, 24000), y: tabletopNumber(y, token.y, -12000, 24000), updatedAt: new Date().toISOString() }
  await updateRanges(sheet.spreadsheetId, [
    { range: sheetTabRange("Tokens", `E${index + 2}:F${index + 2}`), values: [[next.x, next.y]] },
    { range: sheetTabRange("Tokens", `H${index + 2}:H${index + 2}`), values: [[next.updatedAt]] },
  ])
  return next
}

export async function updateTabletopTokenAppearance(mapId: string, tokenId: string, patch: Partial<Pick<TabletopTokenRecord, "scale" | "iconScale" | "label" | "icon" | "color">>) {
  const sheet = await ensureJdrSheet("tabletop")
  const rows = await readRange(sheet.spreadsheetId, sheetTabRange("Tokens", "A2:M"))
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
  const updates = [{ range: sheetTabRange("Tokens", `H${index + 2}:H${index + 2}`), values: [[next.updatedAt]] }]
  if (patch.label !== undefined || patch.icon !== undefined) updates.push({ range: sheetTabRange("Tokens", `I${index + 2}:J${index + 2}`), values: [[next.label, next.icon]] })
  if (patch.scale !== undefined || patch.iconScale !== undefined) updates.push({ range: sheetTabRange("Tokens", `K${index + 2}:L${index + 2}`), values: [[next.scale, next.iconScale]] })
  if (patch.color !== undefined) updates.push({ range: sheetTabRange("Tokens", `M${index + 2}:M${index + 2}`), values: [[next.color]] })
  await updateRanges(sheet.spreadsheetId, updates)
  return next
}

export async function updateTabletopTokenStates(mapId: string, patches: Array<{ tokenId: string } & Partial<Pick<TabletopTokenRecord, "x" | "y" | "scale" | "iconScale" | "label" | "icon" | "color">>>) {
  if (!patches.length) return []
  const sheet = await ensureJdrSheet("tabletop")
  const rows = await readRange(sheet.spreadsheetId, sheetTabRange("Tokens", "A2:M"))
  const updates: Array<{ range: string; values: Array<Array<string | number>> }> = []
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
    if (patch.x !== undefined || patch.y !== undefined) updates.push({ range: sheetTabRange("Tokens", `E${rowNumber}:F${rowNumber}`), values: [[next.x, next.y]] })
    if (patch.label !== undefined || patch.icon !== undefined) updates.push({ range: sheetTabRange("Tokens", `I${rowNumber}:J${rowNumber}`), values: [[next.label, next.icon]] })
    if (patch.scale !== undefined || patch.iconScale !== undefined) updates.push({ range: sheetTabRange("Tokens", `K${rowNumber}:L${rowNumber}`), values: [[next.scale, next.iconScale]] })
    if (patch.color !== undefined) updates.push({ range: sheetTabRange("Tokens", `M${rowNumber}:M${rowNumber}`), values: [[next.color]] })
    updates.push({ range: sheetTabRange("Tokens", `H${rowNumber}:H${rowNumber}`), values: [[next.updatedAt]] })
    saved.push(next)
  }
  if (updates.length) await updateRanges(sheet.spreadsheetId, updates)
  return saved
}

export async function removeTabletopToken(mapId: string, tokenId: string) {
  const sheet = await ensureJdrSheet("tabletop")
  const rows = await readRange(sheet.spreadsheetId, sheetTabRange("Tokens", "A2:M"))
  const index = rows.findIndex((candidate) => candidate[0] === tokenId && candidate[1] === mapId)
  if (index < 0) return false
  await updateRange(sheet.spreadsheetId, sheetTabRange("Tokens", `A${index + 2}:M${index + 2}`), [Array(13).fill("")])
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
  const rows = await readRange(sheet.spreadsheetId, sheetTabRange("Journal", "A2:L"))
  return rows.map(tabletopActivityFromRow).filter((activity): activity is TabletopActivityRecord => Boolean(activity && activity.mapId === mapId))
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt)).slice(-Math.max(1, Math.min(500, limit)))
}

export async function saveTabletopActivity(activity: TabletopActivityRecord) {
  const sheet = await ensureJdrSheet("tabletop")
  await appendRows(sheet.spreadsheetId, sheetTabRange("Journal", "A:L"), [[
    activity.id, activity.mapId, activity.kind, activity.authorUid, activity.authorName,
    activity.text, activity.diceExpression, activity.diceResult, activity.createdAt,
    activity.audience, activity.recipientId, activity.recipientName,
  ]])
  return activity
}

export async function listTabletopCharacterEntitiesByIds(ids: string[]) {
  const selected = new Set(ids)
  if (!selected.size) return []
  const source = await charactersSource()
  if (!source) return []
  const rows = await readRange(source.spreadsheetId, `${source.tabName}!A2:AM`)
  return rows.flatMap<TabletopEntityRecord>((row) => {
    if (!selected.has(row[0])) return []
    return [{
      id: row[0],
      kind: "character",
      name: row[2] || "Personnage sans nom",
      subtitle: [row[4], row[3]].filter(Boolean).join(" · "),
      portrait: row[38] || `/api/characters/portrait/${encodeURIComponent(row[0])}`,
      currentHp: tabletopNumber(row[11], 0, 0, 99999),
      totalHp: tabletopNumber(row[12], 0, 0, 99999),
      speed: tabletopNumber(row[23], 0, 0, 99999),
      ownerUid: row[1] || "",
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

function characterRelationFromRow(row: string[]): CharacterRelationRecord | null {
  if (!row[0] || !row[1] || !row[3]) return null
  return {
    id: row[0], characterId: row[1], targetKind: row[2] === "character" ? "character" : "npc",
    targetId: row[3], name: row[4] || "Relation sans nom", level: Math.max(-3, Math.min(3, Math.trunc(Number(row[5]) || 0))),
    personalNotes: row[6] || "", createdByUid: row[7] || "", campaignId: row[8] || "",
    createdAt: row[9] || "", updatedAt: row[10] || "",
  }
}

export async function listCharacterRelations(characterId: string) {
  const sheet = await ensureJdrSheet("character_relations")
  const rows = await readRange(sheet.spreadsheetId, `${sheet.tabName}!A2:K`)
  return rows.map(characterRelationFromRow).filter((relation): relation is CharacterRelationRecord => Boolean(relation && relation.characterId === characterId))
}

export async function getCharacterRelationById(characterId: string, relationId: string) {
  return (await listCharacterRelations(characterId)).find((relation) => relation.id === relationId) ?? null
}

export async function saveCharacterRelation(input: Omit<CharacterRelationRecord, "createdAt" | "updatedAt"> & Partial<Pick<CharacterRelationRecord, "createdAt" | "updatedAt">>) {
  const sheet = await ensureJdrSheet("character_relations")
  const rows = await readRange(sheet.spreadsheetId, `${sheet.tabName}!A2:K`)
  const existingIndex = rows.findIndex((row) => row[0] === input.id && row[1] === input.characterId)
  const current = existingIndex >= 0 ? characterRelationFromRow(rows[existingIndex]) : null
  const now = new Date().toISOString()
  const values = [input.id, input.characterId, input.targetKind, input.targetId, input.name, Math.max(-3, Math.min(3, Math.trunc(input.level))), input.personalNotes, input.createdByUid, input.campaignId, current?.createdAt || input.createdAt || now, now]
  if (existingIndex >= 0) await updateRange(sheet.spreadsheetId, `${sheet.tabName}!A${existingIndex + 2}:K${existingIndex + 2}`, [values])
  else await appendRows(sheet.spreadsheetId, `${sheet.tabName}!A:K`, [values])
  return characterRelationFromRow(values.map(String))
}

export async function deleteCharacterRelation(characterId: string, relationId: string) {
  const sheet = await ensureJdrSheet("character_relations")
  const rows = await readRange(sheet.spreadsheetId, `${sheet.tabName}!A2:K`)
  const index = rows.findIndex((row) => row[0] === relationId && row[1] === characterId)
  if (index >= 0) await updateRange(sheet.spreadsheetId, `${sheet.tabName}!A${index + 2}:K${index + 2}`, [Array(11).fill("")])
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
    const accounts = await listAccounts(sessionToken).catch(() => [])
    return new Map(accounts.map((account) => [account.uid, { displayName: account.displayName, email: account.email }]))
  }
  const rows = await getDb().select({ id: users.id, displayName: users.displayName, email: users.email }).from(users)
  return new Map(rows.map((row) => [row.id, { displayName: row.displayName, email: row.email }]))
}

export async function listAllCharactersForAdmin(sessionToken?: string) {
  await ensureIdentityIndexes()
  const [rows, owners] = await Promise.all([
    getDb().select({ character: characterIndex }).from(characterIndex)
      .where(isNull(characterIndex.deletedAt)).orderBy(characterIndex.name).limit(500),
    accountLookup(sessionToken),
  ])
  const decorated = await decorateCharacters(rows.map((row) => row.character))
  return decorated.map((character) => {
    const owner = owners.get(character.ownerUid)
    return {
      ...character,
      ownerName: owner?.displayName || (character.ownerUid ? "Identifiant historique" : "Sans propriétaire"),
      ownerEmail: owner?.email || "",
    }
  })
}

export async function listAllCampaignsForAdmin(sessionToken?: string) {
  await ensureIdentityIndexes()
  const [rows, owners, links] = await Promise.all([
    getDb().select({ campaign: campaignIndex }).from(campaignIndex)
      .where(isNull(campaignIndex.deletedAt)).orderBy(campaignIndex.name).limit(500),
    accountLookup(sessionToken),
    getDb().select({ campaignId: campaignCharacters.campaignId, characterId: characterIndex.id, characterName: characterIndex.name })
      .from(campaignCharacters).innerJoin(characterIndex, eq(campaignCharacters.characterId, characterIndex.id))
      .where(isNull(characterIndex.deletedAt)),
  ])
  return rows.map((row) => {
    const owner = owners.get(row.campaign.mjUid)
    return {
      ...row.campaign,
      ownerName: owner?.displayName || (row.campaign.mjUid ? "Identifiant historique" : "Sans propriétaire"),
      ownerEmail: owner?.email || "",
      characters: links.filter((link) => link.campaignId === row.campaign.id).map((link) => ({ id: link.characterId, name: link.characterName })),
    }
  })
}

export async function updateAdminItemOwner(
  kind: "character" | "campaign",
  id: string,
  ownerUid: string,
  sessionToken?: string,
) {
  const normalizedOwnerUid = ownerUid.trim()
  const db = getDb()
  if (normalizedOwnerUid) {
    const owners = await accountLookup(sessionToken)
    if (!owners.has(normalizedOwnerUid)) throw new Error("OWNER_NOT_FOUND")
  }

  await ensureIdentityIndexes()
  if (kind === "character") {
    const [character] = await db.select({ id: characterIndex.id }).from(characterIndex)
      .where(and(eq(characterIndex.id, id), isNull(characterIndex.deletedAt))).limit(1)
    if (!character) throw new Error("CHARACTER_NOT_FOUND")
    const source = await charactersSource()
    if (!source) throw new Error("CHARACTERS_SHEET_NOT_FOUND")
    const rowNumber = await findSheetRowById(source.spreadsheetId, source.tabName, id)
    if (!rowNumber) throw new Error("CHARACTER_SHEET_ROW_NOT_FOUND")
    await updateRange(source.spreadsheetId, `${source.tabName}!B${rowNumber}`, [[normalizedOwnerUid]])
    await db.update(characterIndex).set({ ownerUid: normalizedOwnerUid, updatedAt: new Date().toISOString() })
      .where(eq(characterIndex.id, id))
    return
  }

  const [campaign] = await db.select({ id: campaignIndex.id }).from(campaignIndex)
    .where(and(eq(campaignIndex.id, id), isNull(campaignIndex.deletedAt))).limit(1)
  if (!campaign) throw new Error("CAMPAIGN_NOT_FOUND")
  const source = await campaignsSource()
  if (!source) throw new Error("CAMPAIGNS_SHEET_NOT_FOUND")
  const tabName = source.range.split("!")[0]
  const rowNumber = await findSheetRowById(source.spreadsheetId, tabName, id)
  if (!rowNumber) throw new Error("CAMPAIGN_SHEET_ROW_NOT_FOUND")
  await updateRange(source.spreadsheetId, `${tabName}!B${rowNumber}`, [[normalizedOwnerUid]])
  await db.update(campaignIndex).set({ mjUid: normalizedOwnerUid, updatedAt: new Date().toISOString() })
    .where(eq(campaignIndex.id, id))
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
    const tabName = source.range.split("!")[0]
    const rowNumber = await findSheetRowById(source.spreadsheetId, tabName, id)
    if (rowNumber) await updateRange(source.spreadsheetId, `${tabName}!A${rowNumber}:F${rowNumber}`, [[id, next.mjUid, next.name, next.description, next.bannerUrl, next.accentColor]])
  }
  return next
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
  let identityRows: string[][]
  let titleRows: string[][]
  try {
    [identityRows, titleRows] = await readRanges(source.spreadsheetId, [
      `${source.tabName}!A:F`,
      `${source.tabName}!AL:AL`,
    ])
  } catch (error) {
    console.error("CAMPAIGN_MEMBERS_ENRICHMENT_FAILED", error instanceof Error ? error.message : "UNKNOWN_ERROR")
    return fallback()
  }
  const valuesById = new Map(identityRows.slice(1).flatMap((row, index) => row[0]
    ? [[row[0], { identity: row, honoraryTitle: titleRows[index + 1]?.[0] || "" }] as const]
    : []))
  return characters.map<CampaignMemberRecord>((character) => {
    const values = valuesById.get(character.id)
    return {
      ...character,
      name: values?.identity[2] || character.name,
      people: values?.identity[3] || character.subtitle,
      classes: values?.identity[4] || "",
      level: values?.identity[5] || "",
      honoraryTitle: values?.honoraryTitle || "",
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
  return decorateCharacters(rows)
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
    const rows = await readRange(sheet.spreadsheetId, `${sheet.tabName}!A:${columnName(characterSheetHeaders.length)}`)
    const sourceRow = rows.slice(1).find((row) => row[0] === characterId)
    if (!sourceRow) throw new Error("CHARACTER_SHEET_ROW_NOT_FOUND")
    const copiedRow = [...sourceRow]
    copiedRow[0] = targetId
    while (copiedRow.length < characterSheetHeaders.length) copiedRow.push("")
    await appendRows(sheet.spreadsheetId, `${sheet.tabName}!A:${columnName(characterSheetHeaders.length)}`, [copiedRow])
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
    const relationRange = sheetTabRange(relationSheet.tabName, "A:B")
    const existing = await readRange(relationSheet.spreadsheetId, relationRange)
    if (existing.some((row) => row[0] === campaignId && row[1] === characterId)) return null
    await appendRows(relationSheet.spreadsheetId, relationRange, [[campaignId, characterId]])
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
    const relationRange = sheetTabRange(relationSheet.tabName, "A:B")
    const rows = await readRange(relationSheet.spreadsheetId, relationRange)
    const cleared = rows.flatMap((row, index) => row[0] === campaignId && row[1] === characterId
      ? [{ range: sheetTabRange(relationSheet.tabName, `A${index + 1}:B${index + 1}`), values: [["", ""]] }]
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

/** Seuils critiques d'un nouveau personnage : le joueur peut ensuite les modifier. */
export const defaultCharacterCriticalFailure = "96"
export const defaultCharacterCriticalSuccess = "5"

export async function createCharacterForUser(uid: string, input: string[], id: string = crypto.randomUUID()) {
  const values = Array.from({ length: Math.max(input.length, 24) }, (_, index) => input[index] ?? "")
  const name = values[0]?.trim()
  if (!name || name.length > 120) throw new Error("INVALID_CHARACTER_NAME")
  if (!values[22]?.trim()) values[22] = defaultCharacterCriticalFailure
  if (!values[23]?.trim()) values[23] = defaultCharacterCriticalSuccess
  const sheet = await ensureJdrSheet("characters")
  if (!sheet) throw new Error("CHARACTERS_SHEET_UNAVAILABLE")
  await ensureCharacterSheetSchema(sheet.spreadsheetId, sheet.tabName)
  const cells = [id, uid, ...values.slice(0, characterValueHeaders.length)]
  while (cells.length < characterSheetHeaders.length) cells.push("")
  await appendRows(sheet.spreadsheetId, `${sheet.tabName}!A:${columnName(characterSheetHeaders.length)}`, [cells])
  const rowNumber = await findSheetRowById(sheet.spreadsheetId, sheet.tabName, id)
  if (rowNumber) {
    const prepared = applyCharacterDefaultsAndFormulas(cells.slice(2), rowNumber)
    await updateRange(sheet.spreadsheetId, `${sheet.tabName}!C${rowNumber}:${columnName(characterSheetHeaders.length)}${rowNumber}`, [prepared])
  }
  await getDb().insert(characterIndex).values({
    id, ownerUid: uid, name, subtitle: values[1] || "", updatedAt: new Date().toISOString(),
  }).onConflictDoUpdate({
    target: characterIndex.id,
    set: { name, subtitle: values[1] || "", updatedAt: new Date().toISOString() },
  })
  return { id, name }
}

async function ensureCharacterSheetSchema(spreadsheetId: string, tabName: string) {
  const syncKey = `character-schema:v4:${characterSheetHeaders.length}`
  const [alreadySynced] = await getDb().select().from(sheetIndexSyncs).where(eq(sheetIndexSyncs.key, syncKey)).limit(1)
  if (alreadySynced) return
  const metadata = await googleSheetsJson<{ sheets?: Array<{ properties?: { sheetId?: number; title?: string; gridProperties?: { columnCount?: number } } }> }>(
    `spreadsheets/${spreadsheetId}?fields=sheets.properties(sheetId,title,gridProperties.columnCount)`,
  )
  const properties = metadata.sheets?.find((sheet) => sheet.properties?.title === tabName)?.properties
  if (properties?.sheetId === undefined) throw new Error("SHEETS_METADATA_UNAVAILABLE")
  if ((properties.gridProperties?.columnCount || 0) < characterSheetHeaders.length) {
    await googleSheetsJson(`spreadsheets/${spreadsheetId}:batchUpdate`, {
      method: "POST",
      body: JSON.stringify({ requests: [{ updateSheetProperties: { properties: { sheetId: properties.sheetId, gridProperties: { columnCount: characterSheetHeaders.length } }, fields: "gridProperties.columnCount" } }] }),
    })
  }
  const currentColumnCount = properties.gridProperties?.columnCount || 0
  const [oldHeaders = []] = await readRange(spreadsheetId, `${tabName}!A1:${columnName(Math.max(1, currentColumnCount))}1`, "FORMULA")
  const oldRows = oldHeaders.length ? await readRange(spreadsheetId, `${tabName}!A2:${columnName(Math.max(1, oldHeaders.length))}`, "FORMULA") : []
  const aliases: Record<string, string> = {
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
  const oldHeaderIndex = new Map(oldHeaders.map((header, index) => [header, index]))
  const migratedRows = oldRows.filter((row) => row[0]).map((row, rowOffset) => {
    const migrated = characterSheetHeaders.map((header) => {
      const directIndex = oldHeaderIndex.get(header)
      if (directIndex !== undefined) return row[directIndex] || ""
      const separator = header.indexOf(" — ")
      const skillName = separator > 0 ? header.slice(0, separator) : header
      const aliasedSkill = aliases[skillName]
      if (!aliasedSkill) return ""
      const aliasedHeader = separator > 0 ? `${aliasedSkill}${header.slice(separator)}` : aliasedSkill
      const aliasIndex = oldHeaderIndex.get(aliasedHeader)
      return aliasIndex === undefined ? "" : row[aliasIndex] || ""
    })
    const prepared = applyCharacterDefaultsAndFormulas(migrated.slice(2), rowOffset + 2)
    return [migrated[0], migrated[1], ...prepared]
  })
  await updateRange(spreadsheetId, `${tabName}!A1:${columnName(characterSheetHeaders.length)}${Math.max(1, migratedRows.length + 1)}`, [characterSheetHeaders, ...migratedRows])
  await getDb().insert(sheetIndexSyncs).values({ key: syncKey }).onConflictDoNothing()
}

function characterCell(valueIndex: number, rowNumber: number) {
  return `${columnName(valueIndex + 3)}${rowNumber}`
}

function cappedStatFormula(expression: string) {
  const minimum = `((${expression})+10+ABS((${expression})-10))/2`
  return `=(${minimum}+90-ABS(${minimum}-90))/2`
}

function isGoogleSheetsCalculationError(value: GoogleSheetCellValue) {
  return /^#(?:REF|VALUE|N\/A|NAME|DIV\/0|NUM|ERROR|NULL)/i.test(String(value ?? "").trim())
}

function applyCharacterDefaultsAndFormulas(input: string[], rowNumber: number) {
  const values = input.slice(0, characterValueHeaders.length)
  while (values.length < characterValueHeaders.length) values.push("")
  characterSecondaryCalculatedFields.forEach((field, fieldIndex) => {
    const bonusIndex = characterSecondaryCalculationValueIndex(fieldIndex, "bonus")
    const modifierIndex = characterSecondaryCalculationValueIndex(fieldIndex, "modifier")
    if (!values[bonusIndex] || isGoogleSheetsCalculationError(values[bonusIndex])) values[bonusIndex] = isGoogleSheetsCalculationError(values[field.valueIndex]) ? "0" : values[field.valueIndex] || "0"
    values[modifierIndex] = "=0"
    values[field.valueIndex] = `=${characterCell(bonusIndex, rowNumber)}+${characterCell(modifierIndex, rowNumber)}`
  })
  characterSkills.forEach((skill, skillIndex) => {
    const characteristicPosition = characterCharacteristics.findIndex((item) => item.characteristic === skill.characteristic)
    const bonusStat = characterSkillValueIndex(skillIndex, 0)
    const modifierStat = characterSkillValueIndex(skillIndex, 1)
    const totalStat = characterSkillValueIndex(skillIndex, 2)
    const bonusSuccess = characterSkillValueIndex(skillIndex, 3)
    const modifierSuccess = characterSkillValueIndex(skillIndex, 4)
    const totalSuccess = characterSkillValueIndex(skillIndex, 5)
    const bonusFailure = characterSkillValueIndex(skillIndex, 6)
    const modifierFailure = characterSkillValueIndex(skillIndex, 7)
    const totalFailure = characterSkillValueIndex(skillIndex, 8)
    if (values[bonusStat] === "") values[bonusStat] = innateCharacterSkills.has(skill.name) ? "0" : "-20"
    if (values[bonusSuccess] === "") values[bonusSuccess] = "0"
    if (values[bonusFailure] === "") values[bonusFailure] = "0"
    values[modifierStat] = "=0"
    values[modifierSuccess] = "=0"
    values[modifierFailure] = "=0"
    const statExpression = `${characterCell(skill.characteristicIndex, rowNumber)}+${characterCell(bonusStat, rowNumber)}+${characterCell(modifierStat, rowNumber)}`
    values[totalStat] = cappedStatFormula(statExpression)
    values[totalSuccess] = `=${characterCell(23, rowNumber)}+${characterCell(characterCriticalValueIndex(characteristicPosition, "success"), rowNumber)}+${characterCell(bonusSuccess, rowNumber)}+${characterCell(modifierSuccess, rowNumber)}`
    values[totalFailure] = `=${characterCell(22, rowNumber)}+${characterCell(characterCriticalValueIndex(characteristicPosition, "failure"), rowNumber)}+${characterCell(bonusFailure, rowNumber)}+${characterCell(modifierFailure, rowNumber)}`
  })
  return values
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
  const rowNumber = await findSheetRowById(source.spreadsheetId, source.tabName, id)
  if (!rowNumber) return null
  const range = `${source.tabName}!C${rowNumber}:${columnName(characterSheetHeaders.length)}${rowNumber}`
  let [row = []] = await readRange(source.spreadsheetId, range)
  let values = row.slice(0, characterValueHeaders.length)
  while (values.length < characterValueHeaders.length) values.push("")
  if (characterSecondaryCalculatedFields.some((field) => isGoogleSheetsCalculationError(values[field.valueIndex]))) {
    await updateRange(source.spreadsheetId, range, [applyCharacterDefaultsAndFormulas(values, rowNumber)])
    const [repairedRow = []] = await readRange(source.spreadsheetId, range)
    row = repairedRow
    values = row.slice(0, characterValueHeaders.length)
    while (values.length < characterValueHeaders.length) values.push("")
  }
  const character = { ...indexed, name: values[0] || indexed.name, subtitle: values[1] || indexed.subtitle, values } satisfies CharacterSheetRecord
  characterSheetCache.set(id, { expiresAt: Date.now() + 30_000, character })
  return character
}

export async function updateCharacterSheet(accountUid: string | null, id: string, values: string[]) {
  const existing = accountUid ? await getCharacterForUser(accountUid, id) : await getCharacterById(id)
  if (!existing) throw new Error("CHARACTER_NOT_FOUND")
  const name = values[0]?.trim()
  if (!name || name.length > 120) throw new Error("INVALID_CHARACTER_NAME")
  const source = await charactersSource()
  if (!source) throw new Error("CHARACTERS_SHEET_UNAVAILABLE")
  await ensureCharacterSheetSchema(source.spreadsheetId, source.tabName)
  const rowNumber = await findSheetRowById(source.spreadsheetId, source.tabName, id)
  if (!rowNumber) throw new Error("CHARACTER_SHEET_ROW_NOT_FOUND")
  const nextValues = values.slice(0, characterValueHeaders.length)
  while (nextValues.length < characterValueHeaders.length) nextValues.push("")
  const preparedValues = applyCharacterDefaultsAndFormulas(nextValues, rowNumber)
  const range = `${source.tabName}!C${rowNumber}:${columnName(characterSheetHeaders.length)}${rowNumber}`
  let [calculatedValues = []] = await updateRangeAndReturnValues(source.spreadsheetId, range, [preparedValues])
  if (!calculatedValues.length) [calculatedValues = []] = await readRange(source.spreadsheetId, range)
  calculatedValues = calculatedValues.slice(0, characterValueHeaders.length)
  while (calculatedValues.length < characterValueHeaders.length) calculatedValues.push("")
  const updatedAt = new Date().toISOString()
  await getDb().update(characterIndex).set({ name, subtitle: nextValues[1] || "", updatedAt }).where(eq(characterIndex.id, id))
  const character = { ...existing, name, subtitle: nextValues[1] || "", updatedAt, values: calculatedValues } satisfies CharacterSheetRecord
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
  containerTypes: InventoryContainerTypeRecord[]
  containers: StoredInventoryContainer[]
  items: InventoryItemRecord[]
  contents: StoredInventoryContent[]
}

let inventoryWorkbookCache: { expiresAt: number; workbook: InventoryWorkbook; includesCatalog: boolean } | null = null
const INVENTORY_WORKBOOK_CACHE_MS = 60_000

const characterSheetCache = new Map<string, { expiresAt: number; character: CharacterSheetRecord }>()

function cacheInventoryWorkbook(workbook: InventoryWorkbook, includesCatalog = true) {
  inventoryWorkbookCache = { expiresAt: Date.now() + INVENTORY_WORKBOOK_CACHE_MS, workbook, includesCatalog }
}

function clearInventoryWorkbookCache() {
  inventoryWorkbookCache = null
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
      price: objectIndexCell(table, row, ["Prix", "Valeur", "Coût", "Cout"]),
      bulk: objectIndexCell(table, row, ["Encombrement"]),
      image: objectIndexCell(table, row, ["Image", "Illustration", "URL image"]),
      icon: (() => {
        // Une case vide ou en erreur (« #REF! ») prend l'icône d'Eraser à l'affichage.
        const storedIcon = objectIndexCell(table, row, ["Icône", "Icone", "Icon"])
        return isSheetErrorValue(storedIcon) ? "" : storedIcon
      })(),
      notes: objectIndexCell(table, row, ["Notes", "Note"]),
      link: objectIndexCell(table, row, ["Lien", "URL"]),
      rarity: objectIndexCell(table, row, ["Rareté", "Rarete"]),
      attributes: objectIndexCell(table, row, ["Attributs", "Attribut"]),
      prerequisites: objectIndexCell(table, row, ["Prérequis", "Prerequis"]),
      edition: objectIndexCell(table, row, ["Édition", "Edition"]),
      active: sheetValueIsActive(objectIndexCell(table, row, ["Actif", "Active", "Disponible"])),
    }]
  }))
}

async function readInventoryWorkbook(includeCatalog = true): Promise<InventoryWorkbook> {
  if (inventoryWorkbookCache && inventoryWorkbookCache.expiresAt > Date.now() && (!includeCatalog || inventoryWorkbookCache.includesCatalog)) {
    return inventoryWorkbookCache.workbook
  }
  const sheet = await ensureJdrSheet("inventory")
  if (!sheet) throw new Error("INVENTORY_SHEET_UNAVAILABLE")
  const ranges = [
    sheetTabRange("Types de contenants", "A2:F"),
    sheetTabRange(inventoryContainerTab, "A2:I"),
    sheetTabRange(inventoryItemsTab, "A2:S"),
    sheetTabRange(inventoryContentsTab, "A2:Q"),
  ]
  const parameters = new URLSearchParams()
  ranges.forEach((range) => parameters.append("ranges", range))
  const [payload, objectIndexTables] = await Promise.all([
    googleSheetsJson<{ valueRanges?: Array<{ values?: GoogleSheetCellValue[][] }> }>(
      `spreadsheets/${sheet.spreadsheetId}/values:batchGet?${parameters.toString()}`,
    ),
    includeCatalog ? listObjectIndexTables().catch(() => []) : Promise.resolve([]),
  ])
  const [typeRows, containerRows, itemRows, contentRows] = ranges.map((_, index) => normalizeGoogleSheetRows(payload.valueRanges?.[index]?.values))
  const mergedItems = [...parseInventoryItemRows(itemRows), ...parseObjectIndexItems(objectIndexTables)]
  const items = [...new Map(mergedItems.map((item) => [item.id, item])).values()]
  const configuredTypes = parseContainerTypeRows(typeRows)
  const containerTypes = [...new Map([...baseInventoryContainerTypes, ...configuredTypes].map((type) => [type.id, type])).values()]
  const workbook = {
    spreadsheetId: sheet.spreadsheetId,
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
  cacheInventoryWorkbook(workbook, includeCatalog)
  return workbook
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

async function appendInventorySlots(
  workbook: InventoryWorkbook,
  container: StoredInventoryContainer,
  type: InventoryContainerTypeRecord | undefined,
) {
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
  if (rows.length) {
    await appendRows(workbook.spreadsheetId, sheetTabRange(inventoryContentsTab, "A:Q"), rows.map(inventoryContentRow))
    clearInventoryWorkbookCache()
  }
}

export function campaignInventoryOwnerId(campaignId: string) {
  return `CAMPAGNE:${campaignId}`
}

function isCampaignInventoryOwner(ownerId: string) {
  return ownerId.startsWith("CAMPAGNE:")
}

async function ensureCampaignInventoryStorage(ownerId: string, includeCatalog = true) {
  let workbook = await readInventoryWorkbook(includeCatalog)
  const active = workbook.containers.filter((container) => container.characterId === ownerId && !container.deletedAt)
  if (!active.length) {
    const now = new Date().toISOString()
    const container: StoredInventoryContainer = {
      id: crypto.randomUUID(),
      characterId: ownerId,
      typeId: "",
      customName: "Inventaire de la campagne",
      category: "Inventaire",
      capacity: 50,
      order: 0,
      createdAt: now,
      deletedAt: "",
      rowNumber: 0,
    }
    await appendRows(workbook.spreadsheetId, sheetTabRange(inventoryContainerTab, "A:I"), [[
      container.id, container.characterId, "", container.customName, container.category,
      container.capacity, container.order, container.createdAt, "",
    ]])
    clearInventoryWorkbookCache()
    workbook = await readInventoryWorkbook(includeCatalog)
  }
  const container = workbook.containers.find((candidate) => candidate.characterId === ownerId && !candidate.deletedAt)
  if (container) await appendInventorySlots(workbook, container, undefined)
  return readInventoryWorkbook(includeCatalog)
}

async function ensureCharacterInventoryStorage(characterId: string, includeCatalog = true) {
  if (isCampaignInventoryOwner(characterId)) return ensureCampaignInventoryStorage(characterId, includeCatalog)
  let workbook = await readInventoryWorkbook(includeCatalog)
  const typeById = new Map(workbook.containerTypes.map((type) => [type.id, type]))
  const knownContainers = workbook.containers.filter((container) => container.characterId === characterId)
  const now = new Date().toISOString()
  const missingBaseContainers = baseInventoryContainerTypes.filter((baseType) =>
    baseType.category === "Esthétique"
      ? !knownContainers.some((container) => !container.deletedAt && inventoryContainerCategory(container, typeById) === "Esthétique")
      : !knownContainers.some((container) => container.typeId === baseType.id),
  )
  if (missingBaseContainers.length) {
    const nextOrder = knownContainers.reduce((maximum, container) => Math.max(maximum, container.order), -1) + 1
    const newContainers: StoredInventoryContainer[] = missingBaseContainers.map((baseType, index) => {
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
    await appendRows(workbook.spreadsheetId, sheetTabRange(inventoryContainerTab, "A:I"), newContainers.map((container) => [
      container.id,
      container.characterId,
      container.typeId,
      container.customName,
      container.category,
      container.capacity,
      container.order,
      container.createdAt,
      "",
    ]))
    clearInventoryWorkbookCache()
    workbook = await readInventoryWorkbook(includeCatalog)
  }

  const activeAestheticContainers = workbook.containers
    .filter((container) => container.characterId === characterId && !container.deletedAt && inventoryContainerCategory(container, new Map(workbook.containerTypes.map((type) => [type.id, type]))) === "Esthétique")
    .sort((left, right) => {
      const contentCount = (containerId: string) => workbook.contents.filter((content) => content.containerId === containerId && Boolean(content.itemId || (content.customName && content.quantity > 0))).length
      return contentCount(right.id) - contentCount(left.id)
        || Number(right.typeId === "TYPE-ESTHETIQUE-BASE") - Number(left.typeId === "TYPE-ESTHETIQUE-BASE")
        || left.order - right.order
    })
  const emptyAestheticDuplicates = activeAestheticContainers.slice(1).filter((container) =>
    !workbook.contents.some((content) => content.containerId === container.id && Boolean(content.itemId || (content.customName && content.quantity > 0))),
  )
  if (emptyAestheticDuplicates.length) {
    await updateRanges(workbook.spreadsheetId, emptyAestheticDuplicates.map((container) => ({
      range: sheetTabRange(inventoryContainerTab, `I${container.rowNumber}`),
      values: [[now]],
    })))
    clearInventoryWorkbookCache()
    workbook = await readInventoryWorkbook(includeCatalog)
  }

  const activeContainers = workbook.containers.filter((container) => container.characterId === characterId && !container.deletedAt)
  const refreshedTypeById = new Map(workbook.containerTypes.map((type) => [type.id, type]))
  for (const container of activeContainers) {
    await appendInventorySlots(workbook, container, refreshedTypeById.get(container.typeId))
  }
  return await readInventoryWorkbook(includeCatalog)
}

type InventoryOwnerMode = "character" | "npc"

async function ensureNpcBackpackInventoryStorage(npcId: string, includeCatalog = true) {
  let workbook = await readInventoryWorkbook(includeCatalog)
  const now = new Date().toISOString()
  const active = workbook.containers.filter((container) => container.characterId === npcId && !container.deletedAt)
  const existingBackpack = active.find((container) => container.typeId === "TYPE-SAC-BASE")
    ?? active.find((container) => inventoryContainerCategory(container, new Map(workbook.containerTypes.map((type) => [type.id, type]))) === "Inventaire")
  const alreadyMigrated = active.length === 1
    && existingBackpack?.typeId === "TYPE-SAC-BASE"
    && existingBackpack.customName === "Sac à dos"
  if (alreadyMigrated && existingBackpack) {
    await appendInventorySlots(workbook, existingBackpack, workbook.containerTypes.find((type) => type.id === "TYPE-SAC-BASE"))
    return readInventoryWorkbook(includeCatalog)
  }

  const npcSheet = await ensureJdrSheet("npcs")
  const npcRows = await readRange(npcSheet.spreadsheetId, `${npcSheet.tabName}!A2:${NPC_LAST_COLUMN}`)
  const legacyItems = npcInventoryFromCell(npcRows.find((row) => row[0] === npcId)?.[25])
  const activeIds = new Set(active.map((container) => container.id))
  const occupied = workbook.contents
    .filter((content) => content.characterId === npcId && activeIds.has(content.containerId))
    .filter((content) => content.quantity > 0 && Boolean(content.itemId || content.customName))
    .sort((left, right) => left.index - right.index)
  const capacity = Math.max(15, occupied.length + legacyItems.length)
  let backpack = existingBackpack
  if (!backpack) {
    backpack = {
      id: crypto.randomUUID(), characterId: npcId, typeId: "TYPE-SAC-BASE", customName: "Sac à dos",
      category: "Inventaire", capacity, order: 0, createdAt: now, deletedAt: "", rowNumber: 0,
    }
    await appendRows(workbook.spreadsheetId, sheetTabRange(inventoryContainerTab, "A:I"), [[
      backpack.id, npcId, backpack.typeId, backpack.customName, backpack.category, backpack.capacity, 0, now, "",
    ]])
    clearInventoryWorkbookCache()
    workbook = await readInventoryWorkbook(includeCatalog)
    backpack = workbook.containers.find((container) => container.id === backpack?.id)
    if (!backpack) throw new Error("INVENTORY_CONTAINER_NOT_FOUND")
  }

  const normalizedBackpack: StoredInventoryContainer = {
    ...backpack, typeId: "TYPE-SAC-BASE", customName: "Sac à dos", category: "Inventaire", capacity, order: 0, deletedAt: "",
  }
  const updates: Array<{ range: string; values: Array<Array<string | number | boolean>> }> = [{
    range: sheetTabRange(inventoryContainerTab, `A${backpack.rowNumber}:I${backpack.rowNumber}`),
    values: [[normalizedBackpack.id, npcId, normalizedBackpack.typeId, normalizedBackpack.customName, normalizedBackpack.category, capacity, 0, normalizedBackpack.createdAt || now, ""]],
  }]
  active.filter((container) => container.id !== backpack.id).forEach((container) => updates.push({
    range: sheetTabRange(inventoryContainerTab, `I${container.rowNumber}`), values: [[now]],
  }))
  occupied.forEach((content, index) => updates.push({
    range: sheetTabRange(inventoryContentsTab, `A${content.rowNumber}:Q${content.rowNumber}`),
    values: [inventoryContentRow({ ...content, containerId: backpack!.id, index: index + 1, equipped: false, updatedAt: now })],
  }))
  const legacyRows: StoredInventoryContent[] = legacyItems.map((item, index) => ({
    ...makeEmptyInventorySlot(npcId, backpack!.id, occupied.length + index + 1),
    id: `NPC-LEGACY-${npcId}-${item.id || index}`,
    quantity: item.quantity, customName: item.name, customDescription: item.notes, type: "Objet", updatedAt: now,
  })).filter((item) => !workbook.contents.some((content) => content.id === item.id))
  if (legacyRows.length) await appendRows(workbook.spreadsheetId, sheetTabRange(inventoryContentsTab, "A:Q"), legacyRows.map(inventoryContentRow))
  if (updates.length) await updateRanges(workbook.spreadsheetId, updates)
  clearInventoryWorkbookCache()
  workbook = await readInventoryWorkbook(includeCatalog)
  const refreshedBackpack = workbook.containers.find((container) => container.id === backpack.id && !container.deletedAt)
  if (!refreshedBackpack) throw new Error("INVENTORY_CONTAINER_NOT_FOUND")
  await appendInventorySlots(workbook, refreshedBackpack, workbook.containerTypes.find((type) => type.id === "TYPE-SAC-BASE"))
  return readInventoryWorkbook(includeCatalog)
}

async function inventoryStorageFor(ownerId: string, includeCatalog: boolean, mode: InventoryOwnerMode) {
  return mode === "npc" ? ensureNpcBackpackInventoryStorage(ownerId, includeCatalog) : ensureCharacterInventoryStorage(ownerId, includeCatalog)
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
  const workbook = await readInventoryWorkbook()
  const sourceContainers = workbook.containers.filter((container) => container.characterId === sourceCharacterId && !container.deletedAt)
  const targetAlreadyExists = workbook.containers.some((container) => container.characterId === targetCharacterId && !container.deletedAt)
  if (!sourceContainers.length || targetAlreadyExists) return
  const now = new Date().toISOString()
  const containerIds = new Map(sourceContainers.map((container) => [container.id, crypto.randomUUID()]))
  const clonedContainers = sourceContainers.map((container) => ({
    ...container,
    id: containerIds.get(container.id)!,
    characterId: targetCharacterId,
    createdAt: now,
    deletedAt: "",
    rowNumber: 0,
  }))
  await appendRows(workbook.spreadsheetId, sheetTabRange(inventoryContainerTab, "A:I"), clonedContainers.map((container) => [
    container.id, container.characterId, container.typeId, container.customName, container.category,
    container.capacity, container.order, container.createdAt, "",
  ]))
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
  if (clonedContents.length) await appendRows(workbook.spreadsheetId, sheetTabRange(inventoryContentsTab, "A:Q"), clonedContents.map(inventoryContentRow))
  clearInventoryWorkbookCache()
}

export async function addCharacterInventoryContainer(characterId: string, typeId: string) {
  const workbook = await ensureCharacterInventoryStorage(characterId)
  const type = workbook.containerTypes.find((candidate) => candidate.id === typeId && candidate.active)
  if (!type) throw new Error("INVENTORY_CONTAINER_TYPE_NOT_FOUND")
  const order = workbook.containers
    .filter((container) => container.characterId === characterId && !container.deletedAt)
    .reduce((maximum, container) => Math.max(maximum, container.order), -1) + 1
  const container: StoredInventoryContainer = {
    id: crypto.randomUUID(),
    characterId,
    typeId: type.id,
    customName: "",
    category: type.category,
    capacity: type.capacity,
    order,
    createdAt: new Date().toISOString(),
    deletedAt: "",
    rowNumber: 0,
  }
  await appendRows(workbook.spreadsheetId, sheetTabRange(inventoryContainerTab, "A:I"), [[
    container.id,
    container.characterId,
    container.typeId,
    container.customName,
    container.category,
    container.capacity,
    container.order,
    container.createdAt,
    "",
  ]])
  clearInventoryWorkbookCache()
  await appendInventorySlots(workbook, container, type)
  return getCharacterInventory(characterId)
}

export async function createCharacterInventoryContainer(characterId: string, input: { name: string; category: string; capacity: number }) {
  const workbook = await ensureCharacterInventoryStorage(characterId)
  const name = input.name.trim()
  const category = parseInventoryCategory(input.category)
  const capacity = Math.trunc(input.capacity)
  if (!name || name.length > 120 || !category || !Number.isFinite(capacity) || capacity < 1 || capacity > 10000) {
    throw new Error("INVALID_INVENTORY_CONTAINER")
  }
  const order = workbook.containers
    .filter((container) => container.characterId === characterId && !container.deletedAt)
    .reduce((maximum, container) => Math.max(maximum, container.order), -1) + 1
  const container: StoredInventoryContainer = {
    id: crypto.randomUUID(),
    characterId,
    typeId: "",
    customName: name,
    category,
    capacity,
    order,
    createdAt: new Date().toISOString(),
    deletedAt: "",
    rowNumber: 0,
  }
  await appendRows(workbook.spreadsheetId, sheetTabRange(inventoryContainerTab, "A:I"), [[
    container.id,
    container.characterId,
    "",
    container.customName,
    container.category,
    container.capacity,
    container.order,
    container.createdAt,
    "",
  ]])
  clearInventoryWorkbookCache()
  await appendInventorySlots(workbook, container, undefined)
  return getCharacterInventory(characterId)
}

export async function updateCharacterInventoryContainer(characterId: string, containerId: string, input: { name: string; capacity: number }) {
  const workbook = await ensureCharacterInventoryStorage(characterId)
  const container = workbook.containers.find((candidate) => candidate.id === containerId && candidate.characterId === characterId && !candidate.deletedAt)
  const name = input.name.trim()
  const capacity = Math.trunc(input.capacity)
  if (!container || !name || name.length > 120 || !Number.isFinite(capacity) || capacity < 1 || capacity > 10000) {
    throw new Error("INVALID_INVENTORY_CONTAINER")
  }
  const updated: StoredInventoryContainer = { ...container, customName: name, capacity }
  await updateRange(workbook.spreadsheetId, sheetTabRange(inventoryContainerTab, `A${container.rowNumber}:I${container.rowNumber}`), [[
    updated.id,
    updated.characterId,
    updated.typeId,
    updated.customName,
    updated.category,
    updated.capacity,
    updated.order,
    updated.createdAt,
    "",
  ]])
  clearInventoryWorkbookCache()
  await appendInventorySlots(workbook, updated, workbook.containerTypes.find((type) => type.id === updated.typeId))
  return getCharacterInventory(characterId)
}

export async function deleteCharacterInventoryContainer(characterId: string, containerId: string) {
  const workbook = await ensureCharacterInventoryStorage(characterId)
  const container = workbook.containers.find((candidate) => candidate.id === containerId && candidate.characterId === characterId && !candidate.deletedAt)
  if (!container) throw new Error("INVENTORY_CONTAINER_NOT_FOUND")
  const category = inventoryContainerCategory(container, new Map(workbook.containerTypes.map((type) => [type.id, type])))
  const hasContent = workbook.contents
    .filter((content) => content.containerId === container.id)
    .some((content) => category === "Bourse" ? content.quantity > 0 : Boolean(content.itemId || (content.customName && content.quantity > 0)))
  if (hasContent) throw new Error("INVENTORY_CONTAINER_NOT_EMPTY")
  await updateRange(workbook.spreadsheetId, sheetTabRange(inventoryContainerTab, `I${container.rowNumber}`), [[new Date().toISOString()]])
  clearInventoryWorkbookCache()
  return getCharacterInventory(characterId)
}

async function updateStoredInventoryContent(workbook: InventoryWorkbook, content: StoredInventoryContent) {
  await updateRange(
    workbook.spreadsheetId,
    sheetTabRange(inventoryContentsTab, `A${content.rowNumber}:Q${content.rowNumber}`),
    [inventoryContentRow(content)],
  )
  workbook.contents = workbook.contents.map((candidate) => candidate.id === content.id ? content : candidate)
  cacheInventoryWorkbook(workbook)
}

export async function addCharacterInventoryItem(characterId: string, itemId: string, requestedContainerId?: string, mode: InventoryOwnerMode = "character") {
  const workbook = await inventoryStorageFor(characterId, true, mode)
  const item = workbook.items.find((candidate) => candidate.id === itemId && candidate.active)
  if (!item) throw new Error("INVENTORY_ITEM_NOT_FOUND")
  const typeById = new Map(workbook.containerTypes.map((type) => [type.id, type]))
  let containers = workbook.containers
    .filter((container) => container.characterId === characterId && !container.deletedAt)
    .filter((container) => {
      if (isCampaignInventoryOwner(characterId)) return true
      const category = inventoryContainerCategory(container, typeById)
      const itemType = `${item.type} ${item.subtype}`
      return container.id === requestedContainerId
        ? canItemGoInInventoryCategory(itemType, category)
        : canItemBeAutoPlacedInInventoryCategory(itemType, category)
    })
    .sort((left, right) => left.order - right.order)
  if (mode === "npc") containers = containers.filter((container) => container.typeId === "TYPE-SAC-BASE")
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
    await appendRows(workbook.spreadsheetId, sheetTabRange(inventoryContentsTab, "A:Q"), [inventoryContentRow(addedSlot)])
    clearInventoryWorkbookCache()
    const refreshed = await readInventoryWorkbook()
    target = refreshed.contents.find((content) => content.id === addedSlot.id)
    if (!target) throw new Error("INVENTORY_FULL")
    workbook.contents = refreshed.contents
  }
  const updated: StoredInventoryContent = {
    ...target,
    itemId: item.id,
    quantity: stacked ? stacked.quantity + 1 : 1,
    customName: item.name,
    customDescription: item.description,
    type: item.type,
    subtype: item.subtype,
    effect: item.effect,
    nameHtml: item.nameHtml,
    descriptionHtml: item.descriptionHtml,
    effectHtml: item.effectHtml,
    updatedAt: new Date().toISOString(),
  }
  await updateStoredInventoryContent(workbook, updated)
  return buildCharacterInventory(characterId, workbook)
}

export async function createCharacterInventoryItem(
  characterId: string,
  requestedContainerId: string,
  input: { name: string; description: string; type: string; subtype: string; effect: string },
  mode: InventoryOwnerMode = "character",
) {
  const workbook = await inventoryStorageFor(characterId, true, mode)
  const container = workbook.containers.find((candidate) => candidate.characterId === characterId && !candidate.deletedAt && (mode === "npc" ? candidate.typeId === "TYPE-SAC-BASE" : candidate.id === requestedContainerId))
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
  await updateStoredInventoryContent(workbook, {
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
  })
  return buildCharacterInventory(characterId, workbook)
}

export async function setCharacterInventoryItemQuantity(characterId: string, slotId: string, quantity: number, mode: InventoryOwnerMode = "character") {
  const workbook = await inventoryStorageFor(characterId, true, mode)
  const content = workbook.contents.find((candidate) => candidate.id === slotId && candidate.characterId === characterId)
  if (!content || (!content.itemId && !content.customName)) throw new Error("INVENTORY_SLOT_NOT_FOUND")
  const container = workbook.containers.find((candidate) => candidate.id === content.containerId && !candidate.deletedAt)
  const typeById = new Map(workbook.containerTypes.map((type) => [type.id, type]))
  if (!container || inventoryContainerCategory(container, typeById) === "Bourse") throw new Error("INVENTORY_SLOT_NOT_FOUND")
  const item = workbook.items.find((candidate) => candidate.id === content.itemId)
  const maximum = item?.maxQuantity ?? 99
  const nextQuantity = Math.max(0, Math.min(maximum, Math.trunc(quantity)))
  const updated: StoredInventoryContent = nextQuantity === 0
    ? { ...content, itemId: "", quantity: 0, customName: "", customDescription: "", type: "", subtype: "", effect: "", equipped: false, modifiers: "", nameHtml: "", descriptionHtml: "", effectHtml: "", updatedAt: new Date().toISOString() }
    : { ...content, quantity: nextQuantity, updatedAt: new Date().toISOString() }
  await updateStoredInventoryContent(workbook, updated)
  return buildCharacterInventory(characterId, workbook)
}

export async function setCharacterInventoryItemEquipped(characterId: string, slotId: string, equipped: boolean) {
  const workbook = await ensureCharacterInventoryStorage(characterId)
  const content = workbook.contents.find((candidate) => candidate.id === slotId && candidate.characterId === characterId)
  const container = content && workbook.containers.find((candidate) => candidate.id === content.containerId && !candidate.deletedAt)
  const typeById = new Map(workbook.containerTypes.map((type) => [type.id, type]))
  if (!content || !container || (!content.itemId && !content.customName) || inventoryContainerCategory(container, typeById) === "Bourse") {
    throw new Error("INVENTORY_SLOT_NOT_FOUND")
  }
  await updateStoredInventoryContent(workbook, { ...content, equipped, updatedAt: new Date().toISOString() })
  return buildCharacterInventory(characterId, workbook)
}

export async function setCharacterInventoryItemModifiers(characterId: string, slotId: string, modifiers: string) {
  const workbook = await ensureCharacterInventoryStorage(characterId)
  const content = workbook.contents.find((candidate) => candidate.id === slotId && candidate.characterId === characterId)
  const container = content && workbook.containers.find((candidate) => candidate.id === content.containerId && !candidate.deletedAt)
  const typeById = new Map(workbook.containerTypes.map((type) => [type.id, type]))
  if (!content || !container || (!content.itemId && !content.customName) || inventoryContainerCategory(container, typeById) === "Bourse") {
    throw new Error("INVENTORY_SLOT_NOT_FOUND")
  }
  const normalized = serializeItemModifiers(parseItemModifiers(modifiers))
  if (normalized.length > 4000) throw new Error("INVALID_INVENTORY_MODIFIERS")
  await updateStoredInventoryContent(workbook, { ...content, modifiers: normalized, updatedAt: new Date().toISOString() })
  return buildCharacterInventory(characterId, workbook)
}

export async function updateCharacterInventoryItem(characterId: string, slotId: string, input: { name: string; description: string; type: string; subtype: string; effect: string; nameHtml?: string; descriptionHtml?: string; effectHtml?: string }, mode: InventoryOwnerMode = "character") {
  const workbook = await inventoryStorageFor(characterId, true, mode)
  const content = workbook.contents.find((candidate) => candidate.id === slotId && candidate.characterId === characterId)
  const container = content && workbook.containers.find((candidate) => candidate.id === content.containerId && !candidate.deletedAt)
  const name = input.name.trim()
  const type = input.type.trim() || "Objet"
  if (!content || !container || (!content.itemId && !content.customName) || !name || name.length > 160 || input.description.length > 1200 || input.effect.length > 1200) {
    throw new Error("INVALID_INVENTORY_ITEM")
  }
  const category = inventoryContainerCategory(container, new Map(workbook.containerTypes.map((candidate) => [candidate.id, candidate])))
  if (!isCampaignInventoryOwner(characterId) && !canItemGoInInventoryCategory(`${type} ${input.subtype}`, category)) throw new Error("INVENTORY_ITEM_WRONG_CATEGORY")
  await updateStoredInventoryContent(workbook, {
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
  })
  return buildCharacterInventory(characterId, workbook)
}

export async function moveCharacterInventoryItem(characterId: string, slotId: string, targetContainerId: string) {
  const workbook = await ensureCharacterInventoryStorage(characterId)
  const source = workbook.contents.find((content) => content.id === slotId && content.characterId === characterId)
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
  let targets = workbook.contents.filter((content) => content.containerId === targetContainer.id && (targetCategory === "Esthétique" || content.index <= targetContainer.capacity)).sort((left, right) => left.index - right.index)
  const stack = source.itemId
    ? targets.find((content) => content.itemId === source.itemId && content.quantity + source.quantity <= sourceItem.maxQuantity)
    : undefined
  let target = stack ?? targets.find((content) => !content.itemId && !content.customName)
  if (!target && targetCategory === "Esthétique") {
    const nextIndex = targets.reduce((maximum, content) => Math.max(maximum, content.index), 0) + 1
    const addedSlot = makeEmptyInventorySlot(characterId, targetContainer.id, nextIndex)
    await appendRows(workbook.spreadsheetId, sheetTabRange(inventoryContentsTab, "A:Q"), [inventoryContentRow(addedSlot)])
    clearInventoryWorkbookCache()
    const refreshed = await readInventoryWorkbook()
    targets = refreshed.contents.filter((content) => content.containerId === targetContainer.id).sort((left, right) => left.index - right.index)
    target = targets.find((content) => content.id === addedSlot.id)
    workbook.contents = refreshed.contents
  }
  if (!target) throw new Error("INVENTORY_FULL")
  const now = new Date().toISOString()
  await updateStoredInventoryContent(workbook, {
    ...target,
    itemId: source.itemId,
    quantity: stack ? stack.quantity + source.quantity : source.quantity,
    customName: source.customName,
    customDescription: source.customDescription,
    type: source.type,
    subtype: source.subtype,
    effect: source.effect,
    equipped: targetCategory !== "Bourse" && source.equipped,
    modifiers: source.modifiers,
    nameHtml: source.nameHtml,
    descriptionHtml: source.descriptionHtml,
    effectHtml: source.effectHtml,
    updatedAt: now,
  })
  await updateStoredInventoryContent(workbook, {
    ...source,
    itemId: "",
    quantity: 0,
    customName: "",
    customDescription: "",
    type: "",
    subtype: "",
    effect: "",
    equipped: false,
    modifiers: "",
    nameHtml: "",
    descriptionHtml: "",
    effectHtml: "",
    updatedAt: now,
  })
  return buildCharacterInventory(characterId, workbook)
}

/** Ce qui vient de changer de sac : sert à prévenir le destinataire. */
export type InventoryTransferMoved = { name: string; quantity: number; targetId: string; targetMode: InventoryOwnerMode }

export async function transferCharacterInventoryItem(sourceId: string, slotId: string, targetId: string, sourceMode: InventoryOwnerMode = "character", onMoved?: (moved: InventoryTransferMoved) => void) {
  await inventoryStorageFor(sourceId, true, sourceMode)
  const targetMode: InventoryOwnerMode = await getNpcById(targetId).catch(() => null) ? "npc" : "character"
  const workbook = await inventoryStorageFor(targetId, true, targetMode)
  const source = workbook.contents.find((content) => content.id === slotId && content.characterId === sourceId)
  if (!source || (!source.itemId && !source.customName) || sourceId === targetId) throw new Error("INVENTORY_SLOT_NOT_FOUND")
  const sourceItem = workbook.items.find((item) => item.id === source.itemId) ?? customInventoryItem(source)
  if (!sourceItem) throw new Error("INVENTORY_ITEM_NOT_FOUND")
  const typeById = new Map(workbook.containerTypes.map((type) => [type.id, type]))
  const containers = workbook.containers
    .filter((container) => container.characterId === targetId && !container.deletedAt)
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
  const updatedTarget: StoredInventoryContent = {
    ...target,
    itemId: source.itemId,
    quantity: stack ? stack.quantity + source.quantity : source.quantity,
    customName: source.customName,
    customDescription: source.customDescription,
    type: source.type,
    subtype: source.subtype,
    effect: source.effect,
    equipped: targetContainer ? inventoryContainerCategory(targetContainer, typeById) !== "Bourse" && source.equipped : false,
    modifiers: source.modifiers,
    nameHtml: source.nameHtml,
    descriptionHtml: source.descriptionHtml,
    effectHtml: source.effectHtml,
    updatedAt: now,
  }
  const updatedSource: StoredInventoryContent = {
    ...source,
    itemId: "",
    quantity: 0,
    customName: "",
    customDescription: "",
    type: "",
    subtype: "",
    effect: "",
    equipped: false,
    modifiers: "",
    nameHtml: "",
    descriptionHtml: "",
    effectHtml: "",
    updatedAt: now,
  }
  await updateRanges(workbook.spreadsheetId, [updatedTarget, updatedSource].map((content) => ({
    range: sheetTabRange(inventoryContentsTab, `A${content.rowNumber}:Q${content.rowNumber}`),
    values: [inventoryContentRow(content)],
  })))
  workbook.contents = workbook.contents.map((content) => content.id === updatedTarget.id ? updatedTarget : content.id === updatedSource.id ? updatedSource : content)
  cacheInventoryWorkbook(workbook)
  onMoved?.({ name: source.customName || sourceItem.name, quantity: source.quantity, targetId, targetMode })
  return buildCharacterInventory(sourceId, workbook)
}

export async function setCharacterInventoryCurrency(characterId: string, containerId: string, currency: string, amount: number) {
  const workbook = await ensureCharacterInventoryStorage(characterId)
  const typeById = new Map(workbook.containerTypes.map((type) => [type.id, type]))
  const container = workbook.containers.find((candidate) => candidate.id === containerId && candidate.characterId === characterId && !candidate.deletedAt)
  if (!container || inventoryContainerCategory(container, typeById) !== "Bourse") throw new Error("INVENTORY_CONTAINER_NOT_FOUND")
  const rows = workbook.contents.filter((content) => content.containerId === container.id)
  const target = rows.find((content) => inventoryCurrencyKey(content.customName || content.subtype) === inventoryCurrencyKey(currency))
  if (!target) throw new Error("INVENTORY_CURRENCY_NOT_FOUND")
  const otherAmount = rows.filter((content) => content.id !== target.id).reduce((total, content) => total + content.quantity, 0)
  const nextAmount = Math.max(0, Math.min(container.capacity - otherAmount, Math.trunc(amount)))
  await updateStoredInventoryContent(workbook, { ...target, quantity: nextAmount, updatedAt: new Date().toISOString() })
  return buildCharacterInventory(characterId, workbook)
}

function todoRow(todo: AdminTodoRecord) {
  return [todo.id, todo.creatorUid, todo.creatorName, todo.name, todo.content, todo.priority, todo.label, todo.labelColor, todo.completed, todo.createdAt, todo.updatedAt, todo.deletedAt || ""]
}

const sheetRowCache = new Map<string, { rowNumber: number; expiresAt: number }>()

async function findSheetRowById(spreadsheetId: string, tabName: string, id: string) {
  const cacheKey = `${spreadsheetId}:${tabName}:${id}`
  const cached = sheetRowCache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) return cached.rowNumber
  const rows = await readRange(spreadsheetId, `${tabName}!A:A`)
  const rowIndex = rows.findIndex((row, index) => index > 0 && row[0] === id)
  if (rowIndex < 0) return null
  const rowNumber = rowIndex + 1
  sheetRowCache.set(cacheKey, { rowNumber, expiresAt: Date.now() + 10 * 60_000 })
  return rowNumber
}

async function updateTodoSheetRow(todo: AdminTodoRecord) {
  const source = await ensureJdrSheet("admin_todos")
  const rowNumber = await findSheetRowById(source.spreadsheetId, source.tabName, todo.id)
  if (!rowNumber) throw new Error("TODO_NOT_FOUND")
  await updateRange(source.spreadsheetId, `${source.tabName}!A${rowNumber}:L${rowNumber}`, [todoRow(todo)])
}

async function findAdminTodoInGoogleSheet(id: string) {
  const source = await ensureJdrSheet("admin_todos")
  const rowNumber = await findSheetRowById(source.spreadsheetId, source.tabName, id)
  if (!rowNumber) return null
  const [row] = await readRange(source.spreadsheetId, `${source.tabName}!A${rowNumber}:L${rowNumber}`)
  return adminTodoFromSheetRow(row || [])
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
  const existingRecords = (await readRange(sheet.spreadsheetId, `${sheet.tabName}!A2:L`)).map(adminTodoFromSheetRow).filter((todo): todo is AdminTodoRecord => Boolean(todo))
  if (!owner) return existingRecords

  const existingSheetIds = new Set(existingRecords.map((todo) => todo.id))
  const baseTime = Date.now()
  const missingRecords: AdminTodoRecord[] = requestedAdminTodoSeed.filter((todo) => !existingSheetIds.has(todo.id)).map((todo, index) => {
    const createdAt = new Date(baseTime + index).toISOString()
    return { ...todo, creatorUid: owner.creatorUid, creatorName: owner.creatorName, completed: "non", createdAt, updatedAt: createdAt, deletedAt: null }
  })
  if (missingRecords.length) await appendRows(sheet.spreadsheetId, `${sheet.tabName}!A:L`, missingRecords.map(todoRow))
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
  await appendRows(sheet.spreadsheetId, `${sheet.tabName}!A:L`, [todoRow(todo)])
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

export async function softDeleteItem(kind: "todo" | "character" | "campaign", id: string) {
  const deletedAt = new Date().toISOString()
  if (kind === "todo") {
    const todo = await findAdminTodoInGoogleSheet(id)
    if (!todo) throw new Error("TODO_NOT_FOUND")
    await updateTodoSheetRow({ ...todo, deletedAt, updatedAt: deletedAt })
    return
  }
  if (kind === "character") await getDb().update(characterIndex).set({ deletedAt }).where(eq(characterIndex.id, id))
  else await getDb().update(campaignIndex).set({ deletedAt }).where(eq(campaignIndex.id, id))
}

export async function listTrash() {
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
  } else if (kind === "character") await getDb().update(characterIndex).set({ deletedAt: null }).where(eq(characterIndex.id, id))
  else await getDb().update(campaignIndex).set({ deletedAt: null }).where(eq(campaignIndex.id, id))
}

async function deleteSheetRow(spreadsheetId: string, tabName: string, id: string) {
  const rowNumber = await findSheetRowById(spreadsheetId, tabName, id)
  if (!rowNumber) return
  const metadata = await googleSheetsJson<{ sheets?: Array<{ properties?: { sheetId?: number; title?: string } }> }>(`spreadsheets/${spreadsheetId}?fields=sheets.properties(sheetId,title)`)
  const sheetId = metadata.sheets?.find((sheet) => sheet.properties?.title === tabName)?.properties?.sheetId
  if (sheetId === undefined) return
  await googleSheetsJson(`spreadsheets/${spreadsheetId}:batchUpdate`, {
    method: "POST",
    body: JSON.stringify({ requests: [{ deleteDimension: { range: { sheetId, dimension: "ROWS", startIndex: rowNumber - 1, endIndex: rowNumber } } }] }),
  })
  sheetRowCache.clear()
}

export async function permanentlyDeleteItem(kind: "todo" | "character" | "campaign", id: string) {
  if (kind === "todo") {
    const todo = await findAdminTodoInGoogleSheet(id)
    if (!todo?.deletedAt) throw new Error("TODO_NOT_FOUND")
    const source = await ensureJdrSheet("admin_todos")
    await deleteSheetRow(source.spreadsheetId, source.tabName, id)
  } else if (kind === "character") {
    const source = await charactersSource()
    if (source) await deleteSheetRow(source.spreadsheetId, source.range.split("!")[0], id)
    await getDb().delete(characterIndex).where(and(eq(characterIndex.id, id), isNotNull(characterIndex.deletedAt)))
  } else {
    const source = await campaignsSource()
    if (source) await deleteSheetRow(source.spreadsheetId, source.range.split("!")[0], id)
    await getDb().delete(campaignIndex).where(and(eq(campaignIndex.id, id), isNotNull(campaignIndex.deletedAt)))
  }
}

async function configureExistingClassesSheet(spreadsheetId: string) {
  const metadata = await googleSheetsJson<{
    sheets?: Array<{ properties?: { sheetId?: number } }>
  }>(`spreadsheets/${spreadsheetId}?fields=sheets.properties.sheetId`)
  const sheetId = metadata.sheets?.[0]?.properties?.sheetId
  if (sheetId === undefined) throw new Error("SHEETS_METADATA_UNAVAILABLE")

  await googleSheetsJson(`spreadsheets/${spreadsheetId}:batchUpdate`, {
    method: "POST",
    body: JSON.stringify({
      requests: [
        {
          setDataValidation: {
            range: { sheetId, startRowIndex: 1, endRowIndex: 1000, startColumnIndex: 7, endColumnIndex: 8 },
            rule: {
              condition: {
                type: "ONE_OF_LIST",
                values: classDifficulties.map((value) => ({ userEnteredValue: value })),
              },
              strict: true,
              showCustomUi: true,
            },
          },
        },
        {
          setDataValidation: {
            range: { sheetId, startRowIndex: 1, endRowIndex: 1000, startColumnIndex: 8, endColumnIndex: 9 },
            rule: {
              condition: {
                type: "NUMBER_BETWEEN",
                values: [{ userEnteredValue: "0" }, { userEnteredValue: "100" }],
              },
              strict: true,
            },
          },
        },
        {
          repeatCell: {
            range: { sheetId, startRowIndex: 1, endRowIndex: 1000, startColumnIndex: 8, endColumnIndex: 9 },
            cell: { userEnteredFormat: { numberFormat: { type: "NUMBER", pattern: '0"%"' } } },
            fields: "userEnteredFormat.numberFormat",
          },
        },
        {
          repeatCell: {
            range: { sheetId, startRowIndex: 1, endRowIndex: 26, startColumnIndex: 4, endColumnIndex: 7 },
            cell: { userEnteredFormat: { wrapStrategy: "WRAP", verticalAlignment: "MIDDLE" } },
            fields: "userEnteredFormat.wrapStrategy,userEnteredFormat.verticalAlignment",
          },
        },
        {
          updateDimensionProperties: {
            range: { sheetId, dimension: "ROWS", startIndex: 1, endIndex: 26 },
            properties: { pixelSize: 42 },
            fields: "pixelSize",
          },
        },
      ],
    }),
  })
}

export async function seedDefaultClasses() {
  const source = await resolveJdrSheet("classes")
  if (!source) throw new Error("CLASSES_SHEET_NOT_CONFIGURED")
  await configureExistingClassesSheet(source.spreadsheetId)

  const existingRows = await readRange(
    source.spreadsheetId,
    `${source.tabName}!A2:I1000`,
    "FORMULA",
  )
  const imagesById = new Map(
    existingRows.filter((row) => row[0] && row[3]).map((row) => [row[0], row[3]]),
  )
  const rows = defaultClassRows.map((row) => {
    const output = [...row] as ClassSheetRow
    output[3] = imagesById.get(row[0]) || ""
    return output
  })
  await updateRange(source.spreadsheetId, `${source.tabName}!A2:I26`, rows)
  await getDb().delete(sheetIndexSyncs).where(eq(sheetIndexSyncs.key, "classes:global"))
  return { count: rows.length, sheet: source }
}

export async function ensureDefaultClassesIfEmpty() {
  const source = await resolveJdrSheet("classes")
  if (!source) return { seeded: false, count: 0 }
  const current = await readRange(source.spreadsheetId, `${source.tabName}!A2:C26`)
  const count = current.filter((row) => row[0] && row[2]).length
  if (count > 0) return { seeded: false, count }
  const result = await seedDefaultClasses()
  return { seeded: true, count: result.count }
}

export async function sheetsConfigured() {
  if (googleServiceConfigured() && runtimeEnv().GOOGLE_CHARACTERS_SHEET_ID) return true
  return Boolean(await resolveJdrSheet("characters"))
}
