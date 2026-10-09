"use client"

import { useState } from "react"
import { Check, Eye, EyeOff, VenetianMask } from "lucide-react"

import { SuggestInput } from "@/components/eraser/suggest-input"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { classDisplayModes, NO_CLASS, type ClassDisplay, type ClassDisplayMode } from "@/lib/class-visibility"

const icons: Record<ClassDisplayMode, typeof Eye> = { visible: Eye, hidden: EyeOff, as: VenetianMask }

/**
 * À côté de la classe, sur la fiche : ce que les autres joueurs en voient. Visible, cachée
 * (« Aucune classe ») ou affichée comme une autre classe. Le propriétaire et le MJ voient
 * toujours la vraie classe sur la fiche.
 */
export function ClassDisplayButton({ value, suggestions, onChange }: { value: ClassDisplay; suggestions: string[]; onChange: (display: ClassDisplay) => void }) {
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<ClassDisplayMode>(value.mode)
  const [shownAs, setShownAs] = useState(value.as)
  const Icon = icons[value.mode]
  const label = value.mode === "hidden" ? "Cachée" : value.mode === "as" ? `Vue : ${value.as}` : "Visible"

  function apply(next: ClassDisplayMode, as = shownAs) {
    setMode(next)
    // « Affichée comme… » attend un nom avant d'être enregistrée.
    if (next === "as" && !as.trim()) return
    onChange({ mode: next, as: as.trim() })
    if (next !== "as") setOpen(false)
  }

  return <Popover open={open} onOpenChange={(next) => { setOpen(next); if (next) { setMode(value.mode); setShownAs(value.as) } }}>
    <PopoverTrigger asChild>
      <button type="button" className={`inline-flex max-w-[12rem] items-center gap-1 rounded-full border px-1.5 py-0.5 text-[9px] font-semibold normal-case tracking-normal transition hover:border-primary/50 hover:text-foreground ${value.mode === "visible" ? "border-transparent text-muted-foreground" : "border-primary/40 bg-primary/10 text-primary"}`} title="La classe affichée hors de la fiche" aria-label={`Classe hors de la fiche : ${label}`}>
        <Icon className="size-3 shrink-0" /><span className="truncate">{label}</span>
      </button>
    </PopoverTrigger>
    <PopoverContent align="start" className="w-80 space-y-2 p-3">
      <p className="text-xs font-semibold">La classe hors de la fiche</p>
      <div className="grid gap-1" role="radiogroup" aria-label="Classe hors de la fiche">
        {classDisplayModes.map((option) => {
          const OptionIcon = icons[option.value]
          return <button key={option.value} type="button" role="radio" aria-checked={mode === option.value} onClick={() => apply(option.value)} className={`flex items-start gap-2 rounded-lg border px-2.5 py-1.5 text-left transition ${mode === option.value ? "border-primary/60 bg-primary/10" : "border-border/60 hover:border-primary/35"}`}>
            <OptionIcon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
            <span className="min-w-0"><span className="flex items-center gap-1 text-sm font-medium">{option.label}{mode === option.value && <Check className="size-3 text-primary" />}</span><span className="block text-[11px] text-muted-foreground">{option.hint}</span></span>
          </button>
        })}
      </div>
      {mode === "as" && <form className="flex items-center gap-1.5" onSubmit={(event) => { event.preventDefault(); event.stopPropagation(); apply("as", shownAs) }}>
        <SuggestInput className="flex-1" value={shownAs} onChange={setShownAs} groups={[{ label: "Classes", items: suggestions }]} placeholder="Rôdeur, Guerrier…" aria-label="Classe affichée hors de la fiche" />
        <Button type="submit" size="sm" disabled={!shownAs.trim()}>Valider</Button>
      </form>}
      <p className="text-[11px] leading-4 text-muted-foreground">Seule la fiche montre la vraie classe. Partout ailleurs (campagne, profil, accueil, table de jeu, textes qui citent ce personnage), tout le monde voit {value.mode === "hidden" ? `« ${NO_CLASS} »` : value.mode === "as" ? `« ${value.as} »` : "la vraie classe"}, toi et le MJ compris : personne ne se trompe à voix haute.</p>
    </PopoverContent>
  </Popover>
}
