"use client"

import { useEffect, useState } from "react"
import { Check, ChevronDown, Dices, Download, Folder, ImagePlus, LoaderCircle, MapPinned, Plus, Save, Search, Shield, Sparkles, Star, Trash2, UserRound, UserRoundPlus, X } from "lucide-react"

import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { Progress } from "@/components/ui/progress"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Textarea } from "@/components/ui/textarea"
import { CharacterInventory } from "@/components/eraser/character-inventory"
import type { CampaignNpcRecord, ReusablePageOption } from "@/lib/shop-schema"

const statFields: Array<{ key: keyof CampaignNpcRecord; label: string; short: string }> = [
  { key: "strength", label: "Force", short: "FOR" },
  { key: "dexterity", label: "Dextérité", short: "DEX" },
  { key: "intelligence", label: "Intelligence", short: "INT" },
  { key: "wisdom", label: "Sagesse", short: "SAG" },
  { key: "charisma", label: "Charisme", short: "CHA" },
  { key: "combatAbility", label: "Capacité de combat", short: "COM" },
  { key: "shootingAbility", label: "Capacité de tir", short: "TIR" },
  { key: "magicAbility", label: "Capacité magique", short: "MAG" },
  { key: "mentalStrength", label: "Force mentale", short: "MEN" },
  { key: "constitution", label: "Constitution", short: "CON" },
]

function blankNpc(pageLinked: string): CampaignNpcRecord {
  return {
    id: crypto.randomUUID(), pageLinked, name: "", classOrJob: "", currentHp: 0, totalHp: 0, speed: 0,
    strength: 0, dexterity: 0, intelligence: 0, wisdom: 0, charisma: 0, combatAbility: 0,
    shootingAbility: 0, magicAbility: 0, mentalStrength: 0, constitution: 0, people: "", gender: "", age: "",
    weight: "", height: "", other: "", portrait: "", description: "", inventory: [], inCampaign: false,
    folder: "", inPlayerGroup: false, important: false, createdByUid: "",
    createdAt: "", updatedAt: "",
  }
}

async function persistNpcs(action: "save" | "add-to-campaign" | "remove-from-campaign" | "delete", pageLinked: string, npcs: CampaignNpcRecord[]) {
  const response = await fetch("/api/npcs", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action, pageLinked, npcs }),
  })
  const payload = (await response.json()) as { npcs?: CampaignNpcRecord[]; error?: string }
  if (!response.ok) throw new Error(payload.error || "Enregistrement impossible.")
  return payload.npcs || []
}

async function importNpcs(pageLinked: string, sourcePageLinked: string, npcIds: string[], transferMode: "copy" | "move") {
  const response = await fetch("/api/npcs", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "import", pageLinked, sourcePageLinked, npcIds, transferMode }) })
  const payload = (await response.json()) as { npcs?: CampaignNpcRecord[]; error?: string }
  if (!response.ok) throw new Error(payload.error || "Import impossible.")
  return payload.npcs || []
}

async function uploadNpcPortrait(npcId: string, file: File) {
  const form = new FormData()
  form.append("portrait", file)
  const response = await fetch(`/api/npcs/${encodeURIComponent(npcId)}`, { method: "PATCH", body: form })
  const payload = (await response.json()) as { npc?: CampaignNpcRecord; error?: string }
  if (!response.ok || !payload.npc) throw new Error(payload.error || "Le portrait n’a pas pu être enregistré.")
  return payload.npc
}

function ImportNpcsDialog({ open, sourcePages, pending, onClose, onImport }: { open: boolean; sourcePages: ReusablePageOption[]; pending: boolean; onClose: () => void; onImport: (sourcePageLinked: string, ids: string[], transferMode: "copy" | "move") => void }) {
  const [sourcePageLinked, setSourcePageLinked] = useState(sourcePages[0]?.id || "")
  const [records, setRecords] = useState<CampaignNpcRecord[]>([])
  const [selected, setSelected] = useState<Set<string>>(() => new Set())
  const [query, setQuery] = useState("")
  const [transferMode, setTransferMode] = useState<"copy" | "move">("copy")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  useEffect(() => {
    if (!open || !sourcePageLinked) return
    let active = true
    fetch(`/api/npcs?pageLinked=${encodeURIComponent(sourcePageLinked)}`).then(async (response) => ({ response, payload: (await response.json()) as { npcs?: CampaignNpcRecord[]; error?: string } })).then(({ response, payload }) => {
      if (!active) return
      if (response.ok) setRecords(payload.npcs || [])
      else setError(payload.error || "Chargement impossible.")
    }).catch(() => { if (active) setError("Chargement impossible.") }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [open, sourcePageLinked])
  const filtered = records.filter((npc) => !query.trim() || `${npc.name} ${npc.classOrJob} ${npc.people}`.toLocaleLowerCase("fr").includes(query.trim().toLocaleLowerCase("fr")))
  function toggle(id: string) { setSelected((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next }) }
  return <Dialog open={open} onOpenChange={(next) => { if (!next && !pending) onClose() }}><DialogContent className="sm:max-w-2xl"><DialogHeader><DialogTitle>Récupérer des PNJ</DialogTitle></DialogHeader><div className="space-y-4"><div className="grid gap-3 sm:grid-cols-2"><Label className="grid gap-1.5 text-sm font-medium">Source<NativeSelect value={sourcePageLinked} onChange={(event) => { setLoading(true); setError(""); setSelected(new Set()); setSourcePageLinked(event.target.value) }}>{sourcePages.map((source) => <NativeSelectOption key={source.id} value={source.id}>{source.name}</NativeSelectOption>)}</NativeSelect></Label><Label className="grid gap-1.5 text-sm font-medium">Action<NativeSelect value={transferMode} onChange={(event) => setTransferMode(event.target.value as "copy" | "move")}><NativeSelectOption value="copy">Copier — garder l’original</NativeSelectOption><NativeSelectOption value="move">Déplacer — retirer de la source</NativeSelectOption></NativeSelect></Label></div><div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={query} onChange={(event) => setQuery(event.target.value)} className="pl-9" placeholder="Rechercher un PNJ…" /></div>{error && <p className="text-sm text-destructive">{error}</p>}<div className="max-h-80 space-y-1 overflow-y-auto rounded-xl border p-2">{loading ? <div className="grid min-h-28 place-items-center"><LoaderCircle className="animate-spin text-muted-foreground" /></div> : filtered.length ? filtered.map((npc) => <button key={npc.id} type="button" onClick={() => toggle(npc.id)} className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left hover:bg-accent ${selected.has(npc.id) ? "bg-primary/10" : ""}`}><Checkbox checked={selected.has(npc.id)} aria-label={`Sélectionner ${npc.name}`} /><UserRound className="size-4 text-primary" /><span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{npc.name}</span><span className="block truncate text-xs text-muted-foreground">{[npc.classOrJob, npc.people].filter(Boolean).join(" · ")}</span></span></button>) : <p className="px-3 py-8 text-center text-sm text-muted-foreground">Aucun PNJ dans cette source.</p>}</div><div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onClose}>Annuler</Button><Button type="button" disabled={pending || !selected.size} onClick={() => onImport(sourcePageLinked, [...selected], transferMode)}>{pending ? <LoaderCircle className="animate-spin" /> : <Download />}{transferMode === "move" ? "Déplacer" : "Copier"} {selected.size || ""}</Button></div></div></DialogContent></Dialog>
}

function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return <Label className="grid gap-1.5 text-xs font-semibold text-muted-foreground">{label}<Input type="number" min={0} max={99999} value={value} onChange={(event) => onChange(Math.max(0, Number.parseInt(event.target.value || "0", 10)))} className="h-10 bg-background/75 text-foreground" /></Label>
}

function randomBetween(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function randomChoice<T>(values: readonly T[]) {
  return values[Math.floor(Math.random() * values.length)]
}

const randomNpcNames = ["Aelis Varne", "Basile Orme", "Cassian Veyr", "Dahlia Sorne", "Eden Varel", "Faël Brume", "Gaïa Néris", "Ilyan Corbe", "Jade Solven", "Kaël Dorne", "Lysandre Morn", "Maé Terval", "Nour Silex", "Orphée Valme", "Sacha Ronce", "Tess Auber"] as const
const randomNpcJobs = ["Alchimiste itinérant", "Archiviste", "Chasseur de primes", "Éclaireur", "Forgeron", "Guérisseur", "Herboriste", "Marchand ambulant", "Mercenaire", "Messager", "Prêtre errant", "Tavernier"] as const
const randomNpcPeoples = ["Humain", "Elfe", "Nain", "Demi-elfe", "Orc", "Tieffelin", "Peuple inconnu"] as const
const randomNpcGenders = ["Femme", "Homme", "Non-binaire"] as const
const randomNpcTraits = ["calme mais constamment sur ses gardes", "chaleureux et beaucoup trop curieux", "sec, précis et difficile à impressionner", "souriant malgré une fatigue visible", "réservé, avec une mémoire redoutable", "franc et incapable de cacher son impatience"] as const
const randomNpcMotivations = ["cherche quelqu’un disparu depuis plusieurs mois", "essaie de rembourser une dette dangereuse", "protège un secret lié à son ancien métier", "veut quitter la région sans attirer l’attention", "rassemble des informations sur une menace locale", "cherche une occasion de prouver sa valeur"] as const

function randomNpc(pageLinked: string) {
  const npc = blankNpc(pageLinked)
  const totalHp = randomBetween(45, 120)
  return {
    ...npc,
    name: randomChoice(randomNpcNames),
    classOrJob: randomChoice(randomNpcJobs),
    people: randomChoice(randomNpcPeoples),
    gender: randomChoice(randomNpcGenders),
    age: String(randomBetween(18, 82)),
    weight: `${randomBetween(48, 125)} kg`,
    height: `${(randomBetween(148, 202) / 100).toFixed(2).replace(".", ",")} m`,
    currentHp: totalHp,
    totalHp,
    speed: randomBetween(8, 22),
    strength: randomBetween(25, 80),
    dexterity: randomBetween(25, 80),
    intelligence: randomBetween(25, 80),
    wisdom: randomBetween(25, 80),
    charisma: randomBetween(25, 80),
    combatAbility: randomBetween(15, 75),
    shootingAbility: randomBetween(15, 75),
    magicAbility: randomBetween(10, 75),
    mentalStrength: randomBetween(25, 80),
    constitution: randomBetween(25, 80),
    description: `Attitude : ${randomChoice(randomNpcTraits)}.`,
    other: `Motivation : ${randomChoice(randomNpcMotivations)}.`,
  }
}

function RandomTextField({ label, value, placeholder, onChange, onRandom }: { label: string; value: string; placeholder?: string; onChange: (value: string) => void; onRandom: () => void }) {
  return <Label className="grid gap-1.5 text-xs font-semibold text-muted-foreground"><span className="flex items-center justify-between gap-2">{label}<button type="button" onClick={onRandom} className="flex size-6 items-center justify-center rounded-md text-primary hover:bg-primary/10" aria-label={`Tirer ${label.toLocaleLowerCase("fr")} aléatoirement`} title={`Tirer ${label.toLocaleLowerCase("fr")} aléatoirement`}><Dices className="size-3.5" /></button></span><Input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="bg-background/75 text-foreground" /></Label>
}

function NpcForm({ npc, pending, onClose, onSave }: { npc: CampaignNpcRecord | null; pending: boolean; onClose: () => void; onSave: (npc: CampaignNpcRecord, portrait?: File) => void }) {
  const [draft, setDraft] = useState<CampaignNpcRecord | null>(npc)
  const [portraitFile, setPortraitFile] = useState<File | undefined>()
  const [portraitPreview, setPortraitPreview] = useState("")
  if (!draft) return null

  function update<K extends keyof CampaignNpcRecord>(key: K, value: CampaignNpcRecord[K]) {
    setDraft((current) => current ? { ...current, [key]: value } : current)
  }
  function choosePortrait(file?: File) {
    if (!file) return
    setPortraitFile(file)
    const reader = new FileReader()
    reader.onload = () => setPortraitPreview(typeof reader.result === "string" ? reader.result : "")
    reader.readAsDataURL(file)
  }

  return <div className="space-y-6">
    <section className="grid gap-4 lg:grid-cols-[13rem_minmax(0,1fr)]">
      <div className="space-y-3">
        <label className="group relative block aspect-[4/5] cursor-pointer overflow-hidden rounded-2xl border bg-muted/40">
          {portraitPreview || draft.portrait ? <img src={portraitPreview || draft.portrait} alt={`Portrait de ${draft.name || "ce PNJ"}`} className="size-full object-cover" /> : <div className="grid size-full place-items-center"><UserRound className="size-16 text-primary/25" /></div>}
          <span className="absolute inset-x-3 bottom-3 flex items-center justify-center gap-2 rounded-lg bg-black/65 px-3 py-2 text-xs text-white opacity-0 backdrop-blur transition group-hover:opacity-100"><ImagePlus className="size-4" />Importer</span>
          <input type="file" accept="image/*" className="sr-only" onChange={(event) => choosePortrait(event.target.files?.[0])} />
        </label>
        <Label className="grid gap-1.5 text-xs font-semibold text-muted-foreground">Portrait (URL)<Input type="url" value={draft.portrait} onChange={(event) => update("portrait", event.target.value)} placeholder="https://…" className="bg-background/75 text-foreground" /></Label>
      </div>
      <div className="grid content-start gap-4 sm:grid-cols-2">
        <Label className="grid gap-1.5 text-xs font-semibold text-muted-foreground">Nom du PNJ<Input required value={draft.name} onChange={(event) => update("name", event.target.value)} className="bg-background/75 text-foreground" /></Label>
        <Label className="grid gap-1.5 text-xs font-semibold text-muted-foreground">Classe / métier<Input value={draft.classOrJob} onChange={(event) => update("classOrJob", event.target.value)} className="bg-background/75 text-foreground" /></Label>
        <Label className="grid gap-1.5 text-xs font-semibold text-muted-foreground">Peuple<Input value={draft.people} onChange={(event) => update("people", event.target.value)} className="bg-background/75 text-foreground" /></Label>
        <Label className="grid gap-1.5 text-xs font-semibold text-muted-foreground">Genre<Input value={draft.gender} onChange={(event) => update("gender", event.target.value)} className="bg-background/75 text-foreground" /></Label>
        <Label className="grid gap-1.5 text-xs font-semibold text-muted-foreground sm:col-span-2">Dossier (facultatif)<Input value={draft.folder} onChange={(event) => update("folder", event.target.value)} placeholder="Ex. Alliés, Rivaux, Ville basse…" className="bg-background/75 text-foreground" /></Label>
        <RandomTextField label="Âge" value={draft.age} onChange={(value) => update("age", value)} onRandom={() => update("age", String(randomBetween(16, 90)))} />
        <RandomTextField label="Poids" value={draft.weight} placeholder="Ex. 72 kg" onChange={(value) => update("weight", value)} onRandom={() => update("weight", `${randomBetween(45, 140)} kg`)} />
        <RandomTextField label="Taille" value={draft.height} placeholder="Ex. 1,78 m" onChange={(value) => update("height", value)} onRandom={() => update("height", `${(randomBetween(140, 210) / 100).toFixed(2).replace(".", ",")} m`)} />
        <div className="grid grid-cols-3 gap-3 sm:col-span-2">
          <NumberField label="Vie actuelle" value={draft.currentHp} onChange={(value) => update("currentHp", value)} />
          <NumberField label="Vie totale" value={draft.totalHp} onChange={(value) => update("totalHp", value)} />
          <NumberField label="Rapidité" value={draft.speed} onChange={(value) => update("speed", value)} />
        </div>
        <Label className="grid gap-1.5 text-xs font-semibold text-muted-foreground sm:col-span-2">Description<Textarea value={draft.description} onChange={(event) => update("description", event.target.value)} className="min-h-24 bg-background/75 text-foreground" /></Label>
        <Label className="grid gap-1.5 text-xs font-semibold text-muted-foreground sm:col-span-2">Autre<Textarea value={draft.other} onChange={(event) => update("other", event.target.value)} className="min-h-20 bg-background/75 text-foreground" /></Label>
        {draft.pageLinked !== "bac-a-sable" && <label className="flex items-center gap-2 text-sm sm:col-span-2"><Checkbox checked={draft.inCampaign} onCheckedChange={(checked) => update("inCampaign", checked === true)} />Ajouter aussi au créateur de session</label>}
      </div>
    </section>

    <section className="rounded-2xl border bg-primary/[0.035] p-4">
      <div className="mb-3 flex items-center gap-2"><Shield className="size-4 text-primary" /><h3 className="font-display text-lg font-semibold">Caractéristiques</h3></div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">{statFields.map((field) => <NumberField key={field.key} label={field.label} value={draft[field.key] as number} onChange={(value) => update(field.key, value)} />)}</div>
    </section>

    <section className="rounded-2xl border p-4"><div className="mb-4"><h3 className="font-display text-lg font-semibold">Inventaire</h3><p className="text-xs text-muted-foreground">Les objets viennent directement de tes index.</p></div>{draft.createdAt ? <CharacterInventory characterId={draft.id} endpoint={`/api/npcs/${encodeURIComponent(draft.id)}/inventory`} /> : <p className="rounded-xl border border-dashed px-4 py-7 text-center text-sm text-muted-foreground">Sauvegarde d’abord le PNJ, puis rouvre sa fiche pour ajouter des objets depuis les index.</p>}</section>

    <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onClose}>Annuler</Button><Button type="button" disabled={pending || !draft.name.trim()} onClick={() => onSave({ ...draft, name: draft.name.trim() }, portraitFile)}>{pending ? <LoaderCircle className="animate-spin" /> : <Save />}Sauvegarder</Button></div>
  </div>
}

function InlineNpcText({ label, value, multiline = false, onCommit }: { label: string; value: string; multiline?: boolean; onCommit: (value: string) => Promise<void> }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  async function save() { await onCommit(draft.trim()); setEditing(false) }
  if (!editing) return <button type="button" onDoubleClick={() => { setDraft(value); setEditing(true) }} className="min-w-0 max-w-full text-left" title={`Double-cliquer pour modifier ${label}`}>{value || <span className="text-muted-foreground/45">Non renseigné</span>}</button>
  return <div className="flex min-w-0 items-start gap-1">{multiline ? <Textarea autoFocus value={draft} onChange={(event) => setDraft(event.target.value)} className="min-h-20" /> : <Input autoFocus value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void save(); if (event.key === "Escape") setEditing(false) }} className="h-8" />}<button type="button" onClick={() => void save()} className="flex size-8 shrink-0 items-center justify-center rounded-md text-primary hover:bg-primary/10" aria-label={`Enregistrer ${label}`}><Check className="size-3.5" /></button><button type="button" onClick={() => setEditing(false)} className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted" aria-label="Annuler"><X className="size-3.5" /></button></div>
}

function InlineNpcNumber({ label, value, onCommit }: { label: string; value: number; onCommit: (value: number) => Promise<void> }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(String(value))
  async function save() { await onCommit(Math.max(0, Number.parseInt(draft || "0", 10))); setEditing(false) }
  if (!editing) return <button type="button" onClick={() => { setDraft(String(value)); setEditing(true) }} className="font-display font-semibold tabular-nums" title={`Cliquer pour modifier ${label}`}>{value}</button>
  return <span className="inline-flex items-center gap-1"><Input autoFocus type="number" min={0} value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void save(); if (event.key === "Escape") setEditing(false) }} className="h-8 w-20 px-2" /><button type="button" onClick={() => void save()} className="text-primary"><Check className="size-3.5" /></button></span>
}

function NpcCard({ npc, mode, pending, folders, onPatch, onPortrait, onDelete }: { npc: CampaignNpcRecord; mode: "manage" | "locations"; pending: boolean; folders: string[]; onPatch: (patch: Partial<CampaignNpcRecord>) => Promise<void>; onPortrait: (file: File) => Promise<void>; onDelete: () => void }) {
  const [open, setOpen] = useState(false)
  const [folderDraft, setFolderDraft] = useState(npc.folder)
  const hpPercent = npc.totalHp > 0 ? Math.min(100, Math.round((npc.currentHp / npc.totalHp) * 100)) : 0
  return <article className="deferred-section overflow-hidden rounded-2xl border bg-card/90 shadow-sm">
    <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] sm:grid-cols-[8rem_minmax(0,1fr)]">
      <label className="group relative min-h-40 cursor-pointer border-r bg-muted/35">{npc.portrait ? <img src={npc.portrait} alt={`Portrait de ${npc.name}`} loading="lazy" decoding="async" className="size-full object-cover" /> : <div className="grid size-full place-items-center"><UserRound className="size-12 text-primary/25" /></div>}<span className="absolute inset-x-2 bottom-2 flex items-center justify-center gap-1 rounded-md bg-black/65 px-2 py-1 text-[10px] text-white opacity-0 transition group-hover:opacity-100"><ImagePlus className="size-3" />Changer</span><input type="file" accept="image/*" className="sr-only" onChange={(event) => { const file = event.target.files?.[0]; if (file) void onPortrait(file) }} /></label>
      <div className="min-w-0 p-4">
        <div className="flex items-start gap-2"><div className="min-w-0 flex-1"><h2 className="font-display text-xl font-semibold"><InlineNpcText label="le nom" value={npc.name} onCommit={(name) => onPatch({ name })} /></h2><p className="mt-0.5 truncate text-xs text-muted-foreground"><InlineNpcText label="la classe ou le métier" value={npc.classOrJob} onCommit={(classOrJob) => onPatch({ classOrJob })} />{npc.people ? ` · ${npc.people}` : ""}{npc.gender ? ` · ${npc.gender}` : ""}</p></div>{npc.important && <Star className="size-4 shrink-0 fill-amber-400 text-amber-500" />}</div>
        <div className="mt-4 grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3"><div><div className="mb-1 flex justify-between text-[11px]"><span className="font-semibold text-muted-foreground">Vie</span><span className="flex items-center gap-1 font-bold"><InlineNpcNumber label="la vie actuelle" value={npc.currentHp} onCommit={(currentHp) => onPatch({ currentHp })} /><span>/</span><InlineNpcNumber label="la vie totale" value={npc.totalHp} onCommit={(totalHp) => onPatch({ totalHp })} /></span></div><Progress value={hpPercent} className="h-2" /></div><Badge variant="outline">Rapidité <InlineNpcNumber label="la rapidité" value={npc.speed} onCommit={(speed) => onPatch({ speed })} /></Badge></div>
        <div className="mt-4 flex flex-wrap gap-1.5">
          <Button size="icon-xs" variant={npc.inPlayerGroup ? "default" : "outline"} disabled={pending} onClick={() => void onPatch({ inPlayerGroup: !npc.inPlayerGroup })} aria-label={npc.inPlayerGroup ? "Retirer du groupe joueur" : "Ajouter au groupe joueur"} title={npc.inPlayerGroup ? "Retirer du groupe joueur" : "Ajouter au groupe joueur"}><UserRoundPlus /></Button>
          <Button size="icon-xs" variant={npc.important ? "default" : "outline"} disabled={pending} onClick={() => void onPatch({ important: !npc.important })} aria-label="PNJ important" title="PNJ important"><Star className={npc.important ? "fill-current" : ""} /></Button>
          {npc.pageLinked !== "bac-a-sable" && <Button size="icon-xs" variant={npc.inCampaign ? "default" : "outline"} disabled={pending} onClick={() => void onPatch({ inCampaign: !npc.inCampaign })} aria-label={npc.inCampaign ? "Retirer du créateur de session" : "Ajouter au créateur de session"} title={npc.inCampaign ? "Retirer du créateur de session" : "Ajouter au créateur de session"}><MapPinned /></Button>}
          {mode === "manage" && <Popover><PopoverTrigger asChild><Button size="icon-xs" variant={npc.folder ? "secondary" : "outline"} disabled={pending} aria-label="Ranger dans un dossier" title={npc.folder || "Ranger dans un dossier"}><Folder /></Button></PopoverTrigger><PopoverContent align="start" className="w-72 p-3"><Label className="grid gap-1.5 text-xs font-medium">Dossier<Input value={folderDraft} onChange={(event) => setFolderDraft(event.target.value)} list={`npc-folders-${npc.id}`} placeholder="Sans dossier" autoFocus /></Label><datalist id={`npc-folders-${npc.id}`}>{folders.map((folder) => <option key={folder} value={folder} />)}</datalist><div className="mt-2 flex justify-end gap-2"><Button size="sm" variant="ghost" onClick={() => { setFolderDraft(""); void onPatch({ folder: "" }) }}>Retirer</Button><Button size="sm" onClick={() => void onPatch({ folder: folderDraft.trim() })}><Check />Ranger</Button></div></PopoverContent></Popover>}
          {mode === "manage" && <Button size="icon-xs" variant="ghost" className="text-destructive hover:bg-destructive/10 hover:text-destructive" disabled={pending} onClick={onDelete} aria-label="Supprimer" title="Supprimer"><Trash2 /></Button>}
        </div>
      </div>
    </div>
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild><Button type="button" variant="ghost" className="h-10 w-full justify-between rounded-none border-t px-4 text-xs"><span>Détails, caractéristiques et inventaire</span><ChevronDown className={`transition-transform ${open ? "rotate-180" : ""}`} /></Button></CollapsibleTrigger>
      <CollapsibleContent className="border-t bg-muted/15 p-4">
        <div className="mb-4 grid gap-3 text-sm sm:grid-cols-2"><div><p className="text-xs font-semibold uppercase tracking-wide text-primary/70">Description</p><div className="mt-1 whitespace-pre-wrap text-muted-foreground"><InlineNpcText multiline label="la description" value={npc.description} onCommit={(description) => onPatch({ description })} /></div></div><div><p className="text-xs font-semibold uppercase tracking-wide text-primary/70">Autre</p><div className="mt-1 whitespace-pre-wrap text-muted-foreground"><InlineNpcText multiline label="les informations complémentaires" value={npc.other} onCommit={(other) => onPatch({ other })} /></div></div></div>
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-5">{statFields.map((field) => <div key={field.key} title={field.label} className="rounded-lg border bg-background/65 px-2 py-2 text-center"><p className="text-[9px] font-bold text-muted-foreground">{field.short}</p><InlineNpcNumber label={field.label} value={npc[field.key] as number} onCommit={(value) => onPatch({ [field.key]: value })} /></div>)}</div>
        <div className="mt-4 grid gap-3 text-xs text-muted-foreground sm:grid-cols-3">{([{ key: "age", label: "Âge" }, { key: "height", label: "Taille" }, { key: "weight", label: "Poids" }, { key: "people", label: "Peuple" }, { key: "gender", label: "Genre" }] as const).map((field) => <div key={field.key}><span className="font-semibold">{field.label} : </span><InlineNpcText label={field.label} value={npc[field.key]} onCommit={(value) => onPatch({ [field.key]: value })} /></div>)}</div>
        {open && <section className="mt-5 border-t pt-5"><p className="mb-4 text-xs font-semibold uppercase tracking-wide text-primary/70">Inventaire</p><CharacterInventory characterId={npc.id} endpoint={`/api/npcs/${encodeURIComponent(npc.id)}/inventory`} /></section>}
      </CollapsibleContent>
    </Collapsible>
  </article>
}

export function NpcManager({ initialNpcs, pageLinked, sourcePages = [], mode = "manage" }: { initialNpcs: CampaignNpcRecord[]; pageLinked: string; sourcePages?: ReusablePageOption[]; mode?: "manage" | "locations" }) {
  const [npcs, setNpcs] = useState(initialNpcs)
  const [editing, setEditing] = useState<CampaignNpcRecord | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<CampaignNpcRecord | null>(null)
  const [pending, setPending] = useState(false)
  const [notice, setNotice] = useState("")
  const [error, setError] = useState("")
  const [importOpen, setImportOpen] = useState(false)
  const folders = [...new Set(npcs.map((npc) => npc.folder.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, "fr"))

  async function save(npc: CampaignNpcRecord, portrait?: File) {
    setPending(true); setError(""); setNotice("")
    try {
      const [stored] = await persistNpcs("save", pageLinked, [npc])
      const saved = stored && portrait ? await uploadNpcPortrait(stored.id, portrait) : stored
      if (saved) setNpcs((current) => mode === "locations" && !saved.inCampaign ? current.filter((item) => item.id !== saved.id) : current.some((item) => item.id === saved.id) ? current.map((item) => item.id === saved.id ? saved : item) : [...current, saved])
      setEditing(null); setNotice("PNJ sauvegardé dans Google Sheets.")
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Sauvegarde impossible.") }
    setPending(false)
  }
  async function runImport(sourcePageLinked: string, ids: string[], transferMode: "copy" | "move") {
    setPending(true); setError(""); setNotice("")
    try {
      const imported = await importNpcs(pageLinked, sourcePageLinked, ids, transferMode)
      setNpcs((current) => [...current, ...imported]); setImportOpen(false)
      setNotice(`${imported.length} PNJ${imported.length > 1 ? "s" : ""} ${transferMode === "move" ? `déplacé${imported.length > 1 ? "s" : ""}` : `copié${imported.length > 1 ? "s" : ""}`}.`)
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Import impossible.") }
    setPending(false)
  }
  async function remove(npc: CampaignNpcRecord) {
    setPending(true); setError(""); setNotice("")
    try {
      await persistNpcs("delete", pageLinked, [npc])
      setNpcs((current) => current.filter((item) => item.id !== npc.id)); setNotice("PNJ supprimé.")
      setDeleteTarget(null)
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Suppression impossible.") }
    setPending(false)
  }

  async function patchNpc(npc: CampaignNpcRecord, patch: Partial<CampaignNpcRecord>) {
    await save({ ...npc, ...patch })
  }

  async function changePortrait(npc: CampaignNpcRecord, file: File) {
    setPending(true); setError(""); setNotice("")
    try {
      const saved = await uploadNpcPortrait(npc.id, file)
      setNpcs((current) => current.map((item) => item.id === saved.id ? saved : item))
      setNotice("Portrait mis à jour.")
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Le portrait n’a pas pu être enregistré.") }
    setPending(false)
  }

  const sortedNpcs = [...npcs].sort((a, b) => Number(b.important) - Number(a.important) || a.name.localeCompare(b.name, "fr"))
  const folderGroups = folders.length ? [
    { name: "", records: sortedNpcs.filter((npc) => !npc.folder.trim()) },
    ...folders.map((folder) => ({ name: folder, records: sortedNpcs.filter((npc) => npc.folder.trim() === folder) })),
  ].filter((group) => group.records.length) : [{ name: "", records: sortedNpcs }]

  return <div className="mt-7 space-y-5">
    {mode === "manage" && <div className="flex flex-wrap items-center gap-2 rounded-2xl border bg-card/70 p-3"><Button onClick={() => setEditing(blankNpc(pageLinked))}><Plus />Créer un PNJ</Button><Button variant="outline" onClick={() => setEditing(randomNpc(pageLinked))}><Dices />Générer un PNJ</Button>{sourcePages.length > 0 && <Button variant="outline" disabled={pending} onClick={() => setImportOpen(true)}><Download />Récupérer des PNJ</Button>}<span className="ml-auto text-xs text-muted-foreground">{npcs.length} PNJ{npcs.length > 1 ? "s" : ""}{pageLinked !== "bac-a-sable" ? " · liés à la campagne" : ""}</span></div>}
    {error && <p className="rounded-xl border border-destructive/25 bg-destructive/5 px-4 py-3 text-sm text-destructive">{error}</p>}
    {notice && <p className="rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm text-primary">{notice}</p>}
    {npcs.length ? <div className="space-y-7">{folderGroups.map((group) => <section key={group.name || "sans-dossier"}>{group.name && <div className="mb-3 flex items-center gap-2"><Folder className="size-4 text-primary" /><h2 className="font-display text-xl font-semibold">{group.name}</h2><span className="text-xs text-muted-foreground">{group.records.length}</span></div>}<div className="grid gap-4 xl:grid-cols-2">{group.records.map((npc) => <NpcCard key={npc.id} npc={npc} mode={mode} pending={pending} folders={folders} onPatch={(patch) => patchNpc(npc, patch)} onPortrait={(file) => changePortrait(npc, file)} onDelete={() => setDeleteTarget(npc)} />)}</div></section>)}</div> : <div className="grid min-h-52 place-items-center rounded-2xl border border-dashed bg-card/35 p-8 text-center"><div><Sparkles className="mx-auto size-9 text-primary/40" /><p className="font-display mt-3 text-xl font-semibold">Aucun PNJ</p>{mode === "manage" && <Button className="mt-4" variant="outline" onClick={() => setEditing(blankNpc(pageLinked))}><Plus />Créer le premier PNJ</Button>}</div></div>}
    <Dialog open={Boolean(editing)} onOpenChange={(open) => { if (!open && !pending) setEditing(null) }}><DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-5xl"><DialogHeader><DialogTitle>Créer un PNJ</DialogTitle></DialogHeader><NpcForm key={editing?.id || "none"} npc={editing} pending={pending} onClose={() => setEditing(null)} onSave={(npc, portrait) => void save(npc, portrait)} /></DialogContent></Dialog>
    {importOpen && <ImportNpcsDialog open sourcePages={sourcePages} pending={pending} onClose={() => setImportOpen(false)} onImport={(source, ids, transferMode) => void runImport(source, ids, transferMode)} />}
    <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(open) => { if (!open && !pending) setDeleteTarget(null) }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Supprimer ce PNJ ?</AlertDialogTitle><AlertDialogDescription>{deleteTarget ? `${deleteTarget.name} sera définitivement supprimé de la feuille PNJs.` : "Cette action est définitive."}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={pending}>Annuler</AlertDialogCancel><AlertDialogAction variant="destructive" disabled={pending} onClick={() => deleteTarget && void remove(deleteTarget)}>{pending ? <LoaderCircle className="animate-spin" /> : <Trash2 />}Supprimer</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </div>
}
