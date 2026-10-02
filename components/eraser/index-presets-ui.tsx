"use client"

import { useState } from "react"
import { Bookmark, BookmarkPlus, Check, LoaderCircle, Pencil, Replace, Settings2, Trash2 } from "lucide-react"

import { useIndexSettings } from "@/components/eraser/index-views"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { indexColumnKinds } from "@/lib/index-columns"
import { presetColumnsOf, type ColumnPreset, type PresetColumn } from "@/lib/index-presets"

/** Les presets d'onglets, communs à tous les index. */
export function useColumnPresets() {
  const { presets, savePreset, deletePreset, error } = useIndexSettings("")
  return { presets, savePreset, deletePreset, error }
}

function columnsSummary(columns: PresetColumn[]) {
  return columns.map((column) => `${column.header} (${indexColumnKinds[column.spec.kind]?.label ?? column.spec.kind})`).join(", ")
}

/**
 * La barre des presets d'un onglet, dans l'éditeur : appliquer un preset (ajoute ses
 * colonnes absentes), enregistrer les colonnes de l'onglet en preset, gérer les presets.
 */
export function PresetBar({ tabName, columns, canApply, readOnly, onApply }: { tabName: string; columns: PresetColumn[]; canApply: boolean; readOnly: boolean; onApply: (columns: PresetColumn[]) => void }) {
  const { presets, savePreset, deletePreset } = useColumnPresets()
  const [dialog, setDialog] = useState<"save" | "manage" | null>(null)
  const kept = presetColumnsOf(columns)
  return <div className="grid gap-1.5 rounded-lg border border-dashed bg-background/40 p-2">
    <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[.14em] text-muted-foreground"><Bookmark className="size-3" />Presets d’onglets</p>
    {canApply && <NativeSelect value="" onChange={(event) => { const preset = presets.find((candidate) => candidate.id === event.target.value); if (preset) onApply(preset.columns) }} className="h-8 text-xs" aria-label="Appliquer un preset">
      <NativeSelectOption value="">{presets.length ? "Ajouter les colonnes d’un preset…" : "Aucun preset enregistré"}</NativeSelectOption>
      {presets.map((preset) => <NativeSelectOption key={preset.id} value={preset.id}>{preset.name} · {preset.columns.length} colonne{preset.columns.length > 1 ? "s" : ""}</NativeSelectOption>)}
    </NativeSelect>}
    {!readOnly && <div className="flex flex-wrap gap-1">
      <Button type="button" variant="outline" size="sm" className="h-7 text-xs" disabled={!kept.length} onClick={() => setDialog("save")} title={kept.length ? `Enregistrer les ${kept.length} colonnes de « ${tabName} »` : "Pas de colonne à garder (le Nom et l’ID sont déjà dans chaque onglet)"}><BookmarkPlus />Enregistrer en preset</Button>
      <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setDialog("manage")}><Settings2 />Gérer</Button>
    </div>}
    {dialog === "save" && <SavePresetDialog tabName={tabName} columns={kept} presets={presets} onClose={() => setDialog(null)} onSave={savePreset} />}
    {dialog === "manage" && <ManagePresetsDialog tabName={tabName} columns={kept} presets={presets} onClose={() => setDialog(null)} onSave={savePreset} onDelete={deletePreset} />}
  </div>
}

type SavePreset = (preset: { id?: string; name: string; description?: string; columns: PresetColumn[] }) => Promise<string>

function SavePresetDialog({ tabName, columns, presets, onClose, onSave }: { tabName: string; columns: PresetColumn[]; presets: ColumnPreset[]; onClose: () => void; onSave: SavePreset }) {
  const [name, setName] = useState(tabName)
  const [description, setDescription] = useState("")
  const [pending, setPending] = useState(false)
  const [error, setError] = useState("")
  const same = presets.find((preset) => preset.name.toLocaleLowerCase("fr") === name.trim().toLocaleLowerCase("fr"))
  async function save() {
    setPending(true); setError("")
    try { await onSave({ id: same?.id, name, description, columns }); onClose() } catch (caught) { setError(caught instanceof Error ? caught.message : "Le preset n’a pas pu être enregistré.") }
    setPending(false)
  }
  return <Dialog open onOpenChange={(open) => { if (!open && !pending) onClose() }}>
    <DialogContent className="sm:max-w-lg">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2"><BookmarkPlus className="size-4 text-primary" />Enregistrer en preset</DialogTitle>
        <DialogDescription>Les colonnes de « {tabName} » (noms, types et réglages), pour créer d’autres onglets pareils. Le Nom et l’ID n’y sont pas : chaque onglet a déjà les siens.</DialogDescription>
      </DialogHeader>
      <label className="grid gap-1.5 text-sm font-medium">Nom du preset<Input value={name} onChange={(event) => setName(event.target.value)} maxLength={60} autoFocus /></label>
      <label className="grid gap-1.5 text-sm font-medium">Description (facultative)<Input value={description} onChange={(event) => setDescription(event.target.value)} maxLength={200} placeholder="Pour quel genre d’onglet…" /></label>
      <p className="text-xs leading-5 text-muted-foreground">{columns.length} colonne{columns.length > 1 ? "s" : ""} : {columnsSummary(columns)}</p>
      {same && <p className="rounded-lg border border-amber-500/30 bg-amber-50 px-3 py-2 text-xs text-amber-950">Un preset « {same.name} » existe déjà : ses colonnes seront remplacées par celles-ci.</p>}
      {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onClose}>Annuler</Button>
        <Button type="button" disabled={pending || !name.trim()} onClick={() => void save()}>{pending ? <LoaderCircle className="animate-spin" /> : <Check />}{same ? "Remplacer" : "Enregistrer"}</Button>
      </div>
    </DialogContent>
  </Dialog>
}

function ManagePresetsDialog({ tabName, columns, presets, onClose, onSave, onDelete }: { tabName: string; columns: PresetColumn[]; presets: ColumnPreset[]; onClose: () => void; onSave: SavePreset; onDelete: (id: string) => Promise<void> }) {
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState({ name: "", description: "" })
  const [pending, setPending] = useState("")
  const [error, setError] = useState("")
  async function run(key: string, action: () => Promise<unknown>) {
    setPending(key); setError("")
    try { await action() } catch (caught) { setError(caught instanceof Error ? caught.message : "Le preset n’a pas pu être modifié.") }
    setPending("")
  }
  return <Dialog open onOpenChange={(open) => { if (!open && !pending) onClose() }}>
    <DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-2xl">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2"><Bookmark className="size-4 text-primary" />Presets d’onglets</DialogTitle>
        <DialogDescription>Communs à tous les index, gardés dans le classeur « Eraser · Réglages des index » du Drive. Supprimer un preset n’efface aucun onglet.</DialogDescription>
      </DialogHeader>
      {!presets.length && <p className="rounded-xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">Aucun preset pour l’instant. « Enregistrer en preset » garde les colonnes de l’onglet affiché.</p>}
      <div className="grid gap-2">
        {presets.map((preset) => <article key={preset.id} className="grid gap-2 rounded-xl border bg-card/60 p-3">
          {editing === preset.id
            ? <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_auto]">
              <Input value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} maxLength={60} aria-label="Nom du preset" className="h-8" />
              <Input value={draft.description} onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))} maxLength={200} placeholder="Description" aria-label="Description du preset" className="h-8" />
              <Button type="button" size="sm" disabled={Boolean(pending) || !draft.name.trim()} onClick={() => void run(`edit:${preset.id}`, async () => { await onSave({ id: preset.id, name: draft.name, description: draft.description, columns: preset.columns }); setEditing(null) })}>{pending === `edit:${preset.id}` ? <LoaderCircle className="animate-spin" /> : <Check />}OK</Button>
            </div>
            : <div className="flex flex-wrap items-start gap-2">
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{preset.name}</p>
                {preset.description && <p className="text-xs text-muted-foreground">{preset.description}</p>}
              </div>
              <Button type="button" variant="ghost" size="icon-sm" onClick={() => { setEditing(preset.id); setDraft({ name: preset.name, description: preset.description }) }} title="Renommer" aria-label={`Renommer ${preset.name}`}><Pencil /></Button>
              <Button type="button" variant="ghost" size="icon-sm" disabled={Boolean(pending) || !columns.length} onClick={() => { if (window.confirm(`Remplacer les colonnes de « ${preset.name} » par celles de « ${tabName} » ?`)) void run(`replace:${preset.id}`, () => onSave({ id: preset.id, name: preset.name, description: preset.description, columns })) }} title={`Remplacer par les colonnes de « ${tabName} »`} aria-label={`Remplacer les colonnes de ${preset.name}`}>{pending === `replace:${preset.id}` ? <LoaderCircle className="animate-spin" /> : <Replace />}</Button>
              <Button type="button" variant="ghost" size="icon-sm" className="text-destructive hover:text-destructive" disabled={Boolean(pending)} onClick={() => { if (window.confirm(`Supprimer le preset « ${preset.name} » ?`)) void run(`delete:${preset.id}`, () => onDelete(preset.id)) }} title="Supprimer" aria-label={`Supprimer ${preset.name}`}>{pending === `delete:${preset.id}` ? <LoaderCircle className="animate-spin" /> : <Trash2 />}</Button>
            </div>}
          <p className="text-[11px] leading-5 text-muted-foreground">{preset.columns.length} colonne{preset.columns.length > 1 ? "s" : ""} : {columnsSummary(preset.columns)}</p>
        </article>)}
      </div>
      {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
      <div className="flex justify-end"><Button type="button" variant="ghost" onClick={onClose}>Fermer</Button></div>
    </DialogContent>
  </Dialog>
}
