"use client"

import { useCallback, useEffect, useState } from "react"
import { AppWindow, ArrowLeft, BookOpen, CalendarDays, ChartColumnBig, Columns3, Filter, Gauge, GitCommitVertical, Images, LayoutGrid, LayoutList, ListTree, LoaderCircle, PanelsLeftRight, Plus, Table2, Trash2, X, type LucideIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import type { ColumnPreset, PresetColumn } from "@/lib/index-presets"
import { ALL_SOURCES, describeCondition, viewOperators, type IndexView, type ViewCondition } from "@/lib/index-views"
import type { IndexLayout, LayoutKind, LayoutPreset, NamedLayout, TabLayouts } from "@/lib/index-layouts"
import type { CardPreset, CardTemplate, TabCards } from "@/lib/index-cards"
import type { TabLocks } from "@/lib/index-locks"
import { forgetResolvedReferences } from "@/components/eraser/reference-store"
import type { StatColumnGroup, StatDefinition } from "@/lib/index-stats"
import { type TabPresentations, type ViewLayout, type ViewLayoutKind, type ViewPreset } from "@/lib/index-view-layouts"

export const layoutIcons: Record<ViewLayoutKind, LucideIcon> = { table: Table2, cards: LayoutGrid, list: LayoutList, kanban: Columns3, "master-detail": PanelsLeftRight, calendar: CalendarDays, dashboard: Gauge, gallery: Images, timeline: GitCommitVertical, tree: ListTree, codex: BookOpen, stats: ChartColumnBig }




type Settings = { views: IndexView[]; presets: ColumnPreset[]; layouts: Record<string, TabLayouts>; layoutPresets: LayoutPreset[]; cards: Record<string, TabCards>; cardPresets: CardPreset[]; presentations: Record<string, TabPresentations>; viewPresets: ViewPreset[]; stats: StatDefinition[]; statGroups: StatColumnGroup[]; locks: Record<string, TabLocks> }

const emptySettings: Settings = { views: [], presets: [], layouts: {}, layoutPresets: [], cards: {}, cardPresets: [], presentations: {}, viewPresets: [], stats: [], statGroups: [], locks: {} }

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
        const next = { views: payload.views ?? [], presets: payload.presets ?? [], layouts: payload.layouts ?? {}, layoutPresets: payload.layoutPresets ?? [], cards: payload.cards ?? {}, cardPresets: payload.cardPresets ?? [], presentations: payload.presentations ?? {}, viewPresets: payload.viewPresets ?? [], stats: payload.stats ?? [], statGroups: payload.statGroups ?? [], locks: payload.locks ?? {} }
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
  const saveLayouts = useCallback(async (changes: Array<{ tab: string; form: IndexLayout | null; hover: IndexLayout | null; forms?: NamedLayout[]; hovers?: NamedLayout[] }>) => {
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
  /** Les cadenas des colonnes d'onglets de cet index ; `null` : plus aucun réglage dans l'onglet. */
  const saveLocks = useCallback(async (changes: Array<{ tab: string; locks: TabLocks | null }>) => {
    if (!changes.length) return
    const payload = await postSettings({ action: "save-locks", index, changes })
    if (payload.locks) update({ locks: payload.locks })
  }, [index, update])
  /** Les cartes d'onglets de cet index ; `null` : l'onglet revient aux cartes d'Eraser. */
  const saveCards = useCallback(async (changes: Array<{ tab: string; cards: TabCards | null }>) => {
    if (!changes.length) return
    const payload = await postSettings({ action: "save-cards", index, changes })
    if (payload.cards) update({ cards: payload.cards })
  }, [index, update])
  /** Les vues (liste, kanban…) d'onglets de cet index ; `null` : l'onglet revient aux réglages d'office. */
  const savePresentations = useCallback(async (changes: Array<{ tab: string; presentations: TabPresentations | null }>) => {
    if (!changes.length) return
    const payload = await postSettings({ action: "save-presentations", index, changes })
    if (payload.presentations) update({ presentations: payload.presentations })
  }, [index, update])
  /** Les statistiques de cet index (Modifier › Stats), enregistrées toutes ensemble, et ses colonnes regroupées si elles sont données. */
  const saveStats = useCallback(async (stats: StatDefinition[], groups?: StatColumnGroup[]) => {
    const payload = await postSettings({ action: "save-stats", index, stats, ...(groups ? { groups } : {}) })
    if (payload.stats) update({ stats: payload.stats, ...(payload.statGroups ? { statGroups: payload.statGroups } : {}) })
  }, [index, update])
  /** Les presets de vues, communs à tous les index. */
  const saveViewPreset = useCallback(async (preset: { id?: string; name: string; layout: ViewLayout }) => {
    const payload = await postSettings({ action: "save-view-preset", ...preset })
    if (payload.viewPresets) update({ viewPresets: payload.viewPresets })
    return payload.id ?? ""
  }, [update])
  const deleteViewPreset = useCallback(async (id: string) => {
    const payload = await postSettings({ action: "delete-view-preset", id })
    if (payload.viewPresets) update({ viewPresets: payload.viewPresets })
  }, [update])
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
  return { ...settings, error, saveView, deleteView, savePreset, deletePreset, saveLayouts, saveLayoutPreset, deleteLayoutPreset, saveCards, saveCardPreset, deleteCardPreset, savePresentations, saveViewPreset, deleteViewPreset, saveStats, saveLocks }
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
          { value: "window", Icon: AppWindow, label: "Onglet fenêtre", hint: "Le tableau, seulement avec les lignes qui remplissent tes conditions." },
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
  const [pending, setPending] = useState("")
  const [error, setError] = useState("")

  function change(position: number, changes: Partial<ViewCondition>) {
    setConditions((current) => current.map((condition, index) => index === position ? { ...condition, ...changes } : condition))
  }

  async function save() {
    setPending("save"); setError("")
    try {
      // Un onglet-fenêtre est le tableau filtré : il n'a pas de présentation à lui (kanban, liste… se
      // posent dans une page). Une présentation d'avant se retire en l'enregistrant.
      await onSave({ id: view?.id, index, name, source, match, conditions: conditions.filter((condition) => condition.column) })
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
        <DialogDescription>Un onglet-fenêtre : le tableau, avec seulement les lignes qui remplissent les conditions. Rien n’est copié : une case modifiée ici l’est dans son onglet d’origine.</DialogDescription>
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
      <p className="text-xs text-muted-foreground">L’onglet-fenêtre montre le tableau (ou les cartes, comme les autres onglets), seulement avec ces lignes. Un kanban, une liste ou une galerie se posent dans une page (bloc Vue d’index).</p>
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
