import { Suspense } from "react"
import { redirect } from "next/navigation"

import { AuthenticatedShell } from "@/components/eraser/authenticated-shell"
import { DeferredContentLoading } from "@/components/eraser/deferred-content-loading"
import { NpcIndex, type NpcCampaignLink, type NpcPageLink } from "@/components/eraser/npc-index"
import { listAllCampaignsForAdmin, listAllNpcs, listCampaignsForMj } from "@/lib/google-sheets"
import { identityUidsForUser } from "@/lib/identity-links"
import { foldNpcName, isNpcLibraryPage } from "@/lib/npc-pages"
import { authorizedAccount } from "@/lib/server-auth"

export const dynamic = "force-dynamic"

async function loadNpcIndex(accountUid: string, isAdmin: boolean) {
  try {
    const [npcs, allCampaigns, ownCampaigns, identities] = await Promise.all([
      listAllNpcs(),
      listAllCampaignsForAdmin(),
      isAdmin ? Promise.resolve([]) : listCampaignsForMj(accountUid),
      identityUidsForUser(accountUid),
    ])
    const campaignById = new Map(allCampaigns.map((campaign) => [campaign.id, campaign]))
    const owned = new Set([...ownCampaigns.map((campaign) => campaign.id), ...allCampaigns.filter((campaign) => identities.includes(campaign.mjUid)).map((campaign) => campaign.id)])
    const linkTo = (campaignId: string): NpcCampaignLink | null => {
      const campaign = campaignById.get(campaignId)
      return campaign ? { id: campaign.id, name: campaign.name, manage: isAdmin || owned.has(campaign.id) } : null
    }
    // Chaque campagne où figure un PNJ du même nom. Un administrateur l'ouvre en mode
    // MJ ; un MJ aussi s'il la mène, en mode joueur sinon.
    const campaignsByName: Record<string, NpcCampaignLink[]> = {}
    for (const npc of npcs) {
      if (isNpcLibraryPage(npc.pageLinked)) continue
      const link = linkTo(npc.pageLinked)
      if (!link) continue
      const list = campaignsByName[foldNpcName(npc.name)] ||= []
      if (!list.some((item) => item.id === link.id)) list.push(link)
    }
    for (const list of Object.values(campaignsByName)) list.sort((left, right) => left.name.localeCompare(right.name, "fr"))
    // Tous les PNJ : ceux de l'index, du bac à sable et de chaque campagne encore
    // ouverte. Les notes MJ, la vie actuelle et le sac à dos restent dans la campagne :
    // l'index ne les envoie même pas au navigateur.
    const visible = npcs.filter((npc) => isNpcLibraryPage(npc.pageLinked) || campaignById.has(npc.pageLinked))
    const library = visible.map((npc) => ({ ...npc, gmNotes: "", currentHp: npc.totalHp }))
    const pages: Record<string, NpcPageLink> = {}
    for (const npc of visible) {
      if (pages[npc.pageLinked]) continue
      const link = linkTo(npc.pageLinked)
      pages[npc.pageLinked] = link ? { ...link, editable: link.manage } : { id: npc.pageLinked, name: npc.pageLinked === "bac-a-sable" ? "Bac à sable" : "PNJs", manage: true, editable: true }
    }
    const sourceCampaigns = isAdmin ? allCampaigns : ownCampaigns
    const sourcePages = [{ id: "bac-a-sable", name: "Bac à sable" }, ...sourceCampaigns.map((campaign) => ({ id: campaign.id, name: campaign.name }))]
    return { library, sourcePages, campaignsByName, pages }
  } catch (reason) {
    console.error("NPC_INDEX_LOAD_FAILED", reason instanceof Error ? reason.message : "UNKNOWN_ERROR")
    return null
  }
}

async function NpcIndexData({ accountUid, isAdmin }: { accountUid: string; isAdmin: boolean }) {
  const data = await loadNpcIndex(accountUid, isAdmin)
  if (!data) return <p className="mt-6 rounded-xl border border-destructive/25 bg-destructive/5 px-4 py-2.5 text-sm text-destructive">La feuille « PNJs » n’a pas pu être chargée depuis Google Drive.</p>
  return <NpcIndex initialNpcs={data.library} sourcePages={data.sourcePages} campaignsByName={data.campaignsByName} pages={data.pages} />
}

export default async function NpcIndexPage() {
  const account = await authorizedAccount(["admin", "mj"])
  if (!account) redirect("/")
  return (
    <AuthenticatedShell pageLabel="PNJs" roles={["admin", "mj"]}>
      <div className="w-full px-4 pt-4 sm:px-6">
        <div className="shrink-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-primary/75">Index</p>
          <h1 className="font-display text-2xl font-semibold sm:text-3xl">PNJs</h1>
        </div>
        <Suspense fallback={<DeferredContentLoading label="Chargement des PNJs…" />}>
          <NpcIndexData accountUid={account.uid} isAdmin={account.role === "admin"} />
        </Suspense>
      </div>
    </AuthenticatedShell>
  )
}
