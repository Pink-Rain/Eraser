import { eq } from "drizzle-orm"

import { getDb } from "@/db"
import { jdrGoogleSheets } from "@/db/schema"

export type JdrSheetKey = "classes" | "characters" | "campaigns" | "campaign_characters" | "character_relations" | "admin_todos" | "inventory" | "shops" | "npcs" | "tabletop" | "vocabulary" | "creatures" | "places" | "religions" | "peoples" | "languages"

export type JdrSheetRecord = {
  key: JdrSheetKey
  spreadsheetId: string
  name: string
  tabName: string
  webViewLink: string
  createdAt: string
  updatedAt: string
}

const SHEET_RECORD_CACHE_MS = 5 * 60_000
const sheetRecordCache = new Map<JdrSheetKey, { expiresAt: number; promise: Promise<JdrSheetRecord | null> }>()

export async function listJdrSheets() {
  return getDb().select().from(jdrGoogleSheets).orderBy(jdrGoogleSheets.name)
}

export async function getJdrSheet(key: JdrSheetKey) {
  const cached = sheetRecordCache.get(key)
  if (cached && cached.expiresAt > Date.now()) return cached.promise
  const promise = getDb().select().from(jdrGoogleSheets).where(eq(jdrGoogleSheets.key, key)).limit(1)
    .then(([sheet]) => sheet ?? null)
  sheetRecordCache.set(key, { expiresAt: Date.now() + SHEET_RECORD_CACHE_MS, promise })
  promise.catch(() => sheetRecordCache.delete(key))
  return promise
}

export async function saveJdrSheet(input: Omit<JdrSheetRecord, "createdAt" | "updatedAt">) {
  const now = new Date().toISOString()
  await getDb()
    .insert(jdrGoogleSheets)
    .values({ ...input, updatedAt: now })
    .onConflictDoUpdate({
      target: jdrGoogleSheets.key,
      set: {
        spreadsheetId: input.spreadsheetId,
        name: input.name,
        tabName: input.tabName,
        webViewLink: input.webViewLink,
        updatedAt: now,
      },
    })
  sheetRecordCache.delete(input.key)
  return getJdrSheet(input.key)
}
