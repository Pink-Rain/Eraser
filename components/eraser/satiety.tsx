"use client"

import { useCallback, useEffect, useState, useSyncExternalStore } from "react"
import { LoaderCircle, Moon } from "lucide-react"

import { nextSpellChargeValue } from "@/components/eraser/spell-charges"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { useStoredText } from "@/hooks/use-persistent-state"
import {
  SATIETY_MAX, applySatietyAction, boundedCharges, chargesAfterRest, describeRest, ellipseDays, emptySatiety,
  daysLabel, satietyColor, satietyLabel, satietyMeals, type SatietyAction, type SatietyMeal, type SatietyRest, type SatietyState,
} from "@/lib/satiety"
import { cn } from "@/lib/utils"

/** Une cuisse de poulet (le dessin de Lucide) : la viande se remplit quand la charge est pleine. */
function Drumstick({ filled, className }: { filled: boolean; className?: string }) {
  return <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="none" stroke="currentColor" strokeWidth={filled ? 1.6 : 1.8} strokeLinecap="round" strokeLinejoin="round">
    <path d="M15.4 15.63a7.875 6 135 1 1 6.23-6.23 4.3 3.36 135 0 0-6.23 6.23" fill={filled ? "currentColor" : "none"} />
    <path d="m8.29 12.71-2.6 2.6a2.5 2.5 0 1 0-1.65 4.65A2.5 2.5 0 1 0 8.7 18.3l2.59-2.59" />
  </svg>
}

/**
 * Les cinq charges de rassasiement. Comme les charges d'un sort : cliquer une cuisse pleine
 * vide la barre jusqu'à elle comprise, cliquer une cuisse vide la remplit jusqu'à elle.
 * La teinte suit la barre : rouge vide, vert pleine.
 */
export function SatietyBar({ charges, onChange, size = "md", className }: { charges: number; onChange?: (value: number) => void; size?: "sm" | "md"; className?: string }) {
  const available = boundedCharges(charges)
  const color = satietyColor(available)
  const icon = size === "sm" ? "size-4" : "size-5"
  return <span className={cn("inline-flex items-center", size === "sm" ? "gap-0" : "gap-0.5", className)} style={{ color }} role={onChange ? "group" : "img"} aria-label={`Rassasiement : ${available} charge${available > 1 ? "s" : ""} sur ${SATIETY_MAX} (${satietyLabel(available)})`} title={`${satietyLabel(available)} · ${available}/${SATIETY_MAX}`}>
    {Array.from({ length: SATIETY_MAX }, (_, index) => {
      const filled = index < available
      if (!onChange) return <span key={index} className={cn("inline-flex", !filled && "opacity-35")}><Drumstick filled={filled} className={icon} /></span>
      return <button key={index} type="button" onClick={(event) => { event.stopPropagation(); onChange(nextSpellChargeValue(SATIETY_MAX, available, index)) }}
        className={cn("inline-flex rounded-sm p-0.5 transition hover:scale-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1", filled ? "opacity-100" : "opacity-35 hover:opacity-70")}
        aria-label={filled ? `Vider jusqu’à la charge ${index + 1}` : `Remplir jusqu’à la charge ${index + 1}`}>
        <Drumstick filled={filled} className={icon} />
      </button>
    })}
  </span>
}

export type SatietyCampaign = { id: string; name: string; accentColor?: string }

type SatietyReply = { records: Record<string, SatietyState>; failed: string[] }

/** Envoie une action pour un ou plusieurs personnages ; échoue avec le message du serveur. */
export async function sendSatiety(body: { characterIds: string[]; action: SatietyAction; campaignId?: string; sessionId?: string }): Promise<SatietyReply> {
  const response = await fetch("/api/characters/satiety", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })
  const payload = (await response.json().catch(() => ({}))) as Partial<SatietyReply> & { error?: string }
  if (!response.ok || !payload.records) throw new Error(payload.error || "La barre de rassasiement n’a pas pu être enregistrée.")
  return { records: payload.records, failed: payload.failed ?? [] }
}

/**
 * Le bouton lune : passer une nuit ou faire une ellipse de quelques jours, avec ou sans
 * repas offert. Un personnage de plusieurs campagnes choisit celle où les jours comptent
 * (le dernier choix est retenu sur ce poste). `preview` : les charges actuelles, pour
 * montrer « 3 → 2 » quand il n'y a qu'un personnage.
 */
export function RestButton({ onRest, campaigns = [], campaignKey, preview, title = "Passer le temps", subtitle, label, disabled = false, className }: {
  onRest: (rest: SatietyRest) => Promise<unknown> | void
  campaigns?: SatietyCampaign[]
  /** Où retenir la dernière campagne choisie (une par personnage). */
  campaignKey?: string
  preview?: number
  title?: string
  subtitle?: string
  /** Un texte à côté de la lune (bouton global) ; sans texte, la lune seule. */
  label?: string
  disabled?: boolean
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<SatietyRest["mode"]>("night")
  const [days, setDays] = useState("2")
  const [fed, setFed] = useState(false)
  const [meal, setMeal] = useState<SatietyMeal>("petit")
  const [busy, setBusy] = useState(false)
  const [storedCampaign, setStoredCampaign] = useStoredText(campaignKey ? `eraser:satiety:campaign:${campaignKey}` : "eraser:satiety:campaign")
  const campaignId = campaigns.some((campaign) => campaign.id === storedCampaign) ? storedCampaign : campaigns[0]?.id ?? ""
  const rest: SatietyRest = { mode, ...(mode === "ellipse" ? { days: ellipseDays(days) } : {}), meal: fed ? meal : null, campaignId: campaignId || null }

  async function confirm() {
    setBusy(true)
    try {
      await onRest(rest)
      setOpen(false)
    } catch { /* l'appelant dit ce qui a échoué ; la fenêtre reste ouverte pour réessayer */ } finally {
      setBusy(false)
    }
  }

  const choice = (value: SatietyRest["mode"], text: string) => <button type="button" onClick={() => setMode(value)} aria-pressed={mode === value}
    className={cn("flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition", mode === value ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>{text}</button>

  return <Popover open={open} onOpenChange={setOpen}>
    <PopoverTrigger asChild>
      <button type="button" disabled={disabled} title={title} aria-label={label ? undefined : title}
        className={cn("inline-flex shrink-0 items-center justify-center gap-1.5 rounded-full border border-indigo-400/35 bg-indigo-500/10 text-indigo-700 transition hover:border-indigo-400/70 hover:bg-indigo-500/18 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 dark:text-indigo-200", label ? "h-8 px-3 text-xs font-medium" : "size-7", className)}>
        <Moon className={label ? "size-3.5" : "size-3.5"} />{label}
      </button>
    </PopoverTrigger>
    <PopoverContent align="start" className="w-64 p-3" onClick={(event) => event.stopPropagation()}>
      <p className="flex items-center gap-1.5 font-display text-sm font-semibold"><Moon className="size-3.5 text-indigo-500" />{title}</p>
      {subtitle && <p className="text-[11px] text-muted-foreground">{subtitle}</p>}
      <div className="mt-2 flex gap-1 rounded-lg bg-muted p-1">{choice("night", "Passer une nuit")}{choice("ellipse", "Ellipse")}</div>
      {mode === "ellipse" && <label className="mt-2 flex items-center justify-between gap-2 text-xs text-muted-foreground">Nombre de jours
        <Input type="number" inputMode="numeric" min={1} max={9999} value={days} onChange={(event) => setDays(event.target.value)} onBlur={() => setDays(String(ellipseDays(days)))} className="h-7 w-20 text-right tabular-nums" />
      </label>}
      <label className="mt-2.5 flex cursor-pointer items-center gap-2 text-xs"><Checkbox checked={fed} onCheckedChange={(value) => setFed(value === true)} />Repas offert</label>
      {fed && <NativeSelect size="sm" value={meal} onChange={(event) => setMeal(event.target.value as SatietyMeal)} className="mt-1.5 h-8 text-xs" aria-label="Repas">
        {satietyMeals.map((entry) => <NativeSelectOption key={entry.key} value={entry.key}>{entry.label} (+{entry.charges})</NativeSelectOption>)}
      </NativeSelect>}
      {campaigns.length > 1 && <label className="mt-2.5 grid gap-1 text-xs text-muted-foreground">Campagne où les jours comptent
        <NativeSelect size="sm" value={campaignId} onChange={(event) => setStoredCampaign(event.target.value)} className="h-8 text-xs text-foreground">
          {campaigns.map((campaign) => <NativeSelectOption key={campaign.id} value={campaign.id}>{campaign.name}</NativeSelectOption>)}
        </NativeSelect>
      </label>}
      <p className="mt-2.5 rounded-md bg-muted/60 px-2 py-1.5 text-[11px] text-muted-foreground">
        {describeRest(rest)}
        {preview !== undefined && <span className="mt-0.5 flex items-center gap-1.5 text-foreground"><SatietyBar charges={preview} size="sm" /><span aria-hidden>→</span><SatietyBar charges={chargesAfterRest(preview, rest)} size="sm" /></span>}
      </p>
      <Button type="button" size="sm" className="mt-2.5 w-full" disabled={busy} onClick={() => void confirm()}>{busy && <LoaderCircle className="size-3.5 animate-spin" />}Valider</Button>
    </PopoverContent>
  </Popover>
}

type SatietyEntry = { state: SatietyState | null; available: boolean; error: string }

const emptyEntry: SatietyEntry = { state: null, available: true, error: "" }
const entries = new Map<string, SatietyEntry>()
const lastReads = new Map<string, number>()
const pendingActions = new Map<string, number>()
const listeners = new Set<() => void>()

function entryOf(characterId: string) {
  return entries.get(characterId) ?? emptyEntry
}

function setEntry(characterId: string, patch: Partial<SatietyEntry>) {
  entries.set(characterId, { ...entryOf(characterId), ...patch })
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

async function loadSatiety(characterId: string) {
  // La barre et les étiquettes de campagne la demandent ensemble : une seule lecture.
  if (Date.now() - (lastReads.get(characterId) ?? 0) < 2_000) return
  lastReads.set(characterId, Date.now())
  try {
    const response = await fetch(`/api/characters/satiety?ids=${encodeURIComponent(characterId)}`, { cache: "no-store" })
    const payload = (await response.json().catch(() => ({}))) as { available?: boolean; records?: Record<string, SatietyState | null> }
    // Une action partie pendant la lecture garde la main : sa réponse arrivera après.
    if (!response.ok || pendingActions.get(characterId)) return
    if (payload.available === false) { setEntry(characterId, { available: false }); return }
    const record = payload.records?.[characterId]
    if (record) setEntry(characterId, { state: record })
  } catch { /* hors ligne : la barre reste telle quelle */ }
}

/**
 * La barre d'un personnage sur sa fiche : lue au serveur partagé à l'ouverture (et quand on
 * revient sur la fenêtre, une nuit de groupe a pu passer), changée d'abord à l'écran puis
 * enregistrée ; un refus remet la barre d'avant et le dit. Gardée hors de la fiche : seuls
 * la barre et les étiquettes de campagne se redessinent quand elle change.
 */
export function useCharacterSatiety(characterId: string) {
  const entry = useSyncExternalStore(subscribe, () => entryOf(characterId), () => emptyEntry)

  useEffect(() => {
    // La lecture part après la première peinture : la fiche ne l'attend pas.
    const timer = window.setTimeout(() => void loadSatiety(characterId), 0)
    const onVisible = () => { if (document.visibilityState === "visible" && Date.now() - (lastReads.get(characterId) ?? 0) > 60_000) void loadSatiety(characterId) }
    document.addEventListener("visibilitychange", onVisible)
    return () => { window.clearTimeout(timer); document.removeEventListener("visibilitychange", onVisible) }
  }, [characterId])

  const act = useCallback(async (action: SatietyAction) => {
    const before = entryOf(characterId).state
    setEntry(characterId, { state: applySatietyAction(before ?? emptySatiety(), action), error: "" })
    pendingActions.set(characterId, (pendingActions.get(characterId) ?? 0) + 1)
    try {
      const reply = await sendSatiety({ characterIds: [characterId], action })
      const record = reply.records[characterId]
      if (record) setEntry(characterId, { state: record })
    } catch (failure) {
      setEntry(characterId, { state: before, error: failure instanceof Error ? failure.message : "La barre de rassasiement n’a pas pu être enregistrée." })
      throw failure
    } finally {
      pendingActions.set(characterId, (pendingActions.get(characterId) ?? 1) - 1)
    }
  }, [characterId])

  const clearError = useCallback(() => setEntry(characterId, { error: "" }), [characterId])

  return { ...entry, act, clearError }
}

/**
 * Sous le portrait, le token et les états : la barre de rassasiement et sa lune. Les jours
 * comptent dans la campagne choisie (la seule, ou celle retenue parmi plusieurs).
 */
export function CharacterSatietyPanel({ characterId, campaigns }: { characterId: string; campaigns: SatietyCampaign[] }) {
  const { state, available, error, act, clearError } = useCharacterSatiety(characterId)
  const charges = state?.charges ?? SATIETY_MAX
  return <div className="rounded-xl border bg-background/40 px-2.5 py-2">
    <div className="flex items-center justify-between gap-2">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Barre de rassasiement</p>
    </div>
    <div className={cn("mt-1 flex items-center justify-between gap-2", !state && available && "opacity-60")}>
      {available
        ? <SatietyBar charges={charges} onChange={(value) => void act({ kind: "set", charges: value }).catch(() => {})} />
        : <span className="text-[11px] text-muted-foreground">Serveur partagé injoignable.</span>}
      <RestButton disabled={!available} preview={charges} campaigns={campaigns} campaignKey={characterId} title="Nuit ou ellipse" onRest={(rest) => act({ kind: "rest", ...rest })} />
    </div>
    {error && <p className="mt-1 text-[11px] text-destructive" role="alert">{error} <button type="button" onClick={clearError} className="underline underline-offset-2">OK</button></p>}
  </div>
}

/** Les étiquettes des campagnes de la fiche : « Nom • 12 jours ». */
export function CampaignDayTags({ characterId, campaigns }: { characterId: string; campaigns: SatietyCampaign[] }) {
  const { state } = useCharacterSatiety(characterId)
  if (!campaigns.length) return <span className="rounded-full border px-3 py-1 text-xs text-muted-foreground">Sans campagne</span>
  return <>{campaigns.map((campaign) => {
    const color = campaign.accentColor || "#927640"
    const days = state?.days[campaign.id] ?? 0
    return <span key={campaign.id} className="rounded-full border px-3 py-1 text-xs font-medium" style={{ color, borderColor: `${color}66`, backgroundColor: `${color}12` }} title={`${daysLabel(days)} passé${days > 1 ? "s" : ""} dans cette campagne`}>
      {campaign.name}{state && <span className="tabular-nums opacity-80"> • {daysLabel(days)}</span>}
    </span>
  })}</>
}
