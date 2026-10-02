import { CircleUserRound } from "lucide-react"
import { Suspense } from "react"
import { redirect } from "next/navigation"

import { AuthenticatedShell } from "@/components/eraser/authenticated-shell"
import { DeferredContentLoading } from "@/components/eraser/deferred-content-loading"
import { EntityIndex } from "@/components/eraser/entity-index"
import { listAllCharactersForAdmin } from "@/lib/google-sheets"
import { authorizedAccount, currentAuthToken } from "@/lib/server-auth"
import { listAccounts } from "@/lib/site-auth"

export const dynamic = "force-dynamic"

// La page s'affiche aussitôt ; la liste (et les comptes, pour un administrateur) arrive ensuite.
async function CharacterIndexData({ isAdmin, accountUid }: { isAdmin: boolean; accountUid: string }) {
  const token = await currentAuthToken()
  const [characters, accounts] = await Promise.all([listAllCharactersForAdmin(token), isAdmin ? listAccounts(token) : Promise.resolve([])])
  return (
    <EntityIndex
      kind="character"
      nameLabel="Personnage"
      linksLabel="Campagne(s)"
      detailLabel="Classe"
      empty="Aucun personnage."
      isAdmin={isAdmin}
      accounts={accounts}
      rows={characters.map((character) => ({
        id: character.id,
        name: character.name,
        href: `/personnage/${encodeURIComponent(character.id)}`,
        ownerUid: character.ownerUid,
        ownerName: character.ownerName,
        ownerDetail: character.ownerEmail || character.ownerUid || "Aucun compte",
        detail: character.classes ? `${character.classes}${character.level ? ` · Rang ${character.level}` : ""}` : "À choisir",
        canTrash: isAdmin || character.ownerUid === accountUid,
        links: character.campaigns.map((campaign) => ({ label: campaign.name, href: `/campagne/${encodeURIComponent(campaign.id)}`, color: campaign.accentColor, title: "Ouvrir la campagne" })),
      }))}
    />
  )
}

export default async function CharacterIndexPage() {
  const account = await authorizedAccount(["admin", "mj"])
  if (!account) redirect("/")
  // Seul un administrateur réattribue un propriétaire ; un MJ consulte.
  const isAdmin = account.role === "admin"
  return (
    <AuthenticatedShell pageLabel="Personnages" roles={["admin", "mj"]}>
      <div className="w-full flex-1 px-5 py-9 sm:px-8 md:py-14">
        <div className="flex items-center gap-4"><div className="flex size-12 items-center justify-center rounded-2xl border bg-card text-primary"><CircleUserRound /></div><div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary/75">Index</p><h1 className="font-display text-4xl font-semibold sm:text-5xl">Personnages</h1></div></div>
        <Suspense fallback={<DeferredContentLoading label="Chargement des personnages…" />}>
          <CharacterIndexData isAdmin={isAdmin} accountUid={account.uid} />
        </Suspense>
      </div>
    </AuthenticatedShell>
  )
}
