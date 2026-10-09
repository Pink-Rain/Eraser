"use client"

import { useCallback, useEffect, useState } from "react"
import { Gauge, LoaderCircle, RefreshCw } from "lucide-react"

import { Button } from "@/components/ui/button"

type Report = {
  startedAt: string
  slowMs: number
  totals: Array<{ kind: string; count: number; slow: number; refused?: number; lastMinute?: number; averageMs: number; maxMs: number }>
  slow: Array<{ kind: string; label: string; ms: number; status: string; at: string }>
}

const kindLabels: Record<string, string> = { sheets: "Google Sheets", drive: "Google Drive", "partagé": "Serveur partagé (comptes)" }

/**
 * Ce qui fait attendre les pages : les appels à Google et au serveur partagé depuis le
 * démarrage du serveur local, et les plus lents d'entre eux.
 */
export function PerformancePanel() {
  const [report, setReport] = useState<Report | null>(null)
  const [pending, setPending] = useState(false)
  const load = useCallback(async () => {
    setPending(true)
    try {
      const response = await fetch("/api/admin/performance", { cache: "no-store" })
      if (response.ok) setReport((await response.json()) as Report)
    } catch { /* le relevé reste celui d'avant */ }
    setPending(false)
  }, [])
  useEffect(() => {
    let active = true
    fetch("/api/admin/performance", { cache: "no-store" })
      .then(async (response) => response.ok ? (await response.json()) as Report : null)
      .then((payload) => { if (active && payload) setReport(payload) })
      .catch(() => { /* pas de relevé */ })
    return () => { active = false }
  }, [])
  return <section className="mt-10 rounded-2xl border bg-card/70 p-5 sm:p-6">
    <div className="flex flex-wrap items-start gap-3">
      <div className="min-w-0 flex-1">
        <h2 className="flex items-center gap-2 font-display text-2xl font-semibold"><Gauge className="size-5 text-primary" />Lenteurs</h2>
        <p className="mt-1 text-sm text-muted-foreground">Les appels qui ont fait attendre les pages depuis le démarrage d’Eraser{report ? ` (${new Date(report.startedAt).toLocaleString("fr-FR")})` : ""} : plus de {((report?.slowMs ?? 700) / 1000).toLocaleString("fr-FR")} s.</p>
      </div>
      <Button type="button" variant="outline" size="sm" onClick={() => void load()} disabled={pending}>{pending ? <LoaderCircle className="animate-spin" /> : <RefreshCw />}Actualiser</Button>
    </div>
    {report && <>
      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        {report.totals.map((total) => <div key={total.kind} className="rounded-xl border bg-background/50 px-4 py-3 text-sm">
          <p className="font-semibold">{kindLabels[total.kind] ?? total.kind}</p>
          <p className="text-muted-foreground">{total.count} appel{total.count > 1 ? "s" : ""} · moyenne {total.averageMs} ms · pire {total.maxMs} ms</p>
          <p className={total.slow ? "font-medium text-amber-700" : "text-muted-foreground"}>{total.slow} lent{total.slow > 1 ? "s" : ""}</p>
          {total.lastMinute !== undefined && <p className="text-muted-foreground">{total.lastMinute} dans la dernière minute</p>}
          {Boolean(total.refused) && <p className="font-medium text-destructive" title="Google compte son quota par minute pour le compte Eraser, que toutes les installations partagent.">{total.refused} refus de Google (quota partagé dépassé)</p>}
        </div>)}
        {!report.totals.length && <p className="text-sm text-muted-foreground">Aucun appel pour l’instant.</p>}
      </div>
      {report.slow.length > 0 && <div className="mt-4 max-h-96 overflow-auto rounded-xl border">
        <table className="w-full text-left text-xs">
          <thead className="sticky top-0 bg-muted/80 text-[10px] uppercase tracking-wider text-muted-foreground"><tr><th className="px-3 py-2">Heure</th><th className="px-3 py-2">Service</th><th className="px-3 py-2">Appel</th><th className="px-3 py-2 text-right">Durée</th><th className="px-3 py-2">Réponse</th></tr></thead>
          <tbody>{report.slow.map((call, index) => <tr key={`${call.at}-${index}`} className="border-t">
            <td className="whitespace-nowrap px-3 py-1.5 tabular-nums text-muted-foreground">{new Date(call.at).toLocaleTimeString("fr-FR")}</td>
            <td className="whitespace-nowrap px-3 py-1.5">{kindLabels[call.kind] ?? call.kind}</td>
            <td className="px-3 py-1.5 font-mono text-[11px]">{call.label}</td>
            <td className={`whitespace-nowrap px-3 py-1.5 text-right font-semibold tabular-nums ${call.ms > 3000 ? "text-destructive" : "text-amber-700"}`}>{(call.ms / 1000).toFixed(1)} s</td>
            <td className="whitespace-nowrap px-3 py-1.5 text-muted-foreground">{call.status}</td>
          </tr>)}</tbody>
        </table>
      </div>}
    </>}
  </section>
}
