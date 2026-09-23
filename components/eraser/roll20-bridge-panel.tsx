"use client"

import { useState } from "react"
import { Check, Copy, Download, Link2, RefreshCw, ShieldCheck, Unlink } from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

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

export function Roll20BridgePanel({ campaignId, initialLink }: { campaignId: string; initialLink: LinkRecord | null }) {
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
    <div className="mx-auto w-full max-w-5xl space-y-6 px-5 py-8 sm:px-8">
      <header>
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-primary">Pont de campagne</p>
        <h1 className="mt-2 font-display text-4xl font-semibold">Roll20</h1>
        <p className="mt-3 max-w-3xl text-base leading-7 text-muted-foreground">Synchronise en une fois les PNJ et magasins de cette campagne, ou seulement ceux d’une session. À la fin d’une session, les PV peuvent revenir de Roll20 vers Eraser.</p>
      </header>

      {error && <Alert variant="destructive"><AlertTitle>La liaison n’a pas été modifiée</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}

      <div className="grid gap-6 lg:grid-cols-[1.15fr_.85fr]">
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Link2 className="size-5" />Liaison de la campagne</CardTitle><CardDescription>Une clé ne donne accès qu’aux données Roll20 de cette campagne. La remplacer révoque immédiatement l’ancienne.</CardDescription></CardHeader>
          <CardContent className="space-y-5">
            {link ? (
              <div className="grid gap-3 rounded-xl border bg-muted/20 p-4 sm:grid-cols-2">
                <div><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Partie Roll20</p><p className="mt-1 font-medium">{link.roll20GameName || "Pas encore reconnue"}</p></div>
                <div><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Dernier import</p><p className="mt-1 font-medium">{dateLabel(link.lastPullAt)}</p></div>
                <div><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Dernier retour des PV</p><p className="mt-1 font-medium">{dateLabel(link.lastPushAt)}</p></div>
                <div><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">État</p><p className="mt-1 flex items-center gap-2 font-medium text-emerald-700"><ShieldCheck className="size-4" />Active</p></div>
              </div>
            ) : <p className="rounded-xl border border-dashed p-5 text-sm text-muted-foreground">Cette campagne n’est liée à aucune partie Roll20.</p>}

            {token && (
              <div className="space-y-2">
                <Label htmlFor="roll20-token">Clé de liaison — affichée une seule fois</Label>
                <div className="flex gap-2"><Input id="roll20-token" readOnly value={token} className="font-mono text-xs" /><Button type="button" variant="secondary" onClick={() => void copyToken()}>{copied ? <Check /> : <Copy />}{copied ? "Copiée" : "Copier"}</Button></div>
                <p className="text-xs text-muted-foreground">Colle cette clé dans le bouton Eraser ajouté à Roll20. Ne l’envoie pas à tes joueurs.</p>
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={() => void createLink()} disabled={busy}>{link ? <RefreshCw /> : <Link2 />}{link ? "Remplacer la clé" : "Créer la liaison"}</Button>
              {link && <Button type="button" variant="outline" onClick={() => void unlink()} disabled={busy}><Unlink />Révoquer</Button>}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Installation</CardTitle><CardDescription>Les deux éléments sont nécessaires : le compagnon communique avec Eraser, le script modifie la partie Roll20.</CardDescription></CardHeader>
          <CardContent className="space-y-3">
            <Button asChild className="w-full justify-start" variant="secondary"><a href="/roll20/eraser-roll20-companion.zip" download><Download />1. Compagnon Chrome v0.6.0 (application)</a></Button>
            <Button asChild className="w-full justify-start" variant="secondary"><a href="/roll20/eraser-bridge.mod.js" download><Download />2. Script Mod Roll20 v0.6.0</a></Button>
            <ol className="space-y-2 pl-5 text-sm leading-6 text-muted-foreground">
              <li className="list-decimal">Télécharge le compagnon, décompresse le fichier ZIP et conserve le dossier obtenu.</li>
              <li className="list-decimal">Dans Chrome, ouvre « chrome://extensions », active le mode développeur, clique sur « Charger l’extension non empaquetée », puis sélectionne ce dossier.</li>
              <li className="list-decimal">Télécharge le script Mod. Dans les paramètres de ta partie Roll20, ouvre « Mod Scripts », crée un nouveau script, colle tout son contenu et enregistre.</li>
              <li className="list-decimal">Attends que la console Mod affiche « Eraser Bridge 0.6.0 prêt ».</li>
              <li className="list-decimal">Ouvre ensuite la partie Roll20, clique sur « Eraser », puis colle la clé de liaison créée sur cette page.</li>
              <li className="list-decimal">Utilise « Tout synchroniser », « Synchroniser une session » (choisis la session dans le menu déroulant, de la plus récente à la plus ancienne, avec recherche par nom) ou « Renvoyer les PV ».</li>
            </ol>
          </CardContent>
        </Card>
      </div>

      <Alert><ShieldCheck /><AlertTitle>Règles de synchronisation</AlertTitle><AlertDescription>Eraser reste la source des profils, statistiques, descriptions et magasins. Roll20 renvoie seulement les PV. Les éléments sont reliés par leur identifiant Eraser pour être mis à jour sans doublon.</AlertDescription></Alert>
    </div>
  )
}
