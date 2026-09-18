import { notFound, redirect } from "next/navigation"
import { CalendarDays } from "lucide-react"

import { AuthenticatedShell } from "@/components/eraser/authenticated-shell"
import { getCampaignDashboard } from "@/lib/google-sheets"
import { authorizedAccount } from "@/lib/server-auth"

export const dynamic = "force-dynamic"

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
        <div className="mt-7 grid min-h-52 place-items-center rounded-2xl border border-dashed bg-card/35 p-8 text-center">
          <div>
            <CalendarDays className="mx-auto size-9 text-primary/45" />
            <p className="font-display mt-3 text-xl font-semibold">Aucun événement</p>
          </div>
        </div>
      </div>
    </AuthenticatedShell>
  )
}
