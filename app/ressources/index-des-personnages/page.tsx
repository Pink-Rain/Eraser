import { redirect } from "next/navigation"

import { AuthenticatedShell } from "@/components/eraser/authenticated-shell"
import { WorldIndexPage } from "@/components/eraser/world-index-page"
import { authorizedAccount } from "@/lib/server-auth"

export const dynamic = "force-dynamic"

/** Personnages : la feuille lue par le reste d'Eraser, sur le moteur des index (propriétaire, liens, corbeille). */
export default async function Page() {
  const account = await authorizedAccount(["admin", "mj"])
  if (!account) redirect("/")
  return (
    <AuthenticatedShell pageLabel="Personnages" roles={["admin", "mj"]}>
      <WorldIndexPage indexKey="characters" />
    </AuthenticatedShell>
  )
}
