"use client"

import { NO_CLASS } from "@/lib/class-visibility"
import Link from "next/link"
import dynamic from "next/dynamic"
import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from "react"
import { ArrowUpRight, Backpack, BookOpen, Check, CircleUserRound, Dices, ExternalLink, Eye, EyeOff, ImagePlus, Link2, Pencil, Plus, Save, Trash2, Upload, Users, X } from "lucide-react"

import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { RichTextView } from "@/components/eraser/rich-text"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { Textarea } from "@/components/ui/textarea"
import type { CampaignMemberRecord, CampaignRecord, CharacterRecord } from "@/lib/google-sheets"
import type { CampaignNpcRecord } from "@/lib/shop-schema"
import { parseListCell } from "@/lib/multiple-values"

const CharacterInventory = dynamic(() => import("@/components/eraser/character-inventory").then((module) => module.CharacterInventory), {
  loading: () => <div className="min-h-32 animate-pulse rounded-2xl border border-dashed bg-muted/20" />,
})

const GroupNpcs = dynamic(() => import("@/components/eraser/group-npcs").then((module) => module.GroupNpcs), {
  loading: () => <div className="min-h-32 animate-pulse rounded-2xl border border-dashed bg-muted/20" />,
})

function DeferredCampaignInventory({ campaignId, readOnly }: { campaignId: string; readOnly: boolean }) {
  const anchorRef = useRef<HTMLDivElement | null>(null)
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const element = anchorRef.current
    if (!element || !("IntersectionObserver" in window)) {
      setVisible(true)
      return
    }
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return
      setVisible(true)
      observer.disconnect()
    }, { rootMargin: "320px" })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  return <div ref={anchorRef} className="min-h-32">{visible && <CharacterInventory characterId={campaignId} endpoint={`/api/campaigns/${encodeURIComponent(campaignId)}/inventory`} flat readOnly={readOnly} />}</div>
}

export function CampaignDashboard({
  initialCampaign, initialMembers, initialGroupNpcs, npcsUnavailable = false, canManage, ownedCharacterIds, userEmail, hiddenCharacterIds = [], canHideCharacters = false, initialRoll20Url = "", canEditRoll20 = false,
}: {
  initialCampaign: CampaignRecord
  initialMembers: CampaignMemberRecord[]
  initialGroupNpcs: CampaignNpcRecord[]
  /** Les PNJ du groupe n'ont pas pu être lus (Google occupé) : la carte le dit et réessaie. */
  npcsUnavailable?: boolean
  canManage: boolean
  ownedCharacterIds: string[]
  userEmail: string
  /** Pour le MJ : les personnages qu'il cache aux autres joueurs de la campagne. */
  hiddenCharacterIds?: string[]
  /** Le serveur partagé est là : le MJ peut cacher un personnage aux autres joueurs. */
  canHideCharacters?: boolean
  /** Le lien de la partie Roll20, montré à toute la table. */
  initialRoll20Url?: string
  /** Le MJ peut coller ce lien (serveur partagé joignable). */
  canEditRoll20?: boolean
}) {
  const [campaign, setCampaign] = useState(initialCampaign)
  const [hiddenCharacters, setHiddenCharacters] = useState(hiddenCharacterIds)
  const [hidingId, setHidingId] = useState("")
  const [hidingError, setHidingError] = useState("")
  /** Cache (ou remontre) un personnage aux autres joueurs : il reste dans la campagne, son joueur le voit toujours. */
  async function toggleHidden(character: CampaignMemberRecord) {
    const hidden = !hiddenCharacters.includes(character.id)
    // L'œil change tout de suite ; un refus le remet comme il était.
    const before = hiddenCharacters
    setHiddenCharacters(hidden ? [...hiddenCharacters, character.id] : hiddenCharacters.filter((id) => id !== character.id))
    setHidingId(character.id); setHidingError("")
    try {
      const response = await fetch(`/api/campaigns/${encodeURIComponent(campaign.id)}/characters`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ characterId: character.id, hidden }) })
      const payload = (await response.json().catch(() => ({}))) as { hidden?: string[]; error?: string }
      if (!response.ok || !payload.hidden) throw new Error(payload.error || "Ce choix n’a pas pu être enregistré.")
      setHiddenCharacters(payload.hidden)
    } catch (caught) {
      setHiddenCharacters(before)
      setHidingError(caught instanceof Error ? caught.message : "Ce choix n’a pas pu être enregistré.")
    }
    setHidingId("")
  }
  const [members, setMembers] = useState(initialMembers)
  const [editingTitle, setEditingTitle] = useState(false)
  const [title, setTitle] = useState(campaign.name)
  const [editingDescription, setEditingDescription] = useState(false)
  const [description, setDescription] = useState(campaign.description)
  const [editingBanner, setEditingBanner] = useState(false)
  const [bannerUrl, setBannerUrl] = useState(campaign.bannerUrl)
  const [bannerFile, setBannerFile] = useState<File | null>(null)
  const [accentColor, setAccentColor] = useState(campaign.accentColor)
  const [roll20Url, setRoll20Url] = useState(initialRoll20Url)
  const [roll20Draft, setRoll20Draft] = useState(initialRoll20Url)
  const [bannerError, setBannerError] = useState("")
  const [savingBanner, setSavingBanner] = useState(false)
  const [addingCharacter, setAddingCharacter] = useState(false)
  const [availableCharacters, setAvailableCharacters] = useState<CharacterRecord[]>([])
  const [availableLoading, setAvailableLoading] = useState(false)
  const [availableError, setAvailableError] = useState("")
  const [characterId, setCharacterId] = useState("")
  const selectedCharacter = availableCharacters.find((item) => item.id === characterId)
  // Un personnage peut être dans plusieurs campagnes : l'ajouter ne le copie que sur demande.
  const [duplicate, setDuplicate] = useState(false)
  const [selectedCharacterId, setSelectedCharacterId] = useState("")
  const [removeTarget, setRemoveTarget] = useState<CampaignMemberRecord | null>(null)
  const [removing, setRemoving] = useState(false)
  const [memberWarning, setMemberWarning] = useState("")
  useEffect(() => {
    const timer = window.setTimeout(() => setSelectedCharacterId(window.localStorage.getItem(`eraser-character:${userEmail}`) || ""), 0)
    return () => window.clearTimeout(timer)
  }, [userEmail])

  async function update(patch: Record<string, string>) {
    const response = await fetch(`/api/campaigns/${encodeURIComponent(campaign.id)}`, {
      method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(patch),
    })
    const payload = (await response.json()) as { campaign?: CampaignRecord }
    if (payload.campaign) {
      setCampaign(payload.campaign)
      window.dispatchEvent(new CustomEvent("eraser:campaign-updated", { detail: payload.campaign }))
    }
    return Boolean(payload.campaign)
  }

  // Le titre et la description s'affichent dès « Enregistrer » ; un refus rouvre l'éditeur avec le texte tapé.
  async function saveTitle() {
    const before = campaign
    setCampaign({ ...campaign, name: title }); setEditingTitle(false)
    if (!await update({ name: title }).catch(() => false)) { setCampaign(before); setEditingTitle(true) }
  }

  async function saveDescription() {
    const before = campaign
    setCampaign({ ...campaign, description }); setEditingDescription(false)
    if (!await update({ description }).catch(() => false)) { setCampaign(before); setEditingDescription(true) }
  }

  /** Le lien Roll20 seul (serveur partagé) ; rend le lien gardé, ou lève l'erreur à montrer. */
  async function saveRoll20Url(value: string) {
    const response = await fetch(`/api/campaigns/${encodeURIComponent(campaign.id)}`, {
      method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ roll20Url: value }),
    })
    const payload = (await response.json().catch(() => ({}))) as { roll20Url?: string; error?: string }
    if (!response.ok || typeof payload.roll20Url !== "string") throw new Error(payload.error || "Le lien Roll20 n’a pas pu être enregistré.")
    return payload.roll20Url
  }

  async function saveBanner(event: FormEvent) {
    event.preventDefault()
    if (savingBanner) return
    setSavingBanner(true); setBannerError("")
    try {
      // Le lien Roll20 d'abord : refusé (lien mal collé), le formulaire reste ouvert et rien d'autre ne change.
      if (canEditRoll20 && roll20Draft.trim() !== roll20Url) {
        const saved = await saveRoll20Url(roll20Draft)
        setRoll20Url(saved); setRoll20Draft(saved)
      }
      const bannerChanged = Boolean(bannerFile) || bannerUrl !== campaign.bannerUrl || accentColor !== campaign.accentColor
      if (!bannerChanged) { setEditingBanner(false); return }
      let response: Response
      if (bannerFile) {
        const form = new FormData()
        form.append("banner", bannerFile)
        form.append("accentColor", accentColor)
        response = await fetch(`/api/campaigns/${encodeURIComponent(campaign.id)}`, { method: "PATCH", body: form })
      } else {
        response = await fetch(`/api/campaigns/${encodeURIComponent(campaign.id)}`, {
          method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ bannerUrl, accentColor }),
        })
      }
      const payload = (await response.json().catch(() => ({}))) as { campaign?: CampaignRecord; error?: string }
      if (!payload.campaign) throw new Error(payload.error || "La bannière n’a pas pu être enregistrée.")
      setCampaign(payload.campaign)
      window.dispatchEvent(new CustomEvent("eraser:campaign-updated", { detail: payload.campaign }))
      setBannerUrl(payload.campaign.bannerUrl)
      setAccentColor(payload.campaign.accentColor)
      setBannerFile(null)
      setEditingBanner(false)
    } catch (caught) {
      setBannerError(caught instanceof Error ? caught.message : "La modification n’a pas pu être enregistrée.")
    } finally {
      setSavingBanner(false)
    }
  }

  /** Ouvre « Modifier » sur le lien Roll20 (le MJ qui n'en a pas encore mis). */
  function editRoll20() {
    setEditingBanner(true)
    window.setTimeout(() => document.getElementById("campaign-roll20")?.focus(), 0)
  }

  async function addCharacter() {
    if (!characterId) return
    setAvailableError("")
    const response = await fetch(`/api/campaigns/${encodeURIComponent(campaign.id)}/characters`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ characterId, duplicate }),
    })
    const payload = (await response.json()) as { character?: CampaignMemberRecord; warning?: string; error?: string }
    setMemberWarning(payload.warning || "")
    if (payload.character) {
      setMembers((current) => current.some((member) => member.id === payload.character!.id)
        ? current.map((member) => member.id === payload.character!.id ? payload.character! : member)
        : [...current, payload.character!])
      setCharacterId("")
      setAddingCharacter(false)
      return
    }
    setAvailableError(payload.error || "Le personnage n’a pas pu être ajouté.")
  }

  async function removeCharacter(character: CampaignMemberRecord) {
    setRemoving(true)
    setAvailableError("")
    try {
      const response = await fetch(`/api/campaigns/${encodeURIComponent(campaign.id)}/characters?characterId=${encodeURIComponent(character.id)}`, { method: "DELETE" })
      const payload = (await response.json()) as { removed?: string; warning?: string; error?: string }
      if (!response.ok || !payload.removed) throw new Error(payload.error || "Le personnage n’a pas pu être retiré.")
      setMemberWarning(payload.warning || "")
      setMembers((current) => current.filter((member) => member.id !== character.id))
      setRemoveTarget(null)
    } catch (caught) {
      setAvailableError(caught instanceof Error ? caught.message : "Le personnage n’a pas pu être retiré.")
    } finally {
      setRemoving(false)
    }
  }

  async function toggleCharacterPicker() {
    if (addingCharacter) {
      setAddingCharacter(false)
      return
    }
    setAddingCharacter(true)
    // Relu à chaque ouverture : un joueur a pu créer son personnage entre-temps.
    if (availableLoading) return
    setAvailableLoading(true)
    setAvailableError("")
    try {
      const response = await fetch(`/api/campaigns/${encodeURIComponent(campaign.id)}/characters`)
      const payload = (await response.json()) as { characters?: CharacterRecord[]; error?: string }
      if (!response.ok || !payload.characters) throw new Error(payload.error || "Chargement impossible.")
      setAvailableCharacters(payload.characters)
    } catch (caught) {
      setAvailableError(caught instanceof Error ? caught.message : "Les personnages n’ont pas pu être chargés.")
    } finally {
      setAvailableLoading(false)
    }
  }

  return (
    <div className="min-h-full" style={{ "--campaign-accent": campaign.accentColor } as CSSProperties}>
      <section className="relative min-h-64 overflow-hidden border-b bg-[#24211d] sm:min-h-80">
        {campaign.bannerUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={campaign.bannerUrl} alt={`Bannière de ${campaign.name}`} decoding="async" fetchPriority="high" className="absolute inset-0 size-full object-cover opacity-75" />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-[#d4c3a8]/45"><ImagePlus className="size-14" /></div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/15 to-black/15" />
        {canManage && <Button type="button" variant="secondary" size="sm" className="absolute right-5 top-5" onClick={() => { setBannerError(""); setRoll20Draft(roll20Url); setEditingBanner((value) => !value) }}><Pencil />Modifier</Button>}
        <div className="absolute inset-x-0 bottom-0 px-5 pb-7 sm:px-8">
          {editingTitle ? (
            <div className="flex max-w-2xl gap-2"><Input value={title} onChange={(event) => setTitle(event.target.value)} className="h-12 bg-background/95 text-xl" autoFocus /><Button onClick={saveTitle} size="lg"><Check /></Button></div>
          ) : canManage ? (
            <button type="button" onDoubleClick={() => setEditingTitle(true)} className="block max-w-full text-left text-white" title="Double-cliquer pour modifier le titre">
              <h1 className="font-display text-4xl font-semibold sm:text-6xl">{campaign.name}</h1>
            </button>
          ) : <h1 className="font-display text-4xl font-semibold text-white sm:text-6xl">{campaign.name}</h1>}
          {editingDescription ? (
            <div className="mt-3 max-w-3xl"><Textarea value={description} onChange={(event) => setDescription(event.target.value)} className="min-h-24 border-white/30 bg-black/45 text-white placeholder:text-white/55" autoFocus /><div className="mt-2 flex gap-2"><Button onClick={saveDescription}><Save />Enregistrer</Button><Button variant="ghost" className="text-white hover:bg-white/10 hover:text-white" onClick={() => setEditingDescription(false)}>Annuler</Button></div></div>
          ) : canManage ? (
            <button type="button" onDoubleClick={() => setEditingDescription(true)} className="mt-2 block max-w-3xl whitespace-pre-wrap text-left text-sm leading-6 text-white/80 hover:text-white" title="Double-cliquer pour modifier la description">
              {campaign.description || "Double-cliquer pour ajouter une description…"}
            </button>
          ) : campaign.description ? <RichTextView html={campaign.description} className="mt-2 max-w-3xl text-sm leading-6 text-white/80" /> : null}
          {/* La partie Roll20 de la campagne, à un clic pour toute la table (ouverte dans le navigateur). */}
          {roll20Url ? (
            <a href={roll20Url} target="_blank" rel="noreferrer" title={roll20Url} className="mt-4 inline-flex max-w-full items-center gap-2 rounded-full bg-white/95 py-2 pl-3 pr-4 text-sm font-semibold text-[#24211d] shadow-md outline-none transition hover:-translate-y-px hover:bg-white focus-visible:ring-2 focus-visible:ring-white/80">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full text-white" style={{ backgroundColor: campaign.accentColor }}><Dices className="size-3.5" /></span>
              <span className="truncate">Rejoindre la partie sur Roll20</span>
              <ExternalLink className="size-3.5 shrink-0 opacity-60" />
            </a>
          ) : canEditRoll20 && !editingBanner ? (
            <button type="button" onClick={editRoll20} className="mt-4 inline-flex items-center gap-2 rounded-full border border-dashed border-white/45 px-3.5 py-1.5 text-xs font-medium text-white/80 outline-none transition hover:border-white/80 hover:text-white focus-visible:ring-2 focus-visible:ring-white/80">
              <Link2 className="size-3.5" />Ajouter le lien de la partie Roll20
            </button>
          ) : null}
        </div>
      </section>

      {editingBanner && (
        <form onSubmit={saveBanner} className="border-b bg-card px-5 py-4 sm:px-8">
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(13rem,18rem)]">
            <div className="grid gap-2"><Label htmlFor="banner-url">URL de l’image</Label><Input id="banner-url" type="url" value={bannerUrl} onChange={(event) => { setBannerUrl(event.target.value); setBannerFile(null) }} placeholder="https://…" /></div>
            <div className="grid gap-2"><Label htmlFor="banner-file">Importer depuis l’ordinateur</Label><Input id="banner-file" type="file" accept="image/*" onChange={(event) => setBannerFile(event.target.files?.[0] || null)} /></div>
            <div className="grid gap-2"><Label htmlFor="campaign-accent">Couleur d’accent</Label><div className="flex items-center gap-3"><Input id="campaign-accent" type="color" value={accentColor} onChange={(event) => setAccentColor(event.target.value)} className="w-16 px-1" /><span className="text-sm font-medium tabular-nums text-muted-foreground">{accentColor}</span></div></div>
            {canEditRoll20 && <div className="grid gap-2 sm:col-span-2"><Label htmlFor="campaign-roll20">Lien de la partie Roll20</Label><Input id="campaign-roll20" type="url" inputMode="url" value={roll20Draft} onChange={(event) => setRoll20Draft(event.target.value)} placeholder="https://app.roll20.net/join/…" /><p className="text-xs text-muted-foreground">Les joueurs le retrouvent sur cette page, dans le bouton « Rejoindre la partie sur Roll20 ». Vide : le bouton disparaît.</p></div>}
            <div className="flex items-end gap-2"><Button type="submit" disabled={savingBanner}>{savingBanner ? <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" /> : <Upload />}Enregistrer</Button><Button type="button" variant="ghost" disabled={savingBanner} onClick={() => { setBannerError(""); setRoll20Draft(roll20Url); setEditingBanner(false) }}>Annuler</Button></div>
            {bannerError && <p className="text-sm text-destructive sm:col-span-2" role="alert">{bannerError}</p>}
          </div>
        </form>
      )}

      <div className="w-full px-5 py-8 sm:px-8">
        <section>
          <div className="flex items-center justify-between gap-4"><h2 className="flex items-center gap-2 font-display text-2xl font-semibold"><Users className="size-5" />Personnages joueurs</h2>{canManage && <Button onClick={() => void toggleCharacterPicker()}>{addingCharacter ? <X /> : <Plus />}{addingCharacter ? "Fermer" : "Ajouter"}</Button>}</div>
          {canManage && addingCharacter && (
            <div className="mt-5 grid gap-4 rounded-xl border bg-background/60 p-4 sm:grid-cols-[1fr_auto]">
              <NativeSelect className="w-full" value={characterId} disabled={availableLoading} onChange={(event) => { setCharacterId(event.target.value); setDuplicate(false) }}>
                <NativeSelectOption value="">Choisir un personnage</NativeSelectOption>
                {availableCharacters.filter((character) => !members.some((member) => member.id === character.id)).map((character) => <NativeSelectOption key={character.id} value={character.id}>{character.name}{character.playerName ? ` • ${character.playerName}` : ""}{character.campaigns.length ? ` — ${character.campaigns.map((item) => item.name).join(", ")}` : " — sans campagne"}</NativeSelectOption>)}
              </NativeSelect>
              <Button onClick={addCharacter} disabled={!characterId || availableLoading}>{availableLoading ? <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" /> : <Plus />}{availableLoading ? "Chargement…" : "Ajouter"}</Button>
              {availableError && <p className="text-sm text-destructive sm:col-span-2">{availableError}</p>}
              {selectedCharacter?.campaigns.length ? (
                <label className="flex items-center gap-2 text-sm sm:col-span-2"><Checkbox checked={duplicate} onCheckedChange={(checked) => setDuplicate(checked === true)} />Ajouter une copie séparée plutôt que le personnage lui-même (il reste aussi dans ses autres campagnes)</label>
              ) : null}
            </div>
          )}
          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {members.length ? members.map((character) => {
              const canOpen = canManage || (ownedCharacterIds.includes(character.id) && selectedCharacterId === character.id)
              const people = parseListCell(character.people).entries.join(" · ")
              const classes = parseListCell(character.classes).entries.join(" · ")
              const honoraryTitle = parseListCell(character.honoraryTitle).selected
              const classAndLevel = [classes || NO_CLASS, character.level ? `Niveau ${character.level}` : ""].filter(Boolean).join(" · ")
              return <article key={character.id} className="group relative grid min-w-0 grid-cols-[6.5rem_minmax(0,1fr)] overflow-hidden rounded-2xl border bg-card/75 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"><div className="relative min-h-36 bg-muted"><div className="absolute inset-0 grid place-items-center"><CircleUserRound className="size-10 text-primary/20" /></div><img src={`/api/characters/portrait/${encodeURIComponent(character.id)}`} alt={`Portrait de ${character.name}`} loading="lazy" decoding="async" className="absolute inset-0 size-full object-cover transition duration-300 group-hover:scale-[1.025]" onError={(event) => { event.currentTarget.style.display = "none" }} /></div><div className="min-w-0 p-4 pr-11"><h3 className="font-display text-xl font-semibold leading-tight">{character.name}{character.playerName && <span className="font-sans text-sm font-normal text-muted-foreground"> • {character.playerName}</span>}</h3>{honoraryTitle && <p className="mt-1 text-sm font-medium leading-snug" style={{ color: campaign.accentColor }}>{honoraryTitle}</p>}{classAndLevel && <p className="mt-3 text-sm font-semibold leading-snug text-foreground/80">{classAndLevel}</p>}{people && <p className="mt-1 text-sm leading-snug text-muted-foreground">{people}</p>}{canManage && hiddenCharacters.includes(character.id) && <p className="mt-2 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"><EyeOff className="size-3" />Caché aux autres joueurs</p>}</div><div className="absolute right-2 top-2 flex flex-col gap-1">{canHideCharacters && <Button type="button" size="icon-sm" variant={hiddenCharacters.includes(character.id) ? "secondary" : "ghost"} aria-pressed={hiddenCharacters.includes(character.id)} disabled={hidingId === character.id} aria-label={hiddenCharacters.includes(character.id) ? `Montrer ${character.name} aux autres joueurs` : `Cacher ${character.name} aux autres joueurs`} title={hiddenCharacters.includes(character.id) ? "Caché aux autres joueurs — cliquer pour le leur montrer" : "Visible de tous — cliquer pour le cacher aux autres joueurs (son joueur le voit toujours)"} onClick={() => void toggleHidden(character)}>{hiddenCharacters.includes(character.id) ? <EyeOff /> : <Eye />}</Button>}{canOpen && <Button asChild size="icon-sm" variant="ghost" aria-label={`Ouvrir la fiche de ${character.name}`} title="Ouvrir la fiche"><Link href={`/personnage/${encodeURIComponent(character.id)}`} prefetch={false}><ArrowUpRight /></Link></Button>}{canManage && <Button type="button" size="icon-sm" variant="ghost" className="text-destructive hover:bg-destructive/10 hover:text-destructive" aria-label={`Retirer ${character.name} de la campagne`} title="Retirer de la campagne" onClick={() => setRemoveTarget(character)}><Trash2 /></Button>}</div></article>
            }) : <p className="text-sm text-muted-foreground">Aucun personnage dans cette campagne.</p>}
          </div>
          {canManage && !addingCharacter && availableError && <p className="mt-3 text-sm text-destructive">{availableError}</p>}
          {hidingError && <p className="mt-3 text-sm text-destructive">{hidingError}</p>}
          {canManage && memberWarning && <p className="mt-3 rounded-xl border border-amber-400/40 bg-amber-50 px-4 py-3 text-sm text-amber-900">{memberWarning}</p>}
          <AlertDialog open={Boolean(removeTarget)} onOpenChange={(open) => { if (!open && !removing) setRemoveTarget(null) }}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Retirer ce personnage de la campagne ?</AlertDialogTitle>
                <AlertDialogDescription>{removeTarget ? `${removeTarget.name} ne fera plus partie de ${campaign.name}. Sa fiche et son inventaire ne sont pas supprimés : il pourra être rajouté plus tard ou rejoindre une autre campagne.` : ""}</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={removing}>Annuler</AlertDialogCancel>
                <AlertDialogAction variant="destructive" disabled={removing} onClick={(event) => { event.preventDefault(); if (removeTarget) void removeCharacter(removeTarget) }}>{removing ? <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" /> : <Trash2 />}Retirer</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </section>

        <section className="deferred-section mt-12 border-t pt-8">
          <GroupNpcs key={npcsUnavailable ? "indisponibles" : "lus"} campaignId={campaign.id} initialNpcs={initialGroupNpcs} unavailable={npcsUnavailable} canManage={canManage} />
        </section>

        {/* Le journal : la dernière session y sera résumée ; pour l'instant, le chemin vers le journal. */}
        <section className="deferred-section mt-12 border-t pt-8" aria-labelledby="journal-derniere-session">
          <h2 id="journal-derniere-session" className="mb-6 flex items-center gap-2 font-display text-2xl font-semibold"><BookOpen className="size-5" />Journal<span className="font-sans text-base font-normal text-muted-foreground">• Dernière session</span></h2>
          <Link href={`/campagne/${encodeURIComponent(campaign.id)}/journal`} prefetch={false} className="group flex items-center gap-4 rounded-2xl border bg-card/75 p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md" style={{ borderColor: `${campaign.accentColor}44` }}>
            <span className="flex size-11 shrink-0 items-center justify-center rounded-xl" style={{ color: campaign.accentColor, backgroundColor: `${campaign.accentColor}18` }}><BookOpen className="size-5" /></span>
            <span className="min-w-0 flex-1 font-display text-xl font-semibold">Journal de {campaign.name}</span>
            <ArrowUpRight className="size-5 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </Link>
        </section>

        <section className="deferred-section mt-12 border-t pt-8">
          <h2 className="mb-6 flex items-center gap-2 font-display text-2xl font-semibold"><Backpack className="size-5" />Inventaire de la campagne</h2>
          <DeferredCampaignInventory campaignId={campaign.id} readOnly={!canManage && !ownedCharacterIds.length} />
        </section>
      </div>
    </div>
  )
}
