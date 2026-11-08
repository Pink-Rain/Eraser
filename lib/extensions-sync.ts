/**
 * Quand une installation télécharge ses extensions : au lancement (après un court délai, pour
 * ne pas retarder la première page), puis toutes les six heures, et à « Chercher les mises à
 * jour ». Toutes les installations reçoivent toutes les extensions liées (lib/extensions.ts),
 * quel que soit le rôle du compte ; chaque extension règle les droits de ses modules.
 */
import { EXTENSION_API_VERSION, linkedExtensions, type ExtensionDefinition } from "@/lib/extensions"
import { extensionsDirectory, lastExtensionCheck, latestPublished, readInstalledExtension, updateExtension, type ExtensionCheck } from "@/lib/extensions-install"

const START_AFTER_MS = 10_000
const RECHECK_MS = 6 * 60 * 60_000
let lastSyncAt = 0

/** Appelée par la coque à chaque page : ne fait rien tant que la dernière vérification a moins de six heures. */
export function syncExtensionsSoon() {
  if (!extensionsDirectory()) return
  const first = lastSyncAt === 0
  if (!first && Date.now() - lastSyncAt < RECHECK_MS) return
  lastSyncAt = Date.now()
  const timer = setTimeout(() => {
    void syncExtensions().catch((error) => console.error("EXTENSIONS_SYNC_FAILED", error instanceof Error ? error.message : error))
  }, first ? START_AFTER_MS : 0)
  timer.unref?.()
}

/** Installe ou met à jour, une par une, toutes les extensions liées. */
export async function syncExtensions(options: { force?: boolean; forceFloorMs?: number } = {}) {
  const results: Record<string, ExtensionCheck> = {}
  for (const extension of linkedExtensions) {
    const result = await updateExtension(extension, options)
    if (result.error) console.error("EXTENSION_INSTALL_FAILED", extension.id, result.error)
    results[extension.id] = result
  }
  return results
}

/** Ce que « Chercher les mises à jour » dit d'une extension. */
export type ExtensionUpdateReport = {
  id: string
  name: string
  /** `updated` : une nouvelle version vient d'être installée ; `waiting` : elle attend un Eraser plus récent. */
  status: "updated" | "current" | "none" | "waiting" | "error"
  version: string | null
  error: string | null
}

/**
 * « Chercher les mises à jour » (barre latérale, tous les comptes) : relit GitHub et installe tout
 * de suite les extensions. GitHub limite les lectures anonymes : relu au plus une fois par minute,
 * même à coups de clics.
 */
export async function checkExtensionsNow(): Promise<ExtensionUpdateReport[]> {
  if (!extensionsDirectory()) return []
  lastSyncAt = Date.now()
  const reports: ExtensionUpdateReport[] = []
  for (const extension of linkedExtensions) {
    const before = (await readInstalledExtension(extension.id))?.version ?? null
    const result = await updateExtension(extension, { force: true, forceFloorMs: 60_000 })
    const version = result.installed?.version ?? null
    const status: ExtensionUpdateReport["status"] = result.error ? "error"
      : version && version !== before ? "updated"
        : result.needsNewerEraser ? "waiting"
          : version ? "current" : "none"
    reports.push({ id: extension.id, name: extension.name, status, version, error: result.error })
  }
  return reports
}

export type ExtensionOverview = ExtensionDefinition & {
  published:
    | { status: "published"; version: string; api: number }
    | { status: "none" }
    | { status: "unreachable" | "invalid"; error: string }
  installed: { version: string; installedAt: string } | null
  needsNewerEraser: boolean
  lastError: string | null
}

/** Ce que montre Administration › Extensions : version publiée, version de cet ordinateur. */
export async function extensionsOverview(options: { force?: boolean } = {}) {
  const extensions = await Promise.all(linkedExtensions.map(async (extension): Promise<ExtensionOverview> => {
    const [published, installed] = await Promise.all([latestPublished(extension, options.force), readInstalledExtension(extension.id)])
    return {
      ...extension,
      published: published.status === "published" ? { status: "published", version: published.version, api: published.api } : published,
      installed: installed ? { version: installed.version, installedAt: installed.installedAt } : null,
      needsNewerEraser: published.status === "published" && published.api > EXTENSION_API_VERSION,
      lastError: lastExtensionCheck(extension.id)?.error ?? null,
    }
  }))
  return { api: EXTENSION_API_VERSION, installable: Boolean(extensionsDirectory()), extensions }
}
