"use client"

import { useEffect, useState, type ReactNode } from "react"
import { CalendarDays, Check, LoaderCircle, Repeat2, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { calendarNamed, compareCalendarDates, defaultWorldCalendar, formatCalendarDate, monthLength, parseCalendarDate, realCalendar, REAL_CALENDAR, seasonOf, weekdayOf, type CalendarDate, type CalendarDefinition } from "@/lib/calendars"
import { cn } from "@/lib/utils"

let calendarsPromise: Promise<CalendarDefinition[] | null> | null = null

/** Les calendriers de l'Index des calendriers (une lecture par visite) ; `null` s'ils n'ont pas pu être lus. */
function loadCalendars() {
  calendarsPromise ??= fetch("/api/calendars")
    .then(async (response) => response.ok ? ((await response.json()) as { calendars?: CalendarDefinition[] }).calendars ?? [] : null)
    .catch(() => null)
    .then((calendars) => { if (calendars === null) calendarsPromise = null; return calendars })
  return calendarsPromise
}

/** Les calendriers du monde, puis le calendrier réel ; `undefined` pendant la lecture. */
export function useWorldCalendars() {
  const [state, setState] = useState<{ calendars: CalendarDefinition[]; failed: boolean } | undefined>(undefined)
  useEffect(() => {
    let alive = true
    void loadCalendars().then((calendars) => { if (alive) setState({ calendars: [...(calendars ?? []).filter((calendar) => calendar.months.length), realCalendar], failed: calendars === null }) })
    return () => { alive = false }
  }, [])
  return state
}

/** Une date (et sa fin, pour une période) dans un calendrier : le texte gardé dans la feuille. */
export type CalendarDateValue = { calendar: string; start: string; end?: string }

type Draft = { day: string; month: string; year: string }

function draftOf(text: string | undefined, calendar: CalendarDefinition | null): Draft {
  const date = text && calendar ? parseCalendarDate(text, calendar) : null
  return date ? { day: String(date.day), month: String(date.month), year: String(date.year) } : { day: "", month: "0", year: "" }
}

function dateOf(draft: Draft, calendar: CalendarDefinition): CalendarDate | null {
  const year = Number.parseInt(draft.year, 10)
  const month = Number.parseInt(draft.month, 10)
  const day = Number.parseInt(draft.day, 10)
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day) || month < 0 || month >= calendar.months.length) return null
  return day >= 1 && day <= monthLength(calendar, year, month) ? { year, month, day } : null
}

/** « Lundi · Automne » : ce que la date dit en plus, quand le calendrier le sait. */
function dateDetails(date: CalendarDate, calendar: CalendarDefinition) {
  const weekday = calendar.weekdays.length ? calendar.weekdays[weekdayOf(calendar, date)] : ""
  return [weekday, seasonOf(calendar, date.month)?.name].filter(Boolean).join(" · ")
}

/**
 * Une date du monde : le calendrier de Cir'Hoit d'office, un bouton pour en prendre un autre.
 * `range` ajoute une date de fin facultative (une session sur plusieurs jours). Rien n'est
 * enregistré avant « Enregistrer » ; « Effacer » vide la date.
 */
export function CalendarDateField({ label, value, range = false, readOnly = false, onCommit, children, className }: { label: string; value: CalendarDateValue; range?: boolean; readOnly?: boolean; onCommit: (value: CalendarDateValue) => Promise<unknown> | void; /** Le déclencheur (sinon la date écrite). */ children?: ReactNode; className?: string }) {
  const [open, setOpen] = useState(false)
  const shown = value.start ? (range && value.end ? `${value.start} → ${value.end}` : value.start) : ""
  const trigger = children ?? <span className={cn("mt-1 block text-sm font-medium", !shown && "text-muted-foreground")}>{shown || "—"}</span>
  if (readOnly) return <span className={className} title={value.calendar || undefined}>{trigger}</span>
  return <Popover open={open} onOpenChange={setOpen}>
    <PopoverTrigger asChild><button type="button" className={cn("block w-full rounded-md text-left transition-colors hover:bg-muted/50", className)} aria-label={`${label} : ${shown || "aucune date"}`} title={value.calendar ? `${label} · ${value.calendar}` : label}>{trigger}</button></PopoverTrigger>
    <PopoverContent align="start" className="w-[22rem] p-3">
      {open && <CalendarDateForm label={label} value={value} range={range} onCancel={() => setOpen(false)} onCommit={async (next) => { await onCommit(next); setOpen(false) }} />}
    </PopoverContent>
  </Popover>
}

function CalendarDateForm({ label, value, range, onCancel, onCommit }: { label: string; value: CalendarDateValue; range: boolean; onCancel: () => void; onCommit: (value: CalendarDateValue) => Promise<void> }) {
  const loaded = useWorldCalendars()
  // Le calendrier choisi ici (sinon celui de la date, sinon celui du monde quand l'index est lu).
  const [picked, setPicked] = useState<string | null>(null)
  const [choosing, setChoosing] = useState(false)
  const [drafts, setDrafts] = useState<{ start: Draft; end: Draft; withEnd: boolean } | null>(null)
  const [saving, setSaving] = useState(false)
  if (!loaded) return <div className="grid min-h-28 place-items-center"><LoaderCircle className="size-4 animate-spin text-muted-foreground" /></div>
  const calendars = loaded.calendars
  const known = calendarNamed(calendars, picked ?? value.calendar)
  // Un calendrier disparu de l'index : sa date reste lisible, on en choisit un autre pour la changer.
  const calendar = known ?? defaultWorldCalendar(calendars)
  const current = drafts ?? (picked === null ? { start: draftOf(value.start, known), end: draftOf(value.end, known), withEnd: Boolean(value.end) } : { start: draftOf("", calendar), end: draftOf("", calendar), withEnd: false })
  const set = (which: "start" | "end", key: keyof Draft, next: string) => setDrafts({ ...current, [which]: { ...current[which], [key]: next } })
  const start = dateOf(current.start, calendar)
  const end = range && current.withEnd ? dateOf(current.end, calendar) : null
  const endInvalid = range && current.withEnd && (!end || (start && compareCalendarDates(end, start) < 0))
  const valid = Boolean(start) && !endInvalid
  async function save(next: CalendarDateValue) {
    setSaving(true)
    try { await onCommit(next) } finally { setSaving(false) }
  }
  const dateRow = (which: "start" | "end") => {
    const draft = current[which]
    const date = dateOf(draft, calendar)
    return <div className="grid gap-1">
      <div className="grid grid-cols-[3.5rem_minmax(0,1fr)_5.5rem] gap-1.5 [&_[data-slot=native-select-wrapper]]:w-full">
        <Input type="number" min={1} max={99} value={draft.day} onChange={(event) => set(which, "day", event.target.value)} placeholder="Jour" aria-label={`${which === "end" ? "Fin" : label} : jour`} className="h-8 px-2 text-sm" />
        <NativeSelect value={draft.month} onChange={(event) => set(which, "month", event.target.value)} aria-label={`${which === "end" ? "Fin" : label} : mois`} className="h-8 py-0 text-sm">{calendar.months.map((month, index) => <NativeSelectOption key={`${month.name}-${index}`} value={String(index)}>{month.name}</NativeSelectOption>)}</NativeSelect>
        <Input type="number" value={draft.year} onChange={(event) => set(which, "year", event.target.value)} placeholder="Année" aria-label={`${which === "end" ? "Fin" : label} : année`} className="h-8 px-2 text-sm" />
      </div>
      <p className="min-h-4 text-[11px] text-muted-foreground">{date ? <>{formatCalendarDate(date, calendar)}{dateDetails(date, calendar) && <span> · {dateDetails(date, calendar)}</span>}</> : draft.day || draft.year ? <span className="text-destructive">Ce jour n’existe pas dans ce mois.</span> : null}</p>
    </div>
  }
  return <div className="grid gap-3">
    <div className="flex items-center gap-2">
      <CalendarDays className="size-4 shrink-0 text-primary" />
      <div className="min-w-0 flex-1"><p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p><p className="truncate text-sm font-semibold">{calendar.name}</p></div>
      <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setChoosing(!choosing)} aria-expanded={choosing}><Repeat2 />Autre calendrier</Button>
    </div>
    {choosing && <div className="[&_[data-slot=native-select-wrapper]]:w-full"><NativeSelect value={calendar.name} onChange={(event) => { setPicked(event.target.value); setDrafts(null); setChoosing(false) }} aria-label="Calendrier" className="h-8 w-full py-0 text-sm">{calendars.map((candidate) => <NativeSelectOption key={candidate.name} value={candidate.name}>{candidate.name}{candidate.name === REAL_CALENDAR ? "" : candidate.era ? ` (${candidate.era})` : ""}</NativeSelectOption>)}</NativeSelect></div>}
    {loaded.failed && <p className="text-[11px] text-amber-600 dark:text-amber-400">L’Index des calendriers n’a pas pu être lu : seul le calendrier réel est proposé.</p>}
    {!known && value.calendar && <p className="text-[11px] text-amber-600 dark:text-amber-400">« {value.calendar} » n’est plus dans l’Index des calendriers.</p>}
    {dateRow("start")}
    {range && (current.withEnd
      ? <div className="grid gap-1"><div className="flex items-center justify-between"><span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Jusqu’au</span><button type="button" onClick={() => setDrafts({ ...current, withEnd: false })} className="rounded p-0.5 text-muted-foreground hover:bg-muted" aria-label="Retirer la date de fin"><X className="size-3.5" /></button></div>{dateRow("end")}{endInvalid && end && <p className="-mt-1 text-[11px] text-destructive">La fin est avant le début.</p>}</div>
      : <button type="button" onClick={() => setDrafts({ ...current, withEnd: true, end: current.end.year ? current.end : current.start })} className="justify-self-start text-xs font-medium text-primary hover:underline">+ Sur plusieurs jours</button>)}
    <div className="flex items-center justify-between gap-2">
      {value.start ? <Button type="button" variant="ghost" size="sm" className="text-destructive/80" disabled={saving} onClick={() => void save({ calendar: "", start: "", end: "" })}>Effacer</Button> : <span />}
      <div className="flex gap-2">
        <Button type="button" variant="ghost" size="sm" disabled={saving} onClick={onCancel}>Annuler</Button>
        <Button type="button" size="sm" disabled={!valid || saving} onClick={() => start && void save({ calendar: calendar.name, start: formatCalendarDate(start, calendar), end: end ? formatCalendarDate(end, calendar) : "" })}>{saving ? <LoaderCircle className="animate-spin" /> : <Check />}Enregistrer</Button>
      </div>
    </div>
  </div>
}
