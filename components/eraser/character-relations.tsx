"use client"

import { useEffect, useState } from "react"
import { Check, LoaderCircle, Plus, Search, Sparkles, Trash2, UserRound, Users, X } from "lucide-react"

import { RichTextField, RichTextView } from "@/components/eraser/rich-text"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"

type RelationLevel = -3 | -2 | -1 | 0 | 1 | 2 | 3
type RelationKind = "npc" | "character"

type Relation = {
  id: string
  targetKind: RelationKind
  targetId: string
  name: string
  level: RelationLevel
  personalNotes: string
  portrait: string
  people: string
  description: string
  campaignName: string
  canEditTarget: boolean
}

type Candidate = {
  id: string
  kind: RelationKind
  name: string
  portrait: string
  people: string
  description: string
  campaignId: string
  campaignName: string
}

type Campaign = { id: string; name: string; accentColor: string }

const levels: RelationLevel[] = [3, 2, 1, 0, -1, -2, -3]

function normalized(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("fr").trim()
}

/** Mini-portrait rond ; l'icône reste si l'image manque ou ne charge pas. */
function RelationAvatar({ relation, color }: { relation: Relation; color: string }) {
  const [failed, setFailed] = useState("")
  const showImage = relation.portrait && failed !== relation.portrait
  return <span className="relative flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-full text-muted-foreground ring-2" style={{ backgroundColor: `${color}14`, ["--tw-ring-color" as string]: `${color}40` }}>
    {showImage
      // eslint-disable-next-line @next/next/no-img-element
      ? <img src={relation.portrait} alt="" loading="lazy" decoding="async" onError={() => setFailed(relation.portrait)} className="size-full object-cover" />
      : relation.targetKind === "npc" ? <UserRound className="size-4" style={{ color }} /> : <Users className="size-4" style={{ color }} />}
  </span>
}

function RelationLine({ relation, color, pending, onUpdate, onDelete }: { relation: Relation; color: string; pending: boolean; onUpdate: (body: Record<string, unknown>) => Promise<void>; onDelete: () => Promise<void> }) {
  const [notes, setNotes] = useState(relation.personalNotes)
  const [editingLevel, setEditingLevel] = useState(false)
  const [editingTarget, setEditingTarget] = useState(false)
  const [targetDraft, setTargetDraft] = useState({ name: relation.name, people: relation.people, description: relation.description, portrait: relation.portrait })
  // Plus la relation est forte, plus la pastille du niveau est soutenue.
  const intensity = ["14", "22", "33", "48"][Math.min(3, Math.abs(relation.level))]
  const levelControl = editingLevel
    ? <NativeSelect autoFocus value={String(relation.level)} disabled={pending} onBlur={() => setEditingLevel(false)} onChange={(event) => { void onUpdate({ action: "update", relationId: relation.id, level: Number(event.target.value), personalNotes: relation.personalNotes }); setEditingLevel(false) }} className="h-7 w-16 border-0 bg-background/60 px-1 text-xs font-semibold shadow-none" aria-label={`Niveau de relation avec ${relation.name}`}>{levels.map((level) => <NativeSelectOption key={level} value={String(level)}>{level > 0 ? `+${level}` : level}</NativeSelectOption>)}</NativeSelect>
    : <button type="button" onClick={() => setEditingLevel(true)} className="min-w-9 rounded-full px-2 py-0.5 text-xs font-bold tabular-nums transition hover:brightness-110" style={{ backgroundColor: `${color}${intensity}`, color }} title="Cliquer pour modifier le niveau">{relation.level > 0 ? `+${relation.level}` : relation.level}</button>
  return <div className="group/row flex items-center gap-2.5 rounded-xl px-2 py-1.5 transition-colors hover:bg-muted/35">
    <HoverCard openDelay={180} closeDelay={450}>
      <HoverCardTrigger asChild><button type="button" className="flex min-w-0 flex-1 items-center gap-2.5 text-left">
        <RelationAvatar relation={relation} color={color} />
        <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium group-hover/row:text-primary">{relation.name}</span>{(relation.people || relation.campaignName) && <span className="block truncate text-[11px] text-muted-foreground">{relation.people || relation.campaignName}</span>}</span>
      </button></HoverCardTrigger>
      <HoverCardContent align="start" className="w-80 space-y-4 rounded-2xl p-4">
        <div className="flex gap-3"><div className="relative flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-muted text-muted-foreground">{relation.portrait ? <img src={relation.portrait} alt={`Portrait de ${relation.name}`} loading="lazy" decoding="async" className="size-full object-cover" /> : relation.targetKind === "npc" ? <UserRound className="size-6" /> : <Users className="size-6" />}</div><div className="min-w-0"><p className="font-display text-lg font-semibold leading-tight">{relation.name}</p><p className="mt-1 text-xs text-muted-foreground">{relation.targetKind === "npc" ? "PNJ" : "Joueur·euse"}{relation.campaignName ? ` · ${relation.campaignName}` : ""}</p>{relation.people && <p className="mt-2 text-sm">{relation.people}</p>}</div></div>
        {relation.description && <RichTextView html={relation.description} className="text-sm leading-6 text-muted-foreground" />}
        {relation.canEditTarget && (editingTarget ? <div className="grid gap-2 rounded-xl border bg-background/45 p-3"><Label className="grid gap-1 text-xs">Nom<Input value={targetDraft.name} onChange={(event) => setTargetDraft((current) => ({ ...current, name: event.target.value }))} /></Label><Label className="grid gap-1 text-xs">Peuple<Input value={targetDraft.people} onChange={(event) => setTargetDraft((current) => ({ ...current, people: event.target.value }))} /></Label><Label className="grid gap-1 text-xs">Portrait (URL)<Input type="url" value={targetDraft.portrait} onChange={(event) => setTargetDraft((current) => ({ ...current, portrait: event.target.value }))} placeholder="https://…" /></Label><div className="grid gap-1 text-xs leading-none">Description<RichTextField ariaLabel="Description" value={targetDraft.description} onCommit={(html) => setTargetDraft((current) => ({ ...current, description: html }))} minHeight="min-h-20" /></div><div className="flex justify-end gap-1"><Button size="sm" variant="ghost" onClick={() => setEditingTarget(false)}><X />Annuler</Button><Button size="sm" disabled={!targetDraft.name.trim() || pending} onClick={async () => { await onUpdate({ action: "update-target", relationId: relation.id, ...targetDraft }); setEditingTarget(false) }}><Check />Enregistrer</Button></div></div> : <Button type="button" size="sm" variant="outline" onClick={() => { setTargetDraft({ name: relation.name, people: relation.people, description: relation.description, portrait: relation.portrait }); setEditingTarget(true) }}>Compléter ce PNJ</Button>)}
        <div className="grid gap-1.5 text-xs font-medium leading-none">Notes personnelles<RichTextField ariaLabel="Notes personnelles" value={notes} onCommit={setNotes} minHeight="min-h-24" placeholder="Ce que ton personnage sait, ressent ou veut retenir…" /></div>
        <div className="flex justify-end"><Button type="button" size="sm" disabled={pending || notes === relation.personalNotes} onClick={() => onUpdate({ action: "update", relationId: relation.id, level: relation.level, personalNotes: notes })}>{pending ? <LoaderCircle className="animate-spin" /> : <Check />}Enregistrer la note</Button></div>
      </HoverCardContent>
    </HoverCard>
    {levelControl}
    <button type="button" disabled={pending} onClick={() => void onDelete()} className="-ml-1 flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-0 hover:bg-destructive/10 hover:text-destructive group-hover/row:opacity-100 focus:opacity-100" aria-label={`Supprimer la relation avec ${relation.name}`}><Trash2 className="size-3.5" /></button>
  </div>
}

const columns = [
  { key: "allies", label: "Allié·es", test: (level: number) => level > 0, color: "#648f4e" },
  { key: "known", label: "Connaissances", test: (level: number) => level === 0, color: "#b48745" },
  { key: "enemies", label: "Ennemi·es", test: (level: number) => level < 0, color: "#b9504e" },
] as const

export function CharacterRelations({ characterId, campaigns }: { characterId: string; campaigns: Campaign[] }) {
  const [relations, setRelations] = useState<Relation[]>([])
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [loading, setLoading] = useState(true)
  const [candidatesLoaded, setCandidatesLoaded] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState("")
  const [adding, setAdding] = useState(false)
  const [mode, setMode] = useState<RelationKind | "create-npc">("npc")
  const [search, setSearch] = useState("")
  const [selectedId, setSelectedId] = useState("")
  const [newName, setNewName] = useState("")
  const [campaignId, setCampaignId] = useState(campaigns[0]?.id || "")
  const [level, setLevel] = useState<RelationLevel>(0)
  const [sorts, setSorts] = useState<Record<string, "name" | "level">>({ allies: "level", known: "name", enemies: "level" })
  const endpoint = `/api/characters/${encodeURIComponent(characterId)}/relations`

  useEffect(() => {
    let active = true
    fetch(endpoint).then(async (response) => ({ response, payload: (await response.json()) as { relations?: Relation[]; error?: string } })).then(({ response, payload }) => { if (!active) return; if (!response.ok) throw new Error(payload.error); setRelations(payload.relations || []) }).catch(() => { if (active) setError("Les relations n’ont pas pu être chargées.") }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [endpoint])

  async function request(body: Record<string, unknown>) {
    setPending(true); setError("")
    try {
      const response = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })
      const payload = (await response.json()) as { relations?: Relation[]; error?: string }
      if (!response.ok || !payload.relations) throw new Error(payload.error)
      setRelations(payload.relations)
    } catch (caught) { setError(caught instanceof Error && caught.message ? caught.message : "La relation n’a pas pu être enregistrée.") }
    setPending(false)
  }

  async function openCreation() {
    setAdding(true); setSearch(""); setSelectedId(""); setNewName(""); setLevel(0)
    if (candidatesLoaded) return
    try {
      const response = await fetch(`${endpoint}?candidates=1`)
      const payload = (await response.json()) as { candidates?: Candidate[]; relations?: Relation[]; error?: string }
      if (!response.ok) throw new Error(payload.error)
      setCandidates(payload.candidates || []); if (payload.relations) setRelations(payload.relations); setCandidatesLoaded(true)
    } catch { setError("Les personnages disponibles n’ont pas pu être chargés.") }
  }

  const existingTargets = new Set(relations.map((relation) => `${relation.targetKind}:${relation.targetId}`))
  const filtered = candidates.filter((candidate) => candidate.kind === mode && !existingTargets.has(`${candidate.kind}:${candidate.id}`) && (!normalized(search) || normalized(`${candidate.name} ${candidate.people}`).includes(normalized(search))))

  async function add() {
    if (mode === "create-npc") {
      if (!newName.trim() || !campaignId) return
      await request({ action: "create-npc", name: newName, campaignId, level })
    } else {
      if (!selectedId) return
      await request({ action: "create", targetKind: mode, targetId: selectedId, level })
    }
    setAdding(false)
  }

  return <section className="min-w-0">
    <div className="flex items-center justify-between gap-3"><div><p className="text-[11px] font-semibold uppercase tracking-[.2em] text-primary/70">Entourage</p><h3 className="font-display text-2xl font-semibold">Relations</h3></div><Button type="button" size="sm" onClick={() => void openCreation()} disabled={!campaigns.length}><Plus />Ajouter une relation</Button></div>
    {error && <p className="mt-3 rounded-xl border border-destructive/25 bg-destructive/5 px-3 py-2 text-sm text-destructive">{error}</p>}
    {loading ? <div className="grid min-h-40 place-items-center"><LoaderCircle className="size-5 animate-spin text-muted-foreground" /></div> : <div className="mt-4 grid items-start gap-4 md:grid-cols-3">{columns.map((column) => {
      const records = relations.filter((relation) => column.test(relation.level)).sort((left, right) => sorts[column.key] === "name" ? left.name.localeCompare(right.name, "fr") : Math.abs(right.level) - Math.abs(left.level) || left.name.localeCompare(right.name, "fr"))
      return <section key={column.key} className="min-w-0 overflow-hidden rounded-2xl border bg-card/60 shadow-sm" style={{ borderColor: `${column.color}40` }}>
        <header className="flex items-center gap-2 px-4 py-2.5" style={{ background: `linear-gradient(135deg, ${column.color}22, ${column.color}08)`, borderBottom: `1px solid ${column.color}30` }}>
          <h4 className="font-display text-lg font-semibold" style={{ color: column.color }}>{column.label}</h4>
          <span className="rounded-full px-1.5 py-px text-[10px] font-semibold tabular-nums" style={{ backgroundColor: `${column.color}1f`, color: column.color }}>{records.length}</span>
          <div className="ml-auto"><NativeSelect value={sorts[column.key]} onChange={(event) => setSorts((current) => ({ ...current, [column.key]: event.target.value as "name" | "level" }))} className="h-7 w-24 border-0 bg-transparent px-1 text-[11px] text-muted-foreground shadow-none" aria-label={`Trier les ${column.label}`}><NativeSelectOption value="level">Par niveau</NativeSelectOption><NativeSelectOption value="name">Par nom</NativeSelectOption></NativeSelect></div>
        </header>
        <div className="space-y-0.5 p-1.5">{records.length ? records.map((relation) => <RelationLine key={relation.id} relation={relation} color={column.color} pending={pending} onUpdate={request} onDelete={() => request({ action: "delete", relationId: relation.id })} />) : <p className="m-1 rounded-xl border border-dashed px-3 py-5 text-center text-xs text-muted-foreground">Aucune relation</p>}</div>
      </section>
    })}</div>}

    <Dialog open={adding} onOpenChange={setAdding}><DialogContent className="sm:max-w-2xl"><DialogHeader><DialogTitle>Ajouter une relation</DialogTitle></DialogHeader><div className="space-y-4"><div className="grid grid-cols-3 gap-2"><Button type="button" variant={mode === "npc" ? "default" : "outline"} onClick={() => { setMode("npc"); setSelectedId("") }}><UserRound />PNJ</Button><Button type="button" variant={mode === "character" ? "default" : "outline"} onClick={() => { setMode("character"); setSelectedId("") }}><Users />Joueur·euse</Button><Button type="button" variant={mode === "create-npc" ? "default" : "outline"} onClick={() => { setMode("create-npc"); setSelectedId("") }}><Sparkles />Créer un PNJ</Button></div>
      <Label className="grid gap-1.5 text-sm font-medium">Niveau de relation<NativeSelect value={String(level)} onChange={(event) => setLevel(Number(event.target.value) as RelationLevel)}>{levels.map((candidateLevel) => <NativeSelectOption key={candidateLevel} value={String(candidateLevel)}>{candidateLevel > 0 ? `+${candidateLevel} — Allié·e` : candidateLevel < 0 ? `${candidateLevel} — Ennemi·e` : "0 — Connaissance"}</NativeSelectOption>)}</NativeSelect></Label>
      {mode === "create-npc" ? <div className="grid gap-3 sm:grid-cols-2"><Label className="grid gap-1.5 text-sm font-medium">Nom du PNJ<Input value={newName} onChange={(event) => setNewName(event.target.value)} autoFocus /></Label>{campaigns.length > 1 && <Label className="grid gap-1.5 text-sm font-medium">Campagne<NativeSelect value={campaignId} onChange={(event) => setCampaignId(event.target.value)}>{campaigns.map((campaign) => <NativeSelectOption key={campaign.id} value={campaign.id}>{campaign.name}</NativeSelectOption>)}</NativeSelect></Label>}<p className="text-xs leading-5 text-muted-foreground sm:col-span-2">Le PNJ sera créé dans la campagne avec son nom et apparaîtra dans la liste du MJ, qui pourra compléter sa fiche.</p></div> : <><div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={search} onChange={(event) => setSearch(event.target.value)} className="pl-9" placeholder={mode === "npc" ? "Rechercher un PNJ par nom…" : "Rechercher un·e joueur·euse par nom…"} autoFocus /></div><div className="max-h-64 space-y-1 overflow-y-auto rounded-xl border p-2">{filtered.length ? filtered.map((candidate) => <button key={`${candidate.kind}:${candidate.id}`} type="button" onClick={() => setSelectedId(candidate.id)} className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left ${selectedId === candidate.id ? "bg-primary text-primary-foreground" : "hover:bg-accent"}`}><span className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted/70">{candidate.portrait ? <img src={candidate.portrait} alt="" loading="lazy" decoding="async" className="size-full object-cover" /> : candidate.kind === "npc" ? <UserRound className="size-4" /> : <Users className="size-4" />}</span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{candidate.name}</span><span className="block truncate text-xs opacity-70">{[candidate.people, candidate.campaignName].filter(Boolean).join(" · ")}</span></span></button>) : <p className="px-3 py-8 text-center text-sm text-muted-foreground">Aucun résultat.</p>}</div></>}
      <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={() => setAdding(false)}>Annuler</Button><Button type="button" disabled={pending || (mode === "create-npc" ? !newName.trim() || !campaignId : !selectedId)} onClick={() => void add()}>{pending ? <LoaderCircle className="animate-spin" /> : <Plus />}Ajouter</Button></div></div></DialogContent></Dialog>
  </section>
}
