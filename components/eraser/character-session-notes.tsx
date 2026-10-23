"use client"

import { useEffect, useState } from "react"
import { ChevronLeft, ChevronRight, LoaderCircle } from "lucide-react"

import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { SessionNotesBoard, SessionQuestChains, type JournalSessionRef, type SessionNoteEntities } from "@/components/eraser/session-notes"
import { onCampaignChange, upsertSessionNote } from "@/lib/campaign-live"
import type { SessionNote } from "@/lib/session-note-rules"
import { cn } from "@/lib/utils"

const noEntities: SessionNoteEntities = { characters: [], npcs: [], shops: [], events: [] }

type Loaded = { campaignId: string; sessions: JournalSessionRef[]; notes: SessionNote[]; viewer: { uid: string; manager: boolean } }

/**
 * Fiche du personnage, onglet Journal : les notes par session, la dernière d'abord (← → pour
 * passer de l'une à l'autre). « Mon perso » (par défaut) : les notes privées du personnage,
 * lues par toi seul. « Campagne » : les notes de session de la campagne, les mêmes que dans
 * son journal ; en écrire une ici l'ajoute au journal.
 */
export function CharacterSessionNotes({ characterId, campaigns }: { characterId: string; campaigns: Array<{ id: string; name: string; accentColor?: string }> }) {
  const [campaignId, setCampaignId] = useState(campaigns[0]?.id ?? "")
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [error, setError] = useState("")
  const [index, setIndex] = useState(-1)
  const [scope, setScope] = useState<"mine" | "campaign">("mine")

  useEffect(() => {
    if (!campaignId) return
    let alive = true
    const timer = window.setTimeout(() => { setError(""); setLoaded(null) }, 0)
    void fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/session-notes`, { cache: "no-store" })
      .then(async (response) => {
        const payload = (await response.json().catch(() => ({}))) as Partial<Loaded> & { error?: string }
        if (!response.ok) throw new Error(payload.error || "Les notes n’ont pas pu être chargées.")
        if (!alive) return
        const sessions = payload.sessions ?? []
        setLoaded({ campaignId, sessions, notes: payload.notes ?? [], viewer: payload.viewer ?? { uid: "", manager: false } })
        setIndex(sessions.length - 1)
      })
      .catch((caught) => { if (alive) setError(caught instanceof Error ? caught.message : "Les notes n’ont pas pu être chargées.") })
    return () => { alive = false; window.clearTimeout(timer) }
  }, [campaignId, characterId])

  // Les notes de la campagne écrites ailleurs arrivent en direct (lib/campaign-live.ts).
  useEffect(() => {
    if (!campaignId) return
    return onCampaignChange(campaignId, (message) => {
      if (message.kind === "session") return
      setLoaded((value) => !value || value.campaignId !== campaignId ? value : {
        ...value,
        notes: message.kind === "note" ? upsertSessionNote(value.notes, message.note) : value.notes.filter((note) => note.id !== message.noteId),
      })
    })
  }, [campaignId])

  if (!campaigns.length) return <section className="rounded-2xl border border-dashed p-4 text-sm text-muted-foreground">Les notes de session arrivent quand ce personnage rejoint une campagne.</section>
  const ready = loaded?.campaignId === campaignId ? loaded : null
  const sessions = ready?.sessions ?? []
  const current = sessions[index]
  const arrow = "flex size-8 shrink-0 items-center justify-center rounded-full border bg-card/80 text-muted-foreground transition hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
  const viewer = { uid: ready?.viewer.uid ?? "", manager: ready?.viewer.manager ?? false, characterIds: [characterId] }
  // Les notes montrées : celles du personnage (privées) ou celles de la campagne (publiques).
  const inScope = (note: SessionNote) => scope === "mine" ? note.private && note.characterId === characterId : !note.private
  const shown = (ready?.notes ?? []).filter(inScope)
  // Une note ajoutée, modifiée ou supprimée dans la liste montrée ; les autres ne bougent pas.
  const setShown = (next: SessionNote[]) => setLoaded((value) => value ? { ...value, notes: [...value.notes.filter((note) => !inScope(note)), ...next] } : value)
  const privateFor = scope === "mine" ? characterId : undefined
  const toolbar = <div className="flex rounded-lg border p-0.5 text-xs" role="group" aria-label="Notes affichées">
    {([["mine", "Mon perso"], ["campaign", "Campagne"]] as const).map(([value, label]) => <button key={value} type="button" aria-pressed={scope === value} onClick={() => setScope(value)} className={cn("rounded-md px-2.5 py-1 font-medium", scope === value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>{label}</button>)}
  </div>
  return <div className="space-y-3">
    {campaigns.length > 1 && <NativeSelect value={campaignId} onChange={(event) => setCampaignId(event.target.value)} aria-label="Campagne" className="w-full">
      {campaigns.map((campaign) => <NativeSelectOption key={campaign.id} value={campaign.id}>{campaign.name}</NativeSelectOption>)}
    </NativeSelect>}
    {error ? <p className="rounded-xl border border-destructive/25 bg-destructive/5 px-3 py-2 text-sm text-destructive">{error}</p>
      : !ready ? <p className="flex items-center gap-2 rounded-xl border px-3 py-4 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" />Chargement des notes…</p>
      : !current ? <p className="rounded-xl border border-dashed px-3 py-4 text-sm text-muted-foreground">Aucune session dans cette campagne pour l’instant.</p>
      : <>
        <nav className="flex items-center gap-2" aria-label="Sessions">
          <button type="button" className={arrow} onClick={() => setIndex(index - 1)} disabled={index <= 0} aria-label="Session précédente"><ChevronLeft className="size-4" /></button>
          <NativeSelect value={current.id} onChange={(event) => setIndex(sessions.findIndex((session) => session.id === event.target.value))} aria-label="Session" className="h-8 min-w-0 flex-1 text-sm">
            {sessions.map((session, position) => ({ session, position })).reverse().map(({ session, position }) => <NativeSelectOption key={session.id} value={session.id}>S{position + 1} · {session.name}{position === sessions.length - 1 ? " (dernière)" : ""}</NativeSelectOption>)}
          </NativeSelect>
          <button type="button" className={arrow} onClick={() => setIndex(index + 1)} disabled={index >= sessions.length - 1} aria-label="Session suivante"><ChevronRight className="size-4" /></button>
        </nav>
        <SessionNotesBoard key={scope} campaignId={campaignId} sessions={sessions} sessionId={current.id} notes={shown} onNotesChange={setShown} entities={noEntities} viewer={viewer} privateFor={privateFor} title={scope === "mine" ? "Mes notes" : "Notes de la campagne"} toolbar={toolbar} />
        <details className="group rounded-2xl border bg-card/70 p-3">
          <summary className="cursor-pointer list-none font-display text-lg font-semibold [&::-webkit-details-marker]:hidden">{scope === "mine" ? "Mes quêtes" : "Quêtes de la campagne"}</summary>
          <div className="mt-2"><SessionQuestChains key={scope} campaignId={campaignId} sessions={sessions} sessionId={current.id} notes={shown} onNotesChange={setShown} entities={noEntities} viewer={viewer} privateFor={privateFor} /></div>
        </details>
      </>}
  </div>
}
