"use client"

import { useEffect, useMemo, useState } from "react"
import { Check, ImagePlus, Link2, LoaderCircle, Plus, Search, Sparkles, X, Zap } from "lucide-react"

import { RichTextField } from "@/components/eraser/rich-text"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { creatureCharacteristics, foldName, splitNames } from "@/lib/world-index-definitions"

type SpellOption = { id: string; name: string; category: "actif" | "passif" | "bonus"; type: string }

/** Les champs de la fiche, dans l'ordre du formulaire. Les en-têtes sont ceux de la feuille. */
const identityFields = ["Nom", "Rang", "Environnement", "Type", "Climat", "Sous-type", "Sous-type secondaire"]
const narrativeFields = ["Organisation", "Comportement", "Rencontre"]
const physicalFields = ["Langue", "Taille", "Poids"]
const allFields = ["Portrait", ...identityFields, "Dressable", ...narrativeFields, ...physicalFields, ...creatureCharacteristics, "Sorts actifs", "Sorts passifs"]

function isChecked(value: string) {
  return /^(oui|vrai|true|x|1|yes)$/i.test(value.trim())
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
  const matches = options.filter((spell) => !chosen.has(foldName(spell.name)) && (!query.trim() || foldName(spell.name).includes(foldName(query)))).slice(0, 60)

  return <section className="grid gap-2">
    <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[.14em] text-muted-foreground">{icon}{label}</div>
    <div className="flex min-h-10 flex-wrap items-center gap-1.5 rounded-xl border bg-background/50 p-2">
      {selected.map((name) => <span key={name} className="inline-flex items-center gap-1 rounded-full border bg-card px-2.5 py-1 text-sm">
        {name}
        <button type="button" onClick={() => onChange(selected.filter((item) => foldName(item) !== foldName(name)).join(", "))} className="rounded-full text-muted-foreground hover:text-destructive" aria-label={`Retirer ${name}`}><X className="size-3.5" /></button>
      </span>)}
      <Popover open={open} onOpenChange={(next) => { setOpen(next); if (!next) setQuery("") }}>
        <PopoverTrigger asChild><Button type="button" variant="ghost" size="sm" className="h-7"><Plus />Ajouter</Button></PopoverTrigger>
        <PopoverContent className="w-80 p-2" align="start">
          <div className="relative"><Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" /><Input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Chercher un sort…" className="h-8 pl-8" /></div>
          <div className="mt-2 max-h-64 overflow-y-auto">
            {loading && <p className="flex items-center gap-2 px-2 py-3 text-xs text-muted-foreground"><LoaderCircle className="size-3.5 animate-spin" />Chargement des sorts…</p>}
            {!loading && !matches.length && <p className="px-2 py-3 text-xs text-muted-foreground">Aucun sort ne correspond.</p>}
            {matches.map((spell) => <button key={spell.id || spell.name} type="button" onClick={() => { onChange([...selected, spell.name].join(", ")); setQuery("") }} className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted">
              <span className="truncate">{spell.name}</span>
              <span className="shrink-0 text-[10px] uppercase tracking-wider text-muted-foreground">{spell.type || spell.category}</span>
            </button>)}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  </section>
}

/**
 * La fiche d'une créature. Elle s'ouvre depuis le nom dans l'Index des créatures,
 * pré-remplie avec ce que la ligne contient déjà, et enregistre toutes les colonnes
 * de la feuille — y compris celles que le tableau n'affiche pas.
 */
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
    const rich = narrativeFields.includes(field)
    return [field, index >= 0 ? (rich ? html[index] || values[index] : values[index]) ?? "" : ""]
  })), [headers, html, values])
  const [fields, setFields] = useState<Record<string, string>>(initial)
  const [pending, setPending] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState("")
  const [spells, setSpells] = useState<SpellOption[]>([])
  const [spellsLoading, setSpellsLoading] = useState(true)
  const [languages, setLanguages] = useState<string[]>([])
  const set = (field: string, value: string) => setFields((current) => ({ ...current, [field]: value }))

  useEffect(() => {
    let alive = true
    fetch("/api/resources/class-index").then((response) => response.json()).then((payload: { data?: { spells?: SpellOption[] } }) => {
      if (alive) setSpells((payload.data?.spells ?? []).filter((spell) => spell.name).sort((left, right) => left.name.localeCompare(right.name, "fr")))
    }).catch(() => undefined).finally(() => { if (alive) setSpellsLoading(false) })
    fetch("/api/resources/world-indexes?key=languages").then((response) => response.json()).then((payload: { data?: { tables?: Array<{ headers: string[]; rows: Array<{ values: string[] }> }> } }) => {
      const table = payload.data?.tables?.[0]
      const nameColumn = table?.headers.findIndex((header) => foldName(header) === "nom") ?? -1
      if (alive && table && nameColumn >= 0) setLanguages(table.rows.map((row) => row.values[nameColumn]).filter(Boolean))
    }).catch(() => undefined)
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

  const field = (name: string, extra: { placeholder?: string; list?: string; type?: string } = {}) => <label key={name} className="grid gap-1 text-xs font-semibold">
    {name}
    <Input value={fields[name] ?? ""} onChange={(event) => set(name, event.target.value)} placeholder={extra.placeholder} list={extra.list} type={extra.type} />
  </label>

  const activeSpells = spells.filter((spell) => spell.category !== "passif")
  const passiveSpells = spells.filter((spell) => spell.category === "passif")

  return <Dialog open={open} onOpenChange={(next) => { if (!next) onClose() }}>
    <DialogContent className="max-h-[92svh] overflow-y-auto sm:max-w-4xl">
      <DialogHeader>
        <DialogTitle className="font-display text-3xl">{fields.Nom || "Nouvelle créature"}</DialogTitle>
        <DialogDescription>Fiche complète de la créature. Les champs absents du tableau sont enregistrés dans la feuille « Index des créatures ».</DialogDescription>
      </DialogHeader>

      <div className="grid gap-6 md:grid-cols-[13rem_minmax(0,1fr)]">
        <section className="grid content-start gap-2">
          <div className="grid aspect-[3/4] place-items-center overflow-hidden rounded-2xl border bg-muted/40">
            {fields.Portrait
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={fields.Portrait} alt={`Portrait de ${fields.Nom || "la créature"}`} className="size-full object-cover" />
              : <ImagePlus className="size-8 text-muted-foreground/60" />}
          </div>
          <label className="inline-flex">
            <input type="file" accept="image/*" className="sr-only" onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file); event.target.value = "" }} />
            <span className="inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm font-medium hover:bg-muted">{uploading ? <LoaderCircle className="size-4 animate-spin" /> : <ImagePlus className="size-4" />}Importer une image</span>
          </label>
          <div className="relative"><Link2 className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" /><Input value={fields.Portrait} onChange={(event) => set("Portrait", event.target.value)} placeholder="…ou coller une URL" className="pl-8 text-xs" /></div>
        </section>

        <div className="grid gap-5">
          <div className="grid gap-3 sm:grid-cols-2">
            {identityFields.map((name) => field(name))}
            <label className="flex items-center gap-2 self-end rounded-lg border bg-background/50 px-3 py-2 text-sm font-semibold">
              <Checkbox checked={isChecked(fields.Dressable)} onCheckedChange={(checked) => set("Dressable", checked === true ? "Oui" : "Non")} />
              Dressable
            </label>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            {field("Langue", { list: "creature-languages", placeholder: "Index des langues" })}
            {field("Taille")}
            {field("Poids")}
            <datalist id="creature-languages">{languages.map((name) => <option key={name} value={name} />)}</datalist>
          </div>

          <section className="grid gap-2">
            <p className="text-xs font-semibold uppercase tracking-[.14em] text-muted-foreground">Caractéristiques</p>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-7">
              {creatureCharacteristics.map((name) => <label key={name} className="grid gap-1 rounded-xl border bg-background/50 p-2 text-center text-[11px] font-semibold">
                {name}
                <Input value={fields[name] ?? ""} onChange={(event) => set(name, event.target.value)} inputMode="numeric" className="h-9 text-center text-base font-semibold" />
              </label>)}
            </div>
          </section>

          {narrativeFields.map((name) => <label key={name} className="grid gap-1 text-xs font-semibold">
            {name}
            <RichTextField value={initial[name] ?? ""} onCommit={(html) => set(name, html)} minHeight="min-h-16" />
          </label>)}

          <SpellPicker label="Sorts actifs" icon={<Zap className="size-3.5" />} value={fields["Sorts actifs"]} options={activeSpells} loading={spellsLoading} onChange={(value) => set("Sorts actifs", value)} />
          <SpellPicker label="Sorts passifs" icon={<Sparkles className="size-3.5" />} value={fields["Sorts passifs"]} options={passiveSpells} loading={spellsLoading} onChange={(value) => set("Sorts passifs", value)} />
        </div>
      </div>

      {error && <p className="rounded-xl border border-destructive/25 bg-destructive/5 px-4 py-2.5 text-sm text-destructive">{error}</p>}
      <div className="flex justify-end gap-2 border-t pt-4">
        <Button type="button" variant="outline" onClick={onClose} disabled={pending}>Annuler</Button>
        <Button type="button" onClick={() => void save()} disabled={pending || uploading}>{pending ? <LoaderCircle className="animate-spin" /> : <Check />}Enregistrer la fiche</Button>
      </div>
    </DialogContent>
  </Dialog>
}
