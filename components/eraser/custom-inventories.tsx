"use client"

import { useState } from "react"
import { Anvil, Apple, Archive, Backpack, BookOpen, Briefcase, Brush, Check, CookingPot, Feather, FlaskConical, Gem, Hammer, Key, Leaf, Map as MapIcon, Music, Package, Plus, Scissors, Scroll, Shirt, ShoppingBag, Skull, Sparkles, Wrench, type LucideIcon } from "lucide-react"

import { ColorSwatches } from "@/components/eraser/editor-controls"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { customInventoryFamilies, customInventoryIcon, customInventoryIcons, defaultCustomInventoryIcon, describeCustomInventoryAccepts, formatCustomInventoryAccepts, parseCustomInventoryAccepts, type CustomInventoryFamily, type CustomInventoryIcon, type CustomInventoryLook, type CustomInventorySide, type InventoryContainerRecord } from "@/lib/inventory-schema"
import { cn } from "@/lib/utils"

export const customInventoryIconComponents: Record<CustomInventoryIcon, LucideIcon> = {
  backpack: Backpack, briefcase: Briefcase, package: Package, archive: Archive, "shopping-bag": ShoppingBag, gem: Gem,
  "flask-conical": FlaskConical, "book-open": BookOpen, scroll: Scroll, leaf: Leaf, apple: Apple, wrench: Wrench,
  hammer: Hammer, key: Key, feather: Feather, sparkles: Sparkles, skull: Skull, shirt: Shirt, music: Music, map: MapIcon,
}

const iconNames: Record<CustomInventoryIcon, string> = {
  backpack: "Sac", briefcase: "Sacoche", package: "Paquet", archive: "Coffre", "shopping-bag": "Besace", gem: "Écrin",
  "flask-conical": "Fiole", "book-open": "Livre", scroll: "Parchemin", leaf: "Herbier", apple: "Provisions", wrench: "Outils",
  hammer: "Marteau", key: "Clé", feather: "Plume", sparkles: "Magie", skull: "Trophées", shirt: "Vêtements", music: "Musique", map: "Cartes",
}

export const defaultCustomInventoryColor = "#397f88"

export function CustomInventoryIconGlyph({ icon, className }: { icon: string; className?: string }) {
  const Icon = customInventoryIconComponents[customInventoryIcon(icon)]
  return <Icon className={className} />
}

/** Ce que le popup envoie : nom, emplacements, et l'apparence de l'inventaire sur mesure. */
export type CustomInventoryDraft = { name: string; capacity: number; custom: CustomInventoryLook }

type Form = { name: string; capacity: string; color: string; icon: CustomInventoryIcon; families: CustomInventoryFamily[]; keywords: string; side: CustomInventorySide }

function formOf(container: InventoryContainerRecord | null, side: CustomInventorySide): Form {
  if (!container?.custom) return { name: "", capacity: "10", color: defaultCustomInventoryColor, icon: defaultCustomInventoryIcon, families: [], keywords: "", side }
  const accepts = parseCustomInventoryAccepts(container.custom.accepts)
  return { name: container.name, capacity: String(container.capacity), color: container.custom.color, icon: customInventoryIcon(container.custom.icon), families: accepts.families, keywords: accepts.keywords.join(", "), side: container.custom.side }
}

const sides: Array<{ value: CustomInventorySide; label: string }> = [{ value: "left", label: "Gauche" }, { value: "right", label: "Droite" }]

/**
 * Créer ou modifier un inventaire sur mesure : nom, couleur, icône, emplacements et ce qu'on
 * peut y ranger (des familles, des mots-clés). L'aperçu en haut suit chaque choix.
 */
export function CustomInventoryDialog({ open, container, side, pending, onOpenChange, onSave }: { open: boolean; /** `null` : un nouvel inventaire. */ container: InventoryContainerRecord | null; /** La colonne du + cliqué (un nouvel inventaire). */ side: CustomInventorySide; pending: boolean; onOpenChange: (open: boolean) => void; onSave: (draft: CustomInventoryDraft) => Promise<boolean> }) {
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="sm:max-w-lg">
      {/* Remonté à chaque ouverture : le formulaire repart de l'inventaire choisi. */}
      {open && <CustomInventoryForm key={container?.id ?? `new:${side}`} container={container} side={side} pending={pending} onCancel={() => onOpenChange(false)} onSave={onSave} />}
    </DialogContent>
  </Dialog>
}

function CustomInventoryForm({ container, side, pending, onCancel, onSave }: { container: InventoryContainerRecord | null; side: CustomInventorySide; pending: boolean; onCancel: () => void; onSave: (draft: CustomInventoryDraft) => Promise<boolean> }) {
  const [form, setForm] = useState<Form>(() => formOf(container, side))
  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((current) => ({ ...current, [key]: value }))
  const capacity = Math.trunc(Number(form.capacity))
  const valid = Boolean(form.name.trim()) && capacity >= 1 && capacity <= 10000
  const accepts = formatCustomInventoryAccepts({ families: form.families, keywords: form.keywords.split(",").map((keyword) => keyword.trim()).filter(Boolean) })
  const Icon = customInventoryIconComponents[form.icon]
  const toggleFamily = (family: CustomInventoryFamily) => set("families", form.families.includes(family) ? form.families.filter((candidate) => candidate !== family) : [...form.families, family])
  async function save() {
    if (!valid || pending) return
    await onSave({ name: form.name.trim(), capacity, custom: { color: form.color, icon: form.icon, accepts, side: form.side } })
  }
  return <>
    <DialogHeader>
      <DialogTitle>{container ? `Modifier « ${container.name} »` : "Nouvel inventaire sur mesure"}</DialogTitle>
      <DialogDescription>Un rangement à ta façon, rien que pour ce personnage.</DialogDescription>
    </DialogHeader>
    <div className="grid gap-4">
      {/* L'aperçu : la carte telle qu'elle apparaîtra sous l'inventaire. */}
      <div className="flex items-center gap-3 rounded-2xl border px-3 py-2.5 transition-colors" style={{ borderColor: `${form.color}66`, background: `linear-gradient(145deg, ${form.color}22, rgba(255,255,255,.02))` }}>
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl" style={{ color: form.color, backgroundColor: `${form.color}20` }}><Icon className="size-4.5" /></span>
        <span className="min-w-0 flex-1"><span className="font-display block truncate text-lg font-semibold" style={{ color: form.color }}>{form.name.trim() || "Nom de l’inventaire"}</span><span className="block truncate text-[11px] text-muted-foreground">{describeCustomInventoryAccepts(accepts)}</span></span>
        <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold tabular-nums" style={{ color: form.color, backgroundColor: `${form.color}16` }}>0/{valid ? capacity : "?"}</span>
      </div>
      <div className="grid gap-4 sm:grid-cols-[1fr_7rem]">
        <Label className="grid gap-1.5 text-sm font-medium">Nom<Input value={form.name} onChange={(event) => set("name", event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void save() }} maxLength={120} placeholder="Trousse d’alchimiste, carquois…" autoFocus /></Label>
        <Label className="grid gap-1.5 text-sm font-medium">Emplacements<Input type="number" min={1} max={10000} value={form.capacity} onChange={(event) => set("capacity", event.target.value)} /></Label>
      </div>
      <div className="grid gap-1.5 text-sm font-medium">Colonne
        <div className="flex gap-1.5" role="radiogroup" aria-label="Colonne de l’inventaire">
          {sides.map((option) => {
            const selected = form.side === option.value
            return <button key={option.value} type="button" role="radio" aria-checked={selected} onClick={() => set("side", option.value)} className={cn("rounded-full border px-3 py-1 text-xs transition", selected ? "font-semibold" : "text-muted-foreground hover:bg-muted")} style={selected ? { color: form.color, borderColor: `${form.color}88`, backgroundColor: `${form.color}14` } : undefined}>{option.label}</button>
          })}
        </div>
      </div>
      <div className="grid gap-1.5 text-sm font-medium">Couleur<ColorSwatches value={form.color} onChange={(color) => set("color", color ?? defaultCustomInventoryColor)} none={null} ariaLabel="Couleur de l’inventaire" /></div>
      <div className="grid gap-1.5 text-sm font-medium">Icône
        <div className="grid grid-cols-10 gap-1" role="radiogroup" aria-label="Icône de l’inventaire">
          {customInventoryIcons.map((icon) => {
            const Glyph = customInventoryIconComponents[icon]
            const selected = form.icon === icon
            return <button key={icon} type="button" role="radio" aria-checked={selected} aria-label={iconNames[icon]} title={iconNames[icon]} onClick={() => set("icon", icon)} className={cn("flex aspect-square items-center justify-center rounded-lg border transition", selected ? "shadow-sm" : "border-transparent text-muted-foreground hover:bg-muted hover:text-foreground")} style={selected ? { color: form.color, borderColor: `${form.color}88`, backgroundColor: `${form.color}18` } : undefined}><Glyph className="size-4" /></button>
          })}
        </div>
      </div>
      <div className="grid gap-2 text-sm font-medium">
        <span>Ce qu’on peut y ranger</span>
        <div className="flex flex-wrap gap-1.5">
          <button type="button" aria-pressed={!form.families.length} onClick={() => set("families", [])} className={cn("rounded-full border px-3 py-1 text-xs transition", !form.families.length ? "font-semibold" : "text-muted-foreground hover:bg-muted")} style={!form.families.length ? { color: form.color, borderColor: `${form.color}88`, backgroundColor: `${form.color}14` } : undefined}>Tout</button>
          {customInventoryFamilies.map((family) => {
            const selected = form.families.includes(family.category)
            return <button key={family.category} type="button" aria-pressed={selected} onClick={() => toggleFamily(family.category)} className={cn("inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs transition", selected ? "font-semibold" : "text-muted-foreground hover:bg-muted")} style={selected ? { color: form.color, borderColor: `${form.color}88`, backgroundColor: `${form.color}14` } : undefined}>{selected && <Check className="size-3" />}{family.label}</button>
          })}
        </div>
        <Input value={form.keywords} onChange={(event) => set("keywords", event.target.value)} maxLength={400} placeholder="Mots-clés, facultatif : potion, plante, flèche…" aria-label="Mots-clés" className="font-normal" />
        <p className="text-[11px] font-normal leading-snug text-muted-foreground">Avec des mots-clés, seuls les items qui en contiennent un (dans leur nom, type ou sous-type) y entrent. La monnaie reste dans la bourse. Les achats et les dons ne s’y rangent jamais tout seuls.</p>
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel}>Annuler</Button>
        <Button type="button" disabled={!valid || pending} onClick={() => void save()} style={{ backgroundColor: form.color, color: "#fff" }}>{container ? <Check /> : <Plus />}{container ? "Enregistrer" : "Créer"}</Button>
      </div>
    </div>
  </>
}

const craftKinds = [
  { key: "maquillage", label: "Maquillage", icon: Brush },
  { key: "couture", label: "Couture", icon: Scissors },
  { key: "artisanat", label: "Artisanat", icon: Hammer },
  { key: "alchimie", label: "Alchimie", icon: FlaskConical },
  { key: "cuisine", label: "Cuisine", icon: CookingPot },
  { key: "ouvrages", label: "Ouvrages", icon: BookOpen },
] as const

const craftColor = "#9a5f3c"

/** Le coin « Craft », à côté de la bourse : un bouton par savoir-faire, chacun ouvre son popup (vides pour l'instant). */
export function CraftCorner() {
  const [opened, setOpened] = useState<(typeof craftKinds)[number]["key"] | null>(null)
  const current = craftKinds.find((kind) => kind.key === opened)
  // Étiré à la hauteur de la bourse, à côté d'elle : les boutons restent centrés dans la place.
  return <div className="flex flex-col rounded-[1.4rem] border p-3" style={{ borderColor: `${craftColor}42`, background: `linear-gradient(145deg, ${craftColor}12, rgba(255,255,255,.015))` }}>
    <div className="mb-3 flex items-center gap-3 px-1"><div className="flex size-9 items-center justify-center rounded-xl" style={{ color: craftColor, backgroundColor: `${craftColor}18` }}><Anvil className="size-4.5" /></div><h3 className="font-display flex-1 text-xl font-semibold" style={{ color: craftColor }}>Craft</h3></div>
    <div className="flex flex-1 items-center justify-center"><div className="grid grid-cols-3 gap-2">
      {craftKinds.map((kind) => {
        const Icon = kind.icon
        return <button key={kind.key} type="button" onClick={() => setOpened(kind.key)} aria-label={kind.label} title={kind.label} className="flex size-11 items-center justify-center rounded-xl border bg-card/70 shadow-sm transition hover:-translate-y-px hover:shadow-md focus-visible:outline-none focus-visible:ring-2" style={{ color: craftColor, borderColor: `${craftColor}40` }}><Icon className="size-5" /></button>
      })}
    </div></div>
    <Dialog open={current !== undefined} onOpenChange={(open) => { if (!open) setOpened(null) }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle className="flex items-center gap-2">{current && <current.icon className="size-5" style={{ color: craftColor }} />}{current?.label}</DialogTitle><DialogDescription className="sr-only">{current?.label}</DialogDescription></DialogHeader>
        <div className="min-h-40" />
      </DialogContent>
    </Dialog>
  </div>
}
