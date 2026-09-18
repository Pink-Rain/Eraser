"use client"

import { useState, type FormEvent } from "react"
import {
  Check,
  ExternalLink,
  File,
  FileSpreadsheet,
  Folder,
  HardDrive,
  KeyRound,
  LoaderCircle,
  Plus,
  ShieldCheck,
  Trash2,
} from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { DriveFile } from "@/lib/google-drive"
import type { DriveSpreadsheetDuplicateGroup } from "@/lib/google-sheets"

type AuthorizationSummary = {
  googleEmail: string
  connectedAt: string
  updatedAt: string
}

type OAuthSettingsSummary = {
  clientId: string
  hasClientSecret: boolean
  updatedAt: string
}

const oauthMessages: Record<string, string> = {
  connected: "Le compte Google dédié est maintenant relié à Eraser.",
  access_denied: "L’autorisation Google a été annulée.",
  account_mismatch: "Le compte Google choisi ne correspond pas à l’adresse saisie.",
  invalid_state: "La demande d’autorisation a expiré. Relance la connexion.",
  missing_refresh_token: "Google n’a pas transmis l’autorisation durable. Relance la connexion.",
  failed: "La connexion Google n’a pas pu être terminée.",
}

export function GoogleDriveManager({
  configured,
  callbackUrl,
  defaultEmail,
  oauthSettings,
  authorization,
  files,
  duplicateGroups,
  loadError,
  oauthStatus,
}: {
  configured: boolean
  callbackUrl: string
  defaultEmail: string
  oauthSettings: OAuthSettingsSummary | null
  authorization: AuthorizationSummary | null
  files: DriveFile[]
  duplicateGroups: DriveSpreadsheetDuplicateGroup[]
  loadError: string | null
  oauthStatus?: string
}) {
  const [email, setEmail] = useState(authorization?.googleEmail ?? defaultEmail)
  const [authorizationNotice, setAuthorizationNotice] = useState<string | null>(null)
  const [clientId, setClientId] = useState(oauthSettings?.clientId ?? "")
  const [clientSecret, setClientSecret] = useState("")
  const [savingSettings, setSavingSettings] = useState(false)
  const [settingsMessage, setSettingsMessage] = useState<string | null>(null)
  const [sheetName, setSheetName] = useState("")
  const [creating, setCreating] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [visibleFiles, setVisibleFiles] = useState(files)
  const [visibleDuplicateGroups, setVisibleDuplicateGroups] = useState(duplicateGroups)
  const [cleaningFileId, setCleaningFileId] = useState("")
  const [cleanupMessage, setCleanupMessage] = useState<string | null>(null)

  async function trashDuplicate(fileId: string) {
    setCleaningFileId(fileId)
    setCleanupMessage(null)
    const response = await fetch("/api/admin/google-drive/duplicates", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ fileId }),
    })
    const payload = (await response.json()) as { groups?: DriveSpreadsheetDuplicateGroup[]; error?: string }
    setCleaningFileId("")
    if (!response.ok || !payload.groups) return setCleanupMessage(payload.error || "Nettoyage impossible.")
    setVisibleDuplicateGroups(payload.groups)
    setVisibleFiles((current) => current.filter((file) => file.id !== fileId))
    setCleanupMessage("Le doublon a été placé dans la corbeille Google Drive.")
  }

  function authorizeGoogle(event: FormEvent) {
    event.preventDefault()
    const normalizedEmail = email.trim().toLowerCase()
    if (!normalizedEmail) return
    if (!configured) {
      setAuthorizationNotice(
        "Le compte est bien renseigné. Il reste à créer les identifiants OAuth dans Google Cloud avant que Google puisse afficher l’écran d’autorisation.",
      )
      document.getElementById("google-oauth-client-id")?.focus()
      return
    }
    window.location.assign(
      `/api/admin/google-drive/oauth/start?email=${encodeURIComponent(normalizedEmail)}`,
    )
  }

  async function saveOAuthSettings(event: FormEvent) {
    event.preventDefault()
    setSavingSettings(true)
    setSettingsMessage(null)
    const response = await fetch("/api/admin/google-drive/oauth/settings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ clientId, clientSecret }),
    })
    const payload = (await response.json()) as { error?: string }
    setSavingSettings(false)
    if (!response.ok) {
      setSettingsMessage(payload.error ?? "Impossible d’enregistrer la configuration Google.")
      return
    }
    window.location.reload()
  }

  async function createSheet(event: FormEvent) {
    event.preventDefault()
    setCreating(true)
    setMessage(null)
    const response = await fetch("/api/admin/google-drive/create-sheet", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: sheetName }),
    })
    const payload = (await response.json()) as { error?: string; file?: DriveFile }
    setCreating(false)
    if (!response.ok || !payload.file) {
      setMessage(payload.error ?? "Impossible de créer cette feuille Google Sheets.")
      return
    }
    setVisibleFiles((current) => [payload.file!, ...current])
    setSheetName("")
    setMessage(`La feuille « ${payload.file.name} » a été créée dans le Drive.`)
  }

  return (
    <div className="mt-9 space-y-6">
      {!configured && (
        <Alert>
          <HardDrive className="size-4" />
          <AlertTitle>Connexion Google à terminer</AlertTitle>
          <AlertDescription>
            <p>
              Le compte est prêt côté Eraser. Il manque encore les identifiants OAuth
              Google du site ; sans eux, Google ne peut pas ouvrir son écran d’autorisation.
            </p>
            <p className="mt-1 break-all text-xs">URL de redirection : {callbackUrl}</p>
          </AlertDescription>
        </Alert>
      )}

      {oauthStatus && oauthMessages[oauthStatus] && (
        <Alert variant={oauthStatus === "connected" ? "default" : "destructive"}>
          {oauthStatus === "connected" ? <Check className="size-4" /> : <HardDrive className="size-4" />}
          <AlertTitle>{oauthStatus === "connected" ? "Compte connecté" : "Connexion incomplète"}</AlertTitle>
          <AlertDescription>{oauthMessages[oauthStatus]}</AlertDescription>
        </Alert>
      )}

      <details
        open={!configured}
        className="group rounded-2xl border bg-card/90 shadow-[0_10px_35px_rgb(67_50_31/0.06)]"
      >
        <summary className="flex cursor-pointer list-none items-center gap-3 p-5 sm:p-6">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
            <KeyRound className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-xl font-semibold">Configuration Google Cloud</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {configured ? "Identifiant OAuth enregistré" : "Étape nécessaire pour activer le bouton"}
            </p>
          </div>
          <Badge variant="outline">{configured ? "Prêt" : "À configurer"}</Badge>
        </summary>
        <div className="border-t px-5 pb-5 pt-5 sm:px-6 sm:pb-6">
          <p className="text-sm leading-6 text-muted-foreground">
            Dans Google Cloud, crée un client OAuth de type « Application Web », puis
            colle ses informations ici. Le secret est chiffré avant d’être enregistré.
          </p>
          <p className="mt-3 break-all rounded-lg bg-muted px-3 py-2 text-xs">
            URL de redirection autorisée : {callbackUrl}
          </p>
          <Button asChild variant="outline" size="sm" className="mt-3">
            <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noreferrer">
              Ouvrir Google Cloud <ExternalLink className="size-3.5" />
            </a>
          </Button>

          <form onSubmit={saveOAuthSettings} className="mt-5 grid gap-4">
            <div>
              <label htmlFor="google-oauth-client-id" className="text-sm font-medium">
                Identifiant client OAuth
              </label>
              <Input
                id="google-oauth-client-id"
                value={clientId}
                onChange={(event) => setClientId(event.target.value)}
                placeholder="000000000000-xxxx.apps.googleusercontent.com"
                className="mt-2"
                required
              />
            </div>
            <div>
              <label htmlFor="google-oauth-client-secret" className="text-sm font-medium">
                Secret client <span className="font-normal text-muted-foreground">(si Google en fournit un)</span>
              </label>
              <Input
                id="google-oauth-client-secret"
                type="password"
                value={clientSecret}
                onChange={(event) => setClientSecret(event.target.value)}
                placeholder={oauthSettings?.hasClientSecret ? "Secret déjà enregistré" : "Facultatif avec PKCE"}
                className="mt-2"
                autoComplete="off"
              />
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" disabled={savingSettings || !clientId.trim()}>
                {savingSettings && <LoaderCircle className="size-4 animate-spin" />}
                Enregistrer la configuration
              </Button>
              {settingsMessage && <p className="text-sm text-destructive">{settingsMessage}</p>}
            </div>
          </form>
        </div>
      </details>

      <section className="rounded-2xl border bg-card/90 p-5 shadow-[0_10px_35px_rgb(67_50_31/0.06)] sm:p-6">
        <div className="flex items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <ShieldCheck className="size-5" />
          </div>
          <div>
            <h2 className="font-display text-2xl font-semibold">Compte Google dédié</h2>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              Saisis le compte créé uniquement pour Eraser. Cette autorisation donne au
              site l’accès à l’ensemble de son Drive et de ses feuilles Google Sheets.
            </p>
          </div>
        </div>

        <form onSubmit={authorizeGoogle} className="mt-5">
          <label htmlFor="google-account" className="text-sm font-medium">
            Adresse du compte Google à configurer
          </label>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
            <Input
              id="google-account"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="eraser.jdr@gmail.com"
              required
            />
            <Button type="submit" disabled={!email.trim()}>
              <HardDrive className="size-4" />
              {authorization ? "Changer ou reconnecter" : "Autoriser ce Drive"}
            </Button>
          </div>
          {authorizationNotice && (
            <p className="mt-3 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-sm leading-6 text-foreground">
              {authorizationNotice}
            </p>
          )}
          <p className="mt-2 text-xs leading-5 text-muted-foreground">
            Ceci ne crée pas une nouvelle connexion à Eraser : Google sert seulement à
            autoriser Drive et Sheets depuis cette page d’administration.
          </p>
        </form>

        {authorization && (
          <div className="mt-5 flex flex-col gap-3 rounded-xl border border-[#52665c]/25 bg-[#52665c]/8 p-4 sm:flex-row sm:items-center">
            <Check className="size-5 shrink-0 text-[#40564b]" />
            <div className="min-w-0 flex-1">
              <p className="font-medium">{authorization.googleEmail}</p>
              <p className="text-xs text-muted-foreground">Drive entier autorisé</p>
            </div>
            <Badge variant="outline">Connecté</Badge>
            <Button asChild variant="outline" size="sm">
              <a href="https://drive.google.com/drive/my-drive" target="_blank" rel="noreferrer">
                Ouvrir Drive <ExternalLink className="size-3.5" />
              </a>
            </Button>
          </div>
        )}
      </section>

      {authorization && (
        <section className="rounded-2xl border bg-card/90 p-5 shadow-[0_10px_35px_rgb(67_50_31/0.06)] sm:p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary/70">Entretien</p>
          <h2 className="font-display mt-2 text-2xl font-semibold">Doublons Google Sheets</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">Eraser protège automatiquement la feuille enregistrée et propose uniquement les copies redondantes.</p>
          {cleanupMessage && <p className="mt-4 text-sm text-muted-foreground">{cleanupMessage}</p>}
          <div className="mt-5 space-y-4">
            {visibleDuplicateGroups.length ? visibleDuplicateGroups.map((group) => (
              <div key={group.label} className="rounded-xl border bg-background/45 p-3">
                <p className="mb-2 text-sm font-semibold">{group.files[0]?.name}</p>
                <div className="space-y-2">
                  {group.files.map((file) => (
                    <div key={file.id} className="flex items-center gap-3 rounded-lg border bg-background px-3 py-2">
                      <FileSpreadsheet className="size-4 shrink-0 text-muted-foreground" />
                      <div className="min-w-0 flex-1"><p className="truncate text-sm">{file.name}</p><p className="text-xs text-muted-foreground">{file.inUse ? "Utilisé par Eraser — protégé" : file.keep ? "Copie conservée" : `Copie redondante${file.modifiedTime ? ` · ${new Date(file.modifiedTime).toLocaleDateString("fr-FR")}` : ""}`}</p></div>
                      {file.webViewLink && <Button asChild variant="ghost" size="icon-sm"><a href={file.webViewLink} target="_blank" rel="noreferrer" aria-label={`Ouvrir ${file.name}`}><ExternalLink /></a></Button>}
                      {!file.inUse && !file.keep && (
                        <AlertDialog>
                          <AlertDialogTrigger asChild><Button type="button" variant="ghost" size="icon-sm" className="text-destructive" disabled={Boolean(cleaningFileId)} aria-label={`Mettre ${file.name} à la corbeille`}>{cleaningFileId === file.id ? <LoaderCircle className="animate-spin" /> : <Trash2 />}</Button></AlertDialogTrigger>
                          <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Mettre cette copie à la corbeille ?</AlertDialogTitle><AlertDialogDescription>Le fichier « {file.name} » n’est pas utilisé par Eraser. Il restera récupérable dans la corbeille Google Drive.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Annuler</AlertDialogCancel><AlertDialogAction variant="destructive" onClick={() => void trashDuplicate(file.id)}>Mettre à la corbeille</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
                        </AlertDialog>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )) : <div className="rounded-xl border border-dashed px-5 py-8 text-center text-sm text-muted-foreground">Aucun doublon de Google Sheets détecté.</div>}
          </div>
        </section>
      )}

      {authorization && (
        <section className="rounded-2xl border bg-card/90 p-5 shadow-[0_10px_35px_rgb(67_50_31/0.06)] sm:p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary/70">
            Action rapide
          </p>
          <h2 className="font-display mt-2 text-2xl font-semibold">Créer une feuille Google Sheets</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            La nouvelle feuille sera créée directement à la racine du Drive connecté.
          </p>
          <form onSubmit={createSheet} className="mt-5 flex flex-col gap-2 sm:flex-row">
            <Input
              value={sheetName}
              onChange={(event) => setSheetName(event.target.value)}
              placeholder="Personnages joueurs"
              maxLength={120}
              required
            />
            <Button type="submit" disabled={creating || !sheetName.trim()}>
              {creating ? <LoaderCircle className="size-4 animate-spin" /> : <Plus className="size-4" />}
              Créer la feuille
            </Button>
          </form>
          {message && <p className="mt-3 text-sm text-muted-foreground">{message}</p>}
        </section>
      )}

      {authorization && (
        <section className="rounded-2xl border bg-card/90 p-5 shadow-[0_10px_35px_rgb(67_50_31/0.06)] sm:p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary/70">
            Contenu récent
          </p>
          <h2 className="font-display mt-2 text-2xl font-semibold">Fichiers du Drive</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Eraser peut lire, importer, créer et modifier les éléments de ce compte dédié.
          </p>

          {loadError && <p className="mt-4 text-sm text-destructive">{loadError}</p>}
          <div className="mt-5 space-y-2">
            {visibleFiles.length ? visibleFiles.map((file) => {
              const sheet = file.mimeType === "application/vnd.google-apps.spreadsheet"
              const folder = file.mimeType === "application/vnd.google-apps.folder"
              const Icon = sheet ? FileSpreadsheet : folder ? Folder : File
              return (
                <article key={file.id} className="flex items-center gap-3 rounded-xl border bg-background/45 p-3">
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                    <Icon className="size-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{file.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {sheet ? "Google Sheets" : folder ? "Dossier" : "Fichier Drive"}
                    </p>
                  </div>
                  {file.webViewLink && (
                    <Button asChild variant="ghost" size="icon">
                      <a href={file.webViewLink} target="_blank" rel="noreferrer" aria-label={`Ouvrir ${file.name}`}>
                        <ExternalLink className="size-4" />
                      </a>
                    </Button>
                  )}
                </article>
              )
            }) : (
              <div className="rounded-xl border border-dashed px-5 py-9 text-center text-sm text-muted-foreground">
                Ce Drive ne contient encore aucun fichier visible.
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  )
}
