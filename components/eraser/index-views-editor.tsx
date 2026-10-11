"use client"

import { useState } from "react"
import { Check, LoaderCircle, RotateCcw, Save, Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { NativeSelect, NativeSelectOptGroup, NativeSelectOption } from "@/components/ui/native-select"
import { IndexViewLayout } from "@/components/eraser/index-view-layouts"
import { IndexCard } from "@/components/eraser/index-card"
import { pickCard, type CardColumn, type CardTemplate } from "@/lib/index-cards"
import { foldName } from "@/lib/index-columns"
import { LayoutSettings } from "@/components/eraser/index-views"
import { builtinViewPresets, DEFAULT_ITEM_CARD, fitLayoutToColumns, presentationKinds, type PresentationKind, type TabPresentations, type ViewLayout, type ViewPreset } from "@/lib/index-view-layouts"

/**
 * « Modifier › Vues » d'un onglet : la liste, le kanban, le maître-détail, le calendrier et le
 * tableau de bord, chacun avec ses réglages, ses presets et un aperçu sur les vraies lignes.
 * Les onglets-fenêtres qui choisissent une de ces vues la montrent avec ces réglages.
 */
export function IndexViewsEditor({ kind, tabName, columns, rows, value, onChange, presets, onSavePreset, onDeletePreset, optionsOf, cards = [], cardColumns = [], disabled = false }: {
  /** La vue réglée (l'onglet de « Modifier » : Liste, Kanban…). */
  kind: PresentationKind
  tabName: string
  /** Les colonnes de l'onglet (sans l'identifiant). */
  columns: string[]
  /** Quelques lignes de l'onglet (en-tête → valeur), pour l'aperçu. */
  rows: Array<Record<string, string>>
  value: TabPresentations
  onChange: (next: TabPresentations) => void
  presets: ViewPreset[]
  onSavePreset?: (preset: { name: string; layout: ViewLayout }) => Promise<unknown>
  onDeletePreset?: (id: string) => Promise<unknown>
  optionsOf?: (header: string) => Array<{ value: string; color?: string }>
  /** Les cartes de l'onglet (Modifier › Cartes, brouillon compris) et ses colonnes typées, pour l'aperçu. */
  cards?: CardTemplate[]
  cardColumns?: CardColumn[]
  disabled?: boolean
}) {
  const [presetName, setPresetName] = useState("")
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState("")
  const layout: ViewLayout = value[kind] ?? { kind }
  const setLayout = (next: ViewLayout | null) => {
    const copy = { ...value }
    if (next) copy[kind] = { ...next, kind }
    else delete copy[kind]
    onChange(copy)
  }
  const available = [...builtinViewPresets, ...presets].filter((preset) => preset.layout.kind === kind)
  const nameColumn = columns.find((column) => /^nom\b/i.test(column)) ?? columns[0] ?? ""
  const keys = rows.map((_, index) => String(index))
  async function run(task: () => Promise<unknown>, done: string) {
    setBusy(true); setMessage("")
    try { await task(); setMessage(done) } catch (caught) { setMessage(caught instanceof Error ? caught.message : "Le preset n’a pas pu être enregistré.") }
    setBusy(false)
  }
  const specs = new Map(cardColumns.map((column) => [foldName(column.header), column.spec]))
  const renderCard = (key: string, cardId: string) => {
    const card = pickCard({ cards }, cardId === DEFAULT_ITEM_CARD ? null : cardId)
    const sample = rows[Number(key)] ?? {}
    const values = new Map(Object.entries(sample).map(([header, cell]) => [foldName(header), cell]))
    return card ? <IndexCard card={card} row={{ value: (header) => values.get(foldName(header)) ?? "", spec: (header) => specs.get(foldName(header)) }} /> : null
  }
  const kindLabel = presentationKinds.find((entry) => entry.value === kind)?.label ?? ""
  return <div className="grid min-h-0 gap-3 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
    <div className="grid content-start gap-3">
      <div className="grid gap-2 rounded-xl border bg-muted/20 p-3">
        <p className="text-sm font-medium">Presets</p>
        <NativeSelect value="" disabled={disabled} onChange={(event) => {
          const preset = available.find((entry) => entry.id === event.target.value)
          if (preset) { setLayout(fitLayoutToColumns({ ...layout, ...preset.layout, kind }, columns)); setMessage(`« ${preset.name} » appliqué.`) }
        }} className="h-9 text-sm" aria-label="Appliquer un preset">
          <NativeSelectOption value="">Appliquer un preset…</NativeSelectOption>
          <NativeSelectOptGroup label="Eraser">{available.filter((preset) => preset.builtin).map((preset) => <NativeSelectOption key={preset.id} value={preset.id}>{preset.name}</NativeSelectOption>)}</NativeSelectOptGroup>
          {available.some((preset) => !preset.builtin) && <NativeSelectOptGroup label="Les tiens">{available.filter((preset) => !preset.builtin).map((preset) => <NativeSelectOption key={preset.id} value={preset.id}>{preset.name}</NativeSelectOption>)}</NativeSelectOptGroup>}
        </NativeSelect>
        {onSavePreset && <div className="flex gap-2">
          <Input value={presetName} onChange={(event) => setPresetName(event.target.value)} placeholder={`Nom du preset (${kindLabel})`} maxLength={60} className="h-9" disabled={disabled || busy} />
          <Button type="button" size="sm" variant="outline" className="h-9" disabled={disabled || busy || !presetName.trim()} onClick={() => void run(async () => { await onSavePreset({ name: presetName.trim(), layout }); setPresetName("") }, "Preset enregistré : il est proposé dans tous les index.")}>{busy ? <LoaderCircle className="animate-spin" /> : <Save />}Enregistrer</Button>
        </div>}
        {onDeletePreset && available.some((preset) => !preset.builtin) && <details className="text-xs">
          <summary className="cursor-pointer text-muted-foreground">Supprimer un de tes presets</summary>
          <ul className="mt-1.5 space-y-1">{available.filter((preset) => !preset.builtin).map((preset) => <li key={preset.id} className="flex items-center justify-between gap-2"><span className="truncate">{preset.name}</span><Button type="button" size="sm" variant="ghost" className="h-7 text-destructive" disabled={busy} onClick={() => void run(() => onDeletePreset(preset.id), "Preset supprimé.")}><Trash2 className="size-3.5" />Supprimer</Button></li>)}</ul>
        </details>}
        {message && <p className="flex items-center gap-1.5 text-xs text-primary"><Check className="size-3.5" />{message}</p>}
      </div>

      <LayoutSettings layout={layout} columns={columns} onChange={(next) => setLayout(next)} fixedKind cards={cards.map((card) => ({ id: card.id, name: card.name }))} />
      {value[kind] && !disabled && <Button type="button" variant="ghost" size="sm" className="justify-self-start" onClick={() => setLayout(null)}><RotateCcw />Revenir aux réglages d’office</Button>}
    </div>

    <section className="min-w-0 rounded-xl border bg-background/60 p-3" aria-label="Aperçu">
      <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Aperçu · {kindLabel} · {rows.length} ligne{rows.length > 1 ? "s" : ""} de « {tabName} »</p>
      <div className="max-h-[60vh] overflow-auto">
        <IndexViewLayout
          layout={layout}
          rows={keys}
          headers={columns}
          nameOf={(key) => (rows[Number(key)]?.[nameColumn] ?? "").replace(/<[^>]+>/g, "").trim()}
          valueOf={(key, header) => rows[Number(key)]?.[header] ?? ""}
          optionsOf={optionsOf}
          onOpen={() => undefined}
          renderCard={renderCard}
          empty="Pas encore de ligne dans cet onglet."
        />
      </div>
    </section>
  </div>
}
