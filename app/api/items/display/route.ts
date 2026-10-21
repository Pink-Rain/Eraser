import { NextResponse } from "next/server"

import type { ObjectIndexTable } from "@/lib/google-sheets"
import type { ObjectTraitLook } from "@/lib/inventory-schema"
import { objectTableSpecs } from "@/lib/index-kinds-server"
import { foldItemColumn, isItemPlace, itemDisplayForViewer, itemExtraColumns, itemListValues, parseItemPlaceDisplay, type ItemDisplaySettings, type ItemViewer } from "@/lib/item-display"
import { listItemDisplay, saveItemDisplay } from "@/lib/item-display-store"
import { objectCatalog } from "@/lib/object-catalog"
import { objectItemId, shopObjectId } from "@/lib/object-item-id"
import { authorizedAccount } from "@/lib/server-auth"

const messages: Record<string, string> = {
  ITEM_DISPLAY_INVALID: "Cet affichage n’a pas pu être lu.",
  ITEM_DISPLAY_UNAVAILABLE: "L’affichage des items se garde sur le serveur partagé d’Eraser, qui n’est pas configuré ici.",
  ITEM_DISPLAY_TOO_LARGE: "Trop de colonnes placées pour cet endroit : masques-en quelques-unes.",
}

/** Une valeur de colonne : son texte, et sa mise en forme quand elle en a une. */
type ItemColumnValue = { t: string; h?: string }

const nameAliases = new Set(["Nom", "Nom de l'objet", "Objet", "Arme", "Équipement", "Equipement", "Ressource", "Livre", "Titre"].map(foldItemColumn))
const idAliases = new Set(["ID", "Identifiant"].map(foldItemColumn))

/**
 * Les valeurs des colonnes placées, item par item (sous son identifiant d'inventaire et sous
 * celui des magasins), et l'allure de chaque colonne (style imposé, couleurs de la liste, unité).
 */
function columnValues(tables: ObjectIndexTable[], columns: string[]) {
  const values: Record<string, Record<string, ItemColumnValue>> = {}
  const looks: Record<string, ObjectTraitLook> = {}
  if (!columns.length) return { values, looks }
  const used = new Map<string, Set<string>>()
  for (const table of tables) {
    const nameAt = table.headers.findIndex((header) => nameAliases.has(foldItemColumn(header)))
    const idAt = table.headers.findIndex((header) => idAliases.has(foldItemColumn(header)))
    const specs = objectTableSpecs(table)
    const wanted = columns.flatMap((column) => {
      const at = table.headers.findIndex((header) => foldItemColumn(header) === foldItemColumn(column))
      return at >= 0 ? [{ column, at, spec: specs.find((item) => item.header === table.headers[at])?.spec }] : []
    })
    if (!wanted.length || nameAt < 0) continue
    for (const { column, spec } of wanted) {
      if (looks[column] || !spec) continue
      const look: ObjectTraitLook = {}
      if (spec.style && !spec.style.keepCellFormatting) look.style = spec.style
      if ((spec.kind === "choice" || spec.kind === "linked-choice") && spec.options?.length) look.options = spec.options.map((option) => ({ value: option.value, ...(option.color ? { color: option.color } : {}) }))
      if (spec.kind === "number" && spec.number?.defaultUnit) look.unit = spec.number.defaultUnit
      looks[column] = look
    }
    for (const row of table.rows) {
      if (!(row.values[nameAt] ?? "").trim()) continue
      const entry: Record<string, ItemColumnValue> = {}
      for (const { column, at } of wanted) {
        const text = (row.values[at] ?? "").trim()
        if (!text || /^#(REF|N\/A|VALUE|NAME|DIV\/0|NUM|ERROR)[!?]?/i.test(text)) continue
        const html = (row.html?.[at] ?? "").trim()
        entry[column] = html && html !== text ? { t: text, h: html } : { t: text }
        let seen = used.get(column)
        if (!seen) { seen = new Set(); used.set(column, seen) }
        for (const part of itemListValues(text)) seen.add(foldItemColumn(part))
      }
      if (!Object.keys(entry).length) continue
      const idCell = idAt >= 0 ? row.values[idAt] : undefined
      values[objectItemId(idCell, table.fileId, table.sheetId, row.rowNumber)] = entry
      const shopId = shopObjectId(idCell, table.fileId, table.sheetId, row.rowNumber)
      values[shopId] = entry
    }
  }
  // Seules les options utilisées : une liste de choix peut être longue.
  for (const [column, look] of Object.entries(looks)) {
    const seen = used.get(column)
    if (look.options) {
      const options = look.options.filter((option) => seen?.has(foldItemColumn(option.value)))
      if (options.length) look.options = options
      else delete look.options
    }
    if (!Object.keys(look).length) delete looks[column]
  }
  return { values, looks }
}

let memo: { tables: ObjectIndexTable[]; settings: ItemDisplaySettings; viewer: ItemViewer; result: ReturnType<typeof columnValues> } | null = null

/**
 * L'affichage des items pour ce lecteur (sans ce qu'il ne voit pas) et la valeur des colonnes
 * qu'il place. `all=1` (MJ, admin) : les réglages tels qu'enregistrés, pour l'éditeur.
 */
export async function GET(request: Request) {
  const account = await authorizedAccount()
  if (!account) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
  const viewer: ItemViewer = account.role === "joueur" ? "players" : "mj"
  let settings: ItemDisplaySettings = {}
  let unavailable = false
  try { settings = await listItemDisplay() } catch (error) {
    // Serveur partagé injoignable : l'affichage d'Eraser, et on le dit.
    unavailable = true
    console.error("ITEM_DISPLAY_LOAD_FAILED", error instanceof Error ? error.message : "UNKNOWN_ERROR")
  }
  if (new URL(request.url).searchParams.get("all") === "1" && viewer === "mj") return NextResponse.json({ settings, ...(unavailable ? { unavailable: true } : {}) })
  const shown = itemDisplayForViewer(settings, viewer)
  const columns = itemExtraColumns(shown)
  let result: ReturnType<typeof columnValues> = { values: {}, looks: {} }
  if (columns.length) {
    try {
      const tables = await objectCatalog()
      result = memo && memo.tables === tables && memo.settings === settings && memo.viewer === viewer ? memo.result : columnValues(tables, columns)
      memo = { tables, settings, viewer, result }
    } catch (error) {
      console.error("ITEM_DISPLAY_VALUES_FAILED", error instanceof Error ? error.message : "UNKNOWN_ERROR")
    }
  }
  return NextResponse.json({ settings: shown, values: result.values, looks: result.looks, ...(unavailable ? { unavailable: true } : {}) })
}

/** Enregistre l'affichage d'un endroit (`display: null` : celui d'Eraser), pour les MJ et administrateurs. */
export async function POST(request: Request) {
  const account = await authorizedAccount(["admin", "mj"])
  if (!account) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
  const body = (await request.json().catch(() => ({}))) as { place?: unknown; display?: unknown }
  if (!isItemPlace(body.place)) return NextResponse.json({ error: messages.ITEM_DISPLAY_INVALID }, { status: 400 })
  const display = body.display === null ? null : parseItemPlaceDisplay(body.display)
  if (body.display !== null && !display) return NextResponse.json({ error: messages.ITEM_DISPLAY_INVALID }, { status: 400 })
  try {
    return NextResponse.json({ settings: await saveItemDisplay(body.place, display) })
  } catch (error) {
    const code = error instanceof Error ? error.message : ""
    console.error("ITEM_DISPLAY_SAVE_FAILED", code)
    return NextResponse.json({ error: messages[code] ?? "L’affichage n’a pas pu être enregistré sur le serveur partagé d’Eraser." }, { status: 400 })
  }
}
