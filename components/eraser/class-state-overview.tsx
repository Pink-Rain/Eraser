"use client"

import { useMemo, useState } from "react"
import { AlertTriangle, ArrowRight, CheckCircle2, CircleDashed, PencilLine } from "lucide-react"

import { Button } from "@/components/ui/button"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import type { ClassSpell } from "@/lib/class-content"
import { classSpellGaps, classSpellState, MAX_CLASS_SPELLS_PER_RANK, type ClassRankState, type ClassSpellState } from "@/lib/class-spell-utils"
import { normalizeClassLabel } from "@/lib/class-utils"
import type { ClassRecord } from "@/lib/google-sheets"

const statusTone: Record<ClassRankState["status"], string> = {
  complet: "bg-emerald-600/85 text-white",
  incomplet: "bg-amber-400/80 text-amber-950",
  vide: "bg-muted text-muted-foreground ring-1 ring-inset ring-border",
  "en trop": "bg-destructive text-white",
}

const statusLabel: Record<ClassRankState["status"], string> = {
  complet: "3 sorts",
  incomplet: "incomplet",
  vide: "vide",
  "en trop": "plus de 3 sorts",
}

function rankName(rank: number) {
  return rank === 0 ? "Rang commun" : `Rang ${rank}`
}

function rankShort(rank: number) {
  return rank === 0 ? "C" : String(rank)
}

function plural(count: number, word: string, pluralWord = `${word}s`) {
  return `${count} ${count > 1 ? pluralWord : word}`
}

/** Les 21 rangs d'une classe en une ligne de pastilles colorées. */
function RankStrip({ state, size = "sm", onRank }: { state: ClassSpellState; size?: "sm" | "lg"; onRank?: (rank: number) => void }) {
  return <div className={`grid grid-cols-[repeat(21,minmax(0,1fr))] ${size === "lg" ? "gap-1.5" : "gap-0.5"}`}>
    {state.ranks.map((rank) => {
      const warn = rank.unfinished.length > 0 && rank.status !== "vide"
      const title = `${rankName(rank.rank)} : ${rank.spells.length} / ${MAX_CLASS_SPELLS_PER_RANK}${warn ? ` — ${plural(rank.unfinished.length, "sort")} à terminer` : ""}`
      const content = size === "lg"
        ? <><span className="text-[10px] font-semibold opacity-80">{rankShort(rank.rank)}</span><span className="text-sm font-bold">{rank.spells.length}</span></>
        : null
      const className = `relative flex flex-col items-center justify-center rounded ${size === "lg" ? "h-12" : "h-3.5"} ${statusTone[rank.status]}`
      return onRank
        ? <button key={rank.rank} type="button" title={title} onClick={() => onRank(rank.rank)} className={`${className} transition hover:brightness-110`}>{content}{warn && <span className="absolute right-0.5 top-0.5 size-1.5 rounded-full bg-amber-200 ring-1 ring-amber-900/40" />}</button>
        : <span key={rank.rank} title={title} className={className}>{content}</span>
    })}
  </div>
}

function Legend() {
  return <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
    {(["complet", "incomplet", "vide", "en trop"] as const).map((status) => <span key={status} className="flex items-center gap-1.5"><span className={`size-2.5 rounded-sm ${statusTone[status]}`} />{statusLabel[status]}</span>)}
  </div>
}

function Stat({ label, value, tone = "" }: { label: string; value: string | number; tone?: string }) {
  return <div className="rounded-xl border bg-card/70 px-4 py-3">
    <p className="text-[10px] font-semibold uppercase tracking-[.16em] text-muted-foreground">{label}</p>
    <p className={`font-display mt-1 text-2xl font-semibold ${tone}`}>{value}</p>
  </div>
}

/**
 * « État des classes » : ce qui manque à chaque classe pour avoir ses 3 sorts sur
 * chacun de ses 21 rangs. Toutes les classes d'un coup d'œil, ou une seule en détail.
 */
export function ClassStateOverview({ classes, spells, headers, onOpen }: {
  classes: ClassRecord[]
  spells: ClassSpell[]
  headers: string[]
  onOpen: (classId: string, rank?: number) => void
}) {
  const [selectedId, setSelectedId] = useState("")
  const states = useMemo(() => classes.map((characterClass) => ({
    characterClass,
    state: classSpellState(spells, characterClass.id),
    hasColumn: headers.some((header) => header === characterClass.id || normalizeClassLabel(header) === normalizeClassLabel(characterClass.name)),
  })).sort((left, right) => right.state.completion - left.state.completion || left.characterClass.name.localeCompare(right.characterClass.name, "fr")), [classes, headers, spells])
  const selected = states.find((item) => item.characterClass.id === selectedId)

  // Une classe sans aucun sort n'est pas « en cours » : elle est regroupée à part
  // pour ne pas noyer le tableau ni le compte des sorts manquants.
  const started = states.filter((item) => item.state.ranks.some((rank) => rank.spells.length))
  const notStarted = states.filter((item) => !started.includes(item))
  const finished = started.filter((item) => item.state.completion === 100 && !item.state.overfullRanks.length).length
  const missing = started.reduce((total, item) => total + item.state.missingSpells, 0)
  const overfull = started.reduce((total, item) => total + item.state.overfullRanks.length, 0)
  const unfinished = started.reduce((total, item) => total + item.state.unfinishedSpells.length, 0)

  return <section className="space-y-4">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <label className="grid w-full max-w-sm gap-1.5 text-sm font-medium">Classe
        <NativeSelect value={selectedId} onChange={(event) => setSelectedId(event.target.value)}>
          <NativeSelectOption value="">Toutes les classes</NativeSelectOption>
          {[...classes].sort((left, right) => left.name.localeCompare(right.name, "fr")).map((item) => <NativeSelectOption key={item.id} value={item.id}>{item.name}</NativeSelectOption>)}
        </NativeSelect>
      </label>
      <Legend />
    </div>

    {!selected ? <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Classes terminées" value={`${finished} / ${states.length}`} tone="text-emerald-700 dark:text-emerald-400" />
        <Stat label="Sorts manquants (classes commencées)" value={missing} />
        <Stat label="Rangs à plus de 3 sorts" value={overfull} tone={overfull ? "text-destructive" : ""} />
        <Stat label="Sorts à terminer" value={unfinished} tone={unfinished ? "text-amber-700 dark:text-amber-400" : ""} />
      </div>
      <div className="overflow-hidden rounded-2xl border bg-card/80">
        <div className="hidden grid-cols-[minmax(10rem,14rem)_minmax(0,1fr)_5rem_minmax(9rem,14rem)] gap-4 border-b bg-muted/40 px-4 py-2 text-[10px] font-semibold uppercase tracking-[.14em] text-muted-foreground md:grid">
          <span>Classe</span><span>Rangs C à 20</span><span className="text-right">Finition</span><span>À faire</span>
        </div>
        <div className="divide-y">
          {started.map(({ characterClass, state, hasColumn }) => {
            const todo = [
              state.missingSpells ? plural(state.missingSpells, "sort manquant", "sorts manquants") : "",
              state.overfullRanks.length ? `${plural(state.overfullRanks.length, "rang")} en trop` : "",
              state.unfinishedSpells.length ? `${plural(state.unfinishedSpells.length, "sort")} à terminer` : "",
            ].filter(Boolean)
            return <button key={characterClass.id} type="button" onClick={() => setSelectedId(characterClass.id)} className="grid w-full items-center gap-2 px-4 py-3 text-left transition hover:bg-muted/40 md:grid-cols-[minmax(10rem,14rem)_minmax(0,1fr)_5rem_minmax(9rem,14rem)] md:gap-4">
              <span className="flex min-w-0 items-center gap-2 font-semibold"><span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: characterClass.accentDark }} /><span className="truncate">{characterClass.name}</span></span>
              <RankStrip state={state} />
              <span className="font-display text-lg font-semibold md:text-right">{state.completion}%</span>
              <span className="text-xs text-muted-foreground">{todo.length ? todo.join(" · ") : <span className="text-emerald-700 dark:text-emerald-400">Complète</span>}{!hasColumn && <span className="block text-[11px] italic">Pas encore de colonne dans la feuille</span>}</span>
            </button>
          })}
          {!started.length && <p className="px-4 py-6 text-center text-sm text-muted-foreground">Aucune classe n’a encore de sort.</p>}
        </div>
      </div>
      {notStarted.length > 0 && <div className="rounded-2xl border border-dashed bg-card/50 px-4 py-3">
        <p className="text-sm font-semibold">Pas encore commencées <span className="font-normal text-muted-foreground">({notStarted.length} classes · aucun sort lié)</span></p>
        <div className="mt-2 flex flex-wrap gap-1.5">{notStarted.map(({ characterClass }) => <button key={characterClass.id} type="button" onClick={() => setSelectedId(characterClass.id)} className="inline-flex items-center gap-1.5 rounded-full border bg-background/60 px-2.5 py-1 text-xs font-medium hover:border-primary hover:text-primary"><span className="size-2 rounded-full" style={{ backgroundColor: characterClass.accentDark }} />{characterClass.name}</button>)}</div>
      </div>}
    </> : <ClassState {...selected} onOpen={onOpen} onBack={() => setSelectedId("")} />}
  </section>
}

function ClassState({ characterClass, state, hasColumn, onOpen, onBack }: { characterClass: ClassRecord; state: ClassSpellState; hasColumn: boolean; onOpen: (classId: string, rank?: number) => void; onBack: () => void }) {
  const accent = characterClass.accentDark || "#7f5a3a"
  const partial = state.ranks.filter((rank) => rank.status === "incomplet")
  const overfull = state.ranks.filter((rank) => rank.status === "en trop")
  const allGood = !state.missingSpells && !overfull.length && !state.unfinishedSpells.length
  const open = (rank?: number) => onOpen(characterClass.id, rank)
  const chip = (rank: ClassRankState, detail?: string) => <button key={rank.rank} type="button" onClick={() => open(rank.rank)} className="inline-flex items-center gap-1.5 rounded-full border bg-background/60 px-2.5 py-1 text-xs font-semibold hover:border-primary hover:text-primary">
    {rankName(rank.rank)}{detail && <span className="font-normal text-muted-foreground">{detail}</span>}
  </button>

  return <div className="space-y-4">
    <div className="rounded-2xl border bg-card/80 p-4" style={{ borderColor: `${accent}55` }}>
      <div className="flex flex-wrap items-center gap-3">
        <span className="size-3 rounded-full" style={{ backgroundColor: accent }} />
        <h3 className="font-display text-2xl font-semibold" style={{ color: accent }}>{characterClass.name}</h3>
        <span className="font-display text-2xl font-semibold">{state.completion}%</span>
        <div className="ml-auto flex gap-2"><Button type="button" variant="ghost" size="sm" onClick={onBack}>Toutes les classes</Button><Button type="button" size="sm" onClick={() => open()}>Ouvrir dans « Par classe »<ArrowRight /></Button></div>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full" style={{ backgroundColor: `${characterClass.accentLight || "#ccc"}45` }}><div className="h-full rounded-full" style={{ width: `${state.completion}%`, backgroundColor: accent }} /></div>
      <p className="mt-2 text-sm text-muted-foreground">{state.completeRanks} rang{state.completeRanks > 1 ? "s" : ""} terminé{state.completeRanks > 1 ? "s" : ""} sur 21 · {plural(state.missingSpells, "sort manquant", "sorts manquants")}</p>
      {!hasColumn && <p className="mt-2 text-xs italic text-muted-foreground">Cette classe n’a pas encore de colonne dans « Sorts de classe » : elle sera ajoutée au premier sort lié.</p>}
      <div className="mt-4"><RankStrip state={state} size="lg" onRank={open} /></div>
    </div>

    {allGood && <p className="flex items-center gap-2 rounded-xl border border-emerald-600/25 bg-emerald-600/5 px-4 py-3 text-sm text-emerald-800 dark:text-emerald-300"><CheckCircle2 className="size-4" />Classe complète : 3 sorts terminés sur chacun des 21 rangs.</p>}

    <div className="grid gap-3 lg:grid-cols-2">
      {state.emptyRanks.length > 0 && <div className="rounded-2xl border bg-card/70 p-4">
        <p className="flex items-center gap-2 text-sm font-semibold"><CircleDashed className="size-4 text-muted-foreground" />Rangs vides <span className="font-normal text-muted-foreground">({state.emptyRanks.length} · {state.emptyRanks.length * MAX_CLASS_SPELLS_PER_RANK} sorts à créer)</span></p>
        <div className="mt-3 flex flex-wrap gap-1.5">{state.ranks.filter((rank) => rank.status === "vide").map((rank) => chip(rank))}</div>
      </div>}
      {partial.length > 0 && <div className="rounded-2xl border bg-card/70 p-4">
        <p className="flex items-center gap-2 text-sm font-semibold"><span className="size-2.5 rounded-sm bg-amber-400" />Rangs incomplets <span className="font-normal text-muted-foreground">({partial.length})</span></p>
        <div className="mt-3 flex flex-wrap gap-1.5">{partial.map((rank) => chip(rank, `${rank.spells.length}/3 · manque ${MAX_CLASS_SPELLS_PER_RANK - rank.spells.length}`))}</div>
      </div>}
      {overfull.length > 0 && <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 lg:col-span-2">
        <p className="flex items-center gap-2 text-sm font-semibold text-destructive"><AlertTriangle className="size-4" />Rangs à plus de 3 sorts</p>
        <ul className="mt-3 space-y-2 text-sm">{overfull.map((rank) => <li key={rank.rank} className="flex flex-wrap items-center gap-2">{chip(rank, `${rank.spells.length}/3`)}<span className="text-muted-foreground">{rank.spells.map((spell) => spell.name).join(" · ")}</span></li>)}</ul>
      </div>}
      {state.unfinishedSpells.length > 0 && <div className="rounded-2xl border bg-card/70 p-4 lg:col-span-2">
        <p className="flex items-center gap-2 text-sm font-semibold"><PencilLine className="size-4 text-amber-700 dark:text-amber-400" />Sorts à terminer <span className="font-normal text-muted-foreground">({state.unfinishedSpells.length})</span></p>
        <ul className="mt-3 divide-y text-sm">{state.unfinishedSpells.map((spell) => {
          const rank = spell.classRanks[characterClass.id]
          return <li key={`${spell.rowNumber}:${spell.id}`} className="flex flex-wrap items-center gap-2 py-2">
            <button type="button" onClick={() => open(rank)} className="font-semibold hover:text-primary hover:underline">{spell.name}</button>
            <span className="text-xs text-muted-foreground">{rankName(rank)} · ligne {spell.rowNumber}</span>
            <span className="ml-auto text-xs text-amber-800 dark:text-amber-300">manque : {classSpellGaps(spell).join(", ")}</span>
          </li>
        })}</ul>
      </div>}
    </div>
  </div>
}
