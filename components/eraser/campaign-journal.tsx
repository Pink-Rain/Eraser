"use client"

import { useEffect, useMemo, useState, type ReactNode } from "react"
import { BookOpen, Check, ChevronDown, ChevronLeft, ChevronRight, Feather, Gem, MapPin, PawPrint, ScrollText, Sparkles, Store, Users, UserRound } from "lucide-react"

import { replaceAppUrl } from "@/components/eraser/app-tabs"
import { RichTextView } from "@/components/eraser/rich-text"
import { LinkChip, SessionNotesBoard, SessionQuestChains, type JournalEntity, type SessionNoteEntities } from "@/components/eraser/session-notes"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { sessionNoteType, type SessionNote } from "@/lib/session-note-rules"
import { cn } from "@/lib/utils"

export type JournalSession = { id: string; name: string; createdAt: string }
export type JournalSessionDetail = JournalSession & { bannerUrl: string; characterIds: string[]; npcIds: string[]; shopIds: string[]; eventIds: string[]; places: string }
export type JournalEvent = JournalEntity & { kind: string; tag: string; tagColor: string; description: string }

const dateFormat = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric" })

function sessionDate(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? "" : dateFormat.format(date)
}

const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "?"

function Avatar({ entity, color }: { entity: JournalEntity; color: string }) {
  // eslint-disable-next-line @next/next/no-img-element -- portraits servis par l'app ou Google Drive
  return entity.image ? <img src={entity.image} alt="" className="size-10 shrink-0 rounded-full border object-cover" />
    : <span className="flex size-10 shrink-0 items-center justify-center rounded-full font-display text-sm font-semibold text-white" style={{ backgroundColor: color }} aria-hidden>{initials(entity.name)}</span>
}

function NotesBadge({ count }: { count: number }) {
  return count ? <span className="rounded-full bg-primary/10 px-1.5 text-[11px] font-semibold tabular-nums text-primary" title={`${count} note${count > 1 ? "s" : ""} liée${count > 1 ? "s" : ""}`}>{count}</span> : null
}

function Section({ id, icon, title, count, children }: { id: string; icon: ReactNode; title: string; count?: number; children: ReactNode }) {
  return <section id={id} tabIndex={-1} className="scroll-mt-24 outline-none">
    <h2 className="mb-3 flex items-center gap-2 font-display text-xl font-semibold">{icon}{title}{count !== undefined && <span className="rounded-full bg-muted px-2 text-xs font-medium tabular-nums text-muted-foreground">{count}</span>}</h2>
    {children}
  </section>
}

const empty = (text: string) => <p className="rounded-xl border border-dashed px-4 py-4 text-sm text-muted-foreground">{text}</p>

function EntityCard({ entity, color, notes, extra }: { entity: JournalEntity; color: string; notes: number; extra?: ReactNode }) {
  return <div className="flex min-w-0 items-center gap-3 rounded-xl border bg-card/70 p-2.5">
    <Avatar entity={entity} color={color} />
    <span className="min-w-0 flex-1"><span className="flex items-center gap-1.5 font-medium"><span className="truncate">{entity.name}</span><NotesBadge count={notes} /></span>
      {entity.hint && <span className="block truncate text-xs text-muted-foreground">{entity.hint}</span>}{extra}</span>
  </div>
}

/**
 * Le journal d'une campagne : une session à la fois, la dernière d'abord. Les flèches (et
 * ← → au clavier) passent à la session voisine ; un clic sur le nom déroule toutes les
 * sessions. La page raconte la session (bilan, groupe, lieux, PNJs, créatures, objets,
 * magasins, quêtes, événements) et range à droite ses notes publiques.
 */
export function CampaignJournal({ campaignId, campaignName, accentColor, sessions, initialSessionId, initialMine = false, initialNotes, notesError = false, viewer, members, npcs, shops, events }: {
  campaignId: string
  campaignName: string
  accentColor: string
  /** Dans l'ordre de création : S1 en premier. */
  sessions: JournalSessionDetail[]
  initialSessionId?: string
  initialMine?: boolean
  initialNotes: SessionNote[]
  notesError?: boolean
  viewer: { uid: string; manager: boolean; characterIds: string[] }
  members: JournalEntity[]
  npcs: JournalEntity[]
  shops: JournalEntity[]
  events: JournalEvent[]
}) {
  const initial = sessions.findIndex((session) => session.id === initialSessionId)
  const [index, setIndex] = useState(initial >= 0 ? initial : sessions.length - 1)
  const [listOpen, setListOpen] = useState(false)
  const [notes, setNotes] = useState(initialNotes)
  const current = sessions[index]

  function go(next: number) {
    if (next < 0 || next >= sessions.length) return
    setIndex(next)
    setListOpen(false)
    // L'adresse garde la session affichée : un onglet ou un lien rouvre la même.
    const url = new URL(window.location.href)
    url.searchParams.set("session", sessions[next].id)
    replaceAppUrl(url.pathname + url.search)
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || target?.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target?.tagName ?? "") || target?.closest("[role=dialog]")) return
      if (event.key === "ArrowLeft") go(index - 1)
      if (event.key === "ArrowRight") go(index + 1)
    }
    // Une note liée d'une autre session : la page passe à sa session.
    const onGo = (event: Event) => { const position = sessions.findIndex((session) => session.id === (event as CustomEvent<string>).detail); if (position >= 0) go(position) }
    window.addEventListener("keydown", onKey)
    window.addEventListener("eraser-journal-go", onGo)
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("eraser-journal-go", onGo) }
  })

  const entities: SessionNoteEntities = useMemo(() => ({ characters: members, npcs, shops, events: events.map((event) => ({ id: event.id, name: event.name, hint: event.tag })) }), [members, npcs, shops, events])
  const refs = sessions.map((session) => ({ id: session.id, name: session.name, createdAt: session.createdAt }))
  const here = current ? notes.filter((note) => note.sessionId === current.id) : []
  // Combien de notes de cette session citent un élément.
  const linked = (link: string) => here.filter((note) => note.links.includes(link)).length
  const namesIn = (kind: "place" | "creature" | "item") => [...new Set(here.flatMap((note) => note.links.filter((link) => link.startsWith(`${kind}:`)).map((link) => link.slice(kind.length + 1))))]

  const arrow = "flex size-11 shrink-0 items-center justify-center rounded-full border bg-card/80 text-muted-foreground shadow-sm transition hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
  const byId = <T extends { id: string }>(list: T[], ids: string[]) => ids.flatMap((id) => list.find((item) => item.id === id) ?? [])
  const group = current ? byId(members, current.characterIds) : []
  const sessionNpcs = current ? byId(npcs, current.npcIds) : []
  const sessionEvents = current ? byId(events, current.eventIds) : []
  const npcEvents = sessionEvents.filter((event) => event.kind === "npc" || event.kind === "generic-npc")
  const creatureEvents = sessionEvents.filter((event) => event.kind === "creature")
  const otherEvents = sessionEvents.filter((event) => event.kind === "other")
  const sessionShops = current ? byId(shops, current.shopIds) : []
  const places = namesIn("place")
  const creatures = namesIn("creature")
  const items = namesIn("item")
  const loot = here.filter((note) => note.type === "butin")
  const timeline = here.filter((note) => note.type === "evenement")
  const summary = here.find((note) => note.type === "resume")
  const tiles = [
    { to: "journal-groupe", label: "Groupe", value: group.length, icon: Users },
    { to: "journal-lieux", label: "Lieux", value: places.length, icon: MapPin },
    { to: "journal-pnjs", label: "PNJs", value: sessionNpcs.length + npcEvents.length, icon: UserRound },
    { to: "journal-creatures", label: "Créatures", value: creatureEvents.length + creatures.length, icon: PawPrint },
    { to: "journal-objets", label: "Objets", value: loot.length + items.length, icon: Gem },
    { to: "journal-magasins", label: "Magasins", value: sessionShops.length, icon: Store },
    { to: "journal-evenements", label: "Événements", value: otherEvents.length + timeline.length, icon: Sparkles },
  ]
  const scrollTo = (id: string) => { const target = document.getElementById(id); target?.scrollIntoView({ behavior: "smooth", block: "start" }); target?.focus({ preventScroll: true }) }

  return <div className="w-full flex-1 px-5 py-9 sm:px-8 md:py-12">
    <div className="mb-8 flex items-center justify-center gap-2 text-xs font-semibold uppercase tracking-[0.22em]" style={{ color: accentColor }}>
      <span className="h-px w-7" style={{ backgroundColor: accentColor }} />
      <BookOpen className="size-3.5" />Journal de {campaignName}
      <span className="h-px w-7" style={{ backgroundColor: accentColor }} />
    </div>

    {!current ? <div className="mx-auto max-w-xl rounded-[1.5rem] border border-dashed bg-card/55 px-6 py-14 text-center">
      <Feather className="mx-auto size-8 text-primary/50" />
      <p className="mt-4 font-display text-2xl font-semibold">Aucune session pour l’instant</p>
      <p className="mt-2 text-sm text-muted-foreground">Le journal s’ouvrira à la première session créée dans le Créateur de session.</p>
    </div> : <>
      <nav className="mx-auto flex max-w-3xl items-center justify-center gap-3 sm:gap-5" aria-label="Sessions">
        <button type="button" className={arrow} onClick={() => go(index - 1)} disabled={index <= 0} aria-label="Session précédente" title="Session précédente (←)"><ChevronLeft className="size-5" /></button>
        <Popover open={listOpen} onOpenChange={setListOpen}>
          <PopoverTrigger asChild>
            <button type="button" className="group min-w-0 flex-1 rounded-2xl px-4 py-2 text-center transition hover:bg-accent/60" aria-label={`S${index + 1} - ${current.name} : voir toutes les sessions`}>
              <span className="block text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">{index === sessions.length - 1 ? "Dernière session" : `Session ${index + 1} sur ${sessions.length}`}</span>
              <span className="mt-1 flex items-center justify-center gap-2 font-display text-3xl font-semibold leading-tight sm:text-4xl">
                <span className="truncate"><span style={{ color: accentColor }}>S{index + 1}</span> - {current.name}</span>
                <ChevronDown className={cn("size-5 shrink-0 text-muted-foreground transition-transform", listOpen && "rotate-180")} />
              </span>
              {sessionDate(current.createdAt) && <span className="mt-1 block text-xs text-muted-foreground">{sessionDate(current.createdAt)}</span>}
            </button>
          </PopoverTrigger>
          <PopoverContent align="center" className="max-h-[min(26rem,70svh)] w-80 overflow-y-auto p-1">
            {/* La plus récente en haut, comme la page s'ouvre. */}
            {sessions.map((session, position) => ({ session, position })).reverse().map(({ session, position }) => <button
              key={session.id}
              type="button"
              onClick={() => go(position)}
              className={cn("flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-left text-sm hover:bg-accent", position === index && "bg-accent/60")}
            >
              <span className="w-9 shrink-0 font-display font-semibold tabular-nums" style={{ color: accentColor }}>S{position + 1}</span>
              <span className="min-w-0 flex-1"><span className="block truncate font-medium">{session.name}</span>{sessionDate(session.createdAt) && <span className="block text-[11px] text-muted-foreground">{sessionDate(session.createdAt)}</span>}</span>
              {position === index && <Check className="size-4 shrink-0 text-primary" />}
            </button>)}
          </PopoverContent>
        </Popover>
        <button type="button" className={arrow} onClick={() => go(index + 1)} disabled={index >= sessions.length - 1} aria-label="Session suivante" title="Session suivante (→)"><ChevronRight className="size-5" /></button>
      </nav>

      {current.bannerUrl && <div className="mx-auto mt-8 max-w-6xl overflow-hidden rounded-[1.5rem] border">
        {/* eslint-disable-next-line @next/next/no-img-element -- bannière servie par l'app */}
        <img src={current.bannerUrl} alt="" className="h-40 w-full object-cover sm:h-56" />
      </div>}

      {/* Téléphone : bilan, notes, puis le récit ; ordinateur : les notes à droite, collées en défilant. */}
      <div className="mx-auto mt-8 grid max-w-6xl gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <section className="min-w-0 rounded-2xl border bg-card/70 p-4 shadow-sm lg:col-start-1 lg:row-start-1" aria-labelledby="journal-bilan">
            <h2 id="journal-bilan" className="font-display text-xl font-semibold">Bilan de la session</h2>
            {summary ? <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">{summary.text}</p> : <p className="mt-2 text-sm text-muted-foreground">Pas encore de résumé : ajoute une note « Résumé ».</p>}
            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {tiles.map((tile) => <button key={tile.to} type="button" onClick={() => scrollTo(tile.to)} className="flex items-center gap-2 rounded-xl border bg-background/60 px-3 py-2 text-left transition hover:border-primary/40 hover:bg-accent/50">
                <tile.icon className="size-4 shrink-0" style={{ color: accentColor }} />
                <span className="min-w-0"><span className="block font-display text-lg font-semibold leading-none tabular-nums">{tile.value}</span><span className="block truncate text-xs text-muted-foreground">{tile.label}</span></span>
              </button>)}
              <div className="flex items-center gap-2 rounded-xl border border-dashed px-3 py-2"><ScrollText className="size-4 shrink-0 text-muted-foreground" /><span><span className="block font-display text-lg font-semibold leading-none tabular-nums">{here.length}</span><span className="block text-xs text-muted-foreground">Notes</span></span></div>
            </div>
          </section>

        <div className="min-w-0 space-y-9 lg:col-start-1 lg:row-start-2">
          <Section id="journal-groupe" icon={<Users className="size-5" style={{ color: accentColor }} />} title="Groupe" count={group.length}>
            {group.length ? <div className="grid gap-2 sm:grid-cols-2">{group.map((member) => <EntityCard key={member.id} entity={member} color={accentColor} notes={linked(`character:${member.id}`)} />)}</div> : empty("Personne n’a été ajouté à cette session.")}
          </Section>

          <Section id="journal-lieux" icon={<MapPin className="size-5" style={{ color: accentColor }} />} title="Lieux" count={places.length}>
            {current.places && <RichTextView html={current.places} className="mb-3 rounded-xl border bg-card/70 p-3 text-sm" />}
            {places.length ? <div className="flex flex-wrap gap-1.5">{places.map((name) => <LinkChip key={name} kind="place" label={`${name}${linked(`place:${name}`) > 1 ? ` · ${linked(`place:${name}`)} notes` : ""}`} />)}</div>
              : !current.places && empty("Aucun lieu noté. Lie une note à un lieu de l’Index des lieux.")}
          </Section>

          <Section id="journal-pnjs" icon={<UserRound className="size-5" style={{ color: accentColor }} />} title="PNJs" count={sessionNpcs.length + npcEvents.length}>
            {sessionNpcs.length + npcEvents.length ? <div className="grid gap-2 sm:grid-cols-2">
              {sessionNpcs.map((npc) => <EntityCard key={npc.id} entity={npc} color="#64748b" notes={linked(`npc:${npc.id}`)} />)}
              {npcEvents.map((event) => <EntityCard key={event.id} entity={{ ...event, hint: event.tag || "PNJ" }} color="#64748b" notes={linked(`event:${event.id}`)} />)}
            </div> : empty("Aucun PNJ dans cette session.")}
          </Section>

          <Section id="journal-creatures" icon={<PawPrint className="size-5" style={{ color: accentColor }} />} title="Créatures" count={creatureEvents.length + creatures.length}>
            {creatureEvents.length + creatures.length ? <div className="space-y-2">
              {creatureEvents.length > 0 && <div className="grid gap-2 sm:grid-cols-2">{creatureEvents.map((event) => <EntityCard key={event.id} entity={{ ...event, hint: event.tag }} color="#7f1d1d" notes={linked(`event:${event.id}`)} />)}</div>}
              {creatures.length > 0 && <div className="flex flex-wrap gap-1.5">{creatures.map((name) => <LinkChip key={name} kind="creature" label={name} />)}</div>}
            </div> : empty("Aucune créature dans cette session.")}
          </Section>

          <Section id="journal-objets" icon={<Gem className="size-5" style={{ color: accentColor }} />} title="Objets" count={loot.length + items.length}>
            {loot.length + items.length ? <div className="space-y-2">
              {loot.map((note) => <p key={note.id} className="rounded-xl border bg-card/70 px-3 py-2 text-sm"><span className="mr-2 inline-block size-2 rounded-full align-middle" style={{ backgroundColor: sessionNoteType("butin").color }} />{note.title || note.text}</p>)}
              {items.length > 0 && <div className="flex flex-wrap gap-1.5">{items.map((name) => <LinkChip key={name} kind="item" label={name} />)}</div>}
            </div> : empty("Aucun objet noté. Ajoute une note « Butin » ou lie un objet à une note.")}
          </Section>

          <Section id="journal-magasins" icon={<Store className="size-5" style={{ color: accentColor }} />} title="Magasins" count={sessionShops.length}>
            {sessionShops.length ? <div className="grid gap-2 sm:grid-cols-2">{sessionShops.map((shop) => <EntityCard key={shop.id} entity={shop} color="#b45309" notes={linked(`shop:${shop.id}`)} />)}</div> : empty("Aucun magasin dans cette session.")}
          </Section>

          <Section id="journal-quetes" icon={<ScrollText className="size-5" style={{ color: accentColor }} />} title="Quêtes">
            <SessionQuestChains campaignId={campaignId} sessions={refs} sessionId={current.id} notes={notes} onNotesChange={setNotes} entities={entities} viewer={viewer} />
          </Section>

          <Section id="journal-evenements" icon={<Sparkles className="size-5" style={{ color: accentColor }} />} title="Événements" count={otherEvents.length + timeline.length}>
            {otherEvents.length + timeline.length ? <div className="space-y-3">
              {otherEvents.length > 0 && <div className="grid gap-2 sm:grid-cols-2">{otherEvents.map((event) => <div key={event.id} className="rounded-xl border bg-card/70 p-3">
                <p className="flex items-center gap-2 font-medium">{event.name}{event.tag && <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold text-white" style={{ backgroundColor: event.tagColor || "#64748b" }}>{event.tag}</span>}<NotesBadge count={linked(`event:${event.id}`)} /></p>
                {event.description && <RichTextView html={event.description} className="mt-1 text-sm text-muted-foreground" />}
              </div>)}</div>}
              {timeline.length > 0 && <ol className="relative space-y-3 border-l-2 pl-5" style={{ borderColor: `${accentColor}55` }} aria-label="Frise de la session">
                {timeline.map((note, position) => <li key={note.id} className="relative">
                  <span className="absolute -left-[1.95rem] top-0.5 flex size-6 items-center justify-center rounded-full border-2 bg-background text-[11px] font-semibold tabular-nums" style={{ borderColor: accentColor }}>{position + 1}</span>
                  {note.moment && <p className="text-xs font-medium text-muted-foreground">{note.moment}</p>}
                  <p className="font-medium">{note.title || note.text}</p>
                  {note.title && note.text && <p className="text-sm text-muted-foreground">{note.text}</p>}
                </li>)}
              </ol>}
            </div> : empty("Aucun événement. Ajoute une note « Événement » pour remplir la frise.")}
          </Section>
        </div>

        <aside className="min-w-0 lg:sticky lg:top-6 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:self-start">
          {notesError && <p className="mb-3 rounded-xl border border-destructive/25 bg-destructive/5 px-3 py-2 text-sm text-destructive">Les notes n’ont pas pu être lues dans Google Sheets. Actualise dans un instant.</p>}
          <SessionNotesBoard campaignId={campaignId} sessions={refs} sessionId={current.id} notes={notes} onNotesChange={setNotes} entities={entities} viewer={viewer} initialMine={initialMine} className="lg:max-h-[calc(100svh-3rem)] lg:overflow-y-auto" />
        </aside>
      </div>
    </>}
  </div>
}
