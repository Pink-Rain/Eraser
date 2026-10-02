import { Suspense } from "react"
import { notFound, redirect } from "next/navigation"

import { AuthenticatedShell } from "@/components/eraser/authenticated-shell"
import { DeferredPageLoading } from "@/components/eraser/deferred-content-loading"
import { ProfileView } from "@/components/eraser/profile-view"
import { listCampaignsForMj, listCharactersForUser } from "@/lib/google-sheets"
import { authorizedAccount, currentAuthToken } from "@/lib/server-auth"
import { listAccounts } from "@/lib/site-auth"

export const dynamic = "force-dynamic"

async function ProfileData({ uid }: { uid: string }) {
  const accounts = await listAccounts(await currentAuthToken().catch(() => undefined)).catch(() => [])
  const target = accounts.find((candidate) => candidate.uid === uid)
  if (!target || !target.role) notFound()
  const [characters, campaigns] = await Promise.all([
    listCharactersForUser(uid).catch(() => []),
    target.role === "joueur" ? Promise.resolve([]) : listCampaignsForMj(uid).catch(() => []),
  ])
  return <ProfileView account={{ uid, email: target.email, displayName: target.displayName, role: target.role }} characters={characters} campaigns={campaigns} self={false} />
}

/** Le profil d'un autre compte : pour les MJ et les administrateurs, qui y attribuent des succès. */
export default async function AccountProfilePage({ params }: { params: Promise<{ uid: string }> }) {
  const account = await authorizedAccount(["admin", "mj", "joueur"])
  if (!account) redirect("/connexion")
  const uid = decodeURIComponent((await params).uid)
  if (uid === account.uid) redirect("/profil")
  if (account.accountRole !== "admin" && account.accountRole !== "mj") redirect("/profil")
  return (
    <AuthenticatedShell pageLabel="Profil">
      <Suspense key={uid} fallback={<DeferredPageLoading label="Chargement du profil…" />}>
        <ProfileData uid={uid} />
      </Suspense>
    </AuthenticatedShell>
  )
}
