"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { BookOpenText, ChevronLeft, ChevronRight, LoaderCircle } from "lucide-react"

import { Button } from "@/components/ui/button"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { SessionNotesBoard, SessionQuestChains, type JournalSessionRef, type SessionNoteEntities } from "@/components/eraser/session-notes"
import type { SessionNote } from "@/lib/session-note-rules"

const noEntities: SessionNoteEntities = { characters: [], npcs: [], shops: [], events: [] }

type Loaded = { campaignId: string; sessions: JournalSessionRef[]; notes: SessionNote[]; viewer: { uid: string; manager: boolean } }

/**
 * Fiche du personnage, onglet Journal : ses notes privées, rangées par session (la dernière
 * d'abord, ← → pour passer de l'une à l'autre), ses quêtes, et le raccourci vers les notes
 * de session de la campagne (publiques, dans le journal de la campagne).
 */
export function CharacterSessionNotes({ characterId, campaigns }: { characterId: string; campaigns: Array<{ id: string; name: string; accentColor?: string }> }) {
  const [campaignId, setCampaignId] = useState(campaigns[0]?.id ?? "")
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [error, setError] = useState("")
  const [index, setIndex] = useState(-1)

  useEffect(() => {
    if (!campaignId) return
    let alive = true
    const timer = window.setTimeout(() => { setError(""); setLoaded(null) }, 0)
    void fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/session-notes?character=${encodeURIComponent(characterId)}`, { cache: "no-store" })
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

  if (!campaigns.length) return <section className="rounded-2xl border border-dashed p-4 text-sm text-muted-foreground">Les notes de session arrivent quand ce personnage rejoint une campagne.</section>
  const ready = loaded?.campaignId === campaignId ? loaded : null
  const sessions = ready?.sessions ?? []
  const current = sessions[index]
  const arrow = "flex size-8 shrink-0 items-center justify-center rounded-full border bg-card/80 text-muted-foreground transition hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
  const setNotes = (notes: SessionNote[]) => setLoaded((value) => value ? { ...value, notes } : value)
  const viewer = { uid: ready?.viewer.uid ?? "", manager: false, characterIds: [characterId] }
  return <div className="space-y-3">
    <div className="flex flex-wrap items-center gap-2">
      {campaigns.length > 1 && <NativeSelect value={campaignId} onChange={(event) => setCampaignId(event.target.value)} aria-label="Campagne" className="min-w-0 flex-1">
        {campaigns.map((campaign) => <NativeSelectOption key={campaign.id} value={campaign.id}>{campaign.name}</NativeSelectOption>)}
      </NativeSelect>}
      <Button asChild size="sm" variant="outline" className={campaigns.length > 1 ? "" : "w-full"}>
        <Link href={`/campagne/${encodeURIComponent(campaignId)}/journal?${new URLSearchParams({ ...(current ? { session: current.id } : {}), perso: "1" }).toString()}`} prefetch={false}><BookOpenText />Notes de session de la campagne</Link>
      </Button>
    </div>
    {error ? <p className="rounded-xl border border-destructive/25 bg-destructive/5 px-3 py-2 text-sm text-destructive">{error}</p>
      : !ready ? <p className="flex items-center gap-2 rounded-xl border px-3 py-4 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" />Chargement des notes…</p>
      : !current ? <p className="rounded-xl border border-dashed px-3 py-4 text-sm text-muted-foreground">Aucune session dans cette campagne pour l’instant.</p>
      : <>
        <nav className="flex items-center gap-2" aria-label="Sessions">
          <button type="button" className={arrow} onClick={() => setIndex(index - 1)} disabled={index <= 0} aria-label="Session précédente"><ChevronLeft className="size-4" /></button>
          <p className="min-w-0 flex-1 truncate text-center text-sm font-semibold"><span className="text-primary">S{index + 1}</span> · {current.name}</p>
          <button type="button" className={arrow} onClick={() => setIndex(index + 1)} disabled={index >= sessions.length - 1} aria-label="Session suivante"><ChevronRight className="size-4" /></button>
        </nav>
        <SessionNotesBoard campaignId={campaignId} sessions={sessions} sessionId={current.id} notes={ready.notes} onNotesChange={setNotes} entities={noEntities} viewer={viewer} privateFor={characterId} title="Mes notes" newInLatest />
        <details className="group rounded-2xl border bg-card/70 p-3">
          <summary className="cursor-pointer list-none font-display text-lg font-semibold [&::-webkit-details-marker]:hidden">Mes quêtes</summary>
          <div className="mt-2"><SessionQuestChains campaignId={campaignId} sessions={sessions} sessionId={current.id} notes={ready.notes} onNotesChange={setNotes} entities={noEntities} viewer={viewer} privateFor={characterId} /></div>
        </details>
      </>}
  </div>
}
