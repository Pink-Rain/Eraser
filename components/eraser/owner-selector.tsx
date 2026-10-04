"use client"

import { useState } from "react"
import { LoaderCircle, Save, X } from "lucide-react"
import { useRouter } from "next/navigation"

import { Button } from "@/components/ui/button"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import type { AccountRecord } from "@/lib/auth-types"

/**
 * Les propriétaires d'un personnage ou d'une campagne : un ou plusieurs comptes. Un
 * identifiant historique déjà présent reste tant qu'on ne le retire pas.
 */
export function OwnerSelector({
  kind,
  itemId,
  ownerUids,
  accounts,
  onSaved,
}: {
  kind: "character" | "campaign"
  itemId: string
  ownerUids: string[]
  accounts: AccountRecord[]
  /** Après l'enregistrement (le moteur des index relit son tableau) ; sinon la page est rafraîchie. */
  onSaved?: () => void
}) {
  const router = useRouter()
  const [selected, setSelected] = useState(ownerUids)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const changed = selected.length !== ownerUids.length || selected.some((uid, index) => uid !== ownerUids[index])
  const nameOf = (uid: string) => {
    const account = accounts.find((candidate) => candidate.uid === uid)
    return account ? account.displayName || account.email : "Ancien identifiant"
  }
  const legacy = selected.some((uid) => !accounts.some((account) => account.uid === uid))

  async function save() {
    setSaving(true)
    setError("")
    try {
      const response = await fetch("/api/admin/ownership", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind, id: itemId, ownerUids: selected }),
      })
      const payload = await response.json() as { error?: string }
      if (!response.ok) throw new Error(payload.error || "La modification a échoué.")
      if (onSaved) onSaved()
      else router.refresh()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "La modification a échoué.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex min-w-64 flex-col gap-1.5 py-1">
      <div className="flex items-start gap-2">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
          {selected.map((uid) => (
            <span key={uid} className={`inline-flex max-w-full items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${accounts.some((account) => account.uid === uid) ? "bg-background/60" : "border-amber-600/40 text-amber-700"}`} title={uid}>
              <span className="truncate">{nameOf(uid)}</span>
              <button type="button" onClick={() => { setSelected((current) => current.filter((item) => item !== uid)); setError("") }} className="shrink-0 text-muted-foreground hover:text-destructive" aria-label={`Retirer ${nameOf(uid)}`}><X className="size-3" /></button>
            </span>
          ))}
          {!selected.length && <span className="px-1 text-xs italic text-muted-foreground">Sans propriétaire</span>}
          <NativeSelect
            value=""
            onChange={(event) => { const uid = event.target.value; if (uid) setSelected((current) => current.includes(uid) ? current : [...current, uid]); setError("") }}
            className="h-6 w-auto min-w-24 border-dashed bg-transparent py-0 pl-2 pr-7 text-xs shadow-none"
            aria-label="Ajouter un propriétaire"
          >
            <NativeSelectOption value="">Ajouter…</NativeSelectOption>
            {accounts.filter((account) => !selected.includes(account.uid)).map((account) => (
              <NativeSelectOption key={account.uid} value={account.uid}>
                {account.displayName || account.email} · {account.role || "sans rôle"}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
        <Button
          aria-label="Enregistrer les propriétaires"
          title="Enregistrer les propriétaires"
          disabled={saving || !changed}
          onClick={save}
          size="icon-sm"
          type="button"
          variant="outline"
        >
          {saving ? <LoaderCircle className="animate-spin" /> : <Save />}
        </Button>
      </div>
      {legacy && <p className="text-[11px] text-amber-700">Ancien identifiant : ajoute un compte (et retire l’ancien) pour récupérer cet élément.</p>}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}
