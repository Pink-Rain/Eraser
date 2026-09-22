"use client"

import { useMemo, useState, type Dispatch, type FormEvent, type ReactNode, type SetStateAction } from "react"
import { AlertTriangle, ArrowDown, Check, Minus, Pencil, Plus, Trash2, X } from "lucide-react"

import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { RichTextField, RichTextView } from "@/components/eraser/rich-text"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import type { AdminTodoRecord } from "@/lib/google-sheets"

const priorityIcons = { haute: AlertTriangle, moyenne: Minus, basse: ArrowDown }
const emptyForm = { name: "", content: "", priority: "moyenne" as const, label: "", labelColor: "#927640" }

export function AdminTodoMenu({ todos, onTodosChange, viewControls }: { todos: AdminTodoRecord[]; onTodosChange: Dispatch<SetStateAction<AdminTodoRecord[]>>; viewControls: ReactNode }) {
  const [form, setForm] = useState<{ name: string; content: string; priority: AdminTodoRecord["priority"]; label: string; labelColor: string }>(emptyForm)
  const [formOpen, setFormOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState("")
  const [statusFilter, setStatusFilter] = useState("todo")
  const [labelFilter, setLabelFilter] = useState("all")
  const [sortMode, setSortMode] = useState("updated")
  const labels = useMemo(() => [...new Set(todos.map((todo) => todo.label).filter(Boolean))].sort((left, right) => left.localeCompare(right, "fr")), [todos])
  const visibleTodos = useMemo(() => {
    const priorityRank = { haute: 0, moyenne: 1, basse: 2 }
    return todos
      .filter((todo) => statusFilter === "all" || (statusFilter === "done" ? todo.completed === "oui" : todo.completed !== "oui"))
      .filter((todo) => labelFilter === "all" || todo.label === labelFilter)
      .sort((left, right) => sortMode === "priority"
        ? priorityRank[left.priority] - priorityRank[right.priority] || right.updatedAt.localeCompare(left.updatedAt)
        : right.updatedAt.localeCompare(left.updatedAt))
  }, [labelFilter, sortMode, statusFilter, todos])

  function closeForm() {
    setFormOpen(false)
    setEditingId(null)
    setForm(emptyForm)
    setError("")
  }

  function edit(todo: AdminTodoRecord) {
    setEditingId(todo.id)
    setForm({ name: todo.name, content: todo.content, priority: todo.priority, label: todo.label, labelColor: todo.labelColor })
    setFormOpen(true)
  }

  async function save(event: FormEvent) {
    event.preventDefault()
    setPending(true)
    setError("")
    const response = await fetch("/api/admin/todos", {
      method: editingId ? "PATCH" : "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(editingId ? { id: editingId, patch: form } : form),
    })
    const payload = (await response.json()) as { todo?: AdminTodoRecord; error?: string }
    setPending(false)
    if (!response.ok || !payload.todo) return setError(payload.error || "Enregistrement impossible.")
    onTodosChange((current) => editingId
      ? current.map((todo) => todo.id === editingId ? payload.todo! : todo)
      : [...current, payload.todo!])
    closeForm()
  }

  async function toggle(todo: AdminTodoRecord) {
    const completed = todo.completed === "oui" ? "non" : "oui"
    onTodosChange((current) => current.map((item) => item.id === todo.id ? { ...item, completed } : item))
    const response = await fetch("/api/admin/todos", {
      method: "PATCH", headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: todo.id, patch: { completed } }),
    })
    const payload = (await response.json()) as { todo?: AdminTodoRecord }
    if (payload.todo) onTodosChange((current) => current.map((item) => item.id === todo.id ? payload.todo! : item))
    else onTodosChange((current) => current.map((item) => item.id === todo.id ? todo : item))
  }

  async function remove(id: string) {
    const response = await fetch(`/api/admin/todos?id=${encodeURIComponent(id)}`, { method: "DELETE" })
    if (response.ok) onTodosChange((current) => current.filter((todo) => todo.id !== id))
  }

  return (
    <>
      <div className="flex items-center gap-2 px-2 py-1.5 text-sm font-medium">
        <span>Mes to-do</span>
        <Button type="button" variant="ghost" size="icon" className="ml-auto size-7" onClick={(event) => { event.stopPropagation(); setFormOpen((open) => !open) }} aria-label="Créer une to-do">
          {formOpen ? <X /> : <Plus />}
        </Button>
        {viewControls}
      </div>
      {formOpen && (
        <form onSubmit={save} className="mx-1 mb-2 grid gap-2 rounded-lg border bg-background/70 p-3" onClick={(event) => event.stopPropagation()}>
          <Input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Nom (facultatif)" />
          <RichTextField value={form.content} onCommit={(html) => setForm({ ...form, content: html })} placeholder="Contenu de la to-do" minHeight="min-h-20" />
          <div className="grid grid-cols-2 gap-2">
            <NativeSelect className="w-full" value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value as AdminTodoRecord["priority"] })} aria-label="Priorité">
              <NativeSelectOption value="haute">Priorité élevée</NativeSelectOption>
              <NativeSelectOption value="moyenne">Priorité moyenne</NativeSelectOption>
              <NativeSelectOption value="basse">Priorité basse</NativeSelectOption>
            </NativeSelect>
            <div className="flex gap-1">
              <Input value={form.label} onChange={(event) => setForm({ ...form, label: event.target.value })} placeholder="Étiquette" />
              <Label className="sr-only" htmlFor="todo-color">Couleur</Label>
              <Input id="todo-color" type="color" value={form.labelColor} onChange={(event) => setForm({ ...form, labelColor: event.target.value })} className="w-10 px-1" />
            </div>
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <Button type="submit" size="sm" disabled={pending}>{editingId ? "Enregistrer" : "Ajouter"}</Button>
        </form>
      )}
      <div className="grid grid-cols-3 gap-1 border-y px-2 py-2" onClick={(event) => event.stopPropagation()}>
        <NativeSelect value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="h-8 text-xs" aria-label="État des to-do">
          <NativeSelectOption value="todo">À faire</NativeSelectOption><NativeSelectOption value="done">Terminées</NativeSelectOption><NativeSelectOption value="all">Toutes</NativeSelectOption>
        </NativeSelect>
        <NativeSelect value={labelFilter} onChange={(event) => setLabelFilter(event.target.value)} className="h-8 text-xs" aria-label="Étiquette des to-do">
          <NativeSelectOption value="all">Toutes les étiquettes</NativeSelectOption>{labels.map((label) => <NativeSelectOption key={label} value={label}>{label}</NativeSelectOption>)}
        </NativeSelect>
        <NativeSelect value={sortMode} onChange={(event) => setSortMode(event.target.value)} className="h-8 text-xs" aria-label="Tri des to-do">
          <NativeSelectOption value="updated">Plus récentes</NativeSelectOption><NativeSelectOption value="priority">Par priorité</NativeSelectOption>
        </NativeSelect>
      </div>
      <div className="max-h-80 overflow-y-auto px-1 pb-1">
        {visibleTodos.length ? visibleTodos.map((todo) => {
          const PriorityIcon = priorityIcons[todo.priority]
          const title = todo.name || todo.content
          return (
            <div key={todo.id} className="group flex items-start gap-2 rounded-md px-2 py-2 hover:bg-accent">
              <button type="button" onClick={() => toggle(todo)} className={`mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md border ${todo.completed === "oui" ? "bg-primary text-primary-foreground" : "bg-background"}`} aria-label={todo.completed === "oui" ? "Marquer comme à faire" : "Valider la to-do"}>
                {todo.completed === "oui" ? <Check className="size-3.5" /> : <PriorityIcon className="size-3.5" />}
              </button>
              <div className="min-w-0 flex-1">
                <p className={`text-sm font-medium ${todo.completed === "oui" ? "line-through opacity-60" : ""}`}>{title}</p>
                {todo.name && <RichTextView html={todo.content} className="line-clamp-2 text-xs text-muted-foreground" />}
                <div className="mt-1 flex flex-wrap gap-1">
                  {todo.label && <span className="rounded-full px-2 py-0.5 text-[10px] text-white" style={{ backgroundColor: todo.labelColor }}>{todo.label}</span>}
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[10px]">{todo.creatorName}</span>
                </div>
              </div>
              <Button type="button" variant="ghost" size="icon-xs" onClick={() => edit(todo)} aria-label="Modifier"><Pencil /></Button>
              <AlertDialog>
                <AlertDialogTrigger asChild><Button type="button" variant="ghost" size="icon-xs" aria-label="Supprimer"><Trash2 /></Button></AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader><AlertDialogTitle>Mettre cette to-do à la corbeille ?</AlertDialogTitle><AlertDialogDescription>Elle pourra être restaurée par un administrateur.</AlertDialogDescription></AlertDialogHeader>
                  <AlertDialogFooter><AlertDialogCancel>Annuler</AlertDialogCancel><AlertDialogAction variant="destructive" onClick={() => remove(todo.id)}>Mettre à la corbeille</AlertDialogAction></AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          )
        }) : <p className="px-3 py-6 text-center text-sm text-muted-foreground">Aucune to-do pour ces filtres.</p>}
      </div>
    </>
  )
}
