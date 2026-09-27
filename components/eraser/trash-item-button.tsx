"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { LoaderCircle, Trash2 } from "lucide-react"

import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"

/**
 * Met un personnage ou une campagne à la corbeille depuis un index. Rien n'est
 * effacé de Google Sheets : l'élément se restaure depuis Administration → Corbeille.
 */
export function TrashItemButton({ kind, id, name }: { kind: "character" | "campaign"; id: string; name: string }) {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState("")
  const label = kind === "character" ? "ce personnage" : "cette campagne"

  async function trash() {
    setPending(true)
    setError("")
    try {
      const response = await fetch("/api/items/delete", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind, id }) })
      const payload = await response.json().catch(() => ({})) as { error?: string }
      if (!response.ok) throw new Error(payload.error || "Suppression impossible.")
      router.refresh()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Suppression impossible.")
    } finally {
      setPending(false)
    }
  }

  return <span className="inline-flex items-center gap-2">
    {error && <span className="max-w-48 text-left text-xs text-destructive">{error}</span>}
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button type="button" variant="ghost" size="icon-sm" className="text-muted-foreground hover:text-destructive" disabled={pending} aria-label={`Supprimer ${name}`} title={`Supprimer ${label}`}>
          {pending ? <LoaderCircle className="animate-spin" /> : <Trash2 />}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Supprimer « {name} » ?</AlertDialogTitle>
          <AlertDialogDescription>
            {kind === "character" ? "Le personnage disparaît des listes et des campagnes" : "La campagne disparaît des listes"} sur toutes les installations. Rien n’est effacé de Google Sheets : un administrateur peut {kind === "character" ? "le" : "la"} restaurer depuis Administration → Corbeille.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Annuler</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={() => void trash()}>Mettre à la corbeille</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </span>
}
