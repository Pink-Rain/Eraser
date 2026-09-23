"use client"

import { useEffect, useMemo, useState, type FormEvent } from "react"
import { CalendarPlus, Check, LoaderCircle, MapPinned, Plus, Search } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import type { CampaignSessionRecord, SessionMembership } from "@/lib/campaign-sessions"
import { cn } from "@/lib/utils"

export type { CampaignSessionRecord } from "@/lib/campaign-sessions"

async function sessionJson<T>(response: Response, fallback: string) {
  const payload = (await response.json().catch(() => ({}))) as T & { error?: string }
  if (!response.ok) throw new Error(payload.error || fallback)
  return payload
}

function sessionsUrl(campaignId: string, sessionId = "") {
  return `/api/campaigns/${encodeURIComponent(campaignId)}/sessions${sessionId ? `/${encodeURIComponent(sessionId)}` : ""}`
}

export async function fetchSessions(campaignId: string) {
  const payload = await sessionJson<{ sessions: CampaignSessionRecord[] }>(await fetch(sessionsUrl(campaignId), { cache: "no-store" }), "Les sessions n’ont pas pu être chargées.")
  return payload.sessions
}

export async function createSession(campaignId: string, name: string) {
  const payload = await sessionJson<{ session: CampaignSessionRecord }>(await fetch(sessionsUrl(campaignId), {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name }),
  }), "La session n’a pas pu être créée.")
  return payload.session
}

export async function patchSession(campaignId: string, sessionId: string, body: { name?: string; add?: SessionMembership; remove?: SessionMembership } | FormData) {
  const init: RequestInit = body instanceof FormData
    ? { method: "PATCH", body }
    : { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }
  const payload = await sessionJson<{ session: CampaignSessionRecord }>(await fetch(sessionsUrl(campaignId, sessionId), init), "La session n’a pas pu être modifiée.")
  return payload.session
}

export async function deleteSession(campaignId: string, sessionId: string) {
  await sessionJson<{ ok: true }>(await fetch(sessionsUrl(campaignId, sessionId), { method: "DELETE" }), "La session n’a pas pu être supprimée.")
}

/** De la plus récente à la plus ancienne. */
export function newestFirst(sessions: CampaignSessionRecord[]) {
  return [...sessions].sort((left, right) => right.createdAt.localeCompare(left.createdAt))
}

export function sessionDateLabel(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? "" : new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" }).format(date)
}

/** « Créer une nouvelle session » : un titre, et c'est tout. */
export function CreateSessionDialog({ open, campaignId, onClose, onCreated }: { open: boolean; campaignId: string; onClose: () => void; onCreated: (session: CampaignSessionRecord) => void }) {
  const [name, setName] = useState("")
  const [pending, setPending] = useState(false)
  const [error, setError] = useState("")
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!name.trim() || pending) return
    setPending(true); setError("")
    try {
      const session = await createSession(campaignId, name.trim())
      setName("")
      onCreated(session)
    } catch (caught) { setError(caught instanceof Error ? caught.message : "La session n’a pas pu être créée.") }
    setPending(false)
  }
  return <Dialog open={open} onOpenChange={(next) => { if (!next && !pending) { setError(""); onClose() } }}>
    <DialogContent className="sm:max-w-md">
      <DialogHeader><DialogTitle>Créer une nouvelle session</DialogTitle><DialogDescription>Les personnages joueurs de la campagne y sont ajoutés automatiquement.</DialogDescription></DialogHeader>
      <form className="space-y-4" onSubmit={submit}>
        <Input autoFocus value={name} onChange={(event) => setName(event.target.value)} maxLength={160} placeholder="Titre de la session" aria-label="Titre de la session" />
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" disabled={pending} onClick={onClose}>Annuler</Button>
          <Button type="submit" disabled={pending || !name.trim()}>{pending ? <LoaderCircle className="animate-spin" /> : <Plus />}Créer</Button>
        </div>
      </form>
    </DialogContent>
  </Dialog>
}

/**
 * Liste des sessions d'une campagne, de la plus récente à la plus ancienne, avec
 * recherche par nom. La plus récente est choisie d'office.
 */
export function SessionPicker({ campaignId, value, onChange }: { campaignId: string; value: string; onChange: (sessionId: string) => void }) {
  const [sessions, setSessions] = useState<CampaignSessionRecord[] | null>(null)
  const [error, setError] = useState("")
  const [query, setQuery] = useState("")
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    let alive = true
    fetchSessions(campaignId)
      .then((loaded) => {
        if (!alive) return
        const ordered = newestFirst(loaded)
        setSessions(ordered)
        if (ordered[0]) onChange(ordered[0].id)
      })
      .catch((caught) => { if (alive) { setSessions([]); setError(caught instanceof Error ? caught.message : "Chargement impossible.") } })
    return () => { alive = false }
    // onChange ne doit pas relancer le chargement : seule la campagne compte.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignId])

  const normalized = query.trim().toLocaleLowerCase("fr")
  const filtered = useMemo(() => (sessions || []).filter((session) => !normalized || session.name.toLocaleLowerCase("fr").includes(normalized)), [sessions, normalized])

  return <div className="space-y-2">
    <div className="flex gap-2">
      <div className="relative min-w-0 flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={query} onChange={(event) => setQuery(event.target.value)} className="pl-9" placeholder="Rechercher une session…" aria-label="Rechercher une session" /></div>
      <Button type="button" variant="outline" onClick={() => setCreating(true)}><CalendarPlus />Créer une session</Button>
    </div>
    {error && <p className="text-sm text-destructive">{error}</p>}
    <div className="max-h-60 space-y-1 overflow-y-auto rounded-xl border p-1.5">
      {sessions === null
        ? <div className="grid min-h-24 place-items-center"><LoaderCircle className="animate-spin text-muted-foreground" /></div>
        : filtered.length
          ? filtered.map((session) => <button key={session.id} type="button" onClick={() => onChange(session.id)} className={cn("flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm", value === session.id ? "bg-primary text-primary-foreground" : "hover:bg-accent")}>
            {value === session.id ? <Check className="size-4 shrink-0" /> : <MapPinned className="size-4 shrink-0 text-primary" />}
            <span className="min-w-0 flex-1 truncate font-medium">{session.name}</span>
            <span className={cn("shrink-0 text-xs", value === session.id ? "text-primary-foreground/80" : "text-muted-foreground")}>{sessionDateLabel(session.createdAt)}</span>
          </button>)
          : <p className="px-3 py-7 text-center text-sm text-muted-foreground">{sessions.length ? "Aucune session ne correspond." : "Aucune session. Crée la première !"}</p>}
    </div>
    <CreateSessionDialog open={creating} campaignId={campaignId} onClose={() => setCreating(false)} onCreated={(session) => {
      setCreating(false)
      setQuery("")
      setSessions((current) => newestFirst([session, ...(current || [])]))
      onChange(session.id)
    }} />
  </div>
}

/** La fenêtre « Ajouter à la session » des pages PNJs et magasins. */
export function AddToSessionDialog({ open, campaignId, subject, pending, onClose, onConfirm }: { open: boolean; campaignId: string; subject: string; pending: boolean; onClose: () => void; onConfirm: (sessionId: string) => void }) {
  const [sessionId, setSessionId] = useState("")
  return <Dialog open={open} onOpenChange={(next) => { if (!next && !pending) onClose() }}>
    <DialogContent className="sm:max-w-lg">
      <DialogHeader><DialogTitle>Ajouter à la session</DialogTitle><DialogDescription>{subject}</DialogDescription></DialogHeader>
      {open && <SessionPicker campaignId={campaignId} value={sessionId} onChange={setSessionId} />}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" disabled={pending} onClick={onClose}>Annuler</Button>
        <Button type="button" disabled={pending || !sessionId} onClick={() => onConfirm(sessionId)}>{pending ? <LoaderCircle className="animate-spin" /> : <MapPinned />}Ajouter</Button>
      </div>
    </DialogContent>
  </Dialog>
}
