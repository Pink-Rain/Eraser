import { notFound, redirect } from "next/navigation"

import { AuthenticatedShell } from "@/components/eraser/authenticated-shell"
import { PageStudio } from "@/components/eraser/page-studio"
import { canEditPage, pageSummary, studioPage, type PageViewer } from "@/lib/custom-pages"
import { listCustomPages, pagesLinkingTo, readCustomPage } from "@/lib/custom-pages-store"
import { campaignsOf, pageAuthor, viewerFor } from "@/lib/custom-pages-server"
import { folderKeyOf } from "@/lib/page-folders"
import { knownPageFolders } from "@/lib/page-folders-store"
import { authorizedAccount } from "@/lib/server-auth"

export const dynamic = "force-dynamic"

/**
 * L'atelier du créateur de pages (admins et MJ), sur la page `id`. L'identifiant est dans le
 * chemin, pas dans « ?id= » : le routeur rend chaque page une première fois « à blanc »
 * (sans paramètres de requête) pour y détecter une redirection, et l'atelier renvoyait alors
 * toujours vers l'Index des pages.
 */
export default async function PageStudioPage({ params }: { params: Promise<{ id: string }> }) {
  const account = await authorizedAccount(["admin"])
  if (!account) redirect("/")
  const { id: rawId } = await params
  const id = decodeURIComponent(rawId)
  const page = await readCustomPage(id, { fresh: true }).catch(() => null)
  if (!page || page.trashedAt) notFound()
  const viewer = await viewerFor(account, page)
  if (!canEditPage(page, viewer)) notFound()
  const [pages, campaigns, linking] = await Promise.all([listCustomPages().catch(() => []), campaignsOf(account), pagesLinkingTo(page.id).catch(() => [])])
  const base: PageViewer = { role: account.role, uid: account.uid, name: pageAuthor(account).name }
  const admin = account.role === "admin"
  const byId = new Map(campaigns.map((campaign) => [campaign.id, campaign]))
  // Les pages vers lesquelles un bloc Lien peut mener : celles que le compte peut lire.
  const summaries = pages.filter((other) => !other.trashedAt).flatMap((other) => {
    const campaign = other.place === "campagne" ? byId.get(other.campaignId) : undefined
    const otherViewer: PageViewer = { ...base, member: admin || Boolean(campaign), manager: admin || Boolean(campaign?.mine) }
    if (!admin && (other.vis === "admin" || other.place === "administration" || (other.place === "campagne" && !campaign))) return []
    return [pageSummary(other, otherViewer)]
  }).sort((left, right) => left.title.localeCompare(right.title, "fr"))
  // Le retour ramène au dossier de la page (copie en mémoire du rangement : rien n'est attendu).
  const folder = knownPageFolders().placement[folderKeyOf(page)]
  return (
    <AuthenticatedShell pageLabel={`Atelier · ${page.title}`} roles={["admin"]}>
      <PageStudio
        key={page.id}
        initial={studioPage(page)}
        pages={summaries}
        campaigns={campaigns.filter((campaign) => admin || campaign.mine).map((campaign) => ({ id: campaign.id, name: campaign.name }))}
        linking={linking}
        role={account.role}
        backHref={folder ? `/pages?dossier=${encodeURIComponent(folder)}` : "/pages"}
      />
    </AuthenticatedShell>
  )
}
