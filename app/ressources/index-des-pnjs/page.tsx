import { Suspense } from "react"
import { redirect } from "next/navigation"

import { AuthenticatedShell } from "@/components/eraser/authenticated-shell"
import { DeferredContentLoading } from "@/components/eraser/deferred-content-loading"
import { NpcIndex } from "@/components/eraser/npc-index"
import { listAllCampaignsForAdmin, listCampaignsForMj, listNpcs } from "@/lib/google-sheets"
import { npcIndexPage } from "@/lib/npc-pages"
import type { CampaignNpcRecord } from "@/lib/shop-schema"
import { authorizedAccount } from "@/lib/server-auth"

export const dynamic = "force-dynamic"

async function NpcIndexData({ accountUid, isAdmin }: { accountUid: string; isAdmin: boolean }) {
  let npcs: CampaignNpcRecord[] = []
  let campaigns: Array<{ id: string; name: string }> = []
  try {
    ;[npcs, campaigns] = await Promise.all([
      listNpcs(npcIndexPage),
      isAdmin ? listAllCampaignsForAdmin() : listCampaignsForMj(accountUid),
    ])
  } catch (reason) {
    console.error("NPC_INDEX_LOAD_FAILED", reason instanceof Error ? reason.message : "UNKNOWN_ERROR")
    return <p className="mt-6 rounded-xl border border-destructive/25 bg-destructive/5 px-4 py-2.5 text-sm text-destructive">La feuille « PNJs » n’a pas pu être chargée depuis Google Drive.</p>
  }
  const sourcePages = [{ id: "bac-a-sable", name: "Bac à sable" }, ...campaigns.map((campaign) => ({ id: campaign.id, name: campaign.name }))]
  return <NpcIndex initialNpcs={npcs} sourcePages={sourcePages} />
}

export default async function NpcIndexPage() {
  const account = await authorizedAccount(["admin", "mj"])
  if (!account) redirect("/")
  return (
    <AuthenticatedShell pageLabel="Index des PNJ" roles={["admin", "mj"]}>
      <div className="w-full px-4 pt-4 sm:px-6">
        <div className="shrink-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-primary/75">Ressources</p>
          <h1 className="font-display text-2xl font-semibold sm:text-3xl">Index des PNJ</h1>
        </div>
        <Suspense fallback={<DeferredContentLoading label="Chargement des PNJ…" />}>
          <NpcIndexData accountUid={account.uid} isAdmin={account.role === "admin"} />
        </Suspense>
      </div>
    </AuthenticatedShell>
  )
}
