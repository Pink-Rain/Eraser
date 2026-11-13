"use client"

import { useState } from "react"
import { Check, Copy, Link2, RefreshCw, ShieldCheck, Unlink } from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Roll20CompanionSteps } from "@/components/eraser/roll20-companion-steps"
import { companionManifest } from "@/lib/roll20-companion-version"

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
      <header>
        {!embedded && <p className="text-sm font-semibold uppercase tracking-[0.18em] text-primary">Pont de campagne</p>}
        {!embedded && <h1 className="mt-2 font-display text-4xl font-semibold">Roll20</h1>}
        <p className="mt-3 max-w-3xl text-base leading-7 text-muted-foreground">Synchronise en une fois les personnages joueurs, PNJ, créatures des événements, magasins et documents de cette campagne, ou seulement ceux d’une session (rangés dans un dossier du Journal à son nom). Chaque fiche reçoit son portrait et son token : celui préparé dans Eraser, sinon le token que l’éditeur de token aurait fait : le cadre choisi (ou celui par défaut du joueur, du PNJ, de la porte du magasin) et l’avatar cadré au même endroit. Les jetons déjà posés sur les cartes prennent la nouvelle image. Un document devient un handout (son image) et un PDF du Journal. À la fin d’une session, les PV peuvent revenir de Roll20 vers Eraser.</p>
      </header>

      <Roll20CompanionSteps campaignId={campaignId} scriptsUrl={scriptsUrl} suggestedScriptsUrl={suggestedScriptsUrl} />

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
          <CardHeader><CardTitle>Utilisation</CardTitle><CardDescription>Le compagnon (dans Chrome ou Opera) parle à Eraser ; le script Mod modifie la partie Roll20. Les deux portent la même version : la mise à jour ci-dessus les change ensemble.</CardDescription></CardHeader>
          <CardContent>
            <ol className="space-y-2 pl-5 text-sm leading-6 text-muted-foreground">
              <li className="list-decimal">Fais les trois étapes de « Mettre à jour le compagnon » (la première fois aussi : l’étape 2 explique comment l’ajouter au navigateur).</li>
              <li className="list-decimal">Ouvre la partie Roll20 : la console Mod affiche « Eraser Bridge {companionManifest.version} prêt ».</li>
              <li className="list-decimal">Clique sur « Eraser » dans Roll20, puis colle la clé de liaison créée à gauche.</li>
              <li className="list-decimal">Utilise « Tout synchroniser », « Synchroniser une session » (choisis la session dans le menu déroulant, de la plus récente à la plus ancienne, avec recherche par nom), « Mettre à jour les personnages joueurs » (nom, PV, rapidité, profil, portrait et token des joueurs, sans toucher au reste), « Synchroniser les documents » ou « Renvoyer les PV ».</li>
            </ol>
          </CardContent>
        </Card>
      </div>

      <Alert><ShieldCheck /><AlertTitle>Règles de synchronisation</AlertTitle><AlertDescription>Eraser reste la source des profils, statistiques, descriptions, magasins et documents. Roll20 renvoie seulement les PV des PNJ. Les documents arrivent cachés aux joueurs : partage le handout ou le PDF quand le moment est venu (le PDF est déposé dans Journal › + Ajouter › PDF ; si Roll20 change cette fenêtre, il est téléchargé pour que tu le glisses toi-même). Les fiches des joueurs ne sont jamais déplacées et gardent les réglages du MJ (contrôle, journaux). Les éléments sont reliés par leur identifiant Eraser pour être mis à jour sans doublon.</AlertDescription></Alert>
    </div>
  )
}
