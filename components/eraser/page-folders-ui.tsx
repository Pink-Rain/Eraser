"use client"

import { useMemo, useState, type DragEvent, type ReactNode } from "react"
import { Check, ChevronRight, Folder, FolderInput, FolderOpen, FolderPlus, MoreHorizontal, PenLine, Search, Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { childFolders, flattenFolders, folderAndDescendants, folderPathLabel, type PageFolder, type PageFolders } from "@/lib/page-folders"

/**
 * Les dossiers du créateur de pages à l'écran : l'arbre de l'explorateur (déplier, glisser des
 * pages ou des dossiers dessus, renommer sur place) et la fenêtre « Ranger dans… ».
 */

/** Ce qu'on glisse : des pages (leurs clés) ou un dossier. */
export const DRAG_PAGES = "application/x-eraser-pages"
export const DRAG_FOLDER = "application/x-eraser-folder"

export function dragKind(event: DragEvent) {
  const types = [...event.dataTransfer.types]
  return types.includes(DRAG_PAGES) ? "pages" : types.includes(DRAG_FOLDER) ? "folder" : null
}

/** Les gestes d'un endroit où l'on dépose (un dossier, la racine) : `target` "" pour la racine. */
export function useDropTarget(target: string, folders: PageFolders, handlers: { onPages: (keys: string[], folder: string) => void; onFolder: (id: string, parent: string) => void }) {
  const [over, setOver] = useState(false)
  return {
    over,
    props: {
      onDragOver: (event: DragEvent) => {
        if (!dragKind(event)) return
        event.preventDefault()
        event.dataTransfer.dropEffect = "move"
        if (!over) setOver(true)
      },
      onDragLeave: (event: DragEvent) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOver(false) },
      onDrop: (event: DragEvent) => {
        setOver(false)
        const kind = dragKind(event)
        if (!kind) return
        event.preventDefault()
        if (kind === "pages") {
          let keys: string[] = []
          try { keys = JSON.parse(event.dataTransfer.getData(DRAG_PAGES)) as string[] } catch { keys = [] }
          if (Array.isArray(keys) && keys.length) handlers.onPages(keys, target)
          return
        }
        const id = event.dataTransfer.getData(DRAG_FOLDER)
        // Jamais dans lui-même ni dans un de ses sous-dossiers.
        if (id && id !== target && !(target && folderAndDescendants(folders, id).has(target))) handlers.onFolder(id, target)
      },
    },
  }
}

export function FolderGlyph({ folder, open = false, className = "size-4" }: { folder?: Pick<PageFolder, "emoji">; open?: boolean; className?: string }) {
  if (folder?.emoji) return <span aria-hidden="true" className={`inline-flex items-center justify-center leading-none ${className}`}>{folder.emoji}</span>
  return open ? <FolderOpen className={className} /> : <Folder className={className} />
}

/** Un champ de renommage : Entrée garde, Échap annule, quitter le champ garde. */
export function RenameField({ value, onDone, className = "" }: { value: string; onDone: (name: string | null) => void; className?: string }) {
  const [draft, setDraft] = useState(value)
  return <input
    autoFocus
    value={draft}
    maxLength={80}
    aria-label="Nom du dossier"
    onFocus={(event) => event.currentTarget.select()}
    onChange={(event) => setDraft(event.target.value)}
    onKeyDown={(event) => {
      if (event.key === "Enter") { event.preventDefault(); onDone(draft.trim() || null) }
      if (event.key === "Escape") { event.preventDefault(); onDone(null) }
      event.stopPropagation()
    }}
    onBlur={() => onDone(draft.trim() || null)}
    onClick={(event) => event.stopPropagation()}
    className={`h-7 min-w-0 flex-1 rounded-md border border-ring bg-card px-1.5 text-[13px] outline-none ${className}`}
  />
}

type TreeHandlers = {
  onOpen: (id: string) => void
  onPages: (keys: string[], folder: string) => void
  onFolder: (id: string, parent: string) => void
  onCreate: (parent: string) => void
  onRename: (id: string, name: string) => void
  onDelete: (folder: PageFolder) => void
  onToggle: (id: string) => void
  setRenaming: (id: string) => void
}

function TreeRow({ folder, depth, folders, counts, view, expanded, renaming, handlers }: { folder: PageFolder; depth: number; folders: PageFolders; counts: Map<string, number>; view: string; expanded: Set<string>; renaming: string; handlers: TreeHandlers }) {
  const drop = useDropTarget(folder.id, folders, handlers)
  const children = childFolders(folders, folder.id)
  const open = expanded.has(folder.id)
  const active = view === folder.id
  return <li>
    <div
      {...drop.props}
      draggable={renaming !== folder.id}
      onDragStart={(event) => { event.dataTransfer.setData(DRAG_FOLDER, folder.id); event.dataTransfer.effectAllowed = "move" }}
      onDoubleClick={() => handlers.setRenaming(folder.id)}
      style={{ paddingLeft: `${0.35 + depth * 0.9}rem` }}
      className={`group flex h-8 items-center gap-1 rounded-lg pr-1 text-[13px] transition ${active ? "bg-foreground font-semibold text-background" : "hover:bg-muted"} ${drop.over ? "ring-2 ring-primary/60 ring-offset-1" : ""}`}
    >
      <button type="button" aria-label={open ? "Replier" : "Déplier"} aria-expanded={open} onClick={() => handlers.onToggle(folder.id)} className={`flex size-5 shrink-0 items-center justify-center rounded ${children.length ? "" : "invisible"}`}>
        <ChevronRight className={`size-3.5 transition-transform ${open ? "rotate-90" : ""}`} />
      </button>
      {renaming === folder.id
        ? <><FolderGlyph folder={folder} open className="size-4 shrink-0" /><RenameField value={folder.name} onDone={(name) => { handlers.setRenaming(""); if (name && name !== folder.name) handlers.onRename(folder.id, name) }} /></>
        : <button type="button" onClick={() => handlers.onOpen(folder.id)} className="flex min-w-0 flex-1 items-center gap-1.5 text-left">
          <FolderGlyph folder={folder} open={active || open} className={`size-4 shrink-0 ${active ? "" : "text-primary/80"}`} />
          <span className="min-w-0 flex-1 truncate">{folder.name}</span>
          <span className={`tabular-nums text-[11px] ${active ? "text-background/70" : "text-muted-foreground"}`}>{counts.get(folder.id) ?? 0}</span>
        </button>}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" aria-label={`Actions du dossier ${folder.name}`} className={`flex size-6 shrink-0 items-center justify-center rounded-md opacity-0 transition group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100 ${active ? "hover:bg-background/15" : "hover:bg-background"}`}><MoreHorizontal className="size-3.5" /></button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-52">
          <DropdownMenuItem onSelect={() => handlers.onCreate(folder.id)}><FolderPlus />Nouveau sous-dossier</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => handlers.setRenaming(folder.id)}><PenLine />Renommer</DropdownMenuItem>
          {folder.parent && <DropdownMenuItem onSelect={() => handlers.onFolder(folder.id, "")}><FolderInput />Remonter à la racine</DropdownMenuItem>}
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => handlers.onDelete(folder)}><Trash2 />Supprimer le dossier</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
    {open && children.length > 0 && <ul className="grid gap-px">
      {children.map((child) => <TreeRow key={child.id} folder={child} depth={depth + 1} folders={folders} counts={counts} view={view} expanded={expanded} renaming={renaming} handlers={handlers} />)}
    </ul>}
  </li>
}

/** L'arbre des dossiers (racine : `childFolders(folders, "")`). */
export function FolderTree({ folders, counts, view, expanded, renaming, handlers }: { folders: PageFolders; counts: Map<string, number>; view: string; expanded: Set<string>; renaming: string; handlers: TreeHandlers }) {
  return <ul className="grid gap-px">
    {childFolders(folders, "").map((folder) => <TreeRow key={folder.id} folder={folder} depth={0} folders={folders} counts={counts} view={view} expanded={expanded} renaming={renaming} handlers={handlers} />)}
  </ul>
}

/** Une entrée fixe de la colonne des dossiers (Toutes les pages, Corbeille…), éventuellement cible de dépôt. */
export function NavEntry({ active, icon, label, count, onClick, drop }: { active: boolean; icon: ReactNode; label: string; count?: number; onClick: () => void; drop?: { over: boolean; props: Record<string, unknown> } }) {
  return <button type="button" onClick={onClick} {...(drop?.props ?? {})} className={`flex h-8 w-full items-center gap-2 rounded-lg px-2 text-left text-[13px] transition ${active ? "bg-foreground font-semibold text-background" : "hover:bg-muted"} ${drop?.over ? "ring-2 ring-primary/60 ring-offset-1" : ""}`}>
    <span className={`flex size-4 shrink-0 items-center justify-center ${active ? "" : "text-muted-foreground"}`}>{icon}</span>
    <span className="min-w-0 flex-1 truncate">{label}</span>
    {count !== undefined && <span className={`tabular-nums text-[11px] ${active ? "text-background/70" : "text-muted-foreground"}`}>{count}</span>}
  </button>
}

const fold = (value: string) => value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()

/**
 * « Ranger dans… » : choisir un dossier (ou la racine), le chercher par son nom, en créer un
 * sur place. `current` : le dossier actuel (coché).
 */
export function FolderPickerDialog({ open, title, description, folders, current, onPick, onCreate, onClose }: {
  open: boolean
  title: string
  description?: string
  folders: PageFolders
  current: string | null
  onPick: (folder: string) => void
  /** Crée un dossier (nom, parent) et rend son identifiant. */
  onCreate: (name: string, parent: string) => string
  onClose: () => void
}) {
  const [query, setQuery] = useState("")
  const [chosen, setChosen] = useState<string | null>(current)
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState("")
  const rows = useMemo(() => {
    const words = fold(query).split(/\s+/).filter(Boolean)
    return flattenFolders(folders).filter(({ folder }) => !words.length || words.every((word) => fold(folderPathLabel(folders, folder.id)).includes(word)))
  }, [folders, query])
  const close = () => { setQuery(""); setCreating(false); setName(""); onClose() }
  return <Dialog open={open} onOpenChange={(next) => { if (!next) close() }}>
    <DialogContent className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle className="font-display text-xl">{title}</DialogTitle>
        {description && <DialogDescription>{description}</DialogDescription>}
      </DialogHeader>
      <label className="flex items-center gap-2 rounded-xl border bg-card px-3 focus-within:border-ring">
        <Search className="size-4 text-muted-foreground" />
        <input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Chercher un dossier…" aria-label="Chercher un dossier" className="h-9 min-w-0 flex-1 bg-transparent text-sm outline-none" />
      </label>
      <ul role="listbox" aria-label="Dossiers" className="grid max-h-[50vh] gap-px overflow-y-auto rounded-xl border bg-card p-1">
        {!query && <li><button type="button" role="option" aria-selected={chosen === ""} onClick={() => setChosen("")} onDoubleClick={() => { onPick(""); close() }} className="flex h-8 w-full items-center gap-2 rounded-lg px-2 text-left text-[13px] hover:bg-muted aria-selected:bg-foreground aria-selected:text-background">
          <FolderOpen className="size-4 shrink-0" /><span className="flex-1">Aucun dossier (non rangée)</span>{chosen === "" && <Check className="size-3.5" />}
        </button></li>}
        {rows.map(({ folder, depth }) => <li key={folder.id}><button type="button" role="option" aria-selected={chosen === folder.id} onClick={() => setChosen(folder.id)} onDoubleClick={() => { onPick(folder.id); close() }} style={{ paddingLeft: `${0.5 + (query ? 0 : depth * 0.9)}rem` }} className="flex h-8 w-full items-center gap-2 rounded-lg pr-2 text-left text-[13px] hover:bg-muted aria-selected:bg-foreground aria-selected:text-background">
          <FolderGlyph folder={folder} className="size-4 shrink-0" /><span className="min-w-0 flex-1 truncate">{query ? folderPathLabel(folders, folder.id) : folder.name}</span>{chosen === folder.id && <Check className="size-3.5" />}
        </button></li>)}
        {query && !rows.length && <li className="px-2 py-3 text-center text-[12.5px] text-muted-foreground">Aucun dossier de ce nom.</li>}
      </ul>
      {creating
        ? <form className="flex items-center gap-2" onSubmit={(event) => { event.preventDefault(); if (!name.trim()) return; const id = onCreate(name.trim(), chosen ?? ""); setChosen(id); setCreating(false); setName("") }}>
          <input autoFocus value={name} maxLength={80} onChange={(event) => setName(event.target.value)} placeholder={chosen ? `Dans « ${folderPathLabel(folders, chosen)} »` : "Nom du dossier"} aria-label="Nom du nouveau dossier" className="h-9 min-w-0 flex-1 rounded-xl border bg-card px-3 text-sm outline-none focus:border-ring" />
          <Button type="submit" size="sm">Créer</Button>
        </form>
        : <button type="button" onClick={() => setCreating(true)} className="inline-flex items-center gap-1.5 self-start rounded-lg px-1 text-[12.5px] text-muted-foreground hover:text-foreground"><FolderPlus className="size-3.5" />Nouveau dossier{chosen ? ` dans « ${folders.folders.find((folder) => folder.id === chosen)?.name ?? ""} »` : ""}</button>}
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={close}>Annuler</Button>
        <Button type="button" disabled={chosen === null} onClick={() => { if (chosen !== null) { onPick(chosen); close() } }}><FolderInput />Ranger ici</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
}
