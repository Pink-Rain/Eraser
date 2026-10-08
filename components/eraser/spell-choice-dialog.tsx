"use client"

import { IndexRichText } from "@/components/eraser/index-references"
import { useEffect, useState, type CSSProperties } from "react"
import { Check, CircleDotDashed, Crosshair, Gauge, LoaderCircle, Minus, Plus, Search, Sparkles, Volume2, VolumeX, WandSparkles, X, Zap } from "lucide-react"

import { SpellChargeStars } from "@/components/eraser/spell-charges"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import type { ClassSpell } from "@/lib/class-content"
import { classSpellCategoryTones } from "@/lib/class-spell-utils"
import { formatRankBonusAmount, isAnyCharacteristicTarget, isMovementTarget, rankBonusPickCount, type RankBonus } from "@/lib/rank-bonuses"
import { playSpellChoiceChime, playSpellChosen, setSoundsEnabled, soundsEnabled } from "@/lib/sounds"

/**
 * La couleur d'un sort : celle de sa case Type dans l'index des sorts (gris pour les
 * actifs, blanc pour les passifs, violet pour les bonus de rang…), comme partout ailleurs
 * dans Eraser. Sans couleur lue, celle de sa catégorie par défaut.
 */
export function spellLook(spell: ClassSpell) {
  const fallback = classSpellCategoryTones[spell.category]
  return {
    label: spell.type || (spell.category === "bonus" ? "Bonus de rang" : spell.category === "passif" ? "Passif" : "Actif"),
    background: spell.tone?.background || fallback.background,
    foreground: spell.tone?.foreground || fallback.foreground,
  }
}

function KindIcon({ category, className, style }: { category: ClassSpell["category"]; className?: string; style?: CSSProperties }) {
  if (category === "bonus") return <Gauge className={className} style={style} />
  if (category === "passif") return <CircleDotDashed className={className} style={style} />
  return <Zap className={className} style={style} />
}

/**
 * L'emplacement « Nouveau sort », tout en haut de l'onglet Sorts : il brille tant qu'un
 * rang attend son choix. Un clic ouvre les trois cartes.
 */
export function NewSpellSlot({ count, accent, detail, title = "Nouveau sort", onOpen }: { count: number; accent: string; detail: string; title?: string; onOpen: () => void }) {
  return <button
    type="button"
    onClick={onOpen}
    className="group relative flex w-full items-center gap-4 overflow-hidden rounded-2xl border px-5 py-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg"
    style={{ borderColor: `${accent}88`, background: `linear-gradient(110deg, ${accent}26, ${accent}0d 55%, transparent)` }}
  >
    <span className="pointer-events-none absolute inset-y-0 -left-1/3 w-1/3 skew-x-[-20deg] bg-white/25 opacity-0 blur-md transition duration-700 group-hover:left-full group-hover:opacity-100" />
    <span className="relative flex size-11 shrink-0 items-center justify-center rounded-xl text-white shadow-md" style={{ backgroundColor: accent, boxShadow: `0 0 18px ${accent}88` }}>
      <Sparkles className="size-5" />
      <span className="absolute -right-1 -top-1 size-3 animate-ping rounded-full bg-rose-400/70" />
      <span className="absolute -right-1 -top-1 size-3 rounded-full bg-rose-400" />
    </span>
    <span className="min-w-0 flex-1">
      <span className="block font-display text-xl font-semibold" style={{ color: accent }}>{title}{count > 1 ? ` (${count})` : ""}</span>
      <span className="block truncate text-xs text-muted-foreground">{detail} — clique pour {title === "Nouveau sort" ? "découvrir les propositions" : "les obtenir"}</span>
    </span>
  </button>
}

/** Une carte de sort à choisir : couleurs de la classe, couleur du sort (celle de l'index), icône du genre en fond. */
function AugmentCard({ spell, accent, accentLight, index, state, onPick }: { spell: ClassSpell; accent: string; accentLight: string; index: number; state: "idle" | "picked" | "faded"; onPick: () => void }) {
  const look = spellLook(spell)
  return <button
    type="button"
    onClick={onPick}
    disabled={state !== "idle"}
    className={`group relative flex h-[27rem] w-[17.5rem] shrink-0 flex-col overflow-hidden rounded-[1.4rem] border-2 p-5 text-left text-white shadow-2xl outline-none transition duration-300 animate-in fade-in-0 slide-in-from-bottom-10 zoom-in-90 fill-mode-both focus-visible:ring-4 ${state === "idle" ? "hover:-translate-y-2 hover:scale-[1.03]" : ""} ${state === "picked" ? "-translate-y-3 scale-[1.06]" : ""} ${state === "faded" ? "scale-95 opacity-30 grayscale" : ""}`}
    style={{
      animationDelay: `${index * 140}ms`,
      animationDuration: "520ms",
      borderColor: look.background,
      background: `radial-gradient(120% 70% at 50% 0%, ${accent}f2 0%, ${accent}b3 38%, #15100c 100%)`,
      boxShadow: state === "picked" ? `0 0 0 3px ${look.background}, 0 0 26px ${look.background}99` : `0 18px 40px -12px #000c, inset 0 0 0 1px ${accentLight}33`,
    }}
  >
    {/* L'icône du genre de sort, en grand, en fond de carte, dans la couleur du sort. */}
    <KindIcon category={spell.category} className="pointer-events-none absolute -bottom-10 -right-10 size-64 opacity-[.14] transition duration-500 group-hover:rotate-6 group-hover:opacity-20" style={{ color: look.background }} />
    <span className="pointer-events-none absolute inset-x-0 top-0 h-1.5" style={{ background: `linear-gradient(90deg, transparent, ${look.background}, transparent)` }} />
    <span className="relative flex items-center justify-between">
      <span className="rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[.18em]" style={{ backgroundColor: look.background, color: look.foreground }}>{look.label}</span>
      {spell.category === "actif" && spell.charges !== null && <SpellChargeStars total={spell.charges} accent={look.background} />}
    </span>
    <span className="relative mx-auto mt-3 flex size-16 shrink-0 items-center justify-center rounded-full border-2" style={{ borderColor: look.background, backgroundColor: look.background, color: look.foreground, boxShadow: `0 0 22px ${look.background}88` }}>
      <KindIcon category={spell.category} className="size-7" />
    </span>
    <span className="relative mt-3 shrink-0 text-center font-display text-xl font-semibold leading-tight drop-shadow">{spell.name}</span>
    {/* Le texte du sort sur papier clair : ses couleurs (liens, mots clés) restent celles de l'index, lisibles. */}
    <span className="relative mt-3 flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl bg-[#f7f0e3] text-left text-[#2b2118] shadow-inner">
      <span className="min-h-0 flex-1 overflow-y-auto px-3 py-2.5 text-[12.5px] leading-[1.45] [&_a]:underline">
        {(spell.effectHtml || spell.effect) && <IndexRichText as="span" html={spell.effectHtml || spell.effect} className="block font-medium" />}
        {(spell.descriptionHtml || spell.description) && <IndexRichText as="span" html={spell.descriptionHtml || spell.description} className="mt-1.5 block text-[#5c4d3f]" />}
      </span>
      {(spell.skills.length > 0 || spell.distance) && <span className="flex shrink-0 flex-wrap items-center justify-center gap-x-3 gap-y-1 border-t border-[#2b2118]/10 px-3 py-1.5 text-[11px] text-[#5c4d3f]">
        {spell.skills.length > 0 && <span className="font-semibold text-[#b3261e]">{spell.skills.join(" · ")}</span>}
        {spell.distance && <span className="flex items-center gap-1"><Crosshair className="size-3" />{spell.distance}</span>}
      </span>}
    </span>
  </button>
}

/** Ce que le joueur a choisi parmi les bonus d'un rang. */
export type RankBonusSelection = {
  /** Les numéros (1 à 4) des bonus gardés. */
  slots: number[]
  /** Pour un bonus « Caractéristique » : sa répartition, par clé de caractéristique. */
  spread: Record<number, Record<string, number>>
  /** Le sort sur mesure choisi. */
  spell: ClassSpell | null
  /** « Déjà ajoutés à la main » : le rang est validé sans rien ajouter à la fiche. */
  manual?: boolean
}

/** Une caractéristique principale entre lesquelles répartir un bonus « Caractéristique ». */
export type SpreadCharacteristic = { key: string; name: string; color?: string }

function emptySelection(bonus: RankBonus | undefined): RankBonusSelection {
  // Sans « Choix », tous les bonus sont gardés d'office.
  return { slots: bonus && !bonus.choose ? bonus.bonuses.map((entry) => entry.slot) : [], spread: {}, spell: null }
}

/** Ce qu'il reste à faire avant d'obtenir les bonus du rang ; vide quand tout est prêt. */
export function rankBonusMissing(bonus: RankBonus | undefined, selection: RankBonusSelection) {
  if (!bonus || selection.manual) return [] as string[]
  const missing: string[] = []
  const wanted = rankBonusPickCount(bonus)
  if (selection.slots.length < wanted) missing.push(wanted - selection.slots.length > 1 ? `choisir ${wanted - selection.slots.length} bonus` : "choisir un bonus")
  for (const entry of bonus.bonuses) {
    if (!selection.slots.includes(entry.slot) || !isAnyCharacteristicTarget(entry.target)) continue
    const total = Math.round(Math.abs(entry.amount))
    const used = Object.values(selection.spread[entry.slot] ?? {}).reduce((sum, value) => sum + value, 0)
    if (used !== total) missing.push(`répartir ${total - used} point${total - used > 1 ? "s" : ""} de caractéristique`)
  }
  if (bonus.customSpell && !selection.spell) missing.push("choisir le sort sur mesure")
  return missing
}

function Stepper({ value, onChange, canAdd, label, color }: { value: number; onChange: (value: number) => void; canAdd: boolean; label: string; color: string }) {
  return <span className="inline-flex items-center gap-0.5">
    <button type="button" disabled={value <= 0} onClick={() => onChange(value - 1)} className="flex size-6 items-center justify-center rounded-md text-muted-foreground transition hover:bg-muted disabled:opacity-30" aria-label={`Retirer un point à ${label}`}><Minus className="size-3" /></button>
    <span className="min-w-6 text-center text-sm font-semibold tabular-nums" style={value ? { color } : undefined}>{value}</span>
    <button type="button" disabled={!canAdd} onClick={() => onChange(value + 1)} className="flex size-6 items-center justify-center rounded-md text-muted-foreground transition hover:bg-muted disabled:opacity-30" aria-label={`Ajouter un point à ${label}`}><Plus className="size-3" /></button>
  </span>
}

/**
 * Les bonus du rang, au-dessus des cartes de sorts : ceux à garder (« Choix »), la
 * répartition d'un bonus « Caractéristique », le sort sur mesure à chercher, et le reste.
 * Dans les couleurs du site : seules les cartes de sorts ont leur style à part.
 */
function RankBonusPicker({ bonus, accent, characteristics, canApply, spellPool, selection, onChange }: {
  bonus: RankBonus
  accent: string
  characteristics: SpreadCharacteristic[]
  canApply: (target: string) => boolean
  spellPool: ClassSpell[]
  selection: RankBonusSelection
  onChange: (next: RankBonusSelection) => void
}) {
  const [query, setQuery] = useState("")
  const wanted = rankBonusPickCount(bonus)
  const choosing = bonus.choose > 0
  const missing = rankBonusMissing(bonus, selection)
  const folded = query.trim().toLocaleLowerCase("fr")
  const results = folded ? spellPool.filter((spell) => [spell.name, spell.type, spell.skillsRaw, spell.effect].join(" ").toLocaleLowerCase("fr").includes(folded)).slice(0, 8) : []

  function toggle(slot: number) {
    if (!choosing) return
    if (selection.slots.includes(slot)) {
      const spread = { ...selection.spread }
      delete spread[slot]
      onChange({ ...selection, slots: selection.slots.filter((item) => item !== slot), spread })
      return
    }
    // Déjà assez de bonus gardés : le plus ancien laisse sa place (un seul choix se comporte en bouton radio).
    const kept = selection.slots.length >= wanted ? selection.slots.slice(1) : selection.slots
    const spread = Object.fromEntries(Object.entries(selection.spread).filter(([key]) => kept.includes(Number(key))))
    onChange({ ...selection, slots: [...kept, slot], spread })
  }

  function spreadPoint(slot: number, key: string, value: number) {
    onChange({ ...selection, spread: { ...selection.spread, [slot]: { ...(selection.spread[slot] ?? {}), [key]: Math.max(0, value) } } })
  }

  const spreading = bonus.bonuses.filter((entry) => selection.slots.includes(entry.slot) && isAnyCharacteristicTarget(entry.target) && Math.round(Math.abs(entry.amount)) > 0)

  return <section className="rounded-2xl border bg-card/80 p-4 text-left shadow-sm" style={{ borderColor: `${accent}55` }}>
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="flex items-center gap-2 font-display text-lg font-semibold"><span className="flex size-7 items-center justify-center rounded-lg text-white" style={{ backgroundColor: accent }}><Sparkles className="size-4" /></span>Bonus du rang {bonus.rank}</p>
      <span className="flex flex-wrap items-center gap-2">
        {selection.manual
          ? <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-0.5 text-[11px] font-semibold text-muted-foreground"><Check className="size-3" />Déjà sur la fiche : rien ne sera ajouté</span>
          : missing.length
            ? <span className="rounded-full border border-border px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground">Reste à {missing.join(", ")}</span>
            : <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-300"><Check className="size-3" />Prêts</span>}
        <button type="button" onClick={() => onChange({ ...selection, manual: !selection.manual })} className="rounded-full px-2 py-0.5 text-[11px] font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline" title="Ces bonus ont déjà été reportés sur la fiche : le rang est validé sans rien y ajouter.">{selection.manual ? "Les ajouter quand même" : "Déjà ajoutés à la main ?"}</button>
      </span>
    </div>
    {!selection.manual && <>
    {bonus.bonuses.length > 0 && <>
      <p className="mt-2 text-xs text-muted-foreground">{choosing ? `Choisis ${wanted} bonus parmi ${bonus.bonuses.length}.` : bonus.bonuses.length > 1 ? "Tu gagnes ces bonus :" : "Tu gagnes ce bonus :"} Ils s’ajoutent au bonus/malus de leur cible.</p>
      <div className={`mt-3 grid gap-2 ${bonus.bonuses.length > 1 ? "sm:grid-cols-2" : ""} ${bonus.bonuses.length > 2 ? "lg:grid-cols-4" : ""}`}>
        {bonus.bonuses.map((entry) => {
          const picked = selection.slots.includes(entry.slot)
          const special = isAnyCharacteristicTarget(entry.target) || isMovementTarget(entry.target)
          const manual = !special && !canApply(entry.target)
          return <button
            key={entry.slot}
            type="button"
            onClick={() => toggle(entry.slot)}
            aria-pressed={picked}
            className={`relative flex min-h-16 items-center gap-3 rounded-xl border border-border px-3 py-2.5 text-left transition ${choosing ? "hover:-translate-y-0.5 hover:shadow-md" : "cursor-default"} ${choosing && !picked ? "opacity-70 hover:opacity-100" : ""}`}
            style={{ borderColor: picked ? accent : undefined, backgroundColor: picked ? `${accent}14` : undefined, boxShadow: picked ? `inset 0 0 0 1px ${accent}` : undefined }}
          >
            <span className="min-w-12 text-center font-display text-2xl font-semibold tabular-nums" style={{ color: entry.amount < 0 ? "#e11d48" : accent }}>{entry.value.trim() ? formatRankBonusAmount(entry.amount) : "—"}</span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold leading-tight">{isAnyCharacteristicTarget(entry.target) ? "Caractéristique" : entry.target}</span>
              <span className="block text-[11px] leading-tight text-muted-foreground">{isAnyCharacteristicTarget(entry.target) ? "à répartir comme tu veux" : isMovementTarget(entry.target) ? "action gratuite" : manual ? "à reporter à la main sur la fiche" : "bonus/malus"}</span>
            </span>
            {choosing && <span className={`flex size-5 shrink-0 items-center justify-center rounded-full border border-border ${picked ? "text-white" : ""}`} style={picked ? { backgroundColor: accent, borderColor: accent } : undefined}>{picked && <Check className="size-3" />}</span>}
          </button>
        })}
      </div>
    </>}
    {spreading.map((entry) => {
      const total = Math.round(Math.abs(entry.amount))
      const spread = selection.spread[entry.slot] ?? {}
      const used = Object.values(spread).reduce((sum, value) => sum + value, 0)
      const left = total - used
      return <div key={entry.slot} className="mt-3 rounded-xl border border-dashed p-3" style={{ borderColor: `${accent}66` }}>
        <p className="flex flex-wrap items-center justify-between gap-2 text-xs"><span className="font-semibold">Répartis {formatRankBonusAmount(entry.amount)} entre tes caractéristiques</span><span className={`rounded-full px-2 py-0.5 font-semibold tabular-nums ${left ? "bg-muted text-muted-foreground" : "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300"}`}>{left ? `Reste ${left}` : "Tout est réparti"}</span></p>
        <div className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-5">
          {characteristics.map((item) => {
            const points = spread[item.key] ?? 0
            return <div key={item.key} className="flex flex-col items-center gap-0.5 rounded-lg border border-border/70 bg-background/50 px-1.5 py-1.5 transition" style={points ? { borderColor: accent, backgroundColor: `${accent}10` } : undefined}>
              <span className="flex max-w-full items-center gap-1.5 text-[11px] font-medium leading-tight" title={item.name}><span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: item.color || accent }} /><span className="truncate">{item.name.replace(/^Capacité (?:de )?/, "Cap ")}</span></span>
              <Stepper value={points} canAdd={left > 0} label={item.name} color={accent} onChange={(value) => spreadPoint(entry.slot, item.key, value)} />
            </div>
          })}
        </div>
      </div>
    })}
    {bonus.customSpell && <div className="mt-3 rounded-xl border border-border/70 p-3">
      <p className="flex items-center gap-1.5 text-xs font-semibold"><WandSparkles className="size-3.5" style={{ color: accent }} />Sort sur mesure</p>
      {selection.spell
        ? <div className="mt-2 flex items-center gap-3 rounded-lg border bg-background/60 px-3 py-2" style={{ borderColor: `${spellLook(selection.spell).background}88` }}>
          <span className="flex size-7 shrink-0 items-center justify-center rounded-md" style={{ backgroundColor: spellLook(selection.spell).background, color: spellLook(selection.spell).foreground }}><KindIcon category={selection.spell.category} className="size-3.5" /></span>
          <span className="min-w-0 flex-1"><b className="block truncate text-sm">{selection.spell.name}</b><span className="block truncate text-[11px] text-muted-foreground">{spellLook(selection.spell).label}{selection.spell.skills.length ? ` · ${selection.spell.skills.join(" · ")}` : ""}</span></span>
          <button type="button" onClick={() => onChange({ ...selection, spell: null })} className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Choisir un autre sort"><X className="size-4" /></button>
        </div>
        : <>
          <div className="relative mt-2"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Chercher un sort : nom, type, compétence…" className="pl-9" /></div>
          {folded && <div className="mt-2 grid max-h-56 gap-1.5 overflow-y-auto sm:grid-cols-2">
            {results.map((spell) => <button key={spell.id} type="button" onClick={() => { onChange({ ...selection, spell }); setQuery("") }} className="flex items-center gap-2.5 rounded-lg border border-border/70 bg-background/60 px-2.5 py-2 text-left transition hover:border-primary/50 hover:bg-muted/40">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-md" style={{ backgroundColor: spellLook(spell).background, color: spellLook(spell).foreground }}><KindIcon category={spell.category} className="size-3.5" /></span>
              <span className="min-w-0 flex-1"><b className="block truncate text-sm">{spell.name}</b><span className="block truncate text-[11px] text-muted-foreground">{spellLook(spell).label}{spell.skills.length ? ` · ${spell.skills.join(" · ")}` : ""}</span></span>
            </button>)}
            {!results.length && <p className="py-3 text-center text-xs text-muted-foreground sm:col-span-2">Aucun sort ne correspond.</p>}
          </div>}
        </>}
    </div>}
    </>}
    {(bonus.other || bonus.entries.length > 0) && <div className="mt-3 space-y-1 rounded-xl bg-muted/40 px-3 py-2 text-sm">
      {bonus.other && <p><span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Autre · </span>{bonus.other}</p>}
      {bonus.entries.map((entry, index) => <p key={`${entry.label}:${index}`}><span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{entry.label} · </span>{entry.value}</p>)}
    </div>}
  </section>
}

/**
 * Le passage de rang : les bonus du rang (s'il en a), puis les trois sorts proposés, en
 * grandes cartes. Choisir un sort garde aussi les bonus ; un rang sans sort à choisir
 * n'a que ses bonus, obtenus d'un bouton. S'il reste d'autres rangs, ils suivent aussitôt.
 */
export function SpellChoiceDialog({ open, onOpenChange, title, subtitle, options, accent, accentLight, choiceKey, remaining, bonus, characteristics = [], canApply = () => true, spellPool = [], onChoose, onLater }: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  subtitle: string
  options: ClassSpell[]
  accent: string
  accentLight: string
  /** Change à chaque nouveau rang à choisir : rejoue l'entrée des cartes et le carillon. */
  choiceKey: string
  remaining: number
  /** Les bonus du rang, à obtenir avec le sort (ou seuls). */
  bonus?: RankBonus
  /** Les caractéristiques principales, pour un bonus « Caractéristique ». */
  characteristics?: SpreadCharacteristic[]
  /** La fiche sait-elle écrire cette cible ? Sinon, le bonus est à reporter à la main. */
  canApply?: (target: string) => boolean
  /** Les sorts parmi lesquels chercher le sort sur mesure. */
  spellPool?: ClassSpell[]
  onChoose: (spell: ClassSpell | null, selection: RankBonusSelection | null) => Promise<void> | void
  /** « Choisir plus tard » : la fenêtre se ferme, l'emplacement « Nouveau sort » reste dans l'onglet Sorts. */
  onLater?: () => void
}) {
  // Le sort retenu, pour ce rang seulement : un nouveau rang (ou une réouverture) repart de zéro.
  const [pickedFor, setPickedFor] = useState<{ key: string; id: string } | null>(null)
  const picked = pickedFor?.key === choiceKey ? pickedFor.id : null
  // Les bonus choisis, pour ce rang seulement.
  const [selectionFor, setSelectionFor] = useState<{ key: string; selection: RankBonusSelection } | null>(null)
  const selection = selectionFor?.key === choiceKey ? selectionFor.selection : emptySelection(bonus)
  const missing = rankBonusMissing(bonus, selection)
  const ready = missing.length === 0
  const [nudge, setNudge] = useState(0)
  // La fenêtre n'existe qu'une fois ouverte, côté navigateur : la préférence s'y lit directement.
  const [sound, setSound] = useState(() => typeof window === "undefined" ? true : soundsEnabled())
  useEffect(() => { if (open) playSpellChoiceChime() }, [open, choiceKey])

  function changeOpen(next: boolean) {
    if (!next) { setPickedFor(null); setSelectionFor(null) }
    onOpenChange(next)
  }

  async function pick(spell: ClassSpell | null) {
    if (picked) return
    // Les bonus d'abord : la carte ne part pas tant qu'il reste à choisir au-dessus.
    if (!ready) { setNudge((current) => current + 1); return }
    setPickedFor({ key: choiceKey, id: spell?.id ?? "bonus" })
    playSpellChosen()
    if (spell) await new Promise((resolve) => window.setTimeout(resolve, 650))
    try {
      await onChoose(spell, bonus ? selection : null)
    } finally {
      // Le même rang peut revenir (la fiche a changé ailleurs, rien n'a été gardé) : ses cartes
      // redeviennent cliquables au lieu de rester figées.
      setPickedFor(null)
    }
    setSelectionFor(null)
    if (remaining <= 1) changeOpen(false)
  }

  const bonusOnly = !options.length

  return <Dialog open={open} onOpenChange={changeOpen}>
    <DialogContent showCloseButton={false} className="max-h-[94svh] max-w-[min(64rem,calc(100%-1rem))] overflow-y-auto rounded-[1.75rem] p-0 sm:max-w-[min(64rem,calc(100%-1rem))]">
      <div className="relative px-4 pb-7 pt-6 sm:px-8">
        <div className="flex items-start justify-between gap-3">
          <div>
            <DialogTitle className="font-display text-3xl font-semibold">{title}</DialogTitle>
            <DialogDescription className="mt-1 text-sm text-muted-foreground"><span className="font-medium" style={{ color: accent }}>{subtitle}</span>{remaining > 1 ? ` · encore ${remaining - 1} choix ensuite` : ""}</DialogDescription>
          </div>
          <button type="button" className="rounded-full p-2 text-muted-foreground hover:bg-muted hover:text-foreground" onClick={() => { const next = !sound; setSound(next); setSoundsEnabled(next) }} aria-label={sound ? "Couper les sons" : "Activer les sons"} title={sound ? "Couper les sons" : "Activer les sons"}>{sound ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />}</button>
        </div>
        {bonus && <div key={`${choiceKey}:${nudge}`} className={`mt-5 ${nudge ? "animate-in fade-in-0 zoom-in-95 duration-300" : ""}`}>
          <RankBonusPicker bonus={bonus} accent={accent} characteristics={characteristics} canApply={canApply} spellPool={spellPool} selection={selection} onChange={(next) => setSelectionFor({ key: choiceKey, selection: next })} />
        </div>}
        {!bonusOnly && <>
          {bonus && <p className={`mt-5 text-center text-xs ${ready ? "text-muted-foreground" : "font-medium"}`} style={ready ? undefined : { color: accent }}>{ready ? "Choisis maintenant ton sort : tes bonus de rang seront ajoutés avec lui." : "Termine d’abord tes bonus de rang, puis choisis ton sort."}</p>}
          {/* Assez de marge pour la carte choisie, qui grandit et monte : elle n'est jamais rognée. */}
          <div key={choiceKey} className={`-mx-2 mt-0 flex justify-center gap-5 overflow-x-auto px-8 pb-8 pt-8 transition ${ready ? "" : "opacity-55 saturate-50"}`}>
            {options.map((spell, index) => <AugmentCard key={spell.id} spell={spell} accent={accent} accentLight={accentLight} index={index} state={!picked ? "idle" : picked === spell.id ? "picked" : "faded"} onPick={() => void pick(spell)} />)}
          </div>
        </>}
        <div className={`flex flex-col items-center gap-3 ${bonusOnly ? "mt-6" : "mt-1"}`}>
          {bonusOnly && <Button type="button" size="lg" disabled={Boolean(picked) || !ready} onClick={() => void pick(null)} style={ready ? { backgroundColor: accent, color: "#fff" } : undefined} variant={ready ? "default" : "outline"}>{picked ? <LoaderCircle className="animate-spin" /> : ready ? <Check /> : null}{ready ? "Obtenir les bonus" : "Termine tes bonus pour les obtenir"}</Button>}
          {onLater && <Button type="button" variant="outline" size="sm" className="rounded-full" onClick={() => { setPickedFor(null); setSelectionFor(null); onLater() }} disabled={Boolean(picked)}>Choisir plus tard</Button>}
          <p className="text-center text-xs text-muted-foreground">{onLater ? "Le choix t’attend dans l’onglet Sorts. " : ""}{bonusOnly ? "Les bonus s’ajoutent au bonus/malus de leur cible sur la fiche." : "Pour changer de sort plus tard, retire-le de tes capacités : son rang te reproposera ses sorts."}</p>
        </div>
      </div>
    </DialogContent>
  </Dialog>
}
