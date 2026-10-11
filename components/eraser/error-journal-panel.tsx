"use client"

import { useCallback, useEffect, useState } from "react"
import { ChevronRight, LoaderCircle, RefreshCw, ScrollText, Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import type { ErrorJournalEntry } from "@/lib/error-journal"

const time = new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })

/** Le journal des erreurs du serveur local : la plus récente en haut, le détail d'un clic. */
export function ErrorJournalPanel() {
  const [entries, setEntries] = useState<ErrorJournalEntry[] | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState("")
  const load = useCallback(async (method: "GET" | "DELETE" = "GET") => {
    setPending(true); setError("")
    try {
      const response = await fetch("/api/admin/error-journal", { method, cache: "no-store" })
      const payload = (await response.json().catch(() => ({}))) as { entries?: ErrorJournalEntry[]; error?: string }
      if (!response.ok || !payload.entries) throw new Error(payload.error || "Le journal n’a pas pu être lu.")
      setEntries(payload.entries)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Le journal n’a pas pu être lu.")
    } finally {
      setPending(false)
    }
  }, [])
  useEffect(() => {
    let active = true
    fetch("/api/admin/error-journal", { cache: "no-store" })
      .then(async (response) => response.ok ? ((await response.json()) as { entries?: ErrorJournalEntry[] }).entries ?? [] : null)
      .then((loaded) => { if (active) { if (loaded) setEntries(loaded); else setError("Le journal n’a pas pu être lu.") } })
      .catch(() => { if (active) setError("Le journal n’a pas pu être lu.") })
    return () => { active = false }
  }, [])
  return <section className="rounded-2xl border bg-card/70 p-5 sm:p-6" aria-labelledby="journal-des-erreurs">
    <div className="flex flex-wrap items-center gap-3">
      <span className="flex size-10 items-center justify-center rounded-xl border border-primary/20 bg-primary/8 text-primary"><ScrollText className="size-4.5" /></span>
      <div className="min-w-0 flex-1">
        <h2 id="journal-des-erreurs" className="font-display text-2xl font-semibold">Journal des erreurs</h2>
        <p className="text-xs text-muted-foreground">Les erreurs du serveur local depuis le dernier démarrage d’Eraser (300 au plus).</p>
      </div>
      <Button type="button" variant="ghost" size="icon" onClick={() => void load()} disabled={pending} title="Relire le journal" aria-label="Relire le journal">{pending ? <LoaderCircle className="animate-spin" /> : <RefreshCw />}</Button>
      <Button type="button" variant="ghost" size="icon" className="text-destructive/75" onClick={() => void load("DELETE")} disabled={pending || !entries?.length} title="Vider le journal" aria-label="Vider le journal"><Trash2 /></Button>
    </div>
    {error && <p className="mt-4 rounded-xl border border-destructive/25 bg-destructive/5 px-4 py-2.5 text-sm text-destructive">{error}</p>}
    {entries === null && !error && <div className="grid min-h-20 place-items-center"><LoaderCircle className="size-4 animate-spin text-muted-foreground" /></div>}
    {entries?.length === 0 && <p className="mt-4 rounded-xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">Aucune erreur depuis le démarrage.</p>}
    {entries && entries.length > 0 && <ol className="mt-4 max-h-[28rem] space-y-1 overflow-y-auto">
      {entries.map((entry, index) => {
        const [first, ...rest] = entry.message.split("\n")
        return <li key={`${entry.at}:${index}`}>
          <details className="group rounded-lg border bg-background/50 px-3 py-2">
            <summary className="flex cursor-pointer list-none items-start gap-2 text-xs">
              <ChevronRight className="mt-0.5 size-3.5 shrink-0 text-muted-foreground transition-transform group-open:rotate-90" />
              <time dateTime={entry.at} className="shrink-0 tabular-nums text-muted-foreground">{time.format(new Date(entry.at))}</time>
              <span className="min-w-0 flex-1 break-words font-mono text-foreground/85">{first}</span>
            </summary>
            {rest.length > 0 && <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted/50 p-2 font-mono text-[11px] text-muted-foreground">{rest.join("\n")}</pre>}
          </details>
        </li>
      })}
    </ol>}
  </section>
}
