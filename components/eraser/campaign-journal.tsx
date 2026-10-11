"use client"

import { useEffect, useState } from "react"
import { BookOpen, Check, ChevronDown, ChevronLeft, ChevronRight, Feather } from "lucide-react"

import { replaceAppUrl } from "@/components/eraser/app-tabs"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"

export type JournalSession = { id: string; name: string; createdAt: string }

const dateFormat = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric" })

function sessionDate(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? "" : dateFormat.format(date)
}

/**
 * Le journal d'une campagne : une session à la fois, la dernière d'abord. Les flèches (et
 * ← → au clavier) passent à la session voisine ; un clic sur le nom déroule toutes les
 * sessions pour aller directement à l'une d'elles.
 */
export function CampaignJournal({ campaignName, accentColor, sessions, initialSessionId }: {
  campaignName: string
  accentColor: string
  /** Dans l'ordre de création : S1 en premier. */
  sessions: JournalSession[]
  initialSessionId?: string
}) {
  const initial = sessions.findIndex((session) => session.id === initialSessionId)
  const [index, setIndex] = useState(initial >= 0 ? initial : sessions.length - 1)
  const [listOpen, setListOpen] = useState(false)
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
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || target?.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target?.tagName ?? "")) return
      if (event.key === "ArrowLeft") go(index - 1)
      if (event.key === "ArrowRight") go(index + 1)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  })

  const arrow = "flex size-11 shrink-0 items-center justify-center rounded-full border bg-card/80 text-muted-foreground shadow-sm transition hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
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

      <article className="mx-auto mt-10 max-w-3xl rounded-[1.5rem] border border-dashed bg-card/55 px-6 py-14 text-center">
        <Feather className="mx-auto size-8" style={{ color: `${accentColor}99` }} />
        <p className="mt-4 font-display text-2xl font-semibold">La page de cette session arrive bientôt</p>
        <p className="mt-2 text-sm text-muted-foreground">Rencontres, lieux, notes des joueurs : tout ce qui s’est passé pendant « {current.name} » sera raconté ici.</p>
      </article>
    </>}
  </div>
}
