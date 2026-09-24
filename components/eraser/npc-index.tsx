"use client"

import { memo, useCallback, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { Download, LoaderCircle, Plus, Search } from "lucide-react"

import { SheetGrid, type SheetGridColumn, type SheetGridSort } from "@/components/eraser/sheet-grid"
import { blankNpc, ImportNpcsDialog, importNpcs, NpcForm, PeopleSelect, persistNpcs, uploadNpcPortrait } from "@/components/eraser/npc-manager"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { usePersistentState } from "@/hooks/use-persistent-state"
import { foldNpcName, genericNpcIndexPage, isNpcLibraryPage, npcIndexPage, npcIndexTabs } from "@/lib/npc-pages"
import type { CampaignNpcRecord, ReusablePageOption } from "@/lib/shop-schema"

/** Une campagne où figure un PNJ du même nom, et le mode dans lequel elle s'ouvre. */
export type NpcCampaignLink = { id: string; name: string; manage: boolean }

/** La page où vit un PNJ, et si ce MJ peut le modifier depuis l'index. */
export type NpcPageLink = NpcCampaignLink & { editable: boolean }

/** Les PNJs génériques ont leur onglet ; tous les autres, campagnes comprises, sont dans « PNJs ». */
function tabOf(npc: CampaignNpcRecord) {
  return npc.pageLinked === genericNpcIndexPage ? genericNpcIndexPage : npcIndexPage
}

function groupByPage(npcs: CampaignNpcRecord[]) {
  const groups = new Map<string, CampaignNpcRecord[]>()
  for (const npc of npcs) groups.set(npc.pageLinked, [...(groups.get(npc.pageLinked) ?? []), npc])
  return groups
}

/** Les colonnes du tableau ; le reste de la fiche s'ouvre d'un clic sur le nom. */
const fields = [
  { key: "name", label: "Nom", width: 240 },
  { key: "title", label: "Titre", width: 190 },
  { key: "people", label: "Peuple", width: 210 },
  { key: "occupation", label: "Fonction / classe / métier", width: 240 },
  { key: "campaigns", label: "Campagnes", width: 260 },
  { key: "important", label: "Important", width: 110 },
] as const

type TextField = "name" | "title" | "people" | "occupation"

const textFields = new Set<string>(["name", "title", "people", "occupation"])

function isValidSort(value: unknown): value is SheetGridSort {
  if (value === null) return true
  if (!value || typeof value !== "object") return false
  const candidate = value as { column?: unknown; direction?: unknown }
  return typeof candidate.column === "string" && (candidate.direction === "asc" || candidate.direction === "desc")
}

function isTab(value: unknown): value is string {
  return typeof value === "string" && npcIndexTabs.some((tab) => tab.id === value)
}

/** Les campagnes d'un PNJ, chacune cliquable : en mode MJ si on la mène, en mode joueur sinon. */
const CampaignLinks = memo(function CampaignLinks({ links }: { links: NpcCampaignLink[] }) {
  if (!links.length) return <span className="flex min-h-8 items-center px-2 text-xs text-muted-foreground">—</span>
  return <span className="flex min-h-8 flex-wrap items-center gap-1 px-1.5 py-1">
    {links.map((campaign) => <Link
      key={campaign.id}
      href={campaign.id === "bac-a-sable" ? "/bac-a-sable/pnjs" : `/campagne/${encodeURIComponent(campaign.id)}`}
      title={campaign.manage ? "Ouvrir en mode MJ" : "Ouvrir en mode joueur"}
      className={`rounded-full border px-2 py-0.5 text-xs font-medium hover:bg-primary hover:text-primary-foreground ${campaign.manage ? "border-primary/40 text-primary" : "text-muted-foreground"}`}
    >{campaign.name}</Link>)}
  </span>
})

const ImportantCell = memo(function ImportantCell({ checked, disabled, onChange }: { checked: boolean; disabled: boolean; onChange: (checked: boolean) => void }) {
  const [shown, setShown] = useState<boolean | null>(null)
  return <span className="flex min-h-8 items-center justify-center">
    <Checkbox aria-label="Important" checked={shown ?? checked} disabled={disabled} onCheckedChange={(next) => { setShown(next === true); onChange(next === true) }} />
  </span>
})

/**
 * L'Index des PNJs : tous les PNJ, rangés dans la feuille « PNJs ». L'onglet « PNJs »
 * réunit la bibliothèque, le bac à sable et chaque campagne ; « PNJs Génériques » garde
 * les siens. La colonne Campagnes montre la campagne d'un PNJ de campagne, et pour un
 * PNJ de la bibliothèque les campagnes où figure un PNJ du même nom.
 *
 * Les notes MJ, la vie actuelle et le sac à dos n'existent que dans la campagne : ils ne
 * sont ni affichés ni envoyés ici, et l'enregistrement depuis l'index ne les touche pas.
 * Un PNJ d'une campagne que ce MJ ne mène pas se consulte sans se modifier.
 */
export function NpcIndex({ initialNpcs, sourcePages, campaignsByName, pages }: {
  initialNpcs: CampaignNpcRecord[]
  sourcePages: ReusablePageOption[]
  campaignsByName: Record<string, NpcCampaignLink[]>
  pages: Record<string, NpcPageLink>
}) {
  const [npcs, setNpcs] = useState(initialNpcs)
  const [tab, setTab] = usePersistentState<string>("eraser:npc-index:tab", npcIndexTabs[0].id, isTab)
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

  const campaignsOf = useCallback((npc: CampaignNpcRecord | undefined) => {
    if (!npc) return []
    if (isNpcLibraryPage(npc.pageLinked) && npc.pageLinked !== "bac-a-sable") return campaignsByName[foldNpcName(npc.name)] ?? []
    const page = pages[npc.pageLinked]
    return page ? [page] : []
  }, [campaignsByName, pages])
  const editable = useCallback((npc: CampaignNpcRecord | undefined) => Boolean(npc && (pages[npc.pageLinked]?.editable ?? true)), [pages])
  const lockedMessage = useCallback((npc: CampaignNpcRecord) => `${npc.name} appartient à la campagne « ${pages[npc.pageLinked]?.name ?? "?"} », que tu ne mènes pas : il se consulte ici sans se modifier.`, [pages])

  /** Enregistre des PNJ reçus du serveur ; `after` place les nouveaux sous cette ligne. */
  const replace = useCallback((saved: CampaignNpcRecord[], remount = false, after?: string) => {
    for (const npc of saved) latest.current.set(npc.id, npc)
    setNpcs((current) => {
      const byId = new Map(saved.map((npc) => [npc.id, npc]))
      const kept = current.map((npc) => byId.get(npc.id) ?? npc)
      const added = saved.filter((npc) => !current.some((item) => item.id === npc.id))
      if (!added.length) return kept
      const position = after ? kept.findIndex((npc) => npc.id === after) : -1
      return position < 0 ? [...added, ...kept] : [...kept.slice(0, position + 1), ...added, ...kept.slice(position + 1)]
    })
    if (remount) setVersion((current) => current + 1)
  }, [])

  const valueOf = useCallback((rowKey: string, columnKey: string) => {
    const npc = latest.current.get(rowKey)
    if (!npc) return ""
    if (columnKey === "campaigns") return campaignsOf(npc).map((campaign) => campaign.name).join(", ")
    if (columnKey === "important") return npc.important ? "Oui" : "Non"
    return textFields.has(columnKey) ? npc[columnKey as TextField] : ""
  }, [campaignsOf])

  const rows = useMemo(() => {
    const folded = foldNpcName(query)
    const filtered = npcs.filter((npc) => tabOf(npc) === tab && (!folded || foldNpcName(`${npc.name} ${npc.title} ${npc.people} ${npc.occupation}`).includes(folded)))
    const plain = (npc: CampaignNpcRecord, column: string) => column === "campaigns" ? campaignsOf(npc).map((campaign) => campaign.name).join(", ") : column === "important" ? (npc.important ? "Oui" : "Non") : textFields.has(column) ? npc[column as TextField] : ""
    const sorted = sort
      ? [...filtered].sort((left, right) => plain(left, sort.column).localeCompare(plain(right, sort.column), "fr", { sensitivity: "base", numeric: true }) * (sort.direction === "asc" ? 1 : -1))
      : filtered
    return sorted.map((npc, index) => ({ key: npc.id, rowNumber: index + 1 }))
  }, [campaignsOf, npcs, query, sort, tab])

  const save = useCallback(async (next: CampaignNpcRecord, remount: boolean) => {
    latest.current.set(next.id, next)
    setSaving((current) => current + 1)
    try {
      replace(await persistNpcs("save-index", next.pageLinked, [next]), remount)
      setError("")
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Enregistrement impossible.")
    }
    setSaving((current) => current - 1)
  }, [replace])

  const commit = useCallback(async (rowKey: string, columnKey: string, value: string) => {
    const npc = latest.current.get(rowKey)
    if (!npc) return
    if (!editable(npc)) {
      setError(lockedMessage(npc))
      setVersion((current) => current + 1)
      return
    }
    if (columnKey === "important") return save({ ...npc, important: /^(oui|vrai|true|x|1)$/i.test(value.trim()) }, false)
    if (!textFields.has(columnKey)) return
    const next = { ...npc, [columnKey]: value.trim() }
    if (columnKey === "name" && !next.name) return
    // Une liste déroulante n'est pas une cellule de texte : sa ligne est redessinée.
    await save(next, columnKey === "people" || columnKey === "name")
  }, [editable, lockedMessage, save])

  const columns = useMemo<SheetGridColumn[]>(() => fields.map((field) => {
    const column: SheetGridColumn = { key: field.key, label: field.label, width: field.width, plain: true, cellClassName: field.key === "name" ? "font-semibold" : undefined }
    if (field.key === "name") column.control = (rowKey) => <button
      type="button"
      onClick={() => { const npc = latest.current.get(rowKey); if (npc) setEditing(npc) }}
      className="flex min-h-8 w-full items-center rounded-md px-2 py-1.5 text-left font-semibold hover:bg-muted hover:text-primary hover:underline"
      title="Ouvrir la fiche"
    >{valueOf(rowKey, "name") || <span className="font-normal italic text-muted-foreground">Sans nom</span>}</button>
    if (field.key === "people") column.control = (rowKey) => <PeopleSelect compact disabled={!editable(latest.current.get(rowKey))} value={valueOf(rowKey, "people")} onChange={(value) => void commit(rowKey, "people", value)} />
    if (field.key === "campaigns") column.control = (rowKey) => <CampaignLinks links={campaignsOf(latest.current.get(rowKey))} />
    if (field.key === "important") column.control = (rowKey) => <ImportantCell checked={latest.current.get(rowKey)?.important ?? false} disabled={pending || !editable(latest.current.get(rowKey))} onChange={(checked) => void commit(rowKey, "important", checked ? "Oui" : "Non")} />
    return column
  }), [campaignsOf, commit, editable, pending, valueOf])

  async function run(task: () => Promise<void>) {
    setPending(true); setError("")
    try { await task() } catch (reason) { setError(reason instanceof Error ? reason.message : "Enregistrement impossible.") }
    setPending(false)
  }

  function saveSheet(npc: CampaignNpcRecord, portrait?: File) {
    void run(async () => {
      const [saved] = await persistNpcs("save-index", npc.pageLinked, [npc])
      replace([portrait ? await uploadNpcPortrait(saved.id, portrait) : saved], true)
      setEditing(null)
    })
  }

  function insertRows(rowKey: string, count: number) {
    void run(async () => {
      // Un PNJ a besoin d'un nom : les lignes arrivent en « Nouveau PNJ », à renommer.
      const created = Array.from({ length: count }, () => ({ ...blankNpc(tab), name: "Nouveau PNJ" }))
      replace(await persistNpcs("save", tab, created), true, rowKey)
    })
  }

  function duplicate(ids: string[]) {
    void run(async () => {
      // Une copie arrive toujours dans l'onglet ouvert : depuis une campagne, c'est une
      // récupération (portrait et sac à dos compris) vers la bibliothèque.
      const targets = ids.flatMap((id) => latest.current.get(id) ?? [])
      for (const [page, group] of groupByPage(targets)) {
        const npcIds = group.map((npc) => npc.id)
        if (page === tab) {
          const response = await fetch("/api/npcs", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "duplicate", pageLinked: tab, npcIds }) })
          const payload = (await response.json().catch(() => ({}))) as { npcs?: CampaignNpcRecord[]; error?: string }
          if (!response.ok) throw new Error(payload.error || "Duplication impossible.")
          replace(payload.npcs ?? [], true, ids.at(-1))
        } else {
          replace(await importNpcs(tab, page, npcIds, "copy"), true, ids.at(-1))
        }
      }
    })
  }

  function remove(ids: string[]) {
    void run(async () => {
      const targets = ids.flatMap((id) => latest.current.get(id) ?? [])
      const locked = targets.find((npc) => !editable(npc))
      if (locked) throw new Error(lockedMessage(locked))
      if (!targets.length) return
      for (const [page, group] of groupByPage(targets)) await persistNpcs("delete", page, group)
      for (const id of ids) latest.current.delete(id)
      setNpcs((current) => current.filter((npc) => !ids.includes(npc.id)))
      setVersion((current) => current + 1)
    })
  }

  const tabSources = [...npcIndexTabs.filter((candidate) => candidate.id !== tab).map((candidate) => ({ id: candidate.id, name: `Index des PNJs · ${candidate.label}` })), ...sourcePages]
  const count = (id: string) => npcs.filter((npc) => tabOf(npc) === id).length

  return <section className="mt-4 flex flex-col gap-3">
    <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
      <div role="tablist" aria-label="Onglets" className="flex gap-1 self-start rounded-xl border bg-card/70 p-1">
        {npcIndexTabs.map((candidate) => <button
          key={candidate.id}
          type="button"
          role="tab"
          aria-selected={candidate.id === tab}
          onClick={() => { setTab(candidate.id); setEditing(null) }}
          className={`rounded-lg px-4 py-1.5 text-sm font-medium transition-colors ${candidate.id === tab ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
        >{candidate.label}<span className="ml-1.5 text-xs opacity-70">{count(candidate.id)}</span></button>)}
      </div>
      <div className="relative min-w-0 lg:max-w-sm lg:flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Rechercher un PNJ…" className="pl-9" /></div>
      <div className="flex flex-wrap gap-2 lg:ml-auto">
        <Button type="button" variant="outline" onClick={() => setImporting(true)} disabled={pending}><Download />Récupérer</Button>
        <Button type="button" onClick={() => setEditing(blankNpc(tab))} disabled={pending}><Plus />Créer un PNJ</Button>
      </div>
    </div>

    {error && <p className="rounded-xl border border-destructive/25 bg-destructive/5 px-4 py-2.5 text-sm text-destructive">{error}</p>}

    <SheetGrid
      layoutKey={`eraser:npc-index:grid:${tab}`}
      columns={columns}
      rows={rows}
      valueOf={valueOf}
      onCommit={(rowKey, columnKey, value) => void commit(rowKey, columnKey, value)}
      sort={sort}
      onSort={setSort}
      disabled={pending}
      version={version}
      addRowLabel="Créer un PNJ"
      rowCommands={{ append: () => setEditing(blankNpc(tab)), insertRows, duplicate, remove }}
      toolbarTrailing={saving > 0 ? <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground"><LoaderCircle className="size-3 animate-spin" />Enregistrement…</span> : null}
      empty={npcs.some((npc) => tabOf(npc) === tab) ? "Aucun PNJ ne correspond à la recherche." : "Cet onglet est vide. Crée un PNJ ou récupère ceux d’une campagne."}
    />

    <Dialog open={Boolean(editing)} onOpenChange={(open) => { if (!open && !pending) setEditing(null) }}>
      {editing && <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-5xl">
        <DialogHeader><DialogTitle className="font-display text-3xl">{editing.createdAt ? editing.name : "Créer un PNJ"}</DialogTitle></DialogHeader>
        {!editable(editing) && <p className="rounded-xl border border-amber-400/40 bg-amber-50 px-4 py-3 text-sm text-amber-900">{lockedMessage(editing)}</p>}
        <NpcForm index key={editing.id} npc={editing} pending={pending} locked={!editable(editing)} onClose={() => setEditing(null)} onSave={saveSheet} />
      </DialogContent>}
    </Dialog>

    <ImportNpcsDialog key={tab} open={importing} sourcePages={tabSources} pending={pending} onClose={() => setImporting(false)} onImport={(source, ids, transferMode) => void run(async () => {
      replace(await importNpcs(tab, source, ids, transferMode), true)
      if (transferMode === "move") {
        // Un déplacement depuis l'autre onglet l'y retire.
        setNpcs((current) => current.filter((npc) => npc.pageLinked !== source || !ids.includes(npc.id)))
        for (const id of ids) latest.current.delete(id)
      }
      setImporting(false)
    })} />
  </section>
}
