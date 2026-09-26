"use client"

import { useState, type FormEvent } from "react"
import { useRouter } from "next/navigation"
import { LoaderCircle, Map, Save } from "lucide-react"

import { RichTextField } from "@/components/eraser/rich-text"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { CampaignRecord } from "@/lib/google-sheets"
import { announceCreatedCampaign } from "@/lib/selection-events"

export function CampaignCreationForm() {
  const router = useRouter()
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [bannerUrl, setBannerUrl] = useState("")
  const [bannerFile, setBannerFile] = useState<File | null>(null)
  const [accentColor, setAccentColor] = useState("#927640")
  const [error, setError] = useState("")
  const [pending, setPending] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPending(true)
    setError("")
    const response = await fetch("/api/campaigns", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, description, bannerUrl, accentColor }),
    })
    const payload = (await response.json()) as { error?: string; campaign?: CampaignRecord }
    if (!response.ok || !payload.campaign) { setPending(false); return setError(payload.error || "La campagne n’a pas pu être créée.") }
    if (bannerFile) {
      const form = new FormData()
      form.append("banner", bannerFile)
      const upload = await fetch(`/api/campaigns/${encodeURIComponent(payload.campaign.id)}`, { method: "PATCH", body: form })
      if (!upload.ok) { setPending(false); return setError("La campagne est créée, mais la bannière n’a pas pu être importée.") }
    }
    // La nouvelle campagne devient la sélection du menu, puis son tableau de bord s’ouvre.
    announceCreatedCampaign(payload.campaign)
    router.push(`/campagne/${encodeURIComponent(payload.campaign.id)}`)
  }

  return (
    <div className="w-full flex-1 px-5 py-9 sm:px-8 md:py-14">
      <div className="mb-5 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-primary/75">
        <span className="h-px w-7 bg-primary/50" />
        Campagne
      </div>
      <div className="flex items-start gap-4">
        <div className="mt-1 flex size-12 shrink-0 items-center justify-center rounded-2xl border bg-card/90 text-primary">
          <Map className="size-5" />
        </div>
        <div>
          <h1 className="font-display text-4xl font-semibold tracking-[-0.025em] sm:text-5xl">Créer une campagne</h1>
          <p className="mt-3 text-muted-foreground">Ton compte sera automatiquement enregistré comme MJ.</p>
        </div>
      </div>

      <form onSubmit={submit} className="mt-10 rounded-2xl border bg-card/90 p-5 shadow-[0_10px_35px_rgb(67_50_31/0.06)] sm:p-7">
        <div className="grid gap-2">
          <Label htmlFor="campaign-name">Nom de la campagne</Label>
          <Input id="campaign-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={120} required autoFocus />
          <p className="text-sm text-muted-foreground">Le Sheet Campagnes contiendra l’ID, l’ID du MJ et ce nom.</p>
        </div>
        <div className="mt-5 grid gap-2">
          <Label htmlFor="campaign-description">Brève description</Label>
          <RichTextField value={description} onCommit={setDescription} minHeight="min-h-24" />
        </div>
        <div className="mt-5 grid gap-5 sm:grid-cols-[1fr_auto]">
          <div className="grid gap-2"><Label htmlFor="campaign-banner">URL de bannière</Label><Input id="campaign-banner" type="url" value={bannerUrl} onChange={(event) => { setBannerUrl(event.target.value); setBannerFile(null) }} placeholder="https://…" /><Label htmlFor="campaign-banner-file" className="mt-2">Ou importer une image</Label><Input id="campaign-banner-file" type="file" accept="image/*" onChange={(event) => setBannerFile(event.target.files?.[0] || null)} /></div>
          <div className="grid gap-2"><Label htmlFor="campaign-color">Couleur d’accent</Label><Input id="campaign-color" type="color" value={accentColor} onChange={(event) => setAccentColor(event.target.value)} className="w-16 px-1" /></div>
        </div>
        {error && <p className="mt-5 text-sm text-destructive" role="alert">{error}</p>}
        <div className="mt-7 flex justify-end">
          <Button type="submit" disabled={pending}>
            {pending ? <LoaderCircle className="animate-spin" /> : <Save />}
            Créer la campagne
          </Button>
        </div>
      </form>
    </div>
  )
}
