"use client"

import { useEffect, useState } from "react"
import { Check, Sparkles, WandSparkles } from "lucide-react"

import { ANY_CHARACTERISTIC_TARGET, formatRankBonusAmount, rankBonusHasContent, type RankBonus } from "@/lib/rank-bonuses"

/** Une colonne nommée « Bonus » n'a pas besoin de répéter son nom devant la valeur. */
function isGenericLabel(label: string) {
  return !label || /^bonus( de rang)?s?$/i.test(label.normalize("NFD").replace(/[̀-ͯ]/g, "").trim())
}

/** « +5 Rapidité », « +10 Caractéristique au choix ». */
export function rankBonusLabel(entry: { target: string; value: string; amount: number }) {
  const amount = entry.value.trim() ? formatRankBonusAmount(entry.amount) : ""
  const target = entry.target === ANY_CHARACTERISTIC_TARGET ? "Caractéristique au choix" : entry.target
  return [amount, target].filter(Boolean).join(" ")
}

/**
 * Les bonus gagnés à un rang (communs à toutes les classes), affichés sous le titre du
 * rang et au-dessus du choix des sorts. Rien n'est affiché si le rang n'en a pas.
 * `taken` : le rang a déjà été obtenu par ce personnage (ses bonus sont sur la fiche).
 */
export function RankBonusLine({ bonus, accent, className = "", taken = false }: { bonus?: RankBonus; accent: string; className?: string; taken?: boolean }) {
  if (!rankBonusHasContent(bonus)) return null
  const pill = "rounded-full border px-2 py-0.5 font-medium"
  const style = { borderColor: `${accent}40`, backgroundColor: `${accent}10` }
  return <div className={`flex flex-wrap items-center gap-1.5 text-xs ${className}`}>
    <span className="inline-flex items-center gap-1 font-semibold uppercase tracking-[.14em] text-[10px]" style={{ color: accent }}><Sparkles className="size-3" />Bonus de rang</span>
    {bonus.choose > 0 && <span className="text-[11px] text-muted-foreground">{bonus.choose} au choix parmi :</span>}
    {bonus.bonuses.map((entry) => <span key={entry.slot} className={pill} style={style}>{rankBonusLabel(entry)}</span>)}
    {bonus.customSpell && <span className={`${pill} inline-flex items-center gap-1`} style={style}><WandSparkles className="size-3" />Sort sur mesure</span>}
    {bonus.other && <span className={pill} style={style}>{bonus.other}</span>}
    {bonus.entries.map((entry, index) => <span key={`${entry.label}:${index}`} className={pill} style={style}>
      {isGenericLabel(entry.label) ? entry.value : <><span className="text-muted-foreground">{entry.label} :</span> {entry.value}</>}
    </span>)}
    {taken && <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-500" title="Ces bonus ont été ajoutés à la fiche"><Check className="size-3" />Obtenus</span>}
  </div>
}

// Les bonus déjà lus : revenir sur une page (fiche, onglet Sorts) les montre aussitôt, relus derrière.
let knownRankBonuses: RankBonus[] | null = null
let pendingRankBonuses: Promise<RankBonus[] | null> | null = null

function fetchRankBonuses(retry = false) {
  if (retry) pendingRankBonuses = null
  if (pendingRankBonuses) return pendingRankBonuses
  const request: Promise<RankBonus[] | null> = fetch("/api/classes/rank-bonuses", { cache: "no-store" })
    .then(async (response) => response.ok ? ((await response.json()) as { bonuses?: RankBonus[] }).bonuses ?? null : null)
    .catch(() => null)
    // Un échec n'est pas gardé : le prochain appel redemande.
    .then((result) => { if (!result && pendingRankBonuses === request) pendingRankBonuses = null; return result })
  pendingRankBonuses = request
  window.setTimeout(() => { if (pendingRankBonuses === request) pendingRankBonuses = null }, 30_000)
  return request
}

/**
 * Les bonus de rang, communs à toutes les classes. Pas encore lus (Google saturé, réseau
 * coupé) : redemandés d'eux-mêmes, trois fois, espacés ; sinon un passage de niveau ne
 * proposait aucun bonus.
 */
export function useRankBonuses() {
  const [bonuses, setBonuses] = useState<RankBonus[]>(() => knownRankBonuses ?? [])
  const [loaded, setLoaded] = useState(knownRankBonuses !== null)
  useEffect(() => {
    let active = true
    let timer = 0
    const load = (attempt: number) => {
      void fetchRankBonuses(attempt > 0).then((result) => {
        if (result) knownRankBonuses = result
        if (!active) return
        if (result) setBonuses(result)
        setLoaded(true)
        if (!result && knownRankBonuses === null && attempt < 3) timer = window.setTimeout(() => load(attempt + 1), 15_000 * (attempt + 1))
      })
    }
    load(0)
    return () => { active = false; window.clearTimeout(timer) }
  }, [])
  return { bonuses, loaded }
}

/** Garde les bonus lus ailleurs (le tableau des index vient de les changer). */
export function rememberRankBonuses(bonuses: RankBonus[]) {
  knownRankBonuses = bonuses
}

