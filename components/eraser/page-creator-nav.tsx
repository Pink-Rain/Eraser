import Link from "next/link"
import { LayoutTemplate, LibraryBig, PanelLeft } from "lucide-react"

/**
 * Les onglets du créateur de pages, en tête de ses trois écrans : les pages (l'explorateur), le
 * menu latéral et les modèles. On passe de l'un à l'autre sans repasser par la barre latérale.
 */
export type CreatorTab = "pages" | "menu" | "modeles"

const tabs: Array<{ value: CreatorTab; label: string; href: string; icon: typeof LibraryBig }> = [
  { value: "pages", label: "Pages", href: "/pages", icon: LibraryBig },
  { value: "menu", label: "Menu", href: "/pages/menu", icon: PanelLeft },
  { value: "modeles", label: "Modèles", href: "/pages?vue=modeles", icon: LayoutTemplate },
]

export function PageCreatorNav({ active, onTab }: { active: CreatorTab; onTab?: (tab: CreatorTab) => boolean }) {
  return <nav aria-label="Créateur de pages" className="inline-flex rounded-[12px] border bg-card p-0.5 shadow-[0_6px_18px_rgb(67_50_31/0.05)]">
    {tabs.map(({ value, label, href, icon: Icon }) => <Link
      key={value}
      href={href}
      prefetch={false}
      aria-current={active === value ? "page" : undefined}
      // Entre deux vues du même écran (Pages ↔ Modèles), l'explorateur change de vue sans recharger.
      onClick={(event) => { if (onTab?.(value)) event.preventDefault() }}
      className="inline-flex items-center gap-1.5 rounded-[9px] px-3 py-1.5 text-[13px] text-muted-foreground transition hover:bg-muted hover:text-foreground aria-[current=page]:bg-foreground aria-[current=page]:font-semibold aria-[current=page]:text-background"
    ><Icon className="size-3.5" />{label}</Link>)}
  </nav>
}
