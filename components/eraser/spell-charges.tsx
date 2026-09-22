"use client"

import { Sparkle } from "lucide-react"

function bounded(value: number, maximum: number) {
  return Math.max(0, Math.min(maximum, Math.trunc(value)))
}

/**
 * Les charges se comportent comme une barre et non comme des points indépendants :
 * cliquer une étincelle pleine vide la barre jusqu’à elle comprise, cliquer une
 * étincelle vide la remplit jusqu’à elle comprise.
 */
export function nextSpellChargeValue(total: number, current: number, clickedIndex: number) {
  const maximum = bounded(total, 5)
  const available = bounded(current, maximum)
  const index = bounded(clickedIndex, maximum - 1)
  return index < available ? index : index + 1
}

function ChargeStar({ filled }: { filled: boolean }) {
  return <Sparkle aria-hidden="true" className="size-4" fill={filled ? "currentColor" : "none"} strokeWidth={filled ? 1.5 : 1.8} />
}

export function SpellChargeStars({ total, current, accent = "currentColor", interactive = false, onChange, className = "" }: { total: number | null; current?: number | null; accent?: string; interactive?: boolean; onChange?: (value: number) => void; className?: string }) {
  if (total === null || total <= 0) return null
  const maximum = bounded(total, 5)
  const available = bounded(current ?? maximum, maximum)
  return <span className={`inline-flex items-center gap-0.5 ${className}`} style={{ color: accent }} role={interactive ? "group" : "img"} aria-label={`${available} charge${available > 1 ? "s" : ""} disponible${available > 1 ? "s" : ""} sur ${maximum}`}>
    {Array.from({ length: maximum }, (_, index) => {
      const filled = index < available
      if (!interactive) return <span key={index} className="inline-flex"><ChargeStar filled /></span>
      const nextValue = nextSpellChargeValue(maximum, available, index)
      return <button
        key={index}
        type="button"
        onClick={(event) => { event.stopPropagation(); onChange?.(nextValue) }}
        className={`inline-flex rounded-sm p-0.5 transition hover:scale-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 ${filled ? "opacity-100" : "opacity-40 hover:opacity-70"}`}
        aria-label={filled ? `Dépenser jusqu’à la charge ${index + 1}` : `Récupérer jusqu’à la charge ${index + 1}`}
      >
        <ChargeStar filled={filled} />
      </button>
    })}
  </span>
}
