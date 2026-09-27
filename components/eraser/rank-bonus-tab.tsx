"use client"

import { useEffect, useState } from "react"
import { ExternalLink, LoaderCircle, RefreshCw } from "lucide-react"

import { Button } from "@/components/ui/button"
import type { RankBonusTable } from "@/lib/class-content"

async function fetchRankBonuses(refresh: boolean) {
  const response = await fetch(`/api/classes/rank-bonuses?create=1${refresh ? "&refresh=1" : ""}`, { cache: "no-store" })
  const payload = await response.json() as RankBonusTable & { error?: string }
  if (!response.ok) throw new Error(payload.error || "Chargement impossible.")
  return payload
}

/**
 * Onglet « Bonus Rang » : les bonus gagnés à chaque rang, communs à toutes les
 * classes. Ils se remplissent dans Google Sheets (onglet « Bonus de rang » du
 * classeur des sorts, créé à la première ouverture) ; ici on les relit.
 */
export function RankBonusTab() {
  const [table, setTable] = useState<RankBonusTable | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  async function load(refresh: boolean) {
    setLoading(true)
    setError("")
    try {
      setTable(await fetchRankBonuses(refresh))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Chargement impossible.")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    let active = true
    fetchRankBonuses(false)
      .then((payload) => { if (active) setTable(payload) })
      .catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : "Chargement impossible.") })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  const columns = table?.headers.slice(1) ?? []
  const byRank = new Map((table?.bonuses ?? []).map((bonus) => [bonus.rank, bonus]))
  const filled = (table?.bonuses ?? []).filter((bonus) => bonus.entries.length).length

  return <section className="space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-card/75 px-4 py-3">
      <div>
        <p className="font-display text-lg font-semibold">Bonus gagnés à chaque rang</p>
        <p className="text-xs text-muted-foreground">Les mêmes pour toutes les classes. Ils s’affichent sous chaque rang dans Règles › Classe et sur la fiche de personnage. {table?.exists ? `${filled} rang${filled > 1 ? "s" : ""} sur 20 renseigné${filled > 1 ? "s" : ""}.` : ""}</p>
      </div>
      <div className="flex gap-2">
        <Button type="button" variant="outline" size="sm" disabled={loading} onClick={() => void load(true)}>{loading ? <LoaderCircle className="animate-spin" /> : <RefreshCw />}Actualiser</Button>
        {table?.sheetUrl && <Button asChild size="sm"><a href={table.sheetUrl} target="_blank" rel="noreferrer">Remplir dans Google Sheets<ExternalLink /></a></Button>}
      </div>
    </div>
    {error && <p className="rounded-xl border border-destructive/25 bg-destructive/5 px-4 py-2.5 text-sm text-destructive">{error}</p>}
    {table && !table.exists && <p className="rounded-xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">L’onglet « Bonus de rang » n’existe pas encore dans le classeur des sorts.</p>}
    {table?.exists && <div className="overflow-x-auto rounded-2xl border bg-card/80">
      <table className="w-full text-sm">
        <thead className="bg-muted/40 text-left text-[10px] font-semibold uppercase tracking-[.14em] text-muted-foreground">
          <tr><th className="w-28 px-4 py-2">Rang</th>{columns.length ? columns.map((column, index) => <th key={`${column}:${index}`} className="px-4 py-2">{column || `Colonne ${index + 2}`}</th>) : <th className="px-4 py-2">Bonus</th>}</tr>
        </thead>
        <tbody className="divide-y">
          {Array.from({ length: 20 }, (_, index) => index + 1).map((rank) => {
            const bonus = byRank.get(rank)
            return <tr key={rank} className="align-top">
              <td className="px-4 py-2.5 font-semibold">Rang {rank}</td>
              {(columns.length ? columns : ["Bonus"]).map((column, index) => {
                const value = bonus?.entries.find((entry) => entry.label === column)?.value ?? ""
                return <td key={`${column}:${index}`} className="px-4 py-2.5">{value ? <span className="whitespace-pre-line">{value}</span> : <span className="text-muted-foreground/60">—</span>}</td>
              })}
            </tr>
          })}
        </tbody>
      </table>
    </div>}
  </section>
}
