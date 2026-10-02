"use client"

import { memo, useState, type ComponentType, type ReactNode } from "react"
import {
  Anchor, Apple, Atom, Award, Axe, Baby, Banana, Bandage, Banknote, Battery, BatteryFull, Bean, Beef, Beer, Bell, Biohazard, Bird, Bomb, Bone, BookOpen, Brain, Bug, Candy, Carrot, Castle, Cat, Cherry, Church, Circle, Clock, Cloud, CloudLightning, Clover, Coins, Compass, Cookie, Cross, Crosshair, Crown, Diamond, Dices, Dna, Dog, Droplet, Droplets, Drumstick, Egg, Eye, EyeOff, Feather, Fingerprint, Fish, Flag, FlaskConical, Flame, Flower, Flower2, Footprints, Frown, Gavel, Gem, Ghost, Gift, Glasses, Grape, Hammer, Hand, HandHeart, Heart, HeartCrack, HeartPulse, Hexagon, Hourglass, Key, Landmark, Laugh, Leaf, Lock, Map as MapIcon, Medal, Minus, Moon, Mountain, MountainSnow, Music, Octagon, Orbit, PawPrint, Pentagon, Pickaxe, PiggyBank, Pill, Plus, Rabbit, Radiation, Rainbow, Rat, Rocket, Scale, Scroll, Shell, Shield, ShieldHalf, Ship, Shovel, Skull, Smile, Snail, Snowflake, Sparkle, Sparkles, Sprout, Square, Squirrel, Star, StarHalf, Sun, Sunrise, Sunset, Sword, Swords, Syringe, Target, Tent, Tornado, TreePine, Trees, Triangle, Trophy, Turtle, Umbrella, User, Users, WandSparkles, Waves, Wheat, Wind, Wine, Worm, Wrench, X, Zap,
  type LucideProps,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { foldName, gaugeScaleOf, type GaugeSettings } from "@/lib/index-columns"

type IconEntry = { name: string; label: string; Icon: ComponentType<LucideProps>; keywords?: string }

/**
 * Les icônes proposées pour les jauges et les boutons, avec leur nom français pour la
 * recherche. On peut aussi mettre un émoji ou n'importe quel caractère à la place.
 */
export const indexIcons: IconEntry[] = [
  { name: "sparkle", label: "Étincelle", Icon: Sparkle, keywords: "charge magie" },
  { name: "sparkles", label: "Étincelles", Icon: Sparkles },
  { name: "star", label: "Étoile", Icon: Star, keywords: "note" },
  { name: "star-half", label: "Demi-étoile", Icon: StarHalf },
  { name: "heart", label: "Cœur", Icon: Heart, keywords: "coeur vie pv" },
  { name: "heart-crack", label: "Cœur brisé", Icon: HeartCrack, keywords: "coeur" },
  { name: "heart-pulse", label: "Pouls", Icon: HeartPulse, keywords: "vie santé" },
  { name: "flag", label: "Drapeau", Icon: Flag },
  { name: "skull", label: "Tête de mort", Icon: Skull, keywords: "mort crane danger" },
  { name: "cross", label: "Croix", Icon: Cross, keywords: "église soin" },
  { name: "x", label: "Croix (×)", Icon: X, keywords: "échec" },
  { name: "sprout", label: "Pousse", Icon: Sprout, keywords: "graine plante" },
  { name: "bean", label: "Graine", Icon: Bean, keywords: "haricot semence" },
  { name: "wheat", label: "Blé", Icon: Wheat, keywords: "récolte graine" },
  { name: "leaf", label: "Feuille", Icon: Leaf },
  { name: "clover", label: "Trèfle", Icon: Clover, keywords: "chance" },
  { name: "flower", label: "Fleur", Icon: Flower },
  { name: "flower-2", label: "Fleur (2)", Icon: Flower2 },
  { name: "tree", label: "Sapin", Icon: TreePine, keywords: "arbre forêt" },
  { name: "trees", label: "Forêt", Icon: Trees, keywords: "arbres" },
  { name: "droplet", label: "Goutte", Icon: Droplet, keywords: "eau sang mana" },
  { name: "droplets", label: "Gouttes", Icon: Droplets },
  { name: "flame", label: "Flamme", Icon: Flame, keywords: "feu" },
  { name: "zap", label: "Éclair", Icon: Zap, keywords: "énergie" },
  { name: "snowflake", label: "Flocon", Icon: Snowflake, keywords: "froid glace" },
  { name: "sun", label: "Soleil", Icon: Sun },
  { name: "moon", label: "Lune", Icon: Moon, keywords: "nuit" },
  { name: "cloud", label: "Nuage", Icon: Cloud },
  { name: "storm", label: "Orage", Icon: CloudLightning },
  { name: "wind", label: "Vent", Icon: Wind },
  { name: "tornado", label: "Tornade", Icon: Tornado },
  { name: "waves", label: "Vagues", Icon: Waves, keywords: "mer eau" },
  { name: "rainbow", label: "Arc-en-ciel", Icon: Rainbow },
  { name: "sunrise", label: "Aube", Icon: Sunrise },
  { name: "sunset", label: "Crépuscule", Icon: Sunset },
  { name: "mountain", label: "Montagne", Icon: Mountain },
  { name: "mountain-snow", label: "Pic enneigé", Icon: MountainSnow },
  { name: "shield", label: "Bouclier", Icon: Shield, keywords: "armure défense" },
  { name: "shield-half", label: "Demi-bouclier", Icon: ShieldHalf },
  { name: "sword", label: "Épée", Icon: Sword, keywords: "arme attaque" },
  { name: "swords", label: "Épées croisées", Icon: Swords, keywords: "combat" },
  { name: "axe", label: "Hache", Icon: Axe },
  { name: "hammer", label: "Marteau", Icon: Hammer },
  { name: "pickaxe", label: "Pioche", Icon: Pickaxe },
  { name: "shovel", label: "Pelle", Icon: Shovel },
  { name: "wrench", label: "Clé à molette", Icon: Wrench },
  { name: "bomb", label: "Bombe", Icon: Bomb },
  { name: "target", label: "Cible", Icon: Target },
  { name: "crosshair", label: "Viseur", Icon: Crosshair },
  { name: "wand", label: "Baguette", Icon: WandSparkles, keywords: "magie sort" },
  { name: "potion", label: "Potion", Icon: FlaskConical, keywords: "fiole alchimie" },
  { name: "pill", label: "Pilule", Icon: Pill },
  { name: "syringe", label: "Seringue", Icon: Syringe },
  { name: "bandage", label: "Bandage", Icon: Bandage, keywords: "soin" },
  { name: "biohazard", label: "Danger biologique", Icon: Biohazard, keywords: "poison maladie" },
  { name: "radiation", label: "Radiation", Icon: Radiation },
  { name: "crown", label: "Couronne", Icon: Crown, keywords: "roi noblesse" },
  { name: "gem", label: "Gemme", Icon: Gem, keywords: "joyau" },
  { name: "diamond", label: "Losange", Icon: Diamond },
  { name: "coins", label: "Pièces", Icon: Coins, keywords: "argent or" },
  { name: "banknote", label: "Billet", Icon: Banknote },
  { name: "piggy-bank", label: "Tirelire", Icon: PiggyBank },
  { name: "trophy", label: "Trophée", Icon: Trophy },
  { name: "medal", label: "Médaille", Icon: Medal },
  { name: "award", label: "Récompense", Icon: Award },
  { name: "gift", label: "Cadeau", Icon: Gift },
  { name: "key", label: "Clé", Icon: Key },
  { name: "lock", label: "Cadenas", Icon: Lock },
  { name: "scroll", label: "Parchemin", Icon: Scroll },
  { name: "book", label: "Livre", Icon: BookOpen },
  { name: "map", label: "Carte", Icon: MapIcon },
  { name: "compass", label: "Boussole", Icon: Compass },
  { name: "anchor", label: "Ancre", Icon: Anchor },
  { name: "ship", label: "Navire", Icon: Ship },
  { name: "rocket", label: "Fusée", Icon: Rocket },
  { name: "tent", label: "Tente", Icon: Tent, keywords: "camp repos" },
  { name: "castle", label: "Château", Icon: Castle },
  { name: "church", label: "Temple", Icon: Church, keywords: "église religion" },
  { name: "landmark", label: "Monument", Icon: Landmark },
  { name: "scale", label: "Balance", Icon: Scale, keywords: "justice" },
  { name: "gavel", label: "Marteau de juge", Icon: Gavel },
  { name: "bell", label: "Cloche", Icon: Bell },
  { name: "clock", label: "Horloge", Icon: Clock, keywords: "temps tour" },
  { name: "hourglass", label: "Sablier", Icon: Hourglass, keywords: "temps durée" },
  { name: "music", label: "Note de musique", Icon: Music },
  { name: "dice", label: "Dés", Icon: Dices, keywords: "hasard jet" },
  { name: "eye", label: "Œil", Icon: Eye, keywords: "oeil perception" },
  { name: "eye-off", label: "Œil barré", Icon: EyeOff, keywords: "caché invisible" },
  { name: "glasses", label: "Lunettes", Icon: Glasses },
  { name: "brain", label: "Cerveau", Icon: Brain, keywords: "esprit folie intelligence" },
  { name: "ghost", label: "Fantôme", Icon: Ghost, keywords: "esprit mort-vivant" },
  { name: "bone", label: "Os", Icon: Bone },
  { name: "footprints", label: "Empreintes", Icon: Footprints, keywords: "pas déplacement" },
  { name: "paw", label: "Patte", Icon: PawPrint, keywords: "animal bête" },
  { name: "hand", label: "Main", Icon: Hand },
  { name: "hand-heart", label: "Main et cœur", Icon: HandHeart, keywords: "soin aide" },
  { name: "fingerprint", label: "Empreinte", Icon: Fingerprint },
  { name: "feather", label: "Plume", Icon: Feather },
  { name: "bird", label: "Oiseau", Icon: Bird },
  { name: "fish", label: "Poisson", Icon: Fish },
  { name: "shell", label: "Coquillage", Icon: Shell },
  { name: "bug", label: "Insecte", Icon: Bug },
  { name: "worm", label: "Ver", Icon: Worm },
  { name: "snail", label: "Escargot", Icon: Snail },
  { name: "rat", label: "Rat", Icon: Rat },
  { name: "rabbit", label: "Lapin", Icon: Rabbit },
  { name: "squirrel", label: "Écureuil", Icon: Squirrel },
  { name: "turtle", label: "Tortue", Icon: Turtle },
  { name: "cat", label: "Chat", Icon: Cat },
  { name: "dog", label: "Chien", Icon: Dog },
  { name: "egg", label: "Œuf", Icon: Egg, keywords: "oeuf" },
  { name: "apple", label: "Pomme", Icon: Apple, keywords: "nourriture ration" },
  { name: "carrot", label: "Carotte", Icon: Carrot },
  { name: "cherry", label: "Cerise", Icon: Cherry },
  { name: "grape", label: "Raisin", Icon: Grape },
  { name: "banana", label: "Banane", Icon: Banana },
  { name: "beef", label: "Viande", Icon: Beef },
  { name: "drumstick", label: "Cuisse", Icon: Drumstick },
  { name: "cookie", label: "Biscuit", Icon: Cookie },
  { name: "candy", label: "Bonbon", Icon: Candy },
  { name: "beer", label: "Bière", Icon: Beer, keywords: "taverne" },
  { name: "wine", label: "Vin", Icon: Wine },
  { name: "umbrella", label: "Parapluie", Icon: Umbrella },
  { name: "user", label: "Personne", Icon: User },
  { name: "users", label: "Groupe", Icon: Users },
  { name: "baby", label: "Enfant", Icon: Baby },
  { name: "smile", label: "Sourire", Icon: Smile, keywords: "moral humeur" },
  { name: "laugh", label: "Rire", Icon: Laugh },
  { name: "frown", label: "Tristesse", Icon: Frown },
  { name: "atom", label: "Atome", Icon: Atom },
  { name: "dna", label: "ADN", Icon: Dna },
  { name: "orbit", label: "Orbite", Icon: Orbit },
  { name: "battery", label: "Batterie", Icon: Battery },
  { name: "battery-full", label: "Batterie pleine", Icon: BatteryFull, keywords: "énergie" },
  { name: "circle", label: "Rond", Icon: Circle },
  { name: "square", label: "Carré", Icon: Square },
  { name: "triangle", label: "Triangle", Icon: Triangle },
  { name: "pentagon", label: "Pentagone", Icon: Pentagon },
  { name: "hexagon", label: "Hexagone", Icon: Hexagon },
  { name: "octagon", label: "Octogone", Icon: Octagon },
]

const iconByName = new Map(indexIcons.map((entry) => [entry.name, entry]))

export function indexIcon(name: string | undefined) {
  return iconByName.get(name ?? "") ?? iconByName.get("sparkle")!
}

/** Une icône d'index : une icône de la liste, ou un émoji / caractère tel quel. */
export function IndexIconGlyph({ icon, emoji, className = "size-4", filled = true }: { icon?: string; emoji?: string; className?: string; filled?: boolean }) {
  if (emoji?.trim()) return <span aria-hidden="true" className={`inline-flex items-center justify-center leading-none ${className}`} style={{ fontSize: "0.95em", filter: filled ? undefined : "grayscale(1)" }}>{emoji.trim()}</span>
  const { Icon } = indexIcon(icon)
  return <Icon aria-hidden="true" className={className} fill={filled ? "currentColor" : "none"} strokeWidth={filled ? 1.5 : 1.8} />
}

/** Choisir une icône (avec recherche) ou taper un émoji. */
export function IconPicker({ icon, emoji, onChange, disabled = false, allowNone = false }: { icon?: string; emoji?: string; onChange: (value: { icon?: string; emoji?: string }) => void; disabled?: boolean; allowNone?: boolean }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const folded = foldName(query)
  const shown = indexIcons.filter((entry) => !folded || foldName(`${entry.label} ${entry.name} ${entry.keywords ?? ""}`).includes(folded))
  return <Popover open={open} onOpenChange={setOpen}>
    <PopoverTrigger asChild>
      <Button type="button" variant="outline" size="sm" disabled={disabled} className="justify-start gap-2">
        {icon || emoji ? <IndexIconGlyph icon={icon} emoji={emoji} /> : <span className="text-muted-foreground">—</span>}
        <span className="truncate text-xs">{emoji?.trim() ? `Émoji ${emoji.trim()}` : icon ? indexIcon(icon).label : "Aucune icône"}</span>
      </Button>
    </PopoverTrigger>
    {open && <PopoverContent align="start" className="w-80 p-2">
      <Input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Chercher : cœur, tête de mort, graine…" className="mb-2 h-8 text-xs" />
      <div className="grid max-h-60 grid-cols-8 gap-1 overflow-y-auto">
        {allowNone && <button type="button" onClick={() => { onChange({}); setOpen(false) }} className="grid size-8 place-items-center rounded-md text-xs text-muted-foreground hover:bg-muted" title="Aucune icône">—</button>}
        {shown.map((entry) => <button key={entry.name} type="button" title={entry.label} aria-label={entry.label} onClick={() => { onChange({ icon: entry.name }); setOpen(false) }} className={`grid size-8 place-items-center rounded-md hover:bg-muted ${entry.name === icon && !emoji ? "bg-primary/15 text-primary" : ""}`}><entry.Icon className="size-4" /></button>)}
      </div>
      {!shown.length && <p className="py-3 text-center text-xs text-muted-foreground">Aucune icône de ce nom. Tape plutôt un émoji ci-dessous.</p>}
      <label className="mt-2 grid gap-1 border-t pt-2 text-[11px] font-semibold text-muted-foreground">Ou un émoji / caractère
        <Input value={emoji ?? ""} maxLength={4} onChange={(event) => onChange({ icon, emoji: event.target.value || undefined })} placeholder="🌱 💧 ☠️ ✚ …" className="h-8 text-sm" />
      </label>
    </PopoverContent>}
  </Popover>
}

function parseCount(value: string) {
  const parsed = Number.parseFloat(value.replace(",", ".").replace(/[^0-9.-]/g, ""))
  return Number.isFinite(parsed) ? parsed : null
}

/** Rouge quand c'est bas, ambre au milieu, vert quand c'est plein. */
export function levelColor(ratio: number) {
  if (ratio <= 0.25) return "#b3261e"
  if (ratio <= 0.5) return "#c2410c"
  if (ratio <= 0.75) return "#b7791f"
  return "#4d7c0f"
}

/**
 * Une jauge. Trois échelles, réglées sur la colonne :
 * - « column » : le même maximum pour toute la colonne, la case dit combien est rempli ;
 * - « cell » : chaque case a sa propre jauge, le nombre tapé est le nombre d'icônes
 *   (les charges d'un sort : « 3 » donne trois étincelles) ;
 * - « from-column » : le maximum est lu dans une autre colonne de la ligne (`maxValue`).
 */
export const GaugeCell = memo(function GaugeCell({ label, value, settings, maxValue, disabled = false, onChange }: {
  label: string
  value: string
  settings: GaugeSettings
  /** Échelle « from-column » : le maximum de cette ligne. */
  maxValue?: number | null
  disabled?: boolean
  onChange: (value: string) => void
}) {
  const [local, setLocal] = useState<{ source: string; value: string } | null>(null)
  const shown = local && local.source === value ? local.value : value
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState("")
  const scale = gaugeScaleOf(settings)
  const text = shown.trim()
  const number = parseCount(text)
  const columnMax = Math.max(1, Math.trunc(settings.max || 5))
  const max = scale === "from-column" ? Math.max(0, Math.round(maxValue ?? 0)) : scale === "cell" ? Math.max(0, Math.round(number ?? 0)) : columnMax
  const current = scale === "cell" ? max : number === null ? null : Math.max(0, Math.min(max, number))
  const ratio = max > 0 && current !== null ? current / max : 0
  const color = settings.levels && scale !== "cell" ? levelColor(ratio) : settings.color || "var(--primary)"
  const set = (next: number | string | null) => {
    const textValue = next === null ? "" : String(next)
    setLocal({ source: value, value: textValue })
    onChange(textValue)
  }
  const special = settings.unlimited && text === settings.unlimited
  const iconCap = 20

  // Saisie directe, pour toutes les jauges : un clic sur le nombre ou le crayon.
  const editor = <Popover open={open} onOpenChange={(next) => { setOpen(next); if (next) setDraft(text) }}>
    <PopoverTrigger asChild>
      <button type="button" disabled={disabled} className="shrink-0 rounded px-1 text-[11px] tabular-nums text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-60" title="Taper une valeur" aria-label={`${label} : taper une valeur`}>
        {scale === "cell" ? (special ? settings.unlimited : text || "—") : `${current ?? "—"}/${max || "?"}`}
      </button>
    </PopoverTrigger>
    {open && <PopoverContent align="start" className="w-auto p-2">
      <p className="mb-1.5 px-1 text-[11px] font-semibold text-muted-foreground">{label}{scale === "cell" ? " (taille de la jauge)" : scale === "from-column" ? ` (sur ${max})` : ` (sur ${max})`}</p>
      {scale === "cell" && <div className="mb-2 flex flex-wrap gap-1">
        {Array.from({ length: Math.min(columnMax, iconCap) + 1 }, (_, index) => <Button key={index} type="button" size="sm" variant={index === number && !special ? "default" : "outline"} className="min-w-8 tabular-nums" onClick={() => { set(index); setOpen(false) }}>{index}</Button>)}
        {settings.unlimited && <Button type="button" size="sm" variant={special ? "default" : "outline"} title="Sans limite" onClick={() => { set(settings.unlimited!); setOpen(false) }}>{settings.unlimited}</Button>}
      </div>}
      <form className="flex gap-1" onSubmit={(event) => { event.preventDefault(); const parsed = parseCount(draft); set(draft.trim() === "" ? null : parsed === null ? draft.trim() : parsed); setOpen(false) }}>
        <Input autoFocus value={draft} onChange={(event) => setDraft(event.target.value)} inputMode="decimal" className="h-8 w-24 text-sm" aria-label={`${label} : valeur`} />
        <Button type="submit" size="sm">OK</Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => { set(null); setOpen(false) }}>Vider</Button>
      </form>
    </PopoverContent>}
  </Popover>

  if (scale === "cell") {
    return <span className="flex min-h-8 items-center gap-0.5 px-1.5" style={{ color }} role="group" aria-label={`${label} : ${text || "vide"}`}>
      {special ? <span className="text-sm font-semibold" title="Sans limite">{settings.unlimited}</span>
        : number === null && text ? <span className="text-sm">{text}</span>
        : Array.from({ length: Math.min(max, iconCap) }, (_, index) => <IndexIconGlyph key={index} icon={settings.icon} emoji={settings.emoji} />)}
      {max > iconCap && <span className="text-[11px] font-semibold">+{max - iconCap}</span>}
      {number === 0 && <span className="text-xs text-muted-foreground">0</span>}
      <span className="ml-auto">{editor}</span>
    </span>
  }

  if (settings.style === "icons") {
    const count = Math.min(max, iconCap)
    return <span className="flex min-h-8 items-center gap-0.5 px-1.5" style={{ color }} role="group" aria-label={`${label} : ${current ?? "vide"} sur ${max}`}>
      {Array.from({ length: count }, (_, index) => {
        const filled = current !== null && index < current
        return <button key={index} type="button" disabled={disabled} onClick={() => set(current !== null && index < current ? index : index + 1)} className={`inline-flex rounded-sm p-0.5 transition hover:scale-110 disabled:hover:scale-100 ${filled ? "opacity-100" : "opacity-30 hover:opacity-60"}`} aria-label={`${label} : ${index + 1}`}>
          <IndexIconGlyph icon={settings.icon} emoji={settings.emoji} filled={filled} />
        </button>
      })}
      {!count && <span className="text-xs text-muted-foreground">{scale === "from-column" ? "Maximum vide" : "—"}</span>}
      <span className="ml-auto">{editor}</span>
    </span>
  }

  if (settings.style === "ring") {
    const radius = 11
    const length = 2 * Math.PI * radius
    return <span className="flex min-h-8 items-center gap-1 px-1.5">
      <button type="button" disabled={disabled || !current} onClick={() => set(Math.max(0, (current ?? 0) - 1))} className="rounded p-0.5 text-muted-foreground hover:bg-muted disabled:opacity-30" aria-label={`Diminuer ${label}`}><Minus className="size-3" /></button>
      <span className="relative grid size-7 place-items-center" aria-label={`${label} : ${current ?? "vide"} sur ${max}`}>
        <svg viewBox="0 0 28 28" className="absolute inset-0 -rotate-90"><circle cx="14" cy="14" r={radius} fill="none" stroke="currentColor" strokeWidth="3" className="text-muted" /><circle cx="14" cy="14" r={radius} fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeDasharray={`${length * ratio} ${length}`} /></svg>
        <span className="relative text-[10px] font-semibold tabular-nums">{current ?? "—"}</span>
      </span>
      <button type="button" disabled={disabled || current === max} onClick={() => set(Math.min(max, (current ?? 0) + 1))} className="rounded p-0.5 text-muted-foreground hover:bg-muted disabled:opacity-30" aria-label={`Augmenter ${label}`}><Plus className="size-3" /></button>
      <span className="ml-auto">{editor}</span>
    </span>
  }

  return <GaugeBar label={label} current={current} max={max} color={color} disabled={disabled} editor={editor} onChange={set} />
})

/** La barre : on la fait glisser, ou on tape la valeur. */
function GaugeBar({ label, current, max, color, disabled, editor, onChange }: { label: string; current: number | null; max: number; color: string; disabled: boolean; editor: ReactNode; onChange: (value: number) => void }) {
  const [dragging, setDragging] = useState<number | null>(null)
  const displayed = dragging ?? current ?? 0
  const commit = () => { if (dragging !== null) { onChange(dragging); setDragging(null) } }
  return <span className="flex min-h-8 items-center gap-2 px-2">
    <input
      type="range"
      min={0}
      max={Math.max(1, max)}
      step={1}
      value={displayed}
      disabled={disabled || max <= 0}
      aria-label={label}
      onChange={(event) => setDragging(Number(event.target.value))}
      onPointerUp={commit}
      onKeyUp={commit}
      onBlur={commit}
      className="h-1.5 min-w-0 flex-1 cursor-pointer"
      style={{ accentColor: color }}
    />
    {editor}
  </span>
}
