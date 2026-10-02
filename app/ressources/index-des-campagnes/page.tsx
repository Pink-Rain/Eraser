import { Map } from "lucide-react"
import { Suspense } from "react"
import { redirect } from "next/navigation"

import { AuthenticatedShell } from "@/components/eraser/authenticated-shell"
import { DeferredContentLoading } from "@/components/eraser/deferred-content-loading"
import { EntityIndex } from "@/components/eraser/entity-index"
import { listAllCampaignsForAdmin } from "@/lib/google-sheets"
import { authorizedAccount, currentAuthToken } from "@/lib/server-auth"
import { listAccounts } from "@/lib/site-auth"

export const dynamic = "force-dynamic"

// La page s'affiche aussitôt ; la liste (et les comptes, pour un administrateur) arrive ensuite.
async function CampaignIndexData({ isAdmin, accountUid }: { isAdmin: boolean; accountUid: string }) {
  const token = await currentAuthToken()
  const [campaigns, accounts] = await Promise.all([listAllCampaignsForAdmin(token), isAdmin ? listAccounts(token) : Promise.resolve([])])
  return (
    <EntityIndex
      kind="campaign"
      nameLabel="Campagne"
      linksLabel="Personnages"
      empty="Aucune campagne."
      isAdmin={isAdmin}
      accounts={accounts}
      rows={campaigns.map((campaign) => ({
        id: campaign.id,
        name: campaign.name,
        href: `/campagne/${encodeURIComponent(campaign.id)}`,
        color: campaign.accentColor,
        ownerUid: campaign.mjUid,
        ownerName: campaign.ownerName,
        ownerDetail: campaign.ownerEmail || campaign.mjUid || "Aucun compte",
        canTrash: isAdmin || campaign.mjUid === accountUid,
        links: campaign.characters.map((character) => ({ label: character.name, href: `/personnage/${encodeURIComponent(character.id)}`, title: "Ouvrir la fiche" })),
      }))}
    />
  )
}

export default async function CampaignIndexPage() {
  const account = await authorizedAccount(["admin", "mj"])
  if (!account) redirect("/")
  // Seul un administrateur réattribue un propriétaire ; un MJ consulte.
  const isAdmin = account.role === "admin"
  return (
    <AuthenticatedShell pageLabel="Campagnes" roles={["admin", "mj"]}>
      <div className="w-full flex-1 px-5 py-9 sm:px-8 md:py-14">
        <div className="flex items-center gap-4"><div className="flex size-12 items-center justify-center rounded-2xl border bg-card text-primary"><Map /></div><div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary/75">Index</p><h1 className="font-display text-4xl font-semibold sm:text-5xl">Campagnes</h1></div></div>
        <Suspense fallback={<DeferredContentLoading label="Chargement des campagnes…" />}>
          <CampaignIndexData isAdmin={isAdmin} accountUid={account.uid} />
        </Suspense>
      </div>
    </AuthenticatedShell>
  )
}
