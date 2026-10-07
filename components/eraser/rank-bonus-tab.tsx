"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { ExternalLink, FileText, LoaderCircle, Plus, RefreshCw } from "lucide-react"

import { IndexRowSheet, type RowSheetField } from "@/components/eraser/index-row-sheet"
import { SheetGrid, type SheetGridColumn } from "@/components/eraser/sheet-grid"
import { ContextMenuItem, ContextMenuSeparator } from "@/components/ui/context-menu"
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
// Le dernier tableau lu : changer d'onglet puis revenir le montre aussitôt, relu derrière.
let knownTable: LoadedRankBonuses | null = null

export function RankBonusTab() {
  const [table, setShownTable] = useState<LoadedRankBonuses | null>(() => knownTable)
  const setTable = useCallback((next: LoadedRankBonuses) => { knownTable = next; setShownTable(next) }, [])
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
      .then((payload) => { knownTable = payload; if (active) setShownTable(payload) })
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
  // Le rang ouvert dans sa fiche (le formulaire des index), et ce qui l'a fait refuser.
  const [openRank, setOpenRank] = useState<string | null>(null)
  const [sheetError, setSheetError] = useState("")
  const lastError = useRef("")

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
      lastError.current = reason instanceof Error ? reason.message : "Enregistrement impossible."
      setError(lastError.current)
      setVersion((current) => current + 1)
      return false
    }
  }

  async function addColumn() {
    const label = newColumn.replace(/\s+/g, " ").trim()
    if (!label) return
    if (await save(1, label, "")) { setNewColumn(""); setVersion((current) => current + 1) }
  }

  /** Les bonus d'un rang, enregistrés d'eux-mêmes par sa fiche, colonne par colonne. */
  async function saveSheet(rowKey: string, changes: Record<string, string>) {
    setSheetError("")
    for (const [column, value] of Object.entries(changes)) {
      lastError.current = ""
      if (!(await save(Number(rowKey), column, value))) {
        const message = lastError.current || "Ce bonus n’a pas pu être enregistré dans Google Sheets."
        setSheetError(message)
        throw new Error(message)
      }
    }
    // Le tableau derrière la fiche montre aussitôt ce qui vient d'être écrit.
    setVersion((current) => current + 1)
  }

  const sheetFields: RowSheetField[] = openRank === null ? [] : (columns.length ? columns : ["Bonus"]).map((column) => ({
    key: column,
    label: column,
    // Écrit tel quel dans Sheets : un champ de texte simple, sans mise en forme.
    spec: { kind: "fixed", readOnly: !canEdit },
    value: valueOf(openRank, column),
    long: true,
  }))

  const gridColumns = useMemo<SheetGridColumn[]>(() => [
    { key: "__rank", label: "Rang", width: 110, plain: true, computed: true, control: (rowKey: string) => <button type="button" onClick={() => { setSheetError(""); setOpenRank(rowKey) }} className="flex min-h-8 w-full items-center px-2 text-left font-semibold underline-offset-4 hover:text-primary hover:underline" title="Ouvrir la fiche du rang">Rang {rowKey}</button>, typeLabel: "Rang", description: "Les rangs 1 à 20, communs à toutes les classes.", sortKey: (value) => Number(value.replace(/\D/g, "")) || 0 },
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
      rowMenuExtras={(rowKey) => <>
        <ContextMenuSeparator />
        <ContextMenuItem onSelect={() => { setSheetError(""); setOpenRank(rowKey) }}><FileText />Ouvrir la fiche</ContextMenuItem>
      </>}
    />}
    {openRank !== null && <IndexRowSheet
      open
      rowKey={openRank}
      title={`Rang ${openRank}`}
      subtitle="Bonus de rang · communs à toutes les classes"
      fields={sheetFields}
      error={sheetError}
      navigation={{ rows: rows.map((row) => row.key), labelOf: (key) => `Rang ${key}`, onGo: (key) => { setSheetError(""); setOpenRank(key) } }}
      onSave={saveSheet}
      onClose={() => { setOpenRank(null); setSheetError("") }}
    />}
  </section>
}
