"use client"

import { useMemo, useState, type DragEvent, type MouseEvent } from "react"
import { usePersistentState } from "@/hooks/use-persistent-state"
import { Check, ChevronDown, CircleDotDashed, Crosshair, Gauge, GripVertical, Plus, RotateCcw, Search, Trash2, Undo2, X, Zap } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { InlineEdit } from "@/components/eraser/inline-edit"
import { RichTextInlineEditor } from "@/components/eraser/rich-text"
import { SpellChargeStars } from "@/components/eraser/spell-charges"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import type { ClassSpell } from "@/lib/class-content"
import { classSpellActionKind, classSpellCategory, splitClassSpellSkills } from "@/lib/class-spell-utils"
import { normalizeClassLabel } from "@/lib/class-utils"
import type { ClassRecord } from "@/lib/google-sheets"

const categoryTone = { actif: { background: "#7f1d1d", foreground: "#fff7ed" }, passif: { background: "#315b55", foreground: "#f0fdfa" }, bonus: { background: "#795a12", foreground: "#fffbeb" } }

function spellTone(spell: ClassSpell) {
  return spell.tone.background ? { background: spell.tone.background, foreground: spell.tone.foreground || "#fff" } : categoryTone[spell.category]
}

/** Ce qu'un joueur a changé sur un sort, pour son personnage seulement. */
export type CharacterSpellEdit = Partial<Pick<ClassSpell, "name" | "type" | "effect" | "effectHtml" | "description" | "descriptionHtml" | "skillsRaw" | "distance" | "charges">>

export type CharacterClassChoices = {
  choices: Record<string, Record<string, string>>
  charges: Record<string, number>
  extras: string[]
  order: string[]
  /** Versions personnelles des sorts, par identifiant : l'index des sorts n'est jamais touché. */
  edits: Record<string, CharacterSpellEdit>
  /** Sorts retirés de la fiche (acquis par la classe ou ajoutés à la main). */
  removed: string[]
}

const editableTextFields = ["name", "type", "effect", "effectHtml", "description", "descriptionHtml", "skillsRaw", "distance"] as const

function parseSpellEdits(value: unknown): CharacterClassChoices["edits"] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {}
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).flatMap(([id, raw]) => {
    if (!raw || typeof raw !== "object") return []
    const source = raw as Record<string, unknown>
    const edit: CharacterSpellEdit = {}
    for (const key of editableTextFields) if (typeof source[key] === "string") edit[key] = source[key] as string
    if (source.charges === null || (typeof source.charges === "number" && Number.isFinite(source.charges))) edit.charges = source.charges as number | null
    return Object.keys(edit).length ? [[id, edit]] : []
  }))
}

export function parseClassChoices(value: string): CharacterClassChoices {
  try {
    const parsed = JSON.parse(value) as Partial<CharacterClassChoices>
    return {
      choices: parsed && typeof parsed.choices === "object" && parsed.choices ? parsed.choices as CharacterClassChoices["choices"] : {},
      charges: parsed && typeof parsed.charges === "object" && parsed.charges ? parsed.charges as CharacterClassChoices["charges"] : {},
      extras: parsed && Array.isArray(parsed.extras) ? parsed.extras.filter((item): item is string => typeof item === "string") : [],
      order: parsed && Array.isArray(parsed.order) ? parsed.order.filter((item): item is string => typeof item === "string") : [],
      edits: parseSpellEdits(parsed?.edits),
      removed: parsed && Array.isArray(parsed.removed) ? parsed.removed.filter((item): item is string => typeof item === "string") : [],
    }
  } catch {
    return { choices: {}, charges: {}, extras: [], order: [], edits: {}, removed: [] }
  }
}

/** Le sort tel que ce personnage le connaît : la version de l'index, plus ses changements. */
export function personalizeSpell(spell: ClassSpell, edit: CharacterSpellEdit | undefined): ClassSpell {
  if (!edit) return spell
  const next = { ...spell, ...edit }
  if (edit.skillsRaw !== undefined) next.skills = splitClassSpellSkills(edit.skillsRaw)
  if (edit.type !== undefined) {
    next.category = classSpellCategory(edit.type)
    next.actionKind = classSpellActionKind(edit.type)
  }
  if (!next.name.trim()) next.name = spell.name
  return next
}

function plainText(html: string) {
  return html.replace(/<br\s*\/?>/gi, "\n").replace(/<\/p>|<\/div>|<\/li>/gi, "\n").replace(/<[^>]+>/g, "").replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").trim()
}

/**
 * Ajoute un changement à la version personnelle d'un sort. Un champ revenu à la valeur
 * de l'index n'est plus retenu ; un sort sans différence n'a plus de version personnelle.
 */
function mergeSpellEdit(original: ClassSpell, current: CharacterSpellEdit | undefined, patch: CharacterSpellEdit): CharacterSpellEdit | undefined {
  const next: CharacterSpellEdit = { ...current, ...patch }
  for (const key of ["name", "type", "skillsRaw", "distance"] as const) if (next[key] !== undefined && next[key] === original[key]) delete next[key]
  if (next.charges !== undefined && next.charges === original.charges) delete next.charges
  for (const [html, text] of [["effectHtml", "effect"], ["descriptionHtml", "description"]] as const) {
    if (next[html] !== undefined && next[html] === (original[html] || original[text])) { delete next[html]; delete next[text] }
  }
  return Object.keys(next).length ? next : undefined
}

export function selectedCharacterClasses(value: string, classes: ClassRecord[]) {
  let names: string[] = []
  try {
    const parsed = JSON.parse(value)
    if (Array.isArray(parsed)) names = parsed.filter((item): item is string => typeof item === "string")
    else if (parsed && Array.isArray(parsed.values)) names = parsed.values.filter((item: unknown): item is string => typeof item === "string")
  } catch { names = value ? [value] : [] }
  return classes.filter((item) => names.some((name) => normalizeClassLabel(name) === normalizeClassLabel(item.name) || name === item.id))
}

export function knownSpellsForCharacter(classes: ClassRecord[], spells: ClassSpell[], level: number, value: string) {
  const state = parseClassChoices(value)
  const classIds = new Set(classes.map((item) => item.id))
  const extras = new Set(state.extras)
  const removed = new Set(state.removed)
  return spells
    .filter((spell) => !removed.has(spell.id) && (extras.has(spell.id) || Object.entries(spell.classRanks).some(([classId, rank]) => classIds.has(classId) && rank <= level && (rank === 0 || state.choices[classId]?.[String(rank)] === spell.id))))
    .map((spell) => personalizeSpell(spell, state.edits[spell.id]))
}

function SpellGlyph({ category }: { category: ClassSpell["category"] }) {
  if (category === "bonus") return <Gauge />
  if (category === "passif") return <CircleDotDashed />
  return <Zap />
}

/**
 * Dans l'en-tête repliable, un clic dans le champ du nom en cours de modification (ou sur
 * ses boutons ✓ / ✕) ne doit pas replier la carte. Tout autre clic l'ouvre ou la ferme.
 */
function keepSummaryOpen(event: MouseEvent) {
  const target = event.target as HTMLElement
  if (target.closest("input, textarea, button")) event.preventDefault()
}

function KnownSpell({ spell, original, customized, rank, accent, currentCharges, onCharges, onEdit, onReset, onRemove, manual, dragOver, onDragStart, onDragEnd, onDragOver, onDrop }: { spell: ClassSpell; original: ClassSpell; customized: boolean; rank: number | null; accent: string; currentCharges: number; onCharges: (value: number) => void; onEdit: (patch: CharacterSpellEdit) => Promise<void>; onReset: () => Promise<void>; onRemove: () => Promise<void>; manual?: boolean; dragOver?: boolean; onDragStart?: () => void; onDragEnd?: () => void; onDragOver?: (event: DragEvent) => void; onDrop?: () => void }) {
  const tone = spellTone(spell)
  const [confirmRemove, setConfirmRemove] = useState(false)
  return <details
    className={`group rounded-xl border bg-background/45 transition-colors ${dragOver ? "border-dashed" : ""}`}
    style={{ borderColor: dragOver ? accent : `${tone.background}66` }}
    onDragOver={manual ? (event) => { event.preventDefault(); onDragOver?.(event) } : undefined}
    onDrop={manual ? (event) => { event.preventDefault(); onDrop?.() } : undefined}
  >
    <summary className="flex cursor-pointer list-none items-center gap-3 px-3 py-3 [&::-webkit-details-marker]:hidden">
      {manual && <span
        draggable
        onDragStart={(event) => { event.stopPropagation(); event.dataTransfer.effectAllowed = "move"; onDragStart?.() }}
        onDragEnd={(event) => { event.stopPropagation(); onDragEnd?.() }}
        onClick={(event) => event.preventDefault()}
        className="flex shrink-0 cursor-grab touch-none items-center justify-center rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground active:cursor-grabbing"
        aria-label={`Réordonner ${spell.name} (glisser-déposer)`}
        title="Glisser pour réordonner"
      ><GripVertical className="size-3.5" /></span>}
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg" style={{ backgroundColor: tone.background, color: tone.foreground }}><span className="flex size-4 items-center justify-center [&>svg]:size-4"><SpellGlyph category={spell.category} /></span></span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold" onClick={keepSummaryOpen}><InlineEdit compact trigger="span" label="Nom du sort" value={spell.name} onCommit={(value) => onEdit({ name: value.trim() || original.name })}><span className="block truncate">{spell.name}</span></InlineEdit></span>
        <span className="block text-[11px] text-muted-foreground">{rank === null ? "Hors classe" : rank === 0 ? "Commun" : `Rang ${rank}`} · {spell.type}{customized && <span className="ml-1.5 rounded-full bg-primary/10 px-1.5 py-px text-[9px] font-semibold uppercase tracking-wider text-primary" title="Modifié pour ce personnage seulement">Personnalisé</span>}</span>
      </span>
      {spell.category === "actif" && <SpellChargeStars total={spell.charges} current={currentCharges} interactive onChange={onCharges} accent={accent} />}
      <ChevronDown className="size-4 text-muted-foreground transition group-open:rotate-180" />
    </summary>
    <div className="border-t px-3 py-3 text-sm leading-6" style={{ borderColor: `${accent}28` }}>
      <blockquote className="border-l-2 pl-3" style={{ borderColor: accent }}>
        <RichTextInlineEditor canEdit html={spell.effectHtml || spell.effect} placeholder="Effet" className="font-medium" onSave={(html) => onEdit({ effectHtml: html, effect: plainText(html) })} />
        <RichTextInlineEditor canEdit html={spell.descriptionHtml || spell.description} placeholder="Description" className="mt-1 text-muted-foreground" onSave={(html) => onEdit({ descriptionHtml: html, description: plainText(html) })} />
      </blockquote>
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <InlineEdit compact label="Type" value={spell.type} onCommit={(value) => onEdit({ type: value.trim() })}><span>{spell.type || "Type"}</span></InlineEdit>
        <InlineEdit compact label="Compétences" value={spell.skillsRaw} onCommit={(value) => onEdit({ skillsRaw: value.trim() })}><span className={spell.skills.length ? "font-semibold text-[#b3261e]" : "text-muted-foreground/55"}>{spell.skills.length ? spell.skills.join(" · ") : "Compétences"}</span></InlineEdit>
        <InlineEdit compact label="Distance" value={spell.distance} onCommit={(value) => onEdit({ distance: value.trim() })}><span className="flex items-center gap-1"><Crosshair className="size-3" />{spell.distance ? `Distance : ${spell.distance}` : <span className="text-muted-foreground/55">Distance</span>}</span></InlineEdit>
        {spell.category === "actif" && <InlineEdit compact numeric label="Charges" value={spell.charges === null ? "" : String(spell.charges)} onCommit={(value) => onEdit({ charges: value.trim() === "" ? null : Math.max(0, Math.min(5, Math.trunc(Number(value) || 0))) })}><span>Charges : {spell.charges ?? "—"}</span></InlineEdit>}
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-end gap-1">
        {customized && <Button type="button" variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground" onClick={() => void onReset()} title="Revenir au texte de l’index des sorts"><Undo2 />Version de l’index</Button>}
        {confirmRemove
          ? <><Button type="button" variant="destructive" size="sm" className="h-7 text-xs" onClick={() => void onRemove()}>Retirer de la fiche</Button><Button type="button" variant="ghost" size="icon-sm" onClick={() => setConfirmRemove(false)} aria-label="Annuler"><X /></Button></>
          : <Button type="button" variant="ghost" size="icon-sm" className="text-muted-foreground hover:text-destructive" onClick={() => setConfirmRemove(true)} aria-label={`Retirer ${spell.name}`} title="Retirer ce sort de la fiche"><Trash2 /></Button>}
      </div>
    </div>
  </details>
}

function ChoiceCard({ spell, selected, accent, onChoose }: { spell: ClassSpell; selected: boolean; accent: string; onChoose: () => void }) {
  const tone = spellTone(spell)
  return <button type="button" onClick={onChoose} className="min-h-32 rounded-2xl border bg-card/70 p-4 text-left transition hover:-translate-y-0.5 hover:shadow-md" style={{ borderColor: selected ? accent : `${accent}38`, backgroundColor: selected ? `${accent}12` : undefined }}>
    <div className="flex items-start gap-3"><span className="flex size-8 shrink-0 items-center justify-center rounded-lg" style={{ backgroundColor: tone.background, color: tone.foreground }}><span className="flex size-4 items-center justify-center [&>svg]:size-4"><SpellGlyph category={spell.category} /></span></span><span className="min-w-0 flex-1"><span className="flex items-center gap-2"><span className="font-display text-lg font-semibold leading-tight">{spell.name}</span>{selected && <Check className="size-4" style={{ color: accent }} />}</span><span className="mt-1 block text-xs text-muted-foreground">{spell.type}</span></span></div>
    {(spell.effect || spell.description) && <span className="mt-3 line-clamp-4 block text-sm leading-5"><span className="block font-medium" dangerouslySetInnerHTML={{ __html: spell.effectHtml || spell.effect }} />{spell.description && <span className="mt-1 block text-muted-foreground" dangerouslySetInnerHTML={{ __html: spell.descriptionHtml || spell.description }} />}</span>}
    {spell.category === "actif" && <SpellChargeStars total={spell.charges} accent={accent} className="mt-3" />}
  </button>
}

export function ClassProgression({ classes, spells, level, value, onCommit, loading = false, error = "" }: { classes: ClassRecord[]; spells: ClassSpell[]; level: number; value: string; onCommit: (value: string) => Promise<void>; loading?: boolean; error?: string }) {
  const state = useMemo(() => parseClassChoices(value), [value])
  const [reconsidering, setReconsidering] = useState<Record<string, boolean>>({})
  const [sort, setSort] = usePersistentState<"rank" | "name" | "type" | "manual">(
    "eraser:class-progression:sort", "rank",
    (v): v is "rank" | "name" | "type" | "manual" => v === "rank" || v === "name" || v === "type" || v === "manual",
  )
  const [searchOpen, setSearchOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [searchCategory, setSearchCategory] = useState<"all" | ClassSpell["category"]>("all")
  const known = knownSpellsForCharacter(classes, spells, level, value)

  async function update(next: CharacterClassChoices) { await onCommit(JSON.stringify(next)) }
  function choose(classId: string, rank: number, spellId: string) {
    const choices = { ...state.choices, [classId]: { ...(state.choices[classId] || {}), [String(rank)]: spellId } }
    setReconsidering((current) => ({ ...current, [`${classId}:${rank}`]: false }))
    return update({ ...state, choices })
  }
  function setCharges(spell: ClassSpell, count: number) {
    return update({ ...state, charges: { ...state.charges, [spell.id]: Math.max(0, Math.min(spell.charges ?? 0, count)) } })
  }
  function addExtra(spellId: string) {
    if (state.extras.includes(spellId) && !state.removed.includes(spellId)) return
    return update({ ...state, extras: [...state.extras.filter((id) => id !== spellId), spellId], removed: state.removed.filter((id) => id !== spellId), order: [...state.order.filter((id) => id !== spellId), spellId] })
  }
  const originals = useMemo(() => new Map(spells.map((spell) => [spell.id, spell])), [spells])
  function editSpell(spell: ClassSpell, patch: CharacterSpellEdit) {
    const original = originals.get(spell.id) || spell
    const edits = { ...state.edits }
    const merged = mergeSpellEdit(original, edits[spell.id], patch)
    if (merged) edits[spell.id] = merged
    else delete edits[spell.id]
    return update({ ...state, edits })
  }
  function resetSpell(spell: ClassSpell) {
    const edits = { ...state.edits }
    delete edits[spell.id]
    return update({ ...state, edits })
  }
  // Un sort ajouté à la main quitte simplement la liste ; un sort acquis par la classe
  // est mis de côté, pour pouvoir être rétabli.
  function removeSpell(spell: ClassSpell) {
    const classIds = new Set(classes.map((item) => item.id))
    const fromClass = Object.entries(spell.classRanks).some(([classId, rank]) => classIds.has(classId) && rank <= level && (rank === 0 || state.choices[classId]?.[String(rank)] === spell.id))
    return update({
      ...state,
      extras: state.extras.filter((id) => id !== spell.id),
      removed: fromClass ? [...state.removed.filter((id) => id !== spell.id), spell.id] : state.removed.filter((id) => id !== spell.id),
    })
  }
  function restoreSpell(spellId: string) {
    return update({ ...state, removed: state.removed.filter((id) => id !== spellId) })
  }
  const removedSpells = state.removed.flatMap((id) => { const spell = originals.get(id); return spell ? [personalizeSpell(spell, state.edits[id])] : [] })
  const [draggedSpellId, setDraggedSpellId] = useState<string | null>(null)
  const [dragOverSpellId, setDragOverSpellId] = useState<string | null>(null)
  function reorderSpell(draggedId: string, targetId: string) {
    if (draggedId === targetId) return
    const knownIds = new Set(known.map((item) => item.id))
    const baseOrder = [...state.order.filter((id) => knownIds.has(id)), ...known.map((item) => item.id).filter((id) => !state.order.includes(id))]
    const withoutDragged = baseOrder.filter((id) => id !== draggedId)
    const targetIndex = withoutDragged.indexOf(targetId)
    if (targetIndex < 0) return
    withoutDragged.splice(targetIndex, 0, draggedId)
    return update({ ...state, order: withoutDragged })
  }
  const manualPosition = new Map(state.order.map((id, index) => [id, index]))
  const naturalPosition = new Map(known.map((spell, index) => [spell.id, index]))
  const sortedKnown = [...known].sort((left, right) => sort === "name"
    ? left.name.localeCompare(right.name, "fr")
    : sort === "type"
      ? left.type.localeCompare(right.type, "fr") || left.name.localeCompare(right.name, "fr")
      : sort === "manual"
        ? (manualPosition.get(left.id) ?? naturalPosition.get(left.id) ?? Number.MAX_SAFE_INTEGER) - (manualPosition.get(right.id) ?? naturalPosition.get(right.id) ?? Number.MAX_SAFE_INTEGER)
      : Math.min(...Object.values(left.classRanks)) - Math.min(...Object.values(right.classRanks)) || left.name.localeCompare(right.name, "fr"))
  const normalizedQuery = query.trim().toLocaleLowerCase("fr")
  const matchingSearchResults = spells.filter((spell) => !known.some((item) => item.id === spell.id) && (searchCategory === "all" || spell.category === searchCategory) && (!normalizedQuery || [spell.name, spell.type, spell.category, spell.skillsRaw, spell.effect, spell.description].join(" ").toLocaleLowerCase("fr").includes(normalizedQuery)))
  const searchResults = matchingSearchResults.slice(0, 60)

  if (loading) return <div className="grid min-h-52 place-items-center rounded-2xl border border-dashed border-border/55 bg-card/20 p-8 text-center text-sm text-muted-foreground">Chargement des classes et des sorts…</div>
  if (error) return <div className="grid min-h-52 place-items-center rounded-2xl border border-destructive/30 bg-destructive/5 p-8 text-center text-sm text-destructive">{error}<span className="mt-2 block text-muted-foreground">La fiche reste utilisable dans les autres onglets.</span></div>
  if (!classes.length) return <div className="grid min-h-52 place-items-center rounded-2xl border border-dashed border-border/55 bg-card/20 p-8 text-center text-sm text-muted-foreground">Choisis une classe dans l’identité du personnage pour afficher sa progression.</div>

  return <div className="space-y-9">
    <section>
      <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-[10px] font-semibold uppercase tracking-[.22em] text-muted-foreground">Répertoire</p><h2 className="font-display mt-1 text-2xl font-semibold">Capacités acquises</h2></div><div className="flex items-center gap-2"><label className="flex items-center gap-2 text-xs text-muted-foreground">Trier par<NativeSelect value={sort} onChange={(event) => setSort(event.target.value as "rank" | "name" | "type" | "manual")} className="h-10 min-w-40 py-0 pl-3 pr-10 leading-5"><NativeSelectOption value="rank">Rang</NativeSelectOption><NativeSelectOption value="name">Nom</NativeSelectOption><NativeSelectOption value="type">Type</NativeSelectOption><NativeSelectOption value="manual">Manuel</NativeSelectOption></NativeSelect></label><Button type="button" variant={searchOpen ? "secondary" : "outline"} size="icon-sm" aria-label="Ajouter une capacité" title="Ajouter une capacité" onClick={() => setSearchOpen((open) => !open)}>{searchOpen ? <X /> : <Plus />}</Button></div></div>
      {searchOpen && <div className="mt-4 rounded-xl border bg-card/55 p-3"><div className="flex flex-col gap-2 sm:flex-row"><div className="relative flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nom, mot-clé, type ou compétence…" className="pl-9" /></div><NativeSelect value={searchCategory} onChange={(event) => setSearchCategory(event.target.value as typeof searchCategory)} className="h-9 min-w-36"><NativeSelectOption value="all">Tout</NativeSelectOption><NativeSelectOption value="actif">Actifs</NativeSelectOption><NativeSelectOption value="passif">Passifs</NativeSelectOption><NativeSelectOption value="bonus">Bonus</NativeSelectOption></NativeSelect></div><div className="mt-3 grid max-h-80 gap-2 overflow-y-auto md:grid-cols-2">{searchResults.map((spell) => <div key={spell.id} className="flex items-center gap-3 rounded-lg border bg-background/55 p-3"><span className="flex size-8 shrink-0 items-center justify-center rounded-lg [&>svg]:size-4" style={{ backgroundColor: spellTone(spell).background, color: spellTone(spell).foreground }}><SpellGlyph category={spell.category} /></span><span className="min-w-0 flex-1"><b className="block truncate text-sm">{spell.name}</b><span className="block truncate text-xs text-muted-foreground">{spell.type}{spell.skills.length ? ` · ${spell.skills.join(" · ")}` : ""}</span></span><Button type="button" size="sm" variant="outline" onClick={() => void addExtra(spell.id)}><Plus />Ajouter</Button></div>)}</div>{matchingSearchResults.length > searchResults.length && <p className="pt-3 text-center text-xs text-muted-foreground">Affichage des 60 premiers résultats — précise ta recherche pour voir les autres.</p>}{!searchResults.length && <p className="py-5 text-center text-xs text-muted-foreground">Aucune capacité correspondante.</p>}</div>}
      {sortedKnown.length ? <div className="mt-4 grid items-start gap-5 lg:grid-cols-2">
        {(["actif", "passif"] as const).map((category) => { const categorySpells = sortedKnown.filter((spell) => spell.category === category); return <div key={category}><h3 className="mb-2 flex items-center gap-2 font-display text-lg font-semibold">{category === "actif" ? <Zap className="size-4" /> : <CircleDotDashed className="size-4" />}{category === "actif" ? "Actifs" : "Passifs"}</h3><div className="space-y-2">{categorySpells.map((spell) => { const linkedRanks = classes.flatMap((item) => item.id in spell.classRanks ? [spell.classRanks[item.id]] : []); const rank = linkedRanks.length ? Math.min(...linkedRanks) : null; return <KnownSpell key={spell.id} spell={spell} original={originals.get(spell.id) || spell} customized={spell.id in state.edits} onEdit={(patch) => editSpell(spell, patch)} onReset={() => resetSpell(spell)} onRemove={() => removeSpell(spell)} rank={rank} accent={classes.find((item) => item.id in spell.classRanks)?.accentDark || "#927640"} currentCharges={state.charges[spell.id] ?? spell.charges ?? 0} onCharges={(count) => void setCharges(spell, count)} manual={sort === "manual"} dragOver={dragOverSpellId === spell.id} onDragStart={() => setDraggedSpellId(spell.id)} onDragEnd={() => { setDraggedSpellId(null); setDragOverSpellId(null) }} onDragOver={() => draggedSpellId && draggedSpellId !== spell.id && setDragOverSpellId(spell.id)} onDrop={() => { if (draggedSpellId) void reorderSpell(draggedSpellId, spell.id); setDraggedSpellId(null); setDragOverSpellId(null) }} /> })}{!categorySpells.length && <p className="rounded-xl border border-dashed px-3 py-5 text-center text-xs text-muted-foreground">Aucun {category === "actif" ? "actif" : "passif"} acquis.</p>}</div></div> })}
        {sortedKnown.some((spell) => spell.category === "bonus") && <details className="lg:col-span-2"><summary className="cursor-pointer text-sm font-semibold text-muted-foreground">Afficher les bonus ({sortedKnown.filter((spell) => spell.category === "bonus").length})</summary><div className="mt-3 grid gap-2 lg:grid-cols-2">{sortedKnown.filter((spell) => spell.category === "bonus").map((spell) => { const linkedRanks = classes.flatMap((item) => item.id in spell.classRanks ? [spell.classRanks[item.id]] : []); const rank = linkedRanks.length ? Math.min(...linkedRanks) : null; return <KnownSpell key={spell.id} spell={spell} original={originals.get(spell.id) || spell} customized={spell.id in state.edits} onEdit={(patch) => editSpell(spell, patch)} onReset={() => resetSpell(spell)} onRemove={() => removeSpell(spell)} rank={rank} accent={classes.find((item) => item.id in spell.classRanks)?.accentDark || "#927640"} currentCharges={0} onCharges={() => undefined} manual={sort === "manual"} dragOver={dragOverSpellId === spell.id} onDragStart={() => setDraggedSpellId(spell.id)} onDragEnd={() => { setDraggedSpellId(null); setDragOverSpellId(null) }} onDragOver={() => draggedSpellId && draggedSpellId !== spell.id && setDragOverSpellId(spell.id)} onDrop={() => { if (draggedSpellId) void reorderSpell(draggedSpellId, spell.id); setDraggedSpellId(null); setDragOverSpellId(null) }} /> })}</div></details>}
      </div> : <p className="mt-4 rounded-xl border border-dashed px-4 py-7 text-center text-sm text-muted-foreground">Aucune capacité disponible pour ce niveau.</p>}
      {removedSpells.length > 0 && <div className="mt-4 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
        <span className="mr-1 text-[10px] font-semibold uppercase tracking-wider">Retirés de la fiche</span>
        {removedSpells.map((spell) => <button key={spell.id} type="button" onClick={() => void restoreSpell(spell.id)} className="inline-flex items-center gap-1 rounded-full border border-dashed px-2 py-0.5 hover:border-primary/50 hover:text-primary" title="Rétablir ce sort sur la fiche"><Undo2 className="size-3" />{spell.name}</button>)}
      </div>}
    </section>

    {classes.map((characterClass) => {
      const classSpells = spells.filter((spell) => characterClass.id in spell.classRanks && spell.classRanks[characterClass.id] <= level)
      const ranks = Array.from({ length: level + 1 }, (_, rank) => rank)
      const hasChoicePending = ranks.some((rank) => rank > 0 && classSpells.some((spell) => spell.classRanks[characterClass.id] === rank) && !state.choices[characterClass.id]?.[String(rank)])
      return <details key={characterClass.id} className="group rounded-2xl border bg-card/40" style={{ borderColor: `${characterClass.accentDark}45` }}>
        <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3 p-4 sm:p-5 [&::-webkit-details-marker]:hidden"><div><p className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[.2em]" style={{ color: characterClass.accentDark }}>Progression de classe{hasChoicePending && <span className="flex size-5 items-center justify-center rounded-full bg-destructive text-xs font-bold text-destructive-foreground" title="Un rang est à choisir">!</span>}</p><h2 className="font-display mt-1 text-2xl font-semibold">{characterClass.name}</h2></div><div className="flex items-center gap-2"><Badge variant="outline" style={{ borderColor: `${characterClass.accentDark}55`, color: characterClass.accentDark }}>Rang actuel : {level}</Badge><ChevronDown className="size-5 text-muted-foreground transition group-open:rotate-180" /></div></summary>
        <div className="border-t px-4 pb-4 sm:px-5 sm:pb-5" style={{ borderColor: `${characterClass.accentDark}28` }}>
        {ranks.length ? <div className="mt-5 space-y-6">{ranks.map((rank) => {
          const available = classSpells.filter((spell) => spell.classRanks[characterClass.id] === rank).slice(0, 3)
          const selectedId = rank === 0 ? "" : state.choices[characterClass.id]?.[String(rank)] || ""
          const key = `${characterClass.id}:${rank}`
          const choosing = rank > 0 && (!selectedId || reconsidering[key])
          return <section key={rank} className="border-t pt-4" style={{ borderColor: `${characterClass.accentDark}28` }}>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><div className="flex items-center gap-2"><span className="flex size-8 items-center justify-center rounded-full text-xs font-bold" style={{ backgroundColor: `${characterClass.accentLight}42`, color: characterClass.accentDark }}>{rank === 0 ? "C" : rank}</span><div><h3 className="font-display font-semibold">{rank === 0 ? "Rang commun" : `Rang ${rank}`}</h3><p className="text-[11px] text-muted-foreground">{rank === 0 ? "Acquis automatiquement" : choosing ? "Choisis une capacité" : "Choix enregistré"}</p></div></div>{rank > 0 && selectedId && !choosing && <Button type="button" variant="ghost" size="sm" onClick={() => setReconsidering((current) => ({ ...current, [key]: true }))}><RotateCcw />Rechoisir</Button>}{rank > 0 && selectedId && choosing && <Button type="button" variant="ghost" size="sm" onClick={() => setReconsidering((current) => ({ ...current, [key]: false }))}>Annuler</Button>}</div>
            <div className={`grid gap-3 ${choosing || rank === 0 ? "lg:grid-cols-3" : "grid-cols-1"}`}>{(choosing || rank === 0 ? available : available.filter((spell) => spell.id === selectedId)).map((spell) => <ChoiceCard key={spell.id} spell={spell} selected={rank === 0 || spell.id === selectedId} accent={characterClass.accentDark} onChoose={() => { if (rank > 0) void choose(characterClass.id, rank, spell.id) }} />)}</div>
          </section>
        })}</div> : <p className="mt-5 rounded-xl border border-dashed px-4 py-7 text-center text-sm text-muted-foreground">Aucun sort n’est encore lié à cette classe jusqu’au rang {level}.</p>}
        </div>
      </details>
    })}
  </div>
}
