import { listSharedRecords, sharedStoreAvailable, writeSharedRecord } from "@/lib/shared-store"
import { cleanPortraitFraming, type PortraitFraming } from "@/lib/portrait-framing-shared"

/**
 * Le cadrage choisi dans l'éditeur de token (où se trouve le visage dans l'avatar), gardé
 * dans le serveur partagé : les vues qui recadrent l'avatar (cartes, listes, petites
 * vignettes) le montrent au même endroit que le token, sur toutes les installations.
 */
const scope = "portrait-framing"
const CACHE_MS = 5 * 60 * 1000

let cached: { at: number; value: Record<string, PortraitFraming> } | null = null

/** Tous les cadrages, par « genre:identifiant » (« character:PER-1 ») ; une seule lecture du serveur partagé. */
export async function readPortraitFramings(): Promise<Record<string, PortraitFraming>> {
  if (!sharedStoreAvailable()) return {}
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.value
  const value: Record<string, PortraitFraming> = {}
  for (const record of await listSharedRecords(scope)) {
    try {
      const framing = cleanPortraitFraming(JSON.parse(record.value))
      if (framing) value[record.key] = framing
    } catch { /* un enregistrement illisible est ignoré */ }
  }
  cached = { at: Date.now(), value }
  return value
}

export async function savePortraitFraming(kind: string, id: string, framing: PortraitFraming) {
  if (!sharedStoreAvailable()) return
  const key = `${kind}:${id}`
  await writeSharedRecord(scope, key, JSON.stringify(framing))
  if (cached) cached = { ...cached, value: { ...cached.value, [key]: framing } }
}
