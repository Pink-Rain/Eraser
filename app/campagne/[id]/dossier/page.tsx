import { notFound, redirect } from "next/navigation"
import { BookOpen, CalendarDays, ChartColumn, ChevronDown, Drama, LayoutDashboard, Map, PackageSearch, Store, Waypoints } from "lucide-react"

import { AuthenticatedShell } from "@/components/eraser/authenticated-shell"
import { MenuLinkPanel, MenuPage } from "@/components/eraser/menu-page"
import { Roll20BridgePanel } from "@/components/eraser/roll20-bridge-panel"
import { getCampaignDashboard } from "@/lib/google-sheets"
import { getRoll20LinkForManager } from "@/lib/roll20-bridge"
import { authorizedAccount } from "@/lib/server-auth"

export const dynamic = "force-dynamic"

/**
 * Le dossier d'une campagne (section du menu, vue MJ) : son résumé, ses statistiques et le
 * compagnon Roll20 (dépliable), avec les pages de la campagne dans un encart à côté.
 */
export default async function CampaignFolderPage({ params }: { params: Promise<{ id: string }> }) {
  const account = await authorizedAccount(["admin", "mj"])
  if (!account) redirect("/connexion")
  const { id } = await params
  const campaign = await getCampaignDashboard(account.role === "admin" ? null : account.uid, id).catch(() => null)
  if (!campaign) notFound()
  const link = await getRoll20LinkForManager(account, id).catch(() => null)
  const href = `/campagne/${encodeURIComponent(campaign.id)}`
  return (
    <AuthenticatedShell pageLabel={`Dossier · ${campaign.name}`} roles={["admin", "mj"]}>
      <MenuPage
        eyebrow="Dossier de campagne"
        title={campaign.name}
        icon={Map}
        description={campaign.description ? <p className="whitespace-pre-wrap">{campaign.description}</p> : "Le tableau de bord, la préparation des sessions et tout ce qui fait vivre cette campagne."}
        before={campaign.bannerUrl ? <div className="relative h-40 overflow-hidden rounded-[1.5rem] border sm:h-52" style={{ borderColor: `${campaign.accentColor}55` }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={campaign.bannerUrl} alt="" className="size-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/45 to-transparent" />
        </div> : undefined}
        links={[]}
      >
        {/* Comme l'accueil : le contenu à gauche, les pages de la campagne dans un encart à droite (en tête sur mobile). */}
        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,19rem)] xl:grid-cols-[minmax(0,1fr)_minmax(0,21rem)]">
          <div className="min-w-0 space-y-6">
            <section className="rounded-2xl border border-dashed bg-card/45 px-5 py-6" aria-labelledby="statistiques">
              <h2 id="statistiques" className="flex items-center gap-2 font-display text-2xl font-semibold"><ChartColumn className="size-5 text-primary" />Statistiques</h2>
              <p className="mt-2 text-sm text-muted-foreground">Les statistiques de la campagne arriveront ici.</p>
            </section>
            <details id="roll20" className="group rounded-2xl border bg-card/70 [&_summary::-webkit-details-marker]:hidden">
              <summary className="flex cursor-pointer list-none items-center gap-3 px-5 py-4">
                <span className="flex size-10 items-center justify-center rounded-xl border border-primary/20 bg-primary/8 font-display text-sm font-bold text-primary">R20</span>
                <span className="min-w-0 flex-1"><span className="block font-display text-2xl font-semibold">Compagnon Roll20</span><span className="block text-xs text-muted-foreground">{link ? "Relié à cette campagne." : "Pas encore relié."} Déplier pour le régler.</span></span>
                <ChevronDown className="size-5 text-muted-foreground transition-transform group-open:rotate-180" />
              </summary>
              <div className="border-t px-5 pb-6"><Roll20BridgePanel key={id} campaignId={id} initialLink={link} embedded /></div>
            </details>
          </div>
          <div className="-order-1 lg:order-none">
            <MenuLinkPanel title="La campagne" icon={Map} links={[
              { href, label: "Tableau de bord", description: "Les personnages, le groupe, l’inventaire et le chat de la campagne.", icon: LayoutDashboard },
              { href: `${href}/journal`, label: `Journal de ${campaign.name}`, description: "Les sessions, de la première à la dernière.", icon: BookOpen },
              { href: `${href}/lieux-et-rencontres`, label: "Créateur de session", description: "Préparer les lieux et les rencontres de la prochaine session.", icon: Waypoints },
              { href: `${href}/evenements`, label: "Événements", description: "Les événements à déclencher pendant la partie.", icon: CalendarDays },
              { href: `${href}/magasin-et-fouille`, label: "Magasins", description: "Les boutiques de la campagne et leurs stocks.", icon: Store },
              { href: `${href}/fouilles`, label: "Fouilles", description: "Ce que les joueurs trouvent en fouillant.", icon: PackageSearch },
              { href: `${href}/pnjs`, label: "PNJs", description: "Les PNJ de la campagne, leurs fiches et leurs sacs.", icon: Drama },
            ]} />
          </div>
        </div>
      </MenuPage>
    </AuthenticatedShell>
  )
}
