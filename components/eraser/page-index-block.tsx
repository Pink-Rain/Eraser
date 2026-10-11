"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react"
import { ChevronRight, LoaderCircle, RotateCcw, TriangleAlert } from "lucide-react"

import { IndexCard, IndexCardGrid, type CardRowSource } from "@/components/eraser/index-card"
import { primeWorldIndexData } from "@/components/eraser/index-cells"
import { IndexStats } from "@/components/eraser/index-stats"
import { IndexViewLayout } from "@/components/eraser/index-view-layouts"
import type { BacklinksBlock, StatBlock, ViewBlock } from "@/lib/custom-pages"
import type { Backlink } from "@/lib/custom-pages-rows"
import { viewHeights } from "@/lib/custom-pages"
import type { StatBlockData, ViewBlockData } from "@/lib/custom-pages-data"
import { pickCard } from "@/lib/index-cards"
import { foldName } from "@/lib/index-columns"
import { DEFAULT_ITEM_CARD, isPresentationKind } from "@/lib/index-view-layouts"

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
export type BlockSource = { pageId: string; draft?: boolean; row?: { index: string; id: string } } | { direct: true; asPlayer?: boolean }

function dataUrl(block: ViewBlock | StatBlock | BacklinksBlock, source: BlockSource) {
  if ("pageId" in source) return `/api/pages/block-data?page=${encodeURIComponent(source.pageId)}&block=${encodeURIComponent(block.id)}${source.draft ? "&draft=1" : ""}${source.row ? `&rowIndex=${encodeURIComponent(source.row.index)}&rowId=${encodeURIComponent(source.row.id)}` : ""}`
  if (block.type === "backlinks") return ""
  if (!block.index) return ""
  const as = source.asPlayer ? "&as=joueur" : ""
  if (block.type === "stat") return block.statId ? `/api/pages/block-data?index=${encodeURIComponent(block.index)}&stat=${encodeURIComponent(block.statId)}${as}` : ""
  return block.tab ? `/api/pages/block-data?index=${encodeURIComponent(block.index)}&tab=${encodeURIComponent(block.tab)}&kind=${block.kind}&limit=${block.limit}${as}` : ""
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
function ReadTable({ data, open }: { data: ViewData; open: (href?: string) => void }) {
  return <div className="overflow-x-auto rounded-2xl border bg-card">
    <table className="w-full border-collapse text-[13px]">
      <thead className="sticky top-0 z-[1]">
        <tr>{data.headers.map((header) => <th key={header} scope="col" className="whitespace-nowrap border-b bg-muted px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{header}</th>)}</tr>
      </thead>
      <tbody>
        {data.rows.map((row) => <tr key={row.key} onClick={row.href ? () => open(row.href) : undefined} className={`border-b border-border/60 last:border-b-0 ${row.href ? "cursor-pointer hover:bg-background/70" : ""}`}>
          {row.cells.map((cell, index) => <td key={data.headers[index]} className={`max-w-[22rem] px-3 py-1.5 align-top tabular-nums ${index === 0 ? "whitespace-nowrap font-semibold" : ""}`}>
            {index === 0 && row.href ? <Link href={row.href} prefetch={false} onClick={(event) => event.stopPropagation()} className="hover:text-primary hover:underline">{strip(cell) || row.name}</Link> : <span className="line-clamp-3">{strip(cell)}</span>}
          </td>)}
        </tr>)}
      </tbody>
    </table>
  </div>
}

function ViewContent({ data, block }: { data: ViewData; block: ViewBlock }) {
  const router = useRouter()
  const byKey = useMemo(() => new Map(data.rows.map((row) => [row.key, row])), [data.rows])
  const column = useMemo(() => new Map(data.headers.map((header, index) => [foldName(header), index])), [data.headers])
  const valueOf = useCallback((rowKey: string, header: string) => { const at = column.get(foldName(header)); return at === undefined ? "" : byKey.get(rowKey)?.cells[at] ?? "" }, [byKey, column])
  const specOf = useCallback((header: string) => data.specs[header] ?? Object.entries(data.specs).find(([name]) => foldName(name) === foldName(header))?.[1], [data.specs])
  const rowSource = useCallback((rowKey: string): CardRowSource => ({ value: (header) => valueOf(rowKey, header), spec: specOf }), [specOf, valueOf])
  const open = useCallback((href?: string) => { if (href) router.push(href) }, [router])
  const openRow = useCallback((rowKey: string) => open(byKey.get(rowKey)?.href), [byKey, open])
  const hrefOf = useCallback((rowKey: string) => byKey.get(rowKey)?.href, [byKey])
  // Le calendrier lit l'Index des calendriers : la page le lui donne (un joueur ne peut pas le lire).
  useEffect(() => { if (data.calendars) primeWorldIndexData("calendars", { tables: data.calendars }) }, [data.calendars])
  const card = data.cards ? pickCard(data.cards, null) : null
  const renderCard = useCallback((rowKey: string, cardId: string) => {
    const chosen = data.cards ? pickCard(data.cards, cardId === DEFAULT_ITEM_CARD ? null : cardId) : null
    return chosen ? <IndexCard card={chosen} row={rowSource(rowKey)} onOpen={hrefOf(rowKey) ? () => openRow(rowKey) : undefined} href={hrefOf(rowKey)} /> : null
  }, [data.cards, hrefOf, openRow, rowSource])
  const empty = "Aucune ligne dans cette vue pour le moment."
  if (data.view === "cards") return card
    ? <IndexCardGrid card={card} rows={data.rows} rowSource={rowSource} onOpen={openRow} hrefOf={hrefOf} empty={empty} />
    : <Placeholder>Cet onglet n’a pas encore de cartes : elles se règlent dans l’index (Modifier › Cartes).</Placeholder>
  if (data.layout && isPresentationKind(data.layout.kind)) return <IndexViewLayout
    layout={data.layout}
    rows={data.rows.map((row) => row.key)}
    headers={data.headers}
    nameOf={(rowKey) => byKey.get(rowKey)?.name ?? ""}
    valueOf={valueOf}
    optionsOf={(header) => (specOf(header)?.options ?? []).map((option) => ({ value: option.value, color: option.color }))}
    onOpen={openRow}
    renderCard={data.cards ? renderCard : undefined}
    empty={empty}
  />
  if (!data.rows.length) return <Placeholder>{empty}</Placeholder>
  void block
  return <ReadTable data={data} open={open} />
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
  if (!url) return <Frame heading={block.heading}><Placeholder>Choisis un index et un onglet dans les réglages du bloc.</Placeholder></Frame>
  const data = state.data?.kind === "view" ? state.data as ViewData : null
  const footer = data && (data.total > data.rows.length || path) ? <p className="flex flex-wrap items-center justify-between gap-2 px-1 text-xs text-muted-foreground">
    <span>{data.total > data.rows.length ? `${data.rows.length} lignes sur ${data.total}` : `${data.total} ligne${data.total > 1 ? "s" : ""}`} · {data.title} › {data.tab}</span>
    {path && <Link href={path} prefetch={false} className="inline-flex items-center gap-0.5 font-medium text-primary hover:underline">Ouvrir l’index<ChevronRight className="size-3.5" /></Link>}
  </p> : null
  return <Frame heading={block.heading} height={height} footer={footer}>
    {state.loading && !data ? <Skeleton /> : state.error ? <Placeholder tone="error" onRetry={() => setVersion((value) => value + 1)}>{state.error}</Placeholder> : data ? <ViewContent data={data} block={block} /> : null}
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
      stats={[data.stat]}
      groups={data.groups}
      pinnedOnly
      single
      rows={rows}
      columns={data.columns}
      tabs={data.tabs}
      valueOf={valueOf}
      tabOf={(rowKey) => byKey.get(rowKey)?.tab ?? ""}
      nameOf={(rowKey) => byKey.get(rowKey)?.name ?? ""}
      optionsOf={optionsOf}
      separatorOf={separatorOf}
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
