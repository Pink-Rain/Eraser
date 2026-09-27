import { Sparkles } from "lucide-react"

import type { RankBonus } from "@/lib/class-content"

/** Une colonne nommée « Bonus » n'a pas besoin de répéter son nom devant la valeur. */
function isGenericLabel(label: string) {
  return !label || /^bonus( de rang)?s?$/i.test(label.normalize("NFD").replace(/[̀-ͯ]/g, "").trim())
}

/**
 * Les bonus gagnés à un rang (communs à toutes les classes), affichés sous le titre du
 * rang et au-dessus du choix des sorts. Rien n'est affiché si le rang n'en a pas.
 */
export function RankBonusLine({ bonus, accent, className = "" }: { bonus?: RankBonus; accent: string; className?: string }) {
  if (!bonus?.entries.length) return null
  return <div className={`flex flex-wrap items-center gap-1.5 text-xs ${className}`}>
    <span className="inline-flex items-center gap-1 font-semibold uppercase tracking-[.14em] text-[10px]" style={{ color: accent }}><Sparkles className="size-3" />Bonus de rang</span>
    {bonus.entries.map((entry, index) => <span key={`${entry.label}:${index}`} className="rounded-full border px-2 py-0.5 font-medium" style={{ borderColor: `${accent}40`, backgroundColor: `${accent}10` }}>
      {isGenericLabel(entry.label) ? entry.value : <><span className="text-muted-foreground">{entry.label} :</span> {entry.value}</>}
    </span>)}
  </div>
}
