import type { LucideIcon } from "lucide-react"

export function PreparedPage({
  eyebrow,
  title,
  description,
  icon: Icon,
}: {
  eyebrow: string
  title: string
  description: string
  icon: LucideIcon
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
          <div>
            <h1 className="font-display text-4xl font-semibold tracking-[-0.025em] sm:text-5xl">
              {title}
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-muted-foreground">
              {description}
            </p>
          </div>
        </div>
      </section>
      <div className="mt-10 rounded-2xl border border-dashed bg-card/55 px-6 py-10 text-center text-sm text-muted-foreground">
        Cette page est prête à recevoir son contenu.
      </div>
    </div>
  )
}
