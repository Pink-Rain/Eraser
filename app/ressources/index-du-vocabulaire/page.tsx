import Link from "next/link"
import { redirect } from "next/navigation"

import { AuthenticatedShell } from "@/components/eraser/authenticated-shell"
import { WorldIndexPage } from "@/components/eraser/world-index-page"
import { authorizedAccount } from "@/lib/server-auth"

export const dynamic = "force-dynamic"

/** Le vocabulaire sur le moteur des index : les mêmes lignes que la page Vocabulaire (Règles). */
export default async function Page() {
  const account = await authorizedAccount(["admin", "mj"])
  if (!account) redirect("/")
  return (
    <AuthenticatedShell pageLabel="Vocabulaire" roles={["admin", "mj"]}>
      <WorldIndexPage indexKey="vocabulary" aside={<Link href="/regles/vocabulaire" className="text-primary underline-offset-4 hover:underline">Voir la page Vocabulaire (Règles)</Link>} />
    </AuthenticatedShell>
  )
}
