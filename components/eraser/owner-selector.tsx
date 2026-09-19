"use client"

import { useState } from "react"
import { LoaderCircle, Save } from "lucide-react"
import { useRouter } from "next/navigation"

import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { AccountRecord } from "@/lib/auth-types"

const NO_OWNER = "__eraser_no_owner__"
const LEGACY_OWNER = "__eraser_legacy_owner__"

export function OwnerSelector({
  kind,
  itemId,
  ownerUid,
  accounts,
}: {
  kind: "character" | "campaign"
  itemId: string
  ownerUid: string
  accounts: AccountRecord[]
}) {
  const router = useRouter()
  const ownerIsLocalAccount = accounts.some((account) => account.uid === ownerUid)
  const currentValue = ownerIsLocalAccount ? ownerUid : ownerUid ? LEGACY_OWNER : NO_OWNER
  const [selectedUid, setSelectedUid] = useState(currentValue)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  async function save() {
    setSaving(true)
    setError("")
    try {
      const response = await fetch("/api/admin/ownership", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind, id: itemId, ownerUid: selectedUid === NO_OWNER ? null : selectedUid }),
      })
      const payload = await response.json() as { error?: string }
      if (!response.ok) throw new Error(payload.error || "La modification a échoué.")
      router.refresh()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "La modification a échoué.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex min-w-64 flex-col gap-2">
      <div className="flex items-center gap-2">
        <Select value={selectedUid} onValueChange={(value) => { setSelectedUid(value); setError("") }}>
          <SelectTrigger className="min-w-0 flex-1" aria-label="Choisir le propriétaire">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NO_OWNER}>Sans propriétaire</SelectItem>
            {ownerUid && !ownerIsLocalAccount && (
              <SelectItem value={LEGACY_OWNER}>Ancien identifiant · non attribué</SelectItem>
            )}
            {accounts.map((account) => (
              <SelectItem key={account.uid} value={account.uid}>
                {account.displayName || account.email} · {account.role || "sans rôle"}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          aria-label="Enregistrer le propriétaire"
          disabled={saving || selectedUid === currentValue}
          onClick={save}
          size="icon"
          type="button"
          variant="outline"
        >
          {saving ? <LoaderCircle className="animate-spin" /> : <Save />}
        </Button>
      </div>
      {ownerUid && !ownerIsLocalAccount && (
        <p className="text-xs text-amber-700">Ancien identifiant détecté : attribue un compte pour récupérer cet élément.</p>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}
