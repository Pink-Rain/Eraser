import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { ExternalLink } from "lucide-react"

import { AuthenticatedShell } from "@/components/eraser/authenticated-shell"
import { CustomPageView } from "@/components/eraser/custom-page-view"
import { Button } from "@/components/ui/button"
import { canManagePages, pageForViewer } from "@/lib/custom-pages"
import { rowContextOf, templateForRow } from "@/lib/custom-pages-rows"
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
  const view = pageForViewer(template, await viewerFor(viewAccount, template))
  if (!view) notFound()
  const indexHref = manager ? (source.nameHref ? source.nameHref.replace("{id}", encodeURIComponent(row.id)) : `${source.path}?ligne=${encodeURIComponent(row.id)}`) : ""
  return (
    <AuthenticatedShell pageLabel={row.name}>
      <CustomPageView
        key={`${view.id}:${key}:${row.id}`}
        initial={view}
        row={row}
        eyebrow={`${source.title} · ${row.tab}`}
        links={await linkTargetsOf(view, viewAccount)}
        indexPaths={indexPathsOf(view, viewAccount.role)}
        actions={indexHref ? <Button asChild size="sm" variant="ghost"><Link href={indexHref} prefetch={false}><ExternalLink />Ouvrir dans l’index</Link></Button> : undefined}
      />
    </AuthenticatedShell>
  )
}
