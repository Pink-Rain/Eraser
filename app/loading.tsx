import { LoaderCircle } from "lucide-react"

export default function Loading() {
  return (
    <main className="grid min-h-[45vh] place-items-center px-6" aria-live="polite" aria-label="Chargement de la page">
      <div className="flex items-center gap-3 rounded-2xl border border-border/55 bg-card/70 px-5 py-4 text-sm text-muted-foreground shadow-sm backdrop-blur-sm">
        <LoaderCircle className="size-5 animate-spin text-primary" />
        <span>Ouverture de la page…</span>
      </div>
    </main>
  )
}
