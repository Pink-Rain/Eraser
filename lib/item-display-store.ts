/**
 * Où vit l'affichage des items (lib/item-display.ts) : sur le serveur partagé de l'application
 * (« eraser-accounts », `shared_records`), comme les cartes. Un réglage d'Eraser, pas une donnée
 * JDR : rien n'est écrit dans Google Sheets, et toutes les installations voient le même.
 *
 * Une entrée par endroit : portée « item-display », clé « inventory », « shop » ou « search »,
 * valeur `{ fields }` en JSON. « Revenir à l'affichage d'Eraser » efface l'entrée.
 */
import { isItemPlace, parseItemPlaceDisplay, type ItemDisplaySettings, type ItemPlace, type ItemPlaceDisplay } from "@/lib/item-display"
import { deleteSharedRecord, listSharedRecords, sharedStoreAvailable, writeSharedRecord } from "@/lib/shared-store"
import { sharedSnapshot } from "@/lib/shared-snapshot"

const SCOPE = "item-display"
/** La limite d'une valeur du serveur partagé. */
const MAX_VALUE = 20_000

async function readAll(): Promise<ItemDisplaySettings> {
  const settings: ItemDisplaySettings = {}
  if (!sharedStoreAvailable()) return settings
  for (const record of await listSharedRecords(SCOPE)) {
    if (!isItemPlace(record.key)) continue
    const parsed = parseItemPlaceDisplay(record.value)
    if (parsed) settings[record.key] = parsed
  }
  return settings
}

// Servie tout de suite, relue derrière passé 30 s (lib/shared-snapshot.ts).
const snapshot = sharedSnapshot(readAll)

/** L'affichage réglé de chaque endroit. Aucun sans serveur partagé : l'affichage d'Eraser. */
export async function listItemDisplay(): Promise<ItemDisplaySettings> {
  return snapshot.read()
}

/** Enregistre l'affichage d'un endroit ; `null` : l'endroit revient à l'affichage d'Eraser. */
export async function saveItemDisplay(place: ItemPlace, display: ItemPlaceDisplay | null): Promise<ItemDisplaySettings> {
  if (!isItemPlace(place)) throw new Error("ITEM_DISPLAY_INVALID")
  if (!sharedStoreAvailable()) throw new Error("ITEM_DISPLAY_UNAVAILABLE")
  if (!display) await deleteSharedRecord(SCOPE, place)
  else {
    const clean = parseItemPlaceDisplay(display)
    if (!clean) throw new Error("ITEM_DISPLAY_INVALID")
    const value = JSON.stringify(clean)
    if (value.length > MAX_VALUE) throw new Error("ITEM_DISPLAY_TOO_LARGE")
    await writeSharedRecord(SCOPE, place, value)
  }
  return snapshot.read(true)
}
