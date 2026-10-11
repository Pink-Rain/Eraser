import { notFound, redirect } from "next/navigation"

import { AuthenticatedShell } from "@/components/eraser/authenticated-shell"
import { CampaignJournal } from "@/components/eraser/campaign-journal"
import { listCampaignSessionsForDisplay } from "@/lib/campaign-sessions"
import { getCampaignDashboard, getCampaignForPlayer } from "@/lib/google-sheets"
import { authorizedAccount } from "@/lib/server-auth"

export const dynamic = "force-dynamic"

/** Le journal d'une campagne : ses sessions, une page chacune (joueurs et MJ). */
export default async function CampaignJournalPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ session?: string }> }) {
  const account = await authorizedAccount(["admin", "mj", "joueur"])
  if (!account) redirect("/connexion")
  const [{ id }, query] = await Promise.all([params, searchParams])
  let campaign = await (account.role === "joueur"
    ? getCampaignForPlayer(account.uid, id)
    : getCampaignDashboard(account.role === "admin" ? null : account.uid, id)).catch(() => null)
  // Un MJ qui ne mène pas cette campagne la lit comme un joueur.
  if (!campaign && account.role === "mj") campaign = await getCampaignDashboard(null, id).catch(() => null)
  if (!campaign) notFound()
  const sessions = await listCampaignSessionsForDisplay(id).catch((error) => {
    console.error("JOURNAL_SESSIONS_LOAD_FAILED", error instanceof Error ? error.message : "UNKNOWN_ERROR")
    return null
  })
  return (
    <AuthenticatedShell pageLabel={`Journal de ${campaign.name}`}>
      {sessions === null
        ? <p className="m-8 rounded-xl border border-destructive/25 bg-destructive/5 px-4 py-3 text-sm text-destructive">Les sessions n’ont pas pu être lues dans Google Sheets. Actualise dans un instant.</p>
        : <CampaignJournal
            key={id}
            campaignName={campaign.name}
            accentColor={campaign.accentColor || "#927640"}
            sessions={sessions.map((session) => ({ id: session.id, name: session.name, createdAt: session.createdAt }))}
            initialSessionId={query.session}
          />}
    </AuthenticatedShell>
  )
}
