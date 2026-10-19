import { Suspense } from "react"
import { redirect } from "next/navigation"

import { AuthenticatedShell } from "@/components/eraser/authenticated-shell"
import { DeferredContentLoading } from "@/components/eraser/deferred-content-loading"
import { WorldIndexManager } from "@/components/eraser/world-index-manager"
import { packTableRows } from "@/lib/index-rows-wire"
import { objectEngineData, OBJECTS_ENGINE_KEY } from "@/lib/object-index-engine-server"
import { authorizedAccount } from "@/lib/server-auth"
import type { WorldIndexData } from "@/lib/world-indexes"

export const dynamic = "force-dynamic"

/** Les items, sur le moteur des index : la même page que les autres index, avec leurs outils (icônes, inventaires). */
async function ObjectIndexesData() {
  let data: WorldIndexData | null = null
  let error = ""
  try {
    data = await objectEngineData()
  } catch (reason) {
    error = reason instanceof Error && reason.message === "OBJECT_INDEX_FOLDER_NOT_FOUND"
      ? "Le dossier « Objets » est introuvable dans le Drive connecté."
      // Le code de Google (quota, délai…) aide à comprendre un échec qui se répète.
      : `Les tableaux du dossier « Objets » n’ont pas pu être chargés${reason instanceof Error && reason.message ? ` (${reason.message.slice(0, 160)})` : ""}. Réessaie avec « Actualiser ».`
  }
  return <WorldIndexManager indexKey={OBJECTS_ENGINE_KEY} initialData={data ? { ...data, tables: data.tables.map(packTableRows) } : data} initialError={error} />
}

export default async function ObjectIndexesPage() {
  const account = await authorizedAccount(["admin", "mj"])
  if (!account) redirect("/")
  return (
    <AuthenticatedShell pageLabel="Items" roles={["admin", "mj"]}>
      <div className="w-full px-4 pt-4 sm:px-6">
        <div className="shrink-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-primary/75">Index</p>
          <h1 className="font-display text-2xl font-semibold sm:text-3xl">Items</h1>
        </div>
        <Suspense fallback={<DeferredContentLoading variant="table" label="Chargement des items…" />}>
          <ObjectIndexesData />
        </Suspense>
      </div>
    </AuthenticatedShell>
  )
}
