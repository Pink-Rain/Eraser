"use client"

import { memo, useState } from "react"
import { Check, Dices, LoaderCircle, Lock, X } from "lucide-react"

import { IndexIconGlyph } from "@/components/eraser/index-gauge"
import { pillStyle } from "@/components/eraser/index-style"
import type { ActionButton, RandomSettings } from "@/lib/index-columns"
import type { FormulaDisplay } from "@/lib/index-formula"

/** Le résultat d'une formule dans sa case. */
export const FormulaCell = memo(function FormulaCell({ display }: { display: FormulaDisplay }) {
  switch (display.kind) {
    case "error":
      return <span className="flex min-h-8 items-center px-2 text-xs font-semibold text-destructive" title={display.message}>#ERREUR <span className="ml-1 truncate font-normal">{display.message}</span></span>
    case "checkbox":
      return <span className="flex min-h-8 items-center px-2" aria-label={display.value ? "Vrai" : "Faux"}>{display.value ? <Check className="size-4 text-primary" /> : <X className="size-4 text-muted-foreground/60" />}</span>
    case "list":
      return <span className="flex min-h-8 flex-wrap items-center gap-1 px-2 py-1">{display.items.map((item, index) => <span key={`${item}:${index}`} className="rounded-full border bg-muted/60 px-2 py-0.5 text-[11px]">{item}</span>)}</span>
    case "color":
      return <span className="flex min-h-8 items-center gap-2 px-2 text-xs text-muted-foreground">{display.value && <span className="size-4 rounded-full border" style={{ backgroundColor: display.value }} />}{display.value}</span>
    case "number":
      return <span className="flex min-h-8 items-center justify-end px-2 text-sm tabular-nums">{display.text}</span>
    default:
      return <span className="flex min-h-8 items-center whitespace-pre-wrap px-2 py-1 text-sm">{display.text}</span>
  }
})

/**
 * Une case Aléatoire : sa valeur tirée, et le dé pour tirer. Figée, elle ne se relance
 * plus depuis la case une fois remplie (vider la case, ou un bouton « Tirer au sort »,
 * permet de retirer quand même).
 */
export const RandomCell = memo(function RandomCell({ label, value, settings, disabled = false, onDraw }: { label: string; value: string; settings: RandomSettings; disabled?: boolean; onDraw: () => Promise<void> }) {
  const [pending, setPending] = useState(false)
  const fixed = settings.mode === "fixed" && Boolean(value.trim())
  return <span className="group/random flex min-h-8 items-center gap-1 px-2">
    <span className="min-w-0 flex-1 whitespace-pre-wrap text-sm">{value || <span className="text-xs text-muted-foreground">—</span>}</span>
    {fixed
      ? <span className="shrink-0 text-muted-foreground/60" title="Tirage figé : vide la case (clic droit › Vider) ou utilise un bouton « Tirer au sort » pour retirer."><Lock className="size-3.5" /></span>
      : <button type="button" disabled={disabled || pending} onClick={async () => { setPending(true); try { await onDraw() } finally { setPending(false) } }} className="shrink-0 rounded-md p-1 text-primary hover:bg-primary/10 disabled:opacity-40" title={value ? "Relancer le tirage" : "Tirer au sort"} aria-label={`${label} : ${value ? "relancer" : "tirer"}`}>
        {pending ? <LoaderCircle className="size-4 animate-spin" /> : <Dices className="size-4" />}
      </button>}
  </span>
})

/** Un bouton de la colonne Boutons. */
export function ActionButtonView({ button, disabled = false, onRun }: { button: ActionButton; disabled?: boolean; onRun: () => Promise<void> }) {
  const [pending, setPending] = useState(false)
  const style = pillStyle(button.color || "#927640")
  return <button
    type="button"
    disabled={disabled || pending}
    onClick={async (event) => { event.stopPropagation(); setPending(true); try { await onRun() } finally { setPending(false) } }}
    title={button.iconOnly ? button.label : undefined}
    aria-label={button.label}
    className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md border px-2 text-xs font-semibold transition hover:brightness-95 disabled:opacity-50"
    style={style}
  >
    {pending ? <LoaderCircle className="size-3.5 animate-spin" /> : (button.icon || !button.iconOnly) && <IndexIconGlyph icon={button.icon || "zap"} className="size-3.5" filled={false} />}
    {!button.iconOnly && <span className="truncate">{button.label || "Bouton"}</span>}
  </button>
}

/** Les boutons d'une case : ceux dont la condition est remplie sur cette ligne. */
export const ActionsCell = memo(function ActionsCell({ buttons, disabled = false, visible, onRun }: { buttons: ActionButton[]; disabled?: boolean; visible: (button: ActionButton) => boolean; onRun: (button: ActionButton) => Promise<void> }) {
  const shown = buttons.filter(visible)
  return <span className="flex min-h-8 flex-wrap items-center gap-1 px-1.5 py-1">
    {shown.map((button) => <ActionButtonView key={button.id} button={button} disabled={disabled} onRun={() => onRun(button)} />)}
    {!buttons.length && <span className="text-xs text-muted-foreground">Aucun bouton : ajoute-les dans « Modifier ».</span>}
  </span>
})
