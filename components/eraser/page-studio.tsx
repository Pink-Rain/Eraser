"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from "react"
import {
  ArrowDown, ArrowLeft, ArrowRight, ArrowUp, BookmarkPlus, Check, CloudAlert, CloudCheck, CloudUpload, Copy, Ellipsis, Eye, EyeOff, Hammer, History, LibraryBig,
  LoaderCircle, LockKeyhole, NotebookPen, Plus, RotateCcw, Search, Settings2, SquareMousePointer, Trash2, Undo2, WandSparkles, X,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { BlockView, CalloutFrame, ImageView, ModulePlaceholder, PageHeader, PageIcon, PageSections, SeparatorView, calloutTones, formatWhen, type BlockContext, type PageLinkTarget } from "@/components/eraser/custom-page-view"
import { PageSearchBlock, PageSearchProvider, PageStatBlock, PageViewBlock } from "@/components/eraser/page-index-block"
import { describeCondition } from "@/lib/index-windows"
import { rowOfRoute } from "@/lib/page-replacements"
import { blockIcons } from "@/components/eraser/page-studio-icons"
import { ColumnCount, SectionGrid, WidthRuler } from "@/components/eraser/page-section-grid"
import { BlockSettings, PageSettings, Segmented, VisibilityPill, roleDot } from "@/components/eraser/page-studio-settings"
import { IndexRichText } from "@/components/eraser/index-references"
import { RichTextField } from "@/components/eraser/rich-text"
import {
  blockCatalog,
  blockLabel,
  blockVisibilities,
  blockVisibleTo,
  layoutForColumns,
  MAX_SECTION_COLUMNS,
  newBlock,
  newId,
  widthsForColumns,
  pageForViewer,
  pageHref,
  pageVisibleTo,
  placeLabel,
  placeOpenTo,
  roleLabels,
  sectionLayouts,
  snapshotName,
  viewBlockKinds,
  type BlockType,
  type CustomPage,
  type PageBlock,
  type PageDraft,
  type PageRole,
  type PageSectionBlock,
  type PageSnapshot,
  type PageSummary,
  type SectionLayout,
  type StudioPage,
  type ViewBlockKind,
  studioHref,
} from "@/lib/custom-pages"

/**
 * L'atelier du créateur de pages, en trois volets comme la maquette : les blocs à gauche (un
 * clic ou un glisser les ajoute), la page au centre (on écrit directement dans les blocs, on
 * les déplace en les glissant ou avec les flèches), les réglages du bloc choisi — ou de la
 * page — à droite. Sous 960 px, blocs et réglages deviennent des tiroirs en bas d'écran.
 *
 * Tout s'enregistre seul (brouillon) ; « Publier » ouvre la page aux lecteurs. Ctrl+Z annule
 * (dans l'atelier, pas sur le serveur). Deux personnes dans l'atelier : la seconde à
 * enregistrer est prévenue au lieu d'écraser l'autre.
 */

type SaveState = { kind: "saved" | "dirty" | "saving" | "error" | "conflict"; message?: string }
type DropTarget = { section: string; column: number; index: number }
/** `kind` : la présentation d'un bloc Vue ajouté depuis ses raccourcis (Kanban, Liste…). */
type Dragged = { kind: "new"; type: BlockType; view?: ViewBlockKind } | { kind: "move"; id: string }
type Toast = { text: string; action?: { label: string; run: () => void } }

const DRAG_TYPE = "application/x-eraser-page-block"
const draftKeys = ["title", "icon", "emoji", "description", "hideHeader", "sections", "slug", "place", "campaignId", "vis", "replaces", "replaceMode", "rowOf"] as const

function draftOf(page: StudioPage): PageDraft {
  const out: Record<string, unknown> = {}
  for (const key of draftKeys) if (page[key] !== undefined) out[key] = page[key]
  return out as PageDraft
}

function locate(sections: PageSectionBlock[], id: string) {
  for (const [si, section] of sections.entries()) for (const [ci, column] of section.cols.entries()) {
    const bi = column.findIndex((block) => block.id === id)
    if (bi >= 0) return { si, ci, bi }
  }
  return null
}

async function postPage(body: Record<string, unknown>) {
  try {
    const response = await fetch("/api/pages", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })
    const payload = (await response.json().catch(() => ({}))) as { page?: StudioPage; error?: string; code?: string; template?: { id: string; name: string } }
    return { ok: response.ok, status: response.status, ...payload }
  } catch {
    return { ok: false, status: 0, error: "Eraser ne répond pas : tes modifications restent ici, elles partiront au prochain essai." } as { ok: false; status: number; error: string; code?: string; page?: undefined; template?: undefined }
  }
}

/* ---------- Petites pièces ---------- */

const inlineInput = "w-full min-w-0 rounded-md bg-transparent outline-none transition placeholder:text-muted-foreground/45 hover:bg-background/60 focus:bg-background/80 focus:ring-2 focus:ring-ring/15"

function LayoutGlyph({ layout }: { layout: SectionLayout }) {
  const columns = sectionLayouts.find((item) => item.value === layout)!.columns
  return <span aria-hidden className="grid h-3.5 w-6 gap-[2px]" style={{ gridTemplateColumns: columns.map((size) => `${size}fr`).join(" ") }}>{columns.map((_, index) => <i key={index} className="rounded-[2px] bg-current opacity-60" />)}</span>
}

function ToolButton({ label, onClick, disabled, children, danger }: { label: string; onClick: () => void; disabled?: boolean; children: ReactNode; danger?: boolean }) {
  return <button type="button" title={label} aria-label={label} disabled={disabled} onClick={(event) => { event.stopPropagation(); onClick() }} className={`flex size-6 items-center justify-center rounded-md text-muted-foreground transition hover:bg-muted disabled:pointer-events-none disabled:opacity-30 ${danger ? "hover:text-destructive" : "hover:text-foreground"}`}>{children}</button>
}

/** La palette : les blocs à ajouter, groupés, filtrables. */
function Palette({ onAdd, onDragStart, onClose }: { onAdd: (type: BlockType, view?: ViewBlockKind) => void; onDragStart: (event: DragEvent, type: BlockType, view?: ViewBlockKind) => void; onClose: () => void }) {
  const [query, setQuery] = useState("")
  const fold = (value: string) => value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
  const shown = blockCatalog.filter((item) => !query.trim() || fold(`${item.label} ${item.hint}`).includes(fold(query.trim())))
  const groups = [...new Set(shown.map((item) => item.group))]
  return <>
    <div className="sticky top-0 z-[2] flex items-center justify-between gap-2 rounded-t-[18px] bg-card px-4 pb-2 pt-3.5 max-[959px]:before:absolute max-[959px]:before:left-1/2 max-[959px]:before:top-1.5 max-[959px]:before:h-1 max-[959px]:before:w-10 max-[959px]:before:-translate-x-1/2 max-[959px]:before:rounded-full max-[959px]:before:bg-border">
      <h2 className="font-display text-[17px] font-semibold">Blocs</h2>
      <button type="button" onClick={onClose} aria-label="Fermer" className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted min-[960px]:hidden"><X className="size-4" /></button>
    </div>
    <label className="mx-3 mb-1 flex items-center gap-2 rounded-lg border bg-background/70 px-2.5 focus-within:border-ring">
      <Search className="size-3.5 text-muted-foreground" />
      <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filtrer les blocs…" aria-label="Filtrer les blocs" className="h-8 min-w-0 flex-1 bg-transparent text-[13px] outline-none" />
    </label>
    {groups.map((group) => <div key={group} className="grid gap-0.5 px-2 pb-2">
      <h3 className="px-2 pb-1 pt-2 text-[10.5px] font-bold uppercase tracking-[0.16em] text-muted-foreground">{group}</h3>
      {shown.filter((item) => item.group === group).map((item) => {
        const Icon = blockIcons.blocks[item.type]
        return <Fragment key={item.type}><button type="button" draggable onDragStart={(event) => onDragStart(event, item.type)} onClick={() => onAdd(item.type)} title={item.hint}
          className="grid cursor-grab grid-cols-[2rem_minmax(0,1fr)] items-center gap-x-2.5 rounded-xl border border-transparent p-1.5 text-left transition hover:border-border/70 hover:bg-background/70 active:cursor-grabbing">
          <span className="row-span-2 flex size-8 items-center justify-center rounded-[9px] bg-secondary text-primary"><Icon className="size-4" /></span>
          <b className="text-[13px] font-semibold leading-tight">{item.label}</b>
          <small className="text-[11.5px] leading-snug text-muted-foreground">{item.hint}</small>
        </button>
        {/* Chaque présentation du moteur des index, à poser directement (le bloc Vue, déjà réglé sur elle). */}
        {item.type === "view" && <div className="flex flex-wrap gap-1 pb-1.5 pl-[2.9rem] pr-1" aria-label="Vues à poser directement">
          {viewBlockKinds.map((kind) => {
            const KindIcon = blockIcons.views[kind.value]
            return <button key={kind.value} type="button" draggable onDragStart={(event) => onDragStart(event, "view", kind.value)} onClick={() => onAdd("view", kind.value)} title={`Vue d’index en ${kind.label.toLocaleLowerCase("fr")}`}
              className="inline-flex cursor-grab items-center gap-1 rounded-full border border-border/70 bg-background/60 px-2 py-0.5 text-[11.5px] text-muted-foreground transition hover:border-border hover:text-foreground active:cursor-grabbing"><KindIcon className="size-3" />{kind.label}</button>
          })}
        </div>}</Fragment>
      })}

    </div>)}
    {!shown.length && <p className="px-4 py-3 text-xs text-muted-foreground">Aucun bloc ne correspond.</p>}
    <p className="mx-4 mb-4 mt-1 border-t border-dashed pt-3 text-[11.5px] leading-snug text-muted-foreground">Glisse un bloc dans une colonne de la page, ou clique dessus : il s’ajoute après le bloc choisi.</p>
  </>
}

/** Le menu « Ajouter ici » d'une colonne. */
function AddHere({ empty, onAdd }: { empty: boolean; onAdd: (type: BlockType) => void }) {
  const [open, setOpen] = useState(false)
  return <Popover open={open} onOpenChange={setOpen}>
    <PopoverTrigger asChild>
      <button type="button" className={`flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-border px-3 text-[12.5px] text-muted-foreground transition hover:border-[#3b5c8a] hover:text-foreground ${empty ? "py-6" : "py-1.5 opacity-70 hover:opacity-100"}`}><Plus className="size-3.5" />{empty ? "Dépose un bloc ici, ou choisis-en un" : "Ajouter ici"}</button>
    </PopoverTrigger>
    <PopoverContent align="start" className="w-72 p-1.5">
      <div className="grid grid-cols-2 gap-0.5">
        {blockCatalog.map((item) => {
          const Icon = blockIcons.blocks[item.type]
          return <button key={item.type} type="button" onClick={() => { setOpen(false); onAdd(item.type) }} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[12.5px] hover:bg-muted"><Icon className="size-3.5 shrink-0 text-primary" /><span className="truncate">{item.label}</span></button>
        })}
      </div>
    </PopoverContent>
  </Popover>
}

/* ---------- Les blocs, dans l'atelier ---------- */

/** `origin` : la page d'Eraser que la page remplace (le nom de son module « page d'origine »). */
type EditorProps = { block: PageBlock; rev: number; live: StudioPage["live"]; links: Record<string, PageLinkTarget>; viewAs: PageRole; origin?: string; onChange: (patch: Partial<PageBlock>, coalesce?: string) => void }

const richInCanvas = "border-transparent bg-transparent shadow-none hover:border-border/70 focus-within:border-border focus-within:bg-background/60"

/** Un bloc tel qu'on l'écrit : le texte se tape directement dedans. */
function BlockEditor({ block, rev, live, links, viewAs, origin, onChange }: EditorProps) {
  const set = (patch: Record<string, unknown>, field: string) => onChange(patch as Partial<PageBlock>, `${block.id}:${field}`)
  const key = `${block.id}:${rev}`
  switch (block.type) {
    case "title":
      return <div className={`grid gap-0.5 ${block.align === "center" ? "text-center" : ""}`}>
        <input value={block.eyebrow} onChange={(event) => set({ eyebrow: event.target.value }, "eyebrow")} placeholder="Petite ligne au-dessus (facultative)" aria-label="Petite ligne au-dessus" className={`${inlineInput} px-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-primary/80 ${block.align === "center" ? "text-center" : ""}`} />
        <input value={block.text} onChange={(event) => set({ text: event.target.value }, "text")} placeholder="Titre" aria-label="Titre" className={`${inlineInput} px-1 font-display font-semibold tracking-[-0.015em] ${block.level === "h3" ? "text-xl" : "text-[1.65rem] sm:text-3xl"} ${block.align === "center" ? "text-center" : ""}`} />
      </div>
    case "text":
      return <RichTextField key={key} value={block.html} onCommit={(html) => set({ html }, "html")} placeholder="Écris ici. « { » cite une ligne d’index." ariaLabel="Texte" minHeight="min-h-16" className={richInCanvas} />
    case "callout":
      return <CalloutFrame tone={block.tone} title={<input value={block.title} onChange={(event) => set({ title: event.target.value }, "title")} placeholder={calloutTones[block.tone].label} aria-label="Titre de l’encadré" className={`${inlineInput} px-1 font-display`} />}>
        <RichTextField key={key} value={block.html} onCommit={(html) => set({ html }, "html")} placeholder="Le texte de l’encadré…" ariaLabel="Texte de l’encadré" minHeight="min-h-10" className={richInCanvas} />
      </CalloutFrame>
    case "quote":
      return <figure className="grid gap-1 border-l-[3px] border-primary/70 py-1 pl-4">
        <textarea value={block.text} rows={2} onChange={(event) => set({ text: event.target.value }, "text")} placeholder="« Une phrase en exergue »" aria-label="Citation" className={`${inlineInput} resize-none px-1 font-display text-lg italic leading-relaxed [field-sizing:content]`} />
        <input value={block.cite} onChange={(event) => set({ cite: event.target.value }, "cite")} placeholder="Source (facultative)" aria-label="Source" className={`${inlineInput} px-1 text-xs text-muted-foreground`} />
      </figure>
    case "image":
      return <div className="grid gap-1">
        <ImageView block={{ ...block, caption: "" }} />
        <input value={block.caption} onChange={(event) => set({ caption: event.target.value }, "caption")} placeholder="Légende (facultative)" aria-label="Légende" className={`${inlineInput} px-1 text-center text-xs italic text-muted-foreground`} />
      </div>
    case "separator":
      return <SeparatorView block={block} />
    case "link": {
      const target = block.pageId ? links[block.pageId] : null
      return <div className="flex items-start gap-3 rounded-2xl border bg-card/85 p-4 shadow-[0_10px_30px_rgb(67_50_31/0.06)]">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-primary/8 text-primary"><PageIcon icon={target?.icon} emoji={target?.emoji} className="size-4.5" /></span>
        <span className="grid min-w-0 flex-1 gap-0.5">
          <input value={block.title} onChange={(event) => set({ title: event.target.value }, "title")} placeholder={target?.title || block.href || "Titre du lien"} aria-label="Titre du lien" className={`${inlineInput} px-1 font-display text-lg font-semibold`} />
          <input value={block.description} onChange={(event) => set({ description: event.target.value }, "description")} placeholder={target?.description || "Une phrase de description"} aria-label="Description du lien" className={`${inlineInput} px-1 text-xs text-muted-foreground`} />
          <span className="px-1 font-mono text-[11px] text-muted-foreground/80">{target ? target.href : block.href || "Choisis la destination dans les réglages →"}</span>
        </span>
      </div>
    }
    case "secret": {
      const revealed = live[block.id]?.revealedAt
      return <section className={`grid gap-1.5 rounded-2xl border px-3 py-3 ${revealed ? "border-[#927640]/45 bg-[#927640]/[0.07]" : "border-dashed border-[#927640]/60 bg-[repeating-linear-gradient(135deg,rgb(146_118_64/0.06)_0_8px,transparent_8px_16px)]"}`}>
        <div className="flex items-center gap-2 text-[#7a5f22]">
          <LockKeyhole className="size-4 shrink-0" />
          <input value={block.title} onChange={(event) => set({ title: event.target.value }, "title")} placeholder="Secret" aria-label="Titre du secret" className={`${inlineInput} flex-1 px-1 font-display text-[15px] font-semibold`} />
          <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${revealed ? "border-[#0f7a65]/40 bg-[#0f7a65]/10 text-[#0f7a65]" : "border-[#927640]/45 bg-card"}`}>{revealed ? "Révélé" : "Caché aux joueurs"}</span>
        </div>
        <RichTextField key={key} value={block.html} onCommit={(html) => set({ html }, "html")} placeholder="Ce que les joueurs découvriront…" ariaLabel="Contenu du secret" minHeight="min-h-12" className={richInCanvas} />
      </section>
    }
    case "notes": {
      const written = live[block.id]?.html
      return <section className="grid gap-1.5 rounded-2xl border border-l-[3px] border-l-[#3b5c8a]/55 bg-[linear-gradient(180deg,color-mix(in_srgb,#3b5c8a_5%,var(--card)),var(--card)_3rem)] px-3 pb-3 pt-2.5">
        <div className="flex items-center gap-2 text-[#3b5c8a]">
          <NotebookPen className="size-4 shrink-0" />
          <input value={block.title} onChange={(event) => set({ title: event.target.value }, "title")} placeholder="Carnet" aria-label="Titre du carnet" className={`${inlineInput} flex-1 px-1 font-display text-[15px] font-semibold`} />
        </div>
        {written !== undefined
          ? <div className="grid gap-1 px-1"><IndexRichText html={written} className="text-[14.5px] leading-7" /><p className="text-[11px] text-muted-foreground">Écrit sur la page publiée{live[block.id]?.editedBy ? ` par ${live[block.id]?.editedBy}` : ""} : c’est ce texte que les lecteurs voient, et il se modifie là-bas.</p></div>
          : <><RichTextField key={key} value={block.html} onCommit={(html) => set({ html }, "html")} placeholder="Le texte de départ (facultatif)…" ariaLabel="Texte de départ du carnet" minHeight="min-h-12" className={richInCanvas} /><p className="text-[11px] text-muted-foreground">Texte de départ : une fois la page publiée, {block.editors.map((role) => roleLabels[role]).join(", ") || "personne"} {block.editors.length > 1 ? "pourront" : "pourra"} continuer de l’écrire sur la page.</p></>}
      </section>
    }
    case "view":
      return <PageViewBlock block={block} source={{ direct: true, asPlayer: viewAs === "joueur" }} />
    case "stat":
      return <PageStatBlock block={block} source={{ direct: true, asPlayer: viewAs === "joueur" }} />
    case "search":
      return <PageSearchBlock block={block} />
    case "module":
      return <ModulePlaceholder block={block} origin={origin} />
    case "rowfields":
    case "backlinks":
      return <BlockView block={block} context={{ source: { direct: true }, canReveal: false, links }} />
  }
}

/** Pourquoi ce bloc n'est pas vu par le rôle de l'aperçu (ou `null`). */
function hiddenReason(block: PageBlock, viewAs: PageRole, live: StudioPage["live"]) {
  if (!blockVisibleTo(block.vis, viewAs)) return `Masqué pour ${roleLabels[viewAs]} : visible par ${blockVisibilities.find((item) => item.value === block.vis)?.short.toLocaleLowerCase("fr")}`
  if (block.type === "secret" && viewAs === "joueur" && !live[block.id]?.revealedAt) return "Les joueurs ne reçoivent rien de ce secret tant qu’il n’est pas révélé"
  return null
}

/* ---------- L'atelier ---------- */

export function PageStudio({ initial, pages: initialPages, campaigns, linking, role, backHref = "/pages" }: {
  initial: StudioPage
  /** Le retour à l'Index des pages : le dossier où la page est rangée. */
  backHref?: string
  pages: PageSummary[]
  campaigns: Array<{ id: string; name: string }>
  linking: Array<{ id: string; title: string; href: string }>
  role: PageRole
}) {
  const router = useRouter()
  const [doc, setDoc] = useState(initial)
  const docRef = useRef(initial)
  const [selected, setSelected] = useState<string | null>(null)
  const [mode, setMode] = useState<"build" | "preview">("build")
  const [viewAs, setViewAs] = useState<PageRole>(role)
  const [showHidden, setShowHidden] = useState(true)
  const [rev, setRev] = useState(0)
  const [historySize, setHistorySize] = useState(0)
  const history = useRef<string[]>([])
  const lastCoalesce = useRef<{ key: string; at: number } | null>(null)
  const [save, setSave] = useState<SaveState>({ kind: "saved" })
  const saveRef = useRef(save)
  const savedJson = useRef(JSON.stringify(draftOf(initial)))
  const timer = useRef<number | undefined>(undefined)
  const inflight = useRef<Promise<boolean> | null>(null)
  const flushRef = useRef<() => Promise<boolean>>(async () => true)
  const [drawer, setDrawer] = useState<null | "palette" | "props">(null)
  const [drop, setDrop] = useState<DropTarget | null>(null)
  const dragged = useRef<Dragged | null>(null)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [toast, setToast] = useState<Toast | null>(null)
  const [busy, setBusy] = useState(false)
  const [templateOpen, setTemplateOpen] = useState(false)
  const [templateName, setTemplateName] = useState("")
  const [trashOpen, setTrashOpen] = useState(false)
  const [draftsOpen, setDraftsOpen] = useState(false)
  const [drafts, setDrafts] = useState<PageSnapshot[] | null>(null)
  const [draftName, setDraftName] = useState("")
  const [draftBusy, setDraftBusy] = useState("")
  const [draftError, setDraftError] = useState("")
  const [draftConfirm, setDraftConfirm] = useState<string | null>(null)
  const [flash, setFlash] = useState<string | null>(null)
  const isAdmin = role === "admin"
  const pages = useMemo(() => initialPages.filter((page) => page.id !== doc.id && !page.trashedAt), [doc.id, initialPages])
  const links = useMemo(() => Object.fromEntries(initialPages.map((page) => [page.id, { title: page.title, href: page.href, icon: page.icon, emoji: page.emoji, description: page.description }])), [initialPages])

  const setSaveState = useCallback((next: SaveState) => { saveRef.current = next; setSave(next) }, [])
  const commit = useCallback((next: StudioPage) => { docRef.current = next; setDoc(next) }, [])
  const notify = useCallback((text: string, action?: Toast["action"]) => {
    setToast({ text, action })
    window.setTimeout(() => setToast((current) => current?.text === text ? null : current), action ? 6000 : 2600)
  }, [])

  /* ----- Enregistrement ----- */

  const flush = useCallback(async (): Promise<boolean> => {
    window.clearTimeout(timer.current)
    if (saveRef.current.kind === "conflict") return false
    while (inflight.current) await inflight.current
    const sent = draftOf(docRef.current)
    const sentJson = JSON.stringify(sent)
    if (sentJson === savedJson.current) { if (saveRef.current.kind !== "error") setSaveState({ kind: "saved" }); return true }
    setSaveState({ kind: "saving" })
    const run = (async () => {
      const result = await postPage({ action: "save", id: docRef.current.id, page: sent, base: docRef.current.updatedAt })
      if (result.ok && result.page) {
        savedJson.current = sentJson
        const server = result.page
        const current = docRef.current
        const unchanged = JSON.stringify(draftOf(current)) === sentJson
        commit({ ...current, updatedAt: server.updatedAt, updatedBy: server.updatedBy, status: server.status, published: server.published, publishedAt: server.publishedAt, unpublished: unchanged ? server.unpublished : true, live: server.live })
        setSaveState(unchanged ? { kind: "saved" } : { kind: "dirty" })
        return true
      }
      setSaveState(result.code === "CUSTOM_PAGE_CHANGED" ? { kind: "conflict", message: result.error } : { kind: "error", message: result.error || "La page n’a pas pu être enregistrée." })
      return false
    })()
    inflight.current = run
    const ok = await run
    inflight.current = null
    if (ok && JSON.stringify(draftOf(docRef.current)) !== savedJson.current) timer.current = window.setTimeout(() => void flushRef.current(), 900)
    return ok
  }, [commit, setSaveState])

  useEffect(() => { flushRef.current = flush }, [flush])

  const markDirty = useCallback(() => {
    if (saveRef.current.kind !== "conflict") setSaveState({ kind: saveRef.current.kind === "error" ? "error" : "dirty", message: saveRef.current.kind === "error" ? saveRef.current.message : undefined })
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => void flush(), 1200)
  }, [flush, setSaveState])

  useEffect(() => {
    const leave = (event: BeforeUnloadEvent) => { if (JSON.stringify(draftOf(docRef.current)) !== savedJson.current) { event.preventDefault(); void flush() } }
    window.addEventListener("beforeunload", leave)
    return () => { window.removeEventListener("beforeunload", leave); window.clearTimeout(timer.current) }
  }, [flush])

  /* ----- Modifier (avec annulation) ----- */

  const change = useCallback((mutate: (draft: PageDraft) => PageDraft | void, coalesce?: string) => {
    const current = docRef.current
    const before = JSON.stringify(draftOf(current))
    const draft = JSON.parse(before) as PageDraft
    const next = mutate(draft) ?? draft
    if (JSON.stringify(next) === before) return
    const now = Date.now()
    const merged = coalesce && lastCoalesce.current?.key === coalesce && now - lastCoalesce.current.at < 1500
    if (!merged) {
      history.current.push(before)
      if (history.current.length > 100) history.current.shift()
      setHistorySize(history.current.length)
    }
    lastCoalesce.current = coalesce ? { key: coalesce, at: now } : null
    commit({ ...current, ...next })
    markDirty()
  }, [commit, markDirty])

  const undo = useCallback(() => {
    const previous = history.current.pop()
    setHistorySize(history.current.length)
    if (!previous) return
    lastCoalesce.current = null
    commit({ ...docRef.current, ...(JSON.parse(previous) as PageDraft) })
    setRev((value) => value + 1)
    markDirty()
  }, [commit, markDirty])

  const updateBlock = useCallback((id: string, patch: Partial<PageBlock>, coalesce?: string) => change((draft) => {
    const at = locate(draft.sections, id)
    if (at) draft.sections[at.si].cols[at.ci][at.bi] = { ...draft.sections[at.si].cols[at.ci][at.bi], ...patch } as PageBlock
  }, coalesce), [change])

  const select = useCallback((id: string | null, openProps = false) => {
    setSelected(id)
    if (openProps && window.matchMedia("(max-width: 959px)").matches) setDrawer("props")
  }, [])

  const reveal = useCallback((id: string) => {
    setFlash(id)
    window.setTimeout(() => { document.getElementById(`atelier-${id}`)?.scrollIntoView({ block: "nearest", behavior: "smooth" }) }, 30)
    window.setTimeout(() => setFlash((current) => current === id ? null : current), 1100)
  }, [])

  const insert = useCallback((type: BlockType, at?: DropTarget, view?: ViewBlockKind) => {
    const fresh = newBlock(type)
    const block = view && fresh.type === "view" ? { ...fresh, kind: view } : fresh
    change((draft) => {
      let target = at
      if (!target) {
        const from = selected ? locate(draft.sections, selected) : null
        target = from ? { section: draft.sections[from.si].id, column: from.ci, index: from.bi + 1 } : { section: draft.sections[draft.sections.length - 1].id, column: 0, index: Number.MAX_SAFE_INTEGER }
      }
      const section = draft.sections.find((item) => item.id === target!.section) ?? draft.sections[0]
      const column = section.cols[Math.min(target.column, section.cols.length - 1)]
      column.splice(Math.min(target.index, column.length), 0, block)
    })
    setSelected(block.id)
    setDrawer(null)
    reveal(block.id)
    notify(`Bloc « ${view ? viewBlockKinds.find((item) => item.value === view)?.label ?? blockLabel(type) : blockLabel(type)} » ajouté`)
  }, [change, notify, reveal, selected])

  const move = useCallback((id: string, direction: "up" | "down" | "left" | "right") => change((draft) => {
    const at = locate(draft.sections, id)
    if (!at) return
    const sections = draft.sections
    const [block] = sections[at.si].cols[at.ci].splice(at.bi, 1)
    const column = sections[at.si].cols[at.ci]
    if (direction === "up") {
      if (at.bi > 0) column.splice(at.bi - 1, 0, block)
      else if (at.si > 0) { const previous = sections[at.si - 1]; previous.cols[Math.min(at.ci, previous.cols.length - 1)].push(block) }
      else column.unshift(block)
    } else if (direction === "down") {
      if (at.bi < column.length) column.splice(at.bi + 1, 0, block)
      else if (at.si < sections.length - 1) { const next = sections[at.si + 1]; next.cols[Math.min(at.ci, next.cols.length - 1)].unshift(block) }
      else column.push(block)
    } else {
      const target = sections[at.si].cols[at.ci + (direction === "left" ? -1 : 1)] ?? column
      target.splice(Math.min(at.bi, target.length), 0, block)
    }
  }), [change])

  const moveTo = useCallback((id: string, target: DropTarget) => change((draft) => {
    const at = locate(draft.sections, id)
    if (!at) return
    const sourceSection = draft.sections[at.si]
    const [block] = sourceSection.cols[at.ci].splice(at.bi, 1)
    const section = draft.sections.find((item) => item.id === target.section)
    if (!section) { sourceSection.cols[at.ci].splice(at.bi, 0, block); return }
    let index = target.index
    if (sourceSection.id === target.section && at.ci === target.column && at.bi < index) index -= 1
    const column = section.cols[target.column]
    column.splice(Math.max(0, Math.min(index, column.length)), 0, block)
  }), [change])

  const duplicate = useCallback((id: string) => {
    const copyId = newId("b")
    change((draft) => {
      const at = locate(draft.sections, id)
      if (!at) return
      const column = draft.sections[at.si].cols[at.ci]
      column.splice(at.bi + 1, 0, { ...column[at.bi], id: copyId })
    })
    setSelected(copyId)
    reveal(copyId)
    notify("Bloc dupliqué")
  }, [change, notify, reveal])

  const remove = useCallback((id: string) => {
    const at = locate(docRef.current.sections, id)
    if (!at) return
    const type = docRef.current.sections[at.si].cols[at.ci][at.bi].type
    change((draft) => { draft.sections[at.si].cols[at.ci].splice(at.bi, 1) })
    setSelected((current) => current === id ? null : current)
    notify(`Bloc « ${blockLabel(type)} » supprimé`, { label: "Annuler", run: undo })
  }, [change, notify, undo])

  const setLayout = useCallback((sectionId: string, layout: SectionLayout) => change((draft) => {
    const section = draft.sections.find((item) => item.id === sectionId)
    if (!section || section.layout === layout) return
    const wanted = sectionLayouts.find((item) => item.value === layout)!.columns.length
    while (section.cols.length > wanted) { const extra = section.cols.pop()!; section.cols[section.cols.length - 1].push(...extra) }
    while (section.cols.length < wanted) section.cols.push([])
    section.layout = layout
    delete section.widths
  }), [change])

  const setColumns = useCallback((sectionId: string, count: number) => change((draft) => {
    const section = draft.sections.find((item) => item.id === sectionId)
    if (!section || count < 1 || count > MAX_SECTION_COLUMNS || count === section.cols.length) return
    const layout = layoutForColumns(count, section.layout)
    const widths = widthsForColumns(section.widths, count, layout)
    while (section.cols.length > count) { const extra = section.cols.pop()!; section.cols[section.cols.length - 1].push(...extra) }
    while (section.cols.length < count) section.cols.push([])
    section.layout = layout
    if (widths) section.widths = widths
    else delete section.widths
  }), [change])

  const setWidths = useCallback((sectionId: string, widths: number[] | undefined) => change((draft) => {
    const section = draft.sections.find((item) => item.id === sectionId)
    if (!section) return
    if (widths) section.widths = widths
    else delete section.widths
  }, `widths:${sectionId}`), [change])

  /* ----- Glisser-déposer ----- */

  const startDrag = useCallback((event: DragEvent, item: Dragged, image?: HTMLElement | null) => {
    dragged.current = item
    event.dataTransfer.effectAllowed = item.kind === "new" ? "copy" : "move"
    event.dataTransfer.setData(DRAG_TYPE, item.kind === "new" ? item.type : item.id)
    event.dataTransfer.setData("text/plain", item.kind === "new" ? blockLabel(item.type) : "bloc")
    if (image) event.dataTransfer.setDragImage(image, 24, 16)
    if (item.kind === "move") window.setTimeout(() => setDraggingId(item.id), 0)
    if (item.kind === "new") setDrawer(null)
  }, [])

  const endDrag = useCallback(() => { dragged.current = null; setDrop(null); setDraggingId(null) }, [])

  const overColumn = useCallback((event: DragEvent<HTMLDivElement>, section: string, column: number) => {
    if (!dragged.current) return
    event.preventDefault()
    event.dataTransfer.dropEffect = dragged.current.kind === "new" ? "copy" : "move"
    const children = [...event.currentTarget.querySelectorAll<HTMLElement>(":scope > [data-block-id]")]
    let index = children.length
    for (const [position, child] of children.entries()) {
      const box = child.getBoundingClientRect()
      if (event.clientY < box.top + box.height / 2) { index = position; break }
    }
    setDrop((current) => current && current.section === section && current.column === column && current.index === index ? current : { section, column, index })
  }, [])

  const dropOn = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    const item = dragged.current
    const target = drop
    endDrag()
    if (!item || !target) return
    if (item.kind === "new") insert(item.type, target, item.view)
    else moveTo(item.id, target)
  }, [drop, endDrag, insert, moveTo])

  /* ----- Clavier ----- */

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null
      const editing = Boolean(target?.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target?.tagName ?? ""))
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") { event.preventDefault(); void flush(); return }
      if ((event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLowerCase() === "z" && !editing && !target?.closest("[role=dialog]")) { event.preventDefault(); undo(); return }
      if (event.key === "Escape" && !editing && !target?.closest("[role=dialog]")) { setSelected(null); setDrawer(null) }
      if (event.altKey && selected && !editing && ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) {
        event.preventDefault()
        move(selected, event.key.replace("Arrow", "").toLowerCase() as "up" | "down" | "left" | "right")
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [flush, move, selected, undo])

  /* ----- Actions sur la page ----- */

  const action = useCallback(async (name: "publish" | "unpublish" | "revert" | "duplicate" | "trash", message: string) => {
    setBusy(true)
    if (name !== "revert" && !(await flush())) { setBusy(false); if (saveRef.current.kind !== "conflict") notify("Enregistre d’abord la page : " + (saveRef.current.message ?? "un problème est survenu.")); return }
    window.clearTimeout(timer.current)
    const result = await postPage({ action: name, id: docRef.current.id, base: docRef.current.updatedAt })
    setBusy(false)
    if (!result.ok || !result.page) {
      if (result.code === "CUSTOM_PAGE_CHANGED") setSaveState({ kind: "conflict", message: result.error })
      notify(result.error || "Cette action n’a pas pu être faite.")
      return
    }
    if (name === "duplicate") { router.push(studioHref(result.page.id)); return }
    if (name === "trash") { router.push(backHref); return }
    const server = result.page
    if (name === "revert") {
      history.current.push(JSON.stringify(draftOf(docRef.current)))
      setHistorySize(history.current.length)
      commit(server)
      savedJson.current = JSON.stringify(draftOf(server))
      setRev((value) => value + 1)
    } else {
      commit({ ...docRef.current, updatedAt: server.updatedAt, updatedBy: server.updatedBy, status: server.status, published: server.published, publishedAt: server.publishedAt, unpublished: server.unpublished, live: server.live })
    }
    setSaveState({ kind: "saved" })
    notify(message)
  }, [backHref, commit, flush, notify, router, setSaveState])

  const saveTemplate = useCallback(async () => {
    if (!templateName.trim()) return
    setBusy(true)
    await flush()
    const result = await postPage({ action: "save-template", id: docRef.current.id, name: templateName })
    setBusy(false)
    if (!result.ok) { notify(result.error || "Le modèle n’a pas pu être enregistré."); return }
    setTemplateOpen(false)
    setTemplateName("")
    notify(`Modèle « ${result.template?.name ?? templateName} » enregistré`)
  }, [flush, notify, templateName])

  /* ----- Versions brouillon ----- */

  const openDrafts = useCallback(async () => {
    setDraftsOpen(true)
    setDraftError("")
    setDraftConfirm(null)
    setDraftName("")
    try {
      const response = await fetch(`/api/pages?drafts=${encodeURIComponent(docRef.current.id)}`, { cache: "no-store" })
      const payload = (await response.json().catch(() => ({}))) as { drafts?: PageSnapshot[]; error?: string }
      if (!response.ok) { setDraftError(payload.error || "Les versions brouillon n’ont pas pu être lues."); setDrafts([]); return }
      setDrafts(payload.drafts ?? [])
    } catch {
      setDraftError("Eraser ne répond pas : réessaie dans un instant.")
      setDrafts([])
    }
  }, [])

  const saveDraft = useCallback(async () => {
    setDraftBusy("save")
    setDraftError("")
    // La version enregistrée est celle du serveur : le brouillon en cours part d'abord.
    if (!(await flush())) { setDraftBusy(""); setDraftError("Enregistre d’abord la page : " + (saveRef.current.message ?? "un problème est survenu.")); return }
    const result = await postPage({ action: "save-draft", id: docRef.current.id, name: draftName.trim() || snapshotName("") }) as Awaited<ReturnType<typeof postPage>> & { drafts?: PageSnapshot[] }
    setDraftBusy("")
    if (!result.ok || !result.drafts) { setDraftError(result.error || "La version brouillon n’a pas pu être enregistrée."); return }
    setDrafts(result.drafts)
    setDraftName("")
    notify(`Version « ${result.drafts[0]?.name ?? "brouillon"} » enregistrée`)
  }, [draftName, flush, notify])

  const restoreDraft = useCallback((snapshot: PageSnapshot) => {
    // Le brouillon reprend le contenu de la version (titre, en-tête, sections) ; Ctrl+Z l'annule.
    change((draft) => {
      const next = { ...draft, title: snapshot.content.title, icon: snapshot.content.icon, emoji: snapshot.content.emoji, description: snapshot.content.description, sections: snapshot.content.sections }
      if (snapshot.content.hideHeader) next.hideHeader = true
      else delete next.hideHeader
      return next
    })
    setRev((value) => value + 1)
    setSelected(null)
    setDraftsOpen(false)
    notify(`Revenu à « ${snapshot.name} »`, { label: "Annuler", run: undo })
  }, [change, notify, undo])

  const deleteDraft = useCallback(async (snapshot: PageSnapshot) => {
    setDraftBusy(`delete:${snapshot.id}`)
    setDraftError("")
    const result = await postPage({ action: "delete-draft", id: docRef.current.id, draftId: snapshot.id }) as Awaited<ReturnType<typeof postPage>> & { drafts?: PageSnapshot[] }
    setDraftBusy("")
    setDraftConfirm(null)
    if (!result.ok || !result.drafts) { setDraftError(result.error || "La version brouillon n’a pas pu être supprimée."); return }
    setDrafts(result.drafts)
    notify(`Version « ${snapshot.name} » supprimée`)
  }, [notify])

  /* ----- Ce qu'on montre ----- */

  const selectedBlock = selected ? (() => { const at = locate(doc.sections, selected); return at ? doc.sections[at.si].cols[at.ci][at.bi] : null })() : null
  const sectionCount = doc.sections.length
  const roleChoices: PageRole[] = isAdmin ? ["admin", "mj", "joueur"] : ["mj", "joueur"]
  const pageClosed = !pageVisibleTo(doc.vis, viewAs) || !placeOpenTo(doc.place, viewAs)
  const href = pageHref(doc)
  const crumb = doc.place === "campagne" ? `Campagne · ${campaigns.find((campaign) => campaign.id === doc.campaignId)?.name ?? "à choisir"}` : doc.place === "hors-menu" ? "Hors menu · lien direct" : placeLabel(doc.place)
  const publishLabel = !doc.published || doc.status !== "publiee" ? "Publier" : doc.unpublished || save.kind === "dirty" || save.kind === "saving" ? "Publier les modifications" : "Publiée"
  const preview = useMemo(() => {
    if (mode !== "preview") return null
    const fake: CustomPage = { ...doc, ...draftOf(doc), status: "publiee", published: { title: doc.title, icon: doc.icon, emoji: doc.emoji, description: doc.description, sections: doc.sections, ...(doc.hideHeader ? { hideHeader: true } : {}) }, createdAt: "", createdBy: { uid: "", name: "" }, updatedBy: { uid: "", name: "" }, publishedBy: null, trashedAt: "", trashedBy: null }
    return pageForViewer(fake, { role: viewAs, uid: "", member: true, manager: true })
  }, [doc, mode, viewAs])
  const previewContext: BlockContext = { source: { direct: true, asPlayer: viewAs === "joueur" }, canReveal: viewAs !== "joueur", links }

  const statusPill = <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${doc.status === "publiee" ? "border-[#0f7a65]/40 bg-[#0f7a65]/10 text-[#0f7a65]" : "border-[#9a6512]/40 bg-[#9a6512]/10 text-[#9a6512]"}`}>{doc.status === "publiee" ? "Publiée" : "Brouillon"}</span>
  const saveIcon = { saved: <CloudCheck className="size-3.5" />, dirty: <CloudUpload className="size-3.5" />, saving: <LoaderCircle className="size-3.5 animate-spin" />, error: <CloudAlert className="size-3.5" />, conflict: <CloudAlert className="size-3.5" /> }[save.kind]
  const saveText = { saved: "Enregistré", dirty: "Modifié…", saving: "Enregistrement…", error: "Non enregistré", conflict: "Modifiée ailleurs" }[save.kind]

  const paneClass = (open: boolean) => `min-w-0 overflow-y-auto overscroll-contain rounded-[18px] border bg-card [scrollbar-width:thin] min-[960px]:sticky min-[960px]:top-[4.25rem] min-[960px]:max-h-[calc(var(--eraser-viewport,100vh)-5.5rem)] max-[959px]:fixed max-[959px]:inset-x-0 max-[959px]:bottom-0 max-[959px]:z-[60] max-[959px]:max-h-[74vh] max-[959px]:rounded-b-none max-[959px]:pb-[env(safe-area-inset-bottom)] max-[959px]:shadow-[0_-12px_40px_rgb(40_30_20/0.22)] max-[959px]:transition-transform max-[959px]:duration-200 ${open ? "" : "max-[959px]:invisible max-[959px]:translate-y-[105%]"}`

  return <div className="w-full flex-1 px-3 pb-24 pt-3 sm:px-5 min-[960px]:pb-10">
    {/* La barre d'outils de l'atelier */}
    <div role="toolbar" aria-label="Réglages de l’atelier" className="sticky top-0 z-30 -mx-3 mb-3.5 max-[959px]:static flex flex-wrap items-center gap-x-3 gap-y-2 border-b bg-background px-3 py-2.5 sm:-mx-5 sm:px-5">
      <div role="group" aria-label="Vue" className="inline-flex rounded-[11px] border bg-card p-0.5">
        <Link href={backHref} prefetch={false} className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[13px] text-muted-foreground transition hover:bg-muted hover:text-foreground"><LibraryBig className="size-3.5" />Index des pages</Link>
        {(["build", "preview"] as const).map((value) => <button key={value} type="button" aria-pressed={mode === value} onClick={() => { setMode(value); setDrawer(null) }} className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[13px] text-muted-foreground transition hover:bg-muted hover:text-foreground aria-pressed:bg-foreground aria-pressed:font-semibold aria-pressed:text-background">{value === "build" ? <Hammer className="size-3.5" /> : <Eye className="size-3.5" />}{value === "build" ? "Construire" : "Aperçu"}</button>)}
      </div>
      <span className="hidden h-6 w-px bg-border sm:block" />
      <div className="flex min-w-0 items-center gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground max-sm:hidden">Voir comme</span>
        <div role="group" aria-label="Voir comme" className="inline-flex rounded-[11px] border bg-card p-0.5">
          {roleChoices.map((value) => <button key={value} type="button" aria-pressed={viewAs === value} onClick={() => setViewAs(value)} className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[13px] text-muted-foreground transition hover:bg-muted hover:text-foreground aria-pressed:font-semibold aria-pressed:text-white ${value === "admin" ? "aria-pressed:bg-primary" : value === "mj" ? "aria-pressed:bg-[#3b5c8a]" : "aria-pressed:bg-[#0f7a65]"}`}><span className={`size-2 rounded-full ${viewAs === value ? "bg-white/90" : roleDot[value]}`} />{roleLabels[value]}</button>)}
        </div>
        {mode === "build" && <label className="inline-flex cursor-pointer items-center gap-1.5 text-[13px] text-muted-foreground" title="Montrer en grisé les blocs que ce rôle ne voit pas"><input type="checkbox" checked={showHidden} onChange={(event) => setShowHidden(event.target.checked)} className="accent-primary" />Blocs masqués</label>}
      </div>
      <div className="ml-auto flex items-center gap-1.5">
        <Button type="button" variant="ghost" size="icon-sm" onClick={undo} disabled={!historySize} title="Annuler la dernière modification (Ctrl+Z)" aria-label="Annuler"><Undo2 /></Button>
        <Button type="button" variant="outline" size="sm" onClick={() => void openDrafts()} title="Enregistrer le brouillon tel qu’il est sous un nom, y revenir plus tard ou le supprimer"><History /><span className="max-sm:hidden">Versions brouillon</span></Button>
        {statusPill}
        <button type="button" onClick={() => void flush()} title={save.message || "Les modifications s’enregistrent seules (Ctrl+S pour tout de suite)."} className={`hidden items-center gap-1 rounded-full px-2 py-0.5 text-xs sm:inline-flex ${save.kind === "error" || save.kind === "conflict" ? "text-destructive" : "text-muted-foreground"}`}>{saveIcon}{saveText}</button>
        <Button type="button" size="sm" variant={publishLabel === "Publiée" ? "outline" : "default"} disabled={busy || publishLabel === "Publiée" || save.kind === "conflict"} onClick={() => void action("publish", doc.published ? "Modifications publiées" : "Page publiée")}>{busy ? <LoaderCircle className="animate-spin" /> : publishLabel === "Publiée" ? <Check /> : <WandSparkles />}{publishLabel}</Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild><Button type="button" variant="outline" size="icon-sm" aria-label="Plus d’actions"><Ellipsis /></Button></DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-60">
            <DropdownMenuItem asChild><a href={href}><Eye />Ouvrir la page</a></DropdownMenuItem>
            <DropdownMenuItem onSelect={() => void openDrafts()}><History />Versions brouillon…</DropdownMenuItem>
            <DropdownMenuItem disabled={!doc.published || !doc.unpublished} onSelect={() => void action("revert", "Brouillon remis comme la version publiée")}><Undo2 />Revenir à la version publiée</DropdownMenuItem>
            <DropdownMenuItem disabled={doc.status !== "publiee"} onSelect={() => void action("unpublish", "Page repassée en brouillon")}><EyeOff />Repasser en brouillon</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => { setTemplateName(doc.title); setTemplateOpen(true) }}><Copy />Enregistrer comme modèle…</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => void action("duplicate", "Page dupliquée")}><Copy />Dupliquer la page</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={() => setTrashOpen(true)}><Trash2 />Mettre à la corbeille</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>

    {save.kind === "conflict" && <div role="alert" className="mb-3.5 flex flex-wrap items-center gap-3 rounded-2xl border border-destructive/35 bg-destructive/5 px-4 py-3 text-sm text-destructive">
      <CloudAlert className="size-4 shrink-0" /><span className="min-w-0 flex-1">{save.message}</span>
      <Button type="button" size="sm" variant="outline" onClick={() => window.location.reload()}>Recharger la page</Button>
    </div>}
    {save.kind === "error" && save.message && <div role="alert" className="mb-3.5 flex flex-wrap items-center gap-3 rounded-2xl border border-[#9a6512]/40 bg-[#9a6512]/8 px-4 py-2.5 text-sm text-[#7a4f0e]">
      <CloudAlert className="size-4 shrink-0" /><span className="min-w-0 flex-1">{save.message}</span>
      <Button type="button" size="sm" variant="outline" onClick={() => void flush()}>Réessayer</Button>
    </div>}

    <div className={`grid items-start gap-3.5 ${mode === "build" ? "min-[960px]:grid-cols-[232px_minmax(0,1fr)_316px] min-[1400px]:grid-cols-[248px_minmax(0,1fr)_336px]" : ""}`}>
      {mode === "build" && <aside aria-label="Blocs" className={paneClass(drawer === "palette")}>
        <Palette onAdd={(type, view) => insert(type, undefined, view)} onDragStart={(event, type, view) => startDrag(event, { kind: "new", type, view })} onClose={() => setDrawer(null)} />
      </aside>}

      {/* La page */}
      <main aria-label="La page" className={`@container min-w-0 rounded-[18px] border bg-background ${mode === "build" ? "border-dashed p-3 sm:p-4" : "mx-auto w-full max-w-[70rem] px-4 py-6 shadow-[0_14px_36px_rgb(67_50_31/0.12)] sm:px-8 sm:py-9"}`} onClick={(event) => { if (mode === "build" && event.target === event.currentTarget) select(null) }}>
        {mode === "preview" ? <>
          <div className="mb-6 flex flex-wrap items-center justify-between gap-2 border-b pb-3 text-[12.5px] text-muted-foreground">
            <span className="inline-flex items-center gap-1.5"><Eye className="size-3.5" />Aperçu comme <b className="text-foreground">{roleLabels[viewAs]}</b>{doc.place === "campagne" ? " (membre de la campagne)" : ""} · le brouillon, tel qu’il serait publié</span>
            <Button type="button" size="xs" variant="outline" onClick={() => setMode("build")}><Hammer />Revenir à l’atelier</Button>
          </div>
          {preview ? <>
            {!preview.hideHeader && <PageHeader eyebrow={doc.place === "hors-menu" ? "Page" : crumb} title={preview.title} description={preview.description} icon={preview.icon} emoji={preview.emoji} />}
            <div className="mt-10">{preview.sections.some((section) => section.cols.some((column) => column.length)) ? <PageSections sections={preview.sections} render={(block) => <BlockView block={block} context={previewContext} />} /> : <p className="rounded-2xl border border-dashed px-5 py-12 text-center text-sm text-muted-foreground">Rien à montrer à ce rôle.</p>}</div>
          </> : <p className="flex items-start gap-2 rounded-xl border border-dashed px-4 py-4 text-sm text-muted-foreground"><LockKeyhole className="mt-0.5 size-4 shrink-0" />Le rôle {roleLabels[viewAs]} ne voit pas cette page : elle n’apparaît pas dans sa recherche et son adresse lui répond « page introuvable ».</p>}
        </> : <div className="grid gap-4">
          {/* L'en-tête : un clic règle la page */}
          <header onClick={() => select(null, true)} className={`grid cursor-pointer grid-cols-[auto_minmax(0,1fr)] items-start gap-x-3.5 gap-y-1 rounded-2xl border p-2.5 transition ${selected === null ? "border-primary/70 bg-primary/[0.035]" : "border-transparent hover:border-border"}`}>
            <span className="row-span-3 mt-0.5 flex size-12 items-center justify-center rounded-[15px] border bg-card text-primary shadow-[0_6px_18px_rgb(67_50_31/0.08)]"><PageIcon icon={doc.icon} emoji={doc.emoji} /></span>
            <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-primary/75">{crumb}</span>
            <input value={doc.title} onChange={(event) => change((draft) => { draft.title = event.target.value }, "page:title")} placeholder="Titre de la page" aria-label="Titre de la page" className={`${inlineInput} -ml-1 px-1 font-display text-[1.9rem] font-semibold leading-tight tracking-[-0.02em] sm:text-[2.2rem]`} />
            <input value={doc.description} onChange={(event) => change((draft) => { draft.description = event.target.value }, "page:description")} placeholder="Une phrase sous le titre (facultative)" aria-label="Description de la page" className={`${inlineInput} -ml-1 px-1 text-[15px] text-muted-foreground`} />
            <div className="col-start-2 mt-1 flex flex-wrap items-center gap-1.5">
              {statusPill}
              <span className="inline-flex items-center gap-1 rounded-full border bg-card px-2 py-0.5 text-[11px] font-semibold text-muted-foreground"><Eye className="size-3" />{doc.vis === "tous" ? "Tout le monde" : doc.vis === "mj" ? "MJ et admin" : "Admin"}</span>
              <span className="truncate rounded-full border bg-card px-2 py-0.5 font-mono text-[11px] text-muted-foreground">{href}</span>
              {doc.replaces && <span className="inline-flex items-center gap-1 rounded-full border border-primary/35 bg-primary/8 px-2 py-0.5 text-[11px] font-semibold text-primary">{doc.replaceMode === "replace" ? "Remplace" : doc.replaceMode === "before" ? "Au-dessus de" : "En dessous de"} {doc.replaces}</span>}
              {doc.rowOf?.index && <span className="inline-flex items-center gap-1 rounded-full border border-[#3b5c8a]/35 bg-[#3b5c8a]/8 px-2 py-0.5 text-[11px] font-semibold text-[#3b5c8a]">Page de chaque ligne · {doc.rowOf.index}{doc.rowOf.tab ? ` › ${doc.rowOf.tab}` : ""}</span>}
            </div>
          </header>
          {pageClosed && <p className="flex items-start gap-2 rounded-xl border border-dashed px-3.5 py-2.5 text-[13px] text-muted-foreground"><LockKeyhole className="mt-0.5 size-4 shrink-0" />Le rôle {roleLabels[viewAs]} ne voit pas cette page ({doc.place === "ressources" || doc.place === "bac-a-sable" ? "section réservée aux MJ et aux admins" : doc.place === "administration" ? "section réservée aux admins" : "réglage « Qui voit la page »"}).</p>}

          <PageSearchProvider present={doc.sections.some((section) => section.cols.some((column) => column.some((block) => block.type === "search")))}>
          {doc.sections.map((section, si) => <section key={section.id} aria-label={`Section ${si + 1}`} className="group/section grid gap-1.5">
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 px-0.5 text-xs text-muted-foreground">
              <span className="text-[10.5px] font-bold uppercase tracking-[0.14em]">Section {si + 1}</span>
              <ColumnCount count={section.cols.length} onChange={(count) => setColumns(section.id, count)} />
              <Segmented size="sm" label={`Disposition de la section ${si + 1}`} value={section.layout} onChange={(layout) => setLayout(section.id, layout)} options={sectionLayouts.map((item) => ({ value: item.value, label: <LayoutGlyph layout={item.value} />, title: item.label }))} />
              <label className="inline-flex cursor-pointer items-center gap-1 max-sm:hidden"><input type="checkbox" checked={section.framed} onChange={(event) => change((draft) => { draft.sections[si].framed = event.target.checked })} className="accent-primary" />Encadrée</label>

              <span className="ml-auto inline-flex">
                <ToolButton label="Monter la section" disabled={si === 0} onClick={() => change((draft) => { const [moved] = draft.sections.splice(si, 1); draft.sections.splice(si - 1, 0, moved) })}><ArrowUp className="size-3.5" /></ToolButton>
                <ToolButton label="Descendre la section" disabled={si === sectionCount - 1} onClick={() => change((draft) => { const [moved] = draft.sections.splice(si, 1); draft.sections.splice(si + 1, 0, moved) })}><ArrowDown className="size-3.5" /></ToolButton>
                <ToolButton label="Supprimer la section" danger disabled={sectionCount === 1} onClick={() => { const count = section.cols.flat().length; change((draft) => { draft.sections.splice(si, 1) }); notify(count ? `Section supprimée (${count} bloc${count > 1 ? "s" : ""})` : "Section supprimée", { label: "Annuler", run: undo }) }}><Trash2 className="size-3.5" /></ToolButton>
              </span>
            </div>
            {section.cols.length > 1 && <WidthRuler layout={section.layout} widths={section.widths} onChange={(widths) => setWidths(section.id, widths)} />}
            <SectionGrid layout={section.layout} widths={section.widths} framed={section.framed} onWidths={(widths) => setWidths(section.id, widths)}>
              {section.cols.map((column, ci) => <div key={ci} data-col onDragOver={(event) => overColumn(event, section.id, ci)} onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDrop((current) => current?.section === section.id && current.column === ci ? null : current) }} onDrop={dropOn}
                className={`grid min-h-12 min-w-0 content-start gap-2.5 rounded-[14px] p-0.5 outline outline-1 outline-dashed transition ${drop?.section === section.id && drop.column === ci ? "bg-[#3b5c8a]/[0.04] outline-2 outline-[#3b5c8a]" : section.cols.length > 1 ? "outline-border/60" : "outline-transparent"}`}>
                {column.map((block, bi) => {
                  const reason = hiddenReason(block, viewAs, doc.live)
                  if (reason && !showHidden) return null
                  const Icon = blockIcons.blocks[block.type]
                  const isSelected = selected === block.id
                  const first = si === 0 && bi === 0
                  const last = si === sectionCount - 1 && bi === column.length - 1
                  return <Fragment key={block.id}>
                    {drop?.section === section.id && drop.column === ci && drop.index === bi && <div className="h-1 rounded-full bg-[#3b5c8a] shadow-[0_0_0_3px_rgb(59_92_138/0.2)]" />}
                    <div data-block-id={block.id} id={`atelier-${block.id}`} onClick={() => select(block.id)} onDoubleClick={() => select(block.id, true)}
                      className={`group/block relative min-w-0 rounded-[14px] border px-2 pb-2 transition ${isSelected ? "border-primary/80 shadow-[0_0_0_3px_rgb(104_37_34/0.14)]" : "border-border/60 hover:border-border"} ${draggingId === block.id ? "opacity-40" : ""} ${flash === block.id ? "animate-[pulse_0.9s_ease-out_1]" : ""} ${reason ? "bg-[repeating-linear-gradient(135deg,rgb(104_37_34/0.05)_0_8px,transparent_8px_16px)]" : "bg-card/50"}`}>
                      <div className="flex min-h-7 flex-wrap items-center gap-1.5 text-[11.5px] text-muted-foreground">
                        <span draggable onDragStart={(event) => startDrag(event, { kind: "move", id: block.id }, event.currentTarget.closest<HTMLElement>("[data-block-id]"))} onDragEnd={endDrag} title="Glisser pour déplacer (ou Alt + flèches)" className="flex cursor-grab items-center rounded px-0.5 py-1 hover:bg-muted active:cursor-grabbing"><svg viewBox="0 0 24 24" className="size-3.5" fill="currentColor" aria-hidden><circle cx="9" cy="6" r="1.6" /><circle cx="15" cy="6" r="1.6" /><circle cx="9" cy="12" r="1.6" /><circle cx="15" cy="12" r="1.6" /><circle cx="9" cy="18" r="1.6" /><circle cx="15" cy="18" r="1.6" /></svg></span>
                        <span className="inline-flex items-center gap-1 font-semibold text-foreground/70"><Icon className="size-3.5" />{blockLabel(block.type)}{block.type === "view" ? ` · ${viewBlockKinds.find((item) => item.value === block.kind)?.label ?? ""}` : ""}</span>
                        <VisibilityPill vis={block.vis} />
                        {block.showIf && <span title={block.showIf.conditions.map(describeCondition).join(block.showIf.match === "une" ? " ou " : " et ")} className="inline-flex items-center rounded-full border border-[#9a6512]/35 bg-[#9a6512]/8 px-1.5 text-[10.5px] font-semibold normal-case tracking-normal text-[#9a6512]">Si…</span>}
                        {block.type === "notes" && <span className="rounded-full border px-1.5 text-[10.5px]">écrit par : {block.editors.map((item) => roleLabels[item]).join(", ") || "personne"}</span>}
                        <span className={`absolute -top-3 right-2 z-[3] inline-flex rounded-lg border bg-card px-0.5 shadow-[0_4px_14px_rgb(67_50_31/0.12)] transition ${isSelected ? "opacity-100" : "pointer-events-none opacity-0 group-hover/block:pointer-events-auto group-hover/block:opacity-100 group-focus-within/block:pointer-events-auto group-focus-within/block:opacity-100"}`}>
                          <ToolButton label="Monter (Alt+↑)" disabled={first} onClick={() => move(block.id, "up")}><ArrowUp className="size-3.5" /></ToolButton>
                          <ToolButton label="Descendre (Alt+↓)" disabled={last} onClick={() => move(block.id, "down")}><ArrowDown className="size-3.5" /></ToolButton>
                          {section.cols.length > 1 && <ToolButton label="Colonne de gauche (Alt+←)" disabled={ci === 0} onClick={() => move(block.id, "left")}><ArrowLeft className="size-3.5" /></ToolButton>}
                          {section.cols.length > 1 && <ToolButton label="Colonne de droite (Alt+→)" disabled={ci === section.cols.length - 1} onClick={() => move(block.id, "right")}><ArrowRight className="size-3.5" /></ToolButton>}
                          <ToolButton label="Dupliquer" onClick={() => duplicate(block.id)}><Copy className="size-3.5" /></ToolButton>
                          <ToolButton label="Régler" onClick={() => select(block.id, true)}><Settings2 className="size-3.5" /></ToolButton>
                          <ToolButton label="Supprimer" danger onClick={() => remove(block.id)}><Trash2 className="size-3.5" /></ToolButton>
                        </span>
                      </div>
                      {reason && <p className="flex items-center gap-1.5 pb-1.5 text-xs text-muted-foreground"><EyeOff className="size-3.5" />{reason}</p>}
                      <div className={reason ? "opacity-45 grayscale-[0.6]" : ""}>
                        <BlockEditor block={block} rev={rev} live={doc.live} links={links} viewAs={viewAs} origin={doc.replaces} onChange={(patch, coalesce) => updateBlock(block.id, patch, coalesce)} />
                      </div>
                    </div>
                  </Fragment>
                })}
                {drop?.section === section.id && drop.column === ci && drop.index >= column.length && <div className="h-1 rounded-full bg-[#3b5c8a] shadow-[0_0_0_3px_rgb(59_92_138/0.2)]" />}
                <AddHere empty={!column.length} onAdd={(type) => insert(type, { section: section.id, column: ci, index: column.length })} />
              </div>)}
            </SectionGrid>
          </section>)}
          </PageSearchProvider>
          <button type="button" onClick={() => change((draft) => { draft.sections.push({ id: newId("s"), layout: "1", framed: false, cols: [[]] }) })} className="justify-self-center rounded-xl border border-dashed px-4 py-2 text-[12.5px] text-muted-foreground transition hover:border-[#3b5c8a] hover:text-foreground"><Plus className="mr-1 inline size-3.5" />Ajouter une section</button>
        </div>}
      </main>

      {mode === "build" && <aside aria-label="Réglages" className={paneClass(drawer === "props")}>
        <div className="sticky top-0 z-[2] flex items-center justify-between gap-2 rounded-t-[18px] bg-card px-4 pb-2 pt-3.5">
          <h2 className="font-display text-[17px] font-semibold">Réglages</h2>
          <div className="flex items-center gap-1.5">
            <div role="group" aria-label="Que régler" className="inline-flex rounded-[10px] border bg-background/60 p-0.5">
              <button type="button" aria-pressed={Boolean(selectedBlock)} disabled={!selectedBlock} onClick={() => undefined} className="rounded-md px-2 py-0.5 text-xs text-muted-foreground disabled:opacity-40 aria-pressed:bg-foreground aria-pressed:font-semibold aria-pressed:text-background">Bloc</button>
              <button type="button" aria-pressed={!selectedBlock} onClick={() => select(null)} className="rounded-md px-2 py-0.5 text-xs text-muted-foreground aria-pressed:bg-foreground aria-pressed:font-semibold aria-pressed:text-background">Page</button>
            </div>
            <button type="button" onClick={() => setDrawer(null)} aria-label="Fermer" className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted min-[960px]:hidden"><X className="size-4" /></button>
          </div>
        </div>
        <div className="pb-4">
          {selectedBlock
            ? <BlockSettings key={selectedBlock.id} block={selectedBlock} pages={pages} live={doc.live[selectedBlock.id]} rowOf={doc.rowOf ?? (rowOfRoute(doc.replaces) ? { index: rowOfRoute(doc.replaces)!.index } : undefined)} onChange={(patch, coalesce) => updateBlock(selectedBlock.id, patch, coalesce ? `${selectedBlock.id}:${coalesce}` : undefined)} onDuplicate={() => duplicate(selectedBlock.id)} onRemove={() => remove(selectedBlock.id)} onPage={() => select(null)} />
            : <PageSettings page={doc} pages={initialPages} campaigns={campaigns} isAdmin={isAdmin} linking={linking} busy={busy} saveError={save.kind === "error" && save.message && /adresse/i.test(save.message) ? save.message : ""}
              onChange={(patch, coalesce) => change((draft) => ({ ...draft, ...patch }), coalesce ? `page:${coalesce}` : undefined)}
              onRevert={() => void action("revert", "Brouillon remis comme la version publiée")}
              onTemplate={() => { setTemplateName(doc.title); setTemplateOpen(true) }}
              onTrash={() => setTrashOpen(true)} />}
        </div>
      </aside>}
    </div>

    {/* Petit écran : les volets deviennent des tiroirs */}
    {drawer && <button type="button" aria-label="Fermer le tiroir" onClick={() => setDrawer(null)} className="fixed inset-0 z-[55] bg-[rgb(20_16_12/0.35)] min-[960px]:hidden" />}
    {mode === "build" && <div className="fixed inset-x-0 bottom-0 z-50 flex justify-center gap-2 border-t bg-card px-4 pb-[calc(0.6rem+env(safe-area-inset-bottom))] pt-2.5 min-[960px]:hidden">
      <Button type="button" variant="outline" className="max-w-56 flex-1" onClick={() => setDrawer("palette")}><Plus />Blocs</Button>
      <Button type="button" variant="outline" className="max-w-56 min-w-0 flex-1" onClick={() => setDrawer("props")}><SquareMousePointer /><span className="truncate">{selectedBlock ? `Régler : ${blockLabel(selectedBlock.type)}` : "Régler la page"}</span></Button>
    </div>}

    {toast && <div role="status" className="fixed bottom-6 left-1/2 z-[70] flex w-max max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-3 rounded-xl bg-foreground px-3.5 py-2 text-[13px] text-background shadow-lg max-[959px]:bottom-20">
      <span>{toast.text}</span>
      {toast.action && <button type="button" className="shrink-0 rounded-md border border-background/30 px-2 py-0.5 font-semibold hover:bg-background/10" onClick={() => { const run = toast.action!.run; setToast(null); run() }}>{toast.action.label}</button>}
    </div>}

    <Dialog open={templateOpen} onOpenChange={setTemplateOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-display text-xl">Enregistrer comme modèle</DialogTitle>
          <DialogDescription>Le modèle garde les sections, les blocs, leurs réglages et leurs vues. « Nouvelle page › depuis un modèle » le recrée, ailleurs.</DialogDescription>
        </DialogHeader>
        <input autoFocus value={templateName} maxLength={60} onChange={(event) => setTemplateName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void saveTemplate() }} placeholder="Nom du modèle" className="h-9 rounded-lg border border-input bg-background px-3 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/20" />
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => setTemplateOpen(false)}>Annuler</Button>
          <Button type="button" disabled={busy || !templateName.trim()} onClick={() => void saveTemplate()}>{busy && <LoaderCircle className="animate-spin" />}Enregistrer le modèle</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <Dialog open={draftsOpen} onOpenChange={(open) => { setDraftsOpen(open); if (!open) setDraftConfirm(null) }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">Versions brouillon</DialogTitle>
          <DialogDescription>Garde le brouillon tel qu’il est sous un nom, pour y revenir plus tard. Revenir à une version remplace le brouillon de la page (Ctrl+Z l’annule) ; la version publiée ne change qu’avec « Publier ».</DialogDescription>
        </DialogHeader>
        <div className="flex gap-2">
          <input value={draftName} maxLength={60} onChange={(event) => setDraftName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !draftBusy) void saveDraft() }} placeholder={snapshotName("")} aria-label="Nom de la version" className="h-9 min-w-0 flex-1 rounded-lg border border-input bg-background px-3 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/20" />
          <Button type="button" disabled={Boolean(draftBusy) || save.kind === "conflict"} onClick={() => void saveDraft()}>{draftBusy === "save" ? <LoaderCircle className="animate-spin" /> : <BookmarkPlus />}Enregistrer</Button>
        </div>
        {draftError && <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">{draftError}</p>}
        <div className="grid max-h-[50svh] gap-1.5 overflow-y-auto overscroll-contain">
          {drafts === null
            ? <p className="flex items-center gap-2 px-1 py-3 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" />Lecture des versions…</p>
            : drafts.length
              ? drafts.map((snapshot) => <div key={snapshot.id} className="flex flex-wrap items-center gap-2 rounded-xl border bg-card/70 px-3 py-2">
                <span className="grid min-w-0 flex-1">
                  <b className="truncate text-sm font-semibold">{snapshot.name}</b>
                  <small className="text-[11.5px] text-muted-foreground">{formatWhen(snapshot.savedAt)}{snapshot.savedBy.name ? ` · ${snapshot.savedBy.name}` : ""} · {snapshot.content.sections.reduce((total, section) => total + section.cols.flat().length, 0)} blocs</small>
                </span>
                {draftConfirm === snapshot.id
                  ? <span className="flex items-center gap-1.5">
                    <span className="text-xs text-muted-foreground">Supprimer ?</span>
                    <Button type="button" size="xs" variant="ghost" onClick={() => setDraftConfirm(null)}>Non</Button>
                    <Button type="button" size="xs" variant="destructive" disabled={Boolean(draftBusy)} onClick={() => void deleteDraft(snapshot)}>{draftBusy === `delete:${snapshot.id}` ? <LoaderCircle className="animate-spin" /> : <Trash2 />}Supprimer</Button>
                  </span>
                  : <span className="flex items-center gap-1">
                    <Button type="button" size="xs" variant="outline" disabled={Boolean(draftBusy) || save.kind === "conflict"} onClick={() => restoreDraft(snapshot)}><RotateCcw />Revenir à cette version</Button>
                    <Button type="button" size="icon-xs" variant="ghost" className="hover:text-destructive" title="Supprimer cette version" aria-label={`Supprimer la version ${snapshot.name}`} disabled={Boolean(draftBusy)} onClick={() => setDraftConfirm(snapshot.id)}><Trash2 /></Button>
                  </span>}
              </div>)
              : <p className="rounded-xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">Aucune version brouillon pour l’instant.</p>}
        </div>
      </DialogContent>
    </Dialog>

    <Dialog open={trashOpen} onOpenChange={setTrashOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-display text-xl">Mettre « {doc.title} » à la corbeille ?</DialogTitle>
          <DialogDescription>La page disparaît de son adresse et de la recherche. Elle se restaure depuis l’Index des pages (Corbeille) ; seul un admin la supprime pour de bon.</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => setTrashOpen(false)}>Annuler</Button>
          <Button type="button" variant="destructive" disabled={busy} onClick={() => { setTrashOpen(false); void action("trash", "Page mise à la corbeille") }}><Trash2 />Mettre à la corbeille</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
}
