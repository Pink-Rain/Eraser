import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { ExternalLink, PenLine, Replace } from "lucide-react"

import { AuthenticatedShell } from "@/components/eraser/authenticated-shell"
import { PageLabel } from "@/components/eraser/app-shell"
import { CustomPageView } from "@/components/eraser/custom-page-view"
import { moduleSlots } from "@/components/eraser/eraser-modules"
import { Button } from "@/components/ui/button"
import { canManagePages, pageForViewer, studioHref, type CustomPage, type PagePlace, type PageView } from "@/lib/custom-pages"
import { findCustomPage } from "@/lib/custom-pages-store"
import { campaignsOf, indexPathsOf, linkTargetsKnown, linkTargetsOf, viewerFor } from "@/lib/custom-pages-server"
import { replacementLabel, rowOfRoute, type ReplaceMode } from "@/lib/page-replacements"
import { blocksForRow, fillRowText, packRowContext, rowContextOf, rowValuesOf } from "@/lib/custom-pages-rows"
import { indexSourceOf, readOptions } from "@/lib/custom-pages-server"
import { listIndexLayouts } from "@/lib/index-layouts-store"
import { tabLayoutOrBuiltin } from "@/lib/index-layout-defaults"
import { knownWorldIndexKey } from "@/lib/world-indexes"
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
      <CustomPageView key={view.id} initial={view} links={await linkTargetsOf(view, viewAccount)} campaignName={campaignName} indexPaths={indexPathsOf(view, viewAccount.role)} modules={moduleSlots(view, { account: viewAccount })} />
    </AuthenticatedShell>
  )
}

/**
 * Une page d'Eraser remplacée ou complétée par une page du créateur de pages (layout racine) :
 * `replace` montre la page créée à la place, `before` / `after` ajoutent ses blocs au-dessus ou
 * en dessous du contenu d'origine. Admins et MJ gardent « Voir la page d'origine ».
 *
 * Rien n'est attendu ici (liens d'après la copie en mémoire des pages). Limite connue : en
 * mode « à la place », `children` n'est pas rendu, mais le routeur a déjà exécuté la page
 * d'origine avant ce layout (son rendu « à blanc », qui détecte redirect() et notFound(),
 * appelle la page directement) : sans middleware, son travail serveur ne s'évite pas.
 */
export async function ReplacementView({ page, view: viewed, mode, pathname, account, children }: { page: CustomPage; view: PageView; mode: ReplaceMode; pathname: string; account: AuthorizedUser; children: React.ReactNode }) {
  const manager = canManagePages(account.role)
  // La page d'une ligne d'index (une classe) : la ligne affichée, lue comme le lecteur peut la
  // lire ; introuvable (classe retirée…) : la page d'origine, qui sait le dire.
  const target = rowOfRoute(page.replaces, pathname)
  const rowKey = target ? await knownWorldIndexKey(target.index) : null
  const source = rowKey ? await indexSourceOf(rowKey).catch(() => null) : null
  const row = rowKey && source && target ? rowContextOf(source, target.id, readOptions(rowKey, account.role === "joueur")) : null
  if (target && !row) return <>{children}</>
  const valueOf = row && source ? rowValuesOf(source, row.tab, row.id) : null
  const view = valueOf ? blocksForRow(viewed, valueOf) : viewed
  const wantsForm = row && view.sections.some((section) => section.cols.some((column) => column.some((block) => block.type === "rowfields" && block.style === "form")))
  const form = wantsForm && rowKey ? tabLayoutOrBuiltin(await listIndexLayouts(rowKey).catch(() => ({})), rowKey, row.tab, "form") : null
  const packedRow = row ? packRowContext(form ? { ...row, form } : row) : undefined
  const moduleRow = row ? { index: row.index, id: row.id } : undefined
  const links = linkTargetsKnown(view, account)
  const indexPaths = indexPathsOf(view, account.role)
  const label = replacementLabel(page.replaces ?? pathname)
  const notice = manager ? <p className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl border border-dashed border-primary/35 bg-primary/[0.035] px-3.5 py-2 text-[12.5px] text-muted-foreground">
    <Replace className="size-3.5 shrink-0 text-primary" />
    <span className="min-w-0 flex-1">{mode === "replace" ? `Cette page remplace « ${label} » d’Eraser.` : `La page « ${view.title} » complète « ${label} » ${mode === "before" ? "au-dessus" : "en dessous"} de son contenu.`}</span>
    {mode === "replace" && <Link href={`${pathname}?origine=1`} prefetch={false} className="inline-flex items-center gap-1 font-medium text-primary hover:underline"><ExternalLink className="size-3.5" />Voir la page d’origine</Link>}
    {view.editable && <Link href={studioHref(page.id)} prefetch={false} className="inline-flex items-center gap-1 font-medium text-primary hover:underline"><PenLine className="size-3.5" />Modifier</Link>}
  </p> : null
  // « À la place » : le contenu d'origine va où la page pose son module « Contenu de la page
  // d'origine » (nulle part sans ce module) ; au-dessus ou en dessous, il est déjà autour.
  // Le titre de la page d'une ligne cite la ligne (« {Nom de la classe} ») : le fil d'Ariane montre son nom.
  if (mode === "replace") return <PageLabel label={row ? fillRowText(view.title, row) || row.name : view.title}>
    <CustomPageView key={`${view.id}:${pathname}`} initial={view} row={packedRow} links={links} indexPaths={indexPaths} eyebrow={row ? row.indexTitle : label} notice={notice} modules={moduleSlots(view, { account, origin: children, row: moduleRow })} actions={manager ? <Button asChild size="sm" variant="ghost"><Link href={`${pathname}?origine=1`} prefetch={false}><ExternalLink />Voir la page d’origine</Link></Button> : undefined} />
  </PageLabel>
  const blocks = <CustomPageView key={`${view.id}:${pathname}:${mode}`} initial={view} row={packedRow} links={links} indexPaths={indexPaths} modules={moduleSlots(view, { account, origin: null, row: moduleRow })} blocksOnly notice={notice ? <div className="mb-4 max-w-3xl">{notice}</div> : undefined} />
  return <>{mode === "before" && blocks}{children}{mode === "after" && blocks}</>
}
