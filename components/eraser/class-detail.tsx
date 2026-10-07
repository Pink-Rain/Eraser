"use client"

import { IndexRichText } from "@/components/eraser/index-references"
import type { CSSProperties } from "react"
import { CircleDotDashed, Crosshair, Gauge, LibraryBig, Zap } from "lucide-react"

import { ClassImage } from "@/components/eraser/class-image"
import { RichTextView } from "@/components/eraser/rich-text"
import { SpellChargeStars } from "@/components/eraser/spell-charges"
import { Badge } from "@/components/ui/badge"
import type { ClassContent, ClassSpell, EditableClassList } from "@/lib/class-content"
import { RankBonusLine } from "@/components/eraser/rank-bonus"

const categoryDefaults = {
  actif: { background: "#7f1d1d", foreground: "#fff7ed" },
  passif: { background: "#315b55", foreground: "#f0fdfa" },
  bonus: { background: "#795a12", foreground: "#fffbeb" },
}

function spellIcon(spell: ClassSpell) {
  if (spell.category === "bonus") return <Gauge className="size-4" />
  if (spell.category === "passif") return <CircleDotDashed className="size-4" />
  return <Zap className="size-4" />
}

function SpellCard({ spell, rank, accentDark, accentLight }: { spell: ClassSpell; rank: number; accentDark: string; accentLight: string }) {
  const tone = spell.tone.background ? spell.tone : categoryDefaults[spell.category]
  return <article className="relative overflow-hidden rounded-xl border bg-card/80 p-4 shadow-sm" style={{ borderColor: `${accentDark}45` }}>
    <div className="absolute inset-x-0 top-0 h-0.5" style={{ backgroundColor: tone.background }} />
    <div className="flex items-start gap-3"><div className="flex size-9 shrink-0 items-center justify-center rounded-lg" style={{ backgroundColor: tone.background || `${accentLight}35`, color: tone.foreground || accentDark }}>{spellIcon(spell)}</div><div className="min-w-0 flex-1">
      <div className="flex flex-wrap items-center gap-2"><h3 className="font-display text-lg font-semibold leading-tight">{spell.name}</h3><Badge className="text-[10px]" style={{ backgroundColor: tone.background, color: tone.foreground }}>{spell.type || "Type non renseigné"}</Badge></div>
      {(spell.effect || spell.description) && <blockquote className="mt-3 border-l-2 pl-3 text-sm leading-6" style={{ borderColor: tone.background || accentDark }}>{spell.effect && <IndexRichText as="div" html={spell.effectHtml || spell.effect} className="font-medium [&_a]:underline" />}{spell.description && <IndexRichText as="div" html={spell.descriptionHtml || spell.description} className="mt-1 text-muted-foreground [&_a]:underline" />}</blockquote>}
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">{spell.skills.length > 0 && <span className="font-semibold text-[#b3261e]">{spell.skills.join(" · ")}</span>}{spell.distance && <span className="flex items-center gap-1.5"><Crosshair className="size-3.5" />Distance : {spell.distance}</span>}{spell.category === "actif" && <SpellChargeStars total={spell.charges} accent={accentDark} />}</div>
    </div></div><span className="sr-only">Rang {rank}</span>
  </article>
}

function OverviewList({ label, field }: { label: string; field: EditableClassList }) {
  const entries = field.entries.filter((entry) => entry.value)
  if (!entries.length) return null
  return <section className="min-w-0"><p className="text-[11px] font-semibold uppercase tracking-[.18em] text-muted-foreground">{label}</p><div className="mt-2 flex flex-wrap gap-2">{entries.map((entry, index) => <RichTextView key={`${entry.column}:${index}`} html={entry.html} fallback={entry.value} className="rounded-full border bg-background/55 px-3 py-1.5 text-sm" />)}</div></section>
}

/**
 * La page d'une classe dans Règles : sa présentation et ses sorts, rang par rang, en
 * lecture seule pour tout le monde. Une classe se modifie dans le créateur de classe.
 */
export function ClassDetail({ content, imageUrl }: { content: ClassContent; imageUrl: string | null }) {
  const { characterClass, presentation } = content
  const style = { "--class-dark": characterClass.accentDark, "--class-light": characterClass.accentLight } as CSSProperties
  const ranks = [...new Set(content.spells.map((spell) => spell.classRanks[characterClass.id]))].sort((left, right) => left - right)

  return <div className="w-full flex-1 px-5 py-8 sm:px-8 md:py-12" style={style}>
    <article className="overflow-hidden rounded-[1.75rem] border bg-card/90 shadow-[0_18px_55px_rgb(67_50_31/0.1)]" style={{ borderColor: `${characterClass.accentDark}55` }}><div className="grid lg:grid-cols-[minmax(0,.7fr)_minmax(0,1.3fr)]"><div className="relative min-h-72 p-8 lg:min-h-[31rem] lg:p-11" style={{ background: `radial-gradient(circle at 50% 45%, ${characterClass.accentLight}32, transparent 64%)` }}><ClassImage src={imageUrl} alt={`Illustration de la classe ${characterClass.name}`} className="size-full object-contain" fallbackClassName="min-h-72" eager /></div><div className="flex flex-col justify-center p-7 sm:p-10"><p className="text-xs font-semibold uppercase tracking-[.22em]" style={{ color: characterClass.accentDark }}>{characterClass.type}</p><h1 className="font-display mt-3 text-4xl font-semibold tracking-[-.025em] sm:text-5xl">{characterClass.name}</h1>
      {presentation && <div className="mt-7 grid gap-5 sm:grid-cols-2"><OverviewList label="Caractéristiques principales" field={presentation.primaryCharacteristics} /><OverviewList label="Caractéristiques secondaires" field={presentation.secondaryCharacteristics} /></div>}
      {presentation?.specialties.length ? <div className="mt-7 border-t pt-5"><p className="text-[11px] font-semibold uppercase tracking-[.18em] text-muted-foreground">Spécialités</p><div className="mt-3 divide-y">{presentation.specialties.map((specialty) => <div key={specialty.index} className="grid gap-1 py-3 sm:grid-cols-[10rem_1fr]"><RichTextView html={specialty.titleHtml} fallback={specialty.title} className="font-display font-semibold" /><RichTextView html={specialty.textHtml} fallback={specialty.text} className="text-sm leading-6 text-muted-foreground" /></div>)}</div></div> : null}
    </div></div></article>

    <section className="mt-12"><div className="flex flex-wrap items-end justify-between gap-4 border-b pb-4"><div><p className="text-[11px] font-semibold uppercase tracking-[.2em]" style={{ color: characterClass.accentDark }}>Progression</p><h2 className="font-display mt-1 text-3xl font-semibold">Sorts de classe</h2></div></div>
      {ranks.length ? <div className="mt-7 space-y-8">{ranks.map((rank) => { const spells = content.spells.filter((spell) => spell.classRanks[characterClass.id] === rank); return <section key={rank}><div className="mb-3 flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-3"><span className="flex size-9 items-center justify-center rounded-full font-display text-sm font-bold" style={{ backgroundColor: `${characterClass.accentLight}45`, color: characterClass.accentDark }}>{rank === 0 ? "C" : rank}</span><div><h3 className="font-display text-xl font-semibold">{rank === 0 ? "Rang commun" : `Rang ${rank}`}</h3><p className={`text-xs ${spells.length > 3 ? "text-destructive" : "text-muted-foreground"}`}>{rank === 0 ? "Kit de démarrage acquis automatiquement" : "Choisis un sort parmi les trois"} · {spells.length} / 3{spells.length > 3 ? " — dépassement à corriger" : ""}</p></div></div></div>
        <RankBonusLine bonus={content.rankBonuses?.find((bonus) => bonus.rank === rank)} accent={characterClass.accentDark} className="-mt-1 mb-3 pl-12" />
        {spells.length ? <div className="grid gap-3 lg:grid-cols-3">{spells.map((spell) => <SpellCard key={spell.id} spell={spell} rank={rank} accentDark={characterClass.accentDark} accentLight={characterClass.accentLight} />)}</div> : <div className="rounded-xl border border-dashed px-4 py-5 text-center text-sm text-muted-foreground">Aucun sort lié à ce rang.</div>}
      </section> })}</div> : <div className="mt-7 rounded-2xl border border-dashed p-10 text-center text-sm text-muted-foreground"><LibraryBig className="mx-auto mb-3 size-7 opacity-50" />Aucun sort n’est encore renseigné pour cette classe.</div>}
    </section>

    {content.supplements.map((table) => <section key={table.title} className="mt-12"><div className="border-b pb-4"><p className="text-[11px] font-semibold uppercase tracking-[.2em]" style={{ color: characterClass.accentDark }}>Spécificité de classe</p><h2 className="font-display mt-1 text-3xl font-semibold">{table.title}</h2></div><div className="mt-5 grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(100%,16rem),1fr))]">{table.rows.map((row) => <article key={row.rowNumber} className="rounded-2xl border bg-card/75 p-4" style={{ borderColor: `${characterClass.accentDark}45` }}>{table.headers.map((header, index) => row.values[index] ? <div key={`${header}:${index}`} className={index ? "mt-3" : ""}><p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{header}</p><p className={index === 0 ? "font-display text-lg font-semibold" : "mt-1 whitespace-pre-line text-sm leading-6"}>{row.values[index]}</p></div> : null)}</article>)}</div></section>)}

  </div>
}
