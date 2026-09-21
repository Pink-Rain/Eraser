import { Suspense } from "react"
import { redirect } from "next/navigation"

import { AuthenticatedShell } from "@/components/eraser/authenticated-shell"
import { DeferredContentLoading } from "@/components/eraser/deferred-content-loading"
import { ShopGenerator } from "@/components/eraser/shop-generator"
import { listAllCampaignsForAdmin, listCampaignsForMj, listSavedShops } from "@/lib/google-sheets"
import { loadShopGeneratorItems, type ShopGeneratorItem } from "@/lib/shop-schema"
import { authorizedAccount } from "@/lib/server-auth"

export const dynamic = "force-dynamic"

async function SandboxShopData({ accountUid, isAdmin }: { accountUid: string; isAdmin: boolean }) {
  let items: ShopGeneratorItem[] = []
  let loadError = ""
  const [loadedItems, campaigns, latestDraw] = await Promise.all([
    loadShopGeneratorItems().catch(() => null),
    isAdmin ? listAllCampaignsForAdmin() : listCampaignsForMj(accountUid),
    // Dans le bac à sable, le tirage *est* la sauvegarde : « replace » réécrit
    // les lignes de la page à chaque tirage.
    listSavedShops("bac-a-sable"),
  ])
  if (loadedItems) items = loadedItems
  else loadError = "Les index d’objets n’ont pas pu être chargés. Réessaie dans un instant."
  return <ShopGenerator items={items} loadError={loadError} pageLinked="bac-a-sable" destinationPages={campaigns.map((campaign) => ({ id: campaign.id, name: campaign.name }))} initialDraw={latestDraw} />
}

export default async function ShopPage() {
  const account = await authorizedAccount(["admin", "mj"])
  if (!account) redirect("/")
  return (
    <AuthenticatedShell pageLabel="Magasin" roles={["admin", "mj"]}>
      <div className="w-full flex-1 px-5 py-9 sm:px-8 md:py-14">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-primary/75">Bac à sable</p>
        <h1 className="mt-3 font-display text-4xl font-semibold sm:text-5xl">Générateur de magasins</h1>
        <Suspense fallback={<DeferredContentLoading label="Chargement du générateur…" />}>
          <SandboxShopData accountUid={account.uid} isAdmin={account.role === "admin"} />
        </Suspense>
      </div>
    </AuthenticatedShell>
  )
}
