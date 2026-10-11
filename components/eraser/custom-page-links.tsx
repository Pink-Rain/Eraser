import { FileText } from "lucide-react"

import { PageIcon } from "@/components/eraser/custom-page-view"
import type { MenuPageLink } from "@/components/eraser/menu-page"
import type { PagePlace } from "@/lib/custom-pages"
import { pagesOfPlace } from "@/lib/custom-pages-server"
import { currentViewAccount } from "@/lib/server-auth"

/**
 * Les pages du créateur de pages rangées à un endroit (une section, une campagne), publiées
 * et ouvertes au compte : en cartes sur la page de la section, après ses pages d'Eraser.
 * Une lecture ratée (serveur partagé injoignable) ne montre simplement aucune page.
 */
export async function customPageLinks(place: PagePlace, campaignId = "", size = "size-4.5"): Promise<MenuPageLink[]> {
  const account = await currentViewAccount()
  if (!account) return []
  const pages = await pagesOfPlace(account, place, campaignId).catch(() => [])
  return pages.map((page) => ({
    href: page.href,
    label: page.title,
    description: page.description || "Une page du créateur de pages.",
    icon: FileText,
    glyph: <PageIcon icon={page.icon} emoji={page.emoji} className={size} />,
  }))
}
