"use client"

import { useEffect, useState, type ReactNode } from "react"
import { Check, ChevronDown, Copy, ExternalLink, LoaderCircle, Plus, RefreshCw, TriangleAlert, X } from "lucide-react"

import { IconPicker } from "@/components/eraser/index-gauge"
import { PageIcon, calloutTones, formatWhen } from "@/components/eraser/custom-page-view"
import { blockIcons } from "@/components/eraser/page-studio-icons"
import { PresentationKindSettings } from "@/components/eraser/index-presentations-editor"
import { useIndexSettings } from "@/components/eraser/index-windows"
import { linkedBlockFields, newSavedViewId, savedViewFromBlock, type SavedView } from "@/lib/index-saved-views"
import { isPresentationKind, PRESENTATION_VARIANT_PREFIX, type Presentation } from "@/lib/index-presentations"
import { ALL_PINNED_STATS } from "@/lib/custom-pages-data"
import { eraserModules, moduleSections } from "@/lib/eraser-modules"
import { ALL_SOURCES, describeCondition, filterOperators, type FilterCondition } from "@/lib/index-windows"
import { replaceModes, replaceableRoutes } from "@/lib/page-replacements"
import {
  blockCatalog,
  blockVisibilities,
  blockVisibleTo,
  cleanImageSource,
  pageHref,
  pagePlaces,
  pageRoles,
  pageVisibilities,
  roleLabels,
  slugify,
  slugProblem,
  viewBlockKinds,
  viewHeights,
  type BlockVisibility,
  type PageBlock,
  type PageDraft,
  type PagePlace,
  type PageRole,
  type PageSummary,
  type StudioPage,
  type ViewBlockKind,
  type ViewWhere,
  studioHref,
} from "@/lib/custom-pages"

/**
 * Le volet de droite de l'atelier : les réglages du bloc choisi, ou ceux de la page entière
 * (place, adresse, visibilité, version publiée, modèle). Tout ce qui s'écrit dans la page se
 * fait dans le bloc lui-même ; ici, seulement ce qui ne se voit pas.
 */

/* ---------- Petites pièces ---------- */

export const fieldClass = "h-8 w-full min-w-0 rounded-lg border border-input bg-background/70 px-2.5 text-[13px] outline-none transition placeholder:text-muted-foreground/60 focus:border-ring focus:ring-2 focus:ring-ring/20"

export function Field({ label, hint, children, error }: { label: string; hint?: ReactNode; children: ReactNode; error?: string }) {
  return <div className="grid min-w-0 gap-1">
    <span className="text-xs font-semibold text-muted-foreground">{label}</span>
    {children}
    {error ? <span className="flex items-start gap-1 text-[11.5px] text-destructive"><TriangleAlert className="mt-0.5 size-3 shrink-0" />{error}</span> : hint ? <span className="text-[11.5px] leading-snug text-muted-foreground/90">{hint}</span> : null}
  </div>
}

export function Segmented<T extends string>({ value, options, onChange, label, size = "md" }: { value: T; options: Array<{ value: T; label: ReactNode; title?: string }>; onChange: (value: T) => void; label: string; size?: "sm" | "md" }) {
  return <div role="group" aria-label={label} className="inline-flex max-w-full flex-wrap gap-0.5 rounded-[11px] border bg-card p-0.5">
    {options.map((option) => <button key={option.value} type="button" title={option.title} aria-pressed={option.value === value} onClick={() => onChange(option.value)}
      className={`inline-flex items-center gap-1.5 rounded-lg ${size === "sm" ? "px-2 py-0.5 text-xs" : "px-2.5 py-1 text-[13px]"} text-muted-foreground transition hover:bg-muted hover:text-foreground aria-pressed:bg-foreground aria-pressed:font-semibold aria-pressed:text-background`}>{option.label}</button>)}
  </div>
}

export function Group({ title, badge, children, open = true }: { title: string; badge?: ReactNode; children: ReactNode; open?: boolean }) {
  return <details open={open} className="group/settings border-t border-border/70 first:border-t-0 [&_summary::-webkit-details-marker]:hidden">
    <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-2.5 text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground hover:text-foreground">
      <span>{title}</span>{badge}
      <ChevronDown className="ml-auto size-3.5 transition group-open/settings:rotate-180" />
    </summary>
    <div className="grid gap-3 px-4 pb-4">{children}</div>
  </details>
}

export const roleDot: Record<PageRole, string> = { joueur: "bg-[#0f7a65]", mj: "bg-[#3b5c8a]", admin: "bg-primary" }
const visDot: Record<BlockVisibility, string> = { tous: "", joueurs: roleDot.joueur, mj: roleDot.mj, "mj-seul": roleDot.mj, admin: roleDot.admin }

export function VisibilityPill({ vis }: { vis: BlockVisibility }) {
  if (vis === "tous") return null
  const tone = { joueurs: "text-[#0f7a65] border-[#0f7a65]/35 bg-[#0f7a65]/8", mj: "text-[#3b5c8a] border-[#3b5c8a]/35 bg-[#3b5c8a]/8", "mj-seul": "text-[#3b5c8a] border-[#3b5c8a]/35 bg-[#3b5c8a]/8", admin: "text-primary border-primary/35 bg-primary/8" }[vis]
  return <span className={`inline-flex items-center gap-1 rounded-full border px-1.5 text-[10.5px] font-semibold normal-case tracking-normal ${tone}`}>{blockVisibilities.find((item) => item.value === vis)?.short}</span>
}

function RadioCards<T extends string>({ name, value, options, onChange, disabled }: { name: string; value: T; options: Array<{ value: T; label: string; hint: string; dot?: string }>; onChange: (value: T) => void; disabled?: boolean }) {
  return <div role="radiogroup" className="grid gap-1">
    {options.map((option) => <label key={option.value} className={`grid cursor-pointer grid-cols-[auto_minmax(0,1fr)] items-start gap-x-2 rounded-xl border px-2.5 py-2 transition has-[:checked]:border-primary/60 has-[:checked]:bg-primary/[0.05] ${disabled ? "pointer-events-none opacity-55" : "hover:border-border hover:bg-background/60"} border-border/60`}>
      <input type="radio" name={name} checked={value === option.value} onChange={() => onChange(option.value)} disabled={disabled} className="mt-0.5 accent-primary" />
      <span className="flex items-center gap-1.5 text-[13px] font-semibold">{option.dot && <span className={`size-2 rounded-full ${option.dot}`} />}{option.label}</span>
      <span className="col-start-2 text-[11.5px] leading-snug text-muted-foreground">{option.hint}</span>
    </label>)}
  </div>
}

/* ---------- Les index (blocs Vue et Stat) ---------- */

type IndexEntry = { key: string; title: string; path: string }
type IndexDetails = {
  tabs: Array<{ name: string; configured?: ViewBlockKind[]; forms?: Partial<Record<ViewBlockKind, Presentation>>; cards: boolean; cardList?: Array<{ id: string; name: string }>; hoverList?: Array<{ id: string; name: string }>; viewList?: Array<{ id: string; name: string; kind: string }>; formList?: Array<{ id: string; name: string }>; columns?: string[]; choices?: Record<string, string[]> }>
  stats: Array<{ id: string; title: string; pinned: boolean }>
  presets?: Array<{ id: string; name: string; kind: string; builtin: boolean }>
}

let catalogPromise: Promise<IndexEntry[]> | null = null
const detailsCache = new Map<string, Promise<IndexDetails | null>>()

function loadCatalog() {
  if (!catalogPromise) catalogPromise = fetch("/api/pages/block-data?catalog=1").then(async (response) => response.ok ? ((await response.json()) as { indexes: IndexEntry[] }).indexes : Promise.reject(new Error("CATALOG"))).catch(() => { catalogPromise = null; return [] })
  return catalogPromise
}

function loadDetails(key: string) {
  let promise = detailsCache.get(key)
  if (!promise) {
    promise = fetch(`/api/pages/block-data?catalog=1&index=${encodeURIComponent(key)}`).then(async (response) => response.ok ? (await response.json()) as IndexDetails : null).catch(() => null)
    promise.then((value) => { if (!value) detailsCache.delete(key) })
    detailsCache.set(key, promise)
  }
  return promise
}

function useIndexCatalog() {
  const [indexes, setIndexes] = useState<IndexEntry[] | null>(null)
  useEffect(() => { let alive = true; void loadCatalog().then((list) => { if (alive) setIndexes(list) }); return () => { alive = false } }, [])
  return indexes
}

function useIndexDetails(key: string) {
  const [state, setState] = useState<{ key: string; details: IndexDetails | null; loading: boolean }>({ key, details: null, loading: Boolean(key) })
  const [version, setVersion] = useState(0)
  useEffect(() => {
    if (!key) return
    let alive = true
    // eslint-disable-next-line react-hooks/set-state-in-effect -- un autre index repart d'un état « chargement »
    setState((current) => ({ key, details: current.key === key ? current.details : null, loading: true }))
    void loadDetails(key).then((details) => { if (alive) setState({ key, details, loading: false }) })
    return () => { alive = false }
  }, [key, version])
  // Relire l'index : une carte, une forme ou un preset créé entre-temps dans « Modifier ».
  const reload = () => { detailsCache.delete(key); setVersion((value) => value + 1) }
  return { ...(state.key === key ? state : { key, details: null, loading: Boolean(key) }), reload }
}

function IndexPicker({ value, onChange }: { value: string; onChange: (key: string) => void }) {
  const indexes = useIndexCatalog()
  return <Field label="Index" hint="L’Index des items (objets) n’est pas encore proposé : ce n’est pas un index du monde.">
    <select className={fieldClass} value={value} onChange={(event) => onChange(event.target.value)} disabled={!indexes}>
      <option value="">{indexes ? "Choisir un index…" : "Chargement des index…"}</option>
      {(indexes ?? []).map((entry) => <option key={entry.key} value={entry.key}>{entry.title}</option>)}
      {value && indexes && !indexes.some((entry) => entry.key === value) && <option value={value}>{value} (introuvable)</option>}
    </select>
  </Field>
}

/** Les conditions d'un bloc Vue, dans le volet étroit de l'atelier : une condition par carte. */
function WhereEditor({ where, columns, choices, rowPage, onChange }: { where?: ViewWhere; columns: string[]; choices: Record<string, string[]>; rowPage: boolean; onChange: (where: ViewWhere | undefined) => void }) {
  const conditions = where?.conditions ?? []
  const match = where?.match ?? "toutes"
  const set = (next: FilterCondition[], nextMatch = match) => onChange(next.length ? { match: nextMatch, conditions: next } : undefined)
  const change = (position: number, patch: Partial<FilterCondition>) => set(conditions.map((condition, index) => index === position ? { ...condition, ...patch } : condition))
  return <div className="grid gap-2">
    {conditions.length > 1 && <Segmented label="Combinaison" size="sm" value={match} onChange={(value) => set(conditions, value)} options={[{ value: "toutes", label: "Toutes vraies" }, { value: "une", label: "Une suffit" }]} />}
    {conditions.map((condition, position) => {
      const operator = filterOperators.find((candidate) => candidate.value === condition.operator)
      const listId = `conditions-${position}-${condition.column}`
      return <div key={position} className="grid gap-1 rounded-lg border bg-background/50 p-1.5">
        <div className="flex items-center gap-1">
          {position > 0 && <span className="shrink-0 px-1 text-[11px] font-semibold text-muted-foreground">{match === "une" ? "ou" : "et"}</span>}
          <select aria-label="Colonne" className={`${fieldClass} h-7 text-xs`} value={condition.column} onChange={(event) => change(position, { column: event.target.value })}>
            {condition.column && !columns.includes(condition.column) && <option value={condition.column}>{condition.column} (absente)</option>}
            {columns.map((column) => <option key={column} value={column}>{column}</option>)}
          </select>
          <button type="button" onClick={() => set(conditions.filter((_, index) => index !== position))} aria-label="Retirer la condition" className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"><X className="size-3.5" /></button>
        </div>
        <div className="grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)] gap-1">
          <select aria-label="Comparaison" className={`${fieldClass} h-7 text-xs`} value={condition.operator} onChange={(event) => change(position, { operator: event.target.value as FilterCondition["operator"] })}>
            {filterOperators.map((candidate) => <option key={candidate.value} value={candidate.value}>{candidate.label}</option>)}
          </select>
          {operator?.needsValue ? <>
            <input aria-label="Valeur" list={choices[condition.column]?.length ? listId : undefined} className={`${fieldClass} h-7 text-xs`} value={condition.value} placeholder={rowPage ? "Valeur ou {Colonne}" : "Valeur"} onChange={(event) => change(position, { value: event.target.value })} />
            {choices[condition.column]?.length ? <datalist id={listId}>{choices[condition.column].map((value) => <option key={value} value={value} />)}</datalist> : null}
          </> : <span />}
        </div>
      </div>
    })}
    <button type="button" disabled={!columns.length} onClick={() => set([...conditions, { column: columns[0] ?? "", operator: "est", value: "" }])} className="inline-flex items-center gap-1 justify-self-start rounded-lg px-1.5 py-1 text-xs font-medium text-primary hover:bg-primary/10 disabled:opacity-40"><Plus className="size-3.5" />Ajouter une condition</button>
    {conditions.length > 0 && <span className="text-[11.5px] leading-snug text-muted-foreground">{conditions.filter((condition) => condition.column).map(describeCondition).join(match === "une" ? " ou " : " et ")}</span>}
  </div>
}

type ViewBlockSettings = Extract<PageBlock, { type: "view" }>

/** Ce que montre une vue, en une ligne : sa présentation, son filtre, son tri. */
function savedViewSummary(view: SavedView) {
  const kind = viewBlockKinds.find((item) => item.value === view.kind)?.label ?? view.kind
  const conditions = (view.filter?.conditions ?? []).filter((condition) => condition.column)
  return [
    view.source === ALL_SOURCES ? `${kind}, tous les onglets` : `${kind} de « ${view.source} »`,
    conditions.length ? conditions.map(describeCondition).join(view.filter?.match === "une" ? " ou " : " et ") : "toutes les lignes",
    view.sort ? `tri par ${view.sort.column}${view.sort.desc ? " (Z→A)" : ""}` : "",
  ].filter(Boolean).join(" · ")
}

/**
 * La vue enregistrée qu'un bloc montre (roadmap « Vues des index », D4 hybride) : choisie parmi
 * celles de l'index, elle règle l'onglet, la présentation, la forme, la carte, le filtre, le tri
 * et le clic, et ses changements dans l'index se voient ici. Le bloc garde son titre, sa
 * hauteur, son nombre de lignes, sa page de ligne et la recherche. « Détacher pour cette page »
 * en fait une copie propre au bloc ; un bloc réglé ici peut devenir une vue de l'index.
 */
function SavedViewChoice({ block, tabs, onChange }: { block: ViewBlockSettings; tabs: string[]; onChange: (patch: Partial<ViewBlockSettings>) => void }) {
  const settings = useIndexSettings(block.index)
  const [naming, setNaming] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState("")
  // L'onglet stat n'est pas une vue qu'un bloc Vue peut montrer (c'est le bloc Statistiques).
  const views = settings.savedViews.filter((view) => view.kind !== "stats")
  const current = views.find((view) => view.id === block.savedViewId)
  const legacy = block.viewId && !block.savedViewId ? views.find((view) => view.id === block.viewId) : undefined
  const link = (view: SavedView) => onChange({ ...linkedBlockFields(block, view), savedViewId: view.id, viewId: undefined })
  // Détacher : le bloc garde la vue telle qu'elle est aujourd'hui, puis ne la suit plus.
  const detach = () => onChange({ ...(current ? linkedBlockFields(block, current) : {}), savedViewId: undefined })
  async function saveAsView() {
    const name = (naming ?? "").trim()
    if (!name) return
    setPending(true); setError("")
    try {
      const position = Math.max(-1, ...settings.savedViews.map((view) => view.position)) + 1
      const saved = await settings.saveSavedView({ ...savedViewFromBlock(block), id: newSavedViewId(), name, position })
      onChange({ savedViewId: saved.id, viewId: undefined })
      setNaming(null)
    } catch (caught) { setError(caught instanceof Error ? caught.message : "La vue n’a pas pu être enregistrée.") }
    setPending(false)
  }
  return <>
    <Field label="Vue de l’index" error={error} hint={block.savedViewId
      ? "Réglée dans l’index : ses changements se voient ici. Le titre, la hauteur et le nombre de lignes restent ceux de la page."
      : settings.savedViewsUnavailable ? "Les vues se gardent sur le serveur partagé d’Eraser, qui ne répond pas : règle ce bloc ici."
        : "Une vue réglée dans l’index, montrée telle quelle ; sinon, règle ce bloc ici."}>
      <select className={fieldClass} value={block.savedViewId ?? ""} onChange={(event) => { const view = views.find((item) => item.id === event.target.value); if (view) link(view); else detach() }}>
        <option value="">Aucune : réglée pour cette page</option>
        {views.map((view) => <option key={view.id} value={view.id}>{view.name}</option>)}
        {block.savedViewId && !current && <option value={block.savedViewId}>{settings.ready ? "Vue supprimée (la page garde sa dernière copie)" : "Lecture des vues…"}</option>}
      </select>
    </Field>
    {current && <Hint>{savedViewSummary(current)}</Hint>}
    {block.savedViewId && !current && settings.ready && <Hint>Cette vue n’existe plus dans l’index : la page montre la copie de son dernier réglage. Détache le bloc pour la régler ici.</Hint>}
    {block.savedViewId && current?.source === ALL_SOURCES && <Field label="Onglet" hint="La vue cherche dans tous les onglets ; un bloc en montre un.">
      <select className={fieldClass} value={block.tab} onChange={(event) => onChange({ tab: event.target.value })}>
        <option value="">Choisir un onglet…</option>
        {tabs.map((tab) => <option key={tab} value={tab}>{tab}</option>)}
      </select>
    </Field>}
    {block.savedViewId && <button type="button" onClick={detach} className="justify-self-start text-xs font-medium text-primary hover:underline" title="Le bloc garde la vue telle qu’elle est aujourd’hui, puis ne la suit plus : tu la règles ici, pour cette page seulement">Détacher pour cette page</button>}
    {legacy && <Hint>
      Ce bloc portait sur l’onglet-fenêtre « {legacy.name} » (ancien réglage, plus lu).{" "}
      <button type="button" className="font-medium text-primary hover:underline" onClick={() => link(legacy)}>Montrer la vue « {legacy.name} »</button>
    </Hint>}
    {!block.savedViewId && block.tab && !settings.savedViewsUnavailable && (naming === null
      ? <button type="button" onClick={() => setNaming(block.heading || "")} className="justify-self-start text-xs font-medium text-primary hover:underline" title="La vue rejoint celles de l’index (groupe « Vues ») et ce bloc la montre : d’autres pages pourront la réutiliser">Enregistrer comme vue de l’index</button>
      : <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-1.5">
        <input className={fieldClass} value={naming} maxLength={60} placeholder="Nom de la vue" autoFocus aria-label="Nom de la nouvelle vue" onChange={(event) => setNaming(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void saveAsView(); if (event.key === "Escape") setNaming(null) }} />
        <button type="button" disabled={pending || !naming.trim()} onClick={() => void saveAsView()} className="inline-flex h-8 items-center gap-1 rounded-lg bg-primary px-2.5 text-xs font-medium text-primary-foreground disabled:opacity-50">{pending ? <LoaderCircle className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}Créer</button>
        <button type="button" onClick={() => setNaming(null)} className="inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted" aria-label="Annuler"><X className="size-3.5" /></button>
      </div>)}
  </>
}

function ViewSettings({ block, rowOf, onChange }: { block: Extract<PageBlock, { type: "view" }>; rowOf?: { index: string; tab?: string }; onChange: (patch: Partial<Extract<PageBlock, { type: "view" }>>) => void }) {
  const { details, loading, reload } = useIndexDetails(block.index)
  const tab = details?.tabs.find((item) => item.name === block.tab)
  const configured = tab?.configured ?? []
  const presentation = isPresentationKind(block.kind)
  const kindLabel = viewBlockKinds.find((item) => item.value === block.kind)?.label ?? ""
  const presets = (details?.presets ?? []).filter((preset) => preset.kind === block.kind)
  const variants = (tab?.viewList ?? []).filter((item) => item.kind === block.kind)
  const columns = tab?.columns ?? []
  // La forme propre part de celle de l'onglet (sinon de la forme par défaut) : rien n'est perdu à basculer.
  const startFrom = (kind: ViewBlockKind): Presentation => ({ ...(tab?.forms?.[kind] ?? {}), kind })
  // Changer de présentation : un preset ou une forme propre ne passe pas d'une présentation à l'autre.
  const pickKind = (kind: ViewBlockKind) => onChange({ kind, layout: block.layout && isPresentationKind(kind) ? startFrom(kind) : undefined, presetId: undefined })
  const form = block.layout ? "own" : block.presetId ? `preset:${block.presetId}` : ""
  const pickForm = (value: string) => value === "own" ? onChange({ layout: startFrom(block.kind), presetId: undefined })
    : value.startsWith("preset:") ? onChange({ presetId: value.slice("preset:".length), layout: undefined })
    : onChange({ presetId: undefined, layout: undefined })
  const where = block.where
  // Un bloc qui montre une vue de l'index : la vue règle l'onglet, la forme, le filtre, le tri et le clic.
  const linked = Boolean(block.savedViewId)
  return <>
    <IndexPicker value={block.index} onChange={(index) => onChange({ index, tab: "", viewId: undefined, savedViewId: undefined, layout: undefined, presetId: undefined, cardId: undefined, where: undefined, sort: undefined })} />
    {block.index && <SavedViewChoice block={block} tabs={(details?.tabs ?? []).map((item) => item.name)} onChange={onChange} />}
    {block.index && !linked && <Field label="Onglet">
      <select className={fieldClass} value={block.tab} disabled={loading && !details} onChange={(event) => onChange({ tab: event.target.value, viewId: undefined, layout: undefined, cardId: undefined, where: undefined, sort: undefined })}>
        <option value="">{loading && !details ? "Lecture de l’index…" : "Choisir un onglet…"}</option>
        {(details?.tabs ?? []).map((item) => <option key={item.name} value={item.name}>{item.name}</option>)}
      </select>
    </Field>}
    {block.tab && !linked && <Field label="Présentation" hint="Tout ce que propose « Modifier » dans l’index. Un point : déjà réglée pour cet onglet.">
      <div className="flex flex-wrap gap-1">
        {viewBlockKinds.map((kind) => {
          const Icon = blockIcons.views[kind.value]
          return <button key={kind.value} type="button" aria-pressed={block.kind === kind.value} onClick={() => pickKind(kind.value)} className="inline-flex items-center gap-1.5 rounded-full border border-border/80 bg-background/60 px-2.5 py-1 text-xs text-muted-foreground transition hover:border-border hover:text-foreground aria-pressed:border-foreground aria-pressed:bg-foreground aria-pressed:text-background">
            <Icon className="size-3.5" />{kind.label}{(configured.includes(kind.value) || (kind.value === "cards" && tab?.cards)) && <span className="size-1.5 rounded-full bg-current opacity-70" aria-label="réglée dans l’index" />}
          </button>
        })}
      </div>
    </Field>}
    {block.tab && !linked && block.kind === "cards" && <Field label="Carte" hint={tab?.cardList?.length ? <>Les cartes de l’onglet (Modifier › Cartes). <RefreshLink onClick={reload} loading={loading} /></> : <>Cet onglet n’a pas encore de carte : Eraser en dessine une d’office. Crée les tiennes dans l’index (Modifier › Cartes). <RefreshLink onClick={reload} loading={loading} /></>}>
      <select className={fieldClass} value={block.cardId ?? ""} onChange={(event) => onChange({ cardId: event.target.value || undefined })}>
        <option value="">Celle à l’étoile (par défaut)</option>
        {(tab?.cardList ?? []).map((card) => <option key={card.id} value={card.id}>{card.name}</option>)}
        {block.cardId && !(tab?.cardList ?? []).some((card) => card.id === block.cardId) && <option value={block.cardId}>Carte supprimée (celle par défaut la remplace)</option>}
      </select>
    </Field>}
    {block.tab && !linked && presentation && <Field label="Forme" hint={<>Les versions de l’onglet (Modifier › {kindLabel} › Nouveau) et les presets apparaissent ici. <RefreshLink onClick={reload} loading={loading} /></>}>
      <select className={fieldClass} value={form} onChange={(event) => pickForm(event.target.value)}>
        <option value="">{configured.includes(block.kind) ? `Celle à l’étoile de l’onglet (Modifier › ${kindLabel})` : `Celle de l’onglet (${kindLabel} par défaut)`}</option>
        {variants.length > 0 && <optgroup label="Les autres versions de l’onglet">{variants.map((item) => <option key={item.id} value={`preset:${PRESENTATION_VARIANT_PREFIX}${item.id}`}>{item.name}</option>)}</optgroup>}
        {presets.some((preset) => !preset.builtin) && <optgroup label="Tes presets">{presets.filter((preset) => !preset.builtin).map((preset) => <option key={preset.id} value={`preset:${preset.id}`}>{preset.name}</option>)}</optgroup>}
        {presets.some((preset) => preset.builtin) && <optgroup label="Presets d’Eraser">{presets.filter((preset) => preset.builtin).map((preset) => <option key={preset.id} value={`preset:${preset.id}`}>{preset.name}</option>)}</optgroup>}
        {block.presetId && !presets.some((preset) => preset.id === block.presetId) && !variants.some((item) => `${PRESENTATION_VARIANT_PREFIX}${item.id}` === block.presetId) && details && <option value={`preset:${block.presetId}`}>{block.presetId.startsWith(PRESENTATION_VARIANT_PREFIX) ? "Version supprimée (celle à l’étoile la remplace)" : "Preset supprimé (la forme de l’onglet le remplace)"}</option>}
        <option value="own">Propre à cette page…</option>
      </select>
    </Field>}
    {block.tab && !linked && presentation && block.layout && isPresentationKind(block.kind) && <PresentationKindSettings kind={block.kind} layout={block.layout} columns={columns} cards={tab?.cardList ?? []} hovers={tab?.hoverList ?? []} onChange={(layout) => onChange({ layout: { ...layout, kind: block.kind } })} />}
    {block.tab && !linked && <Field label="Seulement les lignes où…" hint={`Sans condition : toutes les lignes. « {Moi} » : le lecteur (« Joueur est {Moi} » : ses personnages ; « MJ est {Moi} » : ses campagnes).${rowOf?.index ? " « {Colonne} » prend la valeur de la ligne de la page, aussi dans un nom de colonne." : " Les colonnes masquées comptent aussi, sans jamais être montrées."}`}>
      <WhereEditor where={where} columns={columns} choices={tab?.choices ?? {}} rowPage={Boolean(rowOf?.index)} onChange={(next) => onChange({ where: next })} />
    </Field>}
    {block.viewId && !linked && <Hint>
      Ce bloc portait sur un onglet-fenêtre de l’index (ancien réglage, plus utilisé : un onglet-fenêtre n’est que le tableau filtré de l’index). Mets ses conditions ci-dessus si tu en as besoin.{" "}
      <button type="button" className="font-medium text-primary hover:underline" onClick={() => onChange({ viewId: undefined })}>Retirer l’ancien réglage</button>
    </Hint>}
    {block.tab && !linked && <Field label="Trier par" hint={presentation ? "Avant « Au plus » ; une forme qui a son propre tri le garde pour l’affichage." : undefined}>
      <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-1.5">
        <select className={fieldClass} value={block.sort?.column ?? ""} onChange={(event) => onChange({ sort: event.target.value ? { column: event.target.value, desc: block.sort?.desc ?? false } : undefined })}>
          <option value="">L’ordre de l’onglet</option>
          {columns.map((column) => <option key={column} value={column}>{column}</option>)}
        </select>
        {block.sort && <Segmented label="Ordre" size="sm" value={block.sort.desc ? "desc" : "asc"} onChange={(value) => onChange({ sort: { column: block.sort!.column, desc: value === "desc" } })} options={[{ value: "asc", label: "A→Z", title: "Croissant" }, { value: "desc", label: "Z→A", title: "Décroissant" }]} />}
      </div>
    </Field>}
    <div className="grid grid-cols-2 gap-2">
      <Field label="Au plus (lignes)" hint={presentation ? "0 : toutes. Pour en montrer peu puis « Charger plus », règle le pied de la vue (Général › Pied)." : "0 : toutes"}>
        <input type="number" min={0} max={500} className={fieldClass} value={block.limit} onChange={(event) => onChange({ limit: Math.max(0, Math.min(500, Number.parseInt(event.target.value, 10) || 0)) })} />
      </Field>
      <Field label="Hauteur">
        <select className={fieldClass} value={block.height} onChange={(event) => onChange({ height: event.target.value as typeof block.height })}>
          {viewHeights.map((height) => <option key={height.value} value={height.value}>{height.label}</option>)}
        </select>
      </Field>
    </div>
    {rowOf?.index && block.tab && <Field label="Page de ligne : seulement les lignes liées" hint="Ne garde que les lignes dont cette colonne cite la ligne de la page (son nom dans une liste, ou une référence « { » vers elle).">
      <select className={fieldClass} value={block.rowMatch} onChange={(event) => onChange({ rowMatch: event.target.value })}>
        <option value="">Toutes les lignes (pas de filtre)</option>
        {columns.map((column) => <option key={column} value={column}>{column}</option>)}
      </select>
    </Field>}
    {block.tab && !linked && presentation && <Field label="Au clic sur une ligne" hint={<>Celui de la vue : il se règle avec elle (dans l’index, Modifier › {kindLabel} › Éléments et clic, ou « Propre à cette page »). Sur une page, la fiche s’ouvre ici, en lecture, jamais dans l’index ; la page de la ligne, si elle en a une.{block.click ? <>{" "}<button type="button" className="font-medium text-primary hover:underline" onClick={() => onChange({ click: undefined })}>Retirer l’ancien réglage du bloc</button></> : null}</>}><span /></Field>}
    {block.tab && !linked && !presentation && <Field label="Au clic sur une ligne" hint={block.click && block.click !== "-" ? "« {ID} » et « {Colonne} » prennent les valeurs de la ligne. La page ouverte vérifie toujours qui peut la voir." : !block.click ? "Sa fiche : sa page de ligne s’il y en a une, sinon sa page d’Eraser (une classe…) ou l’index (MJ et admins)." : undefined}>
      <select className={fieldClass} value={!block.click ? "" : block.click === "-" ? "-" : "href"} onChange={(event) => onChange({ click: event.target.value === "href" ? block.index === "campaigns" ? "/campagne/{ID}" : "/" : event.target.value || undefined })}>
        <option value="">Ouvrir sa fiche</option>
        <option value="href">Ouvrir une adresse…</option>
        <option value="-">Rien</option>
      </select>
      {block.click && block.click !== "-" && <input className={`${fieldClass} mt-1 font-mono text-xs`} value={block.click} maxLength={300} placeholder="/campagne/{ID}" onChange={(event) => onChange({ click: event.target.value || undefined })} />}
    </Field>}
    <label className="flex items-start gap-2 text-[13px]"><input type="checkbox" className="mt-0.5 accent-primary" checked={!block.ignoreSearch} onChange={(event) => onChange({ ignoreSearch: event.target.checked ? undefined : true })} /><span>Suivre la recherche de la page<span className="block text-[11.5px] text-muted-foreground">Si la page a un bloc Recherche, il filtre aussi ces lignes.</span></span></label>
    <Field label="Titre au-dessus" hint={rowOf?.index ? "« {Nom} » y met le nom de la ligne." : undefined}><input className={fieldClass} value={block.heading} maxLength={160} placeholder="Facultatif" onChange={(event) => onChange({ heading: event.target.value })} /></Field>
  </>
}

function RefreshLink({ onClick, loading }: { onClick: () => void; loading: boolean }) {
  return <button type="button" onClick={onClick} disabled={loading} className="inline-flex items-center gap-0.5 font-medium text-primary hover:underline disabled:opacity-50">{loading ? <LoaderCircle className="size-3 animate-spin" /> : <RefreshCw className="size-3" />}Relire l’index</button>
}

/** Page de ligne : les colonnes montrées par « Valeurs de la ligne ». */
function RowFieldsSettings({ block, rowOf, onChange }: { block: Extract<PageBlock, { type: "rowfields" }>; rowOf?: { index: string; tab?: string }; onChange: (patch: Partial<Extract<PageBlock, { type: "rowfields" }>>) => void }) {
  const { details, loading } = useIndexDetails(rowOf?.index ?? "")
  const columns = [...new Set((details?.tabs ?? []).filter((tab) => !rowOf?.tab || tab.name === rowOf.tab).flatMap((tab) => tab.columns ?? []))]
  if (!rowOf?.index) return <Hint>Ce bloc sert sur la page de chaque ligne : règle d’abord la page (Réglages de la page › « Page de chaque ligne d’un index »).</Hint>
  return <>
    <Field label="Colonnes montrées" hint="Aucune choisie : toutes les colonnes que le lecteur peut voir, dans l’ordre de l’onglet. Un joueur ne voit jamais les colonnes masquées ni les notes MJ.">
      {loading ? <span className="text-xs text-muted-foreground">Lecture de l’index…</span> : <div className="flex flex-wrap gap-1">
        {columns.map((column) => {
          const on = block.columns.includes(column)
          return <button key={column} type="button" aria-pressed={on} onClick={() => onChange({ columns: on ? block.columns.filter((item) => item !== column) : [...block.columns, column] })} className="rounded-full border border-border/80 bg-background/60 px-2.5 py-0.5 text-xs text-muted-foreground transition hover:text-foreground aria-pressed:border-foreground aria-pressed:bg-foreground aria-pressed:text-background">{column}</button>
        })}
      </div>}
    </Field>
    <Field label="Disposition" hint={block.style === "form" ? "Les sections, les lignes, la colonne latérale et les blocs de la fiche de l’onglet (Modifier › Formulaire), en lecture." : undefined}><Segmented label="Disposition" value={block.style} onChange={(style) => onChange({ style })} options={[{ value: "grid", label: "En grille" }, { value: "list", label: "En liste" }, { value: "form", label: "Comme la fiche", title: "Disposées comme le formulaire de l’index" }]} /></Field>
    {block.style === "form" && (() => {
      const forms = [...new Map((details?.tabs ?? []).filter((tab) => !rowOf?.tab || tab.name === rowOf.tab).flatMap((tab) => tab.formList ?? []).map((form) => [form.id, form])).values()]
      return <Field label="Formulaire" hint="Lequel des formulaires de l’onglet (Modifier › Formulaire). Vide : le formulaire étoilé.">
        <select className={fieldClass} value={block.formId ?? ""} onChange={(event) => onChange({ formId: event.target.value || undefined })}>
          <option value="">Le formulaire étoilé</option>
          {forms.filter((form) => form.id !== "principal").map((form) => <option key={form.id} value={form.id}>{form.name}</option>)}
          {block.formId && !forms.some((form) => form.id === block.formId) && <option value={block.formId}>{block.formId} (introuvable)</option>}
        </select>
      </Field>
    })()}
    <Field label="Titre au-dessus"><input className={fieldClass} value={block.heading} maxLength={160} placeholder="Facultatif" onChange={(event) => onChange({ heading: event.target.value })} /></Field>
  </>
}

function StatSettings({ block, onChange }: { block: Extract<PageBlock, { type: "stat" }>; onChange: (patch: Partial<Extract<PageBlock, { type: "stat" }>>) => void }) {
  const { details, loading } = useIndexDetails(block.index)
  return <>
    <IndexPicker value={block.index} onChange={(index) => onChange({ index, statId: "" })} />
    {block.index && <Field label="Statistique" hint={details && !details.stats.length ? "Cet index n’a pas encore de statistique : crée-la dans l’index (Modifier › Stats)." : "Les statistiques se créent dans l’index (Modifier › Stats)."}>
      <select className={fieldClass} value={block.statId} disabled={loading} onChange={(event) => onChange({ statId: event.target.value })}>
        <option value="">{loading ? "Lecture de l’index…" : "Choisir une statistique…"}</option>
        {details && <option value={ALL_PINNED_STATS}>Toutes les épinglées (comme l’onglet stat)</option>}
        {(details?.stats ?? []).map((stat) => <option key={stat.id} value={stat.id}>{stat.pinned ? "📌 " : ""}{stat.title}</option>)}
      </select>
    </Field>}
    <Field label="Titre au-dessus"><input className={fieldClass} value={block.heading} maxLength={160} placeholder="Facultatif" onChange={(event) => onChange({ heading: event.target.value })} /></Field>
  </>
}

/* ---------- Réglages d'un bloc ---------- */

export function BlockSettings({ block, pages, live, rowOf, onChange, onDuplicate, onRemove, onPage }: {
  block: PageBlock
  /** La page est le modèle des pages de ligne de cet index. */
  rowOf?: { index: string; tab?: string }
  pages: PageSummary[]
  live?: StudioPage["live"][string]
  onChange: (patch: Partial<PageBlock>, coalesce?: string) => void
  onDuplicate: () => void
  onRemove: () => void
  onPage: () => void
}) {
  const entry = blockCatalog.find((item) => item.type === block.type)!
  const Icon = blockIcons.blocks[block.type]
  const set = (patch: Record<string, unknown>, coalesce?: string) => onChange(patch as Partial<PageBlock>, coalesce)
  let content: ReactNode = null
  switch (block.type) {
    case "title":
      content = <>
        <Field label="Taille"><Segmented label="Taille" value={block.level} onChange={(level) => set({ level })} options={[{ value: "h2", label: "Grand" }, { value: "h3", label: "Moyen" }]} /></Field>
        <Field label="Alignement"><Segmented label="Alignement" value={block.align} onChange={(align) => set({ align })} options={[{ value: "left", label: "À gauche" }, { value: "center", label: "Centré" }]} /></Field>
        <Hint>Le titre et sa petite ligne s’écrivent dans le bloc.</Hint>
      </>
      break
    case "text":
      content = <Hint>Écris directement dans le bloc : gras, listes, couleurs, liens. Tape « {"{"} » pour citer une ligne d’un index (son nom, son survol).</Hint>
      break
    case "callout":
      content = <>
        <Field label="Ton"><Segmented label="Ton" value={block.tone} onChange={(tone) => set({ tone })} options={(Object.keys(calloutTones) as Array<keyof typeof calloutTones>).map((tone) => ({ value: tone, label: calloutTones[tone].label }))} /></Field>
        <Hint>Le titre et le texte s’écrivent dans l’encadré. Un encadré « MJ » reste visible de tous : pour le cacher aux joueurs, règle « Qui voit » plus bas.</Hint>
      </>
      break
    case "quote":
      content = <Hint>La citation et sa source s’écrivent dans le bloc.</Hint>
      break
    case "image": {
      const valid = !block.src || cleanImageSource(block.src) === block.src
      content = <>
        <Field label="Adresse de l’image" error={valid ? undefined : "Une adresse https://, un fichier d’Eraser (/api/…) ou une colonne de la ligne ({Portrait})."} hint={rowOf?.index ? "Page de ligne : « {Portrait} » prend l’image de cette colonne de la ligne." : "Une image du Drive partagé, d’un index (clic droit › copier l’adresse de l’image) ou du web (https)."}>
          <input className={fieldClass} value={block.src} placeholder="https://…" onChange={(event) => set({ src: event.target.value.trim() }, "src")} />
        </Field>
        <Field label="Légende"><input className={fieldClass} value={block.caption} maxLength={300} placeholder="Facultative (sert aussi de texte de remplacement)" onChange={(event) => set({ caption: event.target.value }, "caption")} /></Field>
        <Field label="Format"><Segmented size="sm" label="Format" value={block.ratio} onChange={(ratio) => set({ ratio })} options={[{ value: "auto", label: "Libre" }, { value: "21/9", label: "21:9" }, { value: "16/9", label: "16:9" }, { value: "4/3", label: "4:3" }, { value: "1/1", label: "1:1" }, { value: "3/4", label: "3:4" }]} /></Field>
        <Field label="Cadrage"><Segmented label="Cadrage" value={block.fit} onChange={(fit) => set({ fit })} options={[{ value: "cover", label: "Remplir le cadre" }, { value: "contain", label: "Image entière" }]} /></Field>
      </>
      break
    }
    case "separator":
      content = <Field label="Ornement"><Segmented label="Ornement" value={block.glyph} onChange={(glyph) => set({ glyph })} options={[{ value: "ornement", label: "◆ ◆ ◆" }, { value: "etoile", label: "✶" }, { value: "points", label: "· · ·" }, { value: "trait", label: "Trait" }]} /></Field>
      break
    case "link": {
      const kind = block.pageId ? "page" : "href"
      content = <>
        <Field label="Mène à"><Segmented label="Mène à" value={kind} onChange={(next) => set(next === "page" ? { pageId: pages[0]?.id ?? "", href: "" } : { pageId: "", href: block.href || "/" })} options={[{ value: "page", label: "Une page créée ici" }, { value: "href", label: "Une adresse d’Eraser" }]} /></Field>
        {kind === "page"
          ? <Field label="Page" hint="Le lien n’apparaît qu’à ceux qui peuvent ouvrir cette page.">
            <select className={fieldClass} value={block.pageId} onChange={(event) => set({ pageId: event.target.value })}>
              {!pages.length && <option value="">Aucune autre page pour l’instant</option>}
              {pages.map((page) => <option key={page.id} value={page.id}>{page.title}{page.status !== "publiee" ? " (brouillon)" : ""}</option>)}
            </select>
          </Field>
          : <Field label="Adresse" hint="Une page d’Eraser (/regles/combat, /campagne/…) ou un site https.">
            <input className={fieldClass} value={block.href} placeholder="/regles/combat" onChange={(event) => set({ href: event.target.value.trim() }, "href")} />
          </Field>}
        <Field label="Style"><Segmented label="Style" value={block.style} onChange={(style) => set({ style })} options={[{ value: "card", label: "Carte" }, { value: "compact", label: "Compacte" }]} /></Field>
        <Hint>Le titre (vide : celui de la page) et la description s’écrivent sur la carte-lien.</Hint>
      </>
      break
    }
    case "secret":
      content = <>
        <div className={`flex items-start gap-2 rounded-xl border px-3 py-2 text-xs ${live?.revealedAt ? "border-[#0f7a65]/35 bg-[#0f7a65]/8 text-[#0f7a65]" : "border-[#927640]/40 bg-[#927640]/8 text-[#7a5f22]"}`}>
          {live?.revealedAt ? <Check className="mt-0.5 size-3.5 shrink-0" /> : <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />}
          <span>{live?.revealedAt ? `Révélé aux joueurs${live.revealedBy ? ` par ${live.revealedBy}` : ""} le ${formatWhen(live.revealedAt)}.` : "Caché aux joueurs : le serveur ne leur envoie rien de ce bloc."}</span>
        </div>
        <Hint>On le révèle pendant la partie, sur la page publiée : bouton « Révéler aux joueurs » (MJ et admins). « Recacher » reste possible.</Hint>
      </>
      break
    case "notes":
      content = <>
        <Field label="Qui peut écrire une fois la page publiée">
          <div className="flex flex-wrap gap-1" role="group" aria-label="Qui peut écrire">
            {pageRoles.map((role) => {
              const on = block.editors.includes(role)
              return <button key={role} type="button" aria-pressed={on} onClick={() => set({ editors: on ? block.editors.filter((item) => item !== role) : [...block.editors, role] })} className="inline-flex items-center gap-1.5 rounded-full border border-border/80 bg-background/60 px-2.5 py-1 text-xs text-muted-foreground transition hover:text-foreground aria-pressed:border-foreground aria-pressed:bg-foreground aria-pressed:text-background">
                <span className={`size-2 rounded-full ${roleDot[role]}`} />{roleLabels[role]}
              </button>
            })}
          </div>
        </Field>
        <AccessTable block={block} />
        {live?.editedAt && <Hint>Écrit sur la page par {live.editedBy || "quelqu’un"} le {formatWhen(live.editedAt)} : c’est ce texte que les lecteurs voient.</Hint>}
      </>
      break
    case "view":
      content = <ViewSettings block={block} rowOf={rowOf} onChange={(patch) => set(patch)} />
      break
    case "rowfields":
      content = <RowFieldsSettings block={block} rowOf={rowOf} onChange={(patch) => set(patch)} />
      break
    case "backlinks":
      content = <>
        <Field label="Titre au-dessus"><input className={fieldClass} value={block.heading} maxLength={160} placeholder="Facultatif" onChange={(event) => set({ heading: event.target.value }, "heading")} /></Field>
        <Hint>Sur la page d’une ligne : les lignes des autres index qui la citent, par une référence « {"{"} » ou une colonne liée à son index. Une colonne que le lecteur ne voit pas ne compte pas.</Hint>
      </>
      break
    case "stat":
      content = <StatSettings block={block} onChange={(patch) => set(patch)} />
      break
    case "module":
      content = <>
        <Field label="Module" hint={eraserModules.find((item) => item.key === block.module)?.hint}>
          <select className={fieldClass} value={block.module} onChange={(event) => set({ module: event.target.value })}>
            {eraserModules.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
          </select>
        </Field>
        {block.module === "pages-section" && <Field label="Section">
          <select className={fieldClass} value={block.place} onChange={(event) => set({ place: event.target.value })}>
            {moduleSections.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
        </Field>}
        <Field label="Titre au-dessus"><input className={fieldClass} value={block.heading} maxLength={160} placeholder="Facultatif" onChange={(event) => set({ heading: event.target.value }, "heading")} /></Field>
        <Hint>{block.module === "origine" ? "Sur une page qui en remplace une d’Eraser (Réglages de la page › « Remplacer une page d’Eraser »), tout le contenu de la page d’origine s’affiche ici : place des blocs autour, au-dessus, à côté." : "Un morceau des pages d’Eraser, avec son fonctionnement (modifier, trier, ranger…). Il s’affiche sur la page elle-même ; ici, sa place."}</Hint>
      </>
      break
    case "search":
      content = <>
        <Field label="Texte d’invite"><input className={fieldClass} value={block.placeholder} maxLength={120} placeholder="Chercher dans la page…" onChange={(event) => set({ placeholder: event.target.value }, "placeholder")} /></Field>
        <Field label="Titre au-dessus"><input className={fieldClass} value={block.heading} maxLength={160} placeholder="Facultatif" onChange={(event) => set({ heading: event.target.value }, "heading")} /></Field>
        <Hint>Ce qu’on tape ici filtre les lignes de toutes les vues d’index de la page (sauf celles réglées pour ne pas suivre la recherche). Rien n’est relu dans Google : la recherche se fait sur ce qui est déjà affiché.</Hint>
      </>
      break
  }
  return <div>
    <div className="flex items-center gap-2.5 px-4 pb-3">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-secondary text-primary"><Icon className="size-4" /></span>
      <span className="min-w-0"><b className="block font-display text-[15px]">{entry.label}</b><small className="block text-xs leading-snug text-muted-foreground">{entry.hint}</small></span>
    </div>
    <Group title="Contenu">{content}</Group>
    <Group title="Qui voit" badge={<VisibilityPill vis={block.vis} />}>
      <RadioCards name={`vis-${block.id}`} value={block.vis} onChange={(vis) => set({ vis })} options={blockVisibilities.map((item) => ({ value: item.value, label: item.label, hint: item.hint, dot: visDot[item.value] || undefined }))} />
      <Hint>Vérifié sur le serveur : un bloc masqué n’est jamais envoyé au navigateur de qui ne le voit pas.</Hint>
    </Group>
    {rowOf?.index && <Group title="Quand l’afficher" open={Boolean(block.showIf)} badge={block.showIf ? <span className="rounded-full border px-1.5 text-[10.5px] font-semibold normal-case tracking-normal">{block.showIf.conditions.length} condition{block.showIf.conditions.length > 1 ? "s" : ""}</span> : undefined}>
      <RowCondition rowOf={rowOf} value={block.showIf} onChange={(showIf) => set({ showIf })} />
    </Group>}
    <div className="flex flex-wrap gap-1.5 border-t border-border/70 px-4 pt-3">
      <button type="button" onClick={onDuplicate} className="inline-flex items-center gap-1.5 rounded-lg border bg-card px-2.5 py-1 text-xs hover:border-ring">Dupliquer</button>
      <button type="button" onClick={onRemove} className="inline-flex items-center gap-1.5 rounded-lg border bg-card px-2.5 py-1 text-xs text-destructive hover:border-destructive/50">Supprimer</button>
      <button type="button" onClick={onPage} className="ml-auto inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground">Régler la page</button>
    </div>
  </div>
}

/** Page de ligne : le bloc ne s'affiche que pour les lignes qui remplissent ces conditions. */
function RowCondition({ rowOf, value, onChange }: { rowOf: { index: string; tab?: string }; value?: ViewWhere; onChange: (value: ViewWhere | undefined) => void }) {
  const { details, loading } = useIndexDetails(rowOf.index)
  const tabs = (details?.tabs ?? []).filter((tab) => !rowOf.tab || tab.name === rowOf.tab)
  const columns = [...new Set(tabs.flatMap((tab) => tab.columns ?? []))]
  const choices = Object.assign({}, ...tabs.map((tab) => tab.choices ?? {})) as Record<string, string[]>
  if (loading && !details) return <span className="text-xs text-muted-foreground">Lecture de l’index…</span>
  return <>
    <WhereEditor where={value} columns={columns} choices={choices} rowPage={false} onChange={onChange} />
    <Hint>Sans condition : sur la page de chaque ligne. Sinon, seulement sur celles qui les remplissent (« Type est Boss ») ; ailleurs, le bloc n’est pas envoyé du tout.</Hint>
  </>
}

function Hint({ children }: { children: ReactNode }) {
  return <p className="text-[12px] leading-relaxed text-muted-foreground">{children}</p>
}

/** Qui voit et qui écrit un carnet, rôle par rôle. */
function AccessTable({ block }: { block: Extract<PageBlock, { type: "notes" }> }) {
  const rows = [...pageRoles].reverse().map((role) => ({ role, sees: blockVisibleTo(block.vis, role), writes: block.editors.includes(role) }))
  const useless = rows.filter((row) => row.writes && !row.sees)
  return <div className="grid gap-1.5">
    <table className="w-full text-xs">
      <thead><tr className="text-left text-[10.5px] uppercase tracking-[0.08em] text-muted-foreground"><th className="py-1 font-semibold">Rôle</th><th className="font-semibold">Voit</th><th className="font-semibold">Écrit</th></tr></thead>
      <tbody>{rows.map((row) => <tr key={row.role} className="border-t border-border/60">
        <th scope="row" className="py-1 text-left font-medium"><span className="inline-flex items-center gap-1.5"><span className={`size-2 rounded-full ${roleDot[row.role]}`} />{roleLabels[row.role]}</span></th>
        <td>{row.sees ? <Check className="size-3.5 text-[#0f7a65]" /> : "—"}</td>
        <td>{row.writes && row.sees ? <span className="font-semibold text-[#0f7a65]">oui</span> : row.writes ? <span className="text-destructive">ne voit pas</span> : <span className="text-muted-foreground">lecture</span>}</td>
      </tr>)}</tbody>
    </table>
    {useless.length > 0 && <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-2.5 py-1.5 text-[11.5px] text-destructive">{useless.map((row) => roleLabels[row.role]).join(", ")} : droit d’écrire, mais ne voit pas le carnet. Élargis « Qui voit ».</p>}
  </div>
}

/* ---------- Réglages de la page ---------- */

/** Le modèle des pages de ligne : l'index (et l'onglet) dont chaque ligne a sa page. */
function RowTemplateSettings({ rowOf, place, onChange }: { rowOf?: { index: string; tab?: string }; place: PagePlace; onChange: (rowOf: { index: string; tab?: string } | undefined) => void }) {
  const { details, loading } = useIndexDetails(rowOf?.index ?? "")
  return <>
    <IndexPicker value={rowOf?.index ?? ""} onChange={(index) => onChange(index ? { index } : undefined)} />
    {rowOf?.index && <Field label="Onglet" hint="Un modèle d’onglet l’emporte sur celui de tout l’index.">
      <select className={fieldClass} value={rowOf.tab ?? ""} disabled={loading} onChange={(event) => onChange(event.target.value ? { index: rowOf.index, tab: event.target.value } : { index: rowOf.index })}>
        <option value="">Toutes les lignes de l’index</option>
        {(details?.tabs ?? []).map((tab) => <option key={tab.name} value={tab.name}>{tab.name}</option>)}
      </select>
    </Field>}
    <Hint>{rowOf?.index ? <>Chaque ligne a sa page à <code className="font-mono text-[11px]">/fiche/{rowOf.index}/ID</code>, ouverte depuis la fiche de la ligne et depuis les vues. Dans les blocs, « {"{Nom}"} », « {"{Image}"} »… prennent les valeurs de la ligne ; les blocs « Valeurs de la ligne » et « Cité dans » la montrent. Les carnets et les secrets sont communs à toutes les lignes.</> : "Choisis un index : cette page devient le modèle de la page de chacune de ses lignes."}</Hint>
    {rowOf?.index && (place === "ressources" || place === "bac-a-sable" || place === "administration") && <p className="rounded-lg border border-[#9a6512]/35 bg-[#9a6512]/8 px-2.5 py-1.5 text-[11.5px] text-[#7a4f0e]">Rangée dans une section fermée aux joueurs : ils n’ouvriront pas ces pages. Range le modèle hors menu ou dans Règles pour eux.</p>}
  </>
}

export function PageSettings({ page, pages, campaigns, isAdmin, linking, saveError, onChange, onRevert, onTemplate, onTrash, busy }: {
  page: StudioPage
  pages: PageSummary[]
  campaigns: Array<{ id: string; name: string }>
  isAdmin: boolean
  linking: Array<{ id: string; title: string; href: string }>
  saveError: string
  onChange: (patch: Partial<PageDraft>, coalesce?: string) => void
  onRevert: () => void
  onTemplate: () => void
  onTrash: () => void
  busy: boolean
}) {
  const [copied, setCopied] = useState(false)
  const others = pages.filter((other) => other.id !== page.id && !other.trashedAt && other.place === page.place && (page.place !== "campagne" || other.campaignId === page.campaignId))
  const slugError = slugProblem(page.slug, page.place, others.map((other) => other.slug))
  const href = pageHref(page)
  const places = pagePlaces.filter((place) => isAdmin || place.value !== "administration")
  const prefix = href.slice(0, href.lastIndexOf("/") + 1)
  return <div>
    <div className="flex items-center gap-2.5 px-4 pb-3">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-secondary text-primary"><PageIcon icon={page.icon} emoji={page.emoji} className="size-4" /></span>
      <span className="min-w-0"><b className="block truncate font-display text-[15px]">{page.title || "Sans titre"}</b><small className="block text-xs text-muted-foreground">Réglages de la page entière</small></span>
    </div>
    <Group title="Page">
      <Field label="Titre"><input className={fieldClass} value={page.title} maxLength={120} onChange={(event) => onChange({ title: event.target.value }, "title")} /></Field>
      <Field label="Description" hint="Une phrase sous le titre, et sur les cartes qui mènent à la page.">
        <textarea className={`${fieldClass} h-auto min-h-16 resize-y py-1.5 leading-snug`} value={page.description} maxLength={400} placeholder="Facultative" onChange={(event) => onChange({ description: event.target.value }, "description")} />
      </Field>
      <Field label="Icône"><IconPicker icon={page.icon || undefined} emoji={page.emoji || undefined} allowNone onChange={(value) => onChange({ icon: value.icon ?? "", emoji: value.emoji ?? "" })} /></Field>
      <label className="flex items-start gap-2 text-[13px]"><input type="checkbox" className="mt-0.5 accent-primary" checked={!page.hideHeader} onChange={(event) => onChange({ hideHeader: event.target.checked ? undefined : true })} /><span>Montrer l’en-tête<span className="block text-[11.5px] text-muted-foreground">Le titre, l’icône et la description en haut de la page. Sans lui, la page commence par ses blocs (le titre sert encore au menu et aux liens).</span></span></label>
    </Group>
    <Group title="Place et adresse" badge={<span className="rounded-full border bg-card px-1.5 text-[10.5px] font-semibold normal-case tracking-normal">{pagePlaces.find((place) => place.value === page.place)?.label.replace(" (lien direct)", "")}</span>}>
      <Field label="Rangée dans" hint={page.place === "hors-menu" ? "Dans aucun menu : on y arrive par un lien, la recherche (Ctrl + K) ou l’Index des pages." : page.place === "campagne" ? "Dans le dossier de la campagne ; ouverte à ses joueurs et à son MJ." : "La page apparaît sur la page de la section, et sous son adresse."}>
        <select className={fieldClass} value={page.place} onChange={(event) => onChange({ place: event.target.value as PagePlace, campaignId: event.target.value === "campagne" ? page.campaignId || campaigns[0]?.id || "" : "", ...(event.target.value === "administration" ? { vis: "admin" as const } : {}) })}>
          {places.map((place) => <option key={place.value} value={place.value}>{place.label}</option>)}
        </select>
      </Field>
      {page.place === "campagne" && <Field label="Campagne" error={campaigns.length ? undefined : "Aucune campagne dont tu es le MJ."}>
        <select className={fieldClass} value={page.campaignId} onChange={(event) => onChange({ campaignId: event.target.value })}>
          {!page.campaignId && <option value="">Choisir une campagne…</option>}
          {campaigns.map((campaign) => <option key={campaign.id} value={campaign.id}>{campaign.name}</option>)}
        </select>
      </Field>}
      <Field label="Adresse" error={slugError || saveError || undefined} hint="Lettres sans accent, chiffres et tirets. Changer l’adresse casse les liens déjà copiés ailleurs.">
        <div className="flex min-w-0 items-center overflow-hidden rounded-lg border border-input bg-background/70 focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/20">
          <span className="max-w-[45%] shrink-0 truncate border-r bg-muted/60 px-2 py-1.5 font-mono text-[11.5px] text-muted-foreground" title={prefix}>{prefix}</span>
          <input className="h-8 min-w-0 flex-1 bg-transparent px-2 font-mono text-[12.5px] outline-none" value={page.slug} onChange={(event) => onChange({ slug: event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-") }, "slug")} onBlur={() => onChange({ slug: slugify(page.slug) || slugify(page.title) || "page" })} />
          <button type="button" title="Copier le lien" aria-label="Copier le lien" className="flex h-8 w-8 shrink-0 items-center justify-center text-muted-foreground hover:text-foreground" onClick={() => { void navigator.clipboard?.writeText(`http://127.0.0.1:32147${href}`).then(() => { setCopied(true); window.setTimeout(() => setCopied(false), 1500) }) }}>{copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}</button>
        </div>
      </Field>
      {page.slug !== slugify(page.title) && <button type="button" onClick={() => onChange({ slug: slugify(page.title) || "page" })} className="justify-self-start text-xs font-medium text-primary hover:underline">Reprendre l’adresse du titre ({slugify(page.title) || "page"})</button>}
    </Group>
    <Group title="Qui voit la page">
      <RadioCards name="vis-page" value={page.vis} disabled={page.place === "administration"} onChange={(vis) => onChange({ vis })} options={pageVisibilities.filter((item) => isAdmin || item.value !== "admin").map((item) => ({ value: item.value, label: item.label, hint: item.hint, dot: item.value === "mj" ? roleDot.mj : item.value === "admin" ? roleDot.admin : undefined }))} />
      <Hint>{page.place === "administration" ? "Une page d’Administration n’est ouverte qu’aux admins." : page.place === "ressources" || page.place === "bac-a-sable" ? "Cette section n’est ouverte qu’aux MJ et aux admins : les joueurs n’y ont pas accès." : "Vérifié sur le serveur : une page fermée à un rôle n’apparaît ni dans sa recherche ni à son adresse."}</Hint>
    </Group>
    <Group title="Version publiée" badge={page.unpublished && page.published ? <span className="rounded-full border border-[#9a6512]/40 bg-[#9a6512]/10 px-1.5 text-[10.5px] font-semibold normal-case tracking-normal text-[#9a6512]">modifiée</span> : undefined}>
      <Hint>{page.published ? `Publiée le ${formatWhen(page.publishedAt)}. Les lecteurs voient cette version tant que tu ne publies pas tes modifications.` : "Jamais publiée : seuls ceux qui peuvent la modifier la voient."}</Hint>
      {page.published && <button type="button" disabled={!page.unpublished || busy} onClick={onRevert} className="inline-flex items-center justify-center gap-1.5 rounded-lg border bg-card px-3 py-1.5 text-xs font-medium hover:border-ring disabled:opacity-50">Revenir à la version publiée</button>}
      {page.status === "publiee" && <a href={href} target="_self" className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"><ExternalLink className="size-3.5" />Ouvrir la page publiée</a>}
      <Field label="Pages qui mènent ici">{linking.length ? <div className="flex flex-wrap gap-1">{linking.map((item) => <a key={item.id} href={studioHref(item.id)} className="rounded-full border bg-background/60 px-2 py-0.5 text-xs hover:border-ring">{item.title}</a>)}</div> : <span className="text-xs text-muted-foreground">Aucune pour l’instant.</span>}</Field>
    </Group>
    <Group title="Remplacer une page d’Eraser" open={Boolean(page.replaces)} badge={page.replaces ? <span className="rounded-full border border-primary/35 bg-primary/8 px-1.5 text-[10.5px] font-semibold normal-case tracking-normal text-primary">active</span> : undefined}>
      {page.rowOf?.index ? <Hint>Cette page est le modèle des lignes d’un index : elle ne remplace pas une page d’Eraser. Retire d’abord le modèle (ci-dessous) pour l’utiliser ici.</Hint> : page.place === "campagne" ? <Hint>Une page de campagne ne remplace pas une page d’Eraser : range-la d’abord ailleurs (Place et adresse).</Hint> : <>
      <Field label="Page d’Eraser" hint="La page créée prend sa place à son adresse, ou s’ajoute à son contenu. Seulement une fois publiée, et pour qui peut la lire ; les autres voient la page d’origine.">
        <select className={fieldClass} value={page.replaces ?? ""} onChange={(event) => onChange(event.target.value ? { replaces: event.target.value, replaceMode: page.replaceMode ?? "after" } : { replaces: undefined, replaceMode: undefined })}>
          <option value="">Aucune</option>
          {[...new Set(replaceableRoutes.map((route) => route.group))].map((group) => <optgroup key={group} label={group}>
            {replaceableRoutes.filter((route) => route.group === group).map((route) => <option key={route.path} value={route.path}>{route.label} — {route.path}</option>)}
          </optgroup>)}
        </select>
      </Field>
      {page.replaces && <RadioCards name="replace-mode" value={page.replaceMode ?? "after"} onChange={(replaceMode) => onChange({ replaceMode })} options={replaceModes.map((mode) => ({ value: mode.value, label: mode.label, hint: mode.hint }))} />}
      {page.replaces && <Hint>Réversible : choisis « Aucune » pour rendre la page d’origine. Admins et MJ gardent « Voir la page d’origine ». La connexion, les comptes, la corbeille, Google, Roll20 et le créateur de pages ne se remplacent jamais.</Hint>}
      </>}
    </Group>
    <Group title="Page de chaque ligne d’un index" open={Boolean(page.rowOf?.index)} badge={page.rowOf?.index ? <span className="rounded-full border border-primary/35 bg-primary/8 px-1.5 text-[10.5px] font-semibold normal-case tracking-normal text-primary">modèle</span> : undefined}>
      {page.replaces ? <Hint>Cette page remplace ou complète une page d’Eraser : elle ne peut pas servir aussi de page pour chaque ligne d’un index.</Hint> : <RowTemplateSettings rowOf={page.rowOf} place={page.place} onChange={(rowOf) => onChange({ rowOf })} />}
    </Group>
    <Group title="Modèle et corbeille" open={false}>
      <button type="button" onClick={onTemplate} disabled={busy} className="inline-flex items-center justify-center gap-1.5 rounded-lg border bg-card px-3 py-1.5 text-xs font-medium hover:border-ring disabled:opacity-50">Enregistrer comme modèle…</button>
      <Hint>Un modèle garde les blocs, les vues et les réglages des blocs ; « Nouvelle page › depuis un modèle » le recrée.</Hint>
      <button type="button" onClick={onTrash} disabled={busy} className="inline-flex items-center justify-center gap-1.5 rounded-lg border bg-card px-3 py-1.5 text-xs font-medium text-destructive hover:border-destructive/50 disabled:opacity-50">{busy && <LoaderCircle className="size-3.5 animate-spin" />}Mettre à la corbeille</button>
    </Group>
  </div>
}
