"use client"

import { useEffect, useState } from "react"
import { Check, Sparkles, WandSparkles } from "lucide-react"

import { catalogGroups, type CharacterCatalog } from "@/lib/character-catalog"
import type { ChoiceOption } from "@/lib/index-columns"
import { ANY_CHARACTERISTIC_TARGET, formatRankBonusAmount, MOVEMENT_TARGET, rankBonusHasContent, type RankBonus } from "@/lib/rank-bonuses"

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

function fetchRankBonuses() {
  pendingRankBonuses ??= fetch("/api/classes/rank-bonuses", { cache: "no-store" })
    .then(async (response) => response.ok ? ((await response.json()) as { bonuses?: RankBonus[] }).bonuses ?? null : null)
    .catch(() => null)
    .finally(() => { window.setTimeout(() => { pendingRankBonuses = null }, 30_000) })
  return pendingRankBonuses
}

/** Les bonus de rang, communs à toutes les classes. Sans réseau, aucun. */
export function useRankBonuses() {
  const [bonuses, setBonuses] = useState<RankBonus[]>(() => knownRankBonuses ?? [])
  const [loaded, setLoaded] = useState(knownRankBonuses !== null)
  useEffect(() => {
    let active = true
    void fetchRankBonuses().then((result) => {
      if (result) knownRankBonuses = result
      if (!active) return
      if (result) setBonuses(result)
      setLoaded(true)
    })
    return () => { active = false }
  }, [])
  return { bonuses, loaded }
}

/** Garde les bonus lus ailleurs (le tableau des index vient de les changer). */
export function rememberRankBonuses(bonuses: RankBonus[]) {
  knownRankBonuses = bonuses
}

/**
 * Ce qu'une « Cible » de bonus de rang peut viser : « Caractéristique » et « Déplacement »
 * d'abord, puis tout ce que la fiche affiche, rangé comme elle (général, déplacement,
 * chaque caractéristique avec ses compétences).
 */
export function rankBonusTargetOptions(catalog: CharacterCatalog) {
  const listSecondaries = new Set(["Classe sociale", "Alignement"])
  const special = "Au choix du joueur"
  const options: ChoiceOption[] = [
    { value: ANY_CHARACTERISTIC_TARGET, group: special, hint: "Le joueur répartit la valeur entre ses caractéristiques principales." },
    { value: MOVEMENT_TARGET, group: special, hint: "Ajouté à l’action de déplacement gratuite (et donc aux trois)." },
  ]
  const groups: Array<{ name: string; color?: string }> = [{ name: special, color: "#b48745" }, { name: "Général", color: "#8a9bb0" }]
  for (const item of catalog.characteristics) {
    if (item.kind === "secondaire" && !listSecondaries.has(item.key)) options.push({ value: item.name, group: "Général" })
  }
  const movement = catalog.characteristics.filter((item) => item.kind === "deplacement")
  if (movement.length) {
    groups.push({ name: "Déplacement", color: "#5f9fa0" })
    for (const item of movement) options.push({ value: item.name, group: "Déplacement" })
  }
  for (const group of catalogGroups(catalog)) {
    const name = group.characteristic?.name ?? "Autres compétences"
    groups.push({ name, color: group.characteristic?.color })
    if (group.characteristic) options.push({ value: group.characteristic.name, group: name })
    for (const skill of group.skills) options.push({ value: skill.name, group: name })
  }
  // Un même nom n'est proposé qu'une fois.
  const seen = new Set<string>()
  return { options: options.filter((option) => !seen.has(option.value) && Boolean(seen.add(option.value))), groups }
}
