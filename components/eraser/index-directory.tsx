"use client"

import { useState, type DragEvent, type ReactNode } from "react"
import Link from "next/link"
import { Check, ChevronDown, Folder, FolderPlus, GripVertical, Pencil, Star, Trash2, X } from "lucide-react"

import { useShellData } from "@/components/eraser/app-shell"
import { useIndexDirectoryLayout, useIndexEntries, useIndexStars, type IndexEntry, type IndexStar } from "@/components/eraser/index-entries"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { FOLDER_PREFIX, type IndexDirectoryLayout } from "@/lib/index-directory"
import { cn } from "@/lib/utils"

export { indexPageIcons } from "@/components/eraser/index-entries"

const starLook: Record<IndexStar, { className: string; title: string }> = {
  none: { className: "text-muted-foreground/60 hover:text-[#c9a227]", title: "Sans étoile : seulement ici. Clic : l’étoiler (section Index du menu) · clic droit : étoile rouge (directement dans le menu)" },
  star: { className: "text-[#c9a227]", title: "Étoilé : dans la section Index du menu. Clic : retirer l’étoile · clic droit : étoile rouge (directement dans le menu)" },
  red: { className: "text-[#c0392b]", title: "Étoile rouge : directement dans le menu. Clic : retirer l’étoile · clic droit : étoile simple" },
}

type Destination = { folder: string | null; before?: string }

/** Range `key` à sa nouvelle place (avant `before`, sinon à la fin), dans un dossier ou à la racine. */
function moved(layout: IndexDirectoryLayout, key: string, destination: Destination): IndexDirectoryLayout {
  if (destination.before === key) return layout
  // Un dossier ne va jamais dans un dossier.
  const folder = key.startsWith(FOLDER_PREFIX) ? null : destination.folder
  const without = { root: layout.root.filter((item) => item !== key), folders: layout.folders.map((entry) => ({ ...entry, items: entry.items.filter((item) => item !== key) })) }
  const insert = (items: string[]) => {
    const at = destination.before ? items.indexOf(destination.before) : -1
    return at >= 0 ? [...items.slice(0, at), key, ...items.slice(at)] : [...items, key]
  }
  if (folder) return { ...without, folders: without.folders.map((entry) => entry.id === folder ? { ...entry, items: insert(entry.items) } : entry) }
  return { ...without, root: insert(without.root) }
}

function IndexCard({ entry, star, onStar, draggable, dragging, onDragStart, onDragEnd, onDropBefore }: {
  entry: IndexEntry
  star: IndexStar
  onStar: (star: IndexStar) => void
  draggable: boolean
  dragging: boolean
  onDragStart: () => void
  onDragEnd: () => void
  onDropBefore: (() => void) | null
}) {
  const Icon = entry.icon
  const [over, setOver] = useState(false)
  const look = starLook[star]
  return (
    <div
      className={cn("group relative rounded-[1.35rem] transition", dragging && "opacity-40", over && "ring-2 ring-primary/50 ring-offset-2 ring-offset-background")}
      draggable={draggable}
      onDragStart={(event) => { event.stopPropagation(); event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", entry.key); onDragStart() }}
      onDragEnd={onDragEnd}
      onDragOver={onDropBefore ? (event) => { event.preventDefault(); event.stopPropagation(); setOver(true) } : undefined}
      onDragLeave={() => setOver(false)}
      onDrop={onDropBefore ? (event) => { event.preventDefault(); event.stopPropagation(); setOver(false); onDropBefore() } : undefined}
    >
      <Link
        href={entry.href}
        prefetch={false}
        draggable={false}
        className="flex min-h-full flex-col items-center overflow-hidden rounded-[1.35rem] border bg-card/90 px-4 pb-5 pt-6 text-center shadow-[0_12px_35px_rgb(67_50_31/0.07)] transition hover:-translate-y-1 hover:border-primary/35 hover:shadow-[0_18px_45px_rgb(67_50_31/0.13)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <div className="flex size-16 items-center justify-center rounded-2xl border border-primary/20 bg-primary/8 text-primary transition duration-500 group-hover:scale-[1.06]">
          <Icon className="size-7" />
        </div>
        <h3 className="mt-4 font-display text-xl font-semibold leading-tight tracking-[-0.01em]">{entry.label}</h3>
        <p className="mt-1.5 text-xs leading-5 text-muted-foreground">{entry.description}</p>
      </Link>
      {draggable && <GripVertical className="pointer-events-none absolute left-2.5 top-3 size-4 text-muted-foreground/0 transition group-hover:text-muted-foreground/50" aria-hidden />}
      <button
        type="button"
        onClick={() => onStar(star === "none" ? "star" : "none")}
        onContextMenu={(event) => { event.preventDefault(); onStar(star === "red" ? "star" : "red") }}
        aria-pressed={star !== "none"}
        aria-label={`${entry.label} : ${star === "red" ? "étoile rouge" : star === "star" ? "étoilé" : "sans étoile"}`}
        title={look.title}
        className={cn("absolute right-2.5 top-2.5 flex size-8 items-center justify-center rounded-full transition hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", look.className)}
      >
        <Star className="size-4.5" fill={star === "none" ? "none" : "currentColor"} />
      </button>
    </div>
  )
}

function FolderBlock({ id, name, count, editable, children, onRename, onDelete, onDropInto, dragging, onDragStart, onDragEnd }: {
  id: string
  name: string
  count: number
  editable: boolean
  children: ReactNode
  onRename: (name: string) => void
  onDelete: () => void
  onDropInto: (() => void) | null
  dragging: boolean
  onDragStart: () => void
  onDragEnd: () => void
}) {
  const [open, setOpen] = useState(true)
  const [over, setOver] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [draft, setDraft] = useState(name)
  const dropProps = onDropInto ? {
    onDragOver: (event: DragEvent) => { event.preventDefault(); event.stopPropagation(); setOver(true) },
    onDragLeave: () => setOver(false),
    onDrop: (event: DragEvent) => { event.preventDefault(); event.stopPropagation(); setOver(false); setOpen(true); onDropInto() },
  } : {}
  return (
    <section aria-labelledby={`dossier-${id}`} className={cn("col-span-full rounded-[1.5rem] border border-dashed bg-card/40 p-4 transition", over && "border-primary/60 bg-primary/5", dragging && "opacity-40")} {...dropProps}>
      {/* L'en-tête se glisse pour changer le dossier de place. */}
      <div className={cn("flex items-center gap-2", editable && "cursor-grab active:cursor-grabbing")} draggable={editable && !renaming} onDragStart={(event) => { event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", `${FOLDER_PREFIX}${id}`); onDragStart() }} onDragEnd={onDragEnd}>
        <button type="button" onClick={() => setOpen((current) => !current)} className="flex min-w-0 flex-1 items-center gap-2 text-left" aria-expanded={open}>
          <Folder className="size-5 shrink-0 text-primary" />
          {renaming ? null : <h3 id={`dossier-${id}`} className="truncate font-display text-2xl font-semibold">{name}</h3>}
          {!renaming && <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">{count}</span>}
          {!renaming && <ChevronDown className={cn("size-4 text-muted-foreground transition-transform", !open && "-rotate-90")} />}
        </button>
        {renaming && <form className="flex flex-1 items-center gap-1" onSubmit={(event) => { event.preventDefault(); if (draft.trim()) onRename(draft.trim()); setRenaming(false) }}>
          <Input autoFocus value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={60} className="h-9 max-w-xs" onKeyDown={(event) => { if (event.key === "Escape") { setDraft(name); setRenaming(false) } }} />
          <Button type="submit" size="icon-sm" variant="ghost" aria-label="Enregistrer le nom"><Check /></Button>
          <Button type="button" size="icon-sm" variant="ghost" aria-label="Annuler" onClick={() => { setDraft(name); setRenaming(false) }}><X /></Button>
        </form>}
        {editable && !renaming && <>
          <Button type="button" size="icon-sm" variant="ghost" onClick={() => { setDraft(name); setRenaming(true) }} aria-label={`Renommer le dossier ${name}`} title="Renommer"><Pencil /></Button>
          <Button type="button" size="icon-sm" variant="ghost" className="text-destructive/75" onClick={onDelete} aria-label={`Supprimer le dossier ${name}`} title="Supprimer le dossier (ses index reviennent à la racine)"><Trash2 /></Button>
        </>}
      </div>
      {open && <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {children}
        {!count && <p className="col-span-full rounded-xl border border-dashed px-4 py-6 text-center text-xs text-muted-foreground">{editable ? "Glisse un index ici pour le ranger dans ce dossier." : "Ce dossier est vide."}</p>}
      </div>}
    </section>
  )
}

/**
 * La page Index : tous les index au même endroit (ceux d'Eraser, ceux créés, le créateur
 * de classe). L'étoile met un index dans la section Index du menu ; l'étoile rouge (clic
 * droit) le met directement dans le menu. Les MJ et administrateurs rangent les index en
 * dossiers et dans l'ordre voulu, par glisser-déposer : le rangement est le même pour tous.
 */
export function IndexDirectory() {
  const { viewRole } = useShellData()
  const editable = viewRole === "admin" || viewRole === "mj"
  const entries = useIndexEntries()
  const { starOf, setStar } = useIndexStars()
  const { layout, save, error } = useIndexDirectoryLayout(entries)
  const [dragged, setDragged] = useState<string | null>(null)
  const [rootOver, setRootOver] = useState(false)
  const [naming, setNaming] = useState<string | null>(null)
  const byKey = new Map(entries.map((entry) => [entry.key, entry]))

  const drop = (destination: Destination) => {
    if (!dragged) return
    void save(moved(layout, dragged, destination))
    setDragged(null)
  }
  const card = (key: string, folder: string | null) => {
    const entry = byKey.get(key)
    if (!entry) return null
    return <IndexCard
      key={key}
      entry={entry}
      star={starOf(key)}
      onStar={(star) => setStar(key, star)}
      draggable={editable}
      dragging={dragged === key}
      onDragStart={() => setDragged(key)}
      onDragEnd={() => setDragged(null)}
      onDropBefore={editable && dragged && dragged !== key ? () => drop({ folder, before: key }) : null}
    />
  }
  function createFolder(name: string) {
    const id = Math.random().toString(36).slice(2, 10)
    void save({ root: [`${FOLDER_PREFIX}${id}`, ...layout.root], folders: [...layout.folders, { id, name, items: [] }] })
  }

  return (
    <div className="mt-10 space-y-5">
      {editable && <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">Glisse les cartes pour les ranger ou les mettre dans un dossier. Clic sur l’étoile : section Index du menu · clic droit : étoile rouge, directement dans le menu.</p>
        {naming === null
          ? <Button type="button" variant="outline" onClick={() => setNaming("")}><FolderPlus />Nouveau dossier</Button>
          : <form className="flex items-center gap-1" onSubmit={(event) => { event.preventDefault(); if (naming.trim()) createFolder(naming.trim()); setNaming(null) }}>
              <Input autoFocus value={naming} onChange={(event) => setNaming(event.target.value)} maxLength={60} placeholder="Nom du dossier" className="h-9 w-56" onKeyDown={(event) => { if (event.key === "Escape") setNaming(null) }} />
              <Button type="submit" size="icon-sm" variant="ghost" aria-label="Créer le dossier" disabled={!naming.trim()}><Check /></Button>
              <Button type="button" size="icon-sm" variant="ghost" aria-label="Annuler" onClick={() => setNaming(null)}><X /></Button>
            </form>}
      </div>}
      {error && <p className="rounded-xl border border-destructive/25 bg-destructive/5 px-4 py-2.5 text-sm text-destructive">{error}</p>}
      <div
        className={cn("grid gap-4 rounded-[1.6rem] p-1 transition sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5", rootOver && "bg-primary/5")}
        onDragOver={editable && dragged ? (event) => { event.preventDefault(); setRootOver(true) } : undefined}
        onDragLeave={() => setRootOver(false)}
        onDrop={editable && dragged ? (event) => { event.preventDefault(); setRootOver(false); drop({ folder: null }) } : undefined}
      >
        {layout.root.map((key) => {
          if (!key.startsWith(FOLDER_PREFIX)) return card(key, null)
          const folder = layout.folders.find((candidate) => `${FOLDER_PREFIX}${candidate.id}` === key)
          if (!folder) return null
          return <FolderBlock
            key={key}
            id={folder.id}
            name={folder.name}
            count={folder.items.filter((item) => byKey.has(item)).length}
            editable={editable}
            dragging={dragged === key}
            onRename={(name) => void save({ ...layout, folders: layout.folders.map((candidate) => candidate.id === folder.id ? { ...candidate, name } : candidate) })}
            onDelete={() => {
              // Ses index reviennent à la racine, à la place du dossier.
              const at = layout.root.indexOf(key)
              void save({ root: [...layout.root.slice(0, at), ...folder.items, ...layout.root.slice(at + 1)], folders: layout.folders.filter((candidate) => candidate.id !== folder.id) })
            }}
            onDragStart={() => setDragged(key)}
            onDragEnd={() => setDragged(null)}
            // Un index déposé sur un dossier y entre ; un dossier déposé sur un autre se range avant lui.
            onDropInto={editable && dragged && dragged !== key ? () => drop(dragged.startsWith(FOLDER_PREFIX) ? { folder: null, before: key } : { folder: folder.id }) : null}
          >
            {folder.items.map((item) => card(item, folder.id))}
          </FolderBlock>
        })}
      </div>
    </div>
  )
}
