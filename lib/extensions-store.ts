/**
 * Les données que la partie serveur d'une extension garde sur le serveur partagé
 * (« eraser-accounts », `shared_records`, portée « extension:<id> », 20 000 caractères au plus
 * par entrée). L'ancienne portée « extensions » (qui recevait quelle extension, alpha 272 à 274)
 * n'est plus lue : toutes les installations reçoivent toutes les extensions.
 */
import { linkedExtensions } from "@/lib/extensions"
import { deleteSharedRecord, listSharedRecords, readSharedRecord, sharedStoreAvailable, writeSharedRecord } from "@/lib/shared-store"

/** La limite d'une valeur du serveur partagé. */
const MAX_VALUE = 20_000

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
