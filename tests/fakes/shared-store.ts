/**
 * Le serveur partagé (Worker), branché à la place de lib/shared-store : des enregistrements
 * en mémoire, par portée. Les autres modules qu'appellent les notifications d'objets
 * (feuilles, comptes, liens d'identité) répondent au plus simple.
 */
export const store = { records: new Map<string, Map<string, { value: string; updatedAt: string }>>() }

export function reset() {
  store.records.clear()
}

export function sharedStoreAvailable() {
  return true
}

export async function writeSharedRecord(scope: string, key: string, value: string) {
  const records = store.records.get(scope) ?? new Map()
  records.set(key, { value, updatedAt: new Date().toISOString() })
  store.records.set(scope, records)
}

export async function readSharedRecord(scope: string, key: string) {
  const record = store.records.get(scope)?.get(key)
  return record ? { scope, key, ...record } : null
}

export async function deleteSharedRecord(scope: string, key: string) {
  store.records.get(scope)?.delete(key)
}

export async function listSharedRecords(scope: string) {
  return [...(store.records.get(scope) ?? new Map<string, { value: string; updatedAt: string }>())].map(([key, record]) => ({ scope, key, ...record }))
}

export async function listIdentityLinks() {
  return []
}

export function chatAuthorName(user: { displayName?: string; uid: string }) {
  return user.displayName || user.uid
}

export async function getCharacterById(id: string) {
  return { id, ownerUid: "joueuse-1", name: "Lina" }
}

export async function getCampaignDashboard() {
  return null
}

export async function getNpcById() {
  return null
}
