import { redirect } from "next/navigation"

import { AuthenticatedShell } from "@/components/eraser/authenticated-shell"
import { WorldIndexPage } from "@/components/eraser/world-index-page"
import { OBJECTS_INDEX_KEY } from "@/lib/world-index-definitions"
import { authorizedAccount } from "@/lib/server-auth"

export const dynamic = "force-dynamic"

/** Les items : un index du moteur, la même page que tous les autres. */
export default async function ObjectIndexesPage() {
  const account = await authorizedAccount(["admin", "mj"])
  if (!account) redirect("/")
  return (
    <AuthenticatedShell pageLabel="Items" roles={["admin", "mj"]}>
      <WorldIndexPage indexKey={OBJECTS_INDEX_KEY} head={{ title: "Items", sheetName: "Index des objets" }} />
    </AuthenticatedShell>
  )
}
