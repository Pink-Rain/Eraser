"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { ExternalLink, LoaderCircle, Plus, RefreshCw } from "lucide-react"

import { SheetGrid, type SheetGridColumn } from "@/components/eraser/sheet-grid"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { RankBonusTable } from "@/lib/class-content"

type LoadedRankBonuses = RankBonusTable & { canEdit?: boolean }

async function fetchRankBonuses(refresh: boolean) {
  const response = await fetch(`/api/classes/rank-bonuses?create=1${refresh ? "&refresh=1" : ""}`, { cache: "no-store" })
  const payload = await response.json() as LoadedRankBonuses & { error?: string }
  if (!response.ok) throw new Error(payload.error || "Chargement impossible.")
  return payload
}

/**
 * Onglet « Bonus Rang » : les bonus gagnés à chaque rang, communs à toutes les
 * classes, dans le tableau des index. Ils vivent dans l'onglet « Bonus de rang » du
 * classeur des sorts (créé à la première ouverture) ; une case s'écrit d'ici ou de
 * Google Sheets, et « Colonne » ajoute une sorte de bonus.
 */
export function RankBonusTab() {
  const [table, setTable] = useState<LoadedRankBonuses | null>(null)
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

  const columns = useMemo(() => table?.headers.slice(1).filter(Boolean) ?? [], [table])
  const byRank = useMemo(() => new Map((table?.bonuses ?? []).map((bonus) => [bonus.rank, bonus])), [table])
  const filled = (table?.bonuses ?? []).filter((bonus) => bonus.entries.length).length
  const canEdit = Boolean(table?.canEdit)
  const [version, setVersion] = useState(0)
  const [newColumn, setNewColumn] = useState("")

  const valueOf = useCallback((rowKey: string, columnKey: string) => {
    const rank = Number(rowKey)
    if (columnKey === "__rank") return `Rang ${rank}`
    return byRank.get(rank)?.entries.find((entry) => entry.label === columnKey)?.value ?? ""
  }, [byRank])

  async function save(rank: number, column: string, value: string) {
    setError("")
    try {
      const response = await fetch("/api/classes/rank-bonuses", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ rank, column, value }) })
      const payload = await response.json() as LoadedRankBonuses & { error?: string }
      if (!response.ok) throw new Error(payload.error || "Enregistrement impossible.")
      setTable(payload)
      return true
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Enregistrement impossible.")
      setVersion((current) => current + 1)
      return false
    }
  }

  async function addColumn() {
    const label = newColumn.replace(/\s+/g, " ").trim()
    if (!label) return
    if (await save(1, label, "")) { setNewColumn(""); setVersion((current) => current + 1) }
  }

  const gridColumns = useMemo<SheetGridColumn[]>(() => [
    { key: "__rank", label: "Rang", width: 110, plain: true, computed: true, control: (rowKey: string) => <span className="flex min-h-8 items-center px-2 font-semibold">Rang {rowKey}</span>, typeLabel: "Rang", description: "Les rangs 1 à 20, communs à toutes les classes.", sortKey: (value) => Number(value.replace(/\D/g, "")) || 0 },
    ...(columns.length ? columns : ["Bonus"]).map((column) => ({ key: column, label: column, width: 260, plain: true, typeLabel: "Texte", description: "Affiché sous chaque rang dans Règles › Classe et sur la fiche de personnage." })),
  ], [columns])
  const rows = useMemo(() => Array.from({ length: 20 }, (_, index) => ({ key: String(index + 1), rowNumber: index + 1 })), [])

  return <section className="space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-card/75 px-4 py-3">
      <div>
        <p className="font-display text-lg font-semibold">Bonus gagnés à chaque rang</p>
        <p className="text-xs text-muted-foreground">Les mêmes pour toutes les classes. Ils s’affichent sous chaque rang dans Règles › Classe et sur la fiche de personnage. {table?.exists ? `${filled} rang${filled > 1 ? "s" : ""} sur 20 renseigné${filled > 1 ? "s" : ""}.` : ""}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {canEdit && table?.exists && <form className="flex gap-1.5" onSubmit={(event) => { event.preventDefault(); void addColumn() }}>
          <Input value={newColumn} onChange={(event) => setNewColumn(event.target.value)} placeholder="Nouvelle colonne de bonus" className="h-8 w-52 text-sm" />
          <Button type="submit" variant="outline" size="sm" disabled={!newColumn.trim()}><Plus />Colonne</Button>
        </form>}
        <Button type="button" variant="outline" size="sm" disabled={loading} onClick={() => void load(true)}>{loading ? <LoaderCircle className="animate-spin" /> : <RefreshCw />}Actualiser</Button>
        {table?.sheetUrl && <Button asChild variant="outline" size="sm"><a href={table.sheetUrl} target="_blank" rel="noreferrer">Ouvrir dans Sheets<ExternalLink /></a></Button>}
      </div>
    </div>
    {error && <p className="rounded-xl border border-destructive/25 bg-destructive/5 px-4 py-2.5 text-sm text-destructive">{error}</p>}
    {table && !table.exists && <p className="rounded-xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">L’onglet « Bonus de rang » n’existe pas encore dans le classeur des sorts.</p>}
    {table?.exists && <SheetGrid
      layoutKey="eraser:rank-bonus:grid"
      columns={gridColumns}
      rows={rows}
      valueOf={valueOf}
      onCommit={(rowKey, columnKey, value) => { if (columnKey !== "__rank") void save(Number(rowKey), columnKey, value) }}
      readOnly={!canEdit}
      version={version}
      empty="Aucun rang."
    />}
  </section>
}
