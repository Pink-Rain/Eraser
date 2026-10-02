import { Suspense } from "react"
import { redirect } from "next/navigation"

import { AuthenticatedShell } from "@/components/eraser/authenticated-shell"
import { DeferredPageLoading } from "@/components/eraser/deferred-content-loading"
import { TrashManager } from "@/components/eraser/trash-manager"
import { listTrash } from "@/lib/google-sheets"
import { listTrashedCustomIndexes } from "@/lib/custom-indexes"
import { listObjectIndexTrash } from "@/lib/object-schema"
import { listWorldIndexTrash } from "@/lib/world-indexes"
import { authorizedAccount } from "@/lib/server-auth"

export const dynamic = "force-dynamic"

// La page s'affiche aussitôt ; le contenu de la corbeille arrive ensuite.
async function TrashData() {
  const [trash, worldItems, objectItems, customIndexes] = await Promise.all([
    listTrash(),
    listWorldIndexTrash().catch(() => []),
    listObjectIndexTrash().catch(() => []),
    listTrashedCustomIndexes().catch(() => []),
  ])
  const indexes = customIndexes.map((entry) => ({ family: "world" as const, key: entry.key, title: entry.title, tab: "", column: "", deletedAt: entry.deletedAt }))
  return <TrashManager initial={trash} indexItems={[...indexes, ...worldItems, ...objectItems]} />
}

export default async function TrashPage() {
  const admin = await authorizedAccount(["admin"])
  if (!admin) redirect("/")
  return <AuthenticatedShell pageLabel="Corbeille" roles={["admin"]}>
    <Suspense fallback={<DeferredPageLoading label="Chargement de la corbeille…" />}><TrashData /></Suspense>
  </AuthenticatedShell>
}
