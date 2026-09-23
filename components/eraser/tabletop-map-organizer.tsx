"use client"

import { useMemo, useState } from "react"
import { Check, Folder, FolderOpen, GripVertical, Map as MapIcon, Pencil, Plus, Trash2, X } from "lucide-react"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import type { TabletopFolderRecord, TabletopMapRecord } from "@/lib/tabletop-schema"
import { cn } from "@/lib/utils"

type Props = {
  activeMapId: string
  busy: boolean
  folders: TabletopFolderRecord[]
  maps: TabletopMapRecord[]
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreateFolder: (name: string) => Promise<boolean>
  onDeleteFolder: (folder: TabletopFolderRecord) => Promise<void>
  onMoveMap: (map: TabletopMapRecord, folder: TabletopFolderRecord) => Promise<void>
  onRenameFolder: (folder: TabletopFolderRecord, name: string) => Promise<boolean>
  onSelectMap: (mapId: string) => Promise<void>
}

function sameFolder(left: string, right: string) {
  return left.trim().toLocaleLowerCase("fr") === right.trim().toLocaleLowerCase("fr")
}

export function TabletopMapOrganizer({
  activeMapId,
  busy,
  folders,
  maps,
  open,
  onOpenChange,
  onCreateFolder,
  onDeleteFolder,
  onMoveMap,
  onRenameFolder,
  onSelectMap,
}: Props) {
  const [newFolder, setNewFolder] = useState("")
  const [editingId, setEditingId] = useState("")
  const [editingName, setEditingName] = useState("")
  const [draggedMapId, setDraggedMapId] = useState("")
  const [dropFolderId, setDropFolderId] = useState("")
  const sortedMaps = useMemo(() => [...maps].sort((left, right) => left.name.localeCompare(right.name, "fr")), [maps])

  async function createFolder() {
    if (!newFolder.trim()) return
    if (await onCreateFolder(newFolder)) setNewFolder("")
  }

  async function renameFolder(folder: TabletopFolderRecord) {
    if (!editingName.trim()) return
    if (await onRenameFolder(folder, editingName)) {
      setEditingId("")
      setEditingName("")
    }
  }

  async function dropMap(folder: TabletopFolderRecord, mapId = draggedMapId) {
    if (busy) return
    const map = maps.find((candidate) => candidate.id === mapId)
    setDropFolderId("")
    setDraggedMapId("")
    if (!map || sameFolder(map.folder || "Sans dossier", folder.name)) return
    await onMoveMap(map, folder)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="grid max-h-[90svh] grid-rows-[auto_auto_minmax(0,1fr)] overflow-hidden p-0 sm:max-w-4xl">
        <DialogHeader className="border-b px-5 pb-4 pt-5">
          <DialogTitle>Cartes et dossiers</DialogTitle>
          <DialogDescription>Fais glisser une carte sur un dossier pour la ranger. Les dossiers vides restent disponibles.</DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2 border-b bg-muted/20 px-5 py-3">
          <Input
            value={newFolder}
            onChange={(event) => setNewFolder(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault()
                void createFolder()
              }
            }}
            placeholder="Nom du nouveau dossier"
            maxLength={80}
          />
          <Button type="button" onClick={() => void createFolder()} disabled={busy || !newFolder.trim()}>
            <Plus />Créer
          </Button>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4 sm:p-5">
          {folders.map((folder) => {
            const folderMaps = sortedMaps.filter((map) => sameFolder(map.folder || "Sans dossier", folder.name))
            const unfiled = folder.id === "__unfiled__"
            const editing = editingId === folder.id
            return (
              <section
                key={folder.id}
                className={cn(
                  "rounded-2xl border bg-card/65 transition",
                  dropFolderId === folder.id && "border-primary bg-primary/8 ring-2 ring-primary/20",
                )}
                onDragEnter={(event) => {
                  event.preventDefault()
                  setDropFolderId(folder.id)
                }}
                onDragOver={(event) => event.preventDefault()}
                onDragLeave={(event) => {
                  if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropFolderId("")
                }}
                onDrop={(event) => {
                  event.preventDefault()
                  void dropMap(folder, event.dataTransfer.getData("text/plain") || draggedMapId)
                }}
              >
                <header className="flex min-h-12 items-center gap-2 border-b px-3 py-2">
                  {folderMaps.length ? <FolderOpen className="size-4 text-primary" /> : <Folder className="size-4 text-muted-foreground" />}
                  {editing ? (
                    <div className="flex min-w-0 flex-1 items-center gap-1.5">
                      <Input
                        autoFocus
                        value={editingName}
                        onChange={(event) => setEditingName(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") void renameFolder(folder)
                          if (event.key === "Escape") setEditingId("")
                        }}
                        // Cliquer ailleurs renomme aussi, sans Entrée.
                        onBlur={() => { if (editingId === folder.id) void renameFolder(folder) }}
                        className="h-8"
                        maxLength={80}
                      />
                          <Button type="button" size="icon-sm" variant="ghost" disabled={busy} onClick={() => void renameFolder(folder)} aria-label="Enregistrer le nom"><Check /></Button>
                      <Button type="button" size="icon-sm" variant="ghost" onClick={() => setEditingId("")} aria-label="Annuler"><X /></Button>
                    </div>
                  ) : (
                    <>
                      <h3 className="min-w-0 flex-1 truncate font-display font-semibold">{folder.name}</h3>
                      <span className="text-xs tabular-nums text-muted-foreground">{folderMaps.length}</span>
                      {!unfiled && (
                        <>
                          <Button
                            type="button"
                            size="icon-sm"
                            variant="ghost"
                            disabled={busy}
                            onClick={() => {
                              setEditingId(folder.id)
                              setEditingName(folder.name)
                            }}
                            aria-label={`Renommer ${folder.name}`}
                          >
                            <Pencil />
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button type="button" size="icon-sm" variant="ghost" disabled={busy} className="text-destructive" aria-label={`Supprimer ${folder.name}`}><Trash2 /></Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Supprimer « {folder.name} » ?</AlertDialogTitle>
                                <AlertDialogDescription>Les cartes du dossier ne seront pas supprimées : elles passeront dans « Sans dossier ».</AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Annuler</AlertDialogCancel>
                                <AlertDialogAction variant="destructive" onClick={() => void onDeleteFolder(folder)}>Supprimer le dossier</AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </>
                      )}
                    </>
                  )}
                </header>

                <div className="grid gap-2 p-2.5 sm:grid-cols-2">
                  {folderMaps.map((map) => (
                    <div
                      key={map.id}
                      draggable={!busy}
                      onDragStart={(event) => {
                        if (busy) {
                          event.preventDefault()
                          return
                        }
                        setDraggedMapId(map.id)
                        event.dataTransfer.effectAllowed = "move"
                        event.dataTransfer.setData("text/plain", map.id)
                      }}
                      onDragEnd={() => {
                        setDraggedMapId("")
                        setDropFolderId("")
                      }}
                      className={cn(
                        "group grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-2 rounded-xl border bg-background/60 p-2 hover:border-primary/40 hover:bg-primary/5",
                        map.id === activeMapId && "border-primary/55 bg-primary/8",
                        map.id === draggedMapId && "opacity-45",
                      )}
                    >
                      <GripVertical className="size-4 shrink-0 cursor-grab text-muted-foreground" />
                      <button
                        type="button"
                        disabled={busy}
                        onClick={async () => {
                          await onSelectMap(map.id)
                          onOpenChange(false)
                        }}
                        className="flex min-w-0 items-center gap-2 text-left"
                      >
                        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"><MapIcon className="size-4" /></span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold">{map.name}</span>
                          <span className="block truncate text-[11px] text-muted-foreground">{map.backgroundUrl ? "Image prête" : "Sans image"}</span>
                        </span>
                      </button>
                      <span className="col-start-2 min-w-0">
                        <NativeSelect
                          disabled={busy}
                          value={folder.id}
                          onChange={(event) => {
                            const target = folders.find((candidate) => candidate.id === event.target.value)
                            if (target && target.id !== folder.id) void onMoveMap(map, target)
                          }}
                          onDragStart={(event) => event.preventDefault()}
                          className="h-8 w-full text-xs"
                          aria-label={`Dossier de ${map.name}`}
                        >
                          {folders.map((candidate) => <NativeSelectOption key={candidate.id} value={candidate.id}>{candidate.name}</NativeSelectOption>)}
                        </NativeSelect>
                      </span>
                    </div>
                  ))}
                  {!folderMaps.length && <p className="py-4 text-center text-xs text-muted-foreground sm:col-span-2">Dépose une carte ici.</p>}
                </div>
              </section>
            )
          })}
        </div>
      </DialogContent>
    </Dialog>
  )
}
