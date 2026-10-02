import { Suspense } from "react"
import { notFound, redirect } from "next/navigation"

import { AuthenticatedShell } from "@/components/eraser/authenticated-shell"
import { DeferredPageLoading } from "@/components/eraser/deferred-content-loading"
import { ProfileView, type ProfileAccess } from "@/components/eraser/profile-view"
import type { SiteRole } from "@/lib/auth-types"
import { listDirectoryAccounts } from "@/lib/chat-accounts"
import { listCampaignsForMj, listCampaignsForPlayer, listCharactersForUser } from "@/lib/google-sheets"
import { authorizedAccount } from "@/lib/server-auth"

export const dynamic = "force-dynamic"

/**
 * Ce que la personne qui regarde peut ouvrir, selon la vue choisie (les pages des fiches
 * et des campagnes le vérifient aussi de leur côté) :
 * - vue administrateur : tout ;
 * - vue MJ : les fiches des personnages de ses campagnes, et ses campagnes ;
 * - toutes les vues : le tableau de bord des campagnes où joue l'un de ses personnages.
 */
async function ProfileData({ viewer, target }: { viewer: { uid: string; role: SiteRole }; target: { uid: string; name: string; role: SiteRole | null } }) {
  const [characters, campaigns, viewerLed, viewerPlayed] = await Promise.all([
    listCharactersForUser(target.uid).catch(() => []),
    listCampaignsForMj(target.uid).catch(() => []),
    viewer.role === "mj" ? listCampaignsForMj(viewer.uid).catch(() => []) : Promise.resolve([]),
    listCampaignsForPlayer(viewer.uid).catch(() => []),
  ])
  const led = new Set(viewerLed.map((campaign) => campaign.id))
  const played = new Set(viewerPlayed.map((campaign) => campaign.id))
  const allCampaignIds = [...new Set([...campaigns.map((campaign) => campaign.id), ...characters.flatMap((character) => character.campaigns.map((campaign) => campaign.id))])]
  const access: ProfileAccess = viewer.role === "admin"
    ? { characters: characters.map((character) => character.id), campaigns: allCampaignIds }
    : {
      characters: characters.filter((character) => character.campaigns.some((campaign) => led.has(campaign.id))).map((character) => character.id),
      campaigns: allCampaignIds.filter((id) => led.has(id) || played.has(id)),
    }
  return <ProfileView account={{ uid: target.uid, email: "", displayName: target.name, role: target.role }} characters={characters} campaigns={campaigns} access={access} />
}

export default async function OtherProfilePage({ params }: { params: Promise<{ uid: string }> }) {
  const account = await authorizedAccount(["admin", "mj", "joueur"])
  if (!account) redirect("/connexion")
  const { uid } = await params
  if (uid === account.uid) redirect("/profil")
  const target = (await listDirectoryAccounts(account).catch(() => [])).find((entry) => entry.uid === uid)
  if (!target) notFound()
  return (
    <AuthenticatedShell pageLabel={`Profil - ${target.name}`}>
      <Suspense key={uid} fallback={<DeferredPageLoading title={target.name} label="Chargement du profil…" />}>
        <ProfileData viewer={{ uid: account.uid, role: account.role }} target={target} />
      </Suspense>
    </AuthenticatedShell>
  )
}
