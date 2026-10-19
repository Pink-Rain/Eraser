"use client"

import { memo, useEffect, useMemo, useState } from "react"
import { ArrowDown, ArrowUp, ChevronDown, Plus, ScrollText, Trash2 } from "lucide-react"

import { ChoicePicker, useOptimistic, useWorldIndexOptions } from "@/components/eraser/index-cells"
import { IndexRichText } from "@/components/eraser/index-references"
import { pillStyle } from "@/components/eraser/index-style"
import { RichTextField } from "@/components/eraser/rich-text"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { matchChoice, splitListValue, type ChoiceOption, type IndexColumnKind, type IndexColumnSpec } from "@/lib/index-columns"
import { formatSections, parseSections, sectionTitles, type IndexSection } from "@/lib/index-sections"
import { defaultRarityOptions, formatRarityPlaces, parseRarityPlaces, placeSourcesOf, type RarityPlacesEntry } from "@/lib/rarity-places"
import { cn } from "@/lib/utils"

/*
 * Les cases des colonnes « Rareté et emplacements », « Sections » et « Liste d'index » : leur
 * éditeur (tableau et fiche) et leur affichage (cartes, survols, fiches en lecture).
 */

const cellButton = "flex min-h-8 w-full items-center justify-between gap-2 rounded-md border border-transparent px-2 py-1 text-left text-sm hover:border-input disabled:opacity-50"

/** Garde une copie qu'on modifie (une ligne vide pendant qu'on la remplit), reprise quand la case change ailleurs. */
function useDraft<T>(value: string, parse: (value: string) => T[], format: (rows: T[]) => string) {
  const [rows, setRows] = useState<T[]>(() => parse(value))
  const [seen, setSeen] = useState(value)
  if (value !== seen) {
    setSeen(value)
    if (format(rows) !== value) setRows(parse(value))
  }
  return [rows, setRows] as const
}

// ---------------------------------------------------------------------------
// Rareté et emplacements
// ---------------------------------------------------------------------------

function RarityPill({ rarity, options }: { rarity: string; options: ChoiceOption[] }) {
  const option = matchChoice(rarity, options)
  const color = option?.color
  return <span className="inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold" style={color ? pillStyle(color) : undefined}>{option?.value ?? (rarity || "Sans rareté")}</span>
}

/** Une case lue : chaque rareté en pastille, ses lieux à la suite. */
export function RarityPlacesView({ value, spec, compact = false, className }: { value: string; spec?: Pick<IndexColumnSpec, "options">; compact?: boolean; className?: string }) {
  const entries = parseRarityPlaces(value)
  const options = spec?.options?.length ? spec.options : defaultRarityOptions
  if (!entries.length) return compact ? <span className="text-muted-foreground">—</span> : null
  return <span className={cn("grid min-w-0 gap-1", compact ? "py-1" : "", className)}>
    {entries.map((entry, index) => <span key={`${entry.rarity}:${index}`} className="flex min-w-0 flex-wrap items-center gap-1.5">
      <RarityPill rarity={entry.rarity} options={options} />
      <span className={cn("min-w-0 break-words [overflow-wrap:anywhere]", compact ? "text-xs" : "text-sm")}>{entry.places.length ? entry.places.join(" · ") : <i className="text-muted-foreground">aucun lieu</i>}</span>
    </span>)}
  </span>
}

/**
 * L'éditeur d'une case « Rareté et emplacements » : une ligne par rareté (choisie dans la liste)
 * avec ses lieux (environnements et magasins de l'Index des lieux), autant de lignes qu'on veut.
 */
export function RarityPlacesEditor({ value, spec, disabled = false, onChange }: { value: string; spec: IndexColumnSpec; disabled?: boolean; onChange: (value: string) => void }) {
  const [rows, setRows] = useDraft<RarityPlacesEntry>(value, parseRarityPlaces, formatRarityPlaces)
  const sources = useMemo(() => placeSourcesOf(spec), [spec])
  const loaded = useWorldIndexOptions(sources)
  const rarities = spec.options?.length ? spec.options : defaultRarityOptions
  const update = (next: RarityPlacesEntry[]) => { setRows(next); onChange(formatRarityPlaces(next)) }
  const used = new Set(rows.map((row) => matchChoice(row.rarity, rarities)?.value ?? row.rarity))
  const nextRarity = rarities.find((option) => !used.has(option.value))?.value ?? ""
  return <div className="grid gap-1.5">
    {rows.map((row, index) => <div key={index} className="grid grid-cols-[minmax(7.5rem,9rem)_minmax(0,1fr)_auto] items-start gap-1.5">
      <ChoicePicker compact={false} label={`Rareté ${index + 1}`} value={row.rarity} options={rarities} allowCustom disabled={disabled} onChange={(rarity) => update(rows.map((item, at) => at === index ? { ...item, rarity } : item))} />
      <ChoicePicker compact={false} label={`Lieux de la rareté ${row.rarity || index + 1}`} value={row.places.join(" - ")} options={loaded ?? []} loading={loaded === null} multiple separator="-" strict disabled={disabled} onChange={(places) => update(rows.map((item, at) => at === index ? { ...item, places: splitListValue(places, loaded ?? [], "-") } : item))} />
      <Button type="button" variant="ghost" size="icon-sm" className="mt-0.5 text-muted-foreground hover:text-destructive" disabled={disabled} onClick={() => update(rows.filter((_, at) => at !== index))} aria-label={`Retirer la rareté ${row.rarity || index + 1}`} title="Retirer cette rareté et ses lieux"><Trash2 /></Button>
    </div>)}
    {!rows.length && <p className="text-xs text-muted-foreground">Introuvable pour l’instant : ajoute une rareté, puis les lieux où on la trouve.</p>}
    <div><Button type="button" variant="outline" size="xs" disabled={disabled} onClick={() => setRows([...rows, { rarity: nextRarity, places: [] }])}><Plus />Ajouter une rareté</Button></div>
  </div>
}

/** La case du tableau : les raretés et lieux, l'éditeur au clic. */
export const RarityPlacesCell = memo(function RarityPlacesCell({ label, value, spec, disabled = false, onChange }: { label: string; value: string; spec: IndexColumnSpec; disabled?: boolean; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false)
  const [shown, setShown] = useOptimistic(value)
  return <Popover open={open} onOpenChange={setOpen}>
    <PopoverTrigger asChild>
      <button type="button" aria-label={label} disabled={disabled} className={cn(cellButton, "h-auto")}>
        <RarityPlacesView value={shown} spec={spec} compact />
        <ChevronDown className="size-4 shrink-0 opacity-50" />
      </button>
    </PopoverTrigger>
    {open && <PopoverContent align="start" className="w-[min(34rem,calc(100vw-2rem))] p-3">
      <p className="mb-2 text-xs font-semibold">{label}</p>
      <RarityPlacesEditor value={shown} spec={spec} disabled={disabled} onChange={(next) => { setShown(next); onChange(next) }} />
    </PopoverContent>}
  </Popover>
})

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

/** Les parties lues : chaque titre, son texte dessous. */
export function SectionsView({ value, className, headingClassName }: { value: string; className?: string; headingClassName?: string }) {
  const sections = parseSections(value)
  if (!sections.length) return null
  return <div className={cn("grid gap-3", className)}>
    {sections.map((section, index) => <section key={`${section.title}:${index}`} className="grid gap-1">
      {section.title && <h4 className={cn("font-display text-[15px] font-semibold leading-snug", headingClassName)}>{section.title}</h4>}
      {section.html && <IndexRichText html={section.html} className="text-sm leading-6" />}
    </section>)}
  </div>
}

/** L'éditeur des parties : titre et texte de chacune, qu'on ajoute, déplace ou retire. */
export function SectionsEditor({ value, disabled = false, onChange }: { value: string; disabled?: boolean; onChange: (value: string) => void }) {
  const [rows, setRows] = useDraft<IndexSection>(value, parseSections, formatSections)
  const [revision, setRevision] = useState(0)
  const update = (next: IndexSection[], structural = false) => { setRows(next); onChange(formatSections(next)); if (structural) setRevision((current) => current + 1) }
  const move = (index: number, by: number) => { const next = [...rows]; const [moved] = next.splice(index, 1); next.splice(index + by, 0, moved); update(next, true) }
  return <div className="grid gap-2.5">
    {rows.map((row, index) => <div key={`${revision}:${index}`} className="grid gap-1.5 rounded-xl border bg-background/50 p-2">
      <div className="flex items-center gap-1">
        <Input value={row.title} disabled={disabled} placeholder={index === 0 ? "Titre (facultatif pour la première partie)" : "Titre de la partie"} aria-label={`Titre de la partie ${index + 1}`} onChange={(event) => update(rows.map((item, at) => at === index ? { ...item, title: event.target.value } : item))} className="h-8 font-display font-semibold" />
        <Button type="button" variant="ghost" size="icon-sm" disabled={disabled || index === 0} onClick={() => move(index, -1)} aria-label="Monter la partie" title="Monter"><ArrowUp /></Button>
        <Button type="button" variant="ghost" size="icon-sm" disabled={disabled || index === rows.length - 1} onClick={() => move(index, 1)} aria-label="Descendre la partie" title="Descendre"><ArrowDown /></Button>
        <Button type="button" variant="ghost" size="icon-sm" className="hover:text-destructive" disabled={disabled} onClick={() => update(rows.filter((_, at) => at !== index), true)} aria-label={`Retirer la partie ${row.title || index + 1}`} title="Retirer cette partie"><Trash2 /></Button>
      </div>
      <RichTextField ariaLabel={`Texte de la partie ${row.title || index + 1}`} value={row.html} disabled={disabled} minHeight="min-h-16" onCommit={(html) => update(rows.map((item, at) => at === index ? { ...item, html } : item))} />
    </div>)}
    {!rows.length && <p className="text-xs text-muted-foreground">Aucune partie : ajoute la première (un tome, une partie de la page…).</p>}
    <div><Button type="button" variant="outline" size="xs" disabled={disabled} onClick={() => setRows([...rows, { title: rows.length ? `Partie ${rows.length + 1}` : "", html: "" }])}><Plus />Ajouter une partie</Button></div>
  </div>
}

/** La case du tableau : les titres des parties ; l'éditeur s'ouvre en grand au clic. */
export const SectionsCell = memo(function SectionsCell({ label, value, disabled = false, onChange }: { label: string; value: string; disabled?: boolean; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(value)
  const titles = sectionTitles(value)
  return <>
    <button type="button" aria-label={label} disabled={disabled} onClick={() => { setDraft(value); setOpen(true) }} className={cn(cellButton, "h-auto")}>
      {titles.length ? <span className="flex min-w-0 flex-wrap items-center gap-1 py-1">{titles.map((title, index) => <span key={`${title}:${index}`} className="max-w-full min-w-0 truncate rounded-full border bg-muted/40 px-2 py-0.5 text-[11px]">{title}</span>)}</span> : <span className="text-muted-foreground">—</span>}
      <ScrollText className="size-4 shrink-0 opacity-50" />
    </button>
    {open && <Dialog open onOpenChange={(next) => { if (!next) setOpen(false) }}>
      <DialogContent className="flex max-h-[90svh] flex-col sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">{label}</DialogTitle>
          <DialogDescription>Chaque partie a son titre et son texte. Dans la feuille, une partie commence par une ligne « ## Titre ».</DialogDescription>
        </DialogHeader>
        <div className="min-h-0 overflow-y-auto overscroll-contain pr-1"><SectionsEditor value={draft} disabled={disabled} onChange={setDraft} /></div>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Annuler</Button>
          <Button type="button" disabled={disabled || draft === value} onClick={() => { onChange(draft); setOpen(false) }}>Enregistrer</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>}
  </>
})

// ---------------------------------------------------------------------------
// Liste d'index
// ---------------------------------------------------------------------------

type KindIndex = { key: string; title: string; tabs: string[] }
const kindIndexes = new Map<string, Promise<KindIndex[]>>()

/** Les index qui ont une colonne de ce type (lus une fois par fenêtre ; un échec réessaie au prochain affichage). */
export function useIndexesWithKind(kind: IndexColumnKind) {
  const [list, setList] = useState<KindIndex[] | null>(null)
  useEffect(() => {
    let alive = true
    let request = kindIndexes.get(kind)
    if (!request) {
      request = fetch(`/api/resources/index-kinds?kind=${encodeURIComponent(kind)}`, { cache: "no-store" })
        .then(async (response) => response.ok ? ((await response.json()) as { indexes?: KindIndex[] }).indexes ?? [] : Promise.reject(new Error("INDEX_KINDS_FAILED")))
      kindIndexes.set(kind, request)
      request.catch(() => kindIndexes.delete(kind))
    }
    void request.then((indexes) => { if (alive) setList(indexes) }, () => { if (alive) setList([]) })
    return () => { alive = false }
  }, [kind])
  return list
}

/** Une case « Liste d'index » : des index choisis parmi ceux qui ont une colonne du type réglé. */
export const IndexListPicker = memo(function IndexListPicker({ label, value, spec, compact = true, disabled = false, onChange }: { label: string; value: string; spec: IndexColumnSpec; compact?: boolean; disabled?: boolean; onChange: (value: string) => void }) {
  const indexes = useIndexesWithKind(spec.indexList?.kind ?? "rarity-places")
  const options = useMemo<ChoiceOption[]>(() => (indexes ?? []).map((index) => ({ value: index.title, hint: index.tabs.length ? `Onglets : ${index.tabs.join(", ")}` : undefined })), [indexes])
  const [shown, setShown] = useOptimistic(value)
  return <ChoicePicker label={label} value={shown} options={options} loading={indexes === null} multiple separator="-" strict={Boolean(indexes?.length)} compact={compact} disabled={disabled} onChange={(next) => { setShown(next); onChange(next) }} />
})

/** Une case « Liste d'index » lue : les index en pastilles. */
export function IndexListView({ value }: { value: string }) {
  const names = splitListValue(value, [], "-")
  if (!names.length) return null
  return <span className="flex flex-wrap gap-1">{names.map((name) => <span key={name} className="rounded-full border bg-muted/40 px-2 py-0.5 text-[11px]">{name}</span>)}</span>
}
