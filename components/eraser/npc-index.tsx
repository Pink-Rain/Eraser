"use client"

import { useCallback, useMemo, useRef, useState } from "react"
import { useRememberedSearch } from "@/hooks/use-remembered-search"
import { Download, LoaderCircle, Plus, Search } from "lucide-react"

import { ensureWorldIndexName, indexGridColumn, type AutoLink } from "@/components/eraser/index-cells"
import { ReadOnlyIndexEditorButton } from "@/components/eraser/index-editor"
import { npcEditorModel } from "@/lib/system-index-models"
import { SheetGrid, type SheetGridColumn, type SheetGridSort } from "@/components/eraser/sheet-grid"
import { blankNpc, ImportNpcsDialog, importNpcs, NpcForm, npcPeopleSource, persistNpcs, uploadNpcPortrait } from "@/components/eraser/npc-manager"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { usePersistentState } from "@/hooks/use-persistent-state"
import { compactRichText, isCheckedValue, type IndexColumnSpec } from "@/lib/index-columns"
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

/**
 * Les colonnes du tableau et leur type ; le reste de la fiche (portrait, notes,
 * caractéristiques) s'ouvre d'un clic sur le nom.
 */
const fields: Array<{ key: string; label: string; width: number; spec: IndexColumnSpec }> = [
  { key: "name", label: "Nom", width: 240, spec: { kind: "name-form", also: ["fixed"] } },
  { key: "title", label: "Titre", width: 190, spec: { kind: "rich" } },
  { key: "people", label: "Peuple", width: 210, spec: { kind: "linked-choice", source: npcPeopleSource } },
  { key: "occupation", label: "Fonction / classe / métier", width: 240, spec: { kind: "rich" } },
  { key: "campaigns", label: "Campagnes", width: 260, spec: { kind: "auto-links" } },
  { key: "important", label: "Important", width: 110, spec: { kind: "checkbox" } },
  { key: "id", label: "ID", width: 150, spec: { kind: "id", hidden: true } },
]

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
  const [query, setQuery] = useRememberedSearch()
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
    if (columnKey === "id") return npc.id
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
    if (columnKey === "important") return save({ ...npc, important: isCheckedValue(value) }, false)
    if (!textFields.has(columnKey)) return
    // Titre et fonction sont du texte enrichi ; sans mise en forme, ils restent du texte simple.
    const next = { ...npc, [columnKey]: columnKey === "title" || columnKey === "occupation" ? compactRichText(value) : value.replace(/<[^>]+>/g, "").trim() }
    if (columnKey === "name" && !next.name) return
    // Liste liée : un peuple absent de l'Index des peuples y est créé (collage compris).
    if (columnKey === "people" && next.people) void ensureWorldIndexName(npcPeopleSource, next.people).catch((reason) => setError(reason instanceof Error ? reason.message : "Le peuple n’a pas pu être ajouté à l’index."))
    // Une liste déroulante n'est pas une cellule de texte : sa ligne est redessinée.
    await save(next, columnKey === "people" || columnKey === "name")
  }, [editable, lockedMessage, save])

  // Liens automatiques : la campagne d'un PNJ de campagne, ou pour un PNJ de la
  // bibliothèque les campagnes où figure un PNJ du même nom (mode MJ si on la mène).
  const autoLinks = useCallback((rowKey: string): AutoLink[] => campaignsOf(latest.current.get(rowKey)).map((campaign) => ({
    label: campaign.name,
    href: campaign.id === "bac-a-sable" ? "/bac-a-sable/pnjs" : `/campagne/${encodeURIComponent(campaign.id)}`,
    emphasis: campaign.manage,
    title: campaign.manage ? "Ouvrir en mode MJ" : "Ouvrir en mode joueur",
  })), [campaignsOf])

  /* eslint-disable react-hooks/refs -- les cellules ne lisent ces valeurs qu'en se dessinant, comme avant : indexGridColumn ne fait que les ranger dans la colonne */
  const columns = useMemo<SheetGridColumn[]>(() => {
    const context = {
      valueOf,
      commit: (rowKey: string, columnKey: string, value: string) => void commit(rowKey, columnKey, value),
      disabled: pending,
      lockedRow: (rowKey: string) => !editable(latest.current.get(rowKey)),
      openForm: (rowKey: string) => { const npc = latest.current.get(rowKey); if (npc) setEditing(npc) },
      autoLinks,
    }
    return fields.map((field) => indexGridColumn(field.key, field.label, field.spec, field.width, context))
  }, [autoLinks, commit, editable, pending, valueOf])
  /* eslint-enable react-hooks/refs */

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

  const tabSources = [...npcIndexTabs.filter((candidate) => candidate.id !== tab).map((candidate) => ({ id: candidate.id, name: `PNJs · ${candidate.label}` })), ...sourcePages]
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
        <ReadOnlyIndexEditorButton model={npcEditorModel} disabled={pending} />
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
