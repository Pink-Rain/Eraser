"use client"

import { memo, useEffect, useMemo, useState } from "react"
import { Check, ChevronDown, Crosshair, ImagePlus, Link2, LoaderCircle, Plus, Search, Sparkles, X, Zap } from "lucide-react"

import { CharacteristicInputs } from "@/components/eraser/characteristic-fields"
import { RichTextField } from "@/components/eraser/rich-text"
import { TokenButton } from "@/components/eraser/token-editor"
import { SpellChargeStars } from "@/components/eraser/spell-charges"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Select as SelectPrimitive } from "radix-ui"

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { ClassSpell } from "@/lib/class-content"
import {
  creatureCharacteristics,
  creatureChoices,
  creatureNoteHeader,
  foldName,
  matchCreatureChoice,
  splitNames,
} from "@/lib/world-index-definitions"

type SpellOption = Pick<ClassSpell, "id" | "name" | "category" | "type" | "effect" | "effectHtml" | "description" | "descriptionHtml" | "skills" | "distance" | "charges" | "tone">

/** Les champs de la fiche, par en-tête de colonne dans la feuille. */
const identityFields = ["Nom", "Rang", "Taille", "Poids", "Type", "Sous-type", "Dressable", "Organisation", "Comportement", "Langue"]
const placeFields = ["Emplacement principal", "Rareté", "Emplacement secondaire", "Rareté secondaire"]
const allFields = ["Portrait", ...identityFields, ...placeFields, ...creatureCharacteristics, creatureNoteHeader, "Sorts actifs", "Sorts passifs"]

/** Valeur vide d'une liste : Radix n'accepte pas la chaîne vide comme valeur d'option. */
const NONE = "__aucun__"

export function isChecked(value: string) {
  return /^(oui|vrai|true|x|1|yes)$/i.test(value.trim())
}

/** Seules les vraies adresses d'image s'affichent : une cellule décalée peut contenir « Base ». */
function isImageSource(value: string) {
  return /^(https?:\/\/|\/|data:image\/)/i.test(value.trim())
}

/**
 * Liste déroulante d'une colonne fermée (rang, type, emplacement…), dans la fiche comme
 * dans le tableau. Une valeur écrite autrement dans la feuille (« Aggressif ») est
 * reconnue sans être réécrite ; une valeur hors liste (« Donjon-Ruine ») reste
 * affichée et sélectionnable, pour ne jamais être effacée par mégarde.
 */
export function CreatureChoiceSelect({ header, value, onChange, compact = false, disabled = false, open, onOpenChange }: { header: string; value: string; onChange: (value: string) => void; compact?: boolean; disabled?: boolean; open?: boolean; onOpenChange?: (open: boolean) => void }) {
  const options = creatureChoices[header] ?? []
  const trimmed = value.trim()
  const matched = matchCreatureChoice(trimmed, options)
  const current = matched?.value ?? trimmed
  const legacy = trimmed && !matched ? trimmed : ""

  // Une info (les familles qui parlent une langue) n'apparaît que sur l'option survolée.
  // Elle reste hors de ItemText : le champ fermé n'affiche que la valeur.
  const list = options.map((option) => option.hint
    ? <SelectPrimitive.Item key={option.value} value={option.value} className="group relative flex w-full cursor-default select-none flex-col items-start rounded-sm py-1.5 pr-8 pl-2 text-sm outline-hidden focus:bg-accent focus:text-accent-foreground">
        <span className="absolute right-2 top-2 flex size-3.5 items-center justify-center"><SelectPrimitive.ItemIndicator><Check className="size-4" /></SelectPrimitive.ItemIndicator></span>
        <SelectPrimitive.ItemText>{option.value}</SelectPrimitive.ItemText>
        <span className="hidden text-xs text-muted-foreground group-data-[highlighted]:block">{option.hint}</span>
      </SelectPrimitive.Item>
    : <SelectItem key={option.value} value={option.value}>{option.value}</SelectItem>)

  return <Select value={current || NONE} onValueChange={(next) => onChange(next === NONE ? "" : next)} disabled={disabled} open={open} onOpenChange={onOpenChange}>
    <SelectTrigger
      size="sm"
      aria-label={header}
      title={matched?.hint}
      className={compact
        ? "h-8 w-full border-transparent bg-transparent px-2 shadow-none hover:border-input dark:bg-transparent"
        : "w-full"}
    >
      <SelectValue placeholder="—" />
    </SelectTrigger>
    <SelectContent position="popper" className="max-h-72">
      <SelectItem value={NONE} className="text-muted-foreground">—</SelectItem>
      {legacy && <SelectItem value={legacy} className="italic text-muted-foreground" title="Valeur actuelle de la feuille, hors de la liste">{legacy}</SelectItem>}
      {list}
    </SelectContent>
  </Select>
}

/**
 * Valeur affichée tout de suite après un choix, sans attendre que le tableau entier se
 * redessine. Elle s'efface dès que la ligne reçoit la valeur enregistrée.
 */
function useOptimistic(value: string) {
  const [state, setState] = useState({ source: value, local: null as string | null })
  if (state.source !== value) setState({ source: value, local: null })
  const shown = state.source === value ? state.local ?? value : value
  return [shown, (next: string) => setState({ source: value, local: next })] as const
}

/**
 * Une liste du tableau des créatures. Fermée, ce n'est qu'un bouton : le vrai menu
 * n'est monté qu'au clic. Des centaines de menus montés d'avance rendaient le tableau
 * interminable à afficher.
 */
export const CreatureChoiceCell = memo(function CreatureChoiceCell({ header, value, disabled = false, onChange }: { header: string; value: string; disabled?: boolean; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false)
  const [shown, setShown] = useOptimistic(value)
  if (open) return <CreatureChoiceSelect compact open header={header} value={shown} disabled={disabled} onOpenChange={(next) => { if (!next) setOpen(false) }} onChange={(next) => { setShown(next); setOpen(false); onChange(next) }} />
  const matched = matchCreatureChoice(shown.trim(), creatureChoices[header] ?? [])
  const label = matched?.value ?? shown.trim()
  return <button
    type="button"
    aria-label={header}
    disabled={disabled}
    onClick={() => setOpen(true)}
    className={`flex h-8 w-full items-center justify-between gap-2 rounded-md border border-transparent px-2 text-left text-sm hover:border-input disabled:opacity-50 ${matched || !label ? "" : "italic text-muted-foreground"}`}
  >
    <span className="truncate">{label || "—"}</span>
    <ChevronDown className="size-4 shrink-0 opacity-50" />
  </button>
})

/** La case Dressable du tableau. */
export const CreatureCheckCell = memo(function CreatureCheckCell({ label, value, disabled = false, onChange }: { label: string; value: string; disabled?: boolean; onChange: (value: string) => void }) {
  const [shown, setShown] = useOptimistic(value)
  return <span className="flex min-h-8 items-center justify-center">
    <Checkbox aria-label={label} checked={isChecked(shown)} disabled={disabled} onCheckedChange={(checked) => { const next = checked === true ? "Oui" : "Non"; setShown(next); onChange(next) }} />
  </span>
})

/** La fiche d'un sort choisi : tout ce que dit l'Index des classes, sauf les classes. */
function SpellCard({ name, spell, onRemove }: { name: string; spell?: SpellOption; onRemove: () => void }) {
  const accent = spell?.tone.background || "var(--primary)"
  return <article className="relative rounded-xl border bg-card/80 p-3 pl-4 text-sm shadow-xs" style={{ borderLeft: `3px solid ${accent}` }}>
    <button type="button" onClick={onRemove} className="absolute right-2 top-2 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-destructive" aria-label={`Retirer ${name}`}><X className="size-3.5" /></button>
    <header className="flex flex-wrap items-baseline gap-x-2 gap-y-1 pr-7">
      <h4 className="font-display text-base font-semibold leading-tight">{spell?.name ?? name}</h4>
      {spell?.type && <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider" style={{ backgroundColor: spell.tone.background, color: spell.tone.foreground }}>{spell.type}</span>}
      {spell?.category === "actif" && <SpellChargeStars total={spell.charges} accent={accent} />}
    </header>
    {!spell && <p className="mt-1 text-xs text-muted-foreground">Ce sort n’est pas (ou plus) dans l’index Classes.</p>}
    {spell && (spell.effect || spell.description) && <div className="mt-2 grid gap-1 leading-6">
      {spell.effect && <div className="font-medium [&_a]:underline" dangerouslySetInnerHTML={{ __html: spell.effectHtml || spell.effect }} />}
      {spell.description && <div className="text-muted-foreground [&_a]:underline" dangerouslySetInnerHTML={{ __html: spell.descriptionHtml || spell.description }} />}
    </div>}
    {spell && (spell.skills.length > 0 || spell.distance) && <footer className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {spell.skills.length > 0 && <span className="font-semibold text-[#b3261e]">{spell.skills.join(" · ")}</span>}
      {spell.distance && <span className="flex items-center gap-1"><Crosshair className="size-3" />Distance : {spell.distance}</span>}
    </footer>}
  </article>
}

/**
 * Sélecteur de sorts : les sorts de l'Index des classes, filtrés par catégorie. La
 * feuille garde leurs noms séparés par des virgules, lisibles directement dans Sheets.
 */
function SpellPicker({ label, icon, value, options, loading, onChange }: { label: string; icon: React.ReactNode; value: string; options: SpellOption[]; loading: boolean; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const selected = splitNames(value)
  const chosen = new Set(selected.map(foldName))
  const byName = useMemo(() => new Map(options.map((spell) => [foldName(spell.name), spell])), [options])
  const matches = options.filter((spell) => !chosen.has(foldName(spell.name)) && (!query.trim() || foldName(`${spell.name} ${spell.type}`).includes(foldName(query)))).slice(0, 60)

  return <section className="grid gap-2">
    <div className="flex items-center justify-between gap-2">
      <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[.14em] text-muted-foreground">{icon}{label}{selected.length > 0 && <span className="font-normal normal-case tracking-normal">({selected.length})</span>}</p>
      <Popover open={open} onOpenChange={(next) => { setOpen(next); if (!next) setQuery("") }}>
        <PopoverTrigger asChild><Button type="button" variant="outline" size="sm"><Plus />Ajouter</Button></PopoverTrigger>
        <PopoverContent className="w-80 p-2" align="end">
          <div className="relative"><Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" /><Input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Chercher un sort…" className="h-8 pl-8" /></div>
          <div className="mt-2 max-h-64 overflow-y-auto">
            {loading && <p className="flex items-center gap-2 px-2 py-3 text-xs text-muted-foreground"><LoaderCircle className="size-3.5 animate-spin" />Chargement des sorts…</p>}
            {!loading && !matches.length && <p className="px-2 py-3 text-xs text-muted-foreground">Aucun sort ne correspond.</p>}
            {matches.map((spell) => <button key={spell.id || spell.name} type="button" onClick={() => { onChange([...selected, spell.name].join(", ")); setQuery(""); setOpen(false) }} className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted">
              <span className="truncate">{spell.name}</span>
              <span className="shrink-0 text-[10px] uppercase tracking-wider text-muted-foreground">{spell.type || spell.category}</span>
            </button>)}
          </div>
        </PopoverContent>
      </Popover>
    </div>
    {selected.length
      ? <div className="grid gap-2 md:grid-cols-2">
          {selected.map((name) => <SpellCard key={name} name={name} spell={byName.get(foldName(name))} onRemove={() => onChange(selected.filter((item) => foldName(item) !== foldName(name)).join(", "))} />)}
        </div>
      : <p className="rounded-xl border border-dashed px-3 py-3 text-center text-xs text-muted-foreground">Aucun sort pour l’instant.</p>}
  </section>
}

/**
 * La fiche d'une créature. Elle s'ouvre d'un clic sur le nom dans l'Index des
 * créatures, pré-remplie avec ce que la ligne contient déjà, et enregistre toutes les
 * colonnes de la feuille — y compris celles que le tableau n'affiche pas.
 */
/** Le token d'une créature suit l'image importée dans Drive (elle n'a pas d'autre identifiant). */
function creatureTokenId(portrait: string) {
  return portrait.match(/\/api\/resources\/creature-portraits\/([\w-]+)/)?.[1] || ""
}

export function CreatureSheetDialog({ open, headers, values, html, onClose, onSave }: {
  open: boolean
  headers: string[]
  values: string[]
  /** Les mêmes cellules avec leur mise en forme, pour les champs de texte enrichi. */
  html: string[]
  onClose: () => void
  onSave: (fields: Record<string, string>) => Promise<void>
}) {
  const initial = useMemo(() => Object.fromEntries(allFields.map((field) => {
    const index = headers.findIndex((header) => foldName(header) === foldName(field))
    const rich = field === creatureNoteHeader
    return [field, index >= 0 ? (rich ? html[index] || values[index] : values[index]) ?? "" : ""]
  })), [headers, html, values])
  const [fields, setFields] = useState<Record<string, string>>(initial)
  const [pending, setPending] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState("")
  const [spells, setSpells] = useState<SpellOption[]>([])
  const [spellsLoading, setSpellsLoading] = useState(true)
  const set = (field: string, value: string) => setFields((current) => ({ ...current, [field]: value }))

  useEffect(() => {
    let alive = true
    fetch("/api/resources/class-index").then((response) => response.json()).then((payload: { data?: { spells?: SpellOption[] } }) => {
      if (alive) setSpells((payload.data?.spells ?? []).filter((spell) => spell.name).sort((left, right) => left.name.localeCompare(right.name, "fr")))
    }).catch(() => undefined).finally(() => { if (alive) setSpellsLoading(false) })
    return () => { alive = false }
  }, [])

  async function upload(file: File) {
    setUploading(true); setError("")
    const form = new FormData()
    form.set("file", file)
    const previous = fields.Portrait.match(/\/api\/resources\/creature-portraits\/([\w-]+)/)?.[1]
    if (previous) form.set("id", previous)
    try {
      const response = await fetch("/api/resources/creature-portraits", { method: "POST", body: form })
      const payload = (await response.json().catch(() => ({}))) as { url?: string; error?: string }
      if (!response.ok || !payload.url) throw new Error(payload.error || "Le portrait n’a pas pu être importé.")
      set("Portrait", payload.url)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Le portrait n’a pas pu être importé.")
    }
    setUploading(false)
  }

  async function save() {
    if (!fields.Nom.trim()) return setError("Le nom est obligatoire.")
    setPending(true); setError("")
    try {
      await onSave(Object.fromEntries(Object.entries(fields).filter(([field, value]) => value !== initial[field])))
      onClose()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "La fiche n’a pas pu être enregistrée.")
    }
    setPending(false)
  }

  const text = (name: string, className = "") => <label key={name} className={`grid gap-1 text-xs font-semibold ${className}`}>
    {name}
    <Input value={fields[name] ?? ""} onChange={(event) => set(name, event.target.value)} />
  </label>
  const choice = (name: string, className = "") => <div key={name} className={`grid gap-1 text-xs font-semibold ${className}`}>
    <span>{name}</span>
    <CreatureChoiceSelect header={name} value={fields[name] ?? ""} onChange={(value) => set(name, value)} />
  </div>

  const activeSpells = spells.filter((spell) => spell.category !== "passif")
  const passiveSpells = spells.filter((spell) => spell.category === "passif")

  return <Dialog open={open} onOpenChange={(next) => { if (!next) onClose() }}>
    <DialogContent className="max-h-[92svh] overflow-y-auto sm:max-w-5xl">
      <DialogHeader>
        <DialogTitle className="font-display text-3xl">{fields.Nom || "Nouvelle créature"}</DialogTitle>
        <DialogDescription>Fiche complète de la créature, enregistrée dans la feuille « Index des créatures ».</DialogDescription>
      </DialogHeader>

      <div className="grid gap-6 md:grid-cols-[14rem_minmax(0,1fr)]">
        <section className="grid content-start gap-3">
          <div className="grid aspect-[3/4] place-items-center overflow-hidden rounded-2xl border bg-muted/40">
            {isImageSource(fields.Portrait)
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={fields.Portrait} alt={`Portrait de ${fields.Nom || "la créature"}`} className="size-full object-cover" />
              : <ImagePlus className="size-8 text-muted-foreground/60" />}
          </div>
          <label className="inline-flex">
            <input type="file" accept="image/*" className="sr-only" onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file); event.target.value = "" }} />
            <span className="inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm font-medium hover:bg-muted">{uploading ? <LoaderCircle className="size-4 animate-spin" /> : <ImagePlus className="size-4" />}Importer une image</span>
          </label>
          <div className="relative"><Link2 className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" /><Input value={fields.Portrait} onChange={(event) => set("Portrait", event.target.value)} placeholder="…ou coller une URL" className="pl-8 text-xs" /></div>
          <TokenButton kind="creature" ownerId={creatureTokenId(fields.Portrait)} name={fields.Nom} source={isImageSource(fields.Portrait) ? fields.Portrait : ""} style={{ kind: "creature" }} disabledReason={creatureTokenId(fields.Portrait) ? "" : "Importe d’abord l’image de la créature"} />

        </section>

        <section className="grid content-start gap-3">
          <div className="grid gap-3 sm:grid-cols-[minmax(0,2fr)_6rem_minmax(0,1fr)_minmax(0,1fr)]">
            {text("Nom")}
            {choice("Rang")}
            {text("Taille")}
            {text("Poids")}
          </div>
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
            {choice("Type")}
            {choice("Sous-type")}
            <label className="flex h-9 items-center gap-2 self-end rounded-lg border bg-background/50 px-3 text-sm font-semibold">
              <Checkbox checked={isChecked(fields.Dressable ?? "")} onCheckedChange={(checked) => set("Dressable", checked === true ? "Oui" : "Non")} />
              Dressable
            </label>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {choice("Organisation")}
            {choice("Comportement")}
            {choice("Langue")}
          </div>
          <div className="grid grid-cols-2 items-end gap-3 lg:grid-cols-4">
            {placeFields.map((name) => choice(name))}
          </div>
          <div className="grid gap-1 text-xs font-semibold">
            Description, Histoire, Lore, Autre :
            <RichTextField ariaLabel="Description, Histoire, Lore, Autre" value={initial[creatureNoteHeader] ?? ""} onCommit={(value) => set(creatureNoteHeader, value)} minHeight="min-h-28" />
          </div>
        </section>
      </div>

      <section className="grid gap-2">
        <p className="text-xs font-semibold uppercase tracking-[.14em] text-muted-foreground">Caractéristiques</p>
        <CharacteristicInputs values={fields} onChange={set} />
      </section>

      <SpellPicker label="Actifs" icon={<Zap className="size-3.5" />} value={fields["Sorts actifs"]} options={activeSpells} loading={spellsLoading} onChange={(value) => set("Sorts actifs", value)} />
      <SpellPicker label="Passifs" icon={<Sparkles className="size-3.5" />} value={fields["Sorts passifs"]} options={passiveSpells} loading={spellsLoading} onChange={(value) => set("Sorts passifs", value)} />

      {error && <p className="rounded-xl border border-destructive/25 bg-destructive/5 px-4 py-2.5 text-sm text-destructive">{error}</p>}
      <div className="flex justify-end gap-2 border-t pt-4">
        <Button type="button" variant="outline" onClick={onClose} disabled={pending}>Annuler</Button>
        <Button type="button" onClick={() => void save()} disabled={pending || uploading}>{pending ? <LoaderCircle className="animate-spin" /> : <Check />}Enregistrer la fiche</Button>
      </div>
    </DialogContent>
  </Dialog>
}
