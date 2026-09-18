"use client"

import { Sparkle } from "lucide-react"

function bounded(value: number, maximum: number) {
  return Math.max(0, Math.min(maximum, Math.trunc(value)))
}

export function nextSpellChargeValue(total: number, current: number, clickedIndex: number) {
  const maximum = bounded(total, 5)
  const available = bounded(current, maximum)
  if (clickedIndex === available - 1) return available - 1
  if (clickedIndex === available) return available + 1
  return available
}

function ChargeStar({ filled }: { filled: boolean }) {
  return <Sparkle aria-hidden="true" className="size-4" fill={filled ? "currentColor" : "none"} strokeWidth={filled ? 1.5 : 1.8} />
}

export function SpellChargeStars({ total, current = total, accent = "currentColor", interactive = false, onChange, className = "" }: { total: number | null; current?: number; accent?: string; interactive?: boolean; onChange?: (value: number) => void; className?: string }) {
  if (total === null || total <= 0) return null
  const maximum = bounded(total, 5)
  const available = bounded(current, maximum)
  return <span className={`inline-flex items-center gap-0.5 ${className}`} style={{ color: accent }} role={interactive ? "group" : "img"} aria-label={`${available} charge${available > 1 ? "s" : ""} disponible${available > 1 ? "s" : ""} sur ${maximum}`}>
    {Array.from({ length: maximum }, (_, index) => {
      const filled = index < available
      const nextValue = nextSpellChargeValue(maximum, available, index)
      const canSpend = interactive && nextValue === available - 1
      const canRecover = interactive && nextValue === available + 1
      const canChange = interactive && nextValue !== available
      if (!interactive) return <span key={index} className="inline-flex"><ChargeStar filled /></span>
      return <button key={index} type="button" disabled={!canChange} onClick={(event) => { event.stopPropagation(); if (canChange) onChange?.(nextValue) }} className="inline-flex rounded-sm p-0.5 transition enabled:hover:scale-110 enabled:focus-visible:outline enabled:focus-visible:outline-2 enabled:focus-visible:outline-offset-1 disabled:cursor-default disabled:opacity-55" aria-label={canSpend ? "Dépenser la prochaine charge" : canRecover ? "Récupérer la prochaine charge" : filled ? "Charge disponible" : "Charge indisponible"}>
        <ChargeStar filled={filled} />
      </button>
    })}
  </span>
}
