"use client"

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from "react"
import { useRememberedSearch } from "@/hooks/use-remembered-search"
import { Check, ChevronDown, CircleDotDashed, CopyCheck, Gauge, LoaderCircle, Plus, RefreshCw, Search, Trash2, Unlink, X, Zap } from "lucide-react"

import { RankedLinksCell } from "@/components/eraser/index-cells"
import { ReadOnlyIndexEditorButton } from "@/components/eraser/index-editor"
import { spellEditorModel } from "@/lib/system-index-models"
import { RichTextField } from "@/components/eraser/rich-text"
import { ClassPresentationEditor } from "@/components/eraser/class-presentation-editor"
import { SpellChargeStars } from "@/components/eraser/spell-charges"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ContextMenuItem } from "@/components/ui/context-menu"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { usePersistentState } from "@/hooks/use-persistent-state"
import type { ClassSpell, ClassSpellDraft, SpellIndexKind, SpellSimilarity } from "@/lib/class-content"
import { classSpellActionKind, classSpellCategory, classSpellCategoryTones, classSpellTypeSuggestions, findClassSpellSimilarities, MAX_CLASS_SPELLS_PER_RANK, splitClassSpellSkills, UNNAMED_CLASS_SPELL } from "@/lib/class-spell-utils"
import type { ClassRecord } from "@/lib/google-sheets"
import { groupSimilarities, SpellDuplicates } from "@/components/eraser/spell-duplicates"
import { ClassStateDetail, ClassStateOverview } from "@/components/eraser/class-state-overview"
import { ClassStatisticsFor, GlobalClassStatistics, useClassPlayData } from "@/components/eraser/class-statistics"
import { IN_PLACE_ATTRIBUTE, replaceAppUrl, URL_CHANGE_EVENT } from "@/components/eraser/app-tabs"
import { PageLabel } from "@/components/eraser/app-shell"
import { EmbeddedWorldIndex, type IndexEmbed, type IndexEmbedRow } from "@/components/eraser/world-index-manager"
import { announceWorldIndexChange, onWorldIndexChange } from "@/lib/world-index-events"
import type { WorldIndexKey } from "@/lib/world-index-definitions"

type ResourceData = { classes: ClassRecord[]; spells: ClassSpell[]; similarities: SpellSimilarity[]; headers: string[]; file: { id: string; name: string; webViewLink?: string } | null; similaritiesError?: string }
/** `spell` : le sort tel que la feuille le contient après l'écriture (relu par le serveur). */
type MutationResult = { id: string; rowNumber: number; tone: { background: string; foreground: string }; spell?: ClassSpell | null } | null

function pairKey(left: string, right: string) {
  return [left, right].sort().join("|")
}

/** Les paires que le serveur a écartées : calculées localement, absentes de sa liste. */
function ignoredPairsOf(data: ResourceData) {
  const reported = new Set(data.similarities.map((match) => pairKey(match.leftId, match.rightId)))
  return new Set(findClassSpellSimilarities(data.spells).map((match) => pairKey(match.leftId, match.rightId)).filter((key) => !reported.has(key)))
}

function emptyDraft(): ClassSpellDraft {
  return { id: "", name: "", effect: "", effectHtml: "", description: "", descriptionHtml: "", type: "Passif", skillsRaw: "", distance: "", distanceHtml: "", charges: null, classRanks: {} }
}

function toDraft(spell: ClassSpell): ClassSpellDraft {
  return { id: spell.id.startsWith("LIGNE-") ? "" : spell.id, name: spell.name === UNNAMED_CLASS_SPELL ? "" : spell.name, effect: spell.effect, effectHtml: spell.effectHtml, description: spell.description, descriptionHtml: spell.descriptionHtml, type: spell.type, skillsRaw: spell.skillsRaw, distance: spell.distance, distanceHtml: spell.distanceHtml, charges: spell.charges, chargesLabel: spell.chargesLabel, classRanks: { ...spell.classRanks } }
}

/**
 * Le brouillon reparti du sort enregistré (`saved`) : les champs modifiés depuis l'envoi
 * (`sent`) gardent la saisie, tous les autres reprennent ce que la feuille contient.
 */
function rebaseDraft(draft: ClassSpellDraft, sent: ClassSpellDraft, saved: ClassSpellDraft): ClassSpellDraft {
  const next: ClassSpellDraft = { ...saved, classRanks: { ...saved.classRanks } }
  for (const key of Object.keys(draft) as Array<keyof ClassSpellDraft>) {
    if (key !== "classRanks" && JSON.stringify(draft[key]) !== JSON.stringify(sent[key])) Object.assign(next, { [key]: draft[key] })
  }
  for (const classId of new Set([...Object.keys(draft.classRanks), ...Object.keys(sent.classRanks)])) {
    if (draft.classRanks[classId] !== sent.classRanks[classId]) next.classRanks[classId] = draft.classRanks[classId] ?? null
  }
  return next
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
  return { rowNumber, id, name: draft.name.trim() || UNNAMED_CLASS_SPELL, effect: draft.effect, effectHtml: draft.effectHtml || draft.effect, description: draft.description, descriptionHtml: draft.descriptionHtml || draft.description, type: draft.type, category, actionKind: classSpellActionKind(draft.type), skillsRaw: draft.skillsRaw, skills: splitClassSpellSkills(draft.skillsRaw), distance: draft.distance, distanceHtml: draft.distanceHtml || draft.distance, charges: draft.charges, chargesLabel: draft.charges !== null ? String(draft.charges) : draft.chargesLabel ?? "", classRanks, tone: tone || classSpellCategoryTones[category] }
}

function TypeGlyph({ category }: { category: ClassSpell["category"] }) {
  if (category === "actif") return <Zap className="size-3.5" />
  if (category === "passif") return <CircleDotDashed className="size-3.5" />
  return <Gauge className="size-3.5" />
}

function rankLabel(rank: number) { return rank === 0 ? "Rang commun" : `Rang ${rank}` }

function rankCount(spells: ClassSpell[], classId: string, rank: number, exceptId?: string) {
  return spells.filter((spell) => spell.id !== exceptId && spell.classRanks[classId] === rank).length
}


const classRanks = Array.from({ length: 21 }, (_, rank) => rank)

/**
 * « Classes et rangs » est une colonne de type Liens classés : chaque lien est une
 * pastille aux couleurs de la classe, avec son rang (C, R1…R20) modifiable sur place.
 * Un rang ne peut pas contenir plus de trois sorts.
 */
function ClassLinksEditor({ draft, classes, spells, spellId, compact = false, onChange }: { draft: ClassSpellDraft; classes: ClassRecord[]; spells: ClassSpell[]; spellId?: string; compact?: boolean; onChange: (value: Record<string, number | null>) => void }) {
  const options = useMemo(() => classes.map((item) => ({ id: item.id, name: item.name, color: item.accentDark })), [classes])
  return <RankedLinksCell
    links={draft.classRanks}
    options={options}
    ranks={classRanks}
    rankLabel={(rank) => rank === 0 ? "Commun" : `Rang ${rank}`}
    rankShort={(rank) => rank === 0 ? "C" : `R${rank}`}
    isFull={(classId, rank) => rankCount(spells, classId, rank, spellId) >= MAX_CLASS_SPELLS_PER_RANK}
    addLabel="Classe"
    fullLabel="rang plein (3 sorts)"
    compact={compact}
    onChange={onChange}
  />
}

/** `onSave` reçoit aussi le sort tel qu'il était à l'ouverture : seuls les champs changés depuis partent. */
function SpellForm({ initial, classes, spells, pending, title, withClasses = true, onCancel, onSave }: { initial: ClassSpellDraft; classes: ClassRecord[]; spells: ClassSpell[]; pending: boolean; title: string; withClasses?: boolean; onCancel: () => void; onSave: (draft: ClassSpellDraft, original: ClassSpellDraft) => void }) {
  const [start] = useState(initial)
  const [draft, setDraft] = useState(initial)
  const field = <K extends keyof ClassSpellDraft>(key: K, value: ClassSpellDraft[K]) => setDraft((current) => ({ ...current, [key]: value }))
  return <section className="rounded-2xl border bg-card/90 p-4 shadow-sm">
    <div className="flex items-center justify-between gap-3"><h3 className="font-display text-xl font-semibold">{title}</h3><Button type="button" variant="ghost" size="icon-sm" onClick={onCancel} aria-label="Fermer"><X /></Button></div>
    <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      {/* L'ID d'un sort existant ne change plus : les fiches de personnage le citent. */}
      <label className="grid gap-1 text-xs font-semibold">ID<Input value={draft.id} onChange={(event) => field("id", event.target.value)} placeholder="Généré si vide" disabled={Boolean(start.id)} title={start.id ? "Les fiches de personnage citent le sort par cet ID : il ne change pas." : undefined} /></label>
      <label className="grid gap-1 text-xs font-semibold md:col-span-1 xl:col-span-2">Nom<Input value={draft.name} onChange={(event) => field("name", event.target.value)} placeholder="Sans titre" /></label>
      <label className="grid gap-1 text-xs font-semibold">Type exact<Input list="class-spell-types" value={draft.type} onChange={(event) => field("type", event.target.value)} /></label>
      <label className="grid gap-1 text-xs font-semibold">Compétences<Input value={draft.skillsRaw} onChange={(event) => field("skillsRaw", event.target.value)} className="text-[#b3261e]" /></label>
      <div className="grid gap-1 text-xs font-semibold">Distance<RichTextField ariaLabel="Distance" value={draft.distanceHtml || draft.distance} minHeight="min-h-9" onCommit={(html) => setDraft((current) => ({ ...current, distance: plainText(html), distanceHtml: html }))} /></div>
      <label className="grid gap-1 text-xs font-semibold">Charges{classSpellCategory(draft.type) === "actif" ? <Input type="number" min={0} max={5} value={draft.charges ?? ""} onChange={(event) => field("charges", event.target.value === "" ? null : Math.max(0, Math.min(5, Number(event.target.value))))} /> : <span className="flex min-h-9 items-center text-muted-foreground">—</span>}</label>
      {withClasses && <div className="md:col-span-2 xl:col-span-1"><p className="mb-1 text-xs font-semibold">Classes et rangs</p><ClassLinksEditor draft={draft} classes={classes} spells={spells} onChange={(classRanks) => field("classRanks", classRanks)} /></div>}
      <div className="grid gap-1 text-xs font-semibold md:col-span-2">Effet<RichTextField ariaLabel="Effet" value={draft.effectHtml || draft.effect} onCommit={(html) => setDraft((current) => ({ ...current, effect: plainText(html), effectHtml: html }))} /></div>
      <div className="grid gap-1 text-xs font-semibold md:col-span-2">Description<RichTextField ariaLabel="Description" value={draft.descriptionHtml || draft.description} onCommit={(html) => setDraft((current) => ({ ...current, description: plainText(html), descriptionHtml: html }))} /></div>
    </div>
    <div className="mt-4 flex justify-end gap-2"><Button type="button" variant="outline" onClick={onCancel}>Annuler</Button><Button type="button" onClick={() => onSave(draft, start)} disabled={pending || !hasContent(draft)}>{pending ? <LoaderCircle className="animate-spin" /> : <Check />}Enregistrer</Button></div>
  </section>
}

const fieldInputClass = "border-transparent bg-transparent px-1.5 shadow-none focus-visible:border-input focus-visible:bg-background"
// Compétences, distance et charges gardent un cadre léger à leur couleur, pour être
// repérées d'un coup d'œil dans les cartes.
const framedInputClass = "px-2 shadow-none focus-visible:bg-background"
const skillFrameClass = "border-[#b3261e]/30 bg-[#b3261e]/[.05] focus-visible:border-[#b3261e]/60"
const distanceFrameClass = "border-stone-400/35 bg-stone-500/[.06] focus-visible:border-stone-500/60"
const chargesFrameClass = "border-violet-400/40 bg-violet-500/[.07] focus-visible:border-violet-500/60"

/**
 * Rail vertical discret, fixé au bord de l'écran : un clic amène au rang voulu, le rang
 * visible est mis en avant.
 */
function RankRail({ counts, accent }: { counts: number[]; accent: string }) {
  const [current, setCurrent] = useState(0)
  useEffect(() => {
    const sections = counts.map((_, rank) => document.getElementById(`rang-${rank}`)).filter((node): node is HTMLElement => Boolean(node))
    const visible = new Map<number, number>()
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) visible.set(Number((entry.target as HTMLElement).dataset.rank), entry.isIntersecting ? entry.intersectionRatio : 0)
      const best = [...visible.entries()].filter(([, ratio]) => ratio > 0).sort((left, right) => left[0] - right[0])[0]
      if (best) setCurrent(best[0])
    }, { rootMargin: "-15% 0px -55% 0px", threshold: [0, 0.01, 0.5, 1] })
    for (const section of sections) observer.observe(section)
    return () => observer.disconnect()
  }, [counts])
  return <nav aria-label="Aller à une partie de la classe" className="fixed right-2 top-1/2 z-30 hidden max-h-[80svh] -translate-y-1/2 flex-col items-center gap-0.5 overflow-y-auto rounded-full border border-border/50 bg-background/70 px-1 py-2 opacity-60 shadow-sm backdrop-blur transition-opacity hover:opacity-100 focus-within:opacity-100 md:flex">
    {[["classe-etat", "État", "État de la classe"], ["classe-presentation", "Prés", "Présentation de la classe"], ["classe-stats", "Stat", "Statistiques de la classe"]].map(([id, label, title]) => <button key={id} type="button" onClick={() => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" })} title={title} className="shrink-0 rounded-full px-1 py-1 text-[9px] font-bold uppercase tracking-wide text-foreground/70 hover:bg-muted">{label}</button>)}
    <span className="my-1 h-px w-4 shrink-0 bg-border" aria-hidden />
    {counts.map((count, rank) => <button
      key={rank}
      type="button"
      onClick={() => document.getElementById(`rang-${rank}`)?.scrollIntoView({ behavior: "smooth", block: "start" })}
      title={`${rankLabel(rank)} — ${count} sort${count > 1 ? "s" : ""}`}
      aria-current={current === rank ? "true" : undefined}
      className={`flex size-6 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold tabular-nums transition ${current === rank ? "text-white" : count ? "text-foreground/75 hover:bg-muted" : "text-muted-foreground/45 hover:bg-muted"}`}
      style={current === rank ? { backgroundColor: accent } : undefined}
    >{rank === 0 ? "C" : rank}</button>)}
  </nav>
}

type SaveStatus = "idle" | "saving" | "saved" | "error"

// Chaque champ est toujours un input : cliquer dedans modifie seulement ce champ,
// jamais toute la ligne. Il n'y a plus de bouton Enregistrer : le sort s'enregistre
// seul après une courte pause de frappe, quand on quitte la page ou change de classe,
// et l'état de l'enregistrement s'affiche à la place du bouton.
/** La place du sort affiché : la classe et le rang sous lesquels sa carte est rangée. */
type SpellPlace = { className: string; rank: number; onUnlink: (spell: ClassSpell) => void }

function EditableSpell({ spell, classes, allSpells, similarities, place, onSave, onDelete, onShowDuplicates }: { spell: ClassSpell; classes: ClassRecord[]; allSpells: ClassSpell[]; similarities: SpellSimilarity[]; place?: SpellPlace; onSave: (spell: ClassSpell, draft: ClassSpellDraft, base: ClassSpell) => Promise<ClassSpell | null>; onDelete: (spell: ClassSpell) => void; onShowDuplicates: (spell: ClassSpell) => void }) {
  // Le sort tel qu'il était quand la saisie a commencé : seuls les champs changés depuis
  // partent. Un changement venu d'ailleurs (un lien ajouté, le sort relu) est repris tant
  // que rien n'est en cours de saisie ; il n'est jamais réécrit avec l'ancienne valeur.
  const [base, setBase] = useState(spell)
  const [draft, setDraft] = useState(() => toDraft(spell))
  const [seen, setSeen] = useState(spell)
  if (spell !== seen) {
    setSeen(spell)
    if (JSON.stringify(draft) === JSON.stringify(toDraft(base))) { setBase(spell); setDraft(toDraft(spell)) }
  }
  const [status, setStatus] = useState<SaveStatus>("idle")
  const matchCount = similarities.filter((item) => item.leftId === spell.id || item.rightId === spell.id).length
  const [confirmDelete, setConfirmDelete] = useState(false)
  const tone = spell.tone.background ? spell.tone : classSpellCategoryTones[spell.category]
  const persisted = useMemo(() => JSON.stringify(toDraft(base)), [base])
  const serialized = JSON.stringify(draft)
  const changed = serialized !== persisted
  const field = <K extends keyof ClassSpellDraft>(key: K, value: ClassSpellDraft[K]) => setDraft((current) => ({ ...current, [key]: value }))
  // Un seul envoi à la fois ; le dernier brouillon envoyé (ou refusé) n'est pas renvoyé.
  const saving = useRef(false)
  const lastSent = useRef<string | null>(null)
  const latest = useRef({ spell, base, draft, changed, onSave })
  useEffect(() => { latest.current = { spell, base, draft, changed, onSave } })

  const flush = useCallback(async () => {
    const current = latest.current
    if (!current.changed || saving.current) return
    const sent = current.draft
    saving.current = true
    lastSent.current = JSON.stringify(sent)
    setStatus("saving")
    const saved = await current.onSave(current.spell, sent, current.base)
    saving.current = false
    setStatus(saved ? "saved" : "error")
    // Le brouillon repart du sort tel qu'enregistré (relu dans la feuille) ; ce qui a été
    // saisi pendant l'envoi est gardé. Sans cela, une différence de forme (espaces, ID
    // généré) relançait un second envoi.
    if (saved) {
      setBase(saved)
      setDraft((value) => rebaseDraft(value, sent, toDraft(saved)))
    }
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
    if (current.changed && !saving.current && JSON.stringify(current.draft) !== lastSent.current) void current.onSave(current.spell, current.draft, current.base)
  }, [])

  const statusLabel = status === "saving" || (changed && status !== "error")
    ? <span className="flex items-center gap-1.5 text-xs text-muted-foreground"><LoaderCircle className="size-3.5 animate-spin" />Enregistrement…</span>
    : status === "error" && changed
      ? <span className="flex items-center gap-2 text-xs text-destructive">Non enregistré<Button type="button" size="sm" variant="outline" onClick={() => { lastSent.current = null; void flush() }}><RefreshCw />Réessayer</Button></span>
      : status === "saved" ? <span className="flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-400"><Check className="size-3.5" />Enregistré</span> : null
  const actions = <>
    {statusLabel}
    {matchCount > 0 && <Button type="button" size="sm" variant="outline" onClick={() => onShowDuplicates(spell)} title="Comparer et fusionner les sorts semblables"><CopyCheck />{matchCount} doublon{matchCount > 1 ? "s" : ""}</Button>}
    {place && !confirmDelete && <Button type="button" size="icon-sm" variant="ghost" onClick={() => place.onUnlink(spell)} title={`Retirer de ce rang (${place.className}, ${rankLabel(place.rank).toLowerCase()}) : le sort reste dans l’index`}><Unlink /></Button>}
    {confirmDelete
      ? (place ? null : <><Button type="button" size="sm" variant="destructive" onClick={() => onDelete(spell)}>Confirmer</Button><Button type="button" size="icon-sm" variant="ghost" onClick={() => setConfirmDelete(false)}><X /></Button></>)
      : <Button type="button" size="icon-sm" variant="ghost" className="text-destructive" onClick={() => setConfirmDelete(true)} title="Supprimer le sort de l’index"><Trash2 /></Button>}
  </>
  // La corbeille d'une carte rangée sous une classe : supprimer le sort de l'index (pour
  // toutes les classes) n'est souvent pas ce qu'on veut ; le retirer de ce rang l'est.
  const deletePrompt = place && confirmDelete ? <div role="alertdialog" aria-label="Supprimer le sort de l’index ?" className="mt-3 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm">
    <p className="font-semibold text-destructive">Supprimer « {spell.name} » de l’index des sorts ?</p>
    <p className="mt-1 text-xs leading-5 text-muted-foreground">Il disparaîtra pour <b>toutes</b> les classes, pas seulement pour {place.className}. Pour seulement l’enlever de ce rang, choisis « Retirer de ce rang » (c’est aussi la petite croix de l’étiquette « {place.className} {place.rank === 0 ? "C" : `R${place.rank}`} »).</p>
    <div className="mt-3 flex flex-wrap justify-end gap-2">
      <Button type="button" size="sm" variant="ghost" onClick={() => setConfirmDelete(false)}>Annuler</Button>
      <Button type="button" size="sm" variant="outline" autoFocus onClick={() => { setConfirmDelete(false); place.onUnlink(spell) }}><Unlink />Retirer de ce rang</Button>
      <Button type="button" size="sm" variant="destructive" onClick={() => onDelete(spell)}><Trash2 />Supprimer de l’index</Button>
    </div>
  </div> : null

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
          <Input aria-label="Compétences" value={draft.skillsRaw} onChange={(event) => field("skillsRaw", event.target.value)} placeholder="Compétences" className={`h-7 min-w-32 flex-1 font-semibold text-[#b3261e] ${framedInputClass} ${skillFrameClass}`} />
          <Input aria-label="Distance" value={draft.distance} onChange={(event) => setDraft((current) => ({ ...current, distance: event.target.value, distanceHtml: undefined }))} placeholder="Distance" className={`h-7 w-28 ${framedInputClass} ${distanceFrameClass}`} />
          {classSpellCategory(draft.type) === "actif" && <Input type="number" min={0} max={5} aria-label="Charges" value={draft.charges ?? ""} onChange={(event) => field("charges", event.target.value === "" ? null : Math.max(0, Math.min(5, Number(event.target.value))))} placeholder="Charges" className={`h-7 w-20 ${framedInputClass} ${chargesFrameClass}`} />}
        </div>
        <ClassLinksEditor compact draft={draft} classes={classes} spells={allSpells} spellId={spell.id} onChange={(classRanks) => field("classRanks", classRanks)} />
      </div>
    </div>
    <div className="mt-3 flex min-h-8 flex-wrap items-center justify-end gap-2">{actions}</div>
    {deletePrompt}
  </article>
}

/** Les boutons « Chercher un sort » : un appui dessus ne compte pas comme un clic « ailleurs ». */
const SEARCH_TOGGLE = "data-spell-search-toggle"

/**
 * La recherche d'un sort à ranger. Un clic ailleurs (ou Échap) la referme sans rien
 * choisir. Un sort n'est choisi que par un clic franc sur lui : appuyé et relâché sur la
 * même proposition, pas pendant que la page bouge (la liste qui s'ouvre, un autre panneau
 * qui se ferme au-dessus) ; avant, un clic « ailleurs » ou un double clic pouvait tomber
 * sur une proposition venue se glisser sous la souris.
 */
function SearchExisting({ classId, rank, spells, pending, error, onClose, onLink }: { classId: string; rank: number; spells: ClassSpell[]; pending: boolean; error: string; onClose: () => void; onLink: (spell: ClassSpell) => void }) {
  const [query, setQuery] = useState("")
  const panel = useRef<HTMLDivElement>(null)
  const pressed = useRef<{ id: string; at: number } | null>(null)
  const openedAt = useRef(0)
  const close = useRef(onClose)
  useEffect(() => { close.current = onClose })
  useEffect(() => {
    openedAt.current = performance.now()
    const outside = (event: PointerEvent) => {
      const target = event.target as Element | null
      if (!target || panel.current?.contains(target) || target.closest?.(`[${SEARCH_TOGGLE}]`)) return
      close.current()
    }
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") close.current() }
    document.addEventListener("pointerdown", outside, true)
    document.addEventListener("keydown", escape)
    return () => { document.removeEventListener("pointerdown", outside, true); document.removeEventListener("keydown", escape) }
  }, [])
  const normalized = query.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("fr").trim()
  const results = spells.filter((spell) => spell.classRanks[classId] !== rank && (!normalized || searchText(spell).includes(normalized))).slice(0, 40)
  const choose = (spell: ClassSpell, event: ReactMouseEvent) => {
    const press = pressed.current
    pressed.current = null
    // Entrée ou Espace sur une proposition (clavier) : choisie.
    if (event.detail === 0) { onLink(spell); return }
    // Un double clic, un appui commencé ailleurs ou juste à l'ouverture : rien n'est choisi.
    if (event.detail > 1 || !press || press.id !== spell.id || press.at - openedAt.current < 250) return
    onLink(spell)
  }
  return <div ref={panel} className="mb-3 rounded-xl border bg-card/75 p-3"><div className="flex items-center gap-2"><div className="relative flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Titre, compétence, type, effet ou description…" className="pl-9" /></div><Button type="button" variant="ghost" size="icon-sm" onClick={onClose} title="Fermer sans choisir (Échap)"><X /></Button></div>{/* L'erreur s'affiche ici aussi : en haut de page, elle passait inaperçue. */}{error && <p className="mt-2 rounded-lg border border-destructive/25 bg-destructive/5 px-3 py-2 text-xs text-destructive">{error}</p>}<p className="mt-2 text-[11px] text-muted-foreground">Clique sur un sort pour le ranger ici · un clic ailleurs ou Échap referme sans rien choisir.{results.some((spell) => typeof spell.classRanks[classId] === "number") ? " Un sort déjà rangé dans un autre rang de cette classe y est déplacé." : ""}</p><div className="mt-2 grid max-h-80 gap-2 overflow-y-auto md:grid-cols-2">{results.map((spell) => { const elsewhere = spell.classRanks[classId]; return <button key={spell.id} type="button" disabled={pending} onPointerDown={() => { pressed.current = { id: spell.id, at: performance.now() } }} onClick={(event) => choose(spell, event)} className="rounded-lg border bg-background/55 p-3 text-left hover:bg-muted/45"><span className="flex flex-wrap items-center gap-2"><b>{spell.name}</b><Badge variant="outline">{spell.type}</Badge>{typeof elsewhere === "number" && <Badge variant="secondary">déjà en {elsewhere === 0 ? "C" : `R${elsewhere}`}</Badge>}{spell.category === "actif" && <SpellChargeStars total={spell.charges} />}</span>{spell.skills.length > 0 && <span className="mt-1 block text-xs font-semibold text-[#b3261e]">{spell.skills.join(" · ")}</span>}<blockquote className="mt-1 line-clamp-2 border-l-2 pl-2 text-xs text-muted-foreground">{spell.effect || spell.description || "Aucun texte"}</blockquote></button> })}</div>{!results.length && <p className="py-5 text-center text-xs text-muted-foreground">Aucun sort correspondant.</p>}</div>
}

/**
 * Un index de sorts. `classes` : « Sorts des classes », avec l'onglet Par classe, les
 * bonus et les liens vers les classes. `creatures` : « Sorts des créatures », mêmes
 * tableaux sans classes, rangs ni bonus.
 */
const CLASS_CREATION_PATH = "/creation-de-classe"

function classCreationHref(classId: string) {
  return classId ? `${CLASS_CREATION_PATH}?classe=${encodeURIComponent(classId)}` : CLASS_CREATION_PATH
}

/**
 * Le choix de la classe : une liste de liens, pour qu'un clic droit (ou un clic du
 * milieu) ouvre la classe dans un autre onglet. Un clic simple l'affiche ici.
 */
function ClassPicker({ classes, selected, onSelect }: { classes: ClassRecord[]; selected: ClassRecord | undefined; onSelect: (classId: string) => void }) {
  const [open, setOpen] = useState(false)
  const sorted = useMemo(() => [...classes].sort((left, right) => left.name.localeCompare(right.name, "fr")), [classes])
  const item = (classId: string, name: string, accent?: string) => <a
    key={classId || "toutes"}
    href={classCreationHref(classId)}
    data-tab-label={classId ? `Classe · ${name}` : "Création de classe"}
    role="option"
    aria-selected={(selected?.id || "") === classId}
    onClick={(event) => {
      if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return
      event.preventDefault()
      setOpen(false)
      onSelect(classId)
    }}
    className={`flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm font-normal hover:bg-accent hover:text-accent-foreground ${(selected?.id || "") === classId ? "bg-accent/60 font-medium" : ""}`}
  >
    {accent ? <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: accent }} /> : <span className="size-2 shrink-0" />}
    <span className="truncate">{name}</span>
    {(selected?.id || "") === classId && <Check className="ml-auto size-3.5 shrink-0" />}
  </a>
  return <Popover open={open} onOpenChange={setOpen}>
    <PopoverTrigger asChild>
      <button type="button" className="flex h-9 w-full items-center gap-2 rounded-md border border-input bg-transparent px-3 text-left text-sm font-normal shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30">
        {selected && <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: selected.accentDark }} />}
        <span className="min-w-0 flex-1 truncate">{selected?.name ?? "Toutes les classes"}</span>
        <ChevronDown className="size-4 shrink-0 opacity-50" />
      </button>
    </PopoverTrigger>
    <PopoverContent align="start" className="max-h-80 w-[var(--radix-popover-trigger-width)] overflow-y-auto p-1" role="listbox">
      {item("", "Toutes les classes")}
      {sorted.map((characterClass) => item(characterClass.id, characterClass.name, characterClass.accentDark))}
    </PopoverContent>
  </Popover>
}

export function ClassIndexManager({ initialData, initialError, kind = "classes", initialClassId = "" }: { initialData: ResourceData; initialError: string; kind?: SpellIndexKind; initialClassId?: string }) {
  const forClasses = kind === "classes"
  // L'index des sorts dans le moteur des index, et cette page, pour reconnaître ses propres annonces.
  const spellIndexKey: WorldIndexKey = forClasses ? "class-spells" : "creature-spells"
  const [spellOrigin] = useState(() => `sorts-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`)
  const allowedTabs = forClasses ? ["classes", "actifs", "passifs", "bonus", "duplicates", "rank-bonus"] : ["actifs", "passifs", "duplicates"]
  const [data, setData] = useState(initialData)
  const [error, setError] = useState(initialError)
  const [pending, setPending] = useState(false)
  // Remonte les cellules seulement quand les lignes changent réellement (actualisation,
  // création, suppression) : une frappe enregistrée ne doit rien remonter.
  const [version, setVersion] = useState(0)
  const [query, setQuery] = useRememberedSearch(kind)
  const [storedTab, setStoredTab] = usePersistentState(
    "eraser:creature-spell-index:tab", "actifs",
    (v): v is string => typeof v === "string",
  )
  // « Sorts des classes » s'ouvre toujours sur l'onglet Classes, toutes classes.
  const [classTab, setClassTab] = useState("classes")
  const setTab = forClasses ? setClassTab : setStoredTab
  const currentTab = forClasses ? classTab : storedTab
  const tab = allowedTabs.includes(currentTab) ? currentTab : allowedTabs[0]
  // Vide : toutes les classes (état et statistiques d'ensemble).
  // Elle est aussi dans l'adresse (`?classe=`) : chaque classe s'ouvre dans son onglet.
  const [selectedClassId, setSelectedClassId] = useState(initialClassId)
  useEffect(() => {
    if (!forClasses) return
    const sync = () => setSelectedClassId(new URLSearchParams(window.location.search).get("classe") || "")
    window.addEventListener(URL_CHANGE_EVENT, sync)
    window.addEventListener("popstate", sync)
    return () => { window.removeEventListener(URL_CHANGE_EVENT, sync); window.removeEventListener("popstate", sync) }
  }, [forClasses])
  const playData = useClassPlayData(forClasses)
  const [newDraft, setNewDraft] = useState<ClassSpellDraft | null>(null)
  // Sort dont on veut voir le groupe de doublons, et sort ouvert dans l'éditeur.
  const [duplicateFocus, setDuplicateFocus] = useState<string | null>(null)
  const [editing, setEditing] = useState<ClassSpell | null>(null)
  const [notice, setNotice] = useState("")
  // Paires marquées « pas des doublons » : le calcul local ne doit pas les ramener.
  const ignoredPairs = useRef(ignoredPairsOf(initialData))
  // L'enregistrement d'un sort lit l'état courant, pas celui du rendu qui l'a programmé.
  const latestSpells = useRef(data.spells)
  useEffect(() => { latestSpells.current = data.spells }, [data.spells])
  const [searchRank, setSearchRank] = useState<number | null>(null)
  // La raison du dernier refus.
  const lastError = useRef("")
  const normalizedQuery = query.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("fr").trim()
  const filtered = useMemo(() => data.spells.filter((spell) => !normalizedQuery || searchText(spell).includes(normalizedQuery)), [data.spells, normalizedQuery])
  const selectedClass = data.classes.find((item) => item.id === selectedClassId)
  const selectedClassKey = selectedClass?.id || ""
  const rankCounts = useMemo(() => Array.from({ length: 21 }, (_, rank) => data.spells.filter((spell) => spell.classRanks[selectedClassKey] === rank).length), [data.spells, selectedClassKey])

  function updateSpells(updater: (spells: ClassSpell[]) => ClassSpell[]) {
    setData((current) => { const spells = updater(current.spells); return { ...current, spells, similarities: findClassSpellSimilarities(spells).filter((match) => !ignoredPairs.current.has(pairKey(match.leftId, match.rightId))) } })
  }

  function selectClass(classId: string) {
    setSelectedClassId(classId)
    if (forClasses && `${window.location.pathname}${window.location.search}` !== classCreationHref(classId)) replaceAppUrl(classCreationHref(classId))
    setNewDraft(null)
    setSearchRank(null)
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  function scrollToSection(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" })
  }

  function showDuplicates(spell: ClassSpell) {
    setDuplicateFocus(spell.id)
    setTab("duplicates")
  }

  async function merge(keep: ClassSpell, removed: ClassSpell[], draft: ClassSpellDraft) {
    // `original` : le sort gardé tel qu'il est affiché ; seuls les champs changés depuis partent.
    const result = await mutate({ action: "merge", keep: { rowNumber: keep.rowNumber, id: keep.id }, remove: removed.map((spell) => ({ rowNumber: spell.rowNumber, id: spell.id })), original: toDraft(keep), draft }) as (MutationResult & { creatures?: number; characters?: number }) | false
    if (result === false) return false
    await refresh()
    setDuplicateFocus(null)
    const characters = result?.characters ?? 0
    setNotice(`Fusion faite : « ${draft.name} » est conservé, ${removed.length} sort${removed.length > 1 ? "s" : ""} supprimé${removed.length > 1 ? "s" : ""}${characters ? `, ${characters} fiche${characters > 1 ? "s" : ""} de personnage mise${characters > 1 ? "s" : ""} à jour` : ""}${result?.creatures ? `, ${result.creatures} fiche${result.creatures > 1 ? "s" : ""} de créature mise${result.creatures > 1 ? "s" : ""} à jour` : ""}.`)
    return true
  }

  /**
   * Retient des paires « pas des doublons ». `nextFocus` : sort dont le groupe reste
   * ouvert ensuite (quand un seul sort est sorti d'un groupe de trois ou plus).
   */
  async function ignore(pairs: Array<[string, string]>, nextFocus: string | null = null, message = "Ces sorts ne seront plus proposés comme doublons.") {
    const result = await mutate({ action: "ignore", pairs }) as unknown as { assigned?: Record<string, string> } | null | false
    if (result === false) return false
    // Les sorts sans ID ont reçu un vrai ID : toutes les références suivent.
    const assigned = result?.assigned ?? {}
    const rename = (id: string) => assigned[id] ?? id
    const renamed = Object.keys(assigned).length > 0
    if (renamed) ignoredPairs.current = new Set([...ignoredPairs.current].map((key) => { const [left, right] = key.split("|"); return pairKey(rename(left), rename(right)) }))
    pairs.forEach(([left, right]) => ignoredPairs.current.add(pairKey(rename(left), rename(right))))
    updateSpells((spells) => renamed ? spells.map((spell) => assigned[spell.id] ? { ...spell, id: assigned[spell.id] } : spell) : spells)
    if (renamed) setVersion((current) => current + 1)
    setDuplicateFocus(nextFocus ? rename(nextFocus) : null)
    setNotice(message)
    return true
  }

  async function mutate(body: Record<string, unknown>, silent = false): Promise<MutationResult | false> {
    if (!silent) setPending(true)
    setError("")
    try {
      const response = await fetch("/api/resources/class-index", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...body, index: kind }) })
      const payload = await response.json() as { result?: MutationResult; error?: string }
      if (!response.ok) throw new Error(payload.error || "Enregistrement impossible.")
      // Les onglets Actifs, Passifs et Bonus (le moteur des index) relisent les sorts.
      announceWorldIndexChange([spellIndexKey], spellOrigin)
      return payload.result ?? null
    } catch (error) {
      lastError.current = error instanceof Error ? error.message : "Enregistrement impossible."
      setError(lastError.current)
      return false
    } finally { if (!silent) setPending(false) }
  }

  async function refresh() {
    setPending(true); setError("")
    try {
      const response = await fetch(`/api/resources/class-index?refresh=1&index=${kind}`, { cache: "no-store" })
      const payload = await response.json() as { data?: ResourceData; error?: string }
      if (!response.ok || !payload.data) throw new Error(payload.error || "Actualisation impossible.")
      ignoredPairs.current = ignoredPairsOf(payload.data)
      setData(payload.data)
      setVersion((current) => current + 1)
    } catch (error) { setError(error instanceof Error ? error.message : "Actualisation impossible.") } finally { setPending(false) }
  }

  /**
   * Renvoie le sort tel qu'enregistré, ou `null` si Sheets l'a refusé. `original` : le
   * sort tel qu'il était avant ces modifications ; seuls les champs changés depuis partent.
   */
  async function save(spell: ClassSpell, draft: ClassSpellDraft, silent = false, original: ClassSpellDraft = toDraft(spell)) {
    // L'ID retrouve la ligne même déplacée entre-temps ; une valeur changée ailleurs entre-temps fait refuser l'écriture.
    const result = await mutate({ action: "update", rowNumber: spell.rowNumber, expectedId: spell.id, original, draft }, silent)
    if (result === false) return null
    // Le sort relu par le serveur : la prochaine modification part de ce que la feuille contient vraiment.
    const saved = result?.spell ?? materialize(draft, result?.rowNumber || spell.rowNumber, result?.id || draft.id || spell.id, result?.tone)
    const shown = saved
    // Tout de suite, sans attendre le rendu : l'enregistrement suivant (la fiche enchaîne
    // les siens) part de ce que la feuille contient, et n'est pas refusé comme « changé entre-temps ».
    latestSpells.current = latestSpells.current.map((item) => item.id === spell.id ? shown : item)
    updateSpells((spells) => spells.map((item) => item.id === spell.id ? shown : item))
    return saved
  }

  async function create(draft: ClassSpellDraft) {
    const result = await mutate({ action: "add", rowNumber: null, draft })
    if (result === false || !result) return
    updateSpells((spells) => [...spells, result.spell ?? materialize(draft, result.rowNumber, result.id, result.tone)])
    setVersion((current) => current + 1)
    setNewDraft(null)
  }

  async function link(spell: ClassSpell, classId: string, rank: number | null) {
    if (rank !== null && rankCount(data.spells, classId, rank, spell.id) >= MAX_CLASS_SPELLS_PER_RANK) { setError("Ce rang contient déjà trois sorts."); return }
    const result = await mutate({ action: "link", rowNumber: spell.rowNumber, expectedId: spell.id, classId, rank, originalRank: spell.classRanks[classId] ?? null })
    if (result === false) return
    updateSpells((spells) => spells.map((item) => item.id === spell.id ? { ...item, classRanks: Object.fromEntries(Object.entries({ ...item.classRanks, [classId]: rank }).filter((entry): entry is [string, number] => typeof entry[1] === "number")) } : item))
    setSearchRank(null)
  }

  async function remove(spell: ClassSpell) {
    const result = await mutate({ action: "delete", rowNumber: spell.rowNumber, expectedId: spell.id })
    if (result === false) return
    // La ligne vraiment supprimée (le sort a pu être retrouvé ailleurs) : les suivantes remontent.
    const deleted = result?.rowNumber || spell.rowNumber
    updateSpells((spells) => spells.filter((item) => item.id !== spell.id).map((item) => item.rowNumber > deleted ? { ...item, rowNumber: item.rowNumber - 1 } : item))
    setVersion((current) => current + 1)
  }


  function startCreate(classId?: string, rank?: number) {
    const draft = emptyDraft()
    if (classId && rank !== undefined) draft.classRanks[classId] = rank
    setNewDraft(draft)
  }

  const editableProps = { classes: data.classes, allSpells: data.spells, similarities: data.similarities, onSave: (spell: ClassSpell, draft: ClassSpellDraft, base: ClassSpell) => save(spell, draft, true, toDraft(base)), onDelete: remove, onShowDuplicates: showDuplicates }
  const duplicateGroups = useMemo(() => groupSimilarities(data.spells, data.similarities).length, [data.similarities, data.spells])

  // Une modification faite dans les onglets du moteur (ou ailleurs) : les sorts de cette page
  // (classes, rangs, doublons, statistiques) sont relus, sans bloquer la page.
  useEffect(() => {
    let timer = 0
    let alive = true
    const stop = onWorldIndexChange((keys, from) => {
      if (from === spellOrigin || !keys.includes(spellIndexKey)) return
      window.clearTimeout(timer)
      timer = window.setTimeout(async () => {
        const response = await fetch(`/api/resources/class-index?index=${kind}`, { cache: "no-store" }).catch(() => null)
        const payload = (await response?.json().catch(() => ({})) ?? {}) as { data?: ResourceData }
        if (!alive || !response?.ok || !payload.data) return
        ignoredPairs.current = ignoredPairsOf(payload.data)
        setData(payload.data)
      }, 400)
    })
    return () => { alive = false; window.clearTimeout(timer); stop() }
  }, [kind, spellIndexKey, spellOrigin])

  // Les gestes de la page, lus à l'appel : les vues du moteur ne se reconstruisent pas à chaque rendu.
  const pageActions = useRef({ save, showDuplicates, startCreate })
  useLayoutEffect(() => { pageActions.current = { save, showDuplicates, startCreate } })
  const spellById = useMemo(() => new Map(data.spells.map((spell) => [spell.id, spell])), [data.spells])
  /**
   * Actifs, Passifs et Bonus : l'index des sorts dans le moteur des index (cartes, onglets-
   * fenêtres, « Modifier », formules, tri, fiche…), limité à leurs sorts. La page y ajoute
   * « Classes et rangs », « Doublons » et « Créer un sort ».
   */
  const spellViews = useMemo(() => Object.fromEntries((["actifs", "passifs", "bonus"] as const).map((view): [string, IndexEmbed] => [view, {
    id: `${kind}:${view}`,
    label: view === "actifs" ? "Actifs" : view === "passifs" ? "Passifs" : "Bonus",
    rowFilter: (cell) => {
      const category = classSpellCategory(cell("Type") || cell("Type de sort"))
      // Pas de bonus chez les créatures : un sort ainsi typé reste visible avec les actifs.
      return view === "actifs" ? (forClasses ? category === "actif" : category !== "passif") : category === (view === "passifs" ? "passif" : "bonus")
    },
    query,
    // Distance et charges ne concernent que les actifs.
    hiddenColumns: view === "actifs" ? [] : ["Distance", "Charges"],
    extraColumns: forClasses ? [{
      key: "__classes",
      label: "Classes et rangs",
      width: 280,
      after: "Compétences",
      render: (row: IndexEmbedRow, compact: boolean) => {
        const spell = spellById.get(row.id)
        if (!spell) return <span className="px-2 text-xs text-muted-foreground" title="Le sort reçoit son identifiant à son premier enregistrement.">—</span>
        const draft = toDraft(spell)
        return <ClassLinksEditor compact={compact} draft={draft} classes={data.classes} spells={data.spells} spellId={spell.id} onChange={(classRanks) => void pageActions.current.save(spell, { ...draft, classRanks }, true)} />
      },
    }] : [],
    rowMenuExtras: (row: IndexEmbedRow) => {
      const spell = spellById.get(row.id)
      return spell ? <ContextMenuItem onSelect={() => pageActions.current.showDuplicates(spell)}><CopyCheck />Doublons et ressemblances</ContextMenuItem> : null
    },
    onAdd: () => pageActions.current.startCreate(),
    addLabel: "Créer un sort",
    ...(view === "actifs" ? {} : { addDefaults: { Type: view === "passifs" ? "Passif" : "Bonus" } }),
  }])), [data.classes, data.spells, forClasses, kind, query, spellById])

  /**
   * Bonus de rang : l'onglet « Bonus de rang » du classeur des sorts, dans le moteur des index
   * comme les sorts. Une ligne par rang ; « Ajouter un rang » ajoute le suivant, sans limite.
   */
  const rankBonusView = useMemo<IndexEmbed>(() => ({
    id: "bonus-de-rang",
    label: "Tous les rangs",
    rowFilter: () => true,
    query,
    addLabel: "Ajouter un rang",
    onAdd: () => void (async () => {
      setError("")
      const response = await fetch("/api/classes/rank-bonuses", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "add-rank" }) }).catch(() => null)
      const payload = (await response?.json().catch(() => ({})) ?? {}) as { error?: string }
      if (!response?.ok) { setError(payload.error || "Le rang n’a pas pu être ajouté."); return }
      announceWorldIndexChange(["rank-bonuses"], spellOrigin)
    })(),
  }), [query, spellOrigin])

  const engineTab = ["actifs", "passifs", "bonus", "rank-bonus"].includes(tab)
  const page = <section className="flex flex-col gap-3" {...(forClasses ? { [IN_PLACE_ATTRIBUTE]: CLASS_CREATION_PATH } : {})}>
    <datalist id="class-spell-types">{classSpellTypeSuggestions.filter((type) => forClasses || classSpellCategory(type) !== "bonus").map((type) => <option key={type} value={type} />)}</datalist>
    <div className="flex shrink-0 flex-col gap-3 rounded-2xl border bg-card/75 p-3 shadow-sm lg:flex-row lg:items-center"><div className="relative min-w-0 flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Titre, compétence, type, effet ou description…" className="pl-9" /></div>{/* Les onglets du moteur des index ont leurs propres boutons (Actualiser, Modifier, Créer…) : ici, seule la recherche reste. */}{!engineTab && <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" onClick={() => void refresh()} disabled={pending}>{pending ? <LoaderCircle className="animate-spin" /> : <RefreshCw />}Actualiser</Button><ReadOnlyIndexEditorButton model={() => spellEditorModel(kind)} disabled={pending} /><Button type="button" onClick={() => startCreate()}><Plus />Créer un sort</Button></div>}</div>
    {error && <p className="shrink-0 rounded-xl border border-destructive/25 bg-destructive/5 px-4 py-2.5 text-sm text-destructive">{error}</p>}
    {notice && <p className="flex shrink-0 items-center gap-2 rounded-xl border border-emerald-600/25 bg-emerald-600/5 px-4 py-2.5 text-sm text-emerald-800 dark:text-emerald-300"><Check className="size-4" />{notice}<button type="button" onClick={() => setNotice("")} className="ml-auto text-muted-foreground hover:text-foreground" aria-label="Fermer"><X className="size-4" /></button></p>}
    <Dialog open={Boolean(editing)} onOpenChange={(open) => { if (!open) setEditing(null) }}>
      <DialogContent className="max-h-[92svh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader><DialogTitle>Modifier « {editing?.name} »</DialogTitle></DialogHeader>
        {editing && <SpellForm key={`${editing.rowNumber}:${editing.id}`} withClasses={forClasses} initial={toDraft(editing)} classes={data.classes} spells={data.spells} pending={pending} title={`Ligne ${editing.rowNumber}`} onCancel={() => setEditing(null)} onSave={(draft, original) => void save(editing, draft, false, original).then(() => setEditing(null))} />}
      </DialogContent>
    </Dialog>
    {newDraft && Object.keys(newDraft.classRanks).length === 0 && <div className="shrink-0"><SpellForm withClasses={forClasses} initial={newDraft} classes={data.classes} spells={data.spells} pending={pending} title="Nouveau sort" onCancel={() => setNewDraft(null)} onSave={(draft) => void create(draft)} /></div>}
    <Tabs value={tab} onValueChange={setTab} className="flex flex-col"><TabsList variant="line" className="h-auto w-full shrink-0 flex-wrap justify-start">{forClasses && <TabsTrigger value="classes">Classes</TabsTrigger>}<TabsTrigger value="actifs">Actifs</TabsTrigger><TabsTrigger value="passifs">Passifs</TabsTrigger>{forClasses && <TabsTrigger value="bonus">Bonus</TabsTrigger>}<TabsTrigger value="duplicates">Doublons {duplicateGroups > 0 && <Badge variant="destructive">{duplicateGroups}</Badge>}</TabsTrigger>{forClasses && <TabsTrigger value="rank-bonus">Bonus Rang</TabsTrigger>}</TabsList>
      <TabsContent value="classes" className="mt-3"><div className="mb-5 grid max-w-sm gap-1.5 text-sm font-medium">Classe<ClassPicker classes={data.classes} selected={selectedClass} onSelect={selectClass} /></div>{!selectedClass ? <div className="space-y-10"><ClassStateOverview classes={data.classes} spells={data.spells} headers={data.headers} onSelect={selectClass} hrefFor={classCreationHref} /><GlobalClassStatistics classes={data.classes} spells={data.spells} playData={playData} /></div> : <div className="space-y-8 md:pr-8">{tab === "classes" && <RankRail counts={rankCounts} accent={selectedClass.accentDark} />}<section id="classe-etat" className="scroll-mt-24"><ClassStateDetail characterClass={selectedClass} spells={data.spells} headers={data.headers} onRank={(rank) => scrollToSection(`rang-${rank}`)} onBack={() => selectClass("")} /></section><section id="classe-presentation" className="scroll-mt-24 space-y-2"><div><p className="text-[10px] font-semibold uppercase tracking-[.2em] text-primary/75">{selectedClass.name}</p><h3 className="font-display text-2xl font-semibold">Présentation</h3></div><ClassPresentationEditor key={selectedClass.id} classId={selectedClass.id} accent={selectedClass.accentDark} /></section><section id="classe-stats" className="scroll-mt-24 space-y-2"><div><p className="text-[10px] font-semibold uppercase tracking-[.2em] text-primary/75">{selectedClass.name}</p><h3 className="font-display text-2xl font-semibold">Statistiques</h3></div><ClassStatisticsFor characterClass={selectedClass} classes={data.classes} spells={data.spells} playData={playData} /></section><div className="border-t pt-6"><p className="text-[10px] font-semibold uppercase tracking-[.2em] text-primary/75">{selectedClass.name}</p><h3 className="font-display text-2xl font-semibold">Rangs et sorts</h3></div>{Array.from({ length: 21 }, (_, rank) => { const allAtRank = data.spells.filter((spell) => spell.classRanks[selectedClass.id] === rank); const shown = filtered.filter((spell) => spell.classRanks[selectedClass.id] === rank); const full = allAtRank.length >= MAX_CLASS_SPELLS_PER_RANK; return <section key={rank} id={`rang-${rank}`} data-rank={rank} className="scroll-mt-24 rounded-2xl border bg-background/25 p-4" style={{ borderColor: `${selectedClass.accentDark}32` }}><div className="mb-3 flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-2"><span className="flex size-8 items-center justify-center rounded-full text-xs font-bold" style={{ color: selectedClass.accentDark, backgroundColor: `${selectedClass.accentLight}45` }}>{rank === 0 ? "C" : rank}</span><div><h3 className="font-display text-lg font-semibold">{rankLabel(rank)}</h3><p className={`text-xs ${allAtRank.length > 3 ? "text-destructive" : "text-muted-foreground"}`}>{allAtRank.length} / {MAX_CLASS_SPELLS_PER_RANK} sort{allAtRank.length > 1 ? "s" : ""}{allAtRank.length > 3 ? " — corriger le dépassement" : ""}</p></div></div><div className="flex gap-2"><Button type="button" size="sm" variant="outline" disabled={full} {...{ [SEARCH_TOGGLE]: "" }} onClick={() => { setError(""); setSearchRank(searchRank === rank ? null : rank) }}><Search />Chercher un sort</Button><Button type="button" size="sm" disabled={full} onClick={() => startCreate(selectedClass.id, rank)}><Plus />Créer ici</Button></div></div>{searchRank === rank && <SearchExisting classId={selectedClass.id} rank={rank} spells={data.spells} pending={pending} error={error} onClose={() => setSearchRank(null)} onLink={(spell) => void link(spell, selectedClass.id, rank)} />}{newDraft?.classRanks[selectedClass.id] === rank && <div className="mb-3"><SpellForm initial={newDraft} classes={data.classes} spells={data.spells} pending={pending} title={`Nouveau sort — ${rankLabel(rank)}`} onCancel={() => setNewDraft(null)} onSave={(draft) => void create(draft)} /></div>}<div className="grid gap-3 xl:grid-cols-3">{shown.map((spell) => <EditableSpell key={`${spell.id}:${spell.rowNumber}:${version}`} spell={spell} {...editableProps} place={{ className: selectedClass.name, rank, onUnlink: (item) => void link(item, selectedClass.id, null) }} />)}</div>{!shown.length && <p className="rounded-xl border border-dashed px-4 py-5 text-center text-sm text-muted-foreground">{normalizedQuery ? "Aucun résultat dans ce rang." : "Ce rang est vide."}</p>}</section> })}</div>}</TabsContent>
      {(["actifs", "passifs", "bonus"] as const).map((view) => <TabsContent key={view} value={view} className="mt-3">{tab === view && <EmbeddedWorldIndex key={view} indexKey={spellIndexKey} embed={spellViews[view]} />}</TabsContent>)}
      <TabsContent value="duplicates" className="mt-3">{data.similaritiesError && <p className="mb-3 rounded-xl border border-destructive/25 bg-destructive/5 px-4 py-2.5 text-sm text-destructive">{data.similaritiesError}</p>}<SpellDuplicates key={duplicateFocus ?? "tous"} spells={data.spells} classes={data.classes} similarities={data.similarities} focusSpellId={duplicateFocus} pending={pending} onMerge={merge} onIgnore={ignore} onEdit={setEditing} onDelete={remove} /></TabsContent>
      {forClasses && <TabsContent value="rank-bonus" className="mt-3">{tab === "rank-bonus" && <EmbeddedWorldIndex key="rank-bonus" indexKey="rank-bonuses" embed={rankBonusView} />}</TabsContent>}
    </Tabs>
  </section>
  // Le titre de l'onglet suit la classe affichée.
  return forClasses ? <PageLabel label={selectedClass ? `Classe · ${selectedClass.name}` : "Création de classe"}>{page}</PageLabel> : page
}
