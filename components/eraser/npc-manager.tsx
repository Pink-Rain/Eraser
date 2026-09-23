"use client"

import { useEffect, useState } from "react"
import { ChevronDown, Dices, Download, ImagePlus, LoaderCircle, MapPinned, Pencil, Plus, Save, Search, Shield, Trash2, UserRound } from "lucide-react"

import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { RichTextField } from "@/components/eraser/rich-text"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { Progress } from "@/components/ui/progress"
import { CharacterInventory } from "@/components/eraser/character-inventory"
import { CharacteristicBadges, CharacteristicInputs } from "@/components/eraser/characteristic-fields"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { npcCharacteristicKeys, npcCharacteristics, type CharacteristicName } from "@/lib/characteristics"
import { npcBelongsToCampaign } from "@/lib/npc-pages"
import type { CampaignNpcRecord, ReusablePageOption } from "@/lib/shop-schema"

export function blankNpc(pageLinked: string): CampaignNpcRecord {
  return {
    id: crypto.randomUUID(), pageLinked, name: "", title: "", occupation: "", people: "", portrait: "", currentHp: 0, totalHp: 0, speed: 0,
    constitution: 0, strength: 0, dexterity: 0, intelligence: 0, wisdom: 0, charisma: 0,
    playerNotes: "", gmNotes: "", inCampaign: false, important: false, createdByUid: "", createdAt: "", updatedAt: "",
  }
}

function randomBetween(min: number, max: number) { return Math.floor(Math.random() * (max - min + 1)) + min }
const randomNpcNames = ["Aelis Varne", "Basile Orme", "Cassian Veyr", "Dahlia Sorne", "Eden Varel", "Faël Brume", "Gaïa Néris", "Ilyan Corbe", "Jade Solven", "Kaël Dorne", "Lysandre Morn", "Maé Terval", "Nour Silex", "Orphée Valme", "Sacha Ronce", "Tess Auber"] as const

function randomNpc(pageLinked: string): CampaignNpcRecord {
  const totalHp = randomBetween(45, 120)
  return {
    ...blankNpc(pageLinked), name: randomNpcNames[randomBetween(0, randomNpcNames.length - 1)], currentHp: totalHp, totalHp, speed: randomBetween(8, 20),
    constitution: randomBetween(25, 80), strength: randomBetween(25, 80), dexterity: randomBetween(25, 80),
    intelligence: randomBetween(25, 80), wisdom: randomBetween(25, 80), charisma: randomBetween(25, 80),
  }
}

export async function persistNpcs(action: "save" | "add-to-campaign" | "remove-from-campaign" | "delete", pageLinked: string, npcs: CampaignNpcRecord[]) {
  const response = await fetch("/api/npcs", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, pageLinked, npcs }) })
  const payload = (await response.json()) as { npcs?: CampaignNpcRecord[]; error?: string }
  if (!response.ok) throw new Error(payload.error || "Enregistrement impossible.")
  return payload.npcs || []
}

export async function importNpcs(pageLinked: string, sourcePageLinked: string, npcIds: string[], transferMode: "copy" | "move") {
  const response = await fetch("/api/npcs", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "import", pageLinked, sourcePageLinked, npcIds, transferMode }) })
  const payload = (await response.json()) as { npcs?: CampaignNpcRecord[]; error?: string }
  if (!response.ok) throw new Error(payload.error || "Import impossible.")
  return payload.npcs || []
}

export async function uploadNpcPortrait(npcId: string, file: File) {
  const form = new FormData(); form.append("portrait", file)
  const response = await fetch(`/api/npcs/${encodeURIComponent(npcId)}`, { method: "PATCH", body: form })
  const payload = (await response.json()) as { npc?: CampaignNpcRecord; error?: string }
  if (!response.ok || !payload.npc) throw new Error(payload.error || "Le portrait n’a pas pu être enregistré.")
  return payload.npc
}

function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return <Label className="grid gap-1.5 text-xs font-semibold text-muted-foreground">{label}<Input type="number" min={0} max={99999} value={value} onChange={(event) => onChange(Math.max(0, Number.parseInt(event.target.value || "0", 10)))} className="h-10 bg-background/75 text-foreground" /></Label>
}

export function ImportNpcsDialog({ open, sourcePages, pending, onClose, onImport }: { open: boolean; sourcePages: ReusablePageOption[]; pending: boolean; onClose: () => void; onImport: (sourcePageLinked: string, ids: string[], transferMode: "copy" | "move") => void }) {
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
      if (response.ok) setRecords(payload.npcs || []); else setError(payload.error || "Chargement impossible.")
    }).catch(() => { if (active) setError("Chargement impossible.") }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [open, sourcePageLinked])
  const normalizedQuery = query.trim().toLocaleLowerCase("fr")
  const filtered = records.filter((npc) => !normalizedQuery || `${npc.name} ${npc.playerNotes} ${npc.gmNotes}`.toLocaleLowerCase("fr").includes(normalizedQuery))
  function toggle(id: string) { setSelected((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next }) }
  return <Dialog open={open} onOpenChange={(next) => { if (!next && !pending) onClose() }}><DialogContent className="sm:max-w-2xl"><DialogHeader><DialogTitle>Récupérer des PNJ</DialogTitle></DialogHeader><div className="space-y-4"><div className="grid gap-3 sm:grid-cols-2"><Label className="grid gap-1.5 text-sm font-medium">Source<NativeSelect value={sourcePageLinked} onChange={(event) => { setLoading(true); setError(""); setSelected(new Set()); setSourcePageLinked(event.target.value) }}>{sourcePages.map((source) => <NativeSelectOption key={source.id} value={source.id}>{source.name}</NativeSelectOption>)}</NativeSelect></Label><Label className="grid gap-1.5 text-sm font-medium">Action<NativeSelect value={transferMode} onChange={(event) => setTransferMode(event.target.value as "copy" | "move")}><NativeSelectOption value="copy">Copier — garder l’original</NativeSelectOption><NativeSelectOption value="move">Déplacer — retirer de la source</NativeSelectOption></NativeSelect></Label></div><div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={query} onChange={(event) => setQuery(event.target.value)} className="pl-9" placeholder="Rechercher un PNJ…" /></div>{error && <p className="text-sm text-destructive">{error}</p>}<div className="max-h-80 space-y-1 overflow-y-auto rounded-xl border p-2">{loading ? <div className="grid min-h-28 place-items-center"><LoaderCircle className="animate-spin text-muted-foreground" /></div> : filtered.length ? filtered.map((npc) => <button key={npc.id} type="button" onClick={() => toggle(npc.id)} className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left hover:bg-accent ${selected.has(npc.id) ? "bg-primary/10" : ""}`}><Checkbox checked={selected.has(npc.id)} aria-label={`Sélectionner ${npc.name}`} /><UserRound className="size-4 text-primary" /><span className="min-w-0 flex-1 truncate text-sm font-medium">{npc.name}</span></button>) : <p className="px-3 py-8 text-center text-sm text-muted-foreground">Aucun PNJ dans cette source.</p>}</div><div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onClose}>Annuler</Button><Button type="button" disabled={pending || !selected.size} onClick={() => onImport(sourcePageLinked, [...selected], transferMode)}>{pending ? <LoaderCircle className="animate-spin" /> : <Download />}{transferMode === "move" ? "Déplacer" : "Copier"} {selected.size || ""}</Button></div></div></DialogContent></Dialog>
}

/** Les noms de l'Index des peuples, chargés une fois pour toutes les fiches ouvertes. */
let peopleNames: Promise<string[]> | null = null

function loadPeopleNames() {
  peopleNames ||= fetch("/api/resources/world-indexes?key=peoples")
    .then((response) => response.json())
    .then((payload: { data?: { tables?: Array<{ headers: string[]; rows: Array<{ values: string[] }> }> } }) => {
      const table = payload.data?.tables?.[0]
      const column = table?.headers.findIndex((header) => header.trim().toLowerCase() === "nom") ?? -1
      return table && column >= 0 ? [...new Set(table.rows.map((row) => row.values[column].trim()).filter(Boolean))].sort((left, right) => left.localeCompare(right, "fr")) : []
    })
    .catch(() => { peopleNames = null; return [] })
  return peopleNames
}

const NO_PEOPLE = "__aucun__"

/**
 * Le peuple d'un PNJ, choisi dans l'Index des peuples. Une valeur déjà écrite qui n'y
 * figure pas (« Haut-homme ») reste proposée : rien n'est effacé en ouvrant la fiche.
 */
export function PeopleSelect({ value, onChange, compact = false, disabled = false }: { value: string; onChange: (value: string) => void; compact?: boolean; disabled?: boolean }) {
  const [names, setNames] = useState<string[] | null>(null)
  useEffect(() => {
    let alive = true
    void loadPeopleNames().then((loaded) => { if (alive) setNames(loaded) })
    return () => { alive = false }
  }, [])
  const current = value.trim()
  const options = names ?? []
  const legacy = current && !options.some((name) => name.toLocaleLowerCase("fr") === current.toLocaleLowerCase("fr")) ? current : ""
  const selected = options.find((name) => name.toLocaleLowerCase("fr") === current.toLocaleLowerCase("fr")) ?? current
  return <Select value={selected || NO_PEOPLE} onValueChange={(next) => onChange(next === NO_PEOPLE ? "" : next)} disabled={disabled}>
    <SelectTrigger size="sm" aria-label="Peuple" className={compact ? "h-8 w-full border-transparent bg-transparent px-2 shadow-none hover:border-input dark:bg-transparent" : "h-10 w-full bg-background/75"}><SelectValue placeholder="—" /></SelectTrigger>
    <SelectContent position="popper" className="max-h-72">
      <SelectItem value={NO_PEOPLE} className="text-muted-foreground">—</SelectItem>
      {legacy && <SelectItem value={legacy} className="italic text-muted-foreground" title="Absent de l’Index des peuples">{legacy}</SelectItem>}
      {names === null && <p className="flex items-center gap-2 px-2 py-2 text-xs text-muted-foreground"><LoaderCircle className="size-3.5 animate-spin" />Index des peuples…</p>}
      {options.map((name) => <SelectItem key={name} value={name}>{name}</SelectItem>)}
    </SelectContent>
  </Select>
}

const textLabel = "grid gap-1.5 text-xs font-semibold text-muted-foreground"

/**
 * La fiche d'un PNJ, partout où on en crée ou en modifie un. La vie actuelle et le sac
 * à dos n'existent que pour un PNJ de campagne : dans le bac à sable ou l'Index des PNJs,
 * la Vitalité suffit.
 */
export function NpcForm({ npc, pending, onClose, onSave }: { npc: CampaignNpcRecord; pending: boolean; onClose: () => void; onSave: (npc: CampaignNpcRecord, portrait?: File) => void }) {
  const [draft, setDraft] = useState(npc)
  const [portraitFile, setPortraitFile] = useState<File>()
  const [portraitPreview, setPortraitPreview] = useState("")
  const inCampaign = npcBelongsToCampaign(draft)
  function update<K extends keyof CampaignNpcRecord>(key: K, value: CampaignNpcRecord[K]) { setDraft((current) => ({ ...current, [key]: value })) }
  function choosePortrait(file?: File) { if (!file) return; setPortraitFile(file); const reader = new FileReader(); reader.onload = () => setPortraitPreview(typeof reader.result === "string" ? reader.result : ""); reader.readAsDataURL(file) }
  const characteristics = Object.fromEntries(Object.entries(npcCharacteristics(draft)).map(([name, value]) => [name, String(value)]))
  function setCharacteristic(name: CharacteristicName, value: string) {
    const parsed = Math.max(0, Math.min(99999, Number.parseInt(value || "0", 10) || 0))
    update(npcCharacteristicKeys[name], parsed)
  }
  function save() {
    // Hors campagne, la vie actuelle suit la Vitalité : le PNJ arrive en campagne en pleine forme.
    const next = inCampaign ? draft : { ...draft, currentHp: draft.totalHp }
    onSave({ ...next, name: draft.name.trim() }, portraitFile)
  }

  return <div className="space-y-6">
    <section className="grid gap-5 lg:grid-cols-[13rem_minmax(0,1fr)]">
      <div className="space-y-3">
        <label className="group relative block aspect-[4/5] cursor-pointer overflow-hidden rounded-2xl border bg-muted/40">
          {portraitPreview || draft.portrait
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={portraitPreview || draft.portrait} alt={`Portrait de ${draft.name || "ce PNJ"}`} className="size-full object-cover" />
            : <div className="grid size-full place-items-center"><UserRound className="size-16 text-primary/25" /></div>}
          <span className="absolute inset-x-3 bottom-3 flex items-center justify-center gap-2 rounded-lg bg-black/65 px-3 py-2 text-xs text-white opacity-0 backdrop-blur transition group-hover:opacity-100"><ImagePlus className="size-4" />Importer</span>
          <input type="file" accept="image/*" className="sr-only" onChange={(event) => choosePortrait(event.target.files?.[0])} />
        </label>
        <Label className={textLabel}>Avatar (URL)<Input type="url" value={draft.portrait} onChange={(event) => update("portrait", event.target.value)} placeholder="https://…" /></Label>
      </div>
      <div className="grid content-start gap-4 sm:grid-cols-2">
        <Label className={textLabel}>Nom du PNJ<Input required value={draft.name} onChange={(event) => update("name", event.target.value)} /></Label>
        <Label className={textLabel}>Titre<Input value={draft.title} onChange={(event) => update("title", event.target.value)} placeholder="Capitaine, comtesse…" /></Label>
        <Label className={textLabel}>Fonction / classe / métier<Input value={draft.occupation} onChange={(event) => update("occupation", event.target.value)} /></Label>
        <div className={textLabel}><span>Peuple</span><PeopleSelect value={draft.people} onChange={(value) => update("people", value)} /></div>
        {inCampaign && <NumberField label="Vie actuelle" value={draft.currentHp} onChange={(value) => update("currentHp", value)} />}
        <Label className={`${textLabel} sm:col-span-2`}>Notes <span className="font-normal">Visible pour les joueurs</span><RichTextField value={draft.playerNotes} onCommit={(html) => update("playerNotes", html)} minHeight="min-h-28" /></Label>
        <Label className={`${textLabel} sm:col-span-2`}>Notes MJ <span className="font-normal">Visible uniquement par le MJ</span><RichTextField value={draft.gmNotes} onCommit={(html) => update("gmNotes", html)} minHeight="min-h-28" /></Label>
      </div>
    </section>
    <section className="grid gap-2">
      <div className="flex items-center gap-2"><Shield className="size-4 text-primary" /><h3 className="font-display text-lg font-semibold">Caractéristiques</h3></div>
      <CharacteristicInputs values={characteristics} onChange={setCharacteristic} />
    </section>
    {inCampaign && <section className="rounded-2xl border p-4">
      <div className="mb-4"><h3 className="font-display text-lg font-semibold">Sac à dos</h3><p className="text-xs text-muted-foreground">L’unique inventaire du PNJ.</p></div>
      {draft.createdAt ? <CharacterInventory characterId={draft.id} endpoint={`/api/npcs/${encodeURIComponent(draft.id)}/inventory`} mode="npc" /> : <p className="rounded-xl border border-dashed px-4 py-7 text-center text-sm text-muted-foreground">Sauvegarde d’abord le PNJ, puis rouvre sa fiche pour remplir son Sac à dos.</p>}
    </section>}
    <div className="flex justify-end gap-2">
      <Button type="button" variant="ghost" onClick={onClose}>Annuler</Button>
      <Button type="button" disabled={pending || !draft.name.trim()} onClick={save}>{pending ? <LoaderCircle className="animate-spin" /> : <Save />}Sauvegarder</Button>
    </div>
  </div>
}

function NpcCard({ npc, pending, mode, onEdit, onToggleCampaign, onDelete }: { npc: CampaignNpcRecord; pending: boolean; mode: "manage" | "locations"; onEdit: () => void; onToggleCampaign: () => void; onDelete: () => void }) {
  const hp = npc.totalHp > 0 ? Math.min(100, (npc.currentHp / npc.totalHp) * 100) : 0
  const campaignNpc = npcBelongsToCampaign(npc)
  return <article className="overflow-hidden rounded-2xl border bg-card/75 shadow-sm"><div className="grid gap-4 p-4 sm:grid-cols-[7rem_minmax(0,1fr)]"><div className="aspect-[4/5] overflow-hidden rounded-xl border bg-muted/40">{npc.portrait ? <img src={npc.portrait} alt={`Portrait de ${npc.name}`} className="size-full object-cover" /> : <div className="grid size-full place-items-center"><UserRound className="size-10 text-primary/25" /></div>}</div><div className="min-w-0 space-y-3"><div className="flex items-start justify-between gap-3"><div><h3 className="font-display text-xl font-semibold">{npc.name}</h3><p className="text-xs text-muted-foreground">{[npc.title, npc.occupation, npc.people].filter(Boolean).join(" · ")}{campaignNpc && <>{(npc.title || npc.occupation || npc.people) ? " · " : ""}PV {npc.currentHp} / {npc.totalHp}</>}</p></div><div className="flex gap-1"><Button type="button" variant="ghost" size="icon-sm" onClick={onEdit} disabled={pending} title="Modifier" aria-label={`Modifier ${npc.name}`}><Pencil /></Button><Button type="button" variant="ghost" size="icon-sm" onClick={onToggleCampaign} disabled={pending || npc.pageLinked === "bac-a-sable"} title={npc.inCampaign ? "Retirer du créateur de session" : "Ajouter au créateur de session"} aria-label={npc.inCampaign ? `Retirer ${npc.name} du créateur de session` : `Ajouter ${npc.name} au créateur de session`}><MapPinned /></Button>{mode === "manage" && <AlertDialog><AlertDialogTrigger asChild><Button type="button" variant="ghost" size="icon-sm" className="text-destructive" disabled={pending} aria-label={`Supprimer ${npc.name}`}><Trash2 /></Button></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Supprimer « {npc.name} » ?</AlertDialogTitle><AlertDialogDescription>Cette suppression est définitive.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Annuler</AlertDialogCancel><AlertDialogAction variant="destructive" onClick={onDelete}>Supprimer</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>}</div></div>{campaignNpc && <Progress value={hp} className="h-2" />}<CharacteristicBadges values={npcCharacteristics(npc)} /></div></div><Collapsible><CollapsibleTrigger asChild><button type="button" className="flex w-full items-center justify-between border-t px-4 py-3 text-sm font-medium hover:bg-muted/35"><span>{campaignNpc ? "Notes et Sac à dos" : "Notes"}</span><ChevronDown className="size-4" /></button></CollapsibleTrigger><CollapsibleContent className="space-y-4 border-t p-4"><section><h4 className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Notes</h4><p className="whitespace-pre-wrap text-sm">{npc.playerNotes || "Aucune note."}</p></section><section><h4 className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Notes MJ</h4><p className="whitespace-pre-wrap text-sm">{npc.gmNotes || "Aucune note MJ."}</p></section>{campaignNpc && <section><h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Sac à dos</h4><CharacterInventory characterId={npc.id} endpoint={`/api/npcs/${encodeURIComponent(npc.id)}/inventory`} mode="npc" readOnly /></section>}</CollapsibleContent></Collapsible></article>
}

export function NpcManager({ initialNpcs, pageLinked, sourcePages = [], mode = "manage" }: { initialNpcs: CampaignNpcRecord[]; pageLinked: string; sourcePages?: ReusablePageOption[]; mode?: "manage" | "locations" }) {
  const [npcs, setNpcs] = useState(initialNpcs); const [editing, setEditing] = useState<CampaignNpcRecord | null>(null); const [importing, setImporting] = useState(false); const [pending, setPending] = useState(false); const [query, setQuery] = useState(""); const [error, setError] = useState("")
  const normalizedQuery = query.trim().toLocaleLowerCase("fr")
  const filtered = npcs.filter((npc) => !normalizedQuery || `${npc.name} ${npc.playerNotes} ${npc.gmNotes}`.toLocaleLowerCase("fr").includes(normalizedQuery))
  async function save(npc: CampaignNpcRecord, portrait?: File) { setPending(true); setError(""); try { const [saved] = await persistNpcs("save", pageLinked, [npc]); const finalNpc = portrait ? await uploadNpcPortrait(saved.id, portrait) : saved; setNpcs((current) => current.some((item) => item.id === finalNpc.id) ? current.map((item) => item.id === finalNpc.id ? finalNpc : item) : [finalNpc, ...current]); setEditing(null) } catch (caught) { setError(caught instanceof Error ? caught.message : "Enregistrement impossible.") } finally { setPending(false) } }
  async function toggleCampaign(npc: CampaignNpcRecord) { setPending(true); setError(""); try { const [saved] = await persistNpcs(npc.inCampaign ? "remove-from-campaign" : "add-to-campaign", pageLinked, [npc]); setNpcs((current) => mode === "locations" && !saved.inCampaign ? current.filter((item) => item.id !== saved.id) : current.map((item) => item.id === saved.id ? saved : item)) } catch (caught) { setError(caught instanceof Error ? caught.message : "Modification impossible.") } finally { setPending(false) } }
  async function remove(npc: CampaignNpcRecord) { setPending(true); setError(""); try { await persistNpcs("delete", pageLinked, [npc]); setNpcs((current) => current.filter((item) => item.id !== npc.id)) } catch (caught) { setError(caught instanceof Error ? caught.message : "Suppression impossible.") } finally { setPending(false) } }
  async function importSelected(sourcePageLinked: string, ids: string[], transferMode: "copy" | "move") { setPending(true); setError(""); try { const imported = await importNpcs(pageLinked, sourcePageLinked, ids, transferMode); setNpcs((current) => [...imported, ...current]); setImporting(false) } catch (caught) { setError(caught instanceof Error ? caught.message : "Import impossible.") } finally { setPending(false) } }
  return <div className="space-y-5"><div className="flex flex-col gap-3 sm:flex-row sm:items-center"><div className="relative min-w-0 flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={query} onChange={(event) => setQuery(event.target.value)} className="pl-9" placeholder="Rechercher un PNJ…" /></div>{mode === "manage" && <div className="flex gap-2">{sourcePages.length > 0 && <Button type="button" variant="outline" onClick={() => setImporting(true)}><Download />Récupérer</Button>}<Button type="button" variant="outline" onClick={() => setEditing(randomNpc(pageLinked))}><Dices />Générer un PNJ</Button><Button type="button" onClick={() => setEditing(blankNpc(pageLinked))}><Plus />Créer un PNJ</Button></div>}</div>{error && <p className="text-sm text-destructive">{error}</p>}<div className="grid gap-4 xl:grid-cols-2">{filtered.map((npc) => <NpcCard key={npc.id} npc={npc} pending={pending} mode={mode} onEdit={() => setEditing(npc)} onToggleCampaign={() => void toggleCampaign(npc)} onDelete={() => void remove(npc)} />)}{!filtered.length && <p className="col-span-full rounded-2xl border border-dashed px-5 py-12 text-center text-sm text-muted-foreground">Aucun PNJ.</p>}</div><Dialog open={Boolean(editing)} onOpenChange={(open) => { if (!open && !pending) setEditing(null) }}>{editing && <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-5xl"><DialogHeader><DialogTitle>{editing.createdAt ? `Modifier ${editing.name}` : "Créer un PNJ"}</DialogTitle></DialogHeader><NpcForm key={editing.id} npc={editing} pending={pending} onClose={() => setEditing(null)} onSave={(npc, portrait) => void save(npc, portrait)} /></DialogContent>}</Dialog><ImportNpcsDialog open={importing} sourcePages={sourcePages} pending={pending} onClose={() => setImporting(false)} onImport={(source, ids, transferMode) => void importSelected(source, ids, transferMode)} /></div>
}
