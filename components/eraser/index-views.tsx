"use client"

import { useCallback, useEffect, useState } from "react"
import { AppWindow, ArrowLeft, CalendarDays, ChartColumnBig, Columns3, Filter, Gauge, LayoutGrid, LayoutList, LoaderCircle, PanelsLeftRight, Plus, Table2, Trash2, X, type LucideIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import type { ColumnPreset, PresetColumn } from "@/lib/index-presets"
import { ALL_SOURCES, describeCondition, viewOperators, type IndexView, type ViewCondition } from "@/lib/index-views"
import type { IndexLayout, LayoutKind, LayoutPreset, TabLayouts } from "@/lib/index-layouts"
import type { CardPreset, CardTemplate, TabCards } from "@/lib/index-cards"
import { forgetResolvedReferences } from "@/components/eraser/reference-store"
import { Checkbox } from "@/components/ui/checkbox"
import { loadWorldIndexData } from "@/components/eraser/index-cells"
import { calendarsFromTables, REAL_CALENDAR } from "@/lib/calendars"
import { cleanViewLayout, dashboardTileKinds, viewLayoutKinds, type DashboardTile, type ViewLayout, type ViewLayoutKind } from "@/lib/index-view-layouts"

const layoutIcons: Record<ViewLayoutKind, LucideIcon> = { table: Table2, cards: LayoutGrid, list: LayoutList, kanban: Columns3, "master-detail": PanelsLeftRight, calendar: CalendarDays, dashboard: Gauge, stats: ChartColumnBig }

/** Les noms des calendriers de l'Index des calendriers (le calendrier réel en tête). */
function useCalendarNames(active: boolean) {
  const [names, setNames] = useState<string[]>([REAL_CALENDAR])
  useEffect(() => {
    if (!active) return
    let alive = true
    void loadWorldIndexData("calendars").then((data) => { if (alive) setNames([REAL_CALENDAR, ...calendarsFromTables(data?.tables ?? []).map((calendar) => calendar.name)]) })
    return () => { alive = false }
  }, [active])
  return names
}

/**
 * La présentation d'une vue : tableau, cartes, liste (compacte, repliable), kanban,
 * maître-détail, calendrier, tableau de bord ; et ses sections. Elle s'enregistre avec la vue.
 */
function LayoutSettings({ layout, columns, onChange }: { layout: ViewLayout; columns: string[]; onChange: (layout: ViewLayout) => void }) {
  const set = (changes: Partial<ViewLayout>) => onChange({ ...layout, ...changes })
  const calendars = useCalendarNames(layout.kind === "calendar")
  const columnSelect = (value: string | undefined, onPick: (value: string | undefined) => void, label: string, none = "Aucune") => <label className="grid gap-1 text-xs font-semibold">{label}<NativeSelect value={value ?? ""} onChange={(event) => onPick(event.target.value || undefined)} className="h-9 text-sm"><NativeSelectOption value="">{none}</NativeSelectOption>{columns.map((column) => <NativeSelectOption key={column} value={column}>{column}</NativeSelectOption>)}</NativeSelect></label>
  const fields = layout.fields ?? []
  const toggleField = (column: string) => set({ fields: fields.includes(column) ? fields.filter((field) => field !== column) : [...fields, column].slice(0, 4) })
  const tiles = layout.tiles ?? [{ kind: "count" }]
  const setTile = (position: number, tile: DashboardTile | null) => set({ tiles: tiles.flatMap((item, index) => index === position ? tile ? [tile] : [] : [item]) })
  return <div className="grid gap-3 rounded-xl border bg-card/60 p-3">
    <p className="text-sm font-medium">Présentation</p>
    <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4" role="radiogroup" aria-label="Présentation">
      {viewLayoutKinds.map((kind) => { const Icon = layoutIcons[kind.value]; return <button key={kind.value} type="button" role="radio" aria-checked={layout.kind === kind.value} title={kind.hint} onClick={() => set({ kind: kind.value })} className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-xs font-semibold transition-colors ${layout.kind === kind.value ? "border-primary bg-primary text-primary-foreground" : "bg-background/60 hover:bg-muted"}`}><Icon className="size-4 shrink-0" />{kind.label}</button> })}
    </div>
    <p className="text-xs text-muted-foreground">{viewLayoutKinds.find((kind) => kind.value === layout.kind)?.hint}</p>
    {["list", "cards", "master-detail"].includes(layout.kind) && <div className="grid gap-2 sm:grid-cols-2">
      {columnSelect(layout.groupBy, (groupBy) => set({ groupBy }), "Ranger en sections par", "Pas de sections")}
      {layout.groupBy && <div className="grid content-end gap-1.5 text-xs">
        <label className="flex items-center gap-2"><Checkbox checked={Boolean(layout.collapsible)} onCheckedChange={(checked) => set({ collapsible: checked === true || undefined, collapsed: checked === true ? layout.collapsed : undefined })} />Sections repliables</label>
        {layout.collapsible && <label className="flex items-center gap-2"><Checkbox checked={Boolean(layout.collapsed)} onCheckedChange={(checked) => set({ collapsed: checked === true || undefined })} />Repliées à l’ouverture</label>}
      </div>}
    </div>}
    {layout.kind === "list" && <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs">
      <label className="flex items-center gap-2"><Checkbox checked={Boolean(layout.compact)} onCheckedChange={(checked) => set({ compact: checked === true || undefined })} />Compacte (une ligne par élément)</label>
      {!layout.compact && !layout.groupBy && <label className="flex items-center gap-2"><Checkbox checked={Boolean(layout.collapsible)} onCheckedChange={(checked) => set({ collapsible: checked === true || undefined })} />Lignes repliables (déplier montre tout)</label>}
      {!layout.compact && layout.groupBy && <span className="text-muted-foreground">Avec des sections, les lignes se déplient si les sections sont repliables.</span>}
    </div>}
    {layout.kind === "kanban" && columnSelect(layout.kanbanColumn, (kanbanColumn) => set({ kanbanColumn }), "Une colonne du kanban par valeur de", "Choisir…")}
    {layout.kind === "calendar" && <div className="grid gap-2 sm:grid-cols-2">
      {columnSelect(layout.dateColumn, (dateColumn) => set({ dateColumn }), "Colonne de la date", "Choisir…")}
      <label className="grid gap-1 text-xs font-semibold">Calendrier<NativeSelect value={layout.calendar ?? REAL_CALENDAR} onChange={(event) => set({ calendar: event.target.value })} className="h-9 text-sm">{[...new Set([...calendars, ...(layout.calendar ? [layout.calendar] : [])])].map((name) => <NativeSelectOption key={name} value={name}>{name}</NativeSelectOption>)}</NativeSelect></label>
      <p className="text-xs text-muted-foreground sm:col-span-2">Les calendriers (mois, saisons, jours de la semaine) se créent dans l’Index des calendriers.</p>
    </div>}
    {["list", "kanban", "master-detail"].includes(layout.kind) && <div className="grid gap-1.5">
      <span className="text-xs font-semibold">Montrer sous le nom (4 au plus)</span>
      <div className="flex flex-wrap gap-1">{columns.map((column) => <button key={column} type="button" aria-pressed={fields.includes(column)} onClick={() => toggleField(column)} className={`rounded-full border px-2 py-0.5 text-xs ${fields.includes(column) ? "border-primary bg-primary/10 font-semibold text-primary" : "hover:bg-muted"}`}>{column}</button>)}</div>
    </div>}
    {layout.kind === "dashboard" && <div className="grid gap-2">
      {tiles.map((tile, position) => { const needsColumn = dashboardTileKinds.find((kind) => kind.value === tile.kind)?.needsColumn; return <div key={position} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_2rem] items-center gap-2">
        <NativeSelect value={tile.kind} onChange={(event) => setTile(position, { ...tile, kind: event.target.value as DashboardTile["kind"] })} aria-label="Tuile" className="h-9 text-sm">{dashboardTileKinds.map((kind) => <NativeSelectOption key={kind.value} value={kind.value}>{kind.label}</NativeSelectOption>)}</NativeSelect>
        {needsColumn ? <NativeSelect value={tile.column ?? ""} onChange={(event) => setTile(position, { ...tile, column: event.target.value || undefined })} aria-label="Colonne" className="h-9 text-sm"><NativeSelectOption value="">Colonne…</NativeSelectOption>{columns.map((column) => <NativeSelectOption key={column} value={column}>{column}</NativeSelectOption>)}</NativeSelect> : <span />}
        <Input value={tile.label ?? ""} onChange={(event) => setTile(position, { ...tile, label: event.target.value || undefined })} placeholder="Titre (facultatif)" aria-label="Titre de la tuile" className="h-9" />
        <button type="button" onClick={() => setTile(position, null)} className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive" aria-label="Retirer la tuile"><X className="size-3.5" /></button>
      </div> })}
      <div><Button type="button" variant="ghost" size="sm" onClick={() => set({ tiles: [...tiles, { kind: "breakdown", column: columns[0] }] })}><Plus />Ajouter une tuile</Button></div>
    </div>}
  </div>
}

type Settings = { views: IndexView[]; presets: ColumnPreset[]; layouts: Record<string, TabLayouts>; layoutPresets: LayoutPreset[]; cards: Record<string, TabCards>; cardPresets: CardPreset[] }

const emptySettings: Settings = { views: [], presets: [], layouts: {}, layoutPresets: [], cards: {}, cardPresets: [] }

// Gardés d'un affichage à l'autre : revenir sur un index montre aussitôt ses fenêtres.
const known = new Map<string, Settings>()

async function postSettings(body: Record<string, unknown>) {
  const response = await fetch("/api/resources/index-settings", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })
  const payload = (await response.json().catch(() => ({}))) as Partial<Settings> & { id?: string; error?: string }
  if (!response.ok) throw new Error(payload.error || "Le réglage n’a pas pu être enregistré.")
  return payload
}

/** Les onglets-fenêtres d'un index et les presets d'onglets (partagés par tous les index). */
export function useIndexSettings(index: string) {
  const [settings, setSettings] = useState<Settings>(() => known.get(index) ?? emptySettings)
  const [error, setError] = useState("")
  useEffect(() => {
    let active = true
    fetch(`/api/resources/index-settings?index=${encodeURIComponent(index)}`, { cache: "no-store" })
      .then(async (response) => ({ response, payload: (await response.json().catch(() => ({}))) as Partial<Settings> & { error?: string } }))
      .then(({ response, payload }) => {
        if (!active) return
        if (!response.ok) { setError(payload.error || ""); return }
        const next = { views: payload.views ?? [], presets: payload.presets ?? [], layouts: payload.layouts ?? {}, layoutPresets: payload.layoutPresets ?? [], cards: payload.cards ?? {}, cardPresets: payload.cardPresets ?? [] }
        known.set(index, next)
        setSettings(next)
      })
      .catch(() => { if (active) setError("Les onglets-fenêtres n’ont pas pu être chargés.") })
    return () => { active = false }
  }, [index])
  const update = useCallback((changes: Partial<Settings>) => {
    setSettings((current) => {
      const next = { ...current, ...changes }
      known.set(index, next)
      return next
    })
  }, [index])
  const saveView = useCallback(async (view: Omit<IndexView, "id" | "position"> & { id?: string }) => {
    const payload = await postSettings({ action: "save-view", ...view })
    if (payload.views) update({ views: payload.views })
    return payload.id ?? ""
  }, [update])
  /** Les mises en page (fiche, survol) d'onglets de cet index ; `null` : l'affichage automatique. */
  const saveLayouts = useCallback(async (changes: Array<{ tab: string; form: IndexLayout | null; hover: IndexLayout | null }>) => {
    if (!changes.length) return
    const payload = await postSettings({ action: "save-layouts", index, changes })
    if (payload.layouts) update({ layouts: payload.layouts })
    // Le survol a pu changer : les lignes citées déjà lues sont relues.
    forgetResolvedReferences()
  }, [index, update])
  const deleteView = useCallback(async (id: string) => {
    const payload = await postSettings({ action: "delete-view", id, index })
    if (payload.views) update({ views: payload.views })
  }, [index, update])
  const savePreset = useCallback(async (preset: { id?: string; name: string; description?: string; columns: PresetColumn[] }) => {
    const payload = await postSettings({ action: "save-preset", ...preset })
    if (payload.presets) update({ presets: payload.presets })
    return payload.id ?? ""
  }, [update])
  const deletePreset = useCallback(async (id: string) => {
    const payload = await postSettings({ action: "delete-preset", id })
    if (payload.presets) update({ presets: payload.presets })
  }, [update])
  /** Les presets de mise en page (fiche ou survol), communs à tous les index. */
  const saveLayoutPreset = useCallback(async (preset: { id?: string; name: string; kind: LayoutKind; layout: IndexLayout }) => {
    const payload = await postSettings({ action: "save-layout-preset", ...preset })
    if (payload.layoutPresets) update({ layoutPresets: payload.layoutPresets })
    return payload.id ?? ""
  }, [update])
  const deleteLayoutPreset = useCallback(async (id: string) => {
    const payload = await postSettings({ action: "delete-layout-preset", id })
    if (payload.layoutPresets) update({ layoutPresets: payload.layoutPresets })
  }, [update])
  /** Les cartes d'onglets de cet index ; `null` : l'onglet revient aux cartes d'Eraser. */
  const saveCards = useCallback(async (changes: Array<{ tab: string; cards: TabCards | null }>) => {
    if (!changes.length) return
    const payload = await postSettings({ action: "save-cards", index, changes })
    if (payload.cards) update({ cards: payload.cards })
  }, [index, update])
  /** Les presets de cartes, communs à tous les index. */
  const saveCardPreset = useCallback(async (preset: { id?: string; name: string; card: CardTemplate }) => {
    const payload = await postSettings({ action: "save-card-preset", ...preset })
    if (payload.cardPresets) update({ cardPresets: payload.cardPresets })
    return payload.id ?? ""
  }, [update])
  const deleteCardPreset = useCallback(async (id: string) => {
    const payload = await postSettings({ action: "delete-card-preset", id })
    if (payload.cardPresets) update({ cardPresets: payload.cardPresets })
  }, [update])
  return { ...settings, error, saveView, deleteView, savePreset, deletePreset, saveLayouts, saveLayoutPreset, deleteLayoutPreset, saveCards, saveCardPreset, deleteCardPreset }
}

const emptyCondition = (column: string): ViewCondition => ({ column, operator: "est", value: "" })

/**
 * Créer ou modifier un onglet-fenêtre : son nom, d'où il prend ses lignes (tout l'index
 * ou un onglet) et ses conditions. Les lignes ne sont jamais copiées.
 */
export function IndexViewDialog({ open, onOpenChange, index, view, sources, columnsOf, onSave, onDelete, allowStats = false }: {
  open: boolean
  onOpenChange: (open: boolean) => void
  index: string
  view?: IndexView | null
  /** Les sources possibles : la valeur (« * » ou un onglet) et son libellé. */
  sources: Array<{ value: string; label: string }>
  /** Les colonnes proposées pour les conditions, selon la source choisie. */
  columnsOf: (source: string) => string[]
  onSave: (view: Omit<IndexView, "id" | "position"> & { id?: string }) => Promise<string>
  onDelete?: (id: string) => Promise<void>
  /** Un nouvel onglet peut être un onglet stat (le moteur des index sait l'afficher). */
  allowStats?: boolean
}) {
  // Nouvel onglet : d'abord le choix entre onglet fenêtre et onglet stat.
  const [kind, setKind] = useState<"window" | "stats" | null>(() => view ? view.layout?.kind === "stats" ? "stats" : "window" : allowStats ? null : "window")
  if (kind === null) return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="sm:max-w-xl">
      <DialogHeader>
        <DialogTitle>Nouvel onglet</DialogTitle>
        <DialogDescription className="sr-only">Choisir le genre d’onglet à créer.</DialogDescription>
      </DialogHeader>
      <div className="grid gap-3 sm:grid-cols-2">
        {([
          { value: "window", Icon: AppWindow, label: "Onglet fenêtre", hint: "Des lignes choisies, en tableau, cartes, kanban…" },
          { value: "stats", Icon: ChartColumnBig, label: "Onglet stat", hint: "Des chiffres, barres et tableaux croisés sur l’index." },
        ] as const).map((choice) => <button key={choice.value} type="button" autoFocus={choice.value === "window"} onClick={() => setKind(choice.value)} className="group grid justify-items-start gap-2 rounded-xl border bg-card/70 p-4 text-left transition-colors hover:border-primary hover:bg-primary/5 focus-visible:outline-2 focus-visible:outline-ring">
          <span className="grid size-11 place-items-center rounded-lg bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground"><choice.Icon className="size-6" /></span>
          <span className="font-display text-lg font-semibold">{choice.label}</span>
          <span className="text-xs text-muted-foreground">{choice.hint}</span>
        </button>)}
      </div>
    </DialogContent>
  </Dialog>
  if (kind === "stats") return <StatsTabDialog open={open} onOpenChange={onOpenChange} index={index} view={view} onBack={view ? undefined : () => setKind(null)} onSave={onSave} onDelete={onDelete} />
  return <WindowViewDialog open={open} onOpenChange={onOpenChange} index={index} view={view} sources={sources} columnsOf={columnsOf} onSave={onSave} onDelete={onDelete} onBack={!view && allowStats ? () => setKind(null) : undefined} />
}

/** Un onglet stat : son nom ; ses statistiques se règlent dans l'onglet même. */
function StatsTabDialog({ open, onOpenChange, index, view, onBack, onSave, onDelete }: {
  open: boolean
  onOpenChange: (open: boolean) => void
  index: string
  view?: IndexView | null
  onBack?: () => void
  onSave: (view: Omit<IndexView, "id" | "position"> & { id?: string }) => Promise<string>
  onDelete?: (id: string) => Promise<void>
}) {
  const [name, setName] = useState(view?.name ?? "")
  const [pending, setPending] = useState("")
  const [error, setError] = useState("")
  async function save() {
    setPending("save"); setError("")
    try {
      // Ses statistiques (la présentation) restent telles quelles : seul le nom change ici.
      await onSave({ id: view?.id, index, name, source: view?.source ?? ALL_SOURCES, match: view?.match ?? "toutes", conditions: view?.conditions ?? [], layout: view?.layout?.kind === "stats" ? view.layout : { kind: "stats" } })
      onOpenChange(false)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "L’onglet stat n’a pas pu être enregistré.")
    }
    setPending("")
  }
  async function remove() {
    if (!view || !onDelete || !window.confirm(`Supprimer l’onglet stat « ${view.name} » et ses statistiques ? Les lignes de l’index ne sont pas touchées.`)) return
    setPending("delete"); setError("")
    try { await onDelete(view.id); onOpenChange(false) } catch (caught) { setError(caught instanceof Error ? caught.message : "Suppression impossible.") }
    setPending("")
  }
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2"><ChartColumnBig className="size-4 text-primary" />{view ? "Modifier l’onglet stat" : "Nouvel onglet stat"}</DialogTitle>
        <DialogDescription className="sr-only">Le nom de l’onglet stat.</DialogDescription>
      </DialogHeader>
      <form className="grid gap-3" onSubmit={(event) => { event.preventDefault(); if (name.trim() && !pending) void save() }}>
        <label className="grid gap-1.5 text-sm font-medium">Nom de l’onglet<Input value={name} onChange={(event) => setName(event.target.value)} maxLength={60} placeholder="Statistiques, Raretés…" autoFocus /></label>
        {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
        <div className="flex flex-wrap justify-end gap-2">
          {onBack && <Button type="button" variant="ghost" className="mr-auto" onClick={onBack}><ArrowLeft />Retour</Button>}
          {view && onDelete && <Button type="button" variant="ghost" className="mr-auto text-destructive hover:text-destructive" disabled={Boolean(pending)} onClick={() => void remove()}>{pending === "delete" ? <LoaderCircle className="animate-spin" /> : <Trash2 />}Supprimer</Button>}
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Annuler</Button>
          <Button type="submit" disabled={Boolean(pending) || !name.trim()}>{pending === "save" ? <LoaderCircle className="animate-spin" /> : <ChartColumnBig />}{view ? "Enregistrer" : "Créer"}</Button>
        </div>
      </form>
    </DialogContent>
  </Dialog>
}

function WindowViewDialog({ open, onOpenChange, index, view, sources, columnsOf, onSave, onDelete, onBack }: {
  open: boolean
  onOpenChange: (open: boolean) => void
  index: string
  view?: IndexView | null
  sources: Array<{ value: string; label: string }>
  columnsOf: (source: string) => string[]
  onSave: (view: Omit<IndexView, "id" | "position"> & { id?: string }) => Promise<string>
  onDelete?: (id: string) => Promise<void>
  onBack?: () => void
}) {
  const [name, setName] = useState(view?.name ?? "")
  const [source, setSource] = useState(view?.source ?? ALL_SOURCES)
  const [match, setMatch] = useState<IndexView["match"]>(view?.match ?? "toutes")
  const columns = columnsOf(source)
  const [conditions, setConditions] = useState<ViewCondition[]>(() => view?.conditions.length ? view.conditions : [emptyCondition(columns.find((column) => /^type$/i.test(column)) ?? columns[0] ?? "")])
  const [layout, setLayout] = useState<ViewLayout>(() => view?.layout ?? { kind: "table" })
  const [pending, setPending] = useState("")
  const [error, setError] = useState("")

  function change(position: number, changes: Partial<ViewCondition>) {
    setConditions((current) => current.map((condition, index) => index === position ? { ...condition, ...changes } : condition))
  }

  async function save() {
    setPending("save"); setError("")
    try {
      await onSave({ id: view?.id, index, name, source, match, conditions: conditions.filter((condition) => condition.column), layout: cleanViewLayout(layout) })
      onOpenChange(false)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "L’onglet-fenêtre n’a pas pu être enregistré.")
    }
    setPending("")
  }

  async function remove() {
    if (!view || !onDelete || !window.confirm(`Supprimer l’onglet-fenêtre « ${view.name} » ? Les lignes qu’il affiche ne sont pas touchées.`)) return
    setPending("delete"); setError("")
    try { await onDelete(view.id); onOpenChange(false) } catch (caught) { setError(caught instanceof Error ? caught.message : "Suppression impossible.") }
    setPending("")
  }

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-2xl">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2"><Filter className="size-4 text-primary" />{view ? "Modifier la vue" : "Nouvelle vue"}</DialogTitle>
        <DialogDescription>Un onglet-fenêtre : les lignes qui remplissent les conditions, présentées comme tu veux. Rien n’est copié : une case modifiée ici l’est dans son onglet d’origine.</DialogDescription>
      </DialogHeader>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1.5 text-sm font-medium">Nom de l’onglet<Input value={name} onChange={(event) => setName(event.target.value)} maxLength={60} placeholder="Runes, Armes légendaires…" autoFocus /></label>
        <label className="grid gap-1.5 text-sm font-medium">Chercher les lignes dans
          <NativeSelect value={source} onChange={(event) => setSource(event.target.value)}>
            {sources.map((option) => <NativeSelectOption key={option.value} value={option.value}>{option.label}</NativeSelectOption>)}
          </NativeSelect>
        </label>
      </div>
      <div className="grid gap-2 rounded-xl border bg-card/60 p-3">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="font-medium">Afficher les lignes qui remplissent</span>
          <NativeSelect value={match} onChange={(event) => setMatch(event.target.value === "une" ? "une" : "toutes")} className="h-8 w-auto text-sm">
            <NativeSelectOption value="toutes">toutes les conditions</NativeSelectOption>
            <NativeSelectOption value="une">au moins une condition</NativeSelectOption>
          </NativeSelect>
        </div>
        {conditions.map((condition, position) => {
          const operator = viewOperators.find((candidate) => candidate.value === condition.operator)
          return <div key={position} className="grid grid-cols-[minmax(0,1fr)_minmax(0,10rem)_minmax(0,1fr)_2rem] items-center gap-2">
            <NativeSelect value={condition.column} onChange={(event) => change(position, { column: event.target.value })} aria-label="Colonne" className="h-9 text-sm">
              {!columns.includes(condition.column) && condition.column && <NativeSelectOption value={condition.column}>{condition.column}</NativeSelectOption>}
              {columns.map((column) => <NativeSelectOption key={column} value={column}>{column}</NativeSelectOption>)}
            </NativeSelect>
            <NativeSelect value={condition.operator} onChange={(event) => change(position, { operator: event.target.value as ViewCondition["operator"] })} aria-label="Comparaison" className="h-9 text-sm">
              {viewOperators.map((candidate) => <NativeSelectOption key={candidate.value} value={candidate.value}>{candidate.label}</NativeSelectOption>)}
            </NativeSelect>
            {operator?.needsValue ? <Input value={condition.value} onChange={(event) => change(position, { value: event.target.value })} placeholder="Valeur" aria-label="Valeur" className="h-9" /> : <span />}
            <button type="button" onClick={() => setConditions((current) => current.filter((_, index) => index !== position))} className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive" aria-label="Retirer la condition"><X className="size-3.5" /></button>
          </div>
        })}
        <div><Button type="button" variant="ghost" size="sm" onClick={() => setConditions((current) => [...current, emptyCondition(columns[0] ?? "")])}><Plus />Ajouter une condition</Button></div>
        {!conditions.length && <p className="text-xs text-muted-foreground">Sans condition, la fenêtre montre toutes les lignes de la source.</p>}
        {conditions.length > 0 && <p className="text-xs text-muted-foreground">{conditions.filter((condition) => condition.column).map(describeCondition).join(match === "une" ? " ou " : " et ")}</p>}
      </div>
      <LayoutSettings layout={layout} columns={columns} onChange={setLayout} />
      {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
      <div className="flex flex-wrap justify-end gap-2">
        {onBack && <Button type="button" variant="ghost" className="mr-auto" onClick={onBack}><ArrowLeft />Retour</Button>}
        {view && onDelete && <Button type="button" variant="ghost" className="mr-auto text-destructive hover:text-destructive" disabled={Boolean(pending)} onClick={() => void remove()}>{pending === "delete" ? <LoaderCircle className="animate-spin" /> : <Trash2 />}Supprimer</Button>}
        <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Annuler</Button>
        <Button type="button" disabled={Boolean(pending) || !name.trim()} onClick={() => void save()}>{pending === "save" ? <LoaderCircle className="animate-spin" /> : <Filter />}Enregistrer</Button>
      </div>
    </DialogContent>
  </Dialog>
}
