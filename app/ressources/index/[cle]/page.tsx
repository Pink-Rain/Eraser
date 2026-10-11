import { notFound, redirect } from "next/navigation"

import { AuthenticatedShell } from "@/components/eraser/authenticated-shell"
import { WorldIndexPage } from "@/components/eraser/world-index-page"
import { customIndexEntry, isCustomIndexKey } from "@/lib/custom-indexes"
import { authorizedAccount } from "@/lib/server-auth"

export const dynamic = "force-dynamic"

/** Un index créé depuis « Nouvel index » : la même page que les index prévus par Eraser. */
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
      <WorldIndexPage indexKey={entry.key} head={{ title: entry.title, sheetName: entry.sheetName, description: entry.description }} />
    </AuthenticatedShell>
  )
}
