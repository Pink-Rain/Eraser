import { Suspense } from "react"
import { notFound, redirect } from "next/navigation"

import { AuthenticatedShell } from "@/components/eraser/authenticated-shell"
import { DeferredContentLoading } from "@/components/eraser/deferred-content-loading"
import { SessionCreator } from "@/components/eraser/session-creator"
import { listCampaignSessions } from "@/lib/campaign-sessions"
import { getCampaignDashboard, listCampaignMembers, listNpcs, listSavedShops } from "@/lib/google-sheets"
import { loadShopGeneratorItems } from "@/lib/shop-schema"
import { authorizedAccount } from "@/lib/server-auth"

export const dynamic = "force-dynamic"

async function SessionCreatorData({ campaignId, sessionId }: { campaignId: string; sessionId: string }) {
  const [sessions, members, shops, npcs, generatorItems] = await Promise.all([
    listCampaignSessions(campaignId),
    listCampaignMembers(campaignId),
    listSavedShops(campaignId),
    listNpcs(campaignId),
    loadShopGeneratorItems().catch(() => []),
  ])
  const selected = sessions.some((session) => session.id === sessionId) ? sessionId : sessions.at(-1)?.id || ""
  return <SessionCreator
    campaignId={campaignId}
    initialSessions={sessions}
    initialSessionId={selected}
    members={members.map((member) => ({ id: member.id, name: member.name, people: member.people, classes: member.classes, level: member.level, honoraryTitle: member.honoraryTitle }))}
    npcs={npcs}
    shops={shops}
    generatorItems={generatorItems}
  />
}

export default async function CampaignLocationsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ session?: string }> }) {
  const account = await authorizedAccount(["admin", "mj"])
  if (!account) redirect("/connexion")

  const [{ id }, query] = await Promise.all([params, searchParams])
  const campaign = await getCampaignDashboard(account.role === "admin" ? null : account.uid, id).catch(() => null)
  if (!campaign) notFound()

  return (
    <AuthenticatedShell pageLabel={`${campaign.name} / Créateur de session`}>
      <div className="w-full flex-1 px-5 py-9 sm:px-8 md:py-14">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-primary/75">{campaign.name}</p>
        <h1 className="mt-3 font-display text-4xl font-semibold sm:text-5xl">Créateur de session</h1>
        <Suspense fallback={<DeferredContentLoading label="Chargement du créateur de session…" />}>
          <SessionCreatorData campaignId={campaign.id} sessionId={query.session || ""} />
        </Suspense>
      </div>
    </AuthenticatedShell>
  )
}
