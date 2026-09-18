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
    <AuthenticatedShell pageLabel="Index des objets" roles={["admin", "mj"]}>
      <div className="w-full flex-1 px-5 py-9 sm:px-8 md:py-14">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-primary/75">Ressources</p>
        <h1 className="font-display mt-3 text-4xl font-semibold sm:text-5xl">Index des objets</h1>
        <p className="mt-3 max-w-3xl leading-7 text-muted-foreground">Tous les tableaux Google Sheets du dossier Drive « Objets », modifiables directement depuis Eraser.</p>
        <Suspense fallback={<DeferredContentLoading label="Chargement des index d’objets…" />}>
          <ObjectIndexesData />
        </Suspense>
      </div>
    </AuthenticatedShell>
  )
}
