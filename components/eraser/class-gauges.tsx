"use client"

import { useEffect, useState } from "react"
import { Check, Minus, Plus, RotateCcw, TriangleAlert } from "lucide-react"

import { useCommitOnLeave } from "@/components/eraser/use-commit-on-leave"
import { Input } from "@/components/ui/input"
import { GAUGE_MAX_PIPS, type ClassGauge, type ResolvedGauge } from "@/lib/class-specifics"
import { evaluateRelativeExpression } from "@/lib/math-expression"

export type ClassGaugeTable = { gauges: ClassGauge[]; sheetUrl: string; exists: boolean; canEdit?: boolean }

// Les jauges déjà lues : une fiche rouverte les montre aussitôt, relues derrière.
let known: ClassGaugeTable | null = null
let pending: Promise<ClassGaugeTable | null> | null = null
const listeners = new Set<(table: ClassGaugeTable) => void>()

function fetchGauges(create = false) {
  const load = () => fetch(`/api/classes/specifics${create ? "?create=1" : ""}`, { cache: "no-store" })
    .then(async (response) => {
      const payload = (await response.json().catch(() => ({}))) as ClassGaugeTable & { error?: string }
      if (!response.ok) throw new Error(payload.error || "Les spécificités de classe n’ont pas pu être chargées.")
      return payload
    })
  if (create) return load()
  pending ??= load().catch(() => null).finally(() => { window.setTimeout(() => { pending = null }, 30_000) })
  return pending
}

/** Ce qu'une écriture vient de renvoyer : toutes les pages ouvertes se mettent à jour. */
export function publishGauges(table: ClassGaugeTable) {
  known = table
  for (const listener of listeners) listener(table)
}

/**
 * Les jauges de toutes les classes (onglet « Jauges » du classeur des sorts). `create`
 * (éditeur de classe, MJ ou administrateur) : l'onglet est créé s'il manque.
 */
export function useClassGauges(create = false) {
  const [table, setTable] = useState<ClassGaugeTable | null>(known)
  const [error, setError] = useState("")
  useEffect(() => {
    let alive = true
    const listener = (next: ClassGaugeTable) => { if (alive) setTable(next) }
    listeners.add(listener)
    const request = create ? fetchGauges(true) : fetchGauges()
    request.then((next) => { if (alive && next) { known = next; setTable(next); setError("") } })
      .catch((reason: unknown) => { if (alive) setError(reason instanceof Error ? reason.message : "Les spécificités de classe n’ont pas pu être chargées.") })
    return () => { alive = false; listeners.delete(listener) }
  }, [create])
  return { table, gauges: table?.gauges ?? [], loading: !table && !error, error }
}

function nextValue(typed: string, current: number) {
  try { return Math.round(evaluateRelativeExpression(typed, current) * 100) / 100 } catch { return current }
}

/** Le dernier seuil atteint : son nom s'affiche à côté de la valeur. */
function reachedThreshold(resolved: ResolvedGauge) {
  return [...resolved.thresholds].filter((threshold) => threshold.label && resolved.current >= threshold.value).sort((a, b) => b.value - a.value)[0]
}

/**
 * Une jauge de classe telle que le joueur la voit. `onCurrent` / `onMax` absents : en
 * lecture (aperçu, ou valeur calculée). `compact` : une ligne, sous la barre de vie.
 */
export function ClassGaugeView({ resolved, compact = false, onCurrent, onMax, onReset, showErrors = false }: { resolved: ResolvedGauge; compact?: boolean; onCurrent?: (value: number) => void; onMax?: (value: number) => void; onReset?: () => void; showErrors?: boolean }) {
  const { gauge } = resolved
  const [editing, setEditing] = useState<"current" | "max" | null>(null)
  const [draft, setDraft] = useState("")
  const canCurrent = resolved.editableCurrent && Boolean(onCurrent)
  const canMax = resolved.editableMax && Boolean(onMax)
  const leave = useCommitOnLeave(Boolean(editing), draft, editing === "max" ? String(resolved.max) : String(resolved.current), (typed) => {
    if (editing === "max") onMax?.(nextValue(typed, resolved.max))
    else if (editing === "current") onCurrent?.(nextValue(typed, resolved.current))
  })
  async function save() { if (await leave.save()) setEditing(null) }
  const reached = reachedThreshold(resolved)
  const color = gauge.color
  const pips = Math.round(resolved.max - resolved.min)
  const usePips = gauge.display === "pastilles" && pips > 0 && pips <= GAUGE_MAX_PIPS

  function number(which: "current" | "max", value: number, editable: boolean) {
    if (editing === which) return <span className="inline-flex items-center gap-1"><Input autoFocus value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void save(); if (event.key === "Escape") { leave.cancel(); setEditing(null) } }} onBlur={() => void save()} className="h-7 w-20 px-2 text-sm" placeholder="+5, -3…" aria-label={which === "max" ? `Maximum de ${gauge.name}` : `${gauge.name} actuelle`} /><button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => void save()} className="flex size-7 items-center justify-center rounded-md text-primary hover:bg-primary/10" aria-label="Valider"><Check className="size-3.5" /></button></span>
    const className = `tabular-nums font-semibold ${compact ? "text-sm" : which === "current" ? "text-xl" : "text-base opacity-75"}`
    if (!editable) return <span className={className} style={{ color }} title={which === "current" && !resolved.editableCurrent ? "Calculée d’après la fiche" : undefined}>{value}</span>
    return <button type="button" onClick={() => { setDraft(String(value)); setEditing(which) }} className={`${className} rounded px-0.5 hover:bg-white/5`} style={{ color }} title="Une valeur, ou +5, -3, *2…">{value}</button>
  }

  const controls = <span className="inline-flex items-center gap-1">
    {canCurrent && <button type="button" onClick={() => onCurrent!(resolved.current - gauge.step)} disabled={resolved.current <= resolved.min} className="flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted disabled:opacity-30" aria-label={`Retirer ${gauge.step} à ${gauge.name}`}><Minus className="size-3" /></button>}
    <span className="inline-flex items-baseline gap-1">{number("current", resolved.current, canCurrent)}{gauge.display !== "nombre" || canMax ? <><span className="text-xs text-muted-foreground">/</span>{number("max", resolved.max, canMax)}</> : null}</span>
    {canCurrent && <button type="button" onClick={() => onCurrent!(resolved.current + gauge.step)} disabled={resolved.max > resolved.min && resolved.current >= resolved.max} className="flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted disabled:opacity-30" aria-label={`Ajouter ${gauge.step} à ${gauge.name}`}><Plus className="size-3" /></button>}
    {canCurrent && gauge.resetButton && onReset && resolved.current !== resolved.start && <button type="button" onClick={onReset} className="flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted" title={`Revenir à ${resolved.start}`} aria-label={`Remettre ${gauge.name} à ${resolved.start}`}><RotateCcw className="size-3" /></button>}
  </span>

  const bar = <div className="relative h-2 overflow-visible rounded-full" style={{ backgroundColor: `${color}26` }}>
    <div className="h-full rounded-full transition-[width]" style={{ width: `${resolved.ratio}%`, backgroundColor: color }} />
    {resolved.thresholds.map((threshold, index) => <span key={index} className="absolute -top-0.5 h-3 w-0.5 -translate-x-1/2 rounded-full bg-foreground/45" style={{ left: `${threshold.ratio}%` }} title={threshold.label ? `${threshold.label} (${threshold.value})` : String(threshold.value)} />)}
  </div>

  const pipRow = usePips && <div className="flex flex-wrap gap-1" role={canCurrent ? "group" : "img"} aria-label={`${gauge.name} : ${resolved.current} sur ${resolved.max}`}>
    {Array.from({ length: pips }, (_, index) => {
      const filled = index < resolved.current - resolved.min
      const dot = <span className="block size-3 rounded-full border" style={{ borderColor: color, backgroundColor: filled ? color : "transparent" }} />
      if (!canCurrent) return <span key={index}>{dot}</span>
      // Comme les charges : une pastille pleine vide la jauge jusqu'à elle, une vide la remplit jusqu'à elle.
      const target = resolved.min + (filled ? index : index + 1)
      return <button key={index} type="button" onClick={() => onCurrent!(target)} className="rounded-full p-0.5 transition hover:scale-110" aria-label={`${gauge.name} à ${target}`}>{dot}</button>
    })}
  </div>

  const problem = showErrors && resolved.errors.length > 0 && <p className="mt-1 flex items-start gap-1 text-[11px] text-amber-500"><TriangleAlert className="mt-0.5 size-3 shrink-0" />{resolved.errors.join(" · ")}</p>

  if (compact) return <div className="w-full" title={gauge.description || undefined}>
    <div className="flex items-center gap-2">
      <span className="min-w-0 truncate text-[9px] font-semibold uppercase tracking-[.16em]" style={{ color }}>{gauge.name}</span>
      {reached && <span className="truncate rounded-full px-1.5 text-[9px] font-semibold" style={{ backgroundColor: `${color}22`, color }}>{reached.label}</span>}
      <span className="ml-auto">{controls}</span>
    </div>
    {gauge.display === "barre" && <div className="mt-1">{bar}</div>}
    {pipRow && <div className="mt-1">{pipRow}</div>}
    {problem}
  </div>

  return <div className="flex min-h-20 flex-col justify-between gap-2 rounded-xl px-3 py-2.5 shadow-sm" style={{ backgroundColor: `${color}14`, borderTop: `2px solid ${color}` }} title={gauge.description || undefined}>
    <div className="flex flex-wrap items-center gap-2">
      <p className="text-[9px] font-semibold uppercase tracking-[.16em]" style={{ color }}>{gauge.name}</p>
      {reached && <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ backgroundColor: `${color}22`, color }}>{reached.label}</span>}
      <span className="ml-auto">{controls}</span>
    </div>
    {gauge.display === "barre" && bar}
    {pipRow}
    {problem}
  </div>
}
