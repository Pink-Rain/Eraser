import { Suspense } from "react"
import { redirect } from "next/navigation"

import { AuthenticatedShell } from "@/components/eraser/authenticated-shell"
import { DeferredPageLoading } from "@/components/eraser/deferred-content-loading"
import { ProfileView } from "@/components/eraser/profile-view"
import { listCampaignsForMj, listCharactersForUser } from "@/lib/google-sheets"
import { authorizedAccount } from "@/lib/server-auth"

export const dynamic = "force-dynamic"

/** Le profil montre tout, quelle que soit la vue : personnages, campagnes menées ou jouées, succès. */
async function ProfileData({ uid, email, displayName, role }: { uid: string; email: string; displayName: string; role: "admin" | "mj" | "joueur" }) {
  const [characters, campaigns] = await Promise.all([
    listCharactersForUser(uid).catch(() => []),
    role === "joueur" ? Promise.resolve([]) : listCampaignsForMj(uid).catch(() => []),
  ])
  return <ProfileView account={{ uid, email, displayName, role }} characters={characters} campaigns={campaigns} self />
}

export default async function ProfilePage() {
  const account = await authorizedAccount(["admin", "mj", "joueur"])
  if (!account) redirect("/connexion")
  return (
    <AuthenticatedShell pageLabel="Mon profil">
      <Suspense fallback={<DeferredPageLoading label="Chargement du profil…" />}>
        <ProfileData uid={account.uid} email={account.email} displayName={account.displayName} role={account.accountRole} />
      </Suspense>
    </AuthenticatedShell>
  )
}
