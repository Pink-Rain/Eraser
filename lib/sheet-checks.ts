import { createHash } from "node:crypto"
import { eq } from "drizzle-orm"

import { getDb } from "@/db"
import { sheetIndexSyncs } from "@/db/schema"

/**
 * Les vérifications de structure déjà faites par cette installation (les en-têtes d'un
 * onglet sont bien là), gardées dans la base locale. Sans elles, chaque démarrage d'Eraser
 * relisait l'en-tête de chaque onglet de chaque index : des dizaines de requêtes Google,
 * sur un quota que toutes les installations partagent. La clé décrit ce qui a été vérifié
 * (classeur, onglets, colonnes attendues) : une version qui attend d'autres colonnes
 * vérifie de nouveau.
 */
function storedKey(key: string) {
  return `sheet-check:${createHash("sha256").update(key).digest("hex").slice(0, 40)}`
}

/** La vérification `key` a-t-elle réussi il y a moins de `maxAgeMs` ? Une base illisible répond non. */
export async function recentlyChecked(key: string, maxAgeMs: number) {
  try {
    const [row] = await getDb().select().from(sheetIndexSyncs).where(eq(sheetIndexSyncs.key, storedKey(key))).limit(1)
    const at = row ? Date.parse(row.syncedAt) : Number.NaN
    return Number.isFinite(at) && Date.now() - at < maxAgeMs
  } catch {
    return false
  }
}

/** Note la vérification `key` comme réussie à l'instant. */
export async function markChecked(key: string) {
  const syncedAt = new Date().toISOString()
  await getDb().insert(sheetIndexSyncs).values({ key: storedKey(key), syncedAt })
    .onConflictDoUpdate({ target: sheetIndexSyncs.key, set: { syncedAt } })
    .catch(() => undefined)
}
