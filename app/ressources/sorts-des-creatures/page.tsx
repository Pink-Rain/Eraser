import Link from "next/link"
import { redirect } from "next/navigation"

import { AuthenticatedShell } from "@/components/eraser/authenticated-shell"
import { WorldIndexPage } from "@/components/eraser/world-index-page"
import { authorizedAccount } from "@/lib/server-auth"

export const dynamic = "force-dynamic"

/** Sorts des créatures : une feuille lue par le reste d'Eraser, branchée sur le moteur des index. */
export default async function Page() {
  const account = await authorizedAccount(["admin", "mj"])
  if (!account) redirect("/")
  return (
    <AuthenticatedShell pageLabel="Sorts des créatures" roles={["admin", "mj"]}>
      <WorldIndexPage indexKey="creature-spells" aside={<Link href="/ressources/sorts-des-creatures/doublons" className="text-primary underline-offset-4 hover:underline">Doublons et fusion</Link>} />
    </AuthenticatedShell>
  )
}
