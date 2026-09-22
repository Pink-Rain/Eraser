import { Suspense } from "react"
import { redirect } from "next/navigation"

import { AuthenticatedShell } from "@/components/eraser/authenticated-shell"
import { DeferredContentLoading } from "@/components/eraser/deferred-content-loading"
import { WorldIndexManager } from "@/components/eraser/world-index-manager"
import { worldIndexDefinitions } from "@/lib/world-index-definitions"
import { getWorldIndex, type WorldIndexData } from "@/lib/world-indexes"
import { authorizedAccount } from "@/lib/server-auth"

export const dynamic = "force-dynamic"

const definition = worldIndexDefinitions.places

async function IndexData() {
  let data: WorldIndexData | null = null
  let error = ""
  try {
    data = await getWorldIndex("places")
  } catch (reason) {
    console.error("WORLD_INDEX_LOAD_FAILED", "places", reason instanceof Error ? reason.message : "UNKNOWN_ERROR")
    error = `Le classeur « ${definition.sheetName} » n’a pas pu être chargé depuis Google Drive.`
  }
  return <WorldIndexManager indexKey="places" initialData={data} initialError={error} />
}

export default async function Page() {
  const account = await authorizedAccount(["admin", "mj"])
  if (!account) redirect("/")
  return (
    <AuthenticatedShell pageLabel={definition.title} roles={["admin", "mj"]}>
      <div className="w-full px-4 pt-4 sm:px-6">
        <div className="shrink-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-primary/75">Ressources</p>
          <h1 className="font-display text-2xl font-semibold sm:text-3xl">{definition.title}</h1>
        </div>
        <Suspense fallback={<DeferredContentLoading label="Chargement de l’index…" />}>
          <IndexData />
        </Suspense>
      </div>
    </AuthenticatedShell>
  )
}
