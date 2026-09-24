"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Check, CircleDotDashed, CopyCheck, Gauge, LoaderCircle, Plus, RefreshCw, Search, Trash2, X, Zap } from "lucide-react"

import { RichTextField } from "@/components/eraser/rich-text"
import { SheetGrid, type SheetGridColumn } from "@/components/eraser/sheet-grid"
import { SpellChargeStars } from "@/components/eraser/spell-charges"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { ContextMenuItem, ContextMenuSeparator } from "@/components/ui/context-menu"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { usePersistentState } from "@/hooks/use-persistent-state"
import type { ClassSpell, ClassSpellDraft, SpellSimilarity } from "@/lib/class-content"
import { classSpellActionKind, classSpellCategory, classSpellCategoryTones, classSpellTypeSuggestions, findClassSpellSimilarities, MAX_CLASS_SPELLS_PER_RANK, splitClassSpellSkills, UNNAMED_CLASS_SPELL } from "@/lib/class-spell-utils"
import type { ClassRecord } from "@/lib/google-sheets"
import { groupSimilarities, SpellDuplicates, type SpellGroup } from "@/components/eraser/spell-duplicates"

type ResourceData = { classes: ClassRecord[]; spells: ClassSpell[]; similarities: SpellSimilarity[]; headers: string[]; file: { id: string; name: string; webViewLink?: string } | null }
type MutationResult = { id: string; rowNumber: number; tone: { background: string; foreground: string } } | null

function pairKey(left: string, right: string) {
  return [left, right].sort().join("|")
}

/** Les paires que le serveur a écartées : calculées localement, absentes de sa liste. */
function ignoredPairsOf(data: ResourceData) {
  const reported = new Set(data.similarities.map((match) => pairKey(match.leftId, match.rightId)))
  return new Set(findClassSpellSimilarities(data.spells).map((match) => pairKey(match.leftId, match.rightId)).filter((key) => !reported.has(key)))
}

function emptyDraft(): ClassSpellDraft {
  return { id: "", name: "", effect: "", effectHtml: "", description: "", descriptionHtml: "", type: "Passif", skillsRaw: "", distance: "", charges: null, classRanks: {} }
}

function toDraft(spell: ClassSpell): ClassSpellDraft {
  return { id: spell.id.startsWith("LIGNE-") ? "" : spell.id, name: spell.name === UNNAMED_CLASS_SPELL ? "" : spell.name, effect: spell.effect, effectHtml: spell.effectHtml, description: spell.description, descriptionHtml: spell.descriptionHtml, type: spell.type, skillsRaw: spell.skillsRaw, distance: spell.distance, charges: spell.charges, classRanks: { ...spell.classRanks } }
}

/** Un sort peut ne pas avoir de titre, mais pas être entièrement vide. */
function hasContent(draft: ClassSpellDraft) {
  return Boolean(draft.name.trim() || draft.effect.trim() || draft.description.trim())
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
  return { rowNumber, id, name: draft.name.trim() || UNNAMED_CLASS_SPELL, effect: draft.effect, effectHtml: draft.effectHtml || draft.effect, description: draft.description, descriptionHtml: draft.descriptionHtml || draft.description, type: draft.type, category, actionKind: classSpellActionKind(draft.type), skillsRaw: draft.skillsRaw, skills: splitClassSpellSkills(draft.skillsRaw), distance: draft.distance, charges: draft.charges, classRanks, tone: tone || classSpellCategoryTones[category] }
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

function fold(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("fr").trim()
}

/**
 * « Classes et rangs » tient désormais dans une cellule : chaque lien est une pastille
 * aux couleurs de la classe, avec son rang modifiable sur place, et un seul bouton
 * ouvre une liste de classes cherchable pour en ajouter une.
 */
function ClassLinksEditor({ draft, classes, spells, rowNumber, compact = false, onChange }: { draft: ClassSpellDraft; classes: ClassRecord[]; spells: ClassSpell[]; rowNumber?: number; compact?: boolean; onChange: (value: Record<string, number | null>) => void }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [rank, setRank] = useState(0)
  const linked = Object.entries(draft.classRanks).flatMap(([classId, linkedRank]) => linkedRank === null ? [] : [[classId, linkedRank] as const])
  const available = classes.filter((item) => draft.classRanks[item.id] === undefined || draft.classRanks[item.id] === null)
  const matches = available.filter((item) => !fold(query) || fold(item.name).includes(fold(query)))
  const full = (classId: string, candidate: number) => rankCount(spells, classId, candidate, rowNumber) >= MAX_CLASS_SPELLS_PER_RANK

  function add(classId: string) {
    onChange({ ...draft.classRanks, [classId]: rank })
    setOpen(false); setQuery("")
  }

  return <div className={`flex flex-wrap items-center gap-1 ${compact ? "" : "py-0.5"}`}>
    {linked.map(([classId, linkedRank]) => {
      const characterClass = classes.find((item) => item.id === classId)
      const accent = characterClass?.accentDark || "#7f5a3a"
      return <span key={classId} className="inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[11px] font-semibold" style={{ borderColor: `${accent}55`, backgroundColor: `${accent}14`, color: accent }}>
        <span className="max-w-28 truncate">{characterClass?.name || classId}</span>
        <select
          aria-label={`Rang de ${characterClass?.name || classId}`}
          value={linkedRank}
          onChange={(event) => onChange({ ...draft.classRanks, [classId]: Number(event.target.value) })}
          className="cursor-pointer rounded bg-transparent text-[11px] font-bold outline-none"
          style={{ color: accent }}
        >
          <option value="0" disabled={linkedRank !== 0 && full(classId, 0)}>C</option>
          {Array.from({ length: 20 }, (_, index) => <option key={index + 1} value={index + 1} disabled={linkedRank !== index + 1 && full(classId, index + 1)}>R{index + 1}</option>)}
        </select>
        <button type="button" onClick={() => onChange({ ...draft.classRanks, [classId]: null })} className="rounded-full p-0.5 hover:bg-destructive/15 hover:text-destructive" aria-label={`Délier ${characterClass?.name || classId}`}><X className="size-3" /></button>
      </span>
    })}
    <Popover open={open} onOpenChange={(next) => { setOpen(next); if (next) { setQuery(""); setRank(0) } }}>
      <PopoverTrigger asChild>
        <button type="button" disabled={!available.length} className="inline-flex items-center gap-1 rounded-full border border-dashed px-2 py-0.5 text-[11px] font-semibold text-muted-foreground hover:border-primary hover:text-primary disabled:opacity-40" title="Lier une classe"><Plus className="size-3" />Classe</button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-0">
        <div className="flex items-center gap-2 border-b p-2">
          <div className="relative min-w-0 flex-1"><Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" /><Input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Classe…" className="h-8 border-0 bg-muted/45 pl-8 text-sm shadow-none" /></div>
          <NativeSelect aria-label="Rang du lien" value={rank} onChange={(event) => setRank(Number(event.target.value))} className="h-8 w-20 text-xs"><NativeSelectOption value="0">Commun</NativeSelectOption>{Array.from({ length: 20 }, (_, index) => <NativeSelectOption key={index + 1} value={index + 1}>Rang {index + 1}</NativeSelectOption>)}</NativeSelect>
        </div>
        <div className="max-h-60 overflow-y-auto p-1">
          {matches.map((item) => {
            const blocked = full(item.id, rank)
            return <button key={item.id} type="button" disabled={blocked} onClick={() => add(item.id)} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent disabled:opacity-45" title={blocked ? "Ce rang contient déjà trois sorts" : undefined}>
              <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: item.accentDark }} />
              <span className="min-w-0 flex-1 truncate">{item.name}</span>
              {blocked && <span className="text-[10px] text-destructive">rang plein</span>}
            </button>
          })}
          {!matches.length && <p className="px-3 py-5 text-center text-xs text-muted-foreground">Aucune classe disponible.</p>}
        </div>
      </PopoverContent>
    </Popover>
  </div>
}

function SpellForm({ initial, classes, spells, pending, title, onCancel, onSave }: { initial: ClassSpellDraft; classes: ClassRecord[]; spells: ClassSpell[]; pending: boolean; title: string; onCancel: () => void; onSave: (draft: ClassSpellDraft) => void }) {
  const [draft, setDraft] = useState(initial)
  const field = <K extends keyof ClassSpellDraft>(key: K, value: ClassSpellDraft[K]) => setDraft((current) => ({ ...current, [key]: value }))
  return <section className="rounded-2xl border bg-card/90 p-4 shadow-sm">
    <div className="flex items-center justify-between gap-3"><h3 className="font-display text-xl font-semibold">{title}</h3><Button type="button" variant="ghost" size="icon-sm" onClick={onCancel} aria-label="Fermer"><X /></Button></div>
    <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      <label className="grid gap-1 text-xs font-semibold">ID<Input value={draft.id} onChange={(event) => field("id", event.target.value)} placeholder="Généré si vide" /></label>
      <label className="grid gap-1 text-xs font-semibold md:col-span-1 xl:col-span-2">Nom<Input value={draft.name} onChange={(event) => field("name", event.target.value)} placeholder="Sans titre" /></label>
      <label className="grid gap-1 text-xs font-semibold">Type exact<Input list="class-spell-types" value={draft.type} onChange={(event) => field("type", event.target.value)} /></label>
      <label className="grid gap-1 text-xs font-semibold">Compétences<Input value={draft.skillsRaw} onChange={(event) => field("skillsRaw", event.target.value)} className="text-[#b3261e]" /></label>
      <label className="grid gap-1 text-xs font-semibold">Distance<Input value={draft.distance} onChange={(event) => field("distance", event.target.value)} /></label>
      <label className="grid gap-1 text-xs font-semibold">Charges{classSpellCategory(draft.type) === "actif" ? <Input type="number" min={0} max={5} value={draft.charges ?? ""} onChange={(event) => field("charges", event.target.value === "" ? null : Math.max(0, Math.min(5, Number(event.target.value))))} /> : <span className="flex min-h-9 items-center text-muted-foreground">—</span>}</label>
      <div className="md:col-span-2 xl:col-span-1"><p className="mb-1 text-xs font-semibold">Classes et rangs</p><ClassLinksEditor draft={draft} classes={classes} spells={spells} onChange={(classRanks) => field("classRanks", classRanks)} /></div>
      <div className="grid gap-1 text-xs font-semibold md:col-span-2">Effet<RichTextField ariaLabel="Effet" value={draft.effectHtml || draft.effect} onCommit={(html) => setDraft((current) => ({ ...current, effect: plainText(html), effectHtml: html }))} /></div>
      <div className="grid gap-1 text-xs font-semibold md:col-span-2">Description<RichTextField ariaLabel="Description" value={draft.descriptionHtml || draft.description} onCommit={(html) => setDraft((current) => ({ ...current, description: plainText(html), descriptionHtml: html }))} /></div>
    </div>
    <div className="mt-4 flex justify-end gap-2"><Button type="button" variant="outline" onClick={onCancel}>Annuler</Button><Button type="button" onClick={() => onSave(draft)} disabled={pending || !hasContent(draft)}>{pending ? <LoaderCircle className="animate-spin" /> : <Check />}Enregistrer</Button></div>
  </section>
}

const fieldInputClass = "border-transparent bg-transparent px-1.5 shadow-none focus-visible:border-input focus-visible:bg-background"

type SaveStatus = "idle" | "saving" | "saved" | "error"

// Chaque champ est toujours un input : cliquer dedans modifie seulement ce champ,
// jamais toute la ligne. Il n'y a plus de bouton Enregistrer : le sort s'enregistre
// seul après une courte pause de frappe, quand on quitte la page ou change de classe,
// et l'état de l'enregistrement s'affiche à la place du bouton.
function EditableSpell({ spell, classes, allSpells, similarities, onSave, onDelete, onShowDuplicates }: { spell: ClassSpell; classes: ClassRecord[]; allSpells: ClassSpell[]; similarities: SpellSimilarity[]; onSave: (spell: ClassSpell, draft: ClassSpellDraft) => Promise<ClassSpell | null>; onDelete: (spell: ClassSpell) => void; onShowDuplicates: (spell: ClassSpell) => void }) {
  const [draft, setDraft] = useState(() => toDraft(spell))
  const [status, setStatus] = useState<SaveStatus>("idle")
  const matchCount = similarities.filter((item) => item.leftId === spell.id || item.rightId === spell.id).length
  const [confirmDelete, setConfirmDelete] = useState(false)
  const tone = spell.tone.background ? spell.tone : classSpellCategoryTones[spell.category]
  const persisted = useMemo(() => JSON.stringify(toDraft(spell)), [spell])
  const serialized = JSON.stringify(draft)
  const changed = serialized !== persisted
  const field = <K extends keyof ClassSpellDraft>(key: K, value: ClassSpellDraft[K]) => setDraft((current) => ({ ...current, [key]: value }))
  // Un seul envoi à la fois ; le dernier brouillon envoyé (ou refusé) n'est pas renvoyé.
  const saving = useRef(false)
  const lastSent = useRef<string | null>(null)
  const latest = useRef({ spell, draft, changed, onSave })
  useEffect(() => { latest.current = { spell, draft, changed, onSave } })

  const flush = useCallback(async () => {
    const current = latest.current
    if (!current.changed || saving.current) return
    const sent = JSON.stringify(current.draft)
    saving.current = true
    lastSent.current = sent
    setStatus("saving")
    const saved = await current.onSave(current.spell, current.draft)
    saving.current = false
    setStatus(saved ? "saved" : "error")
    // Le brouillon repart du sort tel qu'enregistré, s'il n'a pas bougé pendant l'envoi :
    // sans cela, une différence de forme (espaces, ID généré) relançait un second envoi.
    if (saved) setDraft((value) => JSON.stringify(value) === sent ? toDraft(saved) : value)
  }, [])

  // Une courte pause de frappe regroupe les changements en un seul envoi. Un envoi
  // refusé n'est retenté qu'après une nouvelle modification (ou avec « Réessayer »).
  useEffect(() => {
    if (!changed || status === "saving" || (status === "error" && serialized === lastSent.current)) return
    const timer = window.setTimeout(() => void flush(), 700)
    return () => window.clearTimeout(timer)
  }, [changed, flush, serialized, status])

  // Changer de classe, d'onglet ou de page ne perd pas une modification en attente.
  useEffect(() => () => {
    const current = latest.current
    if (current.changed && !saving.current && JSON.stringify(current.draft) !== lastSent.current) void current.onSave(current.spell, current.draft)
  }, [])

  const statusLabel = status === "saving" || (changed && status !== "error")
    ? <span className="flex items-center gap-1.5 text-xs text-muted-foreground"><LoaderCircle className="size-3.5 animate-spin" />Enregistrement…</span>
    : status === "error" && changed
      ? <span className="flex items-center gap-2 text-xs text-destructive">Non enregistré<Button type="button" size="sm" variant="outline" onClick={() => { lastSent.current = null; void flush() }}><RefreshCw />Réessayer</Button></span>
      : status === "saved" ? <span className="flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-400"><Check className="size-3.5" />Enregistré</span> : null
  const actions = <>
    {statusLabel}
    {matchCount > 0 && <Button type="button" size="sm" variant="outline" onClick={() => onShowDuplicates(spell)} title="Comparer et fusionner les sorts semblables"><CopyCheck />{matchCount} doublon{matchCount > 1 ? "s" : ""}</Button>}
    {confirmDelete ? <><Button type="button" size="sm" variant="destructive" onClick={() => onDelete(spell)}>Confirmer</Button><Button type="button" size="icon-sm" variant="ghost" onClick={() => setConfirmDelete(false)}><X /></Button></> : <Button type="button" size="icon-sm" variant="ghost" className="text-destructive" onClick={() => setConfirmDelete(true)} title="Supprimer"><Trash2 /></Button>}
  </>

  return <article className="rounded-xl border bg-card/75 p-4 shadow-sm" style={{ borderColor: `${tone.background}66` }}>
    <div className="flex items-start gap-3">
      <span className="mt-1.5 flex size-8 shrink-0 items-center justify-center rounded-lg" style={{ backgroundColor: tone.background, color: tone.foreground }}><TypeGlyph category={classSpellCategory(draft.type)} /></span>
      <div className="min-w-0 flex-1 space-y-2">
        <Input aria-label="Nom du sort" value={draft.name} onChange={(event) => field("name", event.target.value)} placeholder="Sans titre" className={`h-9 font-display text-lg font-semibold placeholder:italic placeholder:font-normal ${fieldInputClass}`} />
        <Input list="class-spell-types" aria-label="Type" value={draft.type} onChange={(event) => field("type", event.target.value)} placeholder="Type" className={`h-7 w-fit min-w-28 rounded-full text-xs font-semibold ${fieldInputClass}`} style={{ backgroundColor: `${tone.background}1c` }} />
        <blockquote className="border-l-2 pl-3 text-sm leading-6" style={{ borderColor: tone.background }}>
          <RichTextField value={draft.effectHtml || draft.effect} onCommit={(html) => setDraft((current) => ({ ...current, effect: plainText(html), effectHtml: html }))} />
          <RichTextField value={draft.descriptionHtml || draft.description} onCommit={(html) => setDraft((current) => ({ ...current, description: plainText(html), descriptionHtml: html }))} className="mt-1 text-muted-foreground" />
        </blockquote>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Input aria-label="Compétences" value={draft.skillsRaw} onChange={(event) => field("skillsRaw", event.target.value)} placeholder="Compétences" className={`h-7 min-w-32 flex-1 font-semibold text-[#b3261e] ${fieldInputClass}`} />
          <Input aria-label="Distance" value={draft.distance} onChange={(event) => field("distance", event.target.value)} placeholder="Distance" className={`h-7 w-28 ${fieldInputClass}`} />
          {classSpellCategory(draft.type) === "actif" && <Input type="number" min={0} max={5} aria-label="Charges" value={draft.charges ?? ""} onChange={(event) => field("charges", event.target.value === "" ? null : Math.max(0, Math.min(5, Number(event.target.value))))} placeholder="Charges" className={`h-7 w-20 ${fieldInputClass}`} />}
        </div>
        <ClassLinksEditor compact draft={draft} classes={classes} spells={allSpells} rowNumber={spell.rowNumber} onChange={(classRanks) => field("classRanks", classRanks)} />
      </div>
    </div>
    <div className="mt-3 flex min-h-8 flex-wrap items-center justify-end gap-2">{actions}</div>
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
  // Les enregistrements déclenchés par la frappe ne bloquent pas le tableau :
  // ils s'annoncent dans la barre d'outils et laissent les cellules modifiables.
  const [cellSaves, setCellSaves] = useState(0)
  // Remonte les cellules seulement quand les lignes changent réellement (actualisation,
  // création, suppression) : une frappe enregistrée ne doit rien remonter.
  const [version, setVersion] = useState(0)
  const [query, setQuery] = useState("")
  const [tab, setTab] = usePersistentState(
    "eraser:class-index:tab", "classes",
    (v): v is string => typeof v === "string",
  )
  const [selectedClassId, setSelectedClassId] = usePersistentState(
    "eraser:class-index:selected-class", initialData.classes[0]?.id || "",
    (v): v is string => typeof v === "string",
  )
  const [newDraft, setNewDraft] = useState<ClassSpellDraft | null>(null)
  // Sort dont on veut voir le groupe de doublons, et sort ouvert dans l'éditeur.
  const [duplicateFocus, setDuplicateFocus] = useState<string | null>(null)
  const [editing, setEditing] = useState<ClassSpell | null>(null)
  const [notice, setNotice] = useState("")
  // Paires marquées « pas des doublons » : le calcul local ne doit pas les ramener.
  const ignoredPairs = useRef(ignoredPairsOf(initialData))
  // Les colonnes modifiées coup sur coup partent ensemble : un seul enregistrement par
  // ligne. Seules les valeurs saisies sont gardées ici, jamais le sort lui-même : le
  // brouillon est reconstruit au dernier moment à partir de l'état courant.
  const pendingEdits = useRef(new Map<number, Record<string, string>>())
  const flushTimers = useRef(new Map<number, number>())
  // L'enregistrement différé lit l'état courant, pas celui du rendu qui l'a programmé.
  const latestSpells = useRef(data.spells)
  useEffect(() => { latestSpells.current = data.spells }, [data.spells])
  const [searchRank, setSearchRank] = useState<number | null>(null)
  const normalizedQuery = query.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("fr").trim()
  const filtered = useMemo(() => data.spells.filter((spell) => !normalizedQuery || searchText(spell).includes(normalizedQuery)), [data.spells, normalizedQuery])
  const selectedClass = data.classes.find((item) => item.id === selectedClassId) || data.classes[0]
  // La grille partagée gère largeurs, hauteurs et mise en forme : le composant
  // ne décrit plus que ses colonnes.
  // Distance et charges ne concernent que les actifs : les colonnes disparaissent
  // ailleurs plutôt que d'occuper la largeur pour rien.
  const spellColumns = useMemo<SheetGridColumn[]>(() => [
    { key: "name", label: "Nom", width: 220, plain: true, cellClassName: "text-sm font-semibold" },
    { key: "effect", label: "Effet", width: 380 },
    { key: "description", label: "Description", width: 380, cellClassName: "text-muted-foreground" },
    { key: "type", label: "Type", width: 150, plain: true },
    { key: "skills", label: "Compétences", width: 200, plain: true, cellClassName: "font-semibold text-[#b3261e]" },
    ...(tab === "actifs" ? [
      { key: "distance", label: "Distance", width: 130, plain: true },
      { key: "charges", label: "Charges", width: 110, plain: true },
    ] as SheetGridColumn[] : []),
    { key: "classes", label: "Classes et rangs", width: 280, custom: true, sortable: false },
  ], [tab])

  function updateSpells(updater: (spells: ClassSpell[]) => ClassSpell[]) {
    setData((current) => { const spells = updater(current.spells); return { ...current, spells, similarities: findClassSpellSimilarities(spells).filter((match) => !ignoredPairs.current.has(pairKey(match.leftId, match.rightId))) } })
  }

  function showDuplicates(spell: ClassSpell) {
    setDuplicateFocus(spell.id)
    setTab("duplicates")
  }

  async function merge(keep: ClassSpell, removed: ClassSpell[], draft: ClassSpellDraft) {
    const result = await mutate({ action: "merge", keep: { rowNumber: keep.rowNumber, id: keep.id }, remove: removed.map((spell) => ({ rowNumber: spell.rowNumber, id: spell.id })), draft }) as (MutationResult & { creatures?: number }) | false
    if (result === false) return false
    await refresh()
    setDuplicateFocus(null)
    setNotice(`Fusion faite : « ${draft.name} » est conservé, ${removed.length} sort${removed.length > 1 ? "s" : ""} supprimé${removed.length > 1 ? "s" : ""}${result?.creatures ? `, ${result.creatures} fiche${result.creatures > 1 ? "s" : ""} de créature mise${result.creatures > 1 ? "s" : ""} à jour` : ""}.`)
    return true
  }

  async function ignore(group: SpellGroup) {
    const pairs = group.pairs.map((pair) => [pair.leftId, pair.rightId] as [string, string])
    const result = await mutate({ action: "ignore", pairs })
    if (result === false) return false
    pairs.forEach(([left, right]) => ignoredPairs.current.add(pairKey(left, right)))
    setData((current) => ({ ...current, similarities: current.similarities.filter((match) => !ignoredPairs.current.has(pairKey(match.leftId, match.rightId))) }))
    setDuplicateFocus(null)
    setNotice("Ces sorts ne seront plus proposés comme doublons.")
    return true
  }

  async function mutate(body: Record<string, unknown>, silent = false): Promise<MutationResult | false> {
    if (silent) setCellSaves((current) => current + 1); else setPending(true)
    setError("")
    try {
      const response = await fetch("/api/resources/class-index", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })
      const payload = await response.json() as { result?: MutationResult; error?: string }
      if (!response.ok) throw new Error(payload.error || "Enregistrement impossible.")
      return payload.result ?? null
    } catch (error) {
      setError(error instanceof Error ? error.message : "Enregistrement impossible.")
      return false
    } finally { if (silent) setCellSaves((current) => Math.max(0, current - 1)); else setPending(false) }
  }

  async function refresh() {
    setPending(true); setError("")
    try {
      const response = await fetch("/api/resources/class-index?refresh=1", { cache: "no-store" })
      const payload = await response.json() as { data?: ResourceData; error?: string }
      if (!response.ok || !payload.data) throw new Error(payload.error || "Actualisation impossible.")
      ignoredPairs.current = ignoredPairsOf(payload.data)
      setData(payload.data)
      setVersion((current) => current + 1)
    } catch (error) { setError(error instanceof Error ? error.message : "Actualisation impossible.") } finally { setPending(false) }
  }

  /** Renvoie le sort tel qu'enregistré, ou `null` si Sheets l'a refusé. */
  async function save(spell: ClassSpell, draft: ClassSpellDraft, silent = false) {
    // L'ID attendu protège d'une ligne déplacée entre-temps directement dans Sheets.
    const result = await mutate({ action: "update", rowNumber: spell.rowNumber, expectedId: spell.id, draft }, silent)
    if (result === false) return null
    const saved = materialize(draft, result?.rowNumber || spell.rowNumber, result?.id || draft.id || spell.id, result?.tone)
    updateSpells((spells) => spells.map((item) => item.rowNumber === spell.rowNumber ? saved : item))
    return saved
  }

  async function create(draft: ClassSpellDraft) {
    const result = await mutate({ action: "add", rowNumber: null, draft })
    if (result === false || !result) return
    updateSpells((spells) => [...spells, materialize(draft, result.rowNumber, result.id, result.tone)])
    setVersion((current) => current + 1)
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
    // Les numéros de ligne suivants se décalent : les cellules doivent être remontées.
    updateSpells((spells) => spells.filter((item) => item.rowNumber !== spell.rowNumber).map((item) => item.rowNumber > spell.rowNumber ? { ...item, rowNumber: item.rowNumber - 1 } : item))
    setVersion((current) => current + 1)
  }

  /** Dupliquer garde tout sauf l'ID, qui est régénéré à la création. */
  async function duplicateRows(rowKeys: string[]) {
    for (const rowKey of rowKeys) {
      const spell = latestSpells.current.find((item) => item.rowNumber === Number(rowKey))
      if (spell) await create({ ...toDraft(spell), id: "", name: `${spell.name} (copie)` })
    }
  }

  /** Du bas vers le haut : supprimer une ligne décale toutes les suivantes. */
  async function removeRows(rowKeys: string[]) {
    const spells = rowKeys.map((rowKey) => latestSpells.current.find((item) => item.rowNumber === Number(rowKey))).filter((spell): spell is ClassSpell => Boolean(spell))
    for (const spell of [...spells].sort((left, right) => right.rowNumber - left.rowNumber)) await remove(spell)
  }

  function startCreate(classId?: string, rank?: number) {
    const draft = emptyDraft()
    if (classId && rank !== undefined) draft.classRanks[classId] = rank
    setNewDraft(draft)
  }

  const editableProps = { classes: data.classes, allSpells: data.spells, similarities: data.similarities, onSave: (spell: ClassSpell, draft: ClassSpellDraft) => save(spell, draft, true), onDelete: remove, onShowDuplicates: showDuplicates }
  const duplicateGroups = useMemo(() => groupSimilarities(data.spells, data.similarities).length, [data.similarities, data.spells])
  const spellByRow = useMemo(() => new Map(data.spells.map((spell) => [spell.rowNumber, spell])), [data.spells])

  const valueOf = useCallback((rowKey: string, columnKey: string) => {
    const spell = spellByRow.get(Number(rowKey))
    if (!spell) return ""
    if (columnKey === "name") return spell.name
    if (columnKey === "effect") return spell.effectHtml || spell.effect
    if (columnKey === "description") return spell.descriptionHtml || spell.description
    if (columnKey === "type") return spell.type
    if (columnKey === "skills") return spell.skillsRaw
    if (columnKey === "distance") return spell.distance
    if (columnKey === "charges") return spell.charges === null ? "" : String(spell.charges)
    return ""
  }, [spellByRow])

  /**
   * Un sort s'enregistre en bloc : chaque colonne modifiée est accumulée dans le même
   * brouillon, puis la ligne part une seule fois. Sans cela, coller une ligne entière
   * déclenchait une sauvegarde par colonne, chacune construite sur l'état précédent,
   * et la dernière écrasait toutes les autres.
   */
  function applyColumn(draft: ClassSpellDraft, columnKey: string, value: string): ClassSpellDraft | null {
    if (columnKey === "name") return { ...draft, name: value }
    if (columnKey === "effect") return { ...draft, effectHtml: value, effect: plainText(value) }
    if (columnKey === "description") return { ...draft, descriptionHtml: value, description: plainText(value) }
    if (columnKey === "type") return { ...draft, type: value }
    if (columnKey === "skills") return { ...draft, skillsRaw: value }
    if (columnKey === "distance") return { ...draft, distance: value }
    if (columnKey === "charges") {
      const parsed = Number.parseInt(value.replace(/[^0-9]/g, ""), 10)
      return { ...draft, charges: Number.isFinite(parsed) ? Math.max(0, Math.min(5, parsed)) : null }
    }
    return null
  }

  /** Applique les colonnes en attente sur le sort tel qu'il est maintenant. */
  function draftWithEdits(spell: ClassSpell, edits: Record<string, string>) {
    return Object.entries(edits).reduce<ClassSpellDraft>((draft, [columnKey, value]) => applyColumn(draft, columnKey, value) ?? draft, toDraft(spell))
  }

  function commitCell(rowKey: string, columnKey: string, value: string) {
    const rowNumber = Number(rowKey)
    if (!applyColumn(emptyDraft(), columnKey, value)) return
    const edits = { ...(pendingEdits.current.get(rowNumber) ?? {}), [columnKey]: value }
    pendingEdits.current.set(rowNumber, edits)
    // Le tableau affiche tout de suite ce qui vient d'être écrit, sans attendre Sheets.
    updateSpells((spells) => spells.map((item) => item.rowNumber === rowNumber ? materialize(draftWithEdits(item, edits), rowNumber, item.id, item.tone) : item))
    const previous = flushTimers.current.get(rowNumber)
    if (previous) window.clearTimeout(previous)
    flushTimers.current.set(rowNumber, window.setTimeout(() => {
      const finalEdits = pendingEdits.current.get(rowNumber)
      pendingEdits.current.delete(rowNumber)
      flushTimers.current.delete(rowNumber)
      const spell = latestSpells.current.find((item) => item.rowNumber === rowNumber)
      if (!spell || !finalEdits) return
      void save(spell, draftWithEdits(spell, finalEdits), true)
    }, 400))
  }

  // Même grille que l'Index des objets : en-têtes figés en haut, barre horizontale
  // en bas de l'écran, cellules toujours modifiables.
  const tableFor = (spells: ClassSpell[]) => <SheetGrid
    layoutKey={`eraser:class-index:spell-grid:${tab}`}
    version={version}
    columns={spellColumns}
    rows={spells.map((spell) => ({ key: String(spell.rowNumber), rowNumber: spell.rowNumber }))}
    valueOf={valueOf}
    onCommit={commitCell}
    toolbarTrailing={cellSaves > 0 ? <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground"><LoaderCircle className="size-3 animate-spin" />Enregistrement…</span> : null}
    empty="Aucun sort dans cette vue."
    renderCustomCell={(rowKey, columnKey) => {
      const spell = spellByRow.get(Number(rowKey))
      if (!spell || columnKey !== "classes") return null
      const draft = toDraft(spell)
      return <ClassLinksEditor compact draft={draft} classes={data.classes} spells={data.spells} rowNumber={spell.rowNumber} onChange={(classRanks) => void save(spell, { ...draft, classRanks }, true)} />
    }}
    addRowLabel="Créer un sort"
    rowCommands={{
      append: () => startCreate(),
      // Un sort a besoin d'un nom : les nouvelles lignes s'appellent « Nouveau sort »,
      // du même type que la ligne choisie, et se renomment directement dans le tableau.
      insertRows: (rowKey, count) => void (async () => {
        const reference = spellByRow.get(Number(rowKey))
        for (let index = 0; index < count; index += 1) await create({ ...emptyDraft(), name: "Nouveau sort", type: reference?.type || "Passif" })
      })(),
      duplicate: (rowKeys) => void duplicateRows(rowKeys),
      remove: (rowKeys) => void removeRows(rowKeys),
    }}
    rowMenuExtras={(rowKey) => {
      const spell = spellByRow.get(Number(rowKey))
      if (!spell) return null
      return <>
        <ContextMenuSeparator />
        <ContextMenuItem onSelect={() => showDuplicates(spell)}><CopyCheck />Doublons et ressemblances</ContextMenuItem>
      </>
    }}
  />

  return <section className="flex flex-col gap-3">
    <datalist id="class-spell-types">{classSpellTypeSuggestions.map((type) => <option key={type} value={type} />)}</datalist>
    <div className="flex shrink-0 flex-col gap-3 rounded-2xl border bg-card/75 p-3 shadow-sm lg:flex-row lg:items-center"><div className="relative min-w-0 flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Titre, compétence, type, effet ou description…" className="pl-9" /></div><div className="flex flex-wrap gap-2"><Button type="button" variant="outline" onClick={() => void refresh()} disabled={pending}>{pending ? <LoaderCircle className="animate-spin" /> : <RefreshCw />}Actualiser</Button><Button type="button" onClick={() => startCreate()}><Plus />Créer un sort</Button></div></div>
    {error && <p className="shrink-0 rounded-xl border border-destructive/25 bg-destructive/5 px-4 py-2.5 text-sm text-destructive">{error}</p>}
    {notice && <p className="flex shrink-0 items-center gap-2 rounded-xl border border-emerald-600/25 bg-emerald-600/5 px-4 py-2.5 text-sm text-emerald-800 dark:text-emerald-300"><Check className="size-4" />{notice}<button type="button" onClick={() => setNotice("")} className="ml-auto text-muted-foreground hover:text-foreground" aria-label="Fermer"><X className="size-4" /></button></p>}
    <Dialog open={Boolean(editing)} onOpenChange={(open) => { if (!open) setEditing(null) }}>
      <DialogContent className="max-h-[92svh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader><DialogTitle>Modifier « {editing?.name} »</DialogTitle></DialogHeader>
        {editing && <SpellForm key={`${editing.rowNumber}:${editing.id}`} initial={toDraft(editing)} classes={data.classes} spells={data.spells} pending={pending} title={`Ligne ${editing.rowNumber}`} onCancel={() => setEditing(null)} onSave={(draft) => void save(editing, draft).then(() => setEditing(null))} />}
      </DialogContent>
    </Dialog>
    {newDraft && Object.keys(newDraft.classRanks).length === 0 && <div className="shrink-0"><SpellForm initial={newDraft} classes={data.classes} spells={data.spells} pending={pending} title="Nouveau sort" onCancel={() => setNewDraft(null)} onSave={(draft) => void create(draft)} /></div>}
    <Tabs value={tab} onValueChange={setTab} className="flex flex-col"><TabsList variant="line" className="h-auto w-full shrink-0 flex-wrap justify-start"><TabsTrigger value="classes">Par classe</TabsTrigger><TabsTrigger value="actifs">Actifs</TabsTrigger><TabsTrigger value="passifs">Passifs</TabsTrigger><TabsTrigger value="bonus">Bonus</TabsTrigger><TabsTrigger value="duplicates">Doublons {duplicateGroups > 0 && <Badge variant="destructive">{duplicateGroups}</Badge>}</TabsTrigger></TabsList>
      <TabsContent value="classes" className="mt-3"><label className="mb-5 grid max-w-sm gap-1.5 text-sm font-medium">Classe<NativeSelect value={selectedClass?.id || ""} onChange={(event) => { setSelectedClassId(event.target.value); setNewDraft(null); setSearchRank(null) }}>{data.classes.map((item) => <NativeSelectOption key={item.id} value={item.id}>{item.name}</NativeSelectOption>)}</NativeSelect></label>{selectedClass ? <div className="space-y-8">{Array.from({ length: 21 }, (_, rank) => { const allAtRank = data.spells.filter((spell) => spell.classRanks[selectedClass.id] === rank); const shown = filtered.filter((spell) => spell.classRanks[selectedClass.id] === rank); const full = allAtRank.length >= MAX_CLASS_SPELLS_PER_RANK; return <section key={rank} className="rounded-2xl border bg-background/25 p-4" style={{ borderColor: `${selectedClass.accentDark}32` }}><div className="mb-3 flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-2"><span className="flex size-8 items-center justify-center rounded-full text-xs font-bold" style={{ color: selectedClass.accentDark, backgroundColor: `${selectedClass.accentLight}45` }}>{rank === 0 ? "C" : rank}</span><div><h3 className="font-display text-lg font-semibold">{rankLabel(rank)}</h3><p className={`text-xs ${allAtRank.length > 3 ? "text-destructive" : "text-muted-foreground"}`}>{allAtRank.length} / {MAX_CLASS_SPELLS_PER_RANK} sort{allAtRank.length > 1 ? "s" : ""}{allAtRank.length > 3 ? " — corriger le dépassement" : ""}</p></div></div><div className="flex gap-2"><Button type="button" size="sm" variant="outline" disabled={full} onClick={() => setSearchRank(searchRank === rank ? null : rank)}><Search />Chercher un sort</Button><Button type="button" size="sm" disabled={full} onClick={() => startCreate(selectedClass.id, rank)}><Plus />Créer ici</Button></div></div>{searchRank === rank && <SearchExisting classId={selectedClass.id} rank={rank} spells={data.spells} pending={pending} onClose={() => setSearchRank(null)} onLink={(spell) => void link(spell, selectedClass.id, rank)} />}{newDraft?.classRanks[selectedClass.id] === rank && <div className="mb-3"><SpellForm initial={newDraft} classes={data.classes} spells={data.spells} pending={pending} title={`Nouveau sort — ${rankLabel(rank)}`} onCancel={() => setNewDraft(null)} onSave={(draft) => void create(draft)} /></div>}<div className="grid gap-3 xl:grid-cols-3">{shown.map((spell) => <EditableSpell key={`${spell.rowNumber}:${version}`} spell={spell} {...editableProps} />)}</div>{!shown.length && <p className="rounded-xl border border-dashed px-4 py-5 text-center text-sm text-muted-foreground">{normalizedQuery ? "Aucun résultat dans ce rang." : "Ce rang est vide."}</p>}</section> })}</div> : <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">Aucune classe disponible.</p>}</TabsContent>
      <TabsContent value="actifs" className="mt-3">{tableFor(filtered.filter((spell) => spell.category === "actif"))}</TabsContent>
      <TabsContent value="passifs" className="mt-3">{tableFor(filtered.filter((spell) => spell.category === "passif"))}</TabsContent>
      <TabsContent value="bonus" className="mt-3">{tableFor(filtered.filter((spell) => spell.category === "bonus"))}</TabsContent>
      <TabsContent value="duplicates" className="mt-3"><SpellDuplicates key={duplicateFocus ?? "tous"} spells={data.spells} classes={data.classes} similarities={data.similarities} focusSpellId={duplicateFocus} pending={pending} onMerge={merge} onIgnore={ignore} onEdit={setEditing} onDelete={remove} /></TabsContent>
    </Tabs>
  </section>
}
