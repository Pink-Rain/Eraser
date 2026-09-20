import { Suspense } from "react"
import { redirect } from "next/navigation"

import { AuthenticatedShell } from "@/components/eraser/authenticated-shell"
import { ClassIndexManager } from "@/components/eraser/class-index-manager"
import { DeferredContentLoading } from "@/components/eraser/deferred-content-loading"
import { listClassResources } from "@/lib/class-content"
import { authorizedAccount } from "@/lib/server-auth"

export const dynamic = "force-dynamic"

async function ClassIndexData({ showErrorDetail }: { showErrorDetail: boolean }) {
  let data: Awaited<ReturnType<typeof listClassResources>> | null = null
  let loadError = ""
  try {
    data = await listClassResources()
  } catch (error) {
    const detail = error instanceof Error ? error.message : "UNKNOWN_ERROR"
    console.error("CLASS_INDEX_MANAGER_LOAD_FAILED", detail)
    loadError = showErrorDetail
      ? `Les tableaux « Sorts de classe » n’ont pas pu être chargés. (${detail})`
      : "Les tableaux « Sorts de classe » n’ont pas pu être chargés."
  }
  return <ClassIndexManager initialData={data ?? { classes: [], spells: [], similarities: [], headers: [], file: null }} initialError={loadError} />
}

export default async function ClassIndexPage() {
  const account = await authorizedAccount(["admin", "mj"])
  if (!account) redirect("/")
  return <AuthenticatedShell pageLabel="Index des classes" roles={["admin", "mj"]}>
    <div className="w-full flex-1 px-5 py-9 sm:px-8 md:py-14">
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-primary/75">Ressources</p>
      <h1 className="font-display mt-3 text-4xl font-semibold sm:text-5xl">Index des classes</h1>
      <p className="mt-3 max-w-3xl leading-7 text-muted-foreground">Crée, relie et range les bonus, passifs et actifs sans multiplier les doublons.</p>
      <Suspense fallback={<DeferredContentLoading label="Chargement des sorts de classe…" />}><ClassIndexData showErrorDetail={account.role === "admin"} /></Suspense>
    </div>
  </AuthenticatedShell>
}
