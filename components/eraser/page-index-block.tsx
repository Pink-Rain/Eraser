"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { createContext, useCallback, useContext, useDeferredValue, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react"
import { ChevronRight, LoaderCircle, RotateCcw, Search, TriangleAlert, X } from "lucide-react"

import { CardActionsContext, IndexCard, IndexCardGrid, roleRowOf, type CardActions, type CardRowSource } from "@/components/eraser/index-card"
import { useRolesOf } from "@/components/eraser/view-roles"
import { IndexFormView } from "@/components/eraser/index-form-view"
import { IndexEntryForm, primeWorldIndexData } from "@/components/eraser/index-cells"
import { IndexRowForm } from "@/components/eraser/index-row-sheet"
import type { IndexColumnSpec } from "@/lib/index-columns"
import type { IndexLayout } from "@/lib/index-layouts"
import { IndexStats } from "@/components/eraser/index-stats"
import { IndexPresentation } from "@/components/eraser/index-presentation"
import type { BacklinksBlock, SearchBlock, StatBlock, ViewBlock } from "@/lib/custom-pages"
import type { Backlink } from "@/lib/custom-pages-rows"
import { viewHeights } from "@/lib/custom-pages"
import { ALL_PINNED_STATS, type StatBlockData, type ViewBlockData } from "@/lib/custom-pages-data"
import { pickCard } from "@/lib/index-cards"
import { foldName } from "@/lib/index-columns"
import { DEFAULT_ITEM_CARD, isPresentationKind } from "@/lib/index-presentations"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"

/**
 * Les blocs d'une page qui montrent un index : une vue (tableau, cartes, liste, kanban,
 * calendrier…) ou une statistique épinglée. Leur forme reste celle réglée dans l'index ;
 * les lignes viennent de /api/pages/block-data, qui ne garde que ce que le lecteur peut voir.
 * Une ligne s'ouvre dans son index (MJ et admins) ; un joueur la lit sans l'ouvrir.
 */

type ViewData = ViewBlockData & { calendars?: Array<{ tabName: string; headers: string[]; rows: Array<{ values: string[] }> }> }
type BacklinksData = { kind: "backlinks"; items: Backlink[] }
type Loaded = { data: ViewData | StatBlockData | BacklinksData | null; error: string; loading: boolean }

/**
 * Où lire les données : le bloc d'une page enregistrée (`pageId`), ou (atelier) l'index
 * directement ; `asPlayer` : l'aperçu « Voir comme Joueur » reçoit ce qu'un joueur recevrait.
 */
export type BlockSource = { pageId: string; draft?: boolean; row?: { index: string; id: string } } | { blueprint: string; row?: { index: string; id: string } } | { direct: true; asPlayer?: boolean }

function dataUrl(block: ViewBlock | StatBlock | BacklinksBlock, source: BlockSource) {
  const rowQuery = "row" in source && source.row ? `&rowIndex=${encodeURIComponent(source.row.index)}&rowId=${encodeURIComponent(source.row.id)}` : ""
  if ("pageId" in source) return `/api/pages/block-data?page=${encodeURIComponent(source.pageId)}&block=${encodeURIComponent(block.id)}${source.draft ? "&draft=1" : ""}${rowQuery}`
  // Une page d'Eraser dessinée par le moteur : ses blocs se lisent d'après son plan.
  if ("blueprint" in source) return `/api/pages/block-data?blueprint=${encodeURIComponent(source.blueprint)}&block=${encodeURIComponent(block.id)}${rowQuery}`
  if (block.type === "backlinks") return ""
  if (!block.index) return ""
  const as = source.asPlayer ? "&as=joueur" : ""
  if (block.type === "stat") return block.statId ? `/api/pages/block-data?index=${encodeURIComponent(block.index)}&stat=${encodeURIComponent(block.statId)}${as}` : ""
  // L'atelier lit l'index avec les réglages du bloc, encore non enregistrés.
  const { index, tab, kind, limit, layout, viewId, savedViewId, presetId, cardId, where, sort, click } = block
  return tab ? `/api/pages/block-data?index=${encodeURIComponent(index)}&def=${encodeURIComponent(JSON.stringify({ tab, kind, limit, layout, viewId, savedViewId, presetId, cardId, where, sort, click }))}${as}` : ""
}

/* ---------- La recherche de la page ---------- */

type PageSearch = { query: string; setQuery: (query: string) => void; present: boolean }
const PageSearchContext = createContext<PageSearch | null>(null)

/** La recherche partagée par les blocs d'une page : le bloc Recherche l'écrit, les blocs Vue la suivent. */
export function PageSearchProvider({ children, present }: { children: ReactNode; present: boolean }) {
  const [query, setQuery] = useState("")
  const value = useMemo(() => ({ query: present ? query : "", setQuery, present }), [present, query])
  return <PageSearchContext.Provider value={value}>{children}</PageSearchContext.Provider>
}

const foldSearch = (value: string) => value.replace(/<[^>]+>/g, " ").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("fr").replace(/\s+/g, " ").trim()

/** Une recherche tapée ailleurs (le champ de l'Index des pages) : les blocs Vue la suivent comme celle d'un bloc Recherche. */
export function PageSearchQuery({ query, children }: { query: string; children: ReactNode }) {
  const value = useMemo(() => ({ query, setQuery: () => undefined, present: true }), [query])
  return <PageSearchContext.Provider value={value}>{children}</PageSearchContext.Provider>
}

/** Un bloc « Recherche » : un champ qui filtre les lignes des vues de la page. */
export function PageSearchBlock({ block }: { block: SearchBlock }) {
  const search = useContext(PageSearchContext)
  const query = search?.query ?? ""
  return <section className="grid gap-2">
    {block.heading && <h3 className="font-display text-lg font-semibold tracking-[-0.01em]">{block.heading}</h3>}
    <label className="flex items-center gap-2.5 rounded-2xl border bg-card px-3.5 shadow-[0_8px_24px_rgb(67_50_31/0.05)] focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/20">
      <Search className="size-4 shrink-0 text-muted-foreground" />
      <input type="search" value={query} onChange={(event) => search?.setQuery(event.target.value)} placeholder={block.placeholder || "Chercher dans la page…"} aria-label={block.placeholder || "Chercher dans la page"} className="h-11 min-w-0 flex-1 bg-transparent text-[15px] outline-none [&::-webkit-search-cancel-button]:hidden" />
      {query && <button type="button" onClick={() => search?.setQuery("")} aria-label="Effacer la recherche" className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"><X className="size-3.5" /></button>}
    </label>
  </section>
}

function useBlockData(url: string, version: number) {
  const [state, setState] = useState<Loaded & { url: string }>({ data: null, error: "", loading: Boolean(url), url })
  useEffect(() => {
    if (!url) return
    let alive = true
    // eslint-disable-next-line react-hooks/set-state-in-effect -- une nouvelle adresse repart d'un état « chargement »
    setState((current) => ({ data: current.url === url ? current.data : null, error: "", loading: true, url }))
    fetch(url)
      .then(async (response) => {
        const payload = (await response.json().catch(() => ({}))) as { data?: ViewData | StatBlockData | BacklinksData; error?: string }
        if (!alive) return
        if (!response.ok || !payload.data) setState({ data: null, error: payload.error || "Les données de ce bloc n’ont pas pu être lues.", loading: false, url })
        else setState({ data: payload.data, error: "", loading: false, url })
      })
      .catch(() => { if (alive) setState({ data: null, error: "Eraser ne répond pas : réessaie dans un instant.", loading: false, url }) })
    return () => { alive = false }
  }, [url, version])
  return url ? state : { data: null, error: "", loading: false, url }
}

function Placeholder({ children, tone = "muted", onRetry }: { children: React.ReactNode; tone?: "muted" | "error"; onRetry?: () => void }) {
  return <div className={`flex flex-wrap items-center justify-center gap-2 rounded-2xl border border-dashed px-4 py-8 text-center text-sm ${tone === "error" ? "border-destructive/35 bg-destructive/5 text-destructive" : "text-muted-foreground"}`}>
    {tone === "error" && <TriangleAlert className="size-4 shrink-0" />}
    <span>{children}</span>
    {onRetry && <button type="button" onClick={onRetry} className="inline-flex items-center gap-1 rounded-lg border bg-card px-2 py-0.5 text-xs font-medium text-foreground hover:border-primary/40"><RotateCcw className="size-3" />Réessayer</button>}
  </div>
}

function Skeleton() {
  return <div aria-label="Chargement" className="grid gap-2 rounded-2xl border bg-card/60 p-4">
    <div className="flex items-center gap-2 text-xs text-muted-foreground"><LoaderCircle className="size-3.5 animate-spin" />Lecture de l’index…</div>
    {[0, 1, 2].map((line) => <div key={line} className="h-7 animate-pulse rounded-lg bg-muted/70" style={{ width: `${92 - line * 14}%` }} />)}
  </div>
}

const strip = (value: string) => value.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+/g, " ").trim()

/** Un tableau en lecture seule : les colonnes de l'onglet, le nom en premier. */
function ReadTable({ data, open, onRow, linkOf }: { data: ViewData; open: (href?: string) => void; /** Sur une page : la ligne s'ouvre ici (sa page, sinon sa fiche en lecture). */ onRow?: (rowKey: string) => void; linkOf: (rowKey: string) => string | undefined }) {
  return <div className="overflow-x-auto rounded-2xl border bg-card">
    <table className="w-full border-collapse text-[13px]">
      <thead className="sticky top-0 z-[1]">
        <tr>{data.headers.map((header) => <th key={header} scope="col" className="whitespace-nowrap border-b bg-muted px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{header}</th>)}</tr>
      </thead>
      <tbody>
        {data.rows.map((row) => { const link = linkOf(row.key); const click = onRow ? () => onRow(row.key) : row.href ? () => open(row.href) : undefined; return <tr key={row.key} onClick={click} className={`border-b border-border/60 last:border-b-0 ${click ? "cursor-pointer hover:bg-background/70" : ""}`}>
          {row.cells.map((cell, index) => <td key={data.headers[index]} className={`max-w-[22rem] px-3 py-1.5 align-top tabular-nums ${index === 0 ? "whitespace-nowrap font-semibold" : ""}`}>
            {index === 0 && link ? <Link href={link} prefetch={false} onClick={(event) => event.stopPropagation()} className="hover:text-primary hover:underline">{strip(cell) || row.name}</Link> : <span className="line-clamp-3">{strip(cell)}</span>}
          </td>)}
        </tr> })}
      </tbody>
    </table>
  </div>
}

/**
 * Une ligne modifiable sur une page (le détail modifiable, un bouton « Modifier ») : le formulaire de
 * l'onglet, ses champs enregistrés d'eux-mêmes dans l'index, comme dans sa fiche. Seulement quand le
 * serveur a donné l'identifiant de la ligne (jamais à un joueur) ; le serveur vérifie qui peut écrire.
 * Le bloc relit l'index en refermant, pas à chaque frappe (le quota de Google est partagé).
 */
function PageRowForm({ data, rowKey, form, locked = [], valueOf, specOf, onChanged }: { data: ViewData; rowKey: string; form?: IndexLayout; locked?: string[]; valueOf: (rowKey: string, header: string) => string; specOf: (header: string) => IndexColumnSpec | undefined; onChanged?: () => void }) {
  const row = data.rows.find((item) => item.key === rowKey)
  const pendingRef = useRef<Promise<unknown> | null>(null)
  const changedRef = useRef(onChanged)
  useEffect(() => { changedRef.current = onChanged })
  // Refermé (ou une autre ligne) : le bloc relit l'index une fois ce qui partait enregistré.
  useEffect(() => () => { const pending = pendingRef.current; if (pending) void pending.finally(() => changedRef.current?.()) }, [])
  const fields = data.headers.filter((header) => !/^id$/i.test(header.trim())).map((header) => ({ key: header, label: header, spec: specOf(header) ?? { kind: "rich" as const }, value: valueOf(rowKey, header) }))
  const save = async (_key: string, changes: Record<string, string>) => {
    const request = (async () => {
      const response = await fetch("/api/resources/world-indexes", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ key: data.index, action: "update-fields", tabName: data.tab, rowNumber: 2, rowId: row?.id ?? "", rowName: row?.name ?? "", fields: changes }) })
      const payload = (await response.json().catch(() => ({}))) as { error?: string }
      if (!response.ok) throw new Error(payload.error || "Ce champ n’a pas pu être enregistré.")
    })()
    pendingRef.current = request.catch(() => undefined)
    await request
  }
  return <IndexRowForm rowKey={rowKey} fields={fields} layout={form} onSave={save} locked={locked} />
}

function ViewContent({ data, block, searching = false, onChanged }: { data: ViewData; block: ViewBlock; searching?: boolean; /** Une ligne ajoutée ici : le bloc relit l'index. */ onChanged?: () => void }) {
  const router = useRouter()
  const byKey = useMemo(() => new Map(data.rows.map((row) => [row.key, row])), [data.rows])
  // Le survol au passage de la souris : seulement les lignes dont le serveur donne l'identifiant (jamais à un joueur).
  const rowRefOf = useCallback((rowKey: string) => { const id = byKey.get(rowKey)?.id; return id ? { index: data.index, id } : null }, [byKey, data.index])
  const column = useMemo(() => new Map(data.headers.map((header, index) => [foldName(header), index])), [data.headers])
  const valueOf = useCallback((rowKey: string, header: string) => { const at = column.get(foldName(header)); return at === undefined ? "" : byKey.get(rowKey)?.cells[at] ?? "" }, [byKey, column])
  const specOf = useCallback((header: string) => data.specs[header] ?? Object.entries(data.specs).find(([name]) => foldName(name) === foldName(header))?.[1], [data.specs])
  const rowSource = useCallback((rowKey: string): CardRowSource => ({ key: rowKey, value: (header) => valueOf(rowKey, header), spec: specOf }), [specOf, valueOf])
  const open = useCallback((href?: string) => { if (href) router.push(href) }, [router])
  const openRow = useCallback((rowKey: string) => open(byKey.get(rowKey)?.href), [byKey, open])
  const hrefOf = useCallback((rowKey: string) => byKey.get(rowKey)?.href, [byKey])
  // « Au clic » laissé à la vue (le bloc n'impose ni adresse ni « rien ») : la fiche s'ouvre ici, en
  // lecture, pour tous les lecteurs ; on ne quitte la page que pour la page de la ligne, si elle en a une
  // (une adresse « ?ligne= » mène à l'index : elle ne compte pas).
  const inPlace = !block.click || isPresentationKind(data.layout?.kind)
  const rowPageOf = useCallback((rowKey: string) => { const href = byKey.get(rowKey)?.href; return href && !href.includes("?ligne=") ? href : undefined }, [byKey])
  const openRowPage = useCallback((rowKey: string) => { const href = rowPageOf(rowKey); if (!href) return false; router.push(href); return true }, [rowPageOf, router])
  const [sheet, setSheet] = useState<{ row: string; form: string; card?: string } | null>(null)
  // La ligne se modifie ici seulement si le serveur a donné son identifiant (MJ et admins ; jamais un joueur).
  const editable = useCallback((rowKey: string) => Boolean(byKey.get(rowKey)?.id) && data.index !== "", [byKey, data.index])
  // « Ajouter » de la barre d'outils : une ligne neuve dans l'onglet, ici, dans une fenêtre (le serveur vérifie qui peut écrire).
  const [adding, setAdding] = useState(false)
  const [addState, setAddState] = useState<{ pending: boolean; error: string }>({ pending: false, error: "" })
  const addFields = useMemo(() => data.headers.filter((header) => !/^id$/i.test(header.trim())).map((header) => ({ key: header, label: header, spec: specOf(header) ?? { kind: "rich" as const } })), [data.headers, specOf])
  const addRow = useCallback(async (values: Record<string, string>) => {
    setAddState({ pending: true, error: "" })
    try {
      const headers = addFields.map((field) => field.key)
      const response = await fetch("/api/resources/world-indexes", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ key: data.index, action: "add", tabName: data.tab, headers, values: headers.map((header) => values[header] ?? "") }) })
      const payload = (await response.json().catch(() => ({}))) as { error?: string }
      if (!response.ok) throw new Error(payload.error || "La ligne n’a pas pu être ajoutée.")
      setAdding(false)
      setAddState({ pending: false, error: "" })
      onChanged?.()
    } catch (reason) {
      setAddState({ pending: false, error: reason instanceof Error ? reason.message : "La ligne n’a pas pu être ajoutée." })
    }
  }, [addFields, data.index, data.tab, onChanged])
  // Ouvrir une ligne hors des vues réglées (cartes, tableau) : sa page si elle en a une, sinon sa fiche ici.
  const openHere = useCallback((rowKey: string) => { if (!inPlace) return openRow(rowKey); if (!openRowPage(rowKey)) setSheet({ row: rowKey, form: "principal" }) }, [inPlace, openRow, openRowPage])
  const linkOf = useCallback((rowKey: string) => inPlace ? rowPageOf(rowKey) : hrefOf(rowKey), [hrefOf, inPlace, rowPageOf])
  // Les boutons d'une carte dans une page : ceux qui mènent ailleurs (une page web, une page
  // d'Eraser) partent d'ici ; ceux qui touchent la ligne l'ouvrent dans son index, où ils agissent.
  const rolesOf = useRolesOf()
  const cardActions = useMemo<CardActions>(() => ({
    run: (rowKey, button) => {
      const fill = (text: string) => text.replace(/\{([^{}]+)\}/g, (_match, name: string) => strip(valueOf(rowKey, name.trim())))
      const step = button.steps[0]
      if (step?.type === "open-url" && /^https?:\/\//i.test(fill(step.url).trim())) { window.open(fill(step.url).trim(), "_blank", "noopener,noreferrer"); return }
      if (step?.type === "open-eraser" && fill(step.href).trim().startsWith("/")) { router.push(fill(step.href).trim()); return }
      // Ce qui s'ouvre sur la ligne s'ouvre ici, dans la page : sa fiche, un formulaire (modifiable pour qui peut écrire), une carte.
      if (step?.type === "open-sheet") return setSheet({ row: rowKey, form: "principal" })
      if (step?.type === "open-form") return setSheet({ row: rowKey, form: step.form || "principal" })
      if (step?.type === "show-card") return setSheet({ row: rowKey, form: "principal", card: step.card || DEFAULT_ITEM_CARD })
      if (step?.type === "open-page") { if (!openRowPage(rowKey)) setSheet({ row: rowKey, form: "principal" }); return }
      // Ce qui modifie la ligne (une valeur, +1, supprimer…) se fait dans son index (MJ et admins).
      openRow(rowKey)
    },
    rolesOf: (rowKey) => rolesOf(roleRowOf(byKey.get(rowKey)?.name ?? "", data.headers, (header) => valueOf(rowKey, header))),
    openForm: (rowKey, form) => inPlace ? setSheet({ row: rowKey, form: form || "principal" }) : openRow(rowKey),
    openPage: (rowKey) => inPlace ? void (openRowPage(rowKey) || setSheet({ row: rowKey, form: "principal" })) : openRow(rowKey),
  }), [byKey, data.headers, inPlace, openRow, openRowPage, rolesOf, router, valueOf])
  const formOf = useCallback((formId: string) => data.forms?.[formId] ?? data.forms?.principal ?? Object.values(data.forms ?? {})[0], [data.forms])
  // Le détail modifiable d'une vue (« Modifiable directement », « Avec Modifier ») marche aussi sur une page.
  const renderEditForm = useCallback((rowKey: string, formId: string, locked: string[]) => editable(rowKey) ? <PageRowForm key={`${rowKey}:${formId}`} data={data} rowKey={rowKey} form={formOf(formId)} locked={locked} valueOf={valueOf} specOf={specOf} onChanged={onChanged} /> : null, [data, editable, formOf, onChanged, specOf, valueOf])
  // Le calendrier lit l'Index des calendriers : la page le lui donne (un joueur ne peut pas le lire).
  useEffect(() => { if (data.calendars) primeWorldIndexData("calendars", { tables: data.calendars }) }, [data.calendars])
  const card = data.cards ? pickCard(data.cards, null) : null
  const renderCard = useCallback((rowKey: string, cardId: string) => {
    const chosen = data.cards ? pickCard(data.cards, cardId === DEFAULT_ITEM_CARD ? null : cardId) : null
    return chosen ? <IndexCard card={chosen} row={rowSource(rowKey)} onOpen={inPlace || hrefOf(rowKey) ? () => openHere(rowKey) : undefined} href={linkOf(rowKey)} /> : null
  }, [data.cards, hrefOf, inPlace, linkOf, openHere, rowSource])
  // Un formulaire de l'onglet, en lecture, sur la ligne (élément ou détail « formulaire »).
  const renderForm = useCallback((rowKey: string, formId: string) => {
    const form = data.forms?.[formId] ?? data.forms?.[Object.keys(data.forms ?? {})[0] ?? ""]
    return form ? <IndexFormView layout={form} columns={data.headers.map((header) => ({ header, spec: specOf(header) }))} valueOf={(header) => valueOf(rowKey, header)} compact={false} /> : null
  }, [data.forms, data.headers, specOf, valueOf])
  // Une statistique de l'index (tuile « stat » du tableau de bord), calculée sur les lignes du bloc.
  const renderStat = useCallback((statId: string) => {
    const stat = data.stats?.find((item) => item.id === statId)
    return stat ? <IndexStats stats={[{ ...stat, pinned: true }]} groups={data.statGroups} pinnedOnly single rows={data.rows.map((row) => row.key)} columns={data.headers} tabs={[data.tab]} valueOf={valueOf} tabOf={() => data.tab} nameOf={(rowKey) => byKey.get(rowKey)?.name ?? ""} optionsOf={(header) => (specOf(header)?.options ?? []).map((option) => ({ value: option.value, color: option.color }))} onOpen={data.rows.some((row) => row.href) ? (rowKey) => openRow(rowKey) : undefined} canEdit={false} onSave={async () => undefined} /> : null
  }, [byKey, data.headers, data.rows, data.statGroups, data.stats, data.tab, openRow, specOf, valueOf])
  const empty = searching ? "Aucune ligne ne correspond à la recherche." : "Aucune ligne dans cette vue pour le moment."
  // La fiche (ou un formulaire, une carte) ouverte ici par un bouton de carte : modifiable pour qui peut écrire, sinon en lecture.
  const sheetCard = sheet?.card && data.cards ? pickCard(data.cards, sheet.card === DEFAULT_ITEM_CARD ? null : sheet.card) : null
  const sheetDialog = sheet && byKey.has(sheet.row) ? <Dialog open onOpenChange={(value) => { if (!value) setSheet(null) }}>
    <DialogContent className="max-h-[92svh] overflow-y-auto sm:max-w-3xl">
      <DialogHeader><DialogTitle className="font-display text-2xl">{byKey.get(sheet.row)?.name || "Sans nom"}</DialogTitle><DialogDescription>{data.title} › {data.tab}</DialogDescription></DialogHeader>
      {sheetCard ? <IndexCard card={sheetCard} row={rowSource(sheet.row)} /> : (editable(sheet.row) ? <PageRowForm key={`${sheet.row}:${sheet.form}`} data={data} rowKey={sheet.row} form={formOf(sheet.form)} valueOf={valueOf} specOf={specOf} onChanged={onChanged} /> : renderForm(sheet.row, sheet.form)) ?? <dl className="grid gap-3 sm:grid-cols-2">{data.headers.map((header) => { const value = strip(valueOf(sheet.row, header)); return value ? <div key={header} className="min-w-0"><dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{header}</dt><dd className="mt-0.5 break-words text-sm">{value}</dd></div> : null })}</dl>}
    </DialogContent>
  </Dialog> : null
  const addDialog = adding ? <Dialog open onOpenChange={(value) => { if (!value && !addState.pending) setAdding(false) }}>
    <DialogContent className="max-h-[92svh] overflow-y-auto p-0 sm:max-w-3xl">
      <DialogHeader className="sr-only"><DialogTitle>Ajouter une ligne</DialogTitle><DialogDescription>{data.title} › {data.tab}</DialogDescription></DialogHeader>
      <IndexEntryForm title={`Ajouter · ${data.tab}`} fields={addFields} pending={addState.pending} layout={data.forms?.principal ?? Object.values(data.forms ?? {})[0] ?? null} onCancel={() => setAdding(false)} onSave={(values) => void addRow(values)} />
      {addState.error && <p className="mx-4 mb-4 rounded-lg border border-destructive/25 bg-destructive/5 px-3 py-2 text-sm text-destructive">{addState.error}</p>}
    </DialogContent>
  </Dialog> : null
  return <CardActionsContext.Provider value={cardActions}>{viewContent()}{sheetDialog}{addDialog}</CardActionsContext.Provider>
  function viewContent() {
  if (data.view === "cards") return card
    ? <IndexCardGrid card={card} rows={data.rows} rowSource={rowSource} onOpen={openHere} hrefOf={linkOf} rowRef={rowRefOf} empty={empty} />
    : <Placeholder>Cet onglet n’a pas encore de cartes : elles se règlent dans l’index (Modifier › Cartes).</Placeholder>
  if (data.layout && isPresentationKind(data.layout.kind)) return <IndexPresentation
    layout={data.layout}
    rows={data.rows.map((row) => row.key)}
    headers={data.headers}
    nameOf={(rowKey) => byKey.get(rowKey)?.name ?? ""}
    valueOf={valueOf}
    optionsOf={(header) => (specOf(header)?.options ?? []).map((option) => ({ value: option.value, color: option.color }))}
    specOf={specOf}
    onOpen={openRow}
    onOpenPage={inPlace ? openRowPage : openRow}
    inPlace={inPlace}
    renderEditForm={renderEditForm}
    onAdd={() => { setAddState({ pending: false, error: "" }); setAdding(true) }}
    renderCard={data.cards ? renderCard : undefined}
    cardOf={data.cards ? (_rowKey, cardId) => pickCard(data.cards!, cardId === DEFAULT_ITEM_CARD ? null : cardId) : undefined}
    renderForm={data.forms ? renderForm : undefined}
    renderStat={data.stats ? renderStat : undefined}
    presentations={data.views}
    rowRef={rowRefOf}
    empty={empty}
  />
  if (!data.rows.length) return <Placeholder>{empty}</Placeholder>
  void block
  return <ReadTable data={data} open={open} onRow={inPlace ? openHere : undefined} linkOf={linkOf} />
  }
}

function Frame({ heading, children, footer, height }: { heading: string; children: React.ReactNode; footer?: React.ReactNode; height?: number | null }) {
  const style: CSSProperties | undefined = height ? { maxHeight: `${height}rem` } : undefined
  return <section className="grid min-w-0 gap-2">
    {heading && <h3 className="font-display text-lg font-semibold tracking-[-0.01em]">{heading}</h3>}
    <div className={`min-w-0 ${height ? "overflow-auto overscroll-contain rounded-2xl [scrollbar-width:thin]" : ""}`} style={style}>{children}</div>
    {footer}
  </section>
}

/** Un bloc « Vue d'index ». `source` : la page enregistrée (lecteurs) ou rien (atelier, index lu directement). */
export function PageViewBlock({ block, source, path }: { block: ViewBlock; source: BlockSource; path?: string }) {
  const [version, setVersion] = useState(0)
  const url = dataUrl(block, source)
  const state = useBlockData(url, version)
  const height = viewHeights.find((item) => item.value === block.height)?.rem ?? null
  // La recherche de la page (bloc Recherche) : seulement les lignes qui la contiennent.
  const search = useContext(PageSearchContext)
  const query = useDeferredValue(block.ignoreSearch ? "" : foldSearch(search?.query ?? ""))
  const loaded = state.data?.kind === "view" ? state.data as ViewData : null
  const data = useMemo(() => {
    if (!loaded || !query) return loaded
    const words = query.split(" ")
    return { ...loaded, rows: loaded.rows.filter((row) => { const text = foldSearch(`${row.name} ${row.cells.join(" ")}`); return words.every((word) => text.includes(word)) }) }
  }, [loaded, query])
  if (!url) return <Frame heading={block.heading}><Placeholder>Choisis un index et un onglet dans les réglages du bloc.</Placeholder></Frame>
  const footer = data && (data.total > data.rows.length || path || query) ? <p className="flex flex-wrap items-center justify-between gap-2 px-1 text-xs text-muted-foreground">
    <span>{query && loaded ? `${data.rows.length} trouvée${data.rows.length > 1 ? "s" : ""} sur ${loaded.rows.length}` : data.total > data.rows.length ? `${data.rows.length} lignes sur ${data.total}` : `${data.total} ligne${data.total > 1 ? "s" : ""}`} · {data.title} › {data.tab}</span>
    {path && <Link href={path} prefetch={false} className="inline-flex items-center gap-0.5 font-medium text-primary hover:underline">Ouvrir l’index<ChevronRight className="size-3.5" /></Link>}
  </p> : null
  return <Frame heading={block.heading} height={height} footer={footer}>
    {state.loading && !data ? <Skeleton /> : state.error ? <Placeholder tone="error" onRetry={() => setVersion((value) => value + 1)}>{state.error}</Placeholder> : data ? <ViewContent data={data} block={block} searching={Boolean(query)} onChanged={() => setVersion((value) => value + 1)} /> : null}
  </Frame>
}

/** Un bloc « Stat épinglée » : la statistique enregistrée dans l'index, calculée sur toutes ses lignes. */
export function PageStatBlock({ block, source }: { block: StatBlock; source: BlockSource }) {
  const router = useRouter()
  const [version, setVersion] = useState(0)
  const url = dataUrl(block, source)
  const state = useBlockData(url, version)
  const data = state.data?.kind === "stat" ? state.data as StatBlockData : null
  const byKey = useMemo(() => new Map((data?.rows ?? []).map((row) => [row.key, row])), [data])
  const column = useMemo(() => new Map((data?.columns ?? []).map((header, index) => [foldName(header), index])), [data])
  const valueOf = useCallback((rowKey: string, header: string) => { const at = column.get(foldName(header)); return at === undefined ? "" : byKey.get(rowKey)?.cells[at] ?? "" }, [byKey, column])
  const rows = useMemo(() => (data?.rows ?? []).map((row) => row.key), [data])
  const optionsOf = useCallback((header: string) => data?.options[header] ?? [], [data])
  const separatorOf = useCallback((header: string) => data?.separators[header], [data])
  if (!url) return <Frame heading={block.heading}><Placeholder>Choisis un index et une de ses statistiques dans les réglages du bloc.</Placeholder></Frame>
  return <Frame heading={block.heading}>
    {state.loading && !data ? <Skeleton /> : state.error ? <Placeholder tone="error" onRetry={() => setVersion((value) => value + 1)}>{state.error}</Placeholder> : data ? <IndexStats
      stats={data.stats}
      groups={data.groups}
      pinnedOnly
      single={block.statId !== ALL_PINNED_STATS}
      rows={rows}
      columns={data.columns}
      tabs={data.tabs}
      valueOf={valueOf}
      tabOf={(rowKey) => byKey.get(rowKey)?.tab ?? ""}
      nameOf={(rowKey) => byKey.get(rowKey)?.name ?? ""}
      optionsOf={optionsOf}
      separatorOf={separatorOf}
      rarityColumns={data.rarityColumns}
      onOpen={data.rows.some((row) => row.href) ? (rowKey) => { const href = byKey.get(rowKey)?.href; if (href) router.push(href) } : undefined}
      canEdit={false}
      onSave={async () => undefined}
    /> : null}
  </Frame>
}

/**
 * Page de ligne : « Cité dans », les lignes des autres index qui citent celle de la page (par
 * une référence « { » ou une colonne liée). Dans l'atelier, il attend une ligne à montrer.
 */
export function PageBacklinksBlock({ block, source }: { block: BacklinksBlock; source: BlockSource }) {
  const [version, setVersion] = useState(0)
  const url = "pageId" in source && source.row ? dataUrl(block, source) : ""
  const state = useBlockData(url, version)
  const items = state.data?.kind === "backlinks" ? (state.data as BacklinksData).items : null
  if (!url) return <Frame heading={block.heading}><Placeholder>Sur la page d’une ligne : les lignes des autres index qui la citent.</Placeholder></Frame>
  const groups = new Map<string, Backlink[]>()
  for (const item of items ?? []) groups.set(item.indexTitle, [...(groups.get(item.indexTitle) ?? []), item])
  return <Frame heading={block.heading}>
    {state.loading && !items ? <Skeleton /> : state.error ? <Placeholder tone="error" onRetry={() => setVersion((value) => value + 1)}>{state.error}</Placeholder> : items && !items.length ? <p className="rounded-2xl border border-dashed px-4 py-5 text-center text-sm text-muted-foreground">Aucune ligne ne la cite pour l’instant.</p> : <div className="grid gap-3 rounded-2xl border bg-card p-3.5">
      {[...groups.entries()].map(([title, list]) => <div key={title} className="grid gap-1">
        <p className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-muted-foreground">{title}</p>
        <ul className="flex flex-wrap gap-1.5">
          {list.map((item) => <li key={`${item.index}:${item.tab}:${item.id}:${item.name}`}>
            {item.href
              ? <Link href={item.href} prefetch={false} title={`${item.tab} · ${item.column}`} className="inline-flex items-center gap-1 rounded-full border bg-background/60 px-2.5 py-0.5 text-[13px] transition hover:border-primary/40 hover:text-primary">{item.name}<ChevronRight className="size-3 opacity-50" /></Link>
              : <span title={`${item.tab} · ${item.column}`} className="inline-flex rounded-full border bg-background/60 px-2.5 py-0.5 text-[13px]">{item.name}</span>}
          </li>)}
        </ul>
      </div>)}
    </div>}
  </Frame>
}
