"use client"

import { useState } from "react"
import { KeyRound, LoaderCircle, Save } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
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
  const [password, setPassword] = useState("")
  const [passwordState, setPasswordState] = useState<"idle" | "saving" | "saved" | "error">("idle")

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

  async function resetPassword() {
    if (password.length < 8) {
      setPasswordState("error")
      return
    }
    setPasswordState("saving")
    const response = await fetch("/api/admin/accounts/password", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ uid: account.uid, password }),
    })
    if (response.ok) {
      setPassword("")
      setPasswordState("saved")
    } else {
      setPasswordState("error")
    }
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
      <div className="flex flex-col gap-2 border-t pt-4 md:col-span-4 md:flex-row md:items-center">
        <Input
          aria-label={`Nouveau mot de passe de ${account.email}`}
          className="md:max-w-sm"
          minLength={8}
          onChange={(event) => {
            setPassword(event.target.value)
            setPasswordState("idle")
          }}
          placeholder="Nouveau mot de passe (8 caractères minimum)"
          type="password"
          value={password}
        />
        <Button
          disabled={passwordState === "saving" || password.length < 8}
          onClick={resetPassword}
          type="button"
          variant="outline"
        >
          {passwordState === "saving" ? <LoaderCircle className="size-4 animate-spin" /> : <KeyRound className="size-4" />}
          {passwordState === "saved" ? "Mot de passe modifié" : "Changer le mot de passe"}
        </Button>
        {passwordState === "error" && (
          <p className="text-sm text-destructive">La modification a échoué.</p>
        )}
      </div>
    </article>
  )
}
