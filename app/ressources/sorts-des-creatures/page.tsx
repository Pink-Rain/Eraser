import { Suspense } from "react"
import { redirect } from "next/navigation"

import { AuthenticatedShell } from "@/components/eraser/authenticated-shell"
import { ClassIndexManager } from "@/components/eraser/class-index-manager"
import { DeferredContentLoading } from "@/components/eraser/deferred-content-loading"
import { listClassResources } from "@/lib/class-content"
import { authorizedAccount } from "@/lib/server-auth"

export const dynamic = "force-dynamic"

async function CreatureSpellIndexData({ showErrorDetail }: { showErrorDetail: boolean }) {
  let data: Awaited<ReturnType<typeof listClassResources>> | null = null
  let loadError = ""
  try {
    data = await listClassResources(false, "creatures")
  } catch (error) {
    const detail = error instanceof Error ? error.message : "UNKNOWN_ERROR"
    console.error("CREATURE_SPELL_INDEX_LOAD_FAILED", detail)
    const base = "L’onglet « Sorts des créatures » du classeur « Index des créatures » n’a pas pu être chargé."
    loadError = showErrorDetail ? `${base} (${detail})` : base
  }
  return <ClassIndexManager kind="creatures" initialData={data ?? { classes: [], spells: [], similarities: [], headers: [], file: null }} initialError={loadError} />
}

/** Comme « Sorts des classes », sans classes, rangs ni bonus. */
export default async function CreatureSpellIndexPage() {
  const account = await authorizedAccount(["admin", "mj"])
  if (!account) redirect("/")
  return <AuthenticatedShell pageLabel="Sorts des créatures" roles={["admin", "mj"]}>
    <div className="w-full px-4 pt-4 sm:px-6">
      <div className="shrink-0">
        <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-primary/75">Index</p>
        <h1 className="font-display text-2xl font-semibold sm:text-3xl">Sorts des créatures</h1>
      </div>
      <Suspense fallback={<DeferredContentLoading label="Chargement des sorts des créatures…" />}><CreatureSpellIndexData showErrorDetail={account.role === "admin"} /></Suspense>
    </div>
  </AuthenticatedShell>
}
