"use client"

import { useState } from "react"
import { ArrowUpRight, CalendarPlus, CircleMinus, CircleUserRound, ImagePlus, LoaderCircle, Pencil, Plus, Trash2, UsersRound } from "lucide-react"
import Link from "next/link"

import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { NpcManager } from "@/components/eraser/npc-manager"
import { CreateSessionDialog, deleteSession, patchSession, sessionDateLabel, type CampaignSessionRecord } from "@/components/eraser/session-picker"
import { SavedShopCollection } from "@/components/eraser/shop-generator"
import type { CampaignNpcRecord, SavedShopRecord, ShopGeneratorItem } from "@/lib/shop-schema"

export type SessionMember = { id: string; name: string; people: string; classes: string; level: string; honoraryTitle: string }

function SectionTitle({ children, count }: { children: string; count?: number }) {
  return <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-primary/70">{children}{count !== undefined && <span className="ml-2 text-muted-foreground">{count}</span>}</p>
}

function RenameSessionDialog({ session, onClose, onRename }: { session: CampaignSessionRecord | null; onClose: () => void; onRename: (name: string) => Promise<void> }) {
  const [name, setName] = useState(session?.name || "")
  const [pending, setPending] = useState(false)
  return <Dialog open={Boolean(session)} onOpenChange={(open) => { if (!open && !pending) onClose() }}>
    <DialogContent className="sm:max-w-md">
      <DialogHeader><DialogTitle>Renommer la session</DialogTitle></DialogHeader>
      <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); if (!name.trim()) return; setPending(true); void onRename(name.trim()).finally(() => setPending(false)) }}>
        <Input autoFocus value={name} onChange={(event) => setName(event.target.value)} maxLength={160} aria-label="Titre de la session" />
        <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onClose} disabled={pending}>Annuler</Button><Button type="submit" disabled={pending || !name.trim()}>{pending ? <LoaderCircle className="animate-spin" /> : <Pencil />}Renommer</Button></div>
      </form>
    </DialogContent>
  </Dialog>
}

function PlayerCard({ member, pending, onRemove }: { member: SessionMember; pending: boolean; onRemove: () => void }) {
  const classAndLevel = [member.classes, member.level ? `Niveau ${member.level}` : ""].filter(Boolean).join(" · ")
  return <article className="group relative grid min-w-0 grid-cols-[5.5rem_minmax(0,1fr)] overflow-hidden rounded-2xl border bg-card/75 shadow-sm">
    <div className="relative min-h-28 bg-muted">
      <div className="absolute inset-0 grid place-items-center"><CircleUserRound className="size-9 text-primary/20" /></div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`/api/characters/portrait/${encodeURIComponent(member.id)}`} alt={`Portrait de ${member.name}`} loading="lazy" decoding="async" className="absolute inset-0 size-full object-cover" onError={(event) => { event.currentTarget.style.display = "none" }} />
    </div>
    <div className="min-w-0 p-4 pr-11">
      <h3 className="font-display text-lg font-semibold leading-tight">{member.name}</h3>
      {member.honoraryTitle && <p className="mt-1 text-sm font-medium text-primary">{member.honoraryTitle}</p>}
      {classAndLevel && <p className="mt-2 text-sm font-semibold text-foreground/80">{classAndLevel}</p>}
      {member.people && <p className="mt-1 text-sm text-muted-foreground">{member.people}</p>}
    </div>
    <div className="absolute right-2 top-2 flex flex-col gap-1">
      <Button asChild size="icon-sm" variant="ghost" aria-label={`Ouvrir la fiche de ${member.name}`} title="Ouvrir la fiche"><Link href={`/personnage/${encodeURIComponent(member.id)}`} prefetch={false}><ArrowUpRight /></Link></Button>
      <Button type="button" size="icon-sm" variant="ghost" className="text-destructive hover:bg-destructive/10 hover:text-destructive" disabled={pending} aria-label={`Retirer ${member.name} de la session`} title="Retirer de la session" onClick={onRemove}><CircleMinus /></Button>
    </div>
  </article>
}

export function SessionCreator({ campaignId, initialSessions, initialSessionId, members, npcs, shops, generatorItems }: {
  campaignId: string
  initialSessions: CampaignSessionRecord[]
  initialSessionId: string
  members: SessionMember[]
  npcs: CampaignNpcRecord[]
  shops: SavedShopRecord[]
  generatorItems: ShopGeneratorItem[]
}) {
  const [sessions, setSessions] = useState(initialSessions)
  const [selectedId, setSelectedId] = useState(initialSessionId || initialSessions.at(-1)?.id || "")
  const [creating, setCreating] = useState(false)
  const [renaming, setRenaming] = useState<CampaignSessionRecord | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState("")
  const session = sessions.find((candidate) => candidate.id === selectedId) || null

  function select(id: string) {
    setSelectedId(id)
    setError("")
    // L'adresse garde la session choisie (retour arrière, rechargement) sans recharger la page.
    const url = new URL(window.location.href)
    if (id) url.searchParams.set("session", id); else url.searchParams.delete("session")
    window.history.replaceState(null, "", url)
  }

  function replace(updated: CampaignSessionRecord) {
    setSessions((current) => current.map((candidate) => candidate.id === updated.id ? updated : candidate))
  }

  async function change(body: Parameters<typeof patchSession>[2]) {
    if (!session) return
    replace(await patchSession(campaignId, session.id, body))
  }

  async function guarded(task: () => Promise<void>) {
    setPending(true); setError("")
    try { await task() } catch (caught) { setError(caught instanceof Error ? caught.message : "La session n’a pas pu être modifiée.") }
    setPending(false)
  }

  async function uploadBanner(file?: File) {
    if (!file) return
    const form = new FormData()
    form.append("banner", file)
    await guarded(() => change(form))
  }

  async function removeSession() {
    if (!session) return
    await guarded(async () => {
      await deleteSession(campaignId, session.id)
      const remaining = sessions.filter((candidate) => candidate.id !== session.id)
      setSessions(remaining)
      select(remaining.at(-1)?.id || "")
      setDeleting(false)
    })
  }

  const inSession = new Set(session?.characterIds || [])
  const players = members.filter((member) => inSession.has(member.id))
  const addable = members.filter((member) => !inSession.has(member.id))

  return <div className="mt-7 space-y-8">
    <div className="flex flex-col gap-3 rounded-2xl border bg-card/65 p-3 sm:flex-row sm:items-center">
      <NativeSelect value={selectedId} onChange={(event) => select(event.target.value)} aria-label="Session" className="w-full sm:w-auto" disabled={!sessions.length}>
        {!sessions.length && <NativeSelectOption value="">Aucune session</NativeSelectOption>}
        {sessions.map((candidate) => <NativeSelectOption key={candidate.id} value={candidate.id}>{candidate.name}{candidate.createdAt ? ` — ${sessionDateLabel(candidate.createdAt)}` : ""}</NativeSelectOption>)}
      </NativeSelect>
      <Button type="button" onClick={() => setCreating(true)}><CalendarPlus />Créer une nouvelle session</Button>
      {session && <div className="flex gap-1 sm:ml-auto">
        <Button type="button" variant="ghost" size="icon-sm" title="Renommer la session" aria-label="Renommer la session" disabled={pending} onClick={() => setRenaming(session)}><Pencil /></Button>
        <Button type="button" variant="ghost" size="icon-sm" className="text-destructive" title="Supprimer la session" aria-label="Supprimer la session" disabled={pending} onClick={() => setDeleting(true)}><Trash2 /></Button>
      </div>}
    </div>

    {error && <p className="rounded-xl border border-destructive/25 bg-destructive/5 px-4 py-3 text-sm text-destructive">{error}</p>}

    {!session ? <section className="grid min-h-60 place-items-center rounded-2xl border border-dashed bg-card/35 p-8 text-center">
      <div>
        <CalendarPlus className="mx-auto size-9 text-primary/45" />
        <p className="font-display mt-3 text-2xl font-semibold">Aucune session</p>
        <p className="mt-1 text-sm text-muted-foreground">Crée une session pour y préparer joueurs, PNJs et magasins.</p>
        <Button type="button" className="mt-5" onClick={() => setCreating(true)}><Plus />Créer une nouvelle session</Button>
      </div>
    </section> : <>
      <section className="relative overflow-hidden rounded-3xl border bg-muted/40">
        <div className="relative aspect-[21/7] min-h-44 w-full">
          {session.bannerUrl
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={session.bannerUrl} alt={`Bannière de ${session.name}`} className="absolute inset-0 size-full object-cover" />
            : <div className="absolute inset-0 bg-gradient-to-br from-primary/25 via-primary/10 to-transparent" />}
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/15 to-transparent" />
          <div className="absolute inset-x-5 bottom-4 flex flex-wrap items-end justify-between gap-3 text-white sm:inset-x-7 sm:bottom-6">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/75">Session{session.createdAt ? ` · ${sessionDateLabel(session.createdAt)}` : ""}</p>
              <h2 className="font-display mt-1 text-3xl font-semibold drop-shadow sm:text-4xl">{session.name}</h2>
            </div>
            <label className="flex cursor-pointer items-center gap-2 rounded-lg bg-black/55 px-3 py-2 text-xs font-medium backdrop-blur transition hover:bg-black/70">
              {pending ? <LoaderCircle className="size-4 animate-spin" /> : <ImagePlus className="size-4" />}{session.bannerUrl ? "Changer la bannière" : "Ajouter une bannière"}
              <input type="file" accept="image/*" className="sr-only" disabled={pending} onChange={(event) => { void uploadBanner(event.target.files?.[0]); event.target.value = "" }} />
            </label>
          </div>
        </div>
      </section>

      <section>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SectionTitle count={players.length}>Joueurs</SectionTitle>
          {addable.length > 0 && <NativeSelect value="" aria-label="Ajouter un joueur" disabled={pending} onChange={(event) => { const id = event.target.value; if (id) void guarded(() => change({ add: { characterIds: [id] } })) }}>
            <NativeSelectOption value="">+ Ajouter un joueur…</NativeSelectOption>
            {addable.map((member) => <NativeSelectOption key={member.id} value={member.id}>{member.name}</NativeSelectOption>)}
          </NativeSelect>}
        </div>
        {players.length
          ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{players.map((member) => <PlayerCard key={member.id} member={member} pending={pending} onRemove={() => void guarded(() => change({ remove: { characterIds: [member.id] } }))} />)}</div>
          : <p className="flex items-center gap-2 rounded-2xl border border-dashed px-5 py-8 text-sm text-muted-foreground"><UsersRound className="size-4" />{members.length ? "Aucun joueur dans cette session." : "Aucun personnage joueur dans la campagne."}</p>}
      </section>

      <section className="border-t pt-8">
        <SectionTitle count={session.npcIds.length}>PNJs</SectionTitle>
        <NpcManager initialNpcs={npcs} pageLinked={campaignId} mode="session" session={{
          ids: session.npcIds,
          onAdd: (ids) => change({ add: { npcIds: ids } }),
          onRemove: (id) => change({ remove: { npcIds: [id] } }),
        }} />
      </section>

      <section className="border-t pt-8">
        <SectionTitle count={session.shopIds.length}>Magasins</SectionTitle>
        <SavedShopCollection initialShops={shops} pageLinked={campaignId} npcs={npcs} generatorItems={generatorItems} mode="session" session={{
          ids: session.shopIds,
          onAdd: (ids) => change({ add: { shopIds: ids } }),
          onRemove: (id) => change({ remove: { shopIds: [id] } }),
        }} />
      </section>
    </>}

    <CreateSessionDialog open={creating} campaignId={campaignId} onClose={() => setCreating(false)} onCreated={(created) => {
      setCreating(false)
      setSessions((current) => [...current, created])
      select(created.id)
    }} />
    {renaming && <RenameSessionDialog session={renaming} onClose={() => setRenaming(null)} onRename={async (name) => { await guarded(() => change({ name })); setRenaming(null) }} />}
    <AlertDialog open={deleting} onOpenChange={(open) => { if (!open && !pending) setDeleting(false) }}>
      <AlertDialogContent>
        <AlertDialogHeader><AlertDialogTitle>Supprimer « {session?.name} » ?</AlertDialogTitle><AlertDialogDescription>La session disparaît, mais ses PNJs et magasins restent dans la campagne.</AlertDialogDescription></AlertDialogHeader>
        <AlertDialogFooter><AlertDialogCancel disabled={pending}>Annuler</AlertDialogCancel><AlertDialogAction variant="destructive" disabled={pending} onClick={(event) => { event.preventDefault(); void removeSession() }}>{pending ? <LoaderCircle className="animate-spin" /> : <Trash2 />}Supprimer</AlertDialogAction></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>
}
