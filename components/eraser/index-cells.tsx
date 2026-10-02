"use client"

import { memo, useEffect, useMemo, useState, type ReactNode } from "react"
import Link from "next/link"
import { Check, ChevronDown, File as FileIcon, FileText, Film, ImagePlus, Music, Paperclip, Upload, Link2, LoaderCircle, Plus, Search, Sparkles, Trash2, X, Zap } from "lucide-react"

import { IndexImage } from "@/components/eraser/index-image"
import { RichTextField, sanitizeRichText } from "@/components/eraser/rich-text"
import { SpellPicker, useSpellOptions, type SpellOption } from "@/components/eraser/spell-picker"
import type { SheetGridColumn } from "@/components/eraser/sheet-grid"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import type { SpellIndexKind } from "@/lib/class-content"
import { conversionsOf, findUnit, formatIndexNumber, numberSortKey, parseIndexNumber, unitsOf, unitTone, type NumberFormat } from "@/lib/index-numbers"
import { ActionsCell, FormulaCell, RandomCell } from "@/components/eraser/index-computed-cells"
import { GaugeCell } from "@/components/eraser/index-gauge"
import { columnStyleCss, pillStyle } from "@/components/eraser/index-style"
import {
  checkboxValue,
  columnTypeLabel,
  fileAcceptInput,
  fileAcceptLabels,
  type FileAccept,
  foldName,
  gaugeScaleOf,
  isCheckedValue,
  isRichSpec,
  joinListValue,
  matchChoice,
  normalizeSpec,
  splitListValue,
  type ActionButton,
  type ChoiceOption,
  type ChoiceSource,
  type IndexColumnSpec,
  type SpellSource,
} from "@/lib/index-columns"
import type { FormulaDisplay } from "@/lib/index-formula"
import { isBuiltinWorldIndexKey, splitNames, worldIndexDefinitions, type WorldIndexKey } from "@/lib/world-index-definitions"
import { announceWorldIndexChange, onWorldIndexChange } from "@/lib/world-index-events"

/*
 * Le moteur de cellules de tous les index. Chaque type de colonne (lib/index-columns.ts)
 * a ici sa cellule de tableau et son champ de formulaire ; les pages ne décrivent plus
 * que leurs colonnes et la façon d'enregistrer une valeur.
 */

export { isCheckedValue as isChecked, IndexImage, GaugeCell }

/**
 * Valeur affichée tout de suite après un choix, sans attendre que le tableau entier se
 * redessine. Elle s'efface dès que la ligne reçoit la valeur enregistrée.
 */
function useOptimistic(value: string) {
  const [state, setState] = useState({ source: value, local: null as string | null })
  if (state.source !== value) setState({ source: value, local: null })
  const shown = state.source === value ? state.local ?? value : value
  return [shown, (next: string) => setState({ source: value, local: next })] as const
}

const cellButton = "flex min-h-8 w-full items-center justify-between gap-2 rounded-md border border-transparent px-2 text-left text-sm hover:border-input disabled:opacity-50"

// ---------------------------------------------------------------------------
// Listes déroulantes : liste fermée, liste libre et liste liée partagent un sélecteur.
// ---------------------------------------------------------------------------

type PickerProps = {
  label: string
  value: string
  options: ChoiceOption[]
  onChange: (value: string) => void
  disabled?: boolean
  loading?: boolean
  /** Une valeur hors liste peut être choisie telle quelle. */
  allowCustom?: boolean
  /** Plusieurs choix par case, séparés par des virgules dans la feuille. */
  multiple?: boolean
  /** Les groupes d'options (statut), dans l'ordre. */
  groups?: Array<{ name: string; color?: string }>
  /** Liste liée : une valeur absente est créée dans l'index source. */
  onCreate?: (value: string) => Promise<void>
  createLabel?: string
  compact?: boolean
  /** Rendu de la valeur fermée (pastille colorée d'un type de sort…). */
  renderValue?: (value: string) => ReactNode
}

/** Une valeur de liste en pastille, à la couleur de son option (ou de son groupe). */
function ChoicePill({ value, option, group, outside, renderValue }: { value: string; option?: ChoiceOption; group?: { color?: string }; outside?: boolean; renderValue?: (value: string) => ReactNode }) {
  const color = option?.color ?? group?.color
  if (renderValue) return <span className="min-w-0 truncate">{renderValue(value)}</span>
  if (!color) return <span className={`min-w-0 truncate ${outside ? "italic text-muted-foreground" : ""}`}>{value}</span>
  return <span className={`inline-flex max-w-full items-center truncate rounded-full border px-2 py-0.5 text-xs font-medium ${outside ? "italic" : ""}`} style={pillStyle(color)}>{value}</span>
}

/**
 * Le sélecteur d'une liste. Fermé, ce n'est qu'un bouton : le menu n'est monté qu'au
 * clic (des centaines de menus montés d'avance rendaient le tableau interminable).
 * Une valeur écrite autrement dans la feuille (« Aggressif ») est reconnue ; une valeur
 * hors liste reste affichée en italique, pour ne jamais être effacée par mégarde.
 * À choix multiple, un clic coche ou décoche une option et le menu reste ouvert.
 */
export function ChoicePicker({ label, value, options, onChange, disabled = false, loading = false, allowCustom = false, multiple = false, groups = [], onCreate, createLabel, compact = true, renderValue }: PickerProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [creating, setCreating] = useState(false)
  const trimmed = value.trim()
  const values = multiple ? splitListValue(trimmed, options) : trimmed ? [trimmed] : []
  const current = values.map((item) => ({ raw: item, option: matchChoice(item, options) }))
  const selected = new Set(current.map((item) => item.option?.value ?? item.raw).map(foldName))
  const outsideValues = current.filter((item) => !item.option).map((item) => item.raw)
  const folded = foldName(query)
  const shown = options.filter((option) => !folded || foldName(`${option.value} ${option.hint ?? ""} ${option.group ?? ""}`).includes(folded)).slice(0, 300)
  const exact = query.trim() && options.some((option) => foldName(option.value) === folded)
  const canCreate = Boolean(query.trim()) && !exact && (allowCustom || onCreate)
  const groupOf = (option?: ChoiceOption) => groups.find((group) => option?.group && foldName(group.name) === foldName(option.group))
  // Les options rangées par groupe, dans l'ordre des groupes ; les autres à la fin.
  const sections = groups.length
    ? [...groups.map((group) => ({ group: group as { name: string; color?: string } | null, items: shown.filter((option) => option.group && foldName(option.group) === foldName(group.name)) })), { group: null, items: shown.filter((option) => !groupOf(option)) }].filter((section) => section.items.length)
    : [{ group: null, items: shown }]

  function commit(next: string[]) {
    onChange(multiple ? joinListValue(next) : next[0] ?? "")
  }

  function choose(next: string) {
    if (!multiple) {
      commit(next ? [next] : [])
      setOpen(false)
      setQuery("")
      return
    }
    if (!next) { commit([]); return }
    const key = foldName(next)
    const kept = current.map((item) => item.option?.value ?? item.raw)
    commit(kept.some((item) => foldName(item) === key) ? kept.filter((item) => foldName(item) !== key) : [...kept, next])
    setQuery("")
  }

  async function create(name: string) {
    if (!onCreate) return choose(name)
    setCreating(true)
    try { await onCreate(name); choose(name) } finally { setCreating(false) }
  }

  const closed = values.length
    ? <span className={`flex min-w-0 ${multiple ? "flex-wrap gap-1 py-1" : ""} items-center`}>{current.map((item) => <ChoicePill key={item.raw} value={item.option?.value ?? item.raw} option={item.option} group={groupOf(item.option)} outside={!item.option} renderValue={renderValue} />)}</span>
    : <span className="text-muted-foreground">—</span>

  return <Popover open={open} onOpenChange={(next) => { setOpen(next); if (!next) setQuery("") }}>
    <PopoverTrigger asChild>
      <button type="button" aria-label={label} disabled={disabled} title={current[0]?.option?.hint ?? (outsideValues.length ? "Valeur hors de la liste" : undefined)} className={compact ? `${cellButton} ${multiple ? "h-auto" : ""}` : `${cellButton} min-h-9 border-input bg-background/50`}>
        {closed}
        <ChevronDown className="size-4 shrink-0 opacity-50" />
      </button>
    </PopoverTrigger>
    {open && <PopoverContent align="start" className="w-72 p-0">
      <div className="border-b p-2"><div className="relative"><Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" /><Input
        autoFocus
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== "Enter") return
          event.preventDefault()
          if (shown.length === 1 && !canCreate) choose(shown[0].value)
          else if (exact) choose(options.find((option) => foldName(option.value) === folded)!.value)
          else if (canCreate) void create(query.trim())
        }}
        placeholder={onCreate || allowCustom ? "Chercher ou saisir…" : "Chercher…"}
        className="h-8 border-0 bg-muted/45 pl-8 text-sm shadow-none"
      /></div>{multiple && <p className="mt-1.5 px-1 text-[10px] text-muted-foreground">Plusieurs choix : clique pour cocher ou décocher.</p>}</div>
      <div className="max-h-72 overflow-y-auto p-1">
        <button type="button" onClick={() => { commit([]); if (!multiple) setOpen(false) }} className="flex w-full rounded-md px-2 py-1.5 text-left text-sm text-muted-foreground hover:bg-accent">{multiple ? "Tout décocher" : "—"}</button>
        {!folded && outsideValues.map((outside) => <div key={outside} className="flex items-center gap-1">
          <button type="button" onClick={() => choose(outside)} className="flex min-w-0 flex-1 items-center justify-between gap-2 truncate rounded-md px-2 py-1.5 text-left text-sm italic text-muted-foreground hover:bg-accent" title="Valeur de la feuille, hors de la liste"><span className="truncate">{outside}</span>{multiple && <Check className="size-3.5 shrink-0" />}</button>
          {onCreate && <button type="button" disabled={creating} onClick={() => void create(outside)} className="shrink-0 rounded-md px-2 py-1 text-[11px] font-semibold text-primary hover:bg-primary/10">Créer</button>}
        </div>)}
        {loading && <p className="flex items-center gap-2 px-2 py-2 text-xs text-muted-foreground"><LoaderCircle className="size-3.5 animate-spin" />Chargement…</p>}
        {sections.map((section) => <div key={section.group?.name ?? "*"}>
          {section.group && <p className="flex items-center gap-1.5 px-2 pb-0.5 pt-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{section.group.color && <span className="size-2 rounded-full" style={{ backgroundColor: section.group.color }} />}{section.group.name}</p>}
          {section.items.map((option) => <button key={option.value} type="button" onClick={() => choose(option.value)} className="group flex w-full flex-col items-start rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent">
            <span className="flex w-full items-center justify-between gap-2"><ChoicePill value={option.value} option={option} group={groupOf(option)} renderValue={renderValue} />{selected.has(foldName(option.value)) && <Check className="size-3.5 shrink-0" />}</span>
            {option.hint && <span className="hidden text-xs text-muted-foreground group-hover:block">{option.hint}</span>}
          </button>)}
        </div>)}
        {canCreate && <button type="button" disabled={creating} onClick={() => void create(query.trim())} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm font-medium text-primary hover:bg-primary/10">
          {creating ? <LoaderCircle className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
          <span className="truncate">{onCreate ? `Créer « ${query.trim()} »${createLabel ? ` dans ${createLabel}` : ""}` : `Utiliser « ${query.trim()} »`}</span>
        </button>}
        {!loading && !shown.length && !canCreate && <p className="px-2 py-3 text-center text-xs text-muted-foreground">Aucun choix ne correspond.</p>}
      </div>
    </PopoverContent>}
  </Popover>
}

/** Une liste fermée dans le tableau, avec affichage immédiat du choix. */
export const ChoiceCell = memo(function ChoiceCell({ onChange, value, ...props }: PickerProps) {
  const [shown, setShown] = useOptimistic(value)
  return <ChoicePicker {...props} value={shown} onChange={(next) => { setShown(next); onChange(next) }} />
})

// Données d'un index du monde, chargées une fois pour toute la page (listes liées,
// Recherche, Agrégat).
export type LoadedWorldIndex = {
  tables: Array<{ tabName: string; headers: string[]; rows: Array<{ values: string[] }> }>
  columns?: Record<string, Array<{ header: string; spec: IndexColumnSpec }>>
}
const dataCache = new Map<string, Promise<LoadedWorldIndex | null>>()
const namesCache = new Map<string, Promise<string[]>>()

/** Oublie les données gardées d'un index (après y avoir créé une ligne). */
export function forgetWorldIndexData(index: WorldIndexKey) {
  dataCache.delete(index)
  for (const key of [...namesCache.keys()]) if (key.startsWith(`${index}:`)) namesCache.delete(key)
}

export function loadWorldIndexData(index: WorldIndexKey) {
  let promise = dataCache.get(index)
  if (!promise) {
    promise = fetch(`/api/resources/world-indexes?key=${index}`)
      .then((response) => response.json())
      .then((payload: { data?: LoadedWorldIndex }) => payload.data ?? null)
      .catch(() => { dataCache.delete(index); return null })
    dataCache.set(index, promise)
  }
  return promise
}

function sourceKey(source: ChoiceSource) {
  return `${source.index}:${source.tab}:${source.onlyTab ? "1" : "*"}:${source.exclude ? `${source.exclude.column}=${source.exclude.value}` : ""}`
}

export function loadWorldIndexNames(source: ChoiceSource) {
  const key = sourceKey(source)
  let promise = namesCache.get(key)
  if (!promise) {
    promise = loadWorldIndexData(source.index).then((data) => {
      // Une liste liée propose les noms de tous les onglets de l'index (un lieu peut être une
      // ville comme un pays), sauf si elle se limite à son onglet ou écarte certaines lignes.
      const tables = (data?.tables ?? []).filter((table) => !source.onlyTab || table.tabName === source.tab)
      const names = tables.flatMap((table) => {
        const column = table.headers.findIndex((header) => foldName(header) === "nom")
        const excluded = source.exclude ? table.headers.findIndex((header) => foldName(header) === foldName(source.exclude!.column)) : -1
        return column >= 0 ? table.rows
          .filter((row) => excluded < 0 || foldName(row.values[excluded] ?? "") !== foldName(source.exclude!.value))
          .map((row) => row.values[column]?.trim() ?? "") : []
      })
      return [...new Set(names.filter(Boolean))].sort((left, right) => left.localeCompare(right, "fr"))
    })
    namesCache.set(key, promise)
  }
  return promise
}

/** Crée le nom dans l'index source s'il n'y est pas encore. */
export async function ensureWorldIndexName(source: ChoiceSource, name: string) {
  const clean = name.replace(/\s+/g, " ").trim()
  if (!clean) return
  const known = await loadWorldIndexNames(source)
  if (known.some((candidate) => foldName(candidate) === foldName(clean))) return
  const response = await fetch("/api/resources/world-indexes", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "ensure", key: source.index, tabName: source.tab, name: clean }),
  })
  if (!response.ok) throw new Error("Le nom n’a pas pu être ajouté à l’index.")
  namesCache.set(sourceKey(source), Promise.resolve([...known, clean].sort((left, right) => left.localeCompare(right, "fr"))))
  announceWorldIndexChange([source.index])
}

// Un index changé ailleurs (autre onglet, autre fenêtre) : ses données gardées sont oubliées
// une seule fois, puis chaque liste qui le lit se recharge.
const reloadListeners = new Set<(index: string) => void>()
if (typeof window !== "undefined") onWorldIndexChange((keys) => {
  for (const key of keys) forgetWorldIndexData(key as WorldIndexKey)
  for (const listener of [...reloadListeners]) for (const key of keys) listener(key)
})

/** Change quand l'index est modifié ailleurs : à mettre dans les dépendances d'un chargement. */
export function useWorldIndexVersion(index: string) {
  const [version, setVersion] = useState(0)
  useEffect(() => {
    const listener = (changed: string) => { if (changed === index) setVersion((current) => current + 1) }
    reloadListeners.add(listener)
    return () => { reloadListeners.delete(listener) }
  }, [index])
  return version
}

function useWorldIndexNames(source: ChoiceSource) {
  const [names, setNames] = useState<string[] | null>(null)
  const version = useWorldIndexVersion(source.index)
  useEffect(() => {
    let alive = true
    void loadWorldIndexNames(source).then((loaded) => { if (alive) setNames(loaded) })
    return () => { alive = false }
  }, [source, version])
  return names
}

/**
 * Liste déroulante liée : les noms viennent d'un autre index (les peuples d'un PNJ…).
 * Choisir ou saisir un nom absent le crée dans cet index, comme une colonne liée.
 */
export function LinkedChoicePicker({ source, value, onChange, compact = true, disabled = false, multiple = false, label }: { source: ChoiceSource; value: string; onChange: (value: string) => void; compact?: boolean; disabled?: boolean; multiple?: boolean; label: string }) {
  const names = useWorldIndexNames(source)
  const [shown, setShown] = useOptimistic(value)
  const options = useMemo(() => (names ?? []).map((name) => ({ value: name })), [names])
  return <ChoicePicker
    label={label}
    value={shown}
    options={options}
    loading={names === null}
    compact={compact}
    disabled={disabled}
    multiple={multiple}
    createLabel={isBuiltinWorldIndexKey(source.index) ? `l’index ${worldIndexDefinitions[source.index].title}` : "l’index lié"}
    onCreate={(name) => ensureWorldIndexName(source, name)}
    onChange={(next) => { setShown(next); onChange(next) }}
  />
}

// ---------------------------------------------------------------------------
// Case à cocher, identifiant, nom formulaire
// ---------------------------------------------------------------------------

export const CheckCell = memo(function CheckCell({ label, value, disabled = false, emptyChecked = false, onChange }: { label: string; value: string; disabled?: boolean; emptyChecked?: boolean; onChange: (value: string) => void }) {
  const [shown, setShown] = useOptimistic(value)
  return <span className="flex min-h-8 items-center justify-center">
    <Checkbox aria-label={label} checked={isCheckedValue(shown, emptyChecked)} disabled={disabled} onCheckedChange={(checked) => { const next = checkboxValue(checked === true, shown); setShown(next); onChange(next) }} />
  </span>
})

export function IdCell({ value, computed = false }: { value: string; computed?: boolean }) {
  return <span
    className={`flex min-h-8 items-center truncate px-2 font-mono text-[11px] ${computed ? "italic text-muted-foreground/70" : "text-muted-foreground"}`}
    title={computed ? "Identifiant calculé : ajoute une colonne « ID » dans la feuille pour le figer" : value ? "Identifiant généré par Eraser" : "Identifiant en cours d’attribution"}
  >{value || "…"}</span>
}

/** Le nom qui ouvre la fiche (ou la page) de la ligne. */
export function NameFormCell({ value, onOpen, href, color }: { value: string; onOpen?: () => void; href?: string; color?: string }) {
  const content = <>
    {color && <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />}
    {/<[a-z]/i.test(value)
      // Un nom mis en forme (objets) garde sa mise en forme.
      ? <span className="min-w-0 truncate" dangerouslySetInnerHTML={{ __html: sanitizeRichText(value) }} />
      : <span className="min-w-0 truncate">{value || <span className="font-normal italic text-muted-foreground">Sans nom</span>}</span>}
  </>
  const className = "flex min-h-8 w-full items-center gap-2 rounded-md px-2 py-1.5 text-left font-semibold hover:bg-muted hover:text-primary hover:underline"
  if (href) return <Link href={href} className={className} title="Ouvrir">{content}</Link>
  return <button type="button" onClick={onOpen} className={className} title="Ouvrir la fiche">{content}</button>
}

// ---------------------------------------------------------------------------
// Liens automatiques et liens classés
// ---------------------------------------------------------------------------

export type AutoLink = { label: string; href: string; emphasis?: boolean; title?: string; color?: string }

/**
 * Liens automatiques : Eraser cherche lui-même où l'élément existe (les campagnes d'un
 * PNJ, les personnages d'une campagne…) et en fait des liens. Rien à saisir.
 */
export const AutoLinksCell = memo(function AutoLinksCell({ links }: { links: AutoLink[] }) {
  if (!links.length) return <span className="flex min-h-8 items-center px-2 text-xs text-muted-foreground">—</span>
  return <span className="flex min-h-8 flex-wrap items-center gap-1 px-1.5 py-1">
    {links.map((link) => <Link
      key={`${link.href}:${link.label}`}
      href={link.href}
      title={link.title}
      className={`rounded-full border px-2 py-0.5 text-xs font-medium hover:bg-primary hover:text-primary-foreground ${link.emphasis ? "border-primary/40 text-primary" : "text-muted-foreground"}`}
      style={link.color ? { color: link.color, borderColor: `${link.color}66` } : undefined}
    >{link.label}</Link>)}
  </span>
})

export type RankedOption = { id: string; name: string; color?: string }

/**
 * Liens classés : chaque lien est une pastille aux couleurs de l'élément relié, avec
 * son rang modifiable sur place ; un bouton ouvre une liste cherchable pour en ajouter.
 */
export function RankedLinksCell({ links, options, ranks, rankLabel, rankShort, isFull, addLabel = "Ajouter", fullLabel = "rang plein", compact = true, onChange }: {
  links: Record<string, number | null>
  options: RankedOption[]
  /** Les rangs possibles, dans l'ordre. */
  ranks: number[]
  rankLabel: (rank: number) => string
  rankShort: (rank: number) => string
  /** Le rang est-il plein pour cet élément ? */
  isFull?: (id: string, rank: number) => boolean
  addLabel?: string
  fullLabel?: string
  compact?: boolean
  onChange: (value: Record<string, number | null>) => void
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [rank, setRank] = useState(ranks[0] ?? 0)
  const linked = Object.entries(links).flatMap(([id, linkedRank]) => linkedRank === null ? [] : [[id, linkedRank] as const])
  const available = options.filter((item) => links[item.id] === undefined || links[item.id] === null)
  const matches = available.filter((item) => !foldName(query) || foldName(item.name).includes(foldName(query)))

  return <div className={`flex flex-wrap items-center gap-1 ${compact ? "" : "py-0.5"}`}>
    {linked.map(([id, linkedRank]) => {
      const option = options.find((item) => item.id === id)
      const accent = option?.color || "#7f5a3a"
      return <span key={id} className="inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[11px] font-semibold" style={{ borderColor: `${accent}55`, backgroundColor: `${accent}14`, color: accent }}>
        <span className="max-w-28 truncate">{option?.name || id}</span>
        <select
          aria-label={`Rang de ${option?.name || id}`}
          value={linkedRank}
          onChange={(event) => onChange({ ...links, [id]: Number(event.target.value) })}
          className="cursor-pointer rounded bg-transparent text-[11px] font-bold outline-none"
          style={{ color: accent }}
        >
          {ranks.map((candidate) => <option key={candidate} value={candidate} disabled={linkedRank !== candidate && Boolean(isFull?.(id, candidate))}>{rankShort(candidate)}</option>)}
        </select>
        <button type="button" onClick={() => onChange({ ...links, [id]: null })} className="rounded-full p-0.5 hover:bg-destructive/15 hover:text-destructive" aria-label={`Délier ${option?.name || id}`}><X className="size-3" /></button>
      </span>
    })}
    <Popover open={open} onOpenChange={(next) => { setOpen(next); if (next) { setQuery(""); setRank(ranks[0] ?? 0) } }}>
      <PopoverTrigger asChild>
        <button type="button" disabled={!available.length} className="inline-flex items-center gap-1 rounded-full border border-dashed px-2 py-0.5 text-[11px] font-semibold text-muted-foreground hover:border-primary hover:text-primary disabled:opacity-40" title={addLabel}><Plus className="size-3" />{addLabel}</button>
      </PopoverTrigger>
      {open && <PopoverContent align="start" className="w-72 p-0">
        <div className="flex items-center gap-2 border-b p-2">
          <div className="relative min-w-0 flex-1"><Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" /><Input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Chercher…" className="h-8 border-0 bg-muted/45 pl-8 text-sm shadow-none" /></div>
          <select aria-label="Rang du lien" value={rank} onChange={(event) => setRank(Number(event.target.value))} className="h-8 w-24 rounded-md border bg-background px-1 text-xs">{ranks.map((candidate) => <option key={candidate} value={candidate}>{rankLabel(candidate)}</option>)}</select>
        </div>
        <div className="max-h-60 overflow-y-auto p-1">
          {matches.map((item) => {
            const blocked = Boolean(isFull?.(item.id, rank))
            return <button key={item.id} type="button" disabled={blocked} onClick={() => { onChange({ ...links, [item.id]: rank }); setOpen(false) }} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent disabled:opacity-45" title={blocked ? fullLabel : undefined}>
              <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: item.color || "var(--primary)" }} />
              <span className="min-w-0 flex-1 truncate">{item.name}</span>
              {blocked && <span className="text-[10px] text-destructive">{fullLabel}</span>}
            </button>
          })}
          {!matches.length && <p className="px-3 py-5 text-center text-xs text-muted-foreground">Rien à ajouter.</p>}
        </div>
      </PopoverContent>}
    </Popover>
  </div>
}

// ---------------------------------------------------------------------------
// Images
// ---------------------------------------------------------------------------

/** Importe une image pour une colonne « Image ». Réimporter dans la même cellule la remplace. */
export async function uploadIndexImage(file: File, previous = "") {
  const form = new FormData()
  form.set("file", file)
  const id = previous.match(/\/api\/resources\/index-images\/([\w-]+)/)?.[1]
  if (id) form.set("id", id)
  const response = await fetch("/api/resources/index-images", { method: "POST", body: form })
  const payload = (await response.json().catch(() => ({}))) as { url?: string; error?: string }
  if (!response.ok || !payload.url) throw new Error(payload.error || "L’image n’a pas pu être importée.")
  return payload.url
}

/** Import, adresse collée, retrait : le même éditeur pour le tableau et la fiche. */
function ImageEditor({ value, onChange, onFile, upload: uploader = uploadIndexImage, disabled = false, preview, alt }: { value: string; onChange: (value: string) => void; onFile?: (file: File) => void; upload?: (file: File, previous: string) => Promise<string>; disabled?: boolean; preview?: string; alt: string }) {
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState("")
  const [url, setUrl] = useState(value)
  async function upload(file: File) {
    if (onFile) return onFile(file)
    setUploading(true); setError("")
    try { onChange(await uploader(file, value)) } catch (reason) { setError(reason instanceof Error ? reason.message : "Import impossible.") }
    setUploading(false)
  }
  return <div className="grid gap-2">
    <label className="inline-flex">
      <input type="file" accept="image/*" className="sr-only" disabled={disabled || uploading} onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file); event.target.value = "" }} />
      <span className="inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm font-medium hover:bg-muted">{uploading ? <LoaderCircle className="size-4 animate-spin" /> : <ImagePlus className="size-4" />}Importer une image</span>
    </label>
    <div className="flex gap-1">
      <div className="relative min-w-0 flex-1"><Link2 className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" /><Input
        value={url}
        disabled={disabled}
        onChange={(event) => setUrl(event.target.value)}
        onBlur={() => { if (url.trim() !== value.trim()) onChange(url.trim()) }}
        onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); onChange(url.trim()) } }}
        placeholder="…ou coller une URL"
        aria-label={`Adresse de ${alt}`}
        className="pl-8 text-xs"
      /></div>
      {(value || preview) && <Button type="button" variant="ghost" size="icon" disabled={disabled} onClick={() => { setUrl(""); onChange("") }} aria-label="Retirer l’image" title="Retirer l’image"><Trash2 /></Button>}
    </div>
    {error && <p className="text-xs text-destructive">{error}</p>}
  </div>
}

/** La colonne Image dans le tableau : une vignette ; un clic ouvre import et adresse. */
export const ImageCell = memo(function ImageCell({ label, value, disabled = false, preview, upload, onChange }: {
  label: string
  value: string
  disabled?: boolean
  /** Vignette propre à la colonne (l'icône d'Eraser d'un objet…). */
  preview?: ReactNode
  /** Import vers un rangement propre à la colonne (dossier « icone objet »…). */
  upload?: (file: File, previous: string) => Promise<string>
  onChange: (value: string) => void
}) {
  const [shown, setShown] = useOptimistic(value)
  const [open, setOpen] = useState(false)
  const change = (next: string) => { setShown(next); onChange(next) }
  return <Popover open={open} onOpenChange={setOpen}>
    <PopoverTrigger asChild>
      <button type="button" disabled={disabled} aria-label={label} title="Changer l’image" className="flex min-h-8 w-full items-center gap-2 rounded-md px-1.5 py-1 text-left hover:bg-muted">
        <span className="grid size-8 shrink-0 place-items-center overflow-hidden rounded-md border bg-muted/40">{preview ?? <IndexImage value={shown} alt={label} className="size-full text-lg" fallback={<ImagePlus className="size-3.5 text-muted-foreground/60" />} />}</span>
        {!shown.trim() && !preview && <span className="text-xs text-muted-foreground">—</span>}
      </button>
    </PopoverTrigger>
    {open && <PopoverContent align="start" className="w-72 p-3">
      <div className="mb-2 grid aspect-video place-items-center overflow-hidden rounded-lg border bg-muted/40">{preview ?? <IndexImage value={shown} alt={label} className="size-full text-5xl" fallback={<ImagePlus className="size-6 text-muted-foreground/60" />} />}</div>
      <ImageEditor value={shown} alt={label} disabled={disabled} upload={upload} onChange={change} />
    </PopoverContent>}
  </Popover>
})

/** La colonne Image dans une fiche : grand aperçu, import et adresse. */
export function ImageField({ label, value, onChange, onFile, upload, preview, placeholder, aspect = "aspect-[3/4]", disabled = false, children }: {
  label: string
  value: string
  onChange: (value: string) => void
  /** Import différé : la page garde le fichier et l'envoie elle-même à l'enregistrement. */
  onFile?: (file: File) => void
  /** Import vers un autre rangement que celui des index (portraits des créatures…). */
  upload?: (file: File, previous: string) => Promise<string>
  preview?: string
  placeholder?: ReactNode
  aspect?: string
  disabled?: boolean
  /** Ce qui suit l'éditeur (bouton du token…). */
  children?: ReactNode
}) {
  return <div className="grid content-start gap-3">
    <div className={`grid ${aspect} place-items-center overflow-hidden rounded-2xl border bg-muted/40`}>
      <IndexImage value={preview || value} alt={label} className="size-full text-6xl" fallback={placeholder ?? <ImagePlus className="size-8 text-muted-foreground/60" />} />
    </div>
    <ImageEditor key={value} value={value} alt={label} preview={preview} disabled={disabled} onChange={onChange} onFile={onFile} upload={upload} />
    {children}
  </div>
}

// ---------------------------------------------------------------------------
// Sélecteur de sorts : « Sorts des classes », « Sorts des créatures », ou les deux.
// ---------------------------------------------------------------------------

/** Les index de sorts d'une source. */
const spellIndexes: Record<SpellSource, SpellIndexKind[]> = { class: ["classes"], creature: ["creatures"], all: ["creatures", "classes"] }

/** Les sorts qu'on peut ajouter : ceux de la source, de la bonne catégorie. */
export function spellsFor(spells: SpellOption[], source: SpellSource, category?: "actif" | "passif") {
  return spells.filter((spell) => spellIndexes[source].includes(spell.source)
    && (category === "passif" ? spell.category === "passif" : category === "actif" ? spell.category !== "passif" : true))
}

/**
 * Sélecteur de sorts d'une fiche. On ajoute depuis la source de la colonne ; un sort
 * déjà inscrit qui vient d'un autre index garde tout de même sa carte. La feuille
 * garde les noms séparés par des virgules, lisibles dans Sheets.
 */
export function SpellsField({ label, value, source, category, onChange }: { label: string; value: string; source: SpellSource; category?: "actif" | "passif"; onChange: (value: string) => void }) {
  const { options, loading } = useSpellOptions(["creatures", "classes"])
  const allowed = useMemo(() => spellsFor(options, source, category), [category, options, source])
  const icon = category === "passif" ? <Sparkles className="size-3.5" /> : <Zap className="size-3.5" />
  return <SpellPicker label={label} icon={icon} value={value} options={allowed} known={options} loading={loading} onChange={onChange} />
}

/** Sélecteur de sorts dans le tableau : des pastilles, et un bouton pour en ajouter. */
export const SpellsCell = memo(function SpellsCell({ value, source, category, disabled = false, onChange }: { value: string; source: SpellSource; category?: "actif" | "passif"; disabled?: boolean; onChange: (value: string) => void }) {
  const [shown, setShown] = useOptimistic(value)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const { options, loading } = useSpellOptions(spellIndexes[source])
  const selected = splitNames(shown)
  const chosen = new Set(selected.map(foldName))
  const matches = spellsFor(options, source, category).filter((spell) => !chosen.has(foldName(spell.name)) && (!query.trim() || foldName(`${spell.name} ${spell.type}`).includes(foldName(query)))).slice(0, 60)
  const change = (next: string) => { setShown(next); onChange(next) }
  return <span className="flex min-h-8 flex-wrap items-center gap-1 px-1.5 py-1">
    {selected.map((name) => <span key={name} className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium">
      {name}
      <button type="button" disabled={disabled} onClick={() => change(selected.filter((item) => foldName(item) !== foldName(name)).join(", "))} className="rounded-full hover:text-destructive" aria-label={`Retirer ${name}`}><X className="size-3" /></button>
    </span>)}
    <Popover open={open} onOpenChange={(next) => { setOpen(next); if (!next) setQuery("") }}>
      <PopoverTrigger asChild><button type="button" disabled={disabled} className="inline-flex items-center gap-1 rounded-full border border-dashed px-2 py-0.5 text-[11px] font-semibold text-muted-foreground hover:border-primary hover:text-primary"><Plus className="size-3" />Sort</button></PopoverTrigger>
      {open && <PopoverContent className="w-80 p-2" align="start">
        <div className="relative"><Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" /><Input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Chercher un sort…" className="h-8 pl-8" /></div>
        <div className="mt-2 max-h-64 overflow-y-auto">
          {loading && <p className="flex items-center gap-2 px-2 py-3 text-xs text-muted-foreground"><LoaderCircle className="size-3.5 animate-spin" />Chargement des sorts…</p>}
          {!loading && !matches.length && <p className="px-2 py-3 text-xs text-muted-foreground">Aucun sort ne correspond.</p>}
          {matches.map((spell) => <button key={`${spell.source}:${spell.id || spell.name}`} type="button" onClick={() => { change([...selected, spell.name].join(", ")); setOpen(false) }} className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted">
            <span className="truncate">{spell.name}</span>
            <span className="shrink-0 text-[10px] uppercase tracking-wider text-muted-foreground">{spell.type || spell.category}</span>
          </button>)}
        </div>
      </PopoverContent>}
    </Popover>
  </span>
})

// ---------------------------------------------------------------------------
// Nombre : unités, monnaie, plage, pourcentage
// ---------------------------------------------------------------------------

/**
 * Un nombre dans le tableau. Le texte s'affiche proprement (« 1,5 PO », « 2–5 m ») ;
 * un clic permet de le récrire tel qu'on le pense (« 10 PC », « 3 à 5 km »). Pour une
 * unité convertible, la pastille de l'unité change l'unité de cette case, et le survol
 * donne la valeur dans toutes les unités (`showConversions`).
 */
export const NumberCell = memo(function NumberCell({ label, value, format, disabled = false, compact = true, showConversions = true, onChange }: {
  label: string
  value: string
  format: NumberFormat
  disabled?: boolean
  compact?: boolean
  showConversions?: boolean
  onChange: (value: string) => void
}) {
  const [shown, setShown] = useOptimistic(value)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState("")
  const [unitsOpen, setUnitsOpen] = useState(false)
  const parsed = parseIndexNumber(shown, format)
  const family = format.unit ?? "none"
  const units = unitsOf(family)
  const text = parsed ? formatIndexNumber(parsed, format) : shown.trim()
  const conversions = parsed && units.length && showConversions ? conversionsOf(parsed, format).map((item) => item.text).join(" · ") : undefined
  const change = (next: string) => { setShown(next); onChange(next) }

  function finish(commit: boolean) {
    setEditing(false)
    if (!commit) return
    const typed = draft.trim()
    if (typed === shown.trim()) return
    if (!typed) return change("")
    // Une saisie illisible reste telle quelle (en italique) plutôt que d'être perdue.
    const next = parseIndexNumber(typed, { ...format, defaultUnit: parsed?.unit ?? format.defaultUnit })
    change(next && !next.unknown ? formatIndexNumber(next, format, next.unit ?? parsed?.unit) : typed)
  }

  if (editing) return <Input
    autoFocus
    value={draft}
    aria-label={label}
    onChange={(event) => setDraft(event.target.value)}
    onBlur={() => finish(true)}
    onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); finish(true) } else if (event.key === "Escape") finish(false) }}
    placeholder={format.range ? "2–5" : units.length ? `12 ${format.defaultUnit ?? units[0].code}` : "0"}
    className={compact ? "h-8 border-transparent bg-background px-2 text-sm shadow-none" : ""}
  />

  const amountText = parsed && units.length ? text.replace(new RegExp(`\\s${parsed.unit ?? format.defaultUnit ?? ""}$`), "") : text
  const unit = parsed?.unit ?? (parsed ? findUnit(family, format.defaultUnit ?? "")?.code : undefined)
  return <span className={`flex min-h-8 w-full items-center gap-1.5 px-1 ${compact ? "" : "h-9 rounded-md border bg-background/50"}`} title={conversions}>
    <button
      type="button"
      disabled={disabled}
      onClick={() => { setDraft(shown.trim()); setEditing(true) }}
      className={`min-w-0 flex-1 truncate rounded-md px-1 py-1 text-right tabular-nums hover:bg-muted ${parsed && !parsed.unknown ? "" : "italic text-muted-foreground"}`}
      aria-label={`Modifier ${label}`}
    >{amountText || "—"}</button>
    {parsed && unit && units.length > 0 && <Popover open={unitsOpen} onOpenChange={setUnitsOpen}>
      <PopoverTrigger asChild>
        <button type="button" disabled={disabled} className={`shrink-0 rounded-md border px-1.5 py-0.5 text-[10px] font-bold ${unitTone(family, unit) ?? "bg-muted"}`} title={`${findUnit(family, unit)?.title ?? unit} — changer d’unité`}>{unit}</button>
      </PopoverTrigger>
      {unitsOpen && <PopoverContent align="end" className="w-56 p-1">
        {conversionsOf(parsed, format).map((item) => <button key={item.unit} type="button" onClick={() => { change(item.text); setUnitsOpen(false) }} className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent">
          <span className="tabular-nums">{item.text}</span>
          <span className="text-[11px] text-muted-foreground">{item.title}</span>
        </button>)}
      </PopoverContent>}
    </Popover>}
    {parsed?.corrected && <span className="shrink-0 text-[10px] text-amber-700" title="Pièces d’argent ou de bronze : lues comme des pièces de cuivre">PA→PC</span>}
  </span>
})

// ---------------------------------------------------------------------------
// Couleur
// ---------------------------------------------------------------------------

const colorPalette = ["#1f1b16", "#7f1d1d", "#b3261e", "#c2410c", "#b7791f", "#4d7c0f", "#315b55", "#285f8f", "#6b4c9a", "#9d174d", "#78716c", "#f5f5f4"]

function isColor(value: string) {
  return /^#[0-9a-f]{6}$/i.test(value.trim())
}

export const ColorCell = memo(function ColorCell({ label, value, disabled = false, onChange }: { label: string; value: string; disabled?: boolean; onChange: (value: string) => void }) {
  const [shown, setShown] = useOptimistic(value)
  const [open, setOpen] = useState(false)
  const color = shown.trim()
  const change = (next: string) => { setShown(next); onChange(next) }
  // Le sélecteur de couleur change à chaque mouvement : l'aperçu suit, et Google Sheets
  // ne reçoit qu'une écriture, quand la fenêtre se ferme (sinon il refuse, trop d'écritures).
  const preview = (next: string) => setShown(next)
  const toggle = (next: boolean) => {
    setOpen(next)
    if (next || color === value.trim()) return
    if (isColor(color) || !color) onChange(color)
    else setShown(value)
  }
  return <Popover open={open} onOpenChange={toggle}>
    <PopoverTrigger asChild>
      <button type="button" disabled={disabled} aria-label={label} className="flex min-h-8 w-full items-center gap-2 rounded-md px-2 text-left text-xs hover:bg-muted">
        <span className="size-4 shrink-0 rounded-full border" style={isColor(color) ? { backgroundColor: color } : undefined} />
        <span className="truncate font-mono text-muted-foreground">{color || "—"}</span>
      </button>
    </PopoverTrigger>
    {open && <PopoverContent align="start" className="w-56 p-2">
      <div className="grid grid-cols-6 gap-1.5">
        {colorPalette.map((swatch) => <button key={swatch} type="button" onClick={() => { change(swatch); setOpen(false) }} className={`size-7 rounded-full border ${swatch === color ? "ring-2 ring-primary ring-offset-1" : ""}`} style={{ backgroundColor: swatch }} aria-label={swatch} />)}
      </div>
      <div className="mt-2 flex items-center gap-2">
        <input type="color" value={isColor(color) ? color : "#927640"} onChange={(event) => preview(event.target.value)} className="h-8 w-10 cursor-pointer rounded border bg-transparent" aria-label="Autre couleur" />
        <Input value={color} onChange={(event) => preview(event.target.value)} placeholder="#927640" className="h-8 font-mono text-xs" />
        {color && <Button type="button" variant="ghost" size="icon-sm" onClick={() => change("")} aria-label="Retirer la couleur"><X /></Button>}
      </div>
    </PopoverContent>}
  </Popover>
})

// ---------------------------------------------------------------------------
// Fichier : un ou plusieurs, images, sons, PDF…
// ---------------------------------------------------------------------------

/** Les fichiers d'une cellule : une adresse par ligne. */
export function splitFiles(value: string) {
  return value.split(/\n+/).map((item) => item.trim()).filter(Boolean)
}

type FileInfo = { url: string; name: string; family: "image" | "audio" | "video" | "pdf" | "file" }

function fileInfo(url: string): FileInfo {
  let name = ""
  let family = ""
  try {
    const parsed = new URL(url, "http://local")
    name = parsed.searchParams.get("n") ?? decodeURIComponent(parsed.pathname.split("/").pop() ?? "")
    family = parsed.searchParams.get("t") ?? ""
  } catch { name = url }
  const extension = name.split(".").pop()?.toLowerCase() ?? url.split("?")[0].split(".").pop()?.toLowerCase() ?? ""
  if (!family) family = /^(png|jpe?g|gif|webp|avif|svg)$/.test(extension) || url.startsWith("data:image/") || /\/api\/(resources\/(index-images|creature-portraits)|items\/icons)\//.test(url) ? "image"
    : /^(mp3|ogg|wav|m4a|flac|opus)$/.test(extension) ? "audio"
    : /^(mp4|webm|mov)$/.test(extension) ? "video"
    : extension === "pdf" ? "pdf" : "file"
  return { url, name: name || url, family: family as FileInfo["family"] }
}

/** Importe un fichier pour une colonne Fichier, dans le Drive comme les images. */
export async function uploadIndexFile(file: File, accept: FileAccept) {
  const form = new FormData()
  form.set("file", file)
  form.set("accept", accept)
  const response = await fetch("/api/resources/index-files", { method: "POST", body: form })
  const payload = (await response.json().catch(() => ({}))) as { url?: string; error?: string }
  if (!response.ok || !payload.url) throw new Error(payload.error || "Le fichier n’a pas pu être importé.")
  return payload.url
}

function FileGlyph({ info, className = "size-8" }: { info: FileInfo; className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  if (info.family === "image") return <img src={info.url} alt="" loading="lazy" decoding="async" className={`${className} rounded-md border object-cover`} />
  const Icon = info.family === "audio" ? Music : info.family === "video" ? Film : info.family === "pdf" ? FileText : FileIcon
  return <span className={`${className} grid shrink-0 place-items-center rounded-md border bg-muted/50 text-muted-foreground`}><Icon className="size-4" /></span>
}

/** La liste des fichiers d'une cellule, avec aperçu, import, adresse et retrait. */
function FilesEditor({ files, accept, multiple, disabled = false, onChange }: { files: string[]; accept: FileAccept; multiple: boolean; disabled?: boolean; onChange: (files: string[]) => void }) {
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState("")
  const [url, setUrl] = useState("")
  async function upload(list: FileList) {
    setUploading(true); setError("")
    try {
      const added: string[] = []
      for (const file of [...list].slice(0, multiple ? 20 : 1)) added.push(await uploadIndexFile(file, accept))
      onChange(multiple ? [...files, ...added] : added.slice(0, 1))
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Import impossible.") }
    setUploading(false)
  }
  function addUrl() {
    const clean = url.trim()
    if (!clean) return
    onChange(multiple ? [...files, clean] : [clean])
    setUrl("")
  }
  return <div className="grid gap-2">
    {files.length > 0 && <ul className="grid max-h-64 gap-1.5 overflow-y-auto">
      {files.map((item, index) => {
        const info = fileInfo(item)
        return <li key={`${item}:${index}`} className="grid gap-1 rounded-lg border bg-background/50 p-1.5">
          <div className="flex items-center gap-2">
            <FileGlyph info={info} />
            <a href={item} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate text-xs hover:underline">{info.name}</a>
            <Button type="button" variant="ghost" size="icon-sm" disabled={disabled} onClick={() => onChange(files.filter((_, position) => position !== index))} aria-label={`Retirer ${info.name}`}><X /></Button>
          </div>
          {info.family === "audio" && <audio controls preload="none" src={item} className="h-8 w-full" />}
          {info.family === "video" && <video controls preload="none" src={item} className="max-h-40 w-full rounded" />}
        </li>
      })}
    </ul>}
    <label className="inline-flex">
      <input type="file" accept={fileAcceptInput[accept] || undefined} multiple={multiple} className="sr-only" disabled={disabled || uploading} onChange={(event) => { if (event.target.files?.length) void upload(event.target.files); event.target.value = "" }} />
      <span className="inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm font-medium hover:bg-muted">{uploading ? <LoaderCircle className="size-4 animate-spin" /> : <Upload className="size-4" />}{multiple ? "Importer des fichiers" : files.length ? "Remplacer le fichier" : "Importer un fichier"}</span>
    </label>
    <div className="relative"><Link2 className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" /><Input value={url} disabled={disabled} onChange={(event) => setUrl(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addUrl() } }} onBlur={addUrl} placeholder="…ou coller une URL" className="pl-8 text-xs" /></div>
    <p className="text-[11px] text-muted-foreground">{fileAcceptLabels[accept]} · {multiple ? "plusieurs fichiers" : "un seul fichier"}</p>
    {error && <p className="text-xs text-destructive">{error}</p>}
  </div>
}

/**
 * La colonne Fichier dans le tableau : des vignettes (une galerie si plusieurs images),
 * un clic ouvre la liste. Une seule image garde la cellule Image et son import propre.
 */
export const FileCell = memo(function FileCell({ label, value, accept, multiple = false, disabled = false, preview, upload, onChange }: {
  label: string
  value: string
  accept: FileAccept
  multiple?: boolean
  disabled?: boolean
  preview?: ReactNode
  upload?: (file: File, previous: string) => Promise<string>
  onChange: (value: string) => void
}) {
  const [shown, setShown] = useOptimistic(value)
  const [open, setOpen] = useState(false)
  if (accept === "image" && !multiple) return <ImageCell label={label} value={value} disabled={disabled} preview={preview} upload={upload} onChange={onChange} />
  const files = splitFiles(shown)
  const change = (next: string[]) => { const joined = next.join("\n"); setShown(joined); onChange(joined) }
  return <Popover open={open} onOpenChange={setOpen}>
    <PopoverTrigger asChild>
      <button type="button" disabled={disabled} aria-label={label} className="flex min-h-8 w-full items-center gap-1 overflow-hidden rounded-md px-1.5 py-1 text-left hover:bg-muted">
        {files.slice(0, 5).map((item, index) => <FileGlyph key={`${item}:${index}`} info={fileInfo(item)} className="size-7" />)}
        {files.length > 5 && <span className="text-[11px] text-muted-foreground">+{files.length - 5}</span>}
        {!files.length && <span className="flex items-center gap-1 text-xs text-muted-foreground"><Paperclip className="size-3.5" />—</span>}
      </button>
    </PopoverTrigger>
    {open && <PopoverContent align="start" className="w-80 p-3"><FilesEditor files={files} accept={accept} multiple={multiple} disabled={disabled} onChange={change} /></PopoverContent>}
  </Popover>
})

// ---------------------------------------------------------------------------
// Recherche et Agrégat : calculés à partir des lignes reliées
// ---------------------------------------------------------------------------

export const ComputedCell = memo(function ComputedCell({ values, pills = false }: { values: string[]; pills?: boolean }) {
  if (!values.length || values.every((value) => !value.trim())) return <span className="flex min-h-8 items-center px-2 text-xs text-muted-foreground">—</span>
  if (!pills) return <span className="flex min-h-8 items-center px-2 text-sm tabular-nums" title="Calculé par Eraser">{values.join(" · ")}</span>
  return <span className="flex min-h-8 flex-wrap items-center gap-1 px-1.5 py-1" title="Calculé par Eraser à partir des lignes reliées">
    {values.map((value, index) => <span key={`${value}:${index}`} className="max-w-full truncate rounded-full border bg-muted/40 px-2 py-0.5 text-[11px]">{value}</span>)}
  </span>
})

// ---------------------------------------------------------------------------
// Le constructeur de colonnes : un type → une colonne de la grille.
// ---------------------------------------------------------------------------

export type IndexColumnContext = {
  valueOf: (rowKey: string, columnKey: string) => string
  commit: (rowKey: string, columnKey: string, value: string) => void
  disabled?: boolean
  /** Nom formulaire : ouvre la fiche de la ligne… */
  openForm?: (rowKey: string) => void
  /** …ou la page de la ligne. */
  hrefOf?: (rowKey: string) => string
  colorOf?: (rowKey: string) => string | undefined
  /** Liens automatiques d'une ligne. */
  autoLinks?: (rowKey: string) => AutoLink[]
  /** Identifiant calculé (absent de la feuille). */
  idComputed?: (rowKey: string) => boolean
  /** Ligne consultable seulement (PNJ d'une campagne qu'on ne mène pas…). */
  lockedRow?: (rowKey: string) => boolean
  /** Recherche et Agrégat : les valeurs calculées d'une cellule. */
  computed?: (rowKey: string, columnKey: string, spec: IndexColumnSpec) => string[]
  /** Formule : le résultat d'une cellule. */
  formula?: (rowKey: string, columnKey: string, spec: IndexColumnSpec) => FormulaDisplay
  /** Jauge « maximum lu dans une autre colonne » : le maximum de la ligne. */
  gaugeMax?: (rowKey: string, spec: IndexColumnSpec) => number | null
  /** Aléatoire : tire et enregistre. */
  draw?: (rowKey: string, columnKey: string, spec: IndexColumnSpec) => Promise<void>
  /** Boutons : visibles sur la ligne, et leur exécution. */
  buttonVisible?: (rowKey: string, button: ActionButton) => boolean
  runButton?: (rowKey: string, button: ActionButton) => Promise<void>
  /** Nombre : montrer les conversions au survol (le MJ seulement dans une boutique). */
  showConversions?: boolean
  /** Rangement en onglets : les onglets de l'index, proposés dans la liste. */
  tabNames?: string[]
}

/**
 * La colonne de grille d'un type. Tous les index passent par ici : un même type se
 * comporte partout de la même façon (enregistrement, copier-coller, tri, apparence).
 */
export function indexGridColumn(key: string, label: string, input: IndexColumnSpec, width: number, context: IndexColumnContext, extra: Partial<SheetGridColumn> & {
  /** Rendu propre d'une valeur : pastille d'une liste, vignette d'une image. */
  renderValue?: (value: string, rowKey?: string) => ReactNode
  /** Colonne Image : import propre à la colonne. */
  upload?: (file: File, previous: string, rowKey: string) => Promise<string>
} = {}): SheetGridColumn {
  const spec = normalizeSpec(input)
  const rich = isRichSpec(spec)
  const look = columnStyleCss(spec.style)
  const column: SheetGridColumn = {
    key,
    label: spec.kind === "linked" ? `${label} ↔` : label,
    width,
    typeLabel: columnTypeLabel(input),
    plain: !rich,
    hidden: spec.hidden,
    description: spec.description,
    cellClassName: look.className || undefined,
    cellStyle: Object.keys(look.style).length ? look.style : undefined,
  }
  const { valueOf, commit } = context
  const off = (rowKey: string) => Boolean(context.disabled || context.lockedRow?.(rowKey))
  switch (spec.kind) {
    case "name":
    case "linked":
      // Les noms et les colonnes liées déclenchent des liens : on attend la sortie de la
      // cellule, sinon un nom à moitié tapé (« Yfl ») créerait une entité.
      column.commitDelay = Infinity
      break
    case "name-form":
      column.control = (rowKey) => <NameFormCell value={valueOf(rowKey, key)} onOpen={context.openForm ? () => context.openForm?.(rowKey) : undefined} href={context.hrefOf?.(rowKey)} color={context.colorOf?.(rowKey)} />
      break
    case "id":
      column.control = (rowKey) => <IdCell value={valueOf(rowKey, key)} computed={context.idComputed?.(rowKey)} />
      // Un identifiant n'est jamais recopié ni collé : il doit rester unique.
      column.computed = true
      break
    case "choice":
      column.control = (rowKey) => <ChoiceCell label={label} value={valueOf(rowKey, key)} options={spec.options ?? []} allowCustom={spec.allowCustom} multiple={spec.multiple} groups={spec.groups} disabled={off(rowKey)} renderValue={extra.renderValue} onChange={(value) => commit(rowKey, key, value)} />
      break
    case "linked-choice":
      if (spec.source) { const source = spec.source; column.control = (rowKey) => <LinkedChoicePicker label={label} source={source} multiple={spec.multiple} value={valueOf(rowKey, key)} disabled={off(rowKey)} onChange={(value) => commit(rowKey, key, value)} /> }
      break
    case "checkbox":
      column.control = (rowKey) => <CheckCell label={label} value={valueOf(rowKey, key)} emptyChecked={spec.emptyChecked} disabled={off(rowKey)} onChange={(value) => commit(rowKey, key, value)} />
      break
    case "auto-links":
      column.control = (rowKey) => <AutoLinksCell links={context.autoLinks?.(rowKey) ?? []} />
      column.computed = true
      break
    case "file":
      column.control = (rowKey) => <FileCell
        label={label}
        value={valueOf(rowKey, key)}
        accept={spec.file?.accept ?? "any"}
        multiple={spec.file?.multiple}
        disabled={off(rowKey)}
        preview={extra.renderValue?.(valueOf(rowKey, key), rowKey)}
        upload={extra.upload ? (file, previous) => extra.upload!(file, previous, rowKey) : undefined}
        onChange={(value) => commit(rowKey, key, value)}
      />
      break
    case "number":
      column.control = (rowKey) => <NumberCell label={label} value={valueOf(rowKey, key)} format={spec.number ?? {}} showConversions={context.showConversions ?? true} disabled={off(rowKey)} onChange={(value) => commit(rowKey, key, value)} />
      column.sortKey = (value) => numberSortKey(value, spec.number ?? {})
      break
    case "color":
      column.control = (rowKey) => <ColorCell label={label} value={valueOf(rowKey, key)} disabled={off(rowKey)} onChange={(value) => commit(rowKey, key, value)} />
      break
    case "tab-sort": {
      // Une valeur nouvelle crée l'onglet : la liste accepte un nom qui n'y est pas encore.
      const options = (context.tabNames ?? []).map((value) => ({ value }))
      column.control = (rowKey) => <ChoiceCell label={label} value={valueOf(rowKey, key)} options={options} allowCustom disabled={off(rowKey)} renderValue={extra.renderValue} onChange={(value) => commit(rowKey, key, value)} />
      break
    }
    case "lookup":
    case "rollup":
      column.control = (rowKey) => <ComputedCell values={context.computed?.(rowKey, key, spec) ?? []} pills={spec.kind === "lookup"} />
      column.computed = true
      break
    case "formula":
      column.control = (rowKey) => <FormulaCell display={context.formula?.(rowKey, key, spec) ?? { kind: "text", text: "" }} />
      column.computed = true
      column.sortKey = (value) => { const number = Number.parseFloat(value.replace(/\s/g, "").replace(",", ".")); return Number.isFinite(number) && /^-?[\d\s.,]+/.test(value) ? number : value }
      break
    case "random":
      column.control = (rowKey) => <RandomCell label={label} value={valueOf(rowKey, key)} settings={spec.random ?? { source: "number" }} disabled={off(rowKey) || !context.draw} onDraw={() => context.draw ? context.draw(rowKey, key, spec) : Promise.resolve()} />
      break
    case "actions":
      column.control = (rowKey) => <ActionsCell buttons={spec.actions ?? []} disabled={off(rowKey) || !context.runButton} visible={(button) => context.buttonVisible ? context.buttonVisible(rowKey, button) : true} onRun={(button) => context.runButton ? context.runButton(rowKey, button) : Promise.resolve()} />
      column.computed = true
      column.sortable = false
      break
    case "spells":
      column.control = (rowKey) => <SpellsCell value={valueOf(rowKey, key)} source={spec.spells?.source ?? "all"} category={spec.spells?.category} disabled={off(rowKey)} onChange={(value) => commit(rowKey, key, value)} />
      break
    case "gauge": {
      const settings = spec.gauge ?? { style: "bar", max: 10 }
      column.control = (rowKey) => <GaugeCell label={label} value={valueOf(rowKey, key)} settings={settings} maxValue={gaugeScaleOf(settings) === "from-column" ? context.gaugeMax?.(rowKey, spec) ?? null : undefined} disabled={off(rowKey)} onChange={(value) => commit(rowKey, key, value)} />
      column.sortKey = (value) => { const number = Number.parseFloat(value.replace(",", ".")); return Number.isFinite(number) ? number : Number.POSITIVE_INFINITY }
      break
    }
    case "ranked-links":
    case "tab":
      // Contrôles propres à la page : la grille les dessine par `renderCustomCell`.
      column.custom = true
      column.sortable = false
      break
    default:
      break
  }
  const { renderValue, upload, ...rest } = extra
  void renderValue; void upload
  return { ...column, ...rest }
}

// ---------------------------------------------------------------------------
// Les champs de formulaire : un type → un champ.
// ---------------------------------------------------------------------------

export type IndexFieldProps = {
  label: string
  spec: IndexColumnSpec
  value: string
  onChange: (value: string) => void
  /** Texte long (description, note…) : un champ plus haut sur toute la largeur. */
  long?: boolean
  autoFocus?: boolean
  placeholder?: string
  disabled?: boolean
  /** Colonne liée : les noms séparés par des virgules. */
  linkedHint?: boolean
  /** Dans une fiche : les colonnes calculées, les tirages et les boutons de la ligne. */
  row?: {
    formula?: (spec: IndexColumnSpec) => FormulaDisplay
    computed?: (spec: IndexColumnSpec) => string[]
    gaugeMax?: (spec: IndexColumnSpec) => number | null
    draw?: (spec: IndexColumnSpec) => Promise<void>
    buttonVisible?: (button: ActionButton) => boolean
    runButton?: (button: ActionButton) => Promise<void>
    /** Rangement en onglets : les onglets de l'index. */
    tabNames?: string[]
  }
}

const fieldLabel = "grid content-start gap-1 text-xs font-semibold"

export function IndexField({ label, spec: input, value, onChange, long = false, autoFocus = false, placeholder, disabled = false, row }: IndexFieldProps) {
  const spec = normalizeSpec(input)
  const look = columnStyleCss(spec.style)
  const title = <span className="flex items-center gap-1">{label}{spec.kind === "linked" && <Link2 className="size-3 text-primary" aria-label="Colonne liée" />}{spec.description && <span className="font-normal text-muted-foreground" title={spec.description}>ⓘ</span>}</span>
  switch (spec.kind) {
    case "choice":
      return <div className={fieldLabel}>{title}<ChoicePicker compact={false} label={label} value={value} options={spec.options ?? []} allowCustom={spec.allowCustom} multiple={spec.multiple} groups={spec.groups} disabled={disabled} onChange={onChange} /></div>
    case "tab-sort":
      return <div className={fieldLabel}>{title}<ChoicePicker compact={false} label={label} value={value} options={(row?.tabNames ?? []).map((name) => ({ value: name }))} allowCustom disabled={disabled} onChange={onChange} /></div>
    case "linked-choice":
      return spec.source ? <div className={fieldLabel}>{title}<LinkedChoicePicker compact={false} label={label} source={spec.source} multiple={spec.multiple} value={value} disabled={disabled} onChange={onChange} /></div> : null
    case "checkbox":
      return <label className="flex h-9 items-center gap-2 self-end rounded-lg border bg-background/50 px-3 text-sm font-semibold"><Checkbox checked={isCheckedValue(value, spec.emptyChecked)} disabled={disabled} onCheckedChange={(checked) => onChange(checkboxValue(checked === true, value))} />{label}</label>
    case "file":
      return spec.file?.accept === "image" && !spec.file.multiple
        ? <div className={fieldLabel}>{title}<ImageField label={label} value={value} onChange={onChange} aspect="aspect-video" disabled={disabled} /></div>
        : <div className={`${fieldLabel} ${spec.file?.multiple ? "md:col-span-2" : ""}`}>{title}<span className="rounded-lg border bg-background/50 p-2"><FilesEditor files={splitFiles(value)} accept={spec.file?.accept ?? "any"} multiple={Boolean(spec.file?.multiple)} disabled={disabled} onChange={(files) => onChange(files.join("\n"))} /></span></div>
    case "color":
      return <div className={fieldLabel}>{title}<span className="rounded-lg border bg-background/50"><ColorCell label={label} value={value} disabled={disabled} onChange={onChange} /></span></div>
    case "spells":
      return <div className="md:col-span-2"><SpellsField label={label} value={value} source={spec.spells?.source ?? "all"} category={spec.spells?.category} onChange={onChange} /></div>
    case "gauge": {
      const settings = spec.gauge ?? { style: "bar" as const, max: 10 }
      return <div className={fieldLabel}>{title}<span className="rounded-lg border bg-background/50"><GaugeCell label={label} value={value} settings={settings} maxValue={gaugeScaleOf(settings) === "from-column" ? row?.gaugeMax?.(spec) ?? null : undefined} disabled={disabled} onChange={onChange} /></span></div>
    }
    case "number":
      return spec.number
        ? <div className={fieldLabel}>{title}<NumberCell compact={false} label={label} value={value} format={spec.number} disabled={disabled} onChange={onChange} /></div>
        : <label className={fieldLabel}>{title}<Input type="number" min={spec.min} max={spec.max} value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} /></label>
    case "id":
      return <label className={fieldLabel}>{title}<Input value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} placeholder="Généré si vide" className="font-mono text-xs" /></label>
    case "formula":
      return row?.formula ? <div className={fieldLabel}>{title}<span className="rounded-lg border border-dashed bg-muted/20"><FormulaCell display={row.formula(spec)} /></span></div> : null
    case "lookup":
    case "rollup":
      return row?.computed ? <div className={fieldLabel}>{title}<span className="rounded-lg border border-dashed bg-muted/20"><ComputedCell values={row.computed(spec)} pills={spec.kind === "lookup"} /></span></div> : null
    case "random":
      return <div className={fieldLabel}>{title}<span className="rounded-lg border bg-background/50"><RandomCell label={label} value={value} settings={spec.random ?? { source: "number" }} disabled={disabled || !row?.draw} onDraw={() => row?.draw ? row.draw(spec) : Promise.resolve()} /></span></div>
    case "actions":
      return row?.runButton ? <div className={`${fieldLabel} md:col-span-2`}>{title}<ActionsCell buttons={spec.actions ?? []} disabled={disabled} visible={(button) => row.buttonVisible ? row.buttonVisible(button) : true} onRun={(button) => row.runButton!(button)} /></div> : null
    case "auto-links":
    case "ranked-links":
    case "tab":
    case "archived":
      return null
    default: {
      const rich = isRichSpec(spec)
      if (!rich) return <label className={fieldLabel}>{title}<Input autoFocus={autoFocus} value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} placeholder={placeholder ?? (spec.kind === "linked" ? "Noms séparés par des virgules" : undefined)} className={look.className} style={look.style} /></label>
      return <div className={`${fieldLabel} ${long ? "md:col-span-2" : ""}`}>{title}<RichTextField ariaLabel={label} value={value} onCommit={onChange} disabled={disabled} placeholder={placeholder ?? (spec.kind === "linked" ? "Noms séparés par des virgules" : undefined)} minHeight={long ? "min-h-24" : "min-h-9"} /></div>
    }
  }
}

export type IndexFormField = { key: string; label: string; spec: IndexColumnSpec; long?: boolean }

/**
 * Le formulaire d'ajout d'une ligne, construit à partir des colonnes et de leur type :
 * chaque index a les siennes, il n'y a donc pas de formulaire figé à écrire.
 */
export function IndexEntryForm({ title, fields, pending, leading, onCancel, onSave }: {
  title: string
  fields: IndexFormField[]
  pending: boolean
  /** Champ propre à la page, placé en tête (l'onglet de la vue « Tout »…). */
  leading?: ReactNode
  onCancel: () => void
  onSave: (values: Record<string, string>) => void
}) {
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(fields.map((field) => [field.key, ""])))
  const nameField = fields.find((field) => field.spec.kind === "name" || field.spec.kind === "name-form")
  const named = !nameField || (values[nameField.key] ?? "").replace(/<[^>]+>/g, "").trim().length > 0
  return <section className="rounded-2xl border bg-card/90 p-4 shadow-sm">
    <div className="flex items-center justify-between gap-3">
      <h3 className="font-display text-xl font-semibold">{title}</h3>
      <Button type="button" variant="ghost" size="icon-sm" onClick={onCancel} aria-label="Fermer"><X /></Button>
    </div>
    <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      {leading}
      {fields.map((field) => <IndexField
        key={field.key}
        label={field.label}
        // Dans le formulaire, le nom se saisit toujours : il n'ouvre pas de fiche.
        spec={field.spec.kind === "name-form" ? { ...field.spec, kind: "name" } : field.spec}
        value={values[field.key] ?? ""}
        long={field.long}
        autoFocus={field === nameField}
        onChange={(value) => setValues((current) => ({ ...current, [field.key]: value }))}
      />)}
    </div>
    <div className="mt-4 flex justify-end gap-2">
      <Button type="button" variant="outline" onClick={onCancel}>Annuler</Button>
      <Button type="button" onClick={() => onSave(values)} disabled={pending || !named}>{pending ? <LoaderCircle className="animate-spin" /> : <Check />}Enregistrer</Button>
    </div>
  </section>
}
