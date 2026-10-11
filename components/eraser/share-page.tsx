"use client"

import { useEffect, useState } from "react"
import { Check, Copy, LoaderCircle, Send, Share2 } from "lucide-react"

import { AccountAvatar } from "@/components/eraser/account-dialog"
import type { DirectoryEntry } from "@/components/eraser/account-directory"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Textarea } from "@/components/ui/textarea"

/**
 * « Envoyer cette page » : la page ouverte arrive en notification dans l'app des comptes
 * choisis, qui l'ouvrent d'un clic (chacun avec ses droits : un joueur ne voit pas une page
 * réservée au MJ). « Copier le lien » donne un lien qui, comme un lien Discord, propose
 * d'ouvrir la page dans l'application de celui qui le reçoit (voir desktop/deep-link.cjs).
 */
export function SharePageButton({ title }: { title: string }) {
  const [open, setOpen] = useState(false)
  const [accounts, setAccounts] = useState<DirectoryEntry[] | null>(null)
  const [chosen, setChosen] = useState<string[]>([])
  const [note, setNote] = useState("")
  const [status, setStatus] = useState<"" | "sending" | "sent" | "copied">("")
  const [error, setError] = useState("")

  useEffect(() => {
    if (!open || accounts) return
    let alive = true
    fetch("/api/account/directory", { cache: "no-store" })
      .then(async (response) => ({ response, payload: (await response.json().catch(() => ({}))) as { accounts?: DirectoryEntry[]; error?: string } }))
      .then(({ response, payload }) => { if (!alive) return; if (response.ok) setAccounts(payload.accounts ?? []); else setError(payload.error || "La liste des comptes n’a pas pu être chargée.") })
      .catch(() => { if (alive) setError("La liste des comptes n’a pas pu être chargée.") })
    return () => { alive = false }
  }, [accounts, open])

  const href = () => `${window.location.pathname}${window.location.search}`

  async function send() {
    setStatus("sending"); setError("")
    try {
      const response = await fetch("/api/share-page", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ uids: chosen, href: href(), title, note: note.trim() }) })
      const payload = (await response.json().catch(() => ({}))) as { sent?: number; error?: string }
      if (!response.ok) throw new Error(payload.error || "La page n’a pas pu être envoyée.")
      setStatus("sent"); setChosen([]); setNote("")
    } catch (caught) {
      setStatus(""); setError(caught instanceof Error ? caught.message : "La page n’a pas pu être envoyée.")
    }
  }

  async function copy() {
    setError("")
    try {
      const payload = (await fetch("/api/share-page", { cache: "no-store" }).then((response) => response.ok ? response.json() : {}).catch(() => ({}))) as { openBase?: string | null }
      // Sans serveur partagé, le lien « eraser:// » ouvre quand même l'application installée.
      const link = payload.openBase ? `${payload.openBase}?p=${encodeURIComponent(href())}` : `eraser://open${href()}`
      await navigator.clipboard.writeText(link); setStatus("copied")
    } catch { setError("Le lien n’a pas pu être copié.") }
  }

  return <Popover open={open} onOpenChange={(next) => { setOpen(next); if (!next) { setStatus(""); setError("") } }}>
    <PopoverTrigger asChild>
      <button type="button" className="flex size-8 shrink-0 items-center justify-center rounded-lg border bg-background/60 text-muted-foreground transition hover:border-primary/40 hover:text-foreground" aria-label="Envoyer cette page" title="Envoyer cette page à quelqu’un"><Share2 className="size-4" /></button>
    </PopoverTrigger>
    <PopoverContent align="end" className="w-80 p-3">
      <p className="font-display text-lg font-semibold leading-tight">Envoyer cette page</p>
      <p className="mb-2 truncate text-xs text-muted-foreground">{title || "La page ouverte"}</p>
      {accounts === null && !error
        ? <div className="grid min-h-16 place-items-center"><LoaderCircle className="size-4 animate-spin text-muted-foreground" /></div>
        : <div className="grid max-h-56 gap-0.5 overflow-y-auto pr-1">
          {(accounts ?? []).map((account) => <label key={account.uid} className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm hover:bg-accent">
            <Checkbox checked={chosen.includes(account.uid)} onCheckedChange={(checked) => setChosen((current) => checked === true ? [...current, account.uid] : current.filter((uid) => uid !== account.uid))} />
            <AccountAvatar user={{ uid: account.uid, displayName: account.name, email: "" }} version={0} className="size-7 shrink-0 rounded-full" />
            <span className="min-w-0 flex-1 truncate">{account.name}</span>
          </label>)}
          {accounts?.length === 0 && <p className="px-2 py-3 text-center text-xs text-muted-foreground">Aucun autre compte.</p>}
        </div>}
      <Textarea value={note} onChange={(event) => setNote(event.target.value.slice(0, 280))} placeholder="Un petit mot (facultatif)" rows={2} className="mt-2 min-h-14 text-sm" />
      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
      {status === "sent" && <p className="mt-2 flex items-center gap-1.5 text-xs text-emerald-700"><Check className="size-3.5" />Envoyée : elle arrive dans leur app en notification.</p>}
      <div className="mt-2 flex items-center justify-between gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={() => void copy()}>{status === "copied" ? <Check /> : <Copy />}{status === "copied" ? "Lien copié" : "Copier le lien"}</Button>
        <Button type="button" size="sm" disabled={!chosen.length || status === "sending"} onClick={() => void send()}>{status === "sending" ? <LoaderCircle className="animate-spin" /> : <Send />}Envoyer{chosen.length > 1 ? ` (${chosen.length})` : ""}</Button>
      </div>
    </PopoverContent>
  </Popover>
}
