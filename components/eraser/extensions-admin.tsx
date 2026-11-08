"use client"

import { useState } from "react"
import Link from "next/link"
import { ExternalLink, Puzzle, RefreshCw } from "lucide-react"

import { Button } from "@/components/ui/button"
import { extensionRoleLabels } from "@/lib/extensions"
import type { ExtensionOverview } from "@/lib/extensions-sync"

export type ExtensionsAdminData = { api: number; installable: boolean; extensions: ExtensionOverview[] }

function publishedLine(extension: ExtensionOverview) {
  const published = extension.published
  if (published.status === "published") return `Version publiée : ${published.version}`
  if (published.status === "none") return "Aucune version publiée pour l'instant."
  if (published.status === "invalid") return `Version publiée illisible : ${published.error}`
  return `Dépôt injoignable : ${published.error}`
}

/**
 * Administration › Extensions : les extensions liées à Eraser (lib/extensions.ts), leur version
 * publiée et celle de cet ordinateur. Toutes les installations les reçoivent toutes ; qui peut
 * en ouvrir une est réglé dans le code.
 */
export function ExtensionsAdmin({ initial }: { initial: ExtensionsAdminData }) {
  const [data, setData] = useState(initial)
  const [error, setError] = useState<string | null>(null)
  const [checking, setChecking] = useState(false)

  async function check() {
    setChecking(true)
    setError(null)
    const response = await fetch("/api/extensions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "check" }) }).catch(() => null)
    const body = await response?.json().catch(() => null) as (ExtensionsAdminData & { error?: string }) | null
    if (response?.ok && body?.extensions) setData(body)
    else setError(body?.error || "La vérification n'a pas abouti.")
    setChecking(false)
  }

  return (
    <div className="w-full flex-1 px-5 py-9 sm:px-8 md:py-14">
      <div className="mb-5 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-primary/75"><span className="h-px w-7 bg-primary/50" />Administration</div>
      <h1 className="font-display text-4xl font-semibold sm:text-5xl">Extensions</h1>
      <p className="mt-3 max-w-2xl text-muted-foreground">
        Chaque extension vit dans son propre dépôt GitHub. Tous les ordinateurs les reçoivent toutes et les mettent à jour seuls (au
        lancement d’Eraser, toutes les six heures, et avec « Chercher les mises à jour »). Seuls ceux qui y ont accès peuvent les ouvrir.
      </p>
      {!data.installable && <p className="mt-3 max-w-2xl text-sm text-muted-foreground">Ce serveur ne tourne pas dans l’application Windows : les extensions ne s’y installent pas.</p>}
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Button variant="outline" size="sm" onClick={() => void check()} disabled={checking}><RefreshCw className={checking ? "animate-spin" : undefined} />{checking ? "Vérification…" : "Vérifier les mises à jour"}</Button>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>

      <div className="mt-8 space-y-6">
        {data.extensions.map((extension) => (
          <section key={extension.id} className="rounded-2xl border bg-card/90 p-5 sm:p-7">
            <div className="flex flex-wrap items-start gap-3">
              <div className="min-w-0 flex-1">
                <h2 className="flex items-center gap-2 font-display text-2xl font-semibold"><Puzzle className="size-5 text-primary" />{extension.name}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{extension.description}</p>
                <a href={`https://github.com/${extension.repository}`} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs text-primary hover:underline">{extension.repository}<ExternalLink className="size-3" /></a>
              </div>
              {extension.installed && <Button asChild variant="outline" size="sm"><Link href={`/extension/${extension.id}`}>Ouvrir</Link></Button>}
            </div>

            <div className="mt-4 grid gap-1 text-sm">
              <p>{publishedLine(extension)}</p>
              {extension.needsNewerEraser && <p className="text-muted-foreground">Cette version demande une version plus récente d’Eraser : elle attend sa mise à jour.</p>}
              <p className="text-muted-foreground">
                {extension.installed
                  ? `Sur cet ordinateur : version ${extension.installed.version}${extension.installed.installedAt ? `, installée le ${new Date(extension.installed.installedAt).toLocaleString("fr-FR")}` : ""}.`
                  : "Pas installée sur cet ordinateur."}
              </p>
              {extension.lastError && <p className="text-destructive">Dernier téléchargement : {extension.lastError}</p>}
            </div>

            <p className="mt-4 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Ouverte à : {extension.openTo.map((role) => extensionRoleLabels[role]).join(", ")}
            </p>
          </section>
        ))}
      </div>
    </div>
  )
}
