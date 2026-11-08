/**
 * Où vivent les réglages des extensions (lib/extensions.ts) : sur le serveur partagé
 * (« eraser-accounts », `shared_records`), comme l'affichage des items. Toutes les installations
 * voient le même choix ; rien n'est écrit dans Google Sheets.
 *
 * - Portée « extensions », une entrée par extension liée (clé : son identifiant), valeur
 *   `{ "roles": ["joueur", "mj", "admin"] }` : qui la reçoit. Sans entrée, personne.
 * - Portée « extension:<id> » : les données que la partie serveur d'une extension garde
 *   (`extensionDataStore`), 20 000 caractères au plus par entrée.
 */
import type { SiteRole } from "@/lib/auth-types"
import { extensionRoleOrder, linkedExtension, linkedExtensions, parseExtensionRoles, type ExtensionSettings } from "@/lib/extensions"
import { deleteSharedRecord, listSharedRecords, readSharedRecord, sharedStoreAvailable, writeSharedRecord } from "@/lib/shared-store"
import { sharedSnapshot } from "@/lib/shared-snapshot"

const SCOPE = "extensions"
/** La limite d'une valeur du serveur partagé. */
const MAX_VALUE = 20_000

async function readAll(): Promise<ExtensionSettings> {
  const settings: ExtensionSettings = {}
  if (!sharedStoreAvailable()) return settings
  for (const record of await listSharedRecords(SCOPE)) {
    if (linkedExtension(record.key)) settings[record.key] = { roles: parseExtensionRoles(record.value) }
  }
  return settings
}

// Lu à chaque page par la vérification des extensions (lib/extensions-sync.ts) : servi tout de
// suite, relu derrière passé 5 min. Un choix de l'admin arrive donc partout en quelques minutes.
const snapshot = sharedSnapshot(readAll, { freshMs: 5 * 60_000 })

/** Qui reçoit chaque extension. Aucun réglage sans serveur partagé : aucune extension. */
export async function listExtensionSettings(): Promise<ExtensionSettings> {
  return snapshot.read()
}

/** Enregistre qui reçoit une extension liée. */
export async function saveExtensionRoles(id: string, roles: SiteRole[]): Promise<ExtensionSettings> {
  if (!linkedExtension(id)) throw new Error("EXTENSION_UNKNOWN")
  if (!sharedStoreAvailable()) throw new Error("EXTENSION_SETTINGS_UNAVAILABLE")
  const clean = extensionRoleOrder.filter((role) => roles.includes(role))
  if (clean.length) await writeSharedRecord(SCOPE, id, JSON.stringify({ roles: clean }))
  else await deleteSharedRecord(SCOPE, id)
  return snapshot.read(true)
}

export type ExtensionDataEntry = { key: string; value: string; updatedAt: string }

/** Les données partagées d'une extension, pour sa partie serveur. */
export function extensionDataStore(id: string) {
  if (!linkedExtensions.some((extension) => extension.id === id)) throw new Error("EXTENSION_UNKNOWN")
  const scope = `extension:${id}`
  const checkKey = (key: string) => {
    if (typeof key !== "string" || !key || key.length > 200) throw new Error("EXTENSION_DATA_KEY_INVALID")
    return key
  }
  const requireStore = () => {
    if (!sharedStoreAvailable()) throw new Error("EXTENSION_DATA_UNAVAILABLE")
  }
  return {
    async get(key: string): Promise<string | null> {
      requireStore()
      return (await readSharedRecord(scope, checkKey(key)))?.value ?? null
    },
    async set(key: string, value: string): Promise<void> {
      requireStore()
      if (typeof value !== "string" || value.length > MAX_VALUE) throw new Error("EXTENSION_DATA_TOO_LARGE")
      await writeSharedRecord(scope, checkKey(key), value)
    },
    async remove(key: string): Promise<void> {
      requireStore()
      await deleteSharedRecord(scope, checkKey(key))
    },
    async list(): Promise<ExtensionDataEntry[]> {
      requireStore()
      return (await listSharedRecords(scope)).map((record) => ({ key: record.key, value: record.value, updatedAt: record.updatedAt }))
    },
  }
}
