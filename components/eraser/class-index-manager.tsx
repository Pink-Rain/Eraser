"use client"

import { useMemo, useState } from "react"
import { AlertTriangle, Check, CircleDotDashed, CopyCheck, ExternalLink, Gauge, LoaderCircle, Plus, RefreshCw, Search, Trash2, X, Zap } from "lucide-react"

import { RichTextEditorField } from "@/components/eraser/rich-text-inline-editor"
import { SpellChargeStars } from "@/components/eraser/spell-charges"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { ClassSpell, ClassSpellDraft, SpellSimilarity } from "@/lib/class-content"
import { classSpellActionKind, classSpellCategory, classSpellCategoryTones, classSpellTypeSuggestions, findClassSpellSimilarities, MAX_CLASS_SPELLS_PER_RANK, splitClassSpellSkills } from "@/lib/class-spell-utils"
import type { ClassRecord } from "@/lib/google-sheets"

type ResourceData = { classes: ClassRecord[]; spells: ClassSpell[]; similarities: SpellSimilarity[]; headers: string[]; file: { id: string; name: string; webViewLink?: string } | null }
type MutationResult = { id: string; rowNumber: number; tone: { background: string; foreground: string } } | null

function emptyDraft(): ClassSpellDraft {
  return { id: "", name: "", effect: "", effectHtml: "", description: "", descriptionHtml: "", type: "Passif", skillsRaw: "", distance: "", charges: null, classRanks: {} }
}

function toDraft(spell: ClassSpell): ClassSpellDraft {
  return { id: spell.id.startsWith("LIGNE-") ? "" : spell.id, name: spell.name === "Sort sans nom" ? "" : spell.name, effect: spell.effect, effectHtml: spell.effectHtml, description: spell.description, descriptionHtml: spell.descriptionHtml, type: spell.type, skillsRaw: spell.skillsRaw, distance: spell.distance, charges: spell.charges, classRanks: { ...spell.classRanks } }
}

function plainText(html: string) {
  return html.replace(/<br\s*\/?>/gi, "\n").replace(/<\/p>|<\/div>|<\/li>/gi, "\n").replace(/<[^>]+>/g, "").replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").trim()
}

function searchText(spell: Pick<ClassSpell, "name" | "type" | "skillsRaw" | "effect" | "description">) {
  return `${spell.name} ${spell.type} ${spell.skillsRaw} ${spell.effect} ${spell.description}`.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("fr")
}

function materialize(draft: ClassSpellDraft, rowNumber: number, id: string, tone?: { background: string; foreground: string }): ClassSpell {
  const category = classSpellCategory(draft.type)
  const classRanks = Object.fromEntries(Object.entries(draft.classRanks).flatMap(([classId, rank]) => Number.isInteger(rank) && rank !== null && rank >= 0 && rank <= 20 ? [[classId, rank]] : [])) as Record<string, number>
  return { rowNumber, id, name: draft.name.trim(), effect: draft.effect, effectHtml: draft.effectHtml || draft.effect, description: draft.description, descriptionHtml: draft.descriptionHtml || draft.description, type: draft.type, category, actionKind: classSpellActionKind(draft.type), skillsRaw: draft.skillsRaw, skills: splitClassSpellSkills(draft.skillsRaw), distance: draft.distance, charges: draft.charges, classRanks, tone: tone || classSpellCategoryTones[category] }
}

function TypeGlyph({ category }: { category: ClassSpell["category"] }) {
  if (category === "actif") return <Zap className="size-3.5" />
  if (category === "passif") return <CircleDotDashed className="size-3.5" />
  return <Gauge className="size-3.5" />
}

function rankLabel(rank: number) { return rank === 0 ? "Rang commun" : `Rang ${rank}` }

function rankCount(spells: ClassSpell[], classId: string, rank: number, exceptRow?: number) {
  return spells.filter((spell) => spell.rowNumber !== exceptRow && spell.classRanks[classId] === rank).length
}

function ClassLinksEditor({ draft, classes, spells, rowNumber, onChange }: { draft: ClassSpellDraft; classes: ClassRecord[]; spells: ClassSpell[]; rowNumber?: number; onChange: (value: Record<string, number | null>) => void }) {
  const [classId, setClassId] = useState("")
  const [rank, setRank] = useState(0)
  const full = classId ? rankCount(spells, classId, rank, rowNumber) >= MAX_CLASS_SPELLS_PER_RANK : false
  return <div className="space-y-2">
    {Object.entries(draft.classRanks).flatMap(([linkedClassId, linkedRank]) => {
      if (linkedRank === null) return []
      const characterClass = classes.find((item) => item.id === linkedClassId)
      return <div key={linkedClassId} className="grid grid-cols-[minmax(7rem,1fr)_7rem_auto] items-center gap-1.5 rounded-lg border px-2 py-1.5">
        <span className="truncate text-xs font-semibold" style={{ color: characterClass?.accentDark }}>{characterClass?.name || linkedClassId}</span>
        <NativeSelect value={linkedRank} onChange={(event) => onChange({ ...draft.classRanks, [linkedClassId]: Number(event.target.value) })} className="h-7 text-xs">
          <NativeSelectOption value="0" disabled={rankCount(spells, linkedClassId, 0, rowNumber) >= MAX_CLASS_SPELLS_PER_RANK}>Commun</NativeSelectOption>{Array.from({ length: 20 }, (_, index) => <NativeSelectOption key={index + 1} value={index + 1} disabled={rankCount(spells, linkedClassId, index + 1, rowNumber) >= MAX_CLASS_SPELLS_PER_RANK}>Rang {index + 1}</NativeSelectOption>)}
        </NativeSelect>
        <button type="button" onClick={() => onChange({ ...draft.classRanks, [linkedClassId]: null })} className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" aria-label={`Délier ${characterClass?.name || linkedClassId}`}><X className="size-3.5" /></button>
      </div>
    })}
    <div className="grid grid-cols-[minmax(7rem,1fr)_7rem_auto] items-center gap-1.5">
      <NativeSelect aria-label="Classe à ajouter" value={classId} onChange={(event) => setClassId(event.target.value)} className="h-8 text-xs"><NativeSelectOption value="">+ Classe</NativeSelectOption>{classes.filter((item) => draft.classRanks[item.id] === undefined || draft.classRanks[item.id] === null).map((item) => <NativeSelectOption key={item.id} value={item.id}>{item.name}</NativeSelectOption>)}</NativeSelect>
      <NativeSelect aria-label="Rang à ajouter" value={rank} onChange={(event) => setRank(Number(event.target.value))} className="h-8 text-xs"><NativeSelectOption value="0">Commun</NativeSelectOption>{Array.from({ length: 20 }, (_, index) => <NativeSelectOption key={index + 1} value={index + 1}>Rang {index + 1}</NativeSelectOption>)}</NativeSelect>
      <Button type="button" size="icon-sm" variant="outline" disabled={!classId || full} onClick={() => { onChange({ ...draft.classRanks, [classId]: rank }); setClassId(""); setRank(0) }} title={full ? "Ce rang contient déjà trois sorts" : "Ajouter la classe et le rang"}><Plus /></Button>
    </div>
    {full && <p className="text-[11px] text-destructive">Ce rang contient déjà trois sorts.</p>}
  </div>
}

function SpellForm({ initial, classes, spells, pending, title, onCancel, onSave }: { initial: ClassSpellDraft; classes: ClassRecord[]; spells: ClassSpell[]; pending: boolean; title: string; onCancel: () => void; onSave: (draft: ClassSpellDraft) => void }) {
  const [draft, setDraft] = useState(initial)
  const field = <K extends keyof ClassSpellDraft>(key: K, value: ClassSpellDraft[K]) => setDraft((current) => ({ ...current, [key]: value }))
  return <section className="rounded-2xl border bg-card/90 p-4 shadow-sm">
    <div className="flex items-center justify-between gap-3"><h3 className="font-display text-xl font-semibold">{title}</h3><Button type="button" variant="ghost" size="icon-sm" onClick={onCancel} aria-label="Fermer"><X /></Button></div>
    <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      <label className="grid gap-1 text-xs font-semibold">ID<Input value={draft.id} onChange={(event) => field("id", event.target.value)} placeholder="Généré si vide" /></label>
      <label className="grid gap-1 text-xs font-semibold md:col-span-1 xl:col-span-2">Nom<Input value={draft.name} onChange={(event) => field("name", event.target.value)} /></label>
      <label className="grid gap-1 text-xs font-semibold">Type exact<Input list="class-spell-types" value={draft.type} onChange={(event) => field("type", event.target.value)} /></label>
      <label className="grid gap-1 text-xs font-semibold">Compétences<Input value={draft.skillsRaw} onChange={(event) => field("skillsRaw", event.target.value)} className="text-[#b3261e]" /></label>
      <label className="grid gap-1 text-xs font-semibold">Distance<Input value={draft.distance} onChange={(event) => field("distance", event.target.value)} /></label>
      <label className="grid gap-1 text-xs font-semibold">Charges{classSpellCategory(draft.type) === "actif" ? <Input type="number" min={0} max={5} value={draft.charges ?? ""} onChange={(event) => field("charges", event.target.value === "" ? null : Math.max(0, Math.min(5, Number(event.target.value))))} /> : <span className="flex min-h-9 items-center text-muted-foreground">—</span>}</label>
      <div className="md:col-span-2 xl:col-span-1"><p className="mb-1 text-xs font-semibold">Classes et rangs</p><ClassLinksEditor draft={draft} classes={classes} spells={spells} onChange={(classRanks) => field("classRanks", classRanks)} /></div>
      <label className="grid gap-1 text-xs font-semibold md:col-span-2">Effet<RichTextEditorField value={draft.effectHtml || draft.effect} onChange={(html) => setDraft((current) => ({ ...current, effect: plainText(html), effectHtml: html }))} /></label>
      <label className="grid gap-1 text-xs font-semibold md:col-span-2">Description<RichTextEditorField value={draft.descriptionHtml || draft.description} onChange={(html) => setDraft((current) => ({ ...current, description: plainText(html), descriptionHtml: html }))} /></label>
    </div>
    <div className="mt-4 flex justify-end gap-2"><Button type="button" variant="outline" onClick={onCancel}>Annuler</Button><Button type="button" onClick={() => onSave(draft)} disabled={pending || !draft.name.trim()}>{pending ? <LoaderCircle className="animate-spin" /> : <Check />}Enregistrer</Button></div>
  </section>
}

function Similarities({ spell, allSpells, similarities }: { spell: ClassSpell; allSpells: ClassSpell[]; similarities: SpellSimilarity[] }) {
  const matches = similarities.filter((item) => item.leftId === spell.id || item.rightId === spell.id)
  return <div className="mt-3 rounded-xl border border-amber-500/25 bg-amber-500/5 p-3"><p className="text-xs font-semibold">Doublons et ressemblances — {matches.length}</p><div className="mt-2 space-y-2">{matches.map((match) => { const otherId = match.leftId === spell.id ? match.rightId : match.leftId; const other = allSpells.find((item) => item.id === otherId); return other ? <div key={`${match.leftId}:${match.rightId}`} className="rounded-lg border bg-background/55 px-3 py-2 text-xs"><div className="flex flex-wrap items-center gap-2"><b>{other.name}</b><Badge variant={match.kind === "Doublon exact" ? "destructive" : "outline"}>{match.kind}</Badge><span className="text-muted-foreground">{Math.round(match.score * 100)} %</span></div><blockquote className="mt-1 border-l-2 pl-2 text-muted-foreground">{other.effect || other.description || "Aucun texte"}</blockquote></div> : null })}{!matches.length && <p className="text-xs text-muted-foreground">Aucune correspondance détectée.</p>}</div></div>
}

const fieldInputClass = "border-transparent bg-transparent px-1.5 shadow-none focus-visible:border-input focus-visible:bg-background"

// Chaque champ est toujours un input : cliquer dedans modifie seulement ce champ,
// jamais toute la ligne (fini le mode "lecture" / "édition" qui changeait de mise
// en page et causait des sauts d'affichage). Un bouton Enregistrer unique s'active
// dès qu'un champ a changé, comme dans l'index des objets.
function EditableSpell({ spell, classes, allSpells, similarities, pending, compact = false, onSave, onDelete }: { spell: ClassSpell; classes: ClassRecord[]; allSpells: ClassSpell[]; similarities: SpellSimilarity[]; pending: boolean; compact?: boolean; onSave: (spell: ClassSpell, draft: ClassSpellDraft) => void; onDelete: (spell: ClassSpell) => void }) {
  const [draft, setDraft] = useState(() => toDraft(spell))
  const [showMatches, setShowMatches] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const tone = spell.tone.background ? spell.tone : classSpellCategoryTones[spell.category]
  const persisted = useMemo(() => toDraft(spell), [spell])
  const changed = JSON.stringify(draft) !== JSON.stringify(persisted)
  const field = <K extends keyof ClassSpellDraft>(key: K, value: ClassSpellDraft[K]) => setDraft((current) => ({ ...current, [key]: value }))
  const actions = <>
    <Button type="button" size={compact ? "sm" : "icon-sm"} disabled={pending || !changed || !draft.name.trim()} onClick={() => onSave(spell, draft)} title="Enregistrer">{pending ? <LoaderCircle className="animate-spin" /> : <Check />}{compact && "Enregistrer"}</Button>
    <Button type="button" size={compact ? "sm" : "icon-sm"} variant="outline" onClick={() => setShowMatches((current) => !current)} title="Voir les doublons et ressemblances"><CopyCheck />{compact && "Doublons"}</Button>
    {confirmDelete ? <><Button type="button" size="sm" variant="destructive" onClick={() => onDelete(spell)}>Confirmer</Button><Button type="button" size="icon-sm" variant="ghost" onClick={() => setConfirmDelete(false)}><X /></Button></> : <Button type="button" size="icon-sm" variant="ghost" className="text-destructive" onClick={() => setConfirmDelete(true)} title="Supprimer"><Trash2 /></Button>}
  </>

  if (compact) return <article className="rounded-xl border bg-card/75 p-4 shadow-sm" style={{ borderColor: `${tone.background}66` }}>
    <div className="flex items-start gap-3">
      <span className="mt-1.5 flex size-8 shrink-0 items-center justify-center rounded-lg" style={{ backgroundColor: tone.background, color: tone.foreground }}><TypeGlyph category={spell.category} /></span>
      <div className="min-w-0 flex-1 space-y-2">
        <Input aria-label="Nom du sort" value={draft.name} onChange={(event) => field("name", event.target.value)} className={`h-9 font-display text-lg font-semibold ${fieldInputClass}`} />
        <Input list="class-spell-types" aria-label="Type" value={draft.type} onChange={(event) => field("type", event.target.value)} className={`h-7 w-fit min-w-28 rounded-full text-xs font-semibold ${fieldInputClass}`} style={{ backgroundColor: `${tone.background}1c` }} />
        <blockquote className="border-l-2 pl-3 text-sm leading-6" style={{ borderColor: tone.background }}>
          <RichTextEditorField value={draft.effectHtml || draft.effect} onChange={(html) => setDraft((current) => ({ ...current, effect: plainText(html), effectHtml: html }))} />
          <RichTextEditorField value={draft.descriptionHtml || draft.description} onChange={(html) => setDraft((current) => ({ ...current, description: plainText(html), descriptionHtml: html }))} className="mt-1 text-muted-foreground" />
        </blockquote>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Input aria-label="Compétences" value={draft.skillsRaw} onChange={(event) => field("skillsRaw", event.target.value)} placeholder="Compétences" className={`h-7 min-w-32 flex-1 font-semibold text-[#b3261e] ${fieldInputClass}`} />
          <Input aria-label="Distance" value={draft.distance} onChange={(event) => field("distance", event.target.value)} placeholder="Distance" className={`h-7 w-28 ${fieldInputClass}`} />
          {classSpellCategory(draft.type) === "actif" && <Input type="number" min={0} max={5} aria-label="Charges" value={draft.charges ?? ""} onChange={(event) => field("charges", event.target.value === "" ? null : Math.max(0, Math.min(5, Number(event.target.value))))} placeholder="Charges" className={`h-7 w-20 ${fieldInputClass}`} />}
        </div>
        <ClassLinksEditor draft={draft} classes={classes} spells={allSpells} rowNumber={spell.rowNumber} onChange={(classRanks) => field("classRanks", classRanks)} />
      </div>
    </div>
    <div className="mt-3 flex flex-wrap justify-end gap-2">{actions}</div>
    {showMatches && <Similarities spell={spell} allSpells={allSpells} similarities={similarities} />}
  </article>

  return <article className="rounded-xl border bg-background/60 p-3" style={{ borderColor: `${tone.background}55` }}>
    <div className="grid items-start gap-3 xl:grid-cols-[minmax(18rem,1.5fr)_minmax(11rem,.8fr)_minmax(9rem,.7fr)_7rem_6rem_minmax(14rem,1.1fr)_auto]">
      <div>
        <Input aria-label="Nom du sort" value={draft.name} onChange={(event) => field("name", event.target.value)} className={`font-semibold ${fieldInputClass}`} />
        <blockquote className="mt-2 border-l-2 pl-2" style={{ borderColor: tone.background }}>
          <RichTextEditorField value={draft.effectHtml || draft.effect} onChange={(html) => setDraft((current) => ({ ...current, effect: plainText(html), effectHtml: html }))} className="text-xs" />
          <RichTextEditorField value={draft.descriptionHtml || draft.description} onChange={(html) => setDraft((current) => ({ ...current, description: plainText(html), descriptionHtml: html }))} className="mt-1 text-xs text-muted-foreground" />
        </blockquote>
      </div>
      <Input list="class-spell-types" aria-label="Type" value={draft.type} onChange={(event) => field("type", event.target.value)} className={`h-9 self-start text-xs ${fieldInputClass}`} />
      <Input aria-label="Compétences" value={draft.skillsRaw} onChange={(event) => field("skillsRaw", event.target.value)} className={`h-9 self-start text-xs font-semibold text-[#b3261e] ${fieldInputClass}`} />
      <Input aria-label="Distance" value={draft.distance} onChange={(event) => field("distance", event.target.value)} className={`h-9 self-start text-xs ${fieldInputClass}`} />
      {classSpellCategory(draft.type) === "actif" ? <Input type="number" min={0} max={5} aria-label="Charges" value={draft.charges ?? ""} onChange={(event) => field("charges", event.target.value === "" ? null : Math.max(0, Math.min(5, Number(event.target.value))))} className={`h-9 self-start text-xs ${fieldInputClass}`} /> : <span className="flex min-h-9 items-center text-xs text-muted-foreground">—</span>}
      <div><ClassLinksEditor draft={draft} classes={classes} spells={allSpells} rowNumber={spell.rowNumber} onChange={(classRanks) => field("classRanks", classRanks)} /></div>
      <div className="flex items-start justify-end gap-1">{actions}</div>
    </div>
    {showMatches && <Similarities spell={spell} allSpells={allSpells} similarities={similarities} />}
  </article>
}

function SearchExisting({ classId, rank, spells, pending, onClose, onLink }: { classId: string; rank: number; spells: ClassSpell[]; pending: boolean; onClose: () => void; onLink: (spell: ClassSpell) => void }) {
  const [query, setQuery] = useState("")
  const normalized = query.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("fr").trim()
  const results = spells.filter((spell) => spell.classRanks[classId] !== rank && (!normalized || searchText(spell).includes(normalized))).slice(0, 40)
  return <div className="mb-3 rounded-xl border bg-card/75 p-3"><div className="flex items-center gap-2"><div className="relative flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Titre, compétence, type, effet ou description…" className="pl-9" /></div><Button type="button" variant="ghost" size="icon-sm" onClick={onClose}><X /></Button></div><div className="mt-2 grid max-h-80 gap-2 overflow-y-auto md:grid-cols-2">{results.map((spell) => <button key={spell.id} type="button" disabled={pending} onClick={() => onLink(spell)} className="rounded-lg border bg-background/55 p-3 text-left hover:bg-muted/45"><span className="flex flex-wrap items-center gap-2"><b>{spell.name}</b><Badge variant="outline">{spell.type}</Badge>{spell.category === "actif" && <SpellChargeStars total={spell.charges} />}</span>{spell.skills.length > 0 && <span className="mt-1 block text-xs font-semibold text-[#b3261e]">{spell.skills.join(" · ")}</span>}<blockquote className="mt-1 line-clamp-2 border-l-2 pl-2 text-xs text-muted-foreground">{spell.effect || spell.description || "Aucun texte"}</blockquote></button>)}</div>{!results.length && <p className="py-5 text-center text-xs text-muted-foreground">Aucun sort correspondant.</p>}</div>
}

export function ClassIndexManager({ initialData, initialError }: { initialData: ResourceData; initialError: string }) {
  const [data, setData] = useState(initialData)
  const [error, setError] = useState(initialError)
  const [pending, setPending] = useState(false)
  const [query, setQuery] = useState("")
  const [tab, setTab] = useState("classes")
  const [selectedClassId, setSelectedClassId] = useState(initialData.classes[0]?.id || "")
  const [newDraft, setNewDraft] = useState<ClassSpellDraft | null>(null)
  const [searchRank, setSearchRank] = useState<number | null>(null)
  const normalizedQuery = query.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("fr").trim()
  const filtered = useMemo(() => data.spells.filter((spell) => !normalizedQuery || searchText(spell).includes(normalizedQuery)), [data.spells, normalizedQuery])
  const selectedClass = data.classes.find((item) => item.id === selectedClassId) || data.classes[0]

  function updateSpells(updater: (spells: ClassSpell[]) => ClassSpell[]) {
    setData((current) => { const spells = updater(current.spells); return { ...current, spells, similarities: findClassSpellSimilarities(spells) } })
  }

  async function mutate(body: Record<string, unknown>): Promise<MutationResult | false> {
    setPending(true); setError("")
    try {
      const response = await fetch("/api/resources/class-index", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })
      const payload = await response.json() as { result?: MutationResult; error?: string }
      if (!response.ok) throw new Error(payload.error || "Enregistrement impossible.")
      return payload.result ?? null
    } catch (error) {
      setError(error instanceof Error ? error.message : "Enregistrement impossible.")
      return false
    } finally { setPending(false) }
  }

  async function refresh() {
    setPending(true); setError("")
    try {
      const response = await fetch("/api/resources/class-index?refresh=1", { cache: "no-store" })
      const payload = await response.json() as { data?: ResourceData; error?: string }
      if (!response.ok || !payload.data) throw new Error(payload.error || "Actualisation impossible.")
      setData(payload.data)
    } catch (error) { setError(error instanceof Error ? error.message : "Actualisation impossible.") } finally { setPending(false) }
  }

  async function save(spell: ClassSpell, draft: ClassSpellDraft) {
    const result = await mutate({ action: "update", rowNumber: spell.rowNumber, draft })
    if (result === false) return
    updateSpells((spells) => spells.map((item) => item.rowNumber === spell.rowNumber ? materialize(draft, result?.rowNumber || spell.rowNumber, result?.id || draft.id || spell.id, result?.tone) : item))
  }

  async function create(draft: ClassSpellDraft) {
    const result = await mutate({ action: "add", rowNumber: null, draft })
    if (result === false || !result) return
    updateSpells((spells) => [...spells, materialize(draft, result.rowNumber, result.id, result.tone)])
    setNewDraft(null)
  }

  async function link(spell: ClassSpell, classId: string, rank: number | null) {
    if (rank !== null && rankCount(data.spells, classId, rank, spell.rowNumber) >= MAX_CLASS_SPELLS_PER_RANK) { setError("Ce rang contient déjà trois sorts."); return }
    const result = await mutate({ action: "link", rowNumber: spell.rowNumber, classId, rank })
    if (result === false) return
    updateSpells((spells) => spells.map((item) => item.rowNumber === spell.rowNumber ? { ...item, classRanks: Object.fromEntries(Object.entries({ ...item.classRanks, [classId]: rank }).filter((entry): entry is [string, number] => typeof entry[1] === "number")) } : item))
    setSearchRank(null)
  }

  async function remove(spell: ClassSpell) {
    const result = await mutate({ action: "delete", rowNumber: spell.rowNumber })
    if (result === false) return
    updateSpells((spells) => spells.filter((item) => item.rowNumber !== spell.rowNumber).map((item) => item.rowNumber > spell.rowNumber ? { ...item, rowNumber: item.rowNumber - 1 } : item))
  }

  function startCreate(classId?: string, rank?: number) {
    const draft = emptyDraft()
    if (classId && rank !== undefined) draft.classRanks[classId] = rank
    setNewDraft(draft)
  }

  const editableProps = { classes: data.classes, allSpells: data.spells, similarities: data.similarities, pending, onSave: save, onDelete: remove }
  const tableFor = (spells: ClassSpell[]) => <div className="space-y-3"><div className="hidden grid-cols-[minmax(18rem,1.5fr)_minmax(11rem,.8fr)_minmax(9rem,.7fr)_7rem_6rem_minmax(14rem,1.1fr)_auto] gap-3 px-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground xl:grid"><span>Sort, effet et description</span><span>Type</span><span>Compétences</span><span>Distance</span><span>Charges</span><span>Classes et rangs</span><span>Actions</span></div>{spells.map((spell) => <EditableSpell key={`${spell.rowNumber}:${spell.id}`} spell={spell} {...editableProps} />)}{!spells.length && <p className="rounded-xl border border-dashed px-5 py-10 text-center text-sm text-muted-foreground">Aucun sort dans cette vue.</p>}</div>

  return <section className="mt-8">
    <datalist id="class-spell-types">{classSpellTypeSuggestions.map((type) => <option key={type} value={type} />)}</datalist>
    <div className="flex flex-col gap-3 rounded-2xl border bg-card/75 p-4 shadow-sm lg:flex-row lg:items-end"><div className="relative min-w-0 flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Titre, compétence, type, effet ou description…" className="pl-9" /></div><div className="flex flex-wrap gap-2"><Button type="button" variant="outline" onClick={() => setTab("duplicates")}><CopyCheck />Voir les doublons</Button>{data.file?.webViewLink && <Button asChild variant="outline"><a href={data.file.webViewLink} target="_blank" rel="noreferrer">Google Sheets <ExternalLink /></a></Button>}<Button type="button" variant="outline" onClick={() => void refresh()} disabled={pending}>{pending ? <LoaderCircle className="animate-spin" /> : <RefreshCw />}Actualiser</Button><Button type="button" onClick={() => startCreate()}><Plus />Créer un sort</Button></div></div>
    {error && <p className="mt-4 rounded-xl border border-destructive/25 bg-destructive/5 px-4 py-3 text-sm text-destructive">{error}</p>}
    {newDraft && Object.keys(newDraft.classRanks).length === 0 && <div className="mt-4"><SpellForm initial={newDraft} classes={data.classes} spells={data.spells} pending={pending} title="Nouveau sort" onCancel={() => setNewDraft(null)} onSave={(draft) => void create(draft)} /></div>}
    <Tabs value={tab} onValueChange={setTab} className="mt-5"><TabsList variant="line" className="h-auto w-full flex-wrap justify-start"><TabsTrigger value="classes">Par classe</TabsTrigger><TabsTrigger value="actifs">Actifs</TabsTrigger><TabsTrigger value="passifs">Passifs</TabsTrigger><TabsTrigger value="bonus">Bonus</TabsTrigger><TabsTrigger value="duplicates">Doublons et ressemblances {data.similarities.length > 0 && <Badge variant="destructive">{data.similarities.length}</Badge>}</TabsTrigger></TabsList>
      <TabsContent value="classes" className="mt-5"><label className="mb-5 grid max-w-sm gap-1.5 text-sm font-medium">Classe<NativeSelect value={selectedClass?.id || ""} onChange={(event) => { setSelectedClassId(event.target.value); setNewDraft(null); setSearchRank(null) }}>{data.classes.map((item) => <NativeSelectOption key={item.id} value={item.id}>{item.name}</NativeSelectOption>)}</NativeSelect></label>{selectedClass ? <div className="space-y-8">{Array.from({ length: 21 }, (_, rank) => { const allAtRank = data.spells.filter((spell) => spell.classRanks[selectedClass.id] === rank); const shown = filtered.filter((spell) => spell.classRanks[selectedClass.id] === rank); const full = allAtRank.length >= MAX_CLASS_SPELLS_PER_RANK; return <section key={rank} className="rounded-2xl border bg-background/25 p-4" style={{ borderColor: `${selectedClass.accentDark}32` }}><div className="mb-3 flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-2"><span className="flex size-8 items-center justify-center rounded-full text-xs font-bold" style={{ color: selectedClass.accentDark, backgroundColor: `${selectedClass.accentLight}45` }}>{rank === 0 ? "C" : rank}</span><div><h3 className="font-display text-lg font-semibold">{rankLabel(rank)}</h3><p className={`text-xs ${allAtRank.length > 3 ? "text-destructive" : "text-muted-foreground"}`}>{allAtRank.length} / {MAX_CLASS_SPELLS_PER_RANK} sort{allAtRank.length > 1 ? "s" : ""}{allAtRank.length > 3 ? " — corriger le dépassement" : ""}</p></div></div><div className="flex gap-2"><Button type="button" size="sm" variant="outline" disabled={full} onClick={() => setSearchRank(searchRank === rank ? null : rank)}><Search />Chercher un sort</Button><Button type="button" size="sm" disabled={full} onClick={() => startCreate(selectedClass.id, rank)}><Plus />Créer ici</Button></div></div>{searchRank === rank && <SearchExisting classId={selectedClass.id} rank={rank} spells={data.spells} pending={pending} onClose={() => setSearchRank(null)} onLink={(spell) => void link(spell, selectedClass.id, rank)} />}{newDraft?.classRanks[selectedClass.id] === rank && <div className="mb-3"><SpellForm initial={newDraft} classes={data.classes} spells={data.spells} pending={pending} title={`Nouveau sort — ${rankLabel(rank)}`} onCancel={() => setNewDraft(null)} onSave={(draft) => void create(draft)} /></div>}<div className="grid gap-3 xl:grid-cols-3">{shown.map((spell) => <EditableSpell compact key={`${spell.rowNumber}:${spell.id}`} spell={spell} {...editableProps} />)}</div>{!shown.length && <p className="rounded-xl border border-dashed px-4 py-5 text-center text-sm text-muted-foreground">{normalizedQuery ? "Aucun résultat dans ce rang." : "Ce rang est vide."}</p>}</section> })}</div> : <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">Aucune classe disponible.</p>}</TabsContent>
      <TabsContent value="actifs" className="mt-5">{tableFor(filtered.filter((spell) => spell.category === "actif"))}</TabsContent>
      <TabsContent value="passifs" className="mt-5">{tableFor(filtered.filter((spell) => spell.category === "passif"))}</TabsContent>
      <TabsContent value="bonus" className="mt-5">{tableFor(filtered.filter((spell) => spell.category === "bonus"))}</TabsContent>
      <TabsContent value="duplicates" className="mt-5"><div className="space-y-3">{data.similarities.map((match) => { const left = data.spells.find((spell) => spell.id === match.leftId); const right = data.spells.find((spell) => spell.id === match.rightId); if (!left || !right) return null; return <article key={`${match.leftId}:${match.rightId}`} className="rounded-2xl border bg-card/70 p-4"><div className="flex items-center gap-2"><AlertTriangle className="size-4 text-amber-600" /><Badge variant={match.kind === "Doublon exact" ? "destructive" : "outline"}>{match.kind}</Badge><span className="text-xs text-muted-foreground">{Math.round(match.score * 100)} %</span></div><div className="mt-3 grid gap-3 md:grid-cols-2">{[left, right].map((spell) => <div key={spell.id} className="rounded-xl border p-3"><b>{spell.name}</b><p className="mt-1 text-xs font-semibold text-[#b3261e]">{spell.skills.join(" · ")}</p><blockquote className="mt-2 border-l-2 pl-2 text-xs text-muted-foreground">{spell.effect || spell.description}</blockquote></div>)}</div></article> })}{!data.similarities.length && <div className="rounded-2xl border border-dashed px-5 py-12 text-center text-sm text-muted-foreground">Aucun doublon ni sort très proche détecté.</div>}</div></TabsContent>
    </Tabs>
  </section>
}
