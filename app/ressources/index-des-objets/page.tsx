import { Suspense } from "react"
import { redirect } from "next/navigation"

import { AuthenticatedShell } from "@/components/eraser/authenticated-shell"
import { DeferredContentLoading } from "@/components/eraser/deferred-content-loading"
import { ObjectIndexManager } from "@/components/eraser/object-index-manager"
import { listObjectIndexTables } from "@/lib/google-sheets"
import { authorizedAccount } from "@/lib/server-auth"

export const dynamic = "force-dynamic"

async function ObjectIndexesData() {
  let initialTables: Awaited<ReturnType<typeof listObjectIndexTables>> = []
  let initialError = ""
  try {
    initialTables = await listObjectIndexTables()
  } catch (error) {
    initialError = error instanceof Error && error.message === "OBJECT_INDEX_FOLDER_NOT_FOUND"
      ? "Le dossier « Objets » est introuvable dans le Drive connecté."
      : "Les tableaux du dossier « Objets » n’ont pas pu être chargés."
  }
  return <ObjectIndexManager initialTables={initialTables} initialError={initialError} />
}

export default async function ObjectIndexesPage() {
  const account = await authorizedAccount(["admin", "mj"])
  if (!account) redirect("/")
  return (
    <AuthenticatedShell pageLabel="Objets" roles={["admin", "mj"]}>
      {/* La page défile normalement ; le tableau se fige sous l’en-tête dès que le
          titre et la recherche sont passés, et occupe alors tout l’écran. */}
      <div className="w-full px-4 pt-4 sm:px-6">
        <div className="shrink-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-primary/75">Index</p>
          <h1 className="font-display text-2xl font-semibold sm:text-3xl">Objets</h1>
        </div>
        <Suspense fallback={<DeferredContentLoading label="Chargement des index d’objets…" />}>
          <ObjectIndexesData />
        </Suspense>
      </div>
    </AuthenticatedShell>
  )
}
