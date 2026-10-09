"use client"

import { useEffect, useState } from "react"
import { Dices, Minus, Plus, RotateCcw, Undo2 } from "lucide-react"

import { useCharacterCatalog } from "@/components/eraser/use-character-catalog"
import { Button } from "@/components/ui/button"
import { builtinCharacteristicColor } from "@/lib/character-catalog"
import { allRolled, CREATION_STATS, finalStat, REBALANCE_POINTS, rebalanceSummary, type CreationAdjustments, type CreationRolls } from "@/lib/character-creation-rolls"

/** Une valeur au hasard dans les bornes d'une formule, le temps que le dé roule. */
function tumbleValue(key: string) {
  return key === "vie" ? 72 + Math.floor(Math.random() * 39) : key === "rapidite" ? -19 + Math.floor(Math.random() * 40) : 22 + Math.floor(Math.random() * 19)
}

/**
 * Étape 2/2 de la création : chaque statistique montre sa formule tant qu'elle n'est pas
 * lancée, puis son résultat. On lance tout d'un coup ou une à une ; ensuite, le
 * rééquilibrage. Tout l'état vient du formulaire (on revient à l'étape 1 sans rien perdre).
 */
export function CharacterCreationStats({ rolls, adjustments, canUndo, accent, onRoll, onUndo, onAdjust }: {
  rolls: CreationRolls
  adjustments: CreationAdjustments
  canUndo: boolean
  accent: string
  /** `keys` : les statistiques à lancer ; absent : toutes. */
  onRoll: (keys?: string[]) => void
  onUndo: () => void
  onAdjust: (key: string, delta: number) => void
}) {
  // Les dés roulent un instant avant de s'arrêter sur leur valeur.
  const [tumbling, setTumbling] = useState<{ keys: string[]; values: Record<string, number> } | null>(null)
  const [tumbleRun, setTumbleRun] = useState<{ id: number; keys: string[] } | null>(null)
  useEffect(() => {
    if (!tumbleRun) return
    let ticks = 0
    const timer = window.setInterval(() => {
      ticks += 1
      if (ticks > 7) { window.clearInterval(timer); setTumbling(null); return }
      setTumbling({ keys: tumbleRun.keys, values: Object.fromEntries(tumbleRun.keys.map((key) => [key, tumbleValue(key)])) })
    }, 55)
    return () => window.clearInterval(timer)
  }, [tumbleRun])

  // Chaque statistique à la couleur que lui donne l'Index des caractéristiques, comme sur la fiche.
  const catalog = useCharacterCatalog()
  const colorOf = (header: string) => catalog.characteristics.find((item) => item.key === header)?.color || builtinCharacteristicColor(header) || accent
  const missing = CREATION_STATS.filter((stat) => !rolls[stat.key]).map((stat) => stat.key)
  const complete = allRolled(rolls)
  const roll = (keys?: string[]) => {
    onRoll(keys)
    setTumbleRun((current) => ({ id: (current?.id ?? 0) + 1, keys: keys ?? CREATION_STATS.map((stat) => stat.key) }))
  }
  // « Lancer tous les dés » lance ce qui reste ; une fois tout lancé, le dé relance tout.
  const rollAll = () => roll(missing.length && missing.length < CREATION_STATS.length ? missing : undefined)
  const summary = rebalanceSummary(adjustments)

  return <div className="space-y-5">
    <div className="flex flex-wrap items-start gap-3">
      <div className="min-w-0 flex-1">
        <p className="font-display text-2xl font-semibold">Statistiques de départ</p>
        <p className="mt-1 text-sm text-muted-foreground">{complete ? `Retire jusqu’à ${REBALANCE_POINTS} points où tu veux, et remets-les ailleurs.` : `Lance les dés de chaque statistique, une à une ou toutes d’un coup. Ensuite, ${REBALANCE_POINTS} points à déplacer de l’une à l’autre.`}</p>
      </div>
      <div className="flex items-center gap-1">
        {canUndo && <Button type="button" variant="ghost" size="icon-sm" onClick={onUndo} aria-label="Revenir au lancer précédent" title="Revenir au lancer précédent"><Undo2 /></Button>}
        {complete
          ? <Button type="button" variant="ghost" size="icon-sm" onClick={rollAll} aria-label="Lancer tous les dés" title="Lancer tous les dés"><Dices /></Button>
          : <Button type="button" onClick={rollAll} style={{ backgroundColor: accent }}><Dices />{missing.length === CREATION_STATS.length ? "Lancer tous les dés" : "Lancer les dés restants"}</Button>}
      </div>
    </div>

    {complete && <div className="grid gap-2 rounded-2xl border bg-background/40 p-3 sm:grid-cols-2">
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[.16em] text-muted-foreground">Points à déplacer</p>
        <p className={`font-display text-2xl font-semibold tabular-nums ${summary.left < 0 ? "text-destructive" : ""}`}>{summary.left}<span className="text-sm font-normal text-muted-foreground"> / {REBALANCE_POINTS}</span></p>
      </div>
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[.16em] text-muted-foreground">À placer</p>
        <p className={`font-display text-2xl font-semibold tabular-nums ${summary.toPlace < 0 ? "text-destructive" : summary.toPlace > 0 ? "text-amber-500" : ""}`}>{summary.toPlace}</p>
      </div>
      {summary.problem && <p className={`text-xs sm:col-span-2 ${summary.left < 0 || summary.toPlace < 0 ? "text-destructive" : "text-amber-600 dark:text-amber-400"}`}>{summary.problem}</p>}
    </div>}

    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
      {CREATION_STATS.map((stat) => {
        const delta = Math.trunc(adjustments[stat.key] ?? 0)
        const rolled = rolls[stat.key]
        const rolling = Boolean(tumbling?.keys.includes(stat.key))
        const color = colorOf(stat.headers[0])
        return <div key={stat.key} className="flex items-center gap-2 rounded-xl px-3 py-2 shadow-sm transition" style={{ backgroundColor: `${color}16`, borderTop: `3px solid ${color}`, boxShadow: delta ? `inset 0 0 0 1px ${delta > 0 ? "#4d7c0f" : "#b3261e"}55` : undefined }}>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase leading-tight tracking-[.12em]" style={{ color }}>{stat.label}</p>
            {rolled && <p className="text-[10px] text-muted-foreground" title={rolled.detail}>{stat.dice}{delta ? ` · dés : ${rolled.value}` : ""}</p>}
          </div>
          {rolled && complete && <Button type="button" variant="ghost" size="icon-xs" onClick={() => onAdjust(stat.key, delta - 1)} aria-label={`Retirer 1 à ${stat.label}`} disabled={Boolean(tumbling)}><Minus /></Button>}
          {rolling
            ? <span className="w-14 text-center font-display text-2xl font-semibold tabular-nums opacity-60">{tumbling?.values[stat.key] ?? "…"}</span>
            : rolled
              ? <span className="w-14 text-center font-display text-2xl font-semibold tabular-nums" style={!delta ? { color } : undefined}>{finalStat(rolls, adjustments, stat.key)}</span>
              : <button type="button" onClick={() => roll([stat.key])} className="inline-flex items-center gap-1.5 rounded-lg border border-dashed bg-background/50 px-2.5 py-1.5 font-mono text-sm transition hover:border-solid hover:bg-background/80" style={{ borderColor: `${color}99`, color }} aria-label={`Lancer ${stat.dice} pour ${stat.label}`} title="Lancer ce dé"><Dices className="size-4" />{stat.dice}</button>}
          {rolled && complete && <Button type="button" variant="ghost" size="icon-xs" onClick={() => onAdjust(stat.key, delta + 1)} aria-label={`Ajouter 1 à ${stat.label}`} disabled={Boolean(tumbling)}><Plus /></Button>}
          {rolled && <span className="flex w-14 items-center justify-end gap-0.5 text-xs font-semibold tabular-nums">
            {delta !== 0
              ? <button type="button" onClick={() => onAdjust(stat.key, 0)} className="inline-flex items-center gap-0.5 rounded-md px-1 py-0.5 hover:bg-muted" style={{ color: delta > 0 ? "#4d7c0f" : "#b3261e" }} title={`Revenir à ${rolled.value} (les dés)`} aria-label={`Remettre ${stat.label} à ${rolled.value}`}>{delta > 0 ? `+${delta}` : delta}<RotateCcw className="size-3" /></button>
              : <button type="button" onClick={() => roll([stat.key])} disabled={Boolean(tumbling)} className="rounded-md p-1 text-muted-foreground/60 transition hover:bg-muted hover:text-foreground" aria-label={`Lancer ${stat.dice} pour ${stat.label}`} title="Lancer ce dé"><Dices className="size-3.5" /></button>}
          </span>}
        </div>
      })}
    </div>
  </div>
}
