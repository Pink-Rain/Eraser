import { Suspense } from "react"
import { redirect } from "next/navigation"

import { AuthenticatedShell } from "@/components/eraser/authenticated-shell"
import { DeferredPageLoading } from "@/components/eraser/deferred-content-loading"
import { ExtensionsAdmin } from "@/components/eraser/extensions-admin"
import { extensionsOverview } from "@/lib/extensions-sync"
import { authorizedAccount } from "@/lib/server-auth"

export const dynamic = "force-dynamic"

// La page s'affiche aussitôt ; les versions publiées (GitHub) arrivent ensuite.
async function ExtensionsData() {
  return <ExtensionsAdmin initial={await extensionsOverview()} />
}

export default async function ExtensionsPage() {
  if (!await authorizedAccount(["admin"])) redirect("/")
  return <AuthenticatedShell pageLabel="Extensions" roles={["admin"]}>
    <Suspense fallback={<DeferredPageLoading label="Chargement des extensions…" />}><ExtensionsData /></Suspense>
  </AuthenticatedShell>
}
