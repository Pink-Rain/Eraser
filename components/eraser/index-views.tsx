"use client"

import { useCallback, useEffect, useState } from "react"
import { Filter, LoaderCircle, Plus, Trash2, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import type { ColumnPreset, PresetColumn } from "@/lib/index-presets"
import { ALL_SOURCES, describeCondition, viewOperators, type IndexView, type ViewCondition } from "@/lib/index-views"
import type { IndexLayout, LayoutKind, LayoutPreset, TabLayouts } from "@/lib/index-layouts"
import { forgetResolvedReferences } from "@/components/eraser/reference-store"

type Settings = { views: IndexView[]; presets: ColumnPreset[]; layouts: Record<string, TabLayouts>; layoutPresets: LayoutPreset[] }

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
  const [settings, setSettings] = useState<Settings>(() => known.get(index) ?? { views: [], presets: [], layouts: {}, layoutPresets: [] })
  const [error, setError] = useState("")
  useEffect(() => {
    let active = true
    fetch(`/api/resources/index-settings?index=${encodeURIComponent(index)}`, { cache: "no-store" })
      .then(async (response) => ({ response, payload: (await response.json().catch(() => ({}))) as Partial<Settings> & { error?: string } }))
      .then(({ response, payload }) => {
        if (!active) return
        if (!response.ok) { setError(payload.error || ""); return }
        const next = { views: payload.views ?? [], presets: payload.presets ?? [], layouts: payload.layouts ?? {}, layoutPresets: payload.layoutPresets ?? [] }
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
  return { ...settings, error, saveView, deleteView, savePreset, deletePreset, saveLayouts, saveLayoutPreset, deleteLayoutPreset }
}

const emptyCondition = (column: string): ViewCondition => ({ column, operator: "est", value: "" })

/**
 * Créer ou modifier un onglet-fenêtre : son nom, d'où il prend ses lignes (tout l'index
 * ou un onglet) et ses conditions. Les lignes ne sont jamais copiées.
 */
export function IndexViewDialog({ open, onOpenChange, index, view, sources, columnsOf, onSave, onDelete }: {
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
        <DialogTitle className="flex items-center gap-2"><Filter className="size-4 text-primary" />{view ? "Modifier l’onglet-fenêtre" : "Nouvel onglet-fenêtre"}</DialogTitle>
        <DialogDescription>Un onglet qui réaffiche les lignes existantes répondant aux conditions. Rien n’est copié : une case modifiée ici l’est dans son onglet d’origine.</DialogDescription>
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
      {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
      <div className="flex flex-wrap justify-end gap-2">
        {view && onDelete && <Button type="button" variant="ghost" className="mr-auto text-destructive hover:text-destructive" disabled={Boolean(pending)} onClick={() => void remove()}>{pending === "delete" ? <LoaderCircle className="animate-spin" /> : <Trash2 />}Supprimer</Button>}
        <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Annuler</Button>
        <Button type="button" disabled={Boolean(pending) || !name.trim()} onClick={() => void save()}>{pending === "save" ? <LoaderCircle className="animate-spin" /> : <Filter />}Enregistrer</Button>
      </div>
    </DialogContent>
  </Dialog>
}
