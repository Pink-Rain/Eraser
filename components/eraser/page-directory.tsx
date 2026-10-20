"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useMemo, useState, type DragEvent } from "react"
import { ArchiveRestore, ChevronRight, Eye, FilePlus2, FolderInput, FolderPlus, FolderTree as FolderTreeIcon, Inbox, LayoutGrid, LayoutTemplate, LibraryBig, List, LoaderCircle, PenLine, Search, Table2, Trash2, WandSparkles, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { PageIcon, formatWhen } from "@/components/eraser/custom-page-view"
import { fieldClass, Field } from "@/components/eraser/page-studio-settings"
import { PageCreatorNav } from "@/components/eraser/page-creator-nav"
import { DRAG_FOLDER, DRAG_PAGES, FolderGlyph, FolderPickerDialog, FolderTree, NavEntry, RenameField, useDropTarget } from "@/components/eraser/page-folders-ui"
import { pagePlaces, pageVisibilities, type PagePlace, type PageRole, type PageSummary, studioHref } from "@/lib/custom-pages"
import type { EraserPageEntry } from "@/lib/eraser-page-blueprints"
import { explorerPages, matchesExplorerQuery, sectionFolderPlan, type ExplorerPage } from "@/lib/page-explorer"
import { applyFolderOps, childFolders, flattenFolders, folderCounts, folderPath, folderPathLabel, newFolderId, type FolderOp, type PageFolder, type PageFolders } from "@/lib/page-folders"
import { PagesIndexView, pageViewKinds } from "@/components/eraser/pages-index-views"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import type { PagesIndexRow } from "@/lib/pages-index-shared"
import type { ViewBlockKind } from "@/lib/custom-pages"

/**
 * L'Index des pages (administrateurs) : un explorateur. À gauche les dossiers (imbriqués, un
 * glisser-déposer pour y ranger pages et dossiers), à droite le contenu du dossier ouvert. Toutes
 * les pages y ont la même forme, celles d'Eraser comprises (lib/page-explorer.ts) : on les range,
 * on les ouvre dans l'atelier et on les publie de la même façon. La recherche cherche partout ;
 * la corbeille et les modèles sont deux vues de la même colonne.
 *
 * Le rangement se voit tout de suite et s'enregistre derrière (lib/page-folders.ts) ; si le
 * serveur partagé refuse, il revient où il était et le dit.
 */

export type TemplateSummary = { id: string; name: string; createdAt: string; createdBy: string; title: string; icon: string; emoji: string; blocks: number }

/** La vue ouverte : un dossier (son identifiant), ou une des vues fixes de la colonne. */
type View = "racine" | "toutes" | "corbeille" | "modeles" | string
/** « Tableau » : la gestion des pages ; les autres : les pages vues par le moteur des index (cartes, liste, galerie…). */
type Look = "table" | Exclude<ViewBlockKind, "table">
type Filter = { status: "" | "publiee" | "brouillon" | "modifiee"; group: string; vis: string; look: Look; sort: "titre" | "recentes" }

const fixedViews = new Set(["racine", "toutes", "corbeille", "modeles"])
const isFolderView = (view: View) => !fixedViews.has(view)

function StatusPill({ page }: { page: ExplorerPage }) {
  if (page.trashedAt) return <span className="rounded-full border bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">Corbeille</span>
  return <span className="inline-flex flex-wrap items-center gap-1">
    <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${page.status === "publiee" ? "border-[#0f7a65]/40 bg-[#0f7a65]/10 text-[#0f7a65]" : "border-[#9a6512]/40 bg-[#9a6512]/10 text-[#9a6512]"}`}>{page.status === "publiee" ? "Publiée" : "Brouillon"}</span>
    {page.status === "publiee" && page.unpublished && <span className="text-[11px] text-muted-foreground" title="Des modifications de l’atelier ne sont pas encore publiées">· modifiée</span>}
  </span>
}

function VisPill({ vis }: { vis: string }) {
  const tone = vis === "mj" ? "border-[#3b5c8a]/35 bg-[#3b5c8a]/8 text-[#3b5c8a]" : vis === "admin" ? "border-primary/35 bg-primary/8 text-primary" : "bg-card text-muted-foreground"
  return <span className={`whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-semibold ${tone}`}>{pageVisibilities.find((item) => item.value === vis)?.label ?? vis}</span>
}

/** Un dossier du contenu (une tuile) : on l'ouvre, on y dépose des pages ou un dossier. */
function FolderTile({ folder, count, folders, onOpen, onPages, onFolder }: { folder: PageFolder; count: number; folders: PageFolders; onOpen: () => void; onPages: (keys: string[], folder: string) => void; onFolder: (id: string, parent: string) => void }) {
  const drop = useDropTarget(folder.id, folders, { onPages, onFolder })
  const children = childFolders(folders, folder.id).length
  return <button
    type="button"
    {...drop.props}
    draggable
    onDragStart={(event) => { event.dataTransfer.setData(DRAG_FOLDER, folder.id); event.dataTransfer.effectAllowed = "move" }}
    onClick={onOpen}
    className={`group flex items-center gap-3 rounded-2xl border bg-card/85 px-3.5 py-3 text-left shadow-[0_6px_18px_rgb(67_50_31/0.05)] transition hover:-translate-y-0.5 hover:border-primary/35 ${drop.over ? "border-primary ring-2 ring-primary/40" : ""}`}
  >
    <span className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-primary/8 text-primary"><FolderGlyph folder={folder} className="size-4.5" /></span>
    <span className="min-w-0 flex-1">
      <b className="block truncate font-display text-[15px]">{folder.name}</b>
      <small className="block text-[11.5px] text-muted-foreground">{count} page{count > 1 ? "s" : ""}{children ? ` · ${children} dossier${children > 1 ? "s" : ""}` : ""}</small>
    </span>
    <ChevronRight className="size-4 text-muted-foreground/40 transition group-hover:translate-x-0.5" />
  </button>
}

/** Un maillon du fil d'Ariane, où l'on dépose aussi. */
function Crumb({ target, label, folders, onOpen, onPages, onFolder, current }: { target: string; label: string; folders: PageFolders; onOpen: () => void; onPages: (keys: string[], folder: string) => void; onFolder: (id: string, parent: string) => void; current: boolean }) {
  const drop = useDropTarget(target, folders, { onPages, onFolder })
  return <button type="button" {...drop.props} onClick={onOpen} aria-current={current ? "page" : undefined} className={`rounded-md px-1.5 py-0.5 transition hover:bg-muted aria-[current=page]:font-semibold aria-[current=page]:text-foreground ${drop.over ? "ring-2 ring-primary/60" : ""}`}>{label}</button>
}

export function PageDirectory({ pages: initialPages, eraser = [], indexRows = [], templates: initialTemplates, campaigns, allCampaigns, role, newPage, folders: initialFolders, initialView = "racine" }: {
  pages: PageSummary[]
  /** Les pages vues comme les lignes de l'index des pages (cartes, liste…). */
  indexRows?: PagesIndexRow[]
  /** Les pages d'Eraser (reprises ou non dans l'atelier). */
  eraser?: EraserPageEntry[]
  templates: TemplateSummary[]
  /** Les campagnes où le compte peut créer une page (admin : toutes ; MJ : les siennes). */
  campaigns: Array<{ id: string; name: string }>
  allCampaigns: Array<{ id: string; name: string }>
  role: PageRole
  /** Ouvrir tout de suite « Nouvelle page » (lien « Nouvelle page » d'une section). */
  newPage?: { place?: string; template?: string }
  /** Le rangement en dossiers. */
  folders: PageFolders
  /** La vue ouverte d'abord (`?dossier=`, `?vue=`). */
  initialView?: View
}) {
  const router = useRouter()
  const [pages, setPages] = useState(initialPages)
  const [templates, setTemplates] = useState(initialTemplates)
  const [folders, setFolders] = useState(initialFolders)
  const [view, setView] = useState<View>(() => !isFolderView(initialView) || initialFolders.folders.some((folder) => folder.id === initialView) ? initialView : "racine")
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(isFolderView(initialView) ? folderPath(initialFolders, initialView).map((folder) => folder.id) : []))
  const [renaming, setRenaming] = useState("")
  const [query, setQuery] = useState("")
  const [filter, setFilter] = useState<Filter>({ status: "", group: "", vis: "", look: "table", sort: "titre" })
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [creating, setCreating] = useState(Boolean(newPage))
  const [draft, setDraft] = useState(() => ({ title: "", place: (pagePlaces.some((place) => place.value === newPage?.place) ? newPage!.place : "hors-menu") as PagePlace, campaignId: campaigns[0]?.id ?? "", template: newPage?.template ?? "", folder: "" }))
  const [busy, setBusy] = useState("")
  const [error, setError] = useState("")
  const [confirm, setConfirm] = useState<{ kind: "delete-page" | "delete-template"; id: string; name: string } | { kind: "delete-folder"; folder: PageFolder } | null>(null)
  const [picker, setPicker] = useState<{ keys: string[]; current: string | null } | null>(null)
  const isAdmin = role === "admin"
  const campaignName = (id: string) => allCampaigns.find((campaign) => campaign.id === id)?.name ?? "Campagne"

  // eslint-disable-next-line react-hooks/exhaustive-deps -- `campaignName` ne dépend que des campagnes, fixes
  const all = useMemo(() => explorerPages(pages, eraser, campaignName), [pages, eraser])
  const live = useMemo(() => all.filter((page) => !page.trashedAt), [all])
  const trashed = all.length - live.length
  const counts = useMemo(() => folderCounts(folders, live.map((page) => page.key)), [folders, live])
  const unfiled = useMemo(() => live.filter((page) => !folders.placement[page.key]).length, [folders, live])
  const groups = useMemo(() => [...new Set(live.map((page) => page.group))].sort((left, right) => left.localeCompare(right, "fr")), [live])
  const searching = query.trim() !== ""
  const currentFolder = isFolderView(view) ? folders.folders.find((folder) => folder.id === view) : undefined

  const rows = useMemo(() => {
    const base = view === "corbeille" ? all.filter((page) => page.trashedAt)
      : searching || view === "toutes" ? live
      : view === "racine" ? live.filter((page) => !folders.placement[page.key])
      : live.filter((page) => folders.placement[page.key] === view)
    const shown = base.filter((page) => {
      if (filter.status === "modifiee" ? !(page.status === "publiee" && page.unpublished) : filter.status && page.status !== filter.status) return false
      if (filter.group && page.group !== filter.group) return false
      if (filter.vis && page.vis !== filter.vis) return false
      return matchesExplorerQuery(page, query, folders)
    })
    return shown.sort((left, right) => filter.sort === "recentes" ? (right.updatedAt || "").localeCompare(left.updatedAt || "") || left.title.localeCompare(right.title, "fr") : left.title.localeCompare(right.title, "fr", { numeric: true, sensitivity: "base" }))
  }, [all, live, view, searching, folders, filter, query])
  const tiles = view === "racine" || isFolderView(view) ? (searching ? [] : childFolders(folders, view === "racine" ? "" : view)) : []
  const showFolderColumn = searching || view === "toutes" || view === "corbeille"
  const rowId = (page: ExplorerPage) => page.id || page.key

  function go(next: View) {
    setView(next)
    setSelected(new Set())
    setQuery("")
    if (isFolderView(next)) setExpanded((current) => new Set([...current, ...folderPath(folders, next).map((folder) => folder.id)]))
    // L'adresse suit, pour revenir au même dossier (retour de l'atelier, rechargement).
    const url = isFolderView(next) ? `/pages?dossier=${encodeURIComponent(next)}` : next === "racine" ? "/pages" : `/pages?vue=${next}`
    window.history.replaceState(window.history.state, "", url)
  }

  /* ---------- Rangement ---------- */

  async function saveFolders(ops: FolderOp[]) {
    const before = folders
    setFolders((current) => applyFolderOps(current, ops))
    const response = await fetch("/api/pages/folders", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ops }) }).catch(() => null)
    const payload = (await response?.json().catch(() => ({})) ?? {}) as { folders?: PageFolders; error?: string }
    if (!response?.ok || !payload.folders) {
      setFolders(before)
      setError(payload.error || "Le rangement n’a pas pu être enregistré : Eraser ne répond pas, réessaie dans un instant.")
      return false
    }
    setFolders(payload.folders)
    return true
  }

  const placePages = (keys: string[], folder: string) => { setSelected(new Set()); void saveFolders([{ op: "place", keys, folder }]) }
  const moveFolder = (id: string, parent: string) => void saveFolders([{ op: "move-folder", id, parent }])
  function createFolder(parent: string, name = "Nouveau dossier", rename = true) {
    const id = newFolderId()
    void saveFolders([{ op: "create", id, name, parent }])
    if (parent) setExpanded((current) => new Set([...current, parent]))
    if (rename) setRenaming(id)
    return id
  }
  const treeHandlers = {
    onOpen: (id: string) => go(id),
    onPages: placePages,
    onFolder: moveFolder,
    onCreate: (parent: string) => { createFolder(parent) },
    onRename: (id: string, name: string) => void saveFolders([{ op: "rename", id, name }]),
    onDelete: (folder: PageFolder) => setConfirm({ kind: "delete-folder", folder }),
    onToggle: (id: string) => setExpanded((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next }),
    setRenaming,
  }
  const rootDrop = useDropTarget("", folders, { onPages: placePages, onFolder: moveFolder })

  function organizeBySection() {
    const plan = sectionFolderPlan(live, folders, newFolderId)
    void saveFolders([...plan.create.map((folder) => ({ op: "create" as const, id: folder.id, name: folder.name, parent: "" })), ...plan.place.map((entry) => ({ op: "place" as const, keys: entry.keys, folder: entry.folder }))])
  }

  function startDrag(event: DragEvent, page: ExplorerPage) {
    const keys = selected.has(rowId(page)) ? rows.filter((row) => selected.has(rowId(row))).map((row) => row.key) : [page.key]
    event.dataTransfer.setData(DRAG_PAGES, JSON.stringify([...new Set(keys)]))
    event.dataTransfer.effectAllowed = "move"
  }

  /* ---------- Les pages ---------- */

  async function post(body: Record<string, unknown>) {
    const response = await fetch("/api/pages", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).catch(() => null)
    const payload = (await response?.json().catch(() => ({})) ?? {}) as { page?: { id: string; status: PageSummary["status"]; unpublished: boolean; trashedAt: string; updatedAt: string; slug: string }; error?: string }
    return { ok: Boolean(response?.ok), ...payload, error: payload.error || (response ? "Cette action n’a pas pu être faite." : "Eraser ne répond pas : réessaie dans un instant.") }
  }

  async function create() {
    setBusy("create")
    setError("")
    const result = await post({ action: "create", templateId: draft.template || undefined, page: { title: draft.title.trim() || (draft.template ? templates.find((item) => item.id === draft.template)?.title : "") || "Nouvelle page", place: draft.place, campaignId: draft.place === "campagne" ? draft.campaignId : "", vis: draft.place === "administration" ? "admin" : "tous" } })
    if (!result.ok || !result.page) { setBusy(""); setError(result.error); return }
    // Rangée dans le dossier choisi avant d'ouvrir l'atelier (le retour la retrouve là).
    if (draft.folder) await saveFolders([{ op: "place", keys: [result.page.id], folder: draft.folder }])
    router.push(studioHref(result.page.id))
  }

  function openCreate(template = "") {
    setError("")
    setDraft((current) => ({ ...current, template, title: template ? "" : current.title, folder: isFolderView(view) ? view : "" }))
    setCreating(true)
  }

  /** « Ouvrir » une page d'Eraser pas encore reprise : la page de l'atelier qui la remplacera (en brouillon), puis l'atelier. */
  async function open(page: ExplorerPage) {
    if (page.id) { router.push(studioHref(page.id)); return }
    setBusy(`open:${page.key}`); setError("")
    const response = await fetch("/api/pages", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "adopt", path: page.path }) }).catch(() => null)
    const payload = (await response?.json().catch(() => ({})) ?? {}) as { page?: { id: string }; error?: string }
    if (!response?.ok || !payload.page) { setError(payload.error || "Eraser ne répond pas : réessaie dans un instant."); setBusy(""); return }
    router.push(studioHref(payload.page.id))
  }

  async function act(page: ExplorerPage, action: "publish" | "unpublish" | "trash" | "restore" | "delete") {
    const summary = pages.find((item) => item.id === page.id)
    if (!summary) return false
    setBusy(`${action}:${page.id}`)
    setError("")
    const result = await post({ action, id: page.id, base: summary.updatedAt })
    setBusy("")
    if (!result.ok) { setError(result.error); return false }
    if (action === "delete") { setPages((list) => list.filter((item) => item.id !== page.id)); return true }
    const next = result.page!
    setPages((list) => list.map((item) => item.id === page.id ? { ...item, status: next.status, unpublished: next.unpublished, trashedAt: next.trashedAt, updatedAt: next.updatedAt, slug: next.slug, href: item.href.replace(/[^/]+$/, encodeURIComponent(next.slug)) } : item))
    return true
  }

  async function actOnSelection(action: "publish" | "trash") {
    const targets = rows.filter((page) => selected.has(rowId(page)) && page.id && page.editable && (action === "trash" || page.status !== "publiee" || page.unpublished))
    for (const page of targets) if (!await act(page, action)) break
    setSelected(new Set())
  }

  async function deleteTemplate(id: string) {
    setBusy(`template:${id}`)
    const result = await post({ action: "delete-template", templateId: id })
    setBusy("")
    if (!result.ok) { setError(result.error); return }
    setTemplates((list) => list.filter((item) => item.id !== id))
  }

  const places = pagePlaces.filter((place) => isAdmin || place.value !== "administration")
  const folderOfRow = (page: ExplorerPage) => folders.placement[page.key] ?? ""
  const actions = (page: ExplorerPage) => page.trashedAt
    ? <>
      {page.editable && <Button type="button" size="xs" variant="outline" disabled={Boolean(busy)} onClick={() => void act(page, "restore")}><ArchiveRestore />Restaurer</Button>}
      {isAdmin && <Button type="button" size="xs" variant="ghost" className="text-destructive hover:text-destructive" disabled={Boolean(busy)} onClick={() => setConfirm({ kind: "delete-page", id: page.id, name: page.title })}><Trash2 />Supprimer</Button>}
    </>
    : <>
      {page.editable && <Button type="button" size="xs" variant="outline" disabled={Boolean(busy)} onClick={() => void open(page)}>{busy === `open:${page.key}` ? <LoaderCircle className="animate-spin" /> : <PenLine />}Ouvrir</Button>}
      {page.visitable ? <Button asChild size="icon-xs" variant="ghost" title="Voir la page" aria-label={`Voir ${page.title}`}><Link href={page.href} prefetch={false}><Eye /></Link></Button> : <span aria-hidden="true" className="size-6" />}
      {page.id && page.editable && (page.status !== "publiee" || page.unpublished) && <Button type="button" size="xs" variant="ghost" disabled={Boolean(busy)} onClick={() => void act(page, "publish")}>{busy === `publish:${page.id}` ? <LoaderCircle className="animate-spin" /> : <WandSparkles />}Publier</Button>}
      <Button type="button" size="icon-xs" variant="ghost" title="Ranger dans un dossier" aria-label={`Ranger ${page.title} dans un dossier`} onClick={() => setPicker({ keys: [page.key], current: folderOfRow(page) })}><FolderInput /></Button>
      {!(page.id && page.editable) && <span aria-hidden="true" className="size-6" />}
      {page.id && page.editable && <Button type="button" size="icon-xs" variant="ghost" className="hover:text-destructive" title={page.path ? "Mettre ses modifications à la corbeille (la page revient telle qu’Eraser la livre)" : "Mettre à la corbeille"} aria-label={`Mettre ${page.title} à la corbeille`} disabled={Boolean(busy)} onClick={() => void act(page, "trash")}><Trash2 /></Button>}
    </>

  const allChecked = rows.length > 0 && rows.every((page) => selected.has(rowId(page)))
  const heading = view === "toutes" ? "Toutes les pages" : view === "corbeille" ? "Corbeille" : view === "modeles" ? "Modèles" : currentFolder?.name ?? "Pages"
  const visibleKeys = new Set(rows.map((page) => page.key))

  return <div className="w-full flex-1 px-5 py-9 sm:px-8 md:py-12">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <section className="max-w-3xl">
        <div className="mb-5 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-primary/75"><span className="h-px w-7 bg-primary/50" />Créateur de pages</div>
        <div className="flex items-start gap-4">
          <div className="mt-1 flex size-12 shrink-0 items-center justify-center rounded-2xl border bg-card/90 text-primary shadow-[0_8px_25px_rgb(67_50_31/0.06)]"><LibraryBig className="size-5" /></div>
          <div>
            <h1 className="font-display text-4xl font-semibold tracking-[-0.025em] sm:text-5xl">Index des pages</h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-muted-foreground">Toutes les pages d’Eraser, celles que tu crées comme celles qu’il livre, rangées dans tes dossiers. Glisse une page sur un dossier pour l’y ranger ; « Ouvrir » la modifie dans l’atelier.</p>
          </div>
        </div>
      </section>
      <div className="flex flex-col items-end gap-2">
        <PageCreatorNav active={view === "modeles" ? "modeles" : "pages"} onTab={(tab) => { if (tab === "menu") return false; go(tab === "modeles" ? "modeles" : "racine"); return true }} />
        <Button type="button" onClick={() => openCreate()}><FilePlus2 />Nouvelle page</Button>
      </div>
    </div>

    {error && <p role="alert" className="mt-6 flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-2.5 text-sm text-destructive"><span className="flex-1">{error}</span><button type="button" aria-label="Fermer" onClick={() => setError("")}><X className="size-4" /></button></p>}

    <div className="mt-8 grid items-start gap-6 lg:grid-cols-[15.5rem_minmax(0,1fr)]">
      <aside aria-label="Dossiers" className="grid gap-3 lg:sticky lg:top-4 lg:max-h-[calc(100svh-2rem)] lg:overflow-y-auto lg:pr-1">
        <div className="grid gap-px rounded-2xl border bg-card/80 p-1.5">
          <NavEntry active={view === "racine"} icon={<Inbox className="size-4" />} label={folders.folders.length ? "Pages non rangées" : "Pages"} count={unfiled} onClick={() => go("racine")} drop={rootDrop} />
          <NavEntry active={view === "toutes"} icon={<List className="size-4" />} label="Toutes les pages" count={live.length} onClick={() => go("toutes")} />
        </div>
        <div className="grid gap-1 rounded-2xl border bg-card/80 p-1.5">
          <div className="flex items-center justify-between px-2 pt-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            <span>Dossiers</span>
            <button type="button" title="Nouveau dossier" aria-label="Nouveau dossier" onClick={() => createFolder(isFolderView(view) ? view : "")} className="flex size-6 items-center justify-center rounded-md hover:bg-muted hover:text-foreground"><FolderPlus className="size-3.5" /></button>
          </div>
          {folders.folders.length
            ? <FolderTree folders={folders} counts={counts} view={view} expanded={expanded} renaming={renaming} handlers={treeHandlers} />
            : <p className="px-2 pb-2 text-[12px] leading-snug text-muted-foreground">Aucun dossier. Crée-en un avec le +, ou laisse Eraser ranger tes pages par section.</p>}
        </div>
        <div className="grid gap-px rounded-2xl border bg-card/80 p-1.5">
          <NavEntry active={view === "modeles"} icon={<LayoutTemplate className="size-4" />} label="Modèles" count={templates.length} onClick={() => go("modeles")} />
          <NavEntry active={view === "corbeille"} icon={<Trash2 className="size-4" />} label="Corbeille" count={trashed} onClick={() => go("corbeille")} />
        </div>
      </aside>

      <section aria-label={heading} className="min-w-0">
        {view === "modeles"
          ? <>
            <h2 className="flex items-center gap-2 font-display text-2xl font-semibold"><LayoutTemplate className="size-5 text-primary" />Modèles</h2>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">Ceux que tu as enregistrés depuis l’atelier (« Enregistrer comme modèle »). Eraser n’en impose aucun.</p>
            {templates.length
              ? <div className="mt-4 grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(min(16rem,100%),1fr))]">
                {templates.map((template) => <article key={template.id} className="flex items-start gap-3 rounded-2xl border bg-card/85 p-4">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-primary/8 text-primary"><PageIcon icon={template.icon} emoji={template.emoji} className="size-4" /></span>
                  <span className="grid min-w-0 flex-1 gap-1">
                    <b className="truncate font-display text-base">{template.name}</b>
                    <small className="text-[11.5px] text-muted-foreground">{template.blocks} bloc{template.blocks > 1 ? "s" : ""}{template.createdBy ? ` · par ${template.createdBy}` : ""}</small>
                    <span className="mt-1 flex flex-wrap gap-1">
                      <Button type="button" size="xs" variant="outline" onClick={() => openCreate(template.id)}><FilePlus2 />Nouvelle page</Button>
                      <Button type="button" size="xs" variant="ghost" className="text-destructive hover:text-destructive" disabled={Boolean(busy)} onClick={() => setConfirm({ kind: "delete-template", id: template.id, name: template.name })}><Trash2 />Supprimer</Button>
                    </span>
                  </span>
                </article>)}
              </div>
              : <p className="mt-4 rounded-2xl border border-dashed px-5 py-6 text-sm text-muted-foreground">Aucun modèle pour l’instant. Dans l’atelier, « Enregistrer comme modèle » garde une page pour en créer d’autres sur le même plan.</p>}
          </>
          : <>
            {view !== "racine" && <nav aria-label="Chemin" className="flex flex-wrap items-center gap-0.5 text-[13px] text-muted-foreground">
              <Crumb target="" label="Pages" folders={folders} current={view === "racine"} onOpen={() => go("racine")} onPages={placePages} onFolder={moveFolder} />
              {view === "toutes" || view === "corbeille" ? <><ChevronRight className="size-3.5 opacity-50" /><span className="px-1.5 font-semibold text-foreground">{heading}</span></> : null}
              {isFolderView(view) && folderPath(folders, view).map((folder) => <span key={folder.id} className="contents"><ChevronRight className="size-3.5 opacity-50" /><Crumb target={folder.id} label={folder.name} folders={folders} current={folder.id === view} onOpen={() => go(folder.id)} onPages={placePages} onFolder={moveFolder} /></span>)}
            </nav>}
            <div className="mt-2 flex flex-wrap items-center gap-3">
              {currentFolder && renaming === `titre:${currentFolder.id}`
                ? <RenameField value={currentFolder.name} className="h-11 max-w-md font-display text-3xl" onDone={(name) => { setRenaming(""); if (name && name !== currentFolder.name) void saveFolders([{ op: "rename", id: currentFolder.id, name }]) }} />
                : <h2 className="font-display text-3xl font-semibold tracking-[-0.015em]" onDoubleClick={() => { if (currentFolder) setRenaming(`titre:${currentFolder.id}`) }} title={currentFolder ? "Double-clic pour renommer" : undefined}>{searching ? "Recherche dans toutes les pages" : heading}</h2>}
              {(view === "racine" || isFolderView(view)) && !searching && <span className="ml-auto flex flex-wrap gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => createFolder(isFolderView(view) ? view : "")}><FolderPlus />Nouveau dossier{currentFolder ? " ici" : ""}</Button>
                {currentFolder && <Button type="button" variant="outline" size="sm" onClick={() => openCreate()}><FilePlus2 />Nouvelle page ici</Button>}
                {currentFolder && <Button type="button" variant="ghost" size="sm" className="hover:text-destructive" onClick={() => setConfirm({ kind: "delete-folder", folder: currentFolder })}><Trash2 />Supprimer le dossier</Button>}
              </span>}
            </div>

            {view === "racine" && !searching && !folders.folders.length && live.length > 6 && <div className="mt-5 flex flex-wrap items-center gap-3 rounded-2xl border border-dashed border-primary/35 bg-primary/5 px-4 py-3 text-[13px]">
              <FolderTreeIcon className="size-5 shrink-0 text-primary" />
              <span className="min-w-0 flex-[1_1_18rem] text-muted-foreground">Range tes {live.length} pages en dossiers : un dossier par section (Accueil, Règles, Campagnes…) pour commencer, que tu renommes, imbriques ou supprimes ensuite. Aucune page n’est modifiée.</span>
              <Button type="button" size="sm" onClick={organizeBySection}><FolderTreeIcon />Ranger par section</Button>
            </div>}

            <div className="mt-5 flex flex-wrap items-center gap-2">
              <label className="flex min-w-0 flex-[1_1_16rem] items-center gap-2 rounded-xl border bg-card px-3 focus-within:border-ring">
                <Search className="size-4 text-muted-foreground" />
                <input value={query} onChange={(event) => { setQuery(event.target.value); setSelected(new Set()) }} onKeyDown={(event) => { if (event.key === "Escape") setQuery("") }} placeholder="Chercher dans toutes les pages : titre, adresse, dossier…" aria-label="Chercher une page" className="h-9 min-w-0 flex-1 bg-transparent text-sm outline-none" />
                {searching && <button type="button" aria-label="Effacer la recherche" onClick={() => setQuery("")}><X className="size-3.5 text-muted-foreground" /></button>}
              </label>
              <select aria-label="Statut" className={`${fieldClass.replace("w-full ", "")} h-9 w-auto`} value={filter.status} onChange={(event) => setFilter({ ...filter, status: event.target.value as Filter["status"] })}>
                <option value="">Tout statut</option><option value="publiee">Publiées</option><option value="modifiee">Publiées, modifiées depuis</option><option value="brouillon">Brouillons</option>
              </select>
              <select aria-label="Section" className={`${fieldClass.replace("w-full ", "")} h-9 w-auto`} value={filter.group} onChange={(event) => setFilter({ ...filter, group: event.target.value })}>
                <option value="">Toute section</option>
                {groups.map((group) => <option key={group} value={group}>{group}</option>)}
              </select>
              <select aria-label="Visibilité" className={`${fieldClass.replace("w-full ", "")} h-9 w-auto`} value={filter.vis} onChange={(event) => setFilter({ ...filter, vis: event.target.value })}>
                <option value="">Toute visibilité</option>
                {pageVisibilities.map((vis) => <option key={vis.value} value={vis.value}>{vis.label}</option>)}
              </select>
              <select aria-label="Ordre" className={`${fieldClass.replace("w-full ", "")} h-9 w-auto`} value={filter.sort} onChange={(event) => setFilter({ ...filter, sort: event.target.value as Filter["sort"] })}>
                <option value="titre">Par titre</option><option value="recentes">Modifiées récemment</option>
              </select>
              <div role="group" aria-label="Affichage" className="inline-flex rounded-[11px] border bg-card p-0.5">
                {(["table", "cards", "list"] as const).map((look) => <button key={look} type="button" aria-pressed={filter.look === look} onClick={() => setFilter({ ...filter, look })} title={look === "table" ? "Tableau" : look === "cards" ? "Cartes" : "Liste"} className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[13px] text-muted-foreground hover:bg-muted aria-pressed:bg-foreground aria-pressed:font-semibold aria-pressed:text-background">{look === "table" ? <Table2 className="size-3.5" /> : look === "cards" ? <LayoutGrid className="size-3.5" /> : <List className="size-3.5" />}<span className="sr-only sm:not-sr-only">{look === "table" ? "Tableau" : look === "cards" ? "Cartes" : "Liste"}</span></button>)}
              </div>
              <NativeSelect aria-label="Autre vue" className="h-9 w-auto text-[13px]" value={filter.look === "table" || filter.look === "cards" || filter.look === "list" ? "" : filter.look} onChange={(event) => { if (event.target.value) setFilter({ ...filter, look: event.target.value as Look }) }}>
                <NativeSelectOption value="">Autre vue…</NativeSelectOption>
                {pageViewKinds.filter((kind) => kind.value !== "cards" && kind.value !== "list").map((kind) => <NativeSelectOption key={kind.value} value={kind.value}>{kind.label}</NativeSelectOption>)}
              </NativeSelect>
            </div>

            {tiles.length > 0 && <div className="mt-5 grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(min(14rem,100%),1fr))]">
              {tiles.map((folder) => <FolderTile key={folder.id} folder={folder} count={counts.get(folder.id) ?? 0} folders={folders} onOpen={() => go(folder.id)} onPages={placePages} onFolder={moveFolder} />)}
            </div>}

            <div className="mb-2 mt-5 flex min-h-8 flex-wrap items-center gap-2 text-xs text-muted-foreground">
              {selected.size > 0
                ? <span className="flex flex-wrap items-center gap-2 rounded-xl border bg-foreground px-2.5 py-1 text-background">
                  <b className="text-[12.5px]">{selected.size} page{selected.size > 1 ? "s" : ""} sélectionnée{selected.size > 1 ? "s" : ""}</b>
                  <Button type="button" size="xs" variant="secondary" onClick={() => setPicker({ keys: [...new Set(rows.filter((page) => selected.has(rowId(page))).map((page) => page.key))], current: null })}><FolderInput />Ranger dans…</Button>
                  {view !== "corbeille" && <Button type="button" size="xs" variant="secondary" disabled={Boolean(busy)} onClick={() => void actOnSelection("publish")}><WandSparkles />Publier</Button>}
                  {view !== "corbeille" && <Button type="button" size="xs" variant="secondary" disabled={Boolean(busy)} onClick={() => void actOnSelection("trash")}><Trash2 />Corbeille</Button>}
                  <button type="button" aria-label="Tout désélectionner" onClick={() => setSelected(new Set())} className="rounded p-0.5 hover:bg-background/15"><X className="size-3.5" /></button>
                </span>
                : <span>{rows.length} page{rows.length > 1 ? "s" : ""}{view === "corbeille" ? " dans la corbeille" : ""}{tiles.length ? ` · ${tiles.length} dossier${tiles.length > 1 ? "s" : ""}` : ""}{filter.look === "table" && rows.length > 1 && view !== "corbeille" ? " · coche des pages, ou glisse-les sur un dossier, pour les ranger" : ""}</span>}
            </div>

            {filter.look !== "table" && view !== "corbeille"
              ? <PagesIndexView kind={filter.look} query={query} rows={indexRows.filter((row) => visibleKeys.has(row.id))} />
              : !rows.length
              ? <div className="grid place-items-center gap-3 rounded-2xl border border-dashed px-5 py-14 text-center text-sm text-muted-foreground">
                <p>{view === "corbeille" ? "La corbeille est vide." : searching ? "Aucune page ne correspond à cette recherche." : currentFolder ? (tiles.length ? "Aucune page directement dans ce dossier." : "Ce dossier est vide. Glisse des pages dessus depuis « Toutes les pages », ou crée-en une ici.") : "Aucune page ne correspond à ces filtres."}</p>
                {currentFolder && !searching && <Button type="button" variant="outline" onClick={() => openCreate()}><FilePlus2 />Nouvelle page ici</Button>}
              </div>
              : <div className="overflow-x-auto rounded-2xl border bg-card">
                <table className="w-full border-collapse text-[13px]">
                  <thead><tr>
                    <th scope="col" className="w-8 border-b bg-muted px-3 py-2"><input type="checkbox" aria-label="Tout sélectionner" checked={allChecked} onChange={() => setSelected(allChecked ? new Set() : new Set(rows.map(rowId)))} className="size-3.5 accent-[var(--primary)]" /></th>
                    {["Page", ...(showFolderColumn ? ["Dossier"] : []), "Emplacement", "Visibilité", "Statut", "Modifiée", ""].map((label) => <th key={label} scope="col" className="whitespace-nowrap border-b bg-muted px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{label || <span className="sr-only">Actions</span>}</th>)}
                  </tr></thead>
                  <tbody>{rows.map((page) => {
                    const id = rowId(page)
                    const checked = selected.has(id)
                    return <tr key={id} draggable={!page.trashedAt} onDragStart={(event) => startDrag(event, page)} className={`border-b border-border/60 last:border-b-0 ${checked ? "bg-primary/6" : "hover:bg-background/50"}`}>
                      <td className="px-3 py-2"><input type="checkbox" aria-label={`Sélectionner ${page.title}`} checked={checked} onChange={() => setSelected((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next })} className="size-3.5 accent-[var(--primary)]" /></td>
                      <td className="px-3 py-2">
                        <button type="button" disabled={!page.editable || Boolean(page.trashedAt)} onClick={() => void open(page)} className="group flex items-center gap-2.5 text-left disabled:cursor-default">
                          <span className="flex size-8 shrink-0 items-center justify-center rounded-[9px] border border-primary/20 bg-primary/8 text-primary"><PageIcon icon={page.icon} emoji={page.emoji} className="size-4" /></span>
                          <span className="min-w-0"><b className="block whitespace-nowrap font-display text-[15px] group-enabled:group-hover:text-primary group-enabled:group-hover:underline group-enabled:group-hover:underline-offset-3">{page.title}</b><small className="block max-w-[26rem] truncate font-mono text-[11px] text-muted-foreground" title={page.href}>{page.href}</small></span>
                        </button>
                      </td>
                      {showFolderColumn && <td className="px-3 py-2">{folderOfRow(page)
                        ? <button type="button" onClick={() => go(folderOfRow(page))} className="inline-flex max-w-56 items-center gap-1 truncate rounded-md px-1 text-muted-foreground hover:bg-muted hover:text-foreground"><FolderGlyph className="size-3.5 shrink-0" /><span className="truncate">{folderPathLabel(folders, folderOfRow(page))}</span></button>
                        : <span className="text-muted-foreground/60">—</span>}</td>}
                      <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">{page.where}</td>
                      <td className="px-3 py-2"><VisPill vis={page.vis} /></td>
                      <td className="px-3 py-2"><StatusPill page={page} /></td>
                      <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">{page.updatedAt ? <>{formatWhen(page.updatedAt)}{page.updatedBy ? <small className="block text-[11px]">{page.updatedBy}</small> : null}</> : "—"}</td>
                      <td className="px-3 py-2"><div className="flex items-center justify-end gap-1">{actions(page)}</div></td>
                    </tr>
                  })}</tbody>
                </table>
              </div>}
          </>}
      </section>
    </div>

    <Dialog open={creating} onOpenChange={(next) => { setCreating(next); if (!next) setError("") }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">Nouvelle page</DialogTitle>
          <DialogDescription>Elle naît en brouillon : seuls ceux qui peuvent la modifier la voient tant qu’elle n’est pas publiée.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <Field label="Titre"><input autoFocus className={`${fieldClass} h-9 text-sm`} value={draft.title} maxLength={120} placeholder={draft.template ? templates.find((item) => item.id === draft.template)?.title : "Guide du joueur, Les dieux du Sud…"} onChange={(event) => setDraft({ ...draft, title: event.target.value })} onKeyDown={(event) => { if (event.key === "Enter") void create() }} /></Field>
          <Field label="Dossier" hint="Où la retrouver dans l’Index des pages ; rien ne change pour les lecteurs.">
            <select className={`${fieldClass} h-9 text-sm`} value={draft.folder} onChange={(event) => setDraft({ ...draft, folder: event.target.value })}>
              <option value="">Aucun dossier</option>
              {flattenFolders(folders).map(({ folder, depth }) => <option key={folder.id} value={folder.id}>{`${" ".repeat(depth)}${folder.name}`}</option>)}
            </select>
          </Field>
          <Field label="Dans le menu" hint={draft.place === "hors-menu" ? "Aucun menu : on y arrive par un lien, la recherche (Ctrl + K) ou un dossier placé dans le menu." : draft.place === "campagne" ? "Le dossier de la campagne ; ouverte à ses joueurs et à son MJ." : "Sur la page de la section, à l’adresse de la section."}>
            <select className={`${fieldClass} h-9 text-sm`} value={draft.place} onChange={(event) => setDraft({ ...draft, place: event.target.value as PagePlace })}>
              {places.map((place) => <option key={place.value} value={place.value} disabled={place.value === "campagne" && !campaigns.length}>{place.label}</option>)}
            </select>
          </Field>
          {draft.place === "campagne" && <Field label="Campagne"><select className={`${fieldClass} h-9 text-sm`} value={draft.campaignId} onChange={(event) => setDraft({ ...draft, campaignId: event.target.value })}>{campaigns.map((campaign) => <option key={campaign.id} value={campaign.id}>{campaign.name}</option>)}</select></Field>}
          <Field label="À partir de">
            <select className={`${fieldClass} h-9 text-sm`} value={draft.template} onChange={(event) => setDraft({ ...draft, template: event.target.value })}>
              <option value="">Une page vide</option>
              {templates.map((template) => <option key={template.id} value={template.id}>Modèle : {template.name}</option>)}
            </select>
          </Field>
          {error && <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => setCreating(false)}>Annuler</Button>
          <Button type="button" disabled={busy === "create" || (draft.place === "campagne" && !draft.campaignId)} onClick={() => void create()}>{busy === "create" ? <LoaderCircle className="animate-spin" /> : <FilePlus2 />}Créer et ouvrir l’atelier</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {picker && <FolderPickerDialog
      open
      title={picker.keys.length > 1 ? `Ranger ${picker.keys.length} pages dans…` : "Ranger dans…"}
      description="Le dossier ne change que l’Index des pages : l’adresse et le menu de la page restent les mêmes."
      folders={folders}
      current={picker.current}
      onPick={(folder) => placePages(picker.keys, folder)}
      onCreate={(name, parent) => createFolder(parent, name, false)}
      onClose={() => setPicker(null)}
    />}

    <Dialog open={Boolean(confirm)} onOpenChange={(next) => { if (!next) setConfirm(null) }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">{confirm?.kind === "delete-page" ? `Supprimer « ${confirm.name} » pour de bon ?` : confirm?.kind === "delete-folder" ? `Supprimer le dossier « ${confirm.folder.name} » ?` : `Supprimer le modèle « ${confirm?.name} » ?`}</DialogTitle>
          <DialogDescription>{confirm?.kind === "delete-page" ? "La page, ses carnets et ses révélations disparaissent du serveur partagé. Rien ne pourra la restaurer." : confirm?.kind === "delete-folder" ? `Aucune page n’est supprimée : ses pages et ses sous-dossiers remontent dans « ${confirm.folder.parent ? folders.folders.find((folder) => folder.id === confirm.folder.parent)?.name ?? "son parent" : "Pages"} ».` : "Les pages déjà créées depuis ce modèle ne changent pas."}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => setConfirm(null)}>Annuler</Button>
          <Button type="button" variant="destructive" onClick={() => {
            const target = confirm
            setConfirm(null)
            if (!target) return
            if (target.kind === "delete-folder") { if (view === target.folder.id) go(target.folder.parent || "racine"); void saveFolders([{ op: "delete", id: target.folder.id }]) }
            else if (target.kind === "delete-template") void deleteTemplate(target.id)
            else { const page = all.find((item) => item.id === target.id); if (page) void act(page, "delete") }
          }}><Trash2 />{confirm?.kind === "delete-folder" ? "Supprimer le dossier" : "Supprimer"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
}
