"use client"

import { useState } from "react"
import { LoaderCircle, Save } from "lucide-react"

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
  return (
    <div className="mt-8 space-y-3">
      {accounts.map((account) => (
        <AccountRow key={account.uid} account={account} isCurrent={account.uid === currentUid} />
      ))}
    </div>
  )
}

function AccountRow({ account, isCurrent }: { account: AccountRecord; isCurrent: boolean }) {
  const [role, setRole] = useState<SiteRole>(account.role ?? "joueur")
  const [status, setStatus] = useState<AccountStatus>(account.status)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

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

  return (
    <article className="grid items-center gap-4 rounded-2xl border bg-card/90 p-4 shadow-[0_8px_30px_rgb(67_50_31/0.05)] md:grid-cols-[minmax(0,1fr)_180px_160px_auto]">
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
    </article>
  )
}
