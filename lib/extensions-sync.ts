/**
 * Quand une installation télécharge ses extensions : au lancement (après un court délai, pour
 * ne pas retarder la première page), quand l'admin change qui les reçoit, et toutes les six
 * heures. Seules celles que l'admin a cochées pour le rôle du compte connecté sont
 * téléchargées (lib/extensions-store.ts) ; une extension décochée reste sur le disque, cachée.
 */
import type { SiteRole } from "@/lib/auth-types"
import { EXTENSION_API_VERSION, extensionRoles, extensionWantedBy, linkedExtensions, type ExtensionDefinition, type ExtensionSettings } from "@/lib/extensions"
import { extensionsDirectory, lastExtensionCheck, latestPublished, readInstalledExtension, updateExtension, type ExtensionCheck } from "@/lib/extensions-install"
import { listExtensionSettings } from "@/lib/extensions-store"

const START_AFTER_MS = 10_000
const RECHECK_MS = 6 * 60 * 60_000
const lastSync = new Map<SiteRole, { wanted: string; at: number }>()

/** Appelée par la coque à chaque page : ne fait rien tant que rien n'a changé depuis la dernière fois. */
export function syncExtensionsSoon(role: SiteRole | null | undefined) {
  if (!role || !extensionsDirectory()) return
  // Lue pendant la requête (la session du compte est lisible) ; copie en mémoire ensuite.
  void listExtensionSettings().then((settings) => {
    const wanted = linkedExtensions.filter((extension) => extensionWantedBy(settings, extension.id, role)).map((extension) => extension.id).join(",")
    const last = lastSync.get(role)
    if (last && last.wanted === wanted && Date.now() - last.at < RECHECK_MS) return
    lastSync.set(role, { wanted, at: Date.now() })
    if (!wanted) return
    const timer = setTimeout(() => {
      void syncExtensions(role, settings).catch((error) => console.error("EXTENSIONS_SYNC_FAILED", error instanceof Error ? error.message : error))
    }, last ? 0 : START_AFTER_MS)
    timer.unref?.()
  }).catch(() => undefined)
}

/** Installe ou met à jour, une par une, les extensions que ce rôle doit recevoir. */
export async function syncExtensions(role: SiteRole, settings: ExtensionSettings, options: { force?: boolean } = {}) {
  const results: Record<string, ExtensionCheck> = {}
  for (const extension of linkedExtensions) {
    if (!extensionWantedBy(settings, extension.id, role)) continue
    const result = await updateExtension(extension, options)
    if (result.error) console.error("EXTENSION_INSTALL_FAILED", extension.id, result.error)
    results[extension.id] = result
  }
  return results
}

export type ExtensionOverview = ExtensionDefinition & {
  roles: SiteRole[]
  published:
    | { status: "published"; version: string; api: number }
    | { status: "none" }
    | { status: "unreachable" | "invalid"; error: string }
  installed: { version: string; installedAt: string } | null
  needsNewerEraser: boolean
  lastError: string | null
}

/** Ce que montre Administration › Extensions : réglages, version publiée, version de cet ordinateur. */
export async function extensionsOverview(options: { force?: boolean } = {}) {
  const settings = await listExtensionSettings()
  const extensions = await Promise.all(linkedExtensions.map(async (extension): Promise<ExtensionOverview> => {
    const [published, installed] = await Promise.all([latestPublished(extension, options.force), readInstalledExtension(extension.id)])
    return {
      ...extension,
      roles: extensionRoles(settings, extension.id),
      published: published.status === "published" ? { status: "published", version: published.version, api: published.api } : published,
      installed: installed ? { version: installed.version, installedAt: installed.installedAt } : null,
      needsNewerEraser: published.status === "published" && published.api > EXTENSION_API_VERSION,
      lastError: lastExtensionCheck(extension.id)?.error ?? null,
    }
  }))
  return { api: EXTENSION_API_VERSION, installable: Boolean(extensionsDirectory()), extensions }
}
