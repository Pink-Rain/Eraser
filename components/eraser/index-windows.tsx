"use client"

import { useCallback, useEffect, useState } from "react"
import { BookOpen, CalendarDays, ChartColumnBig, Columns3, Filter, Gauge, GitCommitVertical, Images, LayoutGrid, LayoutList, ListTree, LoaderCircle, PanelsLeftRight, Plus, Table2, Trash2, X, type LucideIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import type { ColumnPreset, PresetColumn } from "@/lib/index-presets"
import { ALL_SOURCES, describeCondition, filterOperators, type IndexWindow, type FilterCondition } from "@/lib/index-windows"
import type { IndexLayout, LayoutKind, LayoutPreset, NamedLayout, TabLayouts } from "@/lib/index-layouts"
import { tabCardsOf, type CardPreset, type CardTemplate, type TabCards } from "@/lib/index-cards"
import type { TabLocks } from "@/lib/index-locks"
import { forgetResolvedReferences } from "@/components/eraser/reference-store"
import type { StatColumnGroup, StatDefinition } from "@/lib/index-stats"
import { allPresentationKinds, isPresentationKind, namedPresentationsOf, type TabPresentations, type Presentation, type AllPresentationKind, type PresentationPreset } from "@/lib/index-presentations"
import { newSavedViewId, savedViewFromWindow, type SavedView } from "@/lib/index-saved-views"

export const layoutIcons: Record<AllPresentationKind, LucideIcon> = { table: Table2, cards: LayoutGrid, list: LayoutList, kanban: Columns3, "master-detail": PanelsLeftRight, calendar: CalendarDays, dashboard: Gauge, gallery: Images, timeline: GitCommitVertical, tree: ListTree, codex: BookOpen, stats: ChartColumnBig }




/** Une page qui montre une vue (pour prévenir avant de la changer). */
export type SavedViewPage = { id: string; title: string; href: string }

type Settings = { views: IndexWindow[]; savedViews: SavedView[]; savedViewsUnavailable: boolean; savedViewPages: Record<string, SavedViewPage[]>; presets: ColumnPreset[]; layouts: Record<string, TabLayouts>; layoutPresets: LayoutPreset[]; cards: Record<string, TabCards>; cardPresets: CardPreset[]; presentations: Record<string, TabPresentations>; viewPresets: PresentationPreset[]; stats: StatDefinition[]; statGroups: StatColumnGroup[]; locks: Record<string, TabLocks> }

const emptySettings: Settings = { views: [], savedViews: [], savedViewsUnavailable: false, savedViewPages: {}, presets: [], layouts: {}, layoutPresets: [], cards: {}, cardPresets: [], presentations: {}, viewPresets: [], stats: [], statGroups: [], locks: {} }

// Gardés d'un affichage à l'autre : revenir sur un index montre aussitôt ses fenêtres.
const known = new Map<string, Settings>()

async function postSettings(body: Record<string, unknown>) {
  const response = await fetch("/api/resources/index-settings", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })
  const payload = (await response.json().catch(() => ({}))) as Partial<Settings> & { id?: string; error?: string; savedView?: SavedView }
  if (!response.ok) throw new Error(payload.error || "Le réglage n’a pas pu être enregistré.")
  return payload
}

/** Les onglets-fenêtres d'un index et les presets d'onglets (partagés par tous les index). */
export function useIndexSettings(index: string) {
  const [settings, setSettings] = useState<Settings>(() => known.get(index) ?? emptySettings)
  const [error, setError] = useState("")
  // Lus au moins une fois (pour dire « cette vue n'existe plus » sans attendre à tort).
  const [ready, setReady] = useState(() => known.has(index))
  useEffect(() => {
    let active = true
    fetch(`/api/resources/index-settings?index=${encodeURIComponent(index)}`, { cache: "no-store" })
      .then(async (response) => ({ response, payload: (await response.json().catch(() => ({}))) as Partial<Settings> & { error?: string } }))
      .then(({ response, payload }) => {
        if (!active) return
        if (!response.ok) { setError(payload.error || ""); return }
        // Les vues enregistrées (serveur partagé et onglets-fenêtres réunis) ; une route d'avant ne les
        // donne pas : les onglets-fenêtres en tiennent lieu.
        const next = { views: payload.views ?? [], savedViews: payload.savedViews ?? (payload.views ?? []).map(savedViewFromWindow), savedViewsUnavailable: payload.savedViewsUnavailable === true, savedViewPages: payload.savedViewPages ?? {}, presets: payload.presets ?? [], layouts: payload.layouts ?? {}, layoutPresets: payload.layoutPresets ?? [], cards: payload.cards ?? {}, cardPresets: payload.cardPresets ?? [], presentations: payload.presentations ?? {}, viewPresets: payload.viewPresets ?? [], stats: payload.stats ?? [], statGroups: payload.statGroups ?? [], locks: payload.locks ?? {} }
        known.set(index, next)
        setSettings(next)
        setReady(true)
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
  const saveView = useCallback(async (view: Omit<IndexWindow, "id" | "position"> & { id?: string }) => {
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
  /** Enregistre une vue sur le serveur partagé (la feuille des onglets-fenêtres ne change pas) ; rend la vue enregistrée. */
  const saveSavedView = useCallback(async (view: SavedView) => {
    const payload = await postSettings({ action: "save-saved-view", view })
    const saved = payload.savedView
    if (!saved) throw new Error("La vue n’a pas pu être enregistrée.")
    setSettings((current) => {
      const savedViews = [...current.savedViews.filter((item) => item.id !== saved.id), saved].sort((left, right) => left.position - right.position || left.name.localeCompare(right.name, "fr"))
      const next = { ...current, savedViews }
      known.set(index, next)
      return next
    })
    return saved
  }, [index])
  /** Retire une vue (un onglet-fenêtre du même identifiant ne revient pas). */
  const removeSavedView = useCallback(async (id: string) => {
    await postSettings({ action: "remove-saved-view", index, id })
    setSettings((current) => {
      const next = { ...current, savedViews: current.savedViews.filter((item) => item.id !== id) }
      known.set(index, next)
      return next
    })
  }, [index])
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
  const saveViewPreset = useCallback(async (preset: { id?: string; name: string; layout: Presentation }) => {
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
  return { ...settings, ready, error, saveView, deleteView, saveSavedView, removeSavedView, savePreset, deletePreset, saveLayouts, saveLayoutPreset, deleteLayoutPreset, saveCards, saveCardPreset, deleteCardPreset, savePresentations, saveViewPreset, deleteViewPreset, saveStats, saveLocks }
}

const emptyCondition = (column: string): FilterCondition => ({ column, operator: "est", value: "" })

const fold = (value: string) => value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLocaleLowerCase("fr").replace(/\s+/g, " ").trim()

/** Les genres qu'une vue peut avoir, dans l'ordre du choix ; l'onglet stat à la fin. */
const kindChoices: Array<{ value: AllPresentationKind; label: string; hint: string }> = [
  ...allPresentationKinds,
  { value: "stats", label: "Onglet stat", hint: "Les statistiques épinglées de l’index (Modifier › Stats)." },
]

/** Le symbole d'une vue devant son nom, dans le choix d'onglet. */
export function savedViewMark(kind: AllPresentationKind) {
  return kind === "stats" ? "∑" : kind === "table" ? "⧉" : kind === "cards" ? "▦" : "◈"
}

/**
 * Créer ou modifier une vue : son nom, d'où elle prend ses lignes (tout l'index ou un onglet),
 * sa présentation (tableau, cartes, liste, kanban… ou onglet stat), sa forme, son filtre et son
 * tri. Les lignes ne sont jamais copiées : une case modifiée dans la vue l'est à la source.
 * `draft` pré-remplit une vue nouvelle (« Enregistrer comme vue »), `notice` dit ce qui n'a pas
 * pu en être repris, `usedBy` les pages qui montrent la vue (prévenues avant de la changer).
 */
export function SavedViewDialog({ open, onOpenChange, index, view, draft, notice, usedBy = [], sources, columnsOf, tabOf, presentations, presets, cards, cardsIndex, nextPosition, allowStats = false, onSave, onDelete }: {
  open: boolean
  onOpenChange: (open: boolean) => void
  index: string
  view?: SavedView | null
  draft?: Partial<SavedView> | null
  notice?: string
  usedBy?: SavedViewPage[]
  /** Les sources possibles : la valeur (« * » ou un onglet) et son libellé. */
  sources: Array<{ value: string; label: string }>
  /** Les colonnes proposées pour les conditions et le tri, selon la source choisie. */
  columnsOf: (source: string) => string[]
  /** L'onglet dont la vue prend la forme et les cartes, selon la source choisie. */
  tabOf: (source: string) => string
  presentations: Record<string, TabPresentations>
  presets: PresentationPreset[]
  cards: Record<string, TabCards>
  cardsIndex: string
  nextPosition: number
  allowStats?: boolean
  onSave: (view: SavedView) => Promise<SavedView>
  onDelete?: (id: string) => Promise<void>
}) {
  const start = view ?? draft ?? null
  const [name, setName] = useState(start?.name ?? "")
  const [source, setSource] = useState(start?.source ?? ALL_SOURCES)
  const [kind, setKind] = useState<AllPresentationKind>(start?.kind ?? "table")
  const [shape, setShape] = useState<SavedView["shape"]>(start?.shape)
  const [cardId, setCardId] = useState(start?.cardId ?? "")
  const [match, setMatch] = useState<"toutes" | "une">(start?.filter?.match ?? "toutes")
  const columns = columnsOf(source)
  const [conditions, setConditions] = useState<FilterCondition[]>(() => start?.filter?.conditions.length ? start.filter.conditions : view || draft ? [] : [emptyCondition(columns.find((column) => /^type$/i.test(column)) ?? columns[0] ?? "")])
  const [sortColumn, setSortColumn] = useState(start?.sort?.column ?? "")
  const [sortDesc, setSortDesc] = useState(start?.sort?.desc ?? false)
  const [pending, setPending] = useState("")
  const [error, setError] = useState("")
  const tab = tabOf(source)
  const presentation = isPresentationKind(kind)
  const kindLabel = kindChoices.find((choice) => choice.value === kind)?.label ?? kind
  const entry = Object.entries(presentations).find(([name]) => fold(name) === fold(tab))?.[1]
  const variants = presentation ? namedPresentationsOf(entry, kind) : []
  const kindPresets = presentation ? presets.filter((preset) => preset.layout.kind === kind) : []
  const tabCards = tabCardsOf(cards, cardsIndex, tab).cards
  const shapeValue = shape?.from === "variant" ? `variant:${shape.id}` : shape?.from === "preset" ? `preset:${shape.id}` : shape?.from === "own" ? "own" : ""

  function change(position: number, changes: Partial<FilterCondition>) {
    setConditions((current) => current.map((condition, at) => at === position ? { ...condition, ...changes } : condition))
  }

  function chooseKind(next: AllPresentationKind) {
    setKind(next)
    // Une forme choisie pour un autre genre ne vaut plus.
    if (shape && (shape.from === "own" ? shape.layout.kind !== next : true)) setShape(undefined)
  }

  function chooseShape(value: string) {
    if (!value) setShape(undefined)
    else if (value === "own") setShape(start?.shape)
    else if (value.startsWith("variant:")) setShape({ from: "variant", id: value.slice("variant:".length) })
    else if (value.startsWith("preset:")) setShape({ from: "preset", id: value.slice("preset:".length) })
  }

  async function save() {
    setPending("save"); setError("")
    try {
      const kept = conditions.filter((condition) => condition.column && (!filterOperators.find((operator) => operator.value === condition.operator)?.needsValue || condition.value.trim()))
      const next: SavedView = {
        id: view?.id ?? newSavedViewId(),
        index,
        name: name.trim(),
        ...(view?.icon ? { icon: view.icon } : {}),
        source,
        kind,
        ...(presentation && shape ? { shape } : {}),
        ...(kind !== "stats" && (cardId || (view?.cardId && kind !== "cards")) ? { cardId: kind === "cards" ? cardId : view?.cardId ?? cardId } : {}),
        ...(kind !== "stats" && kept.length ? { filter: { match, conditions: kept } } : {}),
        ...(kind !== "stats" && sortColumn ? { sort: { column: sortColumn, desc: sortDesc } } : {}),
        ...(view?.click ? { click: view.click } : {}),
        ...(kind === "stats" && view?.stats?.length ? { stats: view.stats } : {}),
        position: view?.position ?? nextPosition,
      }
      await onSave(next)
      onOpenChange(false)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "La vue n’a pas pu être enregistrée.")
    }
    setPending("")
  }

  async function remove() {
    const pages = usedBy.length ? `\n\nElle est montrée par ${usedBy.length > 1 ? `${usedBy.length} pages` : "une page"} (${usedBy.map((page) => `« ${page.title} »`).join(", ")}) : ${usedBy.length > 1 ? "elles garderont" : "elle gardera"} la copie de son dernier réglage.` : ""
    if (!view || !onDelete || !window.confirm(`Supprimer la vue « ${view.name} » ? Les lignes qu’elle affiche ne sont pas touchées.${pages}`)) return
    setPending("delete"); setError("")
    try { await onDelete(view.id); onOpenChange(false) } catch (caught) { setError(caught instanceof Error ? caught.message : "Suppression impossible.") }
    setPending("")
  }

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-3xl">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2"><Filter className="size-4 text-primary" />{view ? "Modifier la vue" : "Nouvelle vue"}</DialogTitle>
        <DialogDescription>Des lignes choisies, dans un ordre, sous une forme, pour tout le monde. Rien n’est copié : une case modifiée dans la vue l’est dans son onglet d’origine.</DialogDescription>
      </DialogHeader>
      {notice && <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-900 dark:text-amber-200">{notice}</p>}
      {view && usedBy.length > 0 && <p className="rounded-lg border border-primary/25 bg-primary/5 px-3 py-2 text-xs">
        Cette vue est montrée par {usedBy.length > 1 ? `${usedBy.length} pages` : "une page"} : {usedBy.map((page, at) => <span key={page.id}>{at > 0 && ", "}<a href={page.href} target="_blank" rel="noreferrer" className="font-medium text-primary hover:underline">{page.title || "Sans titre"}</a></span>)}. Tes changements s’y verront aussitôt.
      </p>}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1.5 text-sm font-medium">Nom de la vue<Input value={name} onChange={(event) => setName(event.target.value)} maxLength={60} placeholder="Runes, PNJ par lieu, Chronologie du monde…" autoFocus /></label>
        <label className="grid gap-1.5 text-sm font-medium">Chercher les lignes dans
          <NativeSelect value={source} onChange={(event) => setSource(event.target.value)}>
            {sources.map((option) => <NativeSelectOption key={option.value} value={option.value}>{option.label}</NativeSelectOption>)}
          </NativeSelect>
        </label>
      </div>
      <div className="grid gap-2">
        <span className="text-sm font-medium">Présentation</span>
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4" role="radiogroup" aria-label="Présentation">
          {kindChoices.filter((choice) => allowStats || choice.value !== "stats").map((choice) => {
            const Icon = layoutIcons[choice.value]
            const chosen = kind === choice.value
            return <button key={choice.value} type="button" role="radio" aria-checked={chosen} title={choice.hint} onClick={() => chooseKind(choice.value)} className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-sm transition-colors ${chosen ? "border-primary bg-primary/10 font-semibold text-foreground" : "bg-card/60 text-muted-foreground hover:border-primary/50 hover:text-foreground"}`}><Icon className="size-4 shrink-0" />{choice.label}</button>
          })}
        </div>
        <p className="text-xs text-muted-foreground">{kindChoices.find((choice) => choice.value === kind)?.hint}</p>
      </div>
      {presentation && <label className="grid gap-1.5 text-sm font-medium">Forme
        <NativeSelect value={shapeValue} onChange={(event) => chooseShape(event.target.value)}>
          <NativeSelectOption value="">Celle de l’onglet (Modifier › {kindLabel})</NativeSelectOption>
          {start?.shape?.from === "own" && start.shape.layout.kind === kind && <NativeSelectOption value="own">Propre à cette vue (gardée)</NativeSelectOption>}
          {variants.length > 0 && <optgroup label="Les autres versions de l’onglet">{variants.map((variant) => <NativeSelectOption key={variant.id} value={`variant:${variant.id}`}>{variant.name}</NativeSelectOption>)}</optgroup>}
          {kindPresets.length > 0 && <optgroup label="Presets">{kindPresets.map((preset) => <NativeSelectOption key={preset.id} value={`preset:${preset.id}`}>{preset.name}</NativeSelectOption>)}</optgroup>}
        </NativeSelect>
        <span className="text-xs font-normal text-muted-foreground">La forme se règle dans « Modifier › {kindLabel} » ; la vue la suit.</span>
      </label>}
      {kind === "cards" && <label className="grid gap-1.5 text-sm font-medium">Carte
        <NativeSelect value={cardId} onChange={(event) => setCardId(event.target.value)}>
          <NativeSelectOption value="">Celle à l’étoile (par défaut)</NativeSelectOption>
          {tabCards.map((card) => <NativeSelectOption key={card.id} value={card.id}>{card.name}</NativeSelectOption>)}
        </NativeSelect>
      </label>}
      {kind === "stats"
        ? <p className="rounded-xl border bg-card/60 p-3 text-xs text-muted-foreground">Un onglet stat montre les statistiques épinglées de l’index ; elles se créent et s’épinglent dans « Modifier › Stats ».</p>
        : <>
          <div className="grid gap-2 rounded-xl border bg-card/60 p-3">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-medium">Afficher les lignes qui remplissent</span>
              <NativeSelect value={match} onChange={(event) => setMatch(event.target.value === "une" ? "une" : "toutes")} className="h-8 w-auto text-sm">
                <NativeSelectOption value="toutes">toutes les conditions</NativeSelectOption>
                <NativeSelectOption value="une">au moins une condition</NativeSelectOption>
              </NativeSelect>
            </div>
            {conditions.map((condition, position) => {
              const operator = filterOperators.find((candidate) => candidate.value === condition.operator)
              return <div key={position} className="grid grid-cols-[minmax(0,1fr)_minmax(0,10rem)_minmax(0,1fr)_2rem] items-center gap-2">
                <NativeSelect value={condition.column} onChange={(event) => change(position, { column: event.target.value })} aria-label="Colonne" className="h-9 text-sm">
                  {!columns.includes(condition.column) && condition.column && <NativeSelectOption value={condition.column}>{condition.column}</NativeSelectOption>}
                  {columns.map((column) => <NativeSelectOption key={column} value={column}>{column}</NativeSelectOption>)}
                </NativeSelect>
                <NativeSelect value={condition.operator} onChange={(event) => change(position, { operator: event.target.value as FilterCondition["operator"] })} aria-label="Comparaison" className="h-9 text-sm">
                  {filterOperators.map((candidate) => <NativeSelectOption key={candidate.value} value={candidate.value}>{candidate.label}</NativeSelectOption>)}
                </NativeSelect>
                {operator?.needsValue ? <Input value={condition.value} onChange={(event) => change(position, { value: event.target.value })} placeholder="Valeur" aria-label="Valeur" className="h-9" /> : <span />}
                <button type="button" onClick={() => setConditions((current) => current.filter((_, at) => at !== position))} className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive" aria-label="Retirer la condition"><X className="size-3.5" /></button>
              </div>
            })}
            <div><Button type="button" variant="ghost" size="sm" onClick={() => setConditions((current) => [...current, emptyCondition(columns[0] ?? "")])}><Plus />Ajouter une condition</Button></div>
            {!conditions.length && <p className="text-xs text-muted-foreground">Sans condition, la vue montre toutes les lignes de la source.</p>}
            {conditions.some((condition) => condition.column) && <p className="text-xs text-muted-foreground">{conditions.filter((condition) => condition.column).map(describeCondition).join(match === "une" ? " ou " : " et ")}</p>}
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <label className="grid gap-1.5 text-sm font-medium">Trier par
              <NativeSelect value={sortColumn} onChange={(event) => setSortColumn(event.target.value)} className="min-w-52">
                <NativeSelectOption value="">— L’ordre de l’onglet —</NativeSelectOption>
                {sortColumn && !columns.includes(sortColumn) && <NativeSelectOption value={sortColumn}>{sortColumn}</NativeSelectOption>}
                {columns.map((column) => <NativeSelectOption key={column} value={column}>{column}</NativeSelectOption>)}
              </NativeSelect>
            </label>
            {sortColumn && <label className="flex items-center gap-2 pb-2 text-sm"><input type="checkbox" checked={sortDesc} onChange={(event) => setSortDesc(event.target.checked)} />Ordre décroissant</label>}
          </div>
          {kind === "table" && <p className="text-xs text-muted-foreground">En tableau, le tri et les filtres de chacun (en-têtes de colonnes) restent possibles par-dessus la vue.</p>}
        </>}
      {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
      <div className="flex flex-wrap justify-end gap-2">
        {view && onDelete && !view.builtin && <Button type="button" variant="ghost" className="mr-auto text-destructive hover:text-destructive" disabled={Boolean(pending)} onClick={() => void remove()}>{pending === "delete" ? <LoaderCircle className="animate-spin" /> : <Trash2 />}Supprimer</Button>}
        <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Annuler</Button>
        <Button type="button" disabled={Boolean(pending) || !name.trim()} onClick={() => void save()}>{pending === "save" ? <LoaderCircle className="animate-spin" /> : <Filter />}{view ? "Enregistrer" : "Créer la vue"}</Button>
      </div>
    </DialogContent>
  </Dialog>
}
