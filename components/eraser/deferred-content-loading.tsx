import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

/** Des cartes vides : le contenu d'une page dont les données arrivent. */
export function DeferredContentLoading({
  label = "Chargement des données…",
  className,
  variant = "cards",
}: {
  label?: string
  className?: string
  /** « table » : la barre d'outils et le tableau d'un index. */
  variant?: "cards" | "table"
}) {
  if (variant === "table") return <TableSkeleton label={label} className={className} />
  return (
    <section className={cn("mt-8", className)} aria-busy="true" aria-live="polite">
      <p className="sr-only">{label}</p>
      <div className="space-y-3">
        <Skeleton className="h-5 w-44 rounded-full" />
        <Skeleton className="h-4 w-full max-w-xl rounded-full" />
      </div>
      <div className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {[0, 1, 2].map((item) => (
          <div key={item} className="rounded-2xl border border-border/55 bg-card/55 p-4">
            <div className="flex gap-4">
              <Skeleton className="size-20 shrink-0 rounded-xl" />
              <div className="min-w-0 flex-1 space-y-3 pt-1">
                <Skeleton className="h-5 w-3/4 rounded-full" />
                <Skeleton className="h-4 w-full rounded-full" />
                <Skeleton className="h-4 w-2/3 rounded-full" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

/** La barre d'outils, les onglets et les lignes vides d'un index. */
function TableSkeleton({ label, className }: { label: string; className?: string }) {
  return (
    <section className={cn("mt-4", className)} aria-busy="true" aria-live="polite">
      <p className="sr-only">{label}</p>
      <div className="flex flex-wrap items-center gap-2">
        <Skeleton className="h-9 w-64 rounded-lg" />
        <Skeleton className="h-9 w-28 rounded-lg" />
        <Skeleton className="ml-auto h-9 w-24 rounded-lg" />
      </div>
      <div className="mt-3 flex gap-1.5">{[0, 1, 2].map((item) => <Skeleton key={item} className="h-8 w-24 rounded-lg" />)}</div>
      <div className="mt-3 overflow-hidden rounded-xl border border-border/55 bg-card/55">
        <div className="flex gap-6 border-b border-border/55 px-4 py-3">{[40, 24, 32, 20].map((width, index) => <Skeleton key={index} className="h-4 rounded-full" style={{ width: `${width * 4}px` }} />)}</div>
        {Array.from({ length: 8 }, (_, row) => (
          <div key={row} className="flex gap-6 border-b border-border/40 px-4 py-3 last:border-0">
            {[40, 24, 32, 20].map((width, index) => <Skeleton key={index} className="h-4 rounded-full opacity-70" style={{ width: `${(width - (row % 3) * 4) * 4}px` }} />)}
          </div>
        ))}
      </div>
    </section>
  )
}

export type PageSkeletonVariant = "page" | "index" | "sheet" | "dashboard"

/**
 * Une page affichée avant ses données : sa structure et, quand on le connaît déjà, son
 * titre. Le même squelette sert au clic (avant même la réponse du serveur) et pendant le
 * chargement de la page : on passe de l'un à l'autre sans saut.
 */
export function PageSkeleton({ variant = "page", title, eyebrow, label }: { variant?: PageSkeletonVariant; title?: string; eyebrow?: string; label?: string }) {
  const heading = (className: string) => title
    ? <h1 className={cn("font-display font-semibold", className)}>{title}</h1>
    : <Skeleton className="mt-1 h-9 w-full max-w-sm rounded-xl" />
  if (variant === "index") {
    return (
      <div className="w-full px-4 pt-4 sm:px-6" aria-busy="true">
        <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-primary/75">{eyebrow ?? "Index"}</p>
        {heading("text-2xl sm:text-3xl")}
        <TableSkeleton label={label ?? "Chargement de l’index…"} />
      </div>
    )
  }
  if (variant === "sheet") {
    return (
      <div className="w-full flex-1 px-4 py-6 sm:px-6" aria-busy="true">
        <p className="sr-only">{label ?? "Chargement de la fiche…"}</p>
        <div className="flex items-center gap-5 rounded-[1.75rem] border border-border/55 bg-card/70 p-5">
          <Skeleton className="size-24 shrink-0 rounded-2xl" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-3 w-24 rounded-full" />
            {heading("truncate text-3xl sm:text-4xl")}
            <Skeleton className="h-4 w-56 rounded-full" />
          </div>
        </div>
        <div className="mt-5 flex flex-wrap gap-2">{[0, 1, 2, 3, 4].map((item) => <Skeleton key={item} className="h-10 w-28 rounded-xl" />)}</div>
        <div className="mt-5 grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">{[0, 1, 2, 3, 4, 5].map((item) => <Skeleton key={item} className="h-48 rounded-2xl" />)}</div>
      </div>
    )
  }
  if (variant === "dashboard") {
    return (
      <div className="w-full flex-1 px-5 py-8 sm:px-8" aria-busy="true">
        <p className="sr-only">{label ?? "Chargement de la campagne…"}</p>
        <Skeleton className="h-40 w-full rounded-[1.75rem]" />
        <div className="mt-5">{heading("text-4xl sm:text-5xl")}</div>
        <DeferredContentLoading label={label} className="mt-6" />
      </div>
    )
  }
  return (
    <div className="w-full flex-1 px-5 py-9 sm:px-8 md:py-14" aria-busy="true">
      {eyebrow ? <p className="text-xs font-semibold uppercase tracking-[0.22em] text-primary/75">{eyebrow}</p> : <Skeleton className="h-4 w-32 rounded-full" />}
      <div className="mt-3">{heading("text-4xl sm:text-5xl")}</div>
      <DeferredContentLoading label={label} />
    </div>
  )
}

export function DeferredPageLoading({ label, title, variant }: { label?: string; title?: string; variant?: PageSkeletonVariant }) {
  return <PageSkeleton variant={variant} title={title} label={label} />
}
