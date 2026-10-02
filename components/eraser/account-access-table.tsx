"use client"

import { useState } from "react"
import { LoaderCircle, Save, Trash2 } from "lucide-react"
import { useRouter } from "next/navigation"

import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { AccountRecord, AccountStatus, SiteRole } from "@/lib/auth-types"

export function AccountAccessTable({
  accounts,
  currentUid,
}: {
  accounts: AccountRecord[]
  currentUid: string
}) {
  const [items, setItems] = useState(accounts)
  return (
    <div className="mt-8 space-y-3">
      {items.map((account) => (
        <AccountRow
          key={account.uid}
          account={account}
          isCurrent={account.uid === currentUid}
          onDeleted={() => setItems((current) => current.filter((item) => item.uid !== account.uid))}
        />
      ))}
    </div>
  )
}

function AccountRow({ account, isCurrent, onDeleted }: { account: AccountRecord; isCurrent: boolean; onDeleted: () => void }) {
  const router = useRouter()
  const [role, setRole] = useState<SiteRole>(account.role ?? "joueur")
  const [status, setStatus] = useState<AccountStatus>(account.status)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState("")

  async function save() {
    setSaving(true)
    setSaved(false)
    const response = await fetch("/api/admin/accounts/access", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ uid: account.uid, role, status }),
    })
    setSaving(false)
    setSaved(response.ok)
  }

  async function remove() {
    setDeleting(true)
    setDeleteError("")
    const response = await fetch(`/api/admin/accounts/${encodeURIComponent(account.uid)}`, { method: "DELETE" })
    if (response.ok) {
      onDeleted()
      router.refresh()
      return
    }
    const payload = await response.json().catch(() => null) as { error?: string } | null
    setDeleteError(payload?.error || "Le compte n’a pas pu être supprimé.")
    setDeleting(false)
  }

  return (
    <article className="grid items-center gap-4 rounded-2xl border bg-card/90 p-4 shadow-[0_8px_30px_rgb(67_50_31/0.05)] md:grid-cols-[minmax(0,1fr)_180px_160px_auto_auto]">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <p className="truncate font-medium">{account.displayName || account.email}</p>
          {isCurrent && <Badge variant="outline">Ton compte</Badge>}
        </div>
        <p className="truncate text-sm text-muted-foreground">{account.email}</p>
      </div>
      <Select
        value={role}
        onValueChange={(value) => setRole(value as SiteRole)}
        disabled={isCurrent}
      >
        <SelectTrigger aria-label={`Rôle de ${account.email}`}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="admin">Administrateur</SelectItem>
          <SelectItem value="mj">Maître du jeu</SelectItem>
          <SelectItem value="joueur">Joueur</SelectItem>
        </SelectContent>
      </Select>
      <Select value={status} onValueChange={(value) => setStatus(value as AccountStatus)}>
        <SelectTrigger aria-label={`Statut de ${account.email}`}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="en_attente">En attente</SelectItem>
          <SelectItem value="actif">Actif</SelectItem>
          <SelectItem value="suspendu">Suspendu</SelectItem>
        </SelectContent>
      </Select>
      <Button
        onClick={save}
        disabled={saving || (isCurrent && (status !== "actif" || role !== "admin"))}
      >
        {saving ? <LoaderCircle className="size-4 animate-spin" /> : <Save className="size-4" />}
        {saved ? "Enregistré" : "Enregistrer"}
      </Button>
      {!isCurrent && (
        <div className="flex flex-col items-end gap-1">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button type="button" variant="ghost" size="icon" aria-label={`Supprimer le compte de ${account.email}`}>
                <Trash2 className="size-4 text-destructive" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Supprimer le compte de {account.displayName || account.email} ?</AlertDialogTitle>
                <AlertDialogDescription>
                  Cette action est définitive : le compte et sa connexion ne pourront plus être utilisés pour se connecter.
                  Ses personnages et campagnes ne sont pas supprimés ; réattribue-les depuis « Toutes les campagnes »
                  et « Tous les personnages » si besoin.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Annuler</AlertDialogCancel>
                <AlertDialogAction variant="destructive" disabled={deleting} onClick={() => void remove()}>
                  {deleting ? <LoaderCircle className="size-4 animate-spin" /> : "Supprimer"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          {deleteError && <p className="text-xs text-destructive">{deleteError}</p>}
        </div>
      )}
    </article>
  )
}
