"use client"

import { useEffect, useMemo, useState } from "react"
import { Check, ClipboardCopy, MousePointerClick, Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { clearFluidity, FLUIDITY_EVENT, fluidityEntries, fluiditySummary, type FluidityEntry, type FluidityKind } from "@/lib/fluidity-journal"
import { effectsAreLight } from "@/lib/visual-effects"
import { version as appVersion } from "@/package.json"

const kindLabels: Record<FluidityKind, string> = { page: "Changements de page", clic: "Clics lents", gel: "Gels de l'écran", appel: "Attentes du serveur" }
const kindHints: Record<FluidityKind, string> = {
  page: "Du clic à la page complète",
  clic: "Du clic à l'image suivante (plus de 0,1 s)",
  gel: "Images de l'écran retenues plus de 0,15 s",
  appel: "Requêtes de plus de 0,3 s",
}

function seconds(ms: number) {
  return ms >= 1000 ? `${(ms / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} s` : `${ms} ms`
}

/**
 * Ce que l'on ressent sur cet ordinateur : clics, gels, changements de page et attentes du
 * serveur (lib/fluidity-journal.ts). « Copier » met le relevé dans le presse-papiers, pour
 * l'envoyer à qui cherche les lenteurs.
 */
export function FluidityPanel({ inDialog = false }: { inDialog?: boolean }) {
  const [entries, setEntries] = useState<FluidityEntry[]>([])
  const [kind, setKind] = useState<FluidityKind | "all">("all")
  const [order, setOrder] = useState<"recent" | "slow">("recent")
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    const sync = () => setEntries(fluidityEntries())
    sync()
    window.addEventListener(FLUIDITY_EVENT, sync)
    return () => window.removeEventListener(FLUIDITY_EVENT, sync)
  }, [])
  const summary = useMemo(() => fluiditySummary(entries), [entries])
  const shown = useMemo(() => {
    const kept = entries.filter((entry) => kind === "all" || entry.kind === kind)
    return (order === "slow" ? [...kept].sort((left, right) => right.ms - left.ms) : [...kept].reverse()).slice(0, 200)
  }, [entries, kind, order])

  async function copy() {
    const nav = navigator as Navigator & { deviceMemory?: number }
    // Ce qu'a attendu le serveur local (Google, serveur partagé) : d'où vient chaque attente.
    const server = await fetch("/api/fluidity", { cache: "no-store" }).then((response) => response.ok ? response.json() : null).catch(() => null) as unknown
    const report = {
      copiedAt: new Date().toISOString(),
      version: appVersion,
      computer: { cores: nav.hardwareConcurrency, memoryGb: nav.deviceMemory, lightEffects: effectsAreLight(), screen: `${window.screen.width}×${window.screen.height}@${window.devicePixelRatio}`, userAgent: nav.userAgent },
      summary,
      server,
      entries,
    }
    try {
      await navigator.clipboard.writeText(JSON.stringify(report, null, 1))
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2500)
    } catch { /* presse-papiers refusé */ }
  }

  const Title = inDialog ? DialogTitle : "h2"
  const Description = inDialog ? DialogDescription : "p"
  return <section className={inDialog ? "" : "mt-10 rounded-2xl border bg-card/70 p-5 sm:p-6"}>
    <div className={`flex flex-wrap items-start gap-3 ${inDialog ? "pr-8" : ""}`}>
      <div className="min-w-0 flex-1">
        <Title className="flex items-center gap-2 font-display text-2xl font-semibold"><MousePointerClick className="size-5 text-primary" />Fluidité de cet ordinateur</Title>
        <Description className="mt-1 text-sm text-muted-foreground">Ce que l’on ressent dans cette fenêtre : les clics lents, les gels de l’écran et le temps de chaque page. Gardé sur cet ordinateur ({entries.length} mesure{entries.length > 1 ? "s" : ""}). « Copier le relevé » le met dans le presse-papiers, pour l’envoyer à qui cherche les lenteurs.</Description>
      </div>
      <Button type="button" variant="outline" size="sm" onClick={() => void copy()} disabled={!entries.length}>{copied ? <Check /> : <ClipboardCopy />}{copied ? "Copié" : "Copier le relevé"}</Button>
      <Button type="button" variant="ghost" size="sm" onClick={clearFluidity} disabled={!entries.length}><Trash2 />Vider</Button>
    </div>
    <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
      {summary.map((total) => <button key={total.kind} type="button" onClick={() => setKind((current) => current === total.kind ? "all" : total.kind)} aria-pressed={kind === total.kind} className={`rounded-xl border px-4 py-3 text-left text-sm transition-colors ${kind === total.kind ? "border-primary/50 bg-primary/8" : "bg-background/50 hover:bg-muted/50"}`}>
        <p className="font-semibold">{kindLabels[total.kind]}</p>
        <p className="text-xs text-muted-foreground">{kindHints[total.kind]}</p>
        {total.count
          ? <p className="mt-1.5 tabular-nums">{total.count} · médiane {seconds(total.median)} · 9 sur 10 sous {seconds(total.p90)} · pire <span className={total.worst > 1000 ? "font-semibold text-destructive" : "font-semibold"}>{seconds(total.worst)}</span></p>
          : <p className="mt-1.5 text-muted-foreground">Rien de relevé.</p>}
      </button>)}
    </div>
    {shown.length > 0 && <>
      <div className="mt-4 flex items-center gap-2 text-xs">
        <span className="text-muted-foreground">Trier :</span>
        <Button type="button" size="sm" variant={order === "recent" ? "secondary" : "ghost"} className="h-7" onClick={() => setOrder("recent")}>Plus récents</Button>
        <Button type="button" size="sm" variant={order === "slow" ? "secondary" : "ghost"} className="h-7" onClick={() => setOrder("slow")}>Plus lents</Button>
      </div>
      <div className="mt-2 max-h-[28rem] overflow-auto rounded-xl border">
        <table className="w-full text-left text-xs">
          <thead className="sticky top-0 bg-muted text-[10px] uppercase tracking-wider text-muted-foreground"><tr><th className="px-3 py-2">Heure</th><th className="px-3 py-2">Sorte</th><th className="px-3 py-2">Page</th><th className="px-3 py-2">Quoi</th><th className="px-3 py-2 text-right">Durée</th><th className="px-3 py-2">Détail</th></tr></thead>
          <tbody>{shown.map((entry, index) => <tr key={`${entry.at}-${index}`} className="border-t align-top">
            <td className="whitespace-nowrap px-3 py-1.5 tabular-nums text-muted-foreground">{new Date(entry.at).toLocaleTimeString("fr-FR")}</td>
            <td className="whitespace-nowrap px-3 py-1.5">{kindLabels[entry.kind]}</td>
            <td className="max-w-48 truncate px-3 py-1.5 font-mono text-[11px]" title={entry.path}>{entry.path}</td>
            <td className="max-w-72 break-words px-3 py-1.5 font-mono text-[11px]">{entry.label}</td>
            <td className={`whitespace-nowrap px-3 py-1.5 text-right font-semibold tabular-nums ${entry.ms > 1000 ? "text-destructive" : entry.ms > 300 ? "text-amber-700" : ""}`}>{seconds(entry.ms)}</td>
            <td className="px-3 py-1.5 text-muted-foreground">{entry.detail}</td>
          </tr>)}</tbody>
        </table>
      </div>
    </>}
  </section>
}

/** Le relevé ouvert depuis le pied de la barre latérale, pour chaque compte (joueurs compris). */
export function FluidityDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-5xl">
      <FluidityPanel inDialog />
    </DialogContent>
  </Dialog>
}
