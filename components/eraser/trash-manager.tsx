"use client"

import { useState } from "react"
import { CircleUserRound, ListTodo, Map, RotateCcw, Trash2 } from "lucide-react"

import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"

type TrashItem = { id: string; name?: string; content?: string; deletedAt?: string | null }
type Kind = "todo" | "character" | "campaign"

export function TrashManager({ initial }: { initial: Record<"todos" | "characters" | "campaigns", TrashItem[]> }) {
  const [items, setItems] = useState(initial)

  async function act(operation: "restore" | "delete", kind: Kind, id: string) {
    const response = await fetch("/api/admin/trash", {
      method: operation === "restore" ? "PATCH" : "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind, id }),
    })
    if (!response.ok) return
    const key = kind === "todo" ? "todos" : kind === "character" ? "characters" : "campaigns"
    setItems((current) => ({ ...current, [key]: current[key].filter((item) => item.id !== id) }))
  }

  const sections = [
    { key: "todos" as const, kind: "todo" as const, title: "To-do", icon: ListTodo },
    { key: "characters" as const, kind: "character" as const, title: "Personnages", icon: CircleUserRound },
    { key: "campaigns" as const, kind: "campaign" as const, title: "Campagnes", icon: Map },
  ]

  return (
    <div className="w-full flex-1 px-5 py-9 sm:px-8 md:py-14">
      <div className="mb-5 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-primary/75"><span className="h-px w-7 bg-primary/50" />Administration</div>
      <h1 className="font-display text-4xl font-semibold sm:text-5xl">Corbeille</h1>
      <p className="mt-3 max-w-2xl text-muted-foreground">Restaure un élément ou supprime-le définitivement de la base et de Google Sheets.</p>

      <div className="mt-10 space-y-6">
        {sections.map((section) => (
          <section key={section.key} className="rounded-2xl border bg-card/90 p-5 sm:p-7">
            <h2 className="flex items-center gap-2 font-display text-2xl font-semibold"><section.icon className="size-5 text-primary" />{section.title}</h2>
            <div className="mt-4 divide-y">
              {items[section.key].length ? items[section.key].map((item) => (
                <div key={item.id} className="flex items-center gap-3 py-3">
                  <div className="min-w-0 flex-1"><p className="truncate font-medium">{item.name || item.content || "Sans nom"}</p>{item.deletedAt && <p className="text-xs text-muted-foreground">Supprimé le {new Date(item.deletedAt).toLocaleString("fr-FR")}</p>}</div>
                  <Button variant="outline" size="sm" onClick={() => act("restore", section.kind, item.id)}><RotateCcw />Restaurer</Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild><Button variant="destructive" size="sm"><Trash2 />Supprimer</Button></AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader><AlertDialogTitle>Supprimer définitivement ?</AlertDialogTitle><AlertDialogDescription>Cette action effacera également la ligne correspondante dans Google Sheets. Elle ne pourra pas être annulée depuis Eraser.</AlertDialogDescription></AlertDialogHeader>
                      <AlertDialogFooter><AlertDialogCancel>Annuler</AlertDialogCancel><AlertDialogAction variant="destructive" onClick={() => act("delete", section.kind, item.id)}>Supprimer définitivement</AlertDialogAction></AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              )) : <p className="py-6 text-center text-sm text-muted-foreground">Aucun élément supprimé.</p>}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}
