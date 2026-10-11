import type { ReactNode } from "react"
import Link from "next/link"
import { ChevronRight, type LucideIcon } from "lucide-react"

export type MenuPageLink = { href: string; label: string; description: string; icon: LucideIcon }

/**
 * Une « page menu » : la page d'une section du menu (Règles, Administration, Bac à sable,
 * dossier d'une campagne). Son titre, quelques mots, puis les pages de la section en cartes.
 */
export function MenuPage({ eyebrow, title, description, icon: Icon, links, children, before }: {
  eyebrow: string
  title: string
  description: ReactNode
  icon: LucideIcon
  links: MenuPageLink[]
  /** Ce qui suit les cartes (journal, compagnon Roll20…). */
  children?: ReactNode
  /** Ce qui précède les cartes (résumé de la campagne…). */
  before?: ReactNode
}) {
  return (
    <div className="w-full flex-1 px-5 py-9 sm:px-8 md:py-14">
      <section className="max-w-3xl">
        <div className="mb-5 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-primary/75">
          <span className="h-px w-7 bg-primary/50" />
          {eyebrow}
        </div>
        <div className="flex items-start gap-4">
          <div className="mt-1 flex size-12 shrink-0 items-center justify-center rounded-2xl border bg-card/90 text-primary shadow-[0_8px_25px_rgb(67_50_31/0.06)]">
            <Icon className="size-5" />
          </div>
          <div className="min-w-0">
            <h1 className="font-display text-4xl font-semibold tracking-[-0.025em] sm:text-5xl">{title}</h1>
            <div className="mt-4 max-w-2xl text-base leading-7 text-muted-foreground">{description}</div>
          </div>
        </div>
      </section>
      {before && <div className="mt-10">{before}</div>}
      {links.length > 0 && <nav aria-label={title} className="mt-10 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {links.map(({ href, label, description: detail, icon: LinkIcon }) => (
          <Link key={href} href={href} prefetch={false} className="group flex items-start gap-3 rounded-2xl border bg-card/85 p-4 shadow-[0_10px_30px_rgb(67_50_31/0.06)] transition hover:-translate-y-0.5 hover:border-primary/35 hover:shadow-[0_16px_40px_rgb(67_50_31/0.11)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-primary/8 text-primary"><LinkIcon className="size-4.5" /></span>
            <span className="min-w-0 flex-1">
              <span className="block font-display text-lg font-semibold leading-tight">{label}</span>
              <span className="mt-1 block text-xs leading-5 text-muted-foreground">{detail}</span>
            </span>
            <ChevronRight className="mt-1 size-4 shrink-0 text-muted-foreground/40 transition group-hover:translate-x-0.5 group-hover:text-muted-foreground" />
          </Link>
        ))}
      </nav>}
      {children && <div className="mt-10 space-y-6">{children}</div>}
    </div>
  )
}
