"use client"

import { useState } from "react"
import { Check, Copy, Link2, RefreshCw, ShieldCheck, Unlink } from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Roll20CompanionSteps } from "@/components/eraser/roll20-companion-steps"

type LinkRecord = {
  id: string
  campaignId: string
  roll20GameId: string
  roll20GameName: string
  lastPullAt: string | null
  lastPushAt: string | null
  createdAt: string
  updatedAt: string
}

function dateLabel(value: string | null) {
  if (!value) return "Jamais"
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value))
}

/** `embedded` : dans la partie dépliable du dossier de la campagne (sans titre de page). */
/** `scriptsUrl` / `suggestedScriptsUrl` : la page des scripts Mod de la partie, gardée ou déduite du lien de la partie. */
export function Roll20BridgePanel({ campaignId, initialLink, embedded = false, scriptsUrl = "", suggestedScriptsUrl = "" }: { campaignId: string; initialLink: LinkRecord | null; embedded?: boolean; scriptsUrl?: string; suggestedScriptsUrl?: string }) {
  const [link, setLink] = useState(initialLink)
  const [token, setToken] = useState("")
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState("")

  async function createLink() {
    setBusy(true)
    setError("")
    try {
      const response = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/roll20`, { method: "POST" })
      const payload = await response.json() as { token?: string; error?: string }
      if (!response.ok || !payload.token) throw new Error(payload.error || "Création impossible.")
      setToken(payload.token)
      const status = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/roll20`, { cache: "no-store" })
      const statusPayload = await status.json() as { link?: LinkRecord | null }
      setLink(statusPayload.link || null)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Création impossible.")
    } finally {
      setBusy(false)
    }
  }

  async function unlink() {
    if (!window.confirm("Révoquer la liaison Roll20 de cette campagne ?")) return
    setBusy(true)
    setError("")
    try {
      const response = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/roll20`, { method: "DELETE" })
      if (!response.ok) throw new Error("Suppression impossible.")
      setLink(null)
      setToken("")
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Suppression impossible.")
    } finally {
      setBusy(false)
    }
  }

  async function copyToken() {
    await navigator.clipboard.writeText(token)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1800)
  }

  return (
    <div className={embedded ? "w-full space-y-6" : "mx-auto w-full max-w-5xl space-y-6 px-5 py-8 sm:px-8"}>
      {!embedded && <header><h1 className="font-display text-4xl font-semibold">Roll20</h1></header>}

      <Roll20CompanionSteps campaignId={campaignId} scriptsUrl={scriptsUrl} suggestedScriptsUrl={suggestedScriptsUrl} />

      {error && <Alert variant="destructive"><AlertTitle>La liaison n’a pas été modifiée</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}

      {/* La clé de liaison : le compagnon s'en sert pour lire cette campagne (une fois pour toutes). */}
      <Card aria-labelledby="roll20-cle" className="gap-3 rounded-2xl bg-card/60 p-4 shadow-none">
        <div className="flex flex-wrap items-center gap-3">
          <h2 id="roll20-cle" className="flex items-center gap-2 font-display text-xl font-semibold"><Link2 className="size-5" />Clé de liaison</h2>
          {link
            ? <span className="flex items-center gap-1.5 text-sm font-medium text-emerald-700"><ShieldCheck className="size-4" />Active{link.roll20GameName ? <> · <strong>{link.roll20GameName}</strong></> : ""}</span>
            : <span className="text-sm text-muted-foreground">Pas encore créée</span>}
        </div>
        {token && <div className="space-y-1.5">
          <Label htmlFor="roll20-token"><strong>Colle-la dans Roll20</strong> (bouton <strong>Eraser</strong>). Visible une seule fois.</Label>
          <div className="flex gap-2"><Input id="roll20-token" readOnly value={token} className="font-mono text-xs" /><Button type="button" onClick={() => void copyToken()}>{copied ? <Check /> : <Copy />}{copied ? "Copiée" : "Copier"}</Button></div>
        </div>}
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant={link ? "outline" : "default"} onClick={() => void createLink()} disabled={busy}>{link ? <RefreshCw /> : <Link2 />}{link ? "Nouvelle clé" : "Créer la clé"}</Button>
          {link && <Button type="button" variant="ghost" onClick={() => void unlink()} disabled={busy}><Unlink />Révoquer</Button>}
          {link && <span className="text-xs text-muted-foreground">Dernier import : {dateLabel(link.lastPullAt)} · PV renvoyés : {dateLabel(link.lastPushAt)}</span>}
        </div>
      </Card>
    </div>
  )
}
