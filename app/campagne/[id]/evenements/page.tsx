import { Suspense } from "react"
import { notFound, redirect } from "next/navigation"

import { AuthenticatedShell } from "@/components/eraser/authenticated-shell"
import { DeferredContentLoading } from "@/components/eraser/deferred-content-loading"
import { CampaignEventManager } from "@/components/eraser/session-events"
import { listCampaignEvents } from "@/lib/campaign-events"
import { getCampaignDashboard, listCampaignNpcs, listSavedShops } from "@/lib/google-sheets"
import { authorizedAccount } from "@/lib/server-auth"
import { loadShopGeneratorData } from "@/lib/shop-types-server"
import { loadEnvironmentRules } from "@/lib/search-places-server"

export const dynamic = "force-dynamic"

async function CampaignEventsData({ campaignId }: { campaignId: string }) {
  const [events, shops, npcs, generator] = await Promise.all([
    listCampaignEvents(campaignId).then((list) => ({ list, error: "" })).catch(() => ({ list: [], error: "Les événements n’ont pas pu être chargés depuis Google Sheets. Réessaie dans un instant." })),
    listSavedShops(campaignId),
    listCampaignNpcs(campaignId),
    loadShopGeneratorData(),
  ])
  // Chaque environnement : les index de sa colonne « Événement » (Lieux › Environnement).
  const rules = await loadEnvironmentRules(generator.indexes)
  return <CampaignEventManager campaignId={campaignId} initialEvents={events.list} loadError={events.error} shops={shops} npcs={npcs} generatorItems={generator.items ?? []} shopTypes={generator.catalog.types} environments={rules.map((rule) => ({ place: rule.place, events: rule.events }))} indexTitles={Object.fromEntries(generator.indexes.map((index) => [index.key, index.title]))} />
}

export default async function CampaignEventsPage({ params }: { params: Promise<{ id: string }> }) {
  const account = await authorizedAccount(["admin", "mj"])
  if (!account) redirect("/connexion")

  const { id } = await params
  const campaign = await getCampaignDashboard(account.role === "admin" ? null : account.uid, id).catch(() => null)
  if (!campaign) notFound()

  return (
    <AuthenticatedShell pageLabel={`${campaign.name} / Événements`}>
      <div className="w-full flex-1 px-5 py-9 sm:px-8 md:py-14">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-primary/75">{campaign.name}</p>
        <h1 className="mt-3 font-display text-4xl font-semibold sm:text-5xl">Événements</h1>
        <Suspense key={id} fallback={<DeferredContentLoading label="Chargement des événements…" />}>
          <CampaignEventsData campaignId={campaign.id} />
        </Suspense>
      </div>
    </AuthenticatedShell>
  )
}
