import { Suspense } from "react"
import { notFound, redirect } from "next/navigation"

import { AuthenticatedShell } from "@/components/eraser/authenticated-shell"
import { DeferredContentLoading } from "@/components/eraser/deferred-content-loading"
import { BackToShopGenerator, SavedShopCollection } from "@/components/eraser/shop-generator"
import { getCampaignDashboard, getCampaignForPlayer, listCampaignMembers, listCampaignNpcs, listCharactersForUser, listSavedShops } from "@/lib/google-sheets"
import { sessionShopIds } from "@/lib/shop-access"
import { shopForPlayers } from "@/lib/shop-purchase"
import { authorizedAccount } from "@/lib/server-auth"
import { listCampaignSessionsForDisplay } from "@/lib/campaign-sessions"
import { revealedSession } from "@/lib/session-reveal"
import { loadShopGeneratorData, loadShopTypeCatalog } from "@/lib/shop-types-server"

export const dynamic = "force-dynamic"

async function SavedCampaignShopsData({ campaignId, shopId, canManage, accountUid }: { campaignId: string; shopId: string; canManage: boolean; accountUid: string }) {
  const [allShops, npcs, generator, revealed, members, mine] = await Promise.all([
    listSavedShops(campaignId),
    listCampaignNpcs(campaignId),
    // Un joueur ne relance rien : les types suffisent (noms et icônes).
    canManage ? loadShopGeneratorData() : loadShopTypeCatalog().then((catalog) => ({ catalog, items: [] })),
    // Un joueur (lien « Ouvrir le magasin » du journal) ne voit que les magasins entrés dans une
    // session et révélés par le MJ, comme dans le journal : la préparation du MJ reste à lui.
    canManage ? null : listCampaignSessionsForDisplay(campaignId).then((sessions) => new Set(sessions.map(revealedSession).flatMap(sessionShopIds))).catch(() => new Set<string>()),
    // Pour qui acheter : le MJ, n'importe quel personnage de la campagne ; un joueur, les siens.
    listCampaignMembers(campaignId).catch(() => []),
    canManage ? Promise.resolve([]) : listCharactersForUser(accountUid).catch(() => []),
  ])
  // Un joueur ne voit pas l'effet des items, seulement leur description.
  const shops = revealed ? allShops.filter((shop) => revealed.has(shop.id)).map(shopForPlayers) : allShops
  const own = new Set(mine.map((character) => character.id))
  const buyers = members.filter((member) => canManage || own.has(member.id)).map((member) => ({ id: member.id, name: member.name }))
  const items = generator.items ?? []
  // Un joueur ne reçoit que les marchands de ses magasins, sans notes MJ ni note de fond.
  const vendors = new Set(shops.map((shop) => shop.npcId))
  const shownNpcs = canManage ? npcs : npcs.filter((npc) => vendors.has(npc.id)).map((npc) => ({ ...npc, gmNotes: "", lore: "" }))
  return <SavedShopCollection initialShops={shopId ? shops.filter((shop) => shop.id === shopId) : shops} pageLinked={campaignId} npcs={shownNpcs} generatorItems={canManage ? items : []} mode={canManage ? "saved" : "view"} types={generator.catalog.types} purchase={{ campaignId, sessionId: "", buyers }} />
}

export default async function SavedCampaignShopsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ shop?: string }> }) {
  const account = await authorizedAccount(["admin", "mj", "joueur"])
  if (!account) redirect("/connexion")

  const [{ id }, query] = await Promise.all([params, searchParams])
  const canManage = account.role === "admin" || account.role === "mj"
  const campaign = await (account.role === "joueur" ? getCampaignForPlayer(account.uid, id) : getCampaignDashboard(account.role === "admin" ? null : account.uid, id)).catch(() => null)
  if (!campaign) notFound()

  const generatorHref = `/campagne/${encodeURIComponent(campaign.id)}/magasin-et-fouille`

  return (
    <AuthenticatedShell pageLabel={`${campaign.name} / Magasins sauvegardés`}>
      <div className="w-full flex-1 px-5 py-9 sm:px-8 md:py-14">
        {canManage && <BackToShopGenerator href={generatorHref} />}
        <p className="mt-5 text-xs font-semibold uppercase tracking-[0.22em] text-primary/75">{campaign.name}</p>
        <h1 className="mt-3 font-display text-4xl font-semibold sm:text-5xl">{canManage ? "Magasins sauvegardés" : "Magasins"}</h1>
        <div className="mt-7">
          <Suspense key={id} fallback={<DeferredContentLoading className="mt-0" label="Chargement des magasins sauvegardés…" />}>
          <SavedCampaignShopsData campaignId={campaign.id} shopId={query.shop || ""} canManage={canManage} accountUid={account.uid} />
          </Suspense>
        </div>
      </div>
    </AuthenticatedShell>
  )
}
