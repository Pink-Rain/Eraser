import { Suspense } from "react"
import { notFound, redirect } from "next/navigation"

import { AuthenticatedShell } from "@/components/eraser/authenticated-shell"
import { DeferredContentLoading } from "@/components/eraser/deferred-content-loading"
import { WorldIndexManager } from "@/components/eraser/world-index-manager"
import { customIndexEntry, isCustomIndexKey } from "@/lib/custom-indexes"
import { getWorldIndex, type WorldIndexData } from "@/lib/world-indexes"
import { authorizedAccount } from "@/lib/server-auth"

export const dynamic = "force-dynamic"

async function IndexData({ indexKey, sheetName }: { indexKey: `perso-${string}`; sheetName: string }) {
  let data: WorldIndexData | null = null
  let error = ""
  try {
    data = await getWorldIndex(indexKey)
  } catch (reason) {
    console.error("WORLD_INDEX_LOAD_FAILED", indexKey, reason instanceof Error ? reason.message : "UNKNOWN_ERROR")
    error = `Le classeur « ${sheetName} » n’a pas pu être chargé depuis Google Drive.`
  }
  return <WorldIndexManager indexKey={indexKey} initialData={data} initialError={error} />
}

/** Un index créé depuis « Nouvel index » : même tableur que les index du monde. */
export default async function CustomIndexPage({ params }: { params: Promise<{ cle: string }> }) {
  const account = await authorizedAccount(["admin", "mj"])
  if (!account) redirect("/")
  const { cle } = await params
  const key = decodeURIComponent(cle)
  if (!isCustomIndexKey(key)) notFound()
  const entry = await customIndexEntry(key).catch(() => null)
  if (!entry) notFound()
  return (
    <AuthenticatedShell pageLabel={entry.title} roles={["admin", "mj"]}>
      <div className="w-full px-4 pt-4 sm:px-6">
        <div className="shrink-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-primary/75">Index</p>
          <h1 className="font-display text-2xl font-semibold sm:text-3xl">{entry.title}</h1>
          {entry.description && <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{entry.description}</p>}
        </div>
        <Suspense fallback={<DeferredContentLoading label="Chargement de l’index…" />}>
          <IndexData indexKey={entry.key} sheetName={entry.sheetName} />
        </Suspense>
      </div>
    </AuthenticatedShell>
  )
}
