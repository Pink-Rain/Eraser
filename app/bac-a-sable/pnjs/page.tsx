import { Suspense } from "react"
import { redirect } from "next/navigation"

import { AuthenticatedShell } from "@/components/eraser/authenticated-shell"
import { DeferredContentLoading } from "@/components/eraser/deferred-content-loading"
import { NpcManager } from "@/components/eraser/npc-manager"
import { listAllCampaignsForAdmin, listCampaignsForMj, listNpcs } from "@/lib/google-sheets"
import { npcIndexTabs } from "@/lib/npc-pages"
import { authorizedAccount } from "@/lib/server-auth"

export const dynamic = "force-dynamic"

async function SandboxNpcsData({ accountUid, isAdmin }: { accountUid: string; isAdmin: boolean }) {
  const [npcs, campaigns] = await Promise.all([
    listNpcs("bac-a-sable"),
    isAdmin ? listAllCampaignsForAdmin() : listCampaignsForMj(accountUid),
  ])
  return <NpcManager initialNpcs={npcs} pageLinked="bac-a-sable" sourcePages={[...npcIndexTabs.map((tab) => ({ id: tab.id, name: `PNJs · ${tab.label}` })), ...campaigns.map((campaign) => ({ id: campaign.id, name: campaign.name }))]} />
}

export default async function SandboxNpcsPage() {
  const account = await authorizedAccount(["admin", "mj"])
  if (!account) redirect("/")
  return (
    <AuthenticatedShell pageLabel="PNJs du bac à sable" roles={["admin", "mj"]}>
      <div className="w-full flex-1 px-5 py-9 sm:px-8 md:py-14">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-primary/75">Bac à sable</p>
        <h1 className="mt-3 font-display text-4xl font-semibold sm:text-5xl">Créateur de PNJs</h1>
        <Suspense fallback={<DeferredContentLoading label="Chargement des PNJs…" />}>
          <SandboxNpcsData accountUid={account.uid} isAdmin={account.role === "admin"} />
        </Suspense>
      </div>
    </AuthenticatedShell>
  )
}
