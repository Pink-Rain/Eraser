import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { ExternalLink } from "lucide-react"

import { AuthenticatedShell } from "@/components/eraser/authenticated-shell"
import { CustomPageView } from "@/components/eraser/custom-page-view"
import { moduleSlots } from "@/components/eraser/eraser-modules"
import { Button } from "@/components/ui/button"
import { canManagePages, pageForViewer } from "@/lib/custom-pages"
import { blocksForRow, packRowContext, rowContextOf, rowFormIdsOf, rowValuesOf, templateForRow } from "@/lib/custom-pages-rows"
import { listIndexLayouts } from "@/lib/index-layouts-store"
import { tabFormOrBuiltin, tabLayoutOrBuiltin } from "@/lib/index-layout-defaults"
import { indexPathsOf, indexSourceOf, linkTargetsOf, readablePages, readOptions, viewerFor } from "@/lib/custom-pages-server"
import { currentAccount, currentViewAccount } from "@/lib/server-auth"
import { knownWorldIndexKey } from "@/lib/world-indexes"

export const dynamic = "force-dynamic"

/**
 * La page d'une ligne d'index (/fiche/<index>/<ID>) : le modèle de page réglé pour son index
 * (Créateur de pages › « Page de chaque ligne »), rempli avec les valeurs de la ligne que le
 * lecteur peut lire. Sans modèle, ou ligne introuvable : « page introuvable ».
 */
export default async function RowPage({ params }: { params: Promise<{ index: string; id: string }> }) {
  const [account, viewAccount] = await Promise.all([currentAccount(), currentViewAccount()])
  if (!account) redirect("/connexion")
  if (!viewAccount) redirect("/")
  const { index, id } = await params
  const key = await knownWorldIndexKey(decodeURIComponent(index))
  if (!key) notFound()
  const player = viewAccount.role === "joueur"
  const manager = canManagePages(viewAccount.role)
  // Les modèles lisibles par le compte (brouillons compris pour qui peut les modifier).
  const templates = (await readablePages(viewAccount, { includeDrafts: manager }).catch(() => [])).filter(({ page }) => page.rowOf?.index === key).map(({ page }) => page)
  if (!templates.length) notFound()
  const source = await indexSourceOf(key).catch(() => null)
  if (!source) notFound()
  const row = rowContextOf(source, decodeURIComponent(id), readOptions(key, player))
  if (!row) notFound()
  const template = templateForRow(templates, key, row.tab)
  if (!template) notFound()
  const viewed = pageForViewer(template, await viewerFor(viewAccount, template))
  if (!viewed) notFound()
  // Les blocs dont la condition d'affichage ne vaut pas pour cette ligne ne partent pas.
  const valueOf = rowValuesOf(source, row.tab, row.id)
  const view = valueOf ? blocksForRow(viewed, valueOf) : viewed
  // Un bloc « Valeurs de la ligne » disposé comme la fiche : la fiche de l'onglet (lue seulement alors).
  // Un bloc « Valeurs de la ligne » disposé comme la fiche : le formulaire étoilé de l'onglet, et ceux que les blocs nomment.
  const formIds = rowFormIdsOf(view)
  const layouts = formIds ? await listIndexLayouts(key).catch(() => ({})) : {}
  const form = formIds ? tabLayoutOrBuiltin(layouts, key, row.tab, "form") : null
  const forms = formIds ? Object.fromEntries(formIds.filter(Boolean).flatMap((formId) => { const layout = tabFormOrBuiltin(layouts, key, row.tab, formId); return layout ? [[formId, layout]] : [] })) : {}
  const indexHref = manager ? (source.nameHref ? source.nameHref.replace("{id}", encodeURIComponent(row.id)) : `${source.path}?ligne=${encodeURIComponent(row.id)}`) : ""
  return (
    <AuthenticatedShell pageLabel={row.name}>
      <CustomPageView
        key={`${view.id}:${key}:${row.id}`}
        initial={view}
        row={packRowContext(form ? { ...row, form, ...(Object.keys(forms).length ? { forms } : {}) } : row)}
        modules={moduleSlots(view, { account: viewAccount, row: { index: key, id: row.id } })}
        eyebrow={`${source.title} · ${row.tab}`}
        links={await linkTargetsOf(view, viewAccount)}
        indexPaths={indexPathsOf(view, viewAccount.role)}
        actions={indexHref ? <Button asChild size="sm" variant="ghost"><Link href={indexHref} prefetch={false}><ExternalLink />Ouvrir dans l’index</Link></Button> : undefined}
      />
    </AuthenticatedShell>
  )
}
