"use client"

import Link from "next/link"
import { Church, CircleUserRound, Drama, Languages, Map, MapPin, Package, PawPrint, Star, Swords, Users, type LucideIcon } from "lucide-react"

import { useIndexFavorites } from "@/components/eraser/index-favorites"
import { indexPages, type IndexPage, type IndexPageKey } from "@/lib/index-pages"

export const indexPageIcons: Record<IndexPageKey, LucideIcon> = {
  campagnes: Map,
  classes: Swords,
  creatures: PawPrint,
  langues: Languages,
  lieux: MapPin,
  objets: Package,
  peuples: Users,
  personnages: CircleUserRound,
  pnjs: Drama,
  religions: Church,
}

function IndexCard({ page, favorite, onToggle }: { page: IndexPage; favorite: boolean; onToggle: () => void }) {
  const Icon = indexPageIcons[page.key]
  return (
    <div className="group relative">
      <Link
        href={page.href}
        prefetch={false}
        className="flex min-h-full flex-col items-center overflow-hidden rounded-[1.35rem] border bg-card/90 px-4 pb-5 pt-6 text-center shadow-[0_12px_35px_rgb(67_50_31/0.07)] transition hover:-translate-y-1 hover:border-primary/35 hover:shadow-[0_18px_45px_rgb(67_50_31/0.13)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <div className="flex size-16 items-center justify-center rounded-2xl border border-primary/20 bg-primary/8 text-primary transition duration-500 group-hover:scale-[1.06]">
          <Icon className="size-7" />
        </div>
        <h3 className="mt-4 font-display text-xl font-semibold leading-tight tracking-[-0.01em]">{page.label}</h3>
        <p className="mt-1.5 text-xs leading-5 text-muted-foreground">{page.description}</p>
      </Link>
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={favorite}
        aria-label={favorite ? `Ranger ${page.label} dans l’index secondaire` : `Mettre ${page.label} dans l’index`}
        title={favorite ? "Retirer l’étoile : l’index passe dans « Index secondaire »" : "Étoiler : l’index passe dans « Index »"}
        className={`absolute right-2.5 top-2.5 flex size-8 items-center justify-center rounded-full transition hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${favorite ? "text-[#c9a227]" : "text-muted-foreground/60 hover:text-[#c9a227]"}`}
      >
        <Star className="size-4.5" fill={favorite ? "currentColor" : "none"} />
      </button>
    </div>
  )
}

function IndexSection({ id, title, hint, pages, isFavorite, setFavorite }: { id: string; title: string; hint: string; pages: IndexPage[]; isFavorite: (key: IndexPageKey) => boolean; setFavorite: (key: IndexPageKey, favorite: boolean) => void }) {
  return (
    <section aria-labelledby={id}>
      <div className="mb-5 border-b pb-3 text-center">
        <h2 id={id} className="font-display text-3xl font-semibold sm:text-4xl">{title}</h2>
      </div>
      {pages.length ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {pages.map((page) => <IndexCard key={page.key} page={page} favorite={isFavorite(page.key)} onToggle={() => setFavorite(page.key, !isFavorite(page.key))} />)}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed bg-card/55 px-6 py-10 text-center text-sm text-muted-foreground">{hint}</div>
      )}
    </section>
  )
}

export function IndexDirectory() {
  const { isFavorite, setFavorite } = useIndexFavorites()
  const favorites = indexPages.filter((page) => isFavorite(page.key))
  const secondary = indexPages.filter((page) => !isFavorite(page.key))
  return (
    <div className="mt-12 space-y-14">
      <IndexSection id="index-principal" title="Index" hint="Aucun index étoilé : clique sur l’étoile d’une carte pour la ranger ici." pages={favorites} isFavorite={isFavorite} setFavorite={setFavorite} />
      <IndexSection id="index-secondaire" title="Index secondaire" hint="Retire l’étoile d’une carte pour la ranger ici." pages={secondary} isFavorite={isFavorite} setFavorite={setFavorite} />
    </div>
  )
}
