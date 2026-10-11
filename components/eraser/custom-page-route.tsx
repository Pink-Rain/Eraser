import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { ExternalLink, PenLine, Replace } from "lucide-react"

import { AuthenticatedShell } from "@/components/eraser/authenticated-shell"
import { PageLabel } from "@/components/eraser/app-shell"
import { CustomPageView } from "@/components/eraser/custom-page-view"
import { Button } from "@/components/ui/button"
import { canManagePages, pageForViewer, type CustomPage, type PagePlace, type PageView } from "@/lib/custom-pages"
import { findCustomPage } from "@/lib/custom-pages-store"
import { campaignsOf, indexPathsOf, linkTargetsOf, viewerFor } from "@/lib/custom-pages-server"
import { replacementLabel, type ReplaceMode } from "@/lib/page-replacements"
import { currentAccount, currentViewAccount, type AuthorizedUser } from "@/lib/server-auth"

/**
 * Une page du créateur de pages, à son adresse (/regles/…, /campagne/…/pages/…, /pages/…).
 * Absente, à la corbeille, ou fermée au lecteur : « page introuvable », sans rien dire de
 * plus (un joueur n'apprend pas qu'une page réservée existe).
 */
export async function CustomPageRoute({ place, slug, campaignId = "" }: { place: PagePlace; slug: string; campaignId?: string }) {
  const [account, viewAccount] = await Promise.all([currentAccount(), currentViewAccount()])
  if (!account) redirect("/connexion")
  if (!viewAccount) redirect("/")
  const page = await findCustomPage(place, decodeURIComponent(slug), campaignId ? decodeURIComponent(campaignId) : "").catch(() => null)
  if (!page) notFound()
  const view = pageForViewer(page, await viewerFor(viewAccount, page))
  if (!view) notFound()
  const campaignName = page.place === "campagne" ? (await campaignsOf(viewAccount).catch(() => [])).find((campaign) => campaign.id === page.campaignId)?.name : undefined
  return (
    <AuthenticatedShell pageLabel={view.title}>
      <CustomPageView key={view.id} initial={view} links={await linkTargetsOf(view, viewAccount)} campaignName={campaignName} indexPaths={indexPathsOf(view, viewAccount.role)} />
    </AuthenticatedShell>
  )
}

/**
 * Une page d'Eraser remplacée ou complétée par une page du créateur de pages (layout racine) :
 * `replace` montre la page créée à la place, `before` / `after` ajoutent ses blocs au-dessus ou
 * en dessous du contenu d'origine. Admins et MJ gardent « Voir la page d'origine ».
 */
export async function ReplacementView({ page, view, mode, pathname, account, children }: { page: CustomPage; view: PageView; mode: ReplaceMode; pathname: string; account: AuthorizedUser; children: React.ReactNode }) {
  const manager = canManagePages(account.role)
  const links = await linkTargetsOf(view, account)
  const indexPaths = indexPathsOf(view, account.role)
  const label = replacementLabel(page.replaces ?? pathname)
  const notice = manager ? <p className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl border border-dashed border-primary/35 bg-primary/[0.035] px-3.5 py-2 text-[12.5px] text-muted-foreground">
    <Replace className="size-3.5 shrink-0 text-primary" />
    <span className="min-w-0 flex-1">{mode === "replace" ? `Cette page remplace « ${label} » d’Eraser.` : `La page « ${view.title} » complète « ${label} » ${mode === "before" ? "au-dessus" : "en dessous"} de son contenu.`}</span>
    {mode === "replace" && <Link href={`${pathname}?origine=1`} prefetch={false} className="inline-flex items-center gap-1 font-medium text-primary hover:underline"><ExternalLink className="size-3.5" />Voir la page d’origine</Link>}
    {view.editable && <Link href={`/pages/atelier?id=${encodeURIComponent(page.id)}`} prefetch={false} className="inline-flex items-center gap-1 font-medium text-primary hover:underline"><PenLine className="size-3.5" />Modifier</Link>}
  </p> : null
  if (mode === "replace") return <PageLabel label={view.title}>
    <CustomPageView key={`${view.id}:${pathname}`} initial={view} links={links} indexPaths={indexPaths} eyebrow={label} notice={notice} actions={manager ? <Button asChild size="sm" variant="ghost"><Link href={`${pathname}?origine=1`} prefetch={false}><ExternalLink />Voir la page d’origine</Link></Button> : undefined} />
  </PageLabel>
  const blocks = <CustomPageView key={`${view.id}:${pathname}:${mode}`} initial={view} links={links} indexPaths={indexPaths} blocksOnly notice={notice ? <div className="mb-4 max-w-3xl">{notice}</div> : undefined} />
  return <>{mode === "before" && blocks}{children}{mode === "after" && blocks}</>
}
