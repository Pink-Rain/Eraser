import { redirect } from "next/navigation"

import { AuthenticatedShell } from "@/components/eraser/authenticated-shell"
import { TabletopDisabled } from "@/components/eraser/tabletop-disabled"
import { TabletopWorkspaceLazy as TabletopWorkspace } from "@/components/eraser/tabletop-workspace-lazy"
import { authorizedAccount } from "@/lib/server-auth"
import { canManageTabletop } from "@/lib/tabletop-access"
import { TABLETOP_ENABLED } from "@/lib/tabletop-status"

export const dynamic = "force-dynamic"

export default async function SandboxTabletopPage({
  searchParams,
}: {
  searchParams: Promise<{ map?: string; room?: string }>
}) {
  const account = await authorizedAccount(["admin", "mj", "joueur"])
  if (!account) redirect("/connexion")
  if (!TABLETOP_ENABLED) {
    return (
      <AuthenticatedShell pageLabel="Tabletop">
        <TabletopDisabled />
      </AuthenticatedShell>
    )
  }

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
