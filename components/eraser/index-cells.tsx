"use client"

import { memo, useEffect, useMemo, useState, type ReactNode } from "react"
import Link from "next/link"
import { Check, ChevronDown, File as FileIcon, FileText, Film, ImagePlus, Music, Paperclip, Upload, Link2, LoaderCircle, Minus, Plus, Search, Sparkle, Sparkles, Trash2, X, Zap } from "lucide-react"

import { IndexImage } from "@/components/eraser/index-image"
import { RichTextField } from "@/components/eraser/rich-text"
import { nextSpellChargeValue } from "@/components/eraser/spell-charges"
import { SpellPicker, useSpellOptions, type SpellOption } from "@/components/eraser/spell-picker"
import type { SheetGridColumn } from "@/components/eraser/sheet-grid"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import type { SpellIndexKind } from "@/lib/class-content"
import { conversionsOf, findUnit, formatIndexNumber, numberSortKey, parseIndexNumber, unitsOf, unitTone, type NumberFormat } from "@/lib/index-numbers"
import {
  checkboxValue,
  columnTypeLabel,
  fileAcceptInput,
  fileAcceptLabels,
  type FileAccept,
  foldName,
  isCheckedValue,
  isRichSpec,
  kindsOf,
  matchChoice,
  type ChoiceOption,
  type IndexColumnSpec,
  type SpellSource,
} from "@/lib/index-columns"
import { isBuiltinWorldIndexKey, splitNames, worldIndexDefinitions, type WorldIndexKey } from "@/lib/world-index-definitions"

/*
 * Le moteur de cellules de tous les index. Chaque type de colonne (lib/index-columns.ts)
 * a ici sa cellule de tableau et son champ de formulaire ; les pages ne décrivent plus
 * que leurs colonnes et la façon d'enregistrer une valeur.
 */

export { isCheckedValue as isChecked, IndexImage }

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
  /** Liste liée : une valeur absente est créée dans l'index source. */
  onCreate?: (value: string) => Promise<void>
  createLabel?: string
  compact?: boolean
  /** Rendu de la valeur fermée (pastille colorée d'un type de sort…). */
  renderValue?: (value: string) => ReactNode
}

/**
 * Le sélecteur d'une liste. Fermé, ce n'est qu'un bouton : le menu n'est monté qu'au
 * clic (des centaines de menus montés d'avance rendaient le tableau interminable).
 * Une valeur écrite autrement dans la feuille (« Aggressif ») est reconnue ; une valeur
 * hors liste reste affichée en italique, pour ne jamais être effacée par mégarde.
 */
export function ChoicePicker({ label, value, options, onChange, disabled = false, loading = false, allowCustom = false, onCreate, createLabel, compact = true, renderValue }: PickerProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [creating, setCreating] = useState(false)
  const trimmed = value.trim()
  const matched = matchChoice(trimmed, options)
  const current = matched?.value ?? trimmed
  const outside = Boolean(trimmed) && !matched
  const folded = foldName(query)
  const shown = options.filter((option) => !folded || foldName(`${option.value} ${option.hint ?? ""}`).includes(folded)).slice(0, 200)
  const exact = query.trim() && options.some((option) => foldName(option.value) === folded)
  const canCreate = Boolean(query.trim()) && !exact && (allowCustom || onCreate)

  function choose(next: string) {
    onChange(next)
    setOpen(false)
    setQuery("")
  }

  async function create(name: string) {
    if (!onCreate) return choose(name)
    setCreating(true)
    try { await onCreate(name); choose(name) } finally { setCreating(false) }
  }

  return <Popover open={open} onOpenChange={(next) => { setOpen(next); if (!next) setQuery("") }}>
    <PopoverTrigger asChild>
      <button type="button" aria-label={label} disabled={disabled} title={matched?.hint ?? (outside ? "Valeur hors de la liste" : undefined)} className={compact ? cellButton : `${cellButton} h-9 border-input bg-background/50`}>
        <span className={`min-w-0 truncate ${outside ? "italic text-muted-foreground" : ""}`}>{current ? renderValue?.(current) ?? current : "—"}</span>
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
      /></div></div>
      <div className="max-h-64 overflow-y-auto p-1">
        <button type="button" onClick={() => choose("")} className="flex w-full rounded-md px-2 py-1.5 text-left text-sm text-muted-foreground hover:bg-accent">—</button>
        {outside && !folded && <div className="flex items-center gap-1">
          <button type="button" onClick={() => choose(trimmed)} className="min-w-0 flex-1 truncate rounded-md px-2 py-1.5 text-left text-sm italic text-muted-foreground hover:bg-accent" title="Valeur actuelle de la feuille, hors de la liste">{trimmed}</button>
          {onCreate && <button type="button" disabled={creating} onClick={() => void create(trimmed)} className="shrink-0 rounded-md px-2 py-1 text-[11px] font-semibold text-primary hover:bg-primary/10">Créer</button>}
        </div>}
        {loading && <p className="flex items-center gap-2 px-2 py-2 text-xs text-muted-foreground"><LoaderCircle className="size-3.5 animate-spin" />Chargement…</p>}
        {shown.map((option) => <button key={option.value} type="button" onClick={() => choose(option.value)} className="group flex w-full flex-col items-start rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent">
          <span className="flex w-full items-center justify-between gap-2"><span className="truncate">{renderValue?.(option.value) ?? option.value}</span>{option.value === current && <Check className="size-3.5 shrink-0" />}</span>
          {option.hint && <span className="hidden text-xs text-muted-foreground group-hover:block">{option.hint}</span>}
        </button>)}
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

function sourceKey(source: { index: WorldIndexKey; tab: string }) {
  return `${source.index}:${source.tab}`
}

export function loadWorldIndexNames(source: { index: WorldIndexKey; tab: string }) {
  const key = sourceKey(source)
  let promise = namesCache.get(key)
  if (!promise) {
    promise = loadWorldIndexData(source.index).then((data) => {
      // Une liste liée propose les noms de tous les onglets de l'index : un lieu peut être une ville comme un pays.
      const names = (data?.tables ?? []).flatMap((table) => {
        const column = table.headers.findIndex((header) => foldName(header) === "nom")
        return column >= 0 ? table.rows.map((row) => row.values[column]?.trim() ?? "") : []
      })
      return [...new Set(names.filter(Boolean))].sort((left, right) => left.localeCompare(right, "fr"))
    })
    namesCache.set(key, promise)
  }
  return promise
}

/** Crée le nom dans l'index source s'il n'y est pas encore. */
export async function ensureWorldIndexName(source: { index: WorldIndexKey; tab: string }, name: string) {
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
}

function useWorldIndexNames(source: { index: WorldIndexKey; tab: string }) {
  const [names, setNames] = useState<string[] | null>(null)
  useEffect(() => {
    let alive = true
    void loadWorldIndexNames(source).then((loaded) => { if (alive) setNames(loaded) })
    return () => { alive = false }
  }, [source])
  return names
}

/**
 * Liste déroulante liée : les noms viennent d'un autre index (les peuples d'un PNJ…).
 * Choisir ou saisir un nom absent le crée dans cet index, comme une colonne liée.
 */
export function LinkedChoicePicker({ source, value, onChange, compact = true, disabled = false, label }: { source: { index: WorldIndexKey; tab: string }; value: string; onChange: (value: string) => void; compact?: boolean; disabled?: boolean; label: string }) {
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
    <span className="min-w-0 truncate">{value || <span className="font-normal italic text-muted-foreground">Sans nom</span>}</span>
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
// Jauge : barre, icônes ou anneau
// ---------------------------------------------------------------------------

function parseGauge(value: string, max: number) {
  const parsed = Number.parseInt(value.replace(/[^0-9-]/g, ""), 10)
  return Number.isFinite(parsed) ? Math.max(0, Math.min(max, parsed)) : null
}

/**
 * Un nombre affiché en jauge. « icons » : des icônes à cliquer, comme les charges ;
 * « bar » : une barre qu'on fait glisser ; « ring » : un anneau avec − et +.
 */
export const GaugeCell = memo(function GaugeCell({ label, value, style, max, disabled = false, accent, onChange }: { label: string; value: string; style: "bar" | "icons" | "ring"; max: number; disabled?: boolean; accent?: string; onChange: (value: string) => void }) {
  const [shown, setShown] = useOptimistic(value)
  const current = parseGauge(shown, max)
  const [dragging, setDragging] = useState<number | null>(null)
  const set = (next: number | null) => { const text = next === null ? "" : String(next); setShown(text); onChange(text) }
  const clear = current !== null && !disabled && <button type="button" onClick={() => set(null)} className="ml-auto hidden rounded p-0.5 text-muted-foreground hover:text-destructive group-hover/gauge:inline-flex" aria-label={`Vider ${label}`} title="Vider"><X className="size-3" /></button>

  if (style === "icons") return <span className="group/gauge flex min-h-8 items-center gap-0.5 px-1.5" style={{ color: accent || "var(--primary)" }} role="group" aria-label={`${label} : ${current ?? "vide"} sur ${max}`}>
    {Array.from({ length: max }, (_, index) => {
      const filled = current !== null && index < current
      return <button key={index} type="button" disabled={disabled} onClick={() => set(nextSpellChargeValue(max, current ?? 0, index))} className={`inline-flex rounded-sm p-0.5 transition hover:scale-110 ${filled ? "opacity-100" : "opacity-30 hover:opacity-60"}`} aria-label={`${label} : ${index + 1}`}>
        <Sparkle className="size-4" fill={filled ? "currentColor" : "none"} strokeWidth={filled ? 1.5 : 1.8} />
      </button>
    })}
    {clear}
  </span>

  if (style === "ring") {
    const ratio = current === null ? 0 : current / Math.max(1, max)
    const radius = 11
    const length = 2 * Math.PI * radius
    return <span className="group/gauge flex min-h-8 items-center gap-1 px-1.5">
      <button type="button" disabled={disabled || !current} onClick={() => set(Math.max(0, (current ?? 0) - 1))} className="rounded p-0.5 text-muted-foreground hover:bg-muted disabled:opacity-30" aria-label={`Diminuer ${label}`}><Minus className="size-3" /></button>
      <span className="relative grid size-7 place-items-center" aria-label={`${label} : ${current ?? "vide"} sur ${max}`}>
        <svg viewBox="0 0 28 28" className="absolute inset-0 -rotate-90"><circle cx="14" cy="14" r={radius} fill="none" stroke="currentColor" strokeWidth="3" className="text-muted" /><circle cx="14" cy="14" r={radius} fill="none" stroke={accent || "var(--primary)"} strokeWidth="3" strokeLinecap="round" strokeDasharray={`${length * ratio} ${length}`} /></svg>
        <span className="relative text-[10px] font-semibold tabular-nums">{current ?? "—"}</span>
      </span>
      <button type="button" disabled={disabled || current === max} onClick={() => set(Math.min(max, (current ?? 0) + 1))} className="rounded p-0.5 text-muted-foreground hover:bg-muted disabled:opacity-30" aria-label={`Augmenter ${label}`}><Plus className="size-3" /></button>
      {clear}
    </span>
  }

  const displayed = dragging ?? current ?? 0
  return <span className="group/gauge flex min-h-8 items-center gap-2 px-2">
    <input
      type="range"
      min={0}
      max={max}
      step={1}
      value={displayed}
      disabled={disabled}
      aria-label={label}
      onChange={(event) => setDragging(Number(event.target.value))}
      onPointerUp={() => { if (dragging !== null) { set(dragging); setDragging(null) } }}
      onKeyUp={() => { if (dragging !== null) { set(dragging); setDragging(null) } }}
      className="h-1.5 min-w-0 flex-1 cursor-pointer"
      style={{ accentColor: accent || "var(--primary)" }}
    />
    <span className="w-9 shrink-0 text-right text-xs tabular-nums text-muted-foreground">{current === null && dragging === null ? "—" : `${displayed}/${max}`}</span>
    {clear}
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
  return <Popover open={open} onOpenChange={setOpen}>
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
        <input type="color" value={isColor(color) ? color : "#927640"} onChange={(event) => change(event.target.value)} className="h-8 w-10 cursor-pointer rounded border bg-transparent" aria-label="Autre couleur" />
        <Input value={color} onChange={(event) => { if (isColor(event.target.value) || !event.target.value) change(event.target.value) ; else setShown(event.target.value) }} placeholder="#927640" className="h-8 font-mono text-xs" />
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
  /** Nombre : montrer les conversions au survol (le MJ seulement dans une boutique). */
  showConversions?: boolean
}

const displayClasses: Record<NonNullable<IndexColumnSpec["display"]>, string> = {
  bold: "font-semibold",
  skills: "font-semibold text-[#b3261e]",
  muted: "text-muted-foreground",
}

/**
 * La colonne de grille d'un type. Tous les index passent par ici : un même type se
 * comporte partout de la même façon (enregistrement, copier-coller, tri, apparence).
 */
export function indexGridColumn(key: string, label: string, spec: IndexColumnSpec, width: number, context: IndexColumnContext, extra: Partial<SheetGridColumn> & {
  /** Rendu propre d'une valeur : pastille d'une liste, vignette d'une image. */
  renderValue?: (value: string, rowKey?: string) => ReactNode
  /** Colonne Image : import propre à la colonne. */
  upload?: (file: File, previous: string, rowKey: string) => Promise<string>
} = {}): SheetGridColumn {
  const kinds = kindsOf(spec)
  const rich = isRichSpec(spec) || (spec.kind === "name" && kinds.includes("rich"))
  const column: SheetGridColumn = {
    key,
    label: spec.kind === "linked" ? `${label} ↔` : label,
    width,
    typeLabel: columnTypeLabel(spec),
    plain: !rich,
    hidden: spec.hidden,
    description: spec.description,
    cellClassName: spec.display ? displayClasses[spec.display] : kinds.includes("name") || kinds.includes("name-form") ? "font-semibold" : undefined,
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
      break
    case "choice":
      column.control = (rowKey) => <ChoiceCell label={label} value={valueOf(rowKey, key)} options={spec.options ?? []} allowCustom={spec.allowCustom} disabled={off(rowKey)} renderValue={extra.renderValue} onChange={(value) => commit(rowKey, key, value)} />
      break
    case "linked-choice":
      if (spec.source) { const source = spec.source; column.control = (rowKey) => <LinkedChoicePicker label={label} source={source} value={valueOf(rowKey, key)} disabled={off(rowKey)} onChange={(value) => commit(rowKey, key, value)} /> }
      break
    case "checkbox":
      column.control = (rowKey) => <CheckCell label={label} value={valueOf(rowKey, key)} emptyChecked={spec.emptyChecked} disabled={off(rowKey)} onChange={(value) => commit(rowKey, key, value)} />
      break
    case "auto-links":
      column.control = (rowKey) => <AutoLinksCell links={context.autoLinks?.(rowKey) ?? []} />
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
    case "lookup":
    case "rollup":
      column.control = (rowKey) => <ComputedCell values={context.computed?.(rowKey, key, spec) ?? []} pills={spec.kind === "lookup"} />
      column.computed = true
      break
    case "spells":
      column.control = (rowKey) => <SpellsCell value={valueOf(rowKey, key)} source={spec.spells?.source ?? "all"} category={spec.spells?.category} disabled={off(rowKey)} onChange={(value) => commit(rowKey, key, value)} />
      break
    case "gauge":
      column.control = (rowKey) => <GaugeCell label={label} value={valueOf(rowKey, key)} style={spec.gauge?.style ?? "bar"} max={spec.gauge?.max ?? 10} disabled={off(rowKey)} onChange={(value) => commit(rowKey, key, value)} />
      break
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
}

const fieldLabel = "grid content-start gap-1 text-xs font-semibold"

export function IndexField({ label, spec, value, onChange, long = false, autoFocus = false, placeholder, disabled = false }: IndexFieldProps) {
  const kinds = kindsOf(spec)
  const title = <span className="flex items-center gap-1">{label}{spec.kind === "linked" && <Link2 className="size-3 text-primary" aria-label="Colonne liée" />}</span>
  switch (spec.kind) {
    case "choice":
      return <div className={fieldLabel}>{title}<ChoicePicker compact={false} label={label} value={value} options={spec.options ?? []} allowCustom={spec.allowCustom} disabled={disabled} onChange={onChange} /></div>
    case "linked-choice":
      return spec.source ? <div className={fieldLabel}>{title}<LinkedChoicePicker compact={false} label={label} source={spec.source} value={value} disabled={disabled} onChange={onChange} /></div> : null
    case "checkbox":
      return <label className="flex h-9 items-center gap-2 self-end rounded-lg border bg-background/50 px-3 text-sm font-semibold"><Checkbox checked={isCheckedValue(value, spec.emptyChecked)} disabled={disabled} onCheckedChange={(checked) => onChange(checkboxValue(checked === true, value))} />{label}</label>
    case "file":
      return spec.file?.accept === "image" && !spec.file.multiple
        ? <div className={fieldLabel}>{title}<ImageField label={label} value={value} onChange={onChange} aspect="aspect-video" disabled={disabled} /></div>
        : <div className={fieldLabel}>{title}<span className="rounded-lg border bg-background/50 p-2"><FilesEditor files={splitFiles(value)} accept={spec.file?.accept ?? "any"} multiple={Boolean(spec.file?.multiple)} disabled={disabled} onChange={(files) => onChange(files.join("\n"))} /></span></div>
    case "color":
      return <div className={fieldLabel}>{title}<span className="rounded-lg border bg-background/50"><ColorCell label={label} value={value} disabled={disabled} onChange={onChange} /></span></div>
    case "spells":
      return <div className="md:col-span-2"><SpellsField label={label} value={value} source={spec.spells?.source ?? "all"} category={spec.spells?.category} onChange={onChange} /></div>
    case "gauge":
      return <div className={fieldLabel}>{title}<span className="rounded-lg border bg-background/50"><GaugeCell label={label} value={value} style={spec.gauge?.style ?? "bar"} max={spec.gauge?.max ?? 10} disabled={disabled} onChange={onChange} /></span></div>
    case "number":
      return spec.number
        ? <div className={fieldLabel}>{title}<NumberCell compact={false} label={label} value={value} format={spec.number} disabled={disabled} onChange={onChange} /></div>
        : <label className={fieldLabel}>{title}<Input type="number" min={spec.min} max={spec.max} value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} /></label>
    case "id":
      return <label className={fieldLabel}>{title}<Input value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} placeholder="Généré si vide" className="font-mono text-xs" /></label>
    case "auto-links":
    case "ranked-links":
    case "tab":
    case "archived":
    case "lookup":
    case "rollup":
      return null
    default: {
      const rich = isRichSpec(spec) || kinds.includes("rich")
      if (!rich) return <label className={fieldLabel}>{title}<Input autoFocus={autoFocus} value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} placeholder={placeholder ?? (spec.kind === "linked" ? "Noms séparés par des virgules" : undefined)} /></label>
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
        spec={field.spec.kind === "name-form" ? { kind: "name", also: field.spec.also } : field.spec}
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
