import { redirect } from "next/navigation"

import { AuthenticatedShell } from "@/components/eraser/authenticated-shell"
import { TabletopWorkspace } from "@/components/eraser/tabletop-workspace-v2"
import { authorizedAccount } from "@/lib/server-auth"
import { canManageTabletop } from "@/lib/tabletop-access"

export const dynamic = "force-dynamic"

export default async function SandboxTabletopPage({
  searchParams,
}: {
  searchParams: Promise<{ map?: string; room?: string }>
}) {
  const account = await authorizedAccount(["admin", "mj", "joueur"])
  if (!account) redirect("/connexion")

  const query = await searchParams
  const canManage = canManageTabletop(account)
  return (
    <AuthenticatedShell pageLabel="Tabletop">
      <TabletopWorkspace
        canManage={canManage}
        pageLinked="bac-a-sable"
        pageName="Bac à sable"
        roomKey={query.room || ""}
        requestedMapId={query.map || ""}
        user={{ uid: account.uid, role: account.role }}
      />
    </AuthenticatedShell>
  )
}
