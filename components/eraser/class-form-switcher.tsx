"use client"

import { Check, Layers } from "lucide-react"

import { IndexRichText } from "@/components/eraser/index-references"
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card"
import { activeForm, formEffectOperation, type ClassForm, type ClassFormGroup } from "@/lib/class-forms"
import { operationLabel } from "@/lib/state-change"

/** Les effets d'une forme, lisibles : « Force +10 », « Armure physique ≥5 ». */
export function FormEffectsList({ form, className = "" }: { form: ClassForm; className?: string }) {
  const effects = form.effects.flatMap((effect) => {
    const operation = formEffectOperation(effect.change)
    return operation ? [{ target: effect.target, label: operationLabel(operation), negative: operation.kind === "add" && operation.amount < 0 }] : []
  })
  if (!effects.length) return null
  return <div className={`flex flex-wrap gap-1 ${className}`}>
    {effects.map((effect, index) => <span key={index} className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px]" style={{ borderColor: `${form.color}55`, backgroundColor: `${form.color}12` }}>
      <span>{effect.target}</span><span className={`font-semibold tabular-nums ${effect.negative ? "text-rose-400" : "text-emerald-500"}`}>{effect.label}</span>
    </span>)}
  </div>
}

/**
 * Le choix de la forme active d'un groupe, sur la fiche : un bouton par forme, la forme
 * active à sa couleur. Au survol d'une forme : ses effets et sa description. `onChoose`
 * absent : en lecture (aperçu).
 */
export function ClassFormSwitcher({ group, chosen, onChoose, compact = false }: { group: ClassFormGroup; chosen?: string; onChoose?: (form: ClassForm) => void; compact?: boolean }) {
  const current = activeForm(group, chosen)
  if (!current) return null
  const color = current.color
  return <div className={`rounded-xl shadow-sm ${compact ? "px-3 py-2" : "px-3 py-2.5"}`} style={{ backgroundColor: `${color}14`, borderTop: `2px solid ${color}` }}>
    <div className="flex flex-wrap items-center gap-2">
      <p className="flex items-center gap-1 text-[9px] font-semibold uppercase tracking-[.16em]" style={{ color }}><Layers className="size-3" />{group.name}</p>
      <div className="ml-auto flex flex-wrap gap-1" role="radiogroup" aria-label={group.name}>
        {group.forms.map((form) => {
          const active = form.id === current.id
          const button = <button
            type="button"
            role="radio"
            aria-checked={active}
            disabled={!onChoose}
            onClick={() => { if (!active) onChoose?.(form) }}
            className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition ${active ? "text-white shadow-sm" : "hover:opacity-100 disabled:cursor-default"} ${active ? "" : "opacity-75"}`}
            style={active ? { backgroundColor: form.color, borderColor: form.color } : { borderColor: `${form.color}66`, color: form.color }}
          >{active && <Check className="size-3" />}{form.name}</button>
          const hasDetails = form.effects.length > 0 || Boolean(form.description)
          return hasDetails ? <HoverCard key={form.id} openDelay={150} closeDelay={100}>
            <HoverCardTrigger asChild>{button}</HoverCardTrigger>
            <HoverCardContent side="top" align="end" collisionPadding={12} className="max-h-[min(28rem,70vh)] w-80 space-y-2 overflow-y-auto rounded-xl p-3 text-xs leading-5" style={{ borderColor: `${form.color}66` }}>
              <p className="font-display text-sm font-semibold" style={{ color: form.color }}>{form.name}{active && <span className="ml-2 text-[10px] font-normal uppercase tracking-[.14em] text-muted-foreground">active</span>}</p>
              <FormEffectsList form={form} />
              {form.description && <IndexRichText html={form.description} />}
            </HoverCardContent>
          </HoverCard> : <span key={form.id}>{button}</span>
        })}
      </div>
    </div>
    {!compact && current.effects.length > 0 && <FormEffectsList form={current} className="mt-2" />}
  </div>
}
