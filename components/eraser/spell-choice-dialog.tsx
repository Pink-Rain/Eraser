"use client"

import { useEffect, useState, type CSSProperties } from "react"
import { CircleDotDashed, Crosshair, Gauge, Sparkles, Volume2, VolumeX, Zap } from "lucide-react"

import { SpellChargeStars } from "@/components/eraser/spell-charges"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import type { ClassSpell } from "@/lib/class-content"
import { classSpellCategoryTones } from "@/lib/class-spell-utils"
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
export function NewSpellSlot({ count, accent, detail, onOpen }: { count: number; accent: string; detail: string; onOpen: () => void }) {
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
      <span className="block font-display text-xl font-semibold" style={{ color: accent }}>Nouveau sort{count > 1 ? ` (${count})` : ""}</span>
      <span className="block truncate text-xs text-muted-foreground">{detail} — clique pour découvrir les trois propositions</span>
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
        {(spell.effectHtml || spell.effect) && <span className="block font-medium" dangerouslySetInnerHTML={{ __html: spell.effectHtml || spell.effect }} />}
        {(spell.descriptionHtml || spell.description) && <span className="mt-1.5 block text-[#5c4d3f]" dangerouslySetInnerHTML={{ __html: spell.descriptionHtml || spell.description }} />}
      </span>
      {(spell.skills.length > 0 || spell.distance) && <span className="flex shrink-0 flex-wrap items-center justify-center gap-x-3 gap-y-1 border-t border-[#2b2118]/10 px-3 py-1.5 text-[11px] text-[#5c4d3f]">
        {spell.skills.length > 0 && <span className="font-semibold text-[#b3261e]">{spell.skills.join(" · ")}</span>}
        {spell.distance && <span className="flex items-center gap-1"><Crosshair className="size-3" />{spell.distance}</span>}
      </span>}
    </span>
  </button>
}

/**
 * Les trois sorts proposés à un rang, en grandes cartes. Choisir en garde une ; s'il reste
 * d'autres rangs à choisir, leurs propositions suivent aussitôt.
 */
export function SpellChoiceDialog({ open, onOpenChange, title, subtitle, options, accent, accentLight, choiceKey, remaining, onChoose }: {
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
  onChoose: (spell: ClassSpell) => Promise<void> | void
}) {
  // Le sort retenu, pour ce rang seulement : un nouveau rang (ou une réouverture) repart de zéro.
  const [pickedFor, setPickedFor] = useState<{ key: string; id: string } | null>(null)
  const picked = pickedFor?.key === choiceKey ? pickedFor.id : null
  // La fenêtre n'existe qu'une fois ouverte, côté navigateur : la préférence s'y lit directement.
  const [sound, setSound] = useState(() => typeof window === "undefined" ? true : soundsEnabled())
  useEffect(() => { if (open) playSpellChoiceChime() }, [open, choiceKey])

  function changeOpen(next: boolean) {
    if (!next) setPickedFor(null)
    onOpenChange(next)
  }

  async function pick(spell: ClassSpell) {
    if (picked) return
    setPickedFor({ key: choiceKey, id: spell.id })
    playSpellChosen()
    await new Promise((resolve) => window.setTimeout(resolve, 650))
    await onChoose(spell)
    if (remaining <= 1) changeOpen(false)
  }

  return <Dialog open={open} onOpenChange={changeOpen}>
    <DialogContent showCloseButton={false} className="max-w-[min(64rem,calc(100%-1rem))] border-0 bg-transparent p-0 shadow-none sm:max-w-[min(64rem,calc(100%-1rem))]">
      <div className="relative overflow-hidden rounded-[2rem] px-4 pb-8 pt-7 sm:px-8" style={{ background: `radial-gradient(90% 70% at 50% 10%, ${accent}8c, transparent 70%), #0e0a08` }}>
        <div className="flex items-start justify-between gap-3 text-white">
          <div>
            <DialogTitle className="font-display text-3xl font-semibold drop-shadow">{title}</DialogTitle>
            <DialogDescription className="mt-1 text-sm text-white/70">{subtitle}{remaining > 1 ? ` · encore ${remaining - 1} choix ensuite` : ""}</DialogDescription>
          </div>
          <button type="button" className="rounded-full p-2 text-white/70 hover:bg-white/10 hover:text-white" onClick={() => { const next = !sound; setSound(next); setSoundsEnabled(next) }} aria-label={sound ? "Couper les sons" : "Activer les sons"} title={sound ? "Couper les sons" : "Activer les sons"}>{sound ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />}</button>
        </div>
        {/* Assez de marge pour la carte choisie, qui grandit et monte : elle n'est jamais rognée. */}
        <div key={choiceKey} className="-mx-2 mt-0 flex justify-center gap-5 overflow-x-auto px-8 pb-8 pt-8">
          {options.map((spell, index) => <AugmentCard key={spell.id} spell={spell} accent={accent} accentLight={accentLight} index={index} state={!picked ? "idle" : picked === spell.id ? "picked" : "faded"} onPick={() => void pick(spell)} />)}
        </div>
        <p className="mt-4 text-center text-xs text-white/60">Ton choix reste modifiable plus bas, dans la progression de la classe (« Rechoisir »).</p>
      </div>
    </DialogContent>
  </Dialog>
}
