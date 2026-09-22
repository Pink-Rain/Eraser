"use client"

import { Sparkle } from "lucide-react"

function bounded(value: number, maximum: number) {
  return Math.max(0, Math.min(maximum, Math.trunc(value)))
}

export function nextSpellChargeValue(total: number, current: number, clickedIndex: number) {
  const maximum = bounded(total, 5)
  const available = bounded(current, maximum)
  const filled = clickedIndex < available
  return filled ? clickedIndex : clickedIndex + 1
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
      if (!interactive) return <span key={index} className={`inline-flex ${filled ? "opacity-100" : "opacity-40"}`}><ChargeStar filled /></span>
      return <button key={index} type="button" onClick={(event) => { event.stopPropagation(); onChange?.(nextValue) }} className={`inline-flex rounded-sm p-0.5 transition hover:scale-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 ${filled ? "opacity-100" : "opacity-40"}`} aria-label={`Régler à ${nextValue} charge${nextValue > 1 ? "s" : ""} sur ${maximum}`}>
        <ChargeStar filled={filled} />
      </button>
    })}
  </span>
}
