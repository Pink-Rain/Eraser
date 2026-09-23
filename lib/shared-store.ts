import { env } from "cloudflare:workers"

import { remoteAccountsConfig, remoteAccountsFetch } from "@/lib/accounts-remote"
import { currentAuthToken } from "@/lib/server-auth"

// État qui décrit une ressource commune (le lien Roll20 d'une campagne, le
// script Google attaché à une feuille partagée) et non une machine. Stocké
// dans la base locale, il faisait croire à chaque autre installation que rien
// n'existait — et la poussait à recréer un lien ou un script sur une ressource
// déjà partagée. Quand aucun serveur partagé n'est configuré, l'appelant
// retombe sur sa table locale.
export type SharedRecord = { scope: string; key: string; value: string; updatedAt: string }

export function sharedStoreAvailable() {
  return Boolean(remoteAccountsConfig(env))
}

async function call(path: string, init: { method: "GET" | "POST"; body?: unknown }) {
  const config = remoteAccountsConfig(env)
  if (!config) return null
  const token = await currentAuthToken().catch(() => undefined)
  return remoteAccountsFetch(config, path, { ...init, token })
}

function scopePath(scope: string, key: string) {
  return `/shared/${encodeURIComponent(scope)}/${encodeURIComponent(key)}`
}

export async function readSharedRecord(scope: string, key: string) {
  const response = await call(scopePath(scope, key), { method: "GET" })
  return (response as { record: SharedRecord | null } | null)?.record ?? null
}

export async function writeSharedRecord(scope: string, key: string, value: string) {
  await call(scopePath(scope, key), { method: "POST", body: { value } })
}


export async function listSharedRecords(scope: string) {
  const response = await call(`/shared/${encodeURIComponent(scope)}`, { method: "GET" })
  return (response as { records: SharedRecord[] } | null)?.records ?? []
}
