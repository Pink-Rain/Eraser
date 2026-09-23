"use client"

import { useCallback, useMemo, useRef, useState } from "react"
import { Download, LoaderCircle, Plus, Search } from "lucide-react"

import { SheetGrid, type SheetGridColumn, type SheetGridSort } from "@/components/eraser/sheet-grid"
import { blankNpc, ImportNpcsDialog, importNpcs, NpcForm, PeopleSelect, persistNpcs, uploadNpcPortrait } from "@/components/eraser/npc-manager"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { usePersistentState } from "@/hooks/use-persistent-state"
import { npcIndexPage } from "@/lib/npc-pages"
import type { CampaignNpcRecord, ReusablePageOption } from "@/lib/shop-schema"

/** Les colonnes du tableau ; le reste de la fiche s'ouvre d'un clic sur le nom. */
const fields = [
  { key: "name", label: "Nom", width: 240 },
  { key: "title", label: "Titre", width: 200 },
  { key: "people", label: "Peuple", width: 220 },
  { key: "occupation", label: "Fonction / classe / métier", width: 260 },
] as const

type FieldKey = (typeof fields)[number]["key"]

function isValidSort(value: unknown): value is SheetGridSort {
  if (value === null) return true
  if (!value || typeof value !== "object") return false
  const candidate = value as { column?: unknown; direction?: unknown }
  return typeof candidate.column === "string" && (candidate.direction === "asc" || candidate.direction === "desc")
}

/**
 * L'Index des PNJ : une bibliothèque de PNJ hors de toute campagne, rangée dans la
 * feuille « PNJs » comme les autres. Une campagne ou le bac à sable y récupère ceux dont
 * elle a besoin, et inversement.
 */
export function NpcIndex({ initialNpcs, sourcePages }: { initialNpcs: CampaignNpcRecord[]; sourcePages: ReusablePageOption[] }) {
  const [npcs, setNpcs] = useState(initialNpcs)
  const [editing, setEditing] = useState<CampaignNpcRecord | null>(null)
  const [importing, setImporting] = useState(false)
  const [pending, setPending] = useState(false)
  const [saving, setSaving] = useState(0)
  const [error, setError] = useState("")
  const [query, setQuery] = useState("")
  const [version, setVersion] = useState(0)
  const [sort, setSort] = usePersistentState<SheetGridSort>("eraser:npc-index:sort", null, isValidSort)
  // Dernière version connue de chaque PNJ : deux cellules enregistrées coup sur coup
  // partent chacune de la précédente, sans effacer l'autre.
  const latest = useRef(new Map(initialNpcs.map((npc) => [npc.id, npc])))

  const replace = useCallback((saved: CampaignNpcRecord[], remount = false) => {
    for (const npc of saved) latest.current.set(npc.id, npc)
    setNpcs((current) => {
      const byId = new Map(saved.map((npc) => [npc.id, npc]))
      const kept = current.map((npc) => byId.get(npc.id) ?? npc)
      const added = saved.filter((npc) => !current.some((item) => item.id === npc.id))
      return [...added, ...kept]
    })
    if (remount) setVersion((current) => current + 1)
  }, [])

  const rows = useMemo(() => {
    const folded = query.trim().toLocaleLowerCase("fr")
    const filtered = npcs.filter((npc) => !folded || `${npc.name} ${npc.title} ${npc.people} ${npc.occupation}`.toLocaleLowerCase("fr").includes(folded))
    const sorted = sort
      ? [...filtered].sort((left, right) => String(left[sort.column as FieldKey] ?? "").localeCompare(String(right[sort.column as FieldKey] ?? ""), "fr", { sensitivity: "base", numeric: true }) * (sort.direction === "asc" ? 1 : -1))
      : filtered
    return sorted.map((npc, index) => ({ key: npc.id, rowNumber: index + 1 }))
  }, [npcs, query, sort])

  const valueOf = useCallback((rowKey: string, columnKey: string) => {
    const npc = latest.current.get(rowKey)
    return npc ? String(npc[columnKey as FieldKey] ?? "") : ""
  }, [])

  const commit = useCallback(async (rowKey: string, columnKey: string, value: string) => {
    const npc = latest.current.get(rowKey)
    if (!npc || !fields.some((field) => field.key === columnKey)) return
    const next = { ...npc, [columnKey]: value.trim() }
    if (columnKey === "name" && !next.name) return
    latest.current.set(rowKey, next)
    setSaving((current) => current + 1)
    try {
      // Une liste déroulante n'est pas une cellule de texte : sa ligne est redessinée.
      replace(await persistNpcs("save", npcIndexPage, [next]), columnKey === "people")
      setError("")
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Enregistrement impossible.")
    }
    setSaving((current) => current - 1)
  }, [replace])

  const columns = useMemo<SheetGridColumn[]>(() => fields.map((field) => {
    const column: SheetGridColumn = { key: field.key, label: field.label, width: field.width, plain: true, cellClassName: field.key === "name" ? "font-semibold" : undefined }
    if (field.key === "name") column.control = (rowKey) => <button
      type="button"
      onClick={() => { const npc = latest.current.get(rowKey); if (npc) setEditing(npc) }}
      className="flex min-h-8 w-full items-center rounded-md px-2 py-1.5 text-left font-semibold hover:bg-muted hover:text-primary hover:underline"
      title="Ouvrir la fiche"
    >{valueOf(rowKey, "name") || <span className="font-normal italic text-muted-foreground">Sans nom</span>}</button>
    if (field.key === "people") column.control = (rowKey) => <PeopleSelect compact value={valueOf(rowKey, "people")} onChange={(value) => void commit(rowKey, "people", value)} />
    return column
  }), [commit, valueOf])

  async function run(task: () => Promise<void>) {
    setPending(true); setError("")
    try { await task() } catch (reason) { setError(reason instanceof Error ? reason.message : "Enregistrement impossible.") }
    setPending(false)
  }

  function save(npc: CampaignNpcRecord, portrait?: File) {
    void run(async () => {
      const [saved] = await persistNpcs("save", npcIndexPage, [npc])
      replace([portrait ? await uploadNpcPortrait(saved.id, portrait) : saved], true)
      setEditing(null)
    })
  }

  function duplicate(ids: string[]) {
    void run(async () => {
      const response = await fetch("/api/npcs", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "duplicate", pageLinked: npcIndexPage, npcIds: ids }) })
      const payload = (await response.json().catch(() => ({}))) as { npcs?: CampaignNpcRecord[]; error?: string }
      if (!response.ok) throw new Error(payload.error || "Duplication impossible.")
      replace(payload.npcs ?? [], true)
    })
  }

  function remove(ids: string[]) {
    void run(async () => {
      const targets = ids.flatMap((id) => latest.current.get(id) ?? [])
      if (!targets.length) return
      await persistNpcs("delete", npcIndexPage, targets)
      for (const id of ids) latest.current.delete(id)
      setNpcs((current) => current.filter((npc) => !ids.includes(npc.id)))
      setVersion((current) => current + 1)
    })
  }

  return <section className="mt-4 flex flex-col gap-3">
    <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
      <div className="relative min-w-0 lg:max-w-sm lg:flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Rechercher un PNJ…" className="pl-9" /></div>
      <div className="flex flex-wrap gap-2 lg:ml-auto">
        {sourcePages.length > 0 && <Button type="button" variant="outline" onClick={() => setImporting(true)} disabled={pending}><Download />Récupérer</Button>}
        <Button type="button" onClick={() => setEditing(blankNpc(npcIndexPage))} disabled={pending}><Plus />Créer un PNJ</Button>
      </div>
    </div>

    {error && <p className="rounded-xl border border-destructive/25 bg-destructive/5 px-4 py-2.5 text-sm text-destructive">{error}</p>}

    <SheetGrid
      layoutKey="eraser:npc-index:grid"
      columns={columns}
      rows={rows}
      valueOf={valueOf}
      onCommit={(rowKey, columnKey, value) => void commit(rowKey, columnKey, value)}
      sort={sort}
      onSort={setSort}
      disabled={pending}
      version={version}
      addRowLabel="Créer un PNJ"
      rowCommands={{ append: () => setEditing(blankNpc(npcIndexPage)), duplicate, remove }}
      toolbarTrailing={saving > 0 ? <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground"><LoaderCircle className="size-3 animate-spin" />Enregistrement…</span> : null}
      empty={npcs.length ? "Aucun PNJ ne correspond à la recherche." : "L’index est vide. Crée un PNJ ou récupère ceux d’une campagne."}
    />

    <Dialog open={Boolean(editing)} onOpenChange={(open) => { if (!open && !pending) setEditing(null) }}>
      {editing && <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-5xl">
        <DialogHeader><DialogTitle className="font-display text-3xl">{editing.createdAt ? editing.name : "Créer un PNJ"}</DialogTitle></DialogHeader>
        <NpcForm key={editing.id} npc={editing} pending={pending} onClose={() => setEditing(null)} onSave={save} />
      </DialogContent>}
    </Dialog>

    <ImportNpcsDialog open={importing} sourcePages={sourcePages} pending={pending} onClose={() => setImporting(false)} onImport={(source, ids, transferMode) => void run(async () => {
      replace(await importNpcs(npcIndexPage, source, ids, transferMode), true)
      setImporting(false)
    })} />
  </section>
}
