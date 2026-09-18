import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

export function DeferredContentLoading({
  label = "Chargement des données…",
  className,
}: {
  label?: string
  className?: string
}) {
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

export function DeferredPageLoading({ label }: { label?: string }) {
  return (
    <div className="w-full flex-1 px-5 py-9 sm:px-8 md:py-14">
      <Skeleton className="h-4 w-32 rounded-full" />
      <Skeleton className="mt-4 h-11 w-full max-w-sm rounded-xl" />
      <DeferredContentLoading label={label} />
    </div>
  )
}
