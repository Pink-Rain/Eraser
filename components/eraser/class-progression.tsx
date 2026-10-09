"use client"

import { useMemo, useState, type DragEvent, type MouseEvent } from "react"
import { usePersistentState } from "@/hooks/use-persistent-state"
import { ChevronDown, CircleDotDashed, Crosshair, Gauge, GripVertical, Plus, Search, Trash2, Undo2, X, Zap } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { InlineEdit } from "@/components/eraser/inline-edit"
import { RichTextInlineEditor } from "@/components/eraser/rich-text"
import { SpellChargeStars } from "@/components/eraser/spell-charges"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { useRankBonuses } from "@/components/eraser/rank-bonus"
import { NewSpellSlot } from "@/components/eraser/spell-choice-dialog"
import { markNewSlots, NewSlotsContext, useNewSlot, useNewSlots } from "@/components/eraser/new-inventory-items"
import type { ClassSpell } from "@/lib/class-content"
import { rankBonusHasContent, type RankBonus } from "@/lib/rank-bonuses"
import { parseCharacterStates, type CharacterState } from "@/lib/character-states"
import { classSpellActionKind, classSpellCategory, splitClassSpellSkills } from "@/lib/class-spell-utils"
import { normalizeClassLabel } from "@/lib/class-utils"
import type { ClassRecord } from "@/lib/google-sheets"
import { parseListCell } from "@/lib/multiple-values"

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
  /** Les états posés sur le personnage (Index des états) et leur niveau. */
  states: CharacterState[]
  /**
   * Les bonus de rang obtenus. `from` : les rangs jusqu'à celui-ci étaient atteints avant
   * l'arrivée des bonus de rang (ils ne sont pas reproposés) ; absent tant que le personnage
   * n'a pas pris de niveau depuis. `taken` : par rang, ce qui a été ajouté à la fiche.
   */
  rankBonuses: { from: number | null; taken: Record<string, RankBonusTaken> }
  /**
   * L'état de jeu des spécificités de classe (jauges…), par identifiant de spécificité ;
   * lu et vérifié par lib/class-specifics.
   */
  specifics?: Record<string, unknown>
}

/** Ce qu'un rang a ajouté à la fiche : les valeurs écrites, et le sort sur mesure choisi. */
export type RankBonusTaken = { applied: Array<{ target: string; amount: number }>; spell?: string; at?: string; /** Validé sans rien ajouter : déjà reporté à la main. */ manual?: boolean }

function parseRankBonusState(value: unknown): CharacterClassChoices["rankBonuses"] {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}
  const from = typeof source.from === "number" && Number.isFinite(source.from) ? Math.max(0, Math.trunc(source.from)) : null
  const taken: Record<string, RankBonusTaken> = {}
  if (source.taken && typeof source.taken === "object" && !Array.isArray(source.taken)) {
    for (const [rank, raw] of Object.entries(source.taken as Record<string, unknown>)) {
      if (!raw || typeof raw !== "object") continue
      const entry = raw as Record<string, unknown>
      const applied = Array.isArray(entry.applied) ? entry.applied.flatMap((item) => item && typeof item === "object" && typeof (item as { target?: unknown }).target === "string" && typeof (item as { amount?: unknown }).amount === "number" ? [{ target: (item as { target: string }).target, amount: (item as { amount: number }).amount }] : []) : []
      taken[rank] = { applied, ...(typeof entry.spell === "string" ? { spell: entry.spell } : {}), ...(typeof entry.at === "string" ? { at: entry.at } : {}), ...(entry.manual === true ? { manual: true } : {}) }
    }
  }
  return { from, taken }
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

/**
 * Lit la case. Ce que cette version ne connaît pas (clés ajoutées par une version plus
 * récente) est gardé tel quel : chaque réécriture part de `...state` et le renvoie, rien
 * n'est effacé en passant.
 */
export function parseClassChoices(value: string): CharacterClassChoices {
  try {
    const parsed = JSON.parse(value) as Partial<CharacterClassChoices>
    const kept = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {}
    return {
      ...kept,
      choices: parsed && typeof parsed.choices === "object" && parsed.choices ? parsed.choices as CharacterClassChoices["choices"] : {},
      charges: parsed && typeof parsed.charges === "object" && parsed.charges ? parsed.charges as CharacterClassChoices["charges"] : {},
      extras: parsed && Array.isArray(parsed.extras) ? parsed.extras.filter((item): item is string => typeof item === "string") : [],
      order: parsed && Array.isArray(parsed.order) ? parsed.order.filter((item): item is string => typeof item === "string") : [],
      edits: parseSpellEdits(parsed?.edits),
      removed: parsed && Array.isArray(parsed.removed) ? parsed.removed.filter((item): item is string => typeof item === "string") : [],
      states: parseCharacterStates(parsed?.states),
      rankBonuses: parseRankBonusState(parsed?.rankBonuses),
      ...(kept.specifics && typeof kept.specifics === "object" && !Array.isArray(kept.specifics) ? { specifics: kept.specifics as Record<string, unknown> } : {}),
    }
  } catch {
    return { choices: {}, charges: {}, extras: [], order: [], edits: {}, removed: [], states: [], rankBonuses: { from: null, taken: {} } }
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
  const names = parseListCell(value).entries
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

/** Un rang de classe dont le sort reste à choisir, avec ses (au plus) trois propositions. */
export type PendingSpellChoice = { classId: string; className: string; accent: string; accentLight: string; rank: number; options: ClassSpell[] }

/**
 * Les choix de sorts en attente : chaque rang atteint (hors rang commun) qui propose des
 * sorts et dont le choix manque, ou dont le sort choisi a été retiré de la fiche.
 */
export function pendingSpellChoices(classes: ClassRecord[], spells: ClassSpell[], level: number, value: string): PendingSpellChoice[] {
  const state = parseClassChoices(value)
  const removed = new Set(state.removed)
  return classes.flatMap((characterClass) => Array.from({ length: Math.max(0, level) }, (_, index) => index + 1).flatMap((rank) => {
    const options = spells.filter((spell) => spell.classRanks[characterClass.id] === rank).slice(0, 3)
    const chosen = state.choices[characterClass.id]?.[String(rank)]
    if (!options.length || (chosen && !removed.has(chosen))) return []
    return [{ classId: characterClass.id, className: characterClass.name, accent: characterClass.accentDark || "#927640", accentLight: characterClass.accentLight || "#d8c39a", rank, options: options.map((spell) => personalizeSpell(spell, state.edits[spell.id])) }]
  }))
}

/** Les choix de sorts après avoir retenu `spellId` au rang `rank` de la classe. */
export function chooseClassSpell(value: string, classId: string, rank: number, spellId: string) {
  const state = parseClassChoices(value)
  const previous = state.choices[classId]?.[String(rank)]
  const choices = { ...state.choices, [classId]: { ...(state.choices[classId] || {}), [String(rank)]: spellId } }
  // Le sort choisi n'est plus « retiré » ; l'ancien choix retiré n'a plus lieu d'être rétabli.
  return JSON.stringify({ ...state, choices, removed: state.removed.filter((id) => id !== spellId && id !== previous) })
}

/**
 * Une étape du passage de rang, dans l'ordre des rangs : le sort à choisir d'une classe
 * et, pour la première classe du rang, les bonus de ce rang. Un rang sans sort à choisir
 * (au-delà de 20, ou déjà choisi) peut n'avoir que ses bonus.
 */
export type PendingRankStep = {
  key: string
  rank: number
  choice?: PendingSpellChoice
  bonus?: RankBonus
  className: string
  accent: string
  accentLight: string
}

/** Les rangs dont les bonus restent à obtenir : après `from`, jusqu'au niveau, pas encore pris. */
/**
 * Les rangs atteints dont les bonus restent à obtenir : tous ceux qui ne sont pas encore
 * notés comme obtenus (un rang reporté à la main se valide avec « Déjà ajoutés à la main »).
 */
export function pendingRankBonuses(bonuses: RankBonus[], level: number, value: string) {
  const { rankBonuses } = parseClassChoices(value)
  return bonuses.filter((bonus) => bonus.rank <= level && rankBonusHasContent(bonus) && !rankBonuses.taken[String(bonus.rank)])
}

export function pendingRankSteps(classes: ClassRecord[], spells: ClassSpell[], level: number, value: string, bonuses: RankBonus[]): PendingRankStep[] {
  const choices = pendingSpellChoices(classes, spells, Math.min(20, level), value)
  const waiting = new Map(pendingRankBonuses(bonuses, level, value).map((bonus) => [bonus.rank, bonus]))
  const steps: PendingRankStep[] = choices.map((choice) => {
    const bonus = waiting.get(choice.rank)
    waiting.delete(choice.rank)
    return { key: `${choice.classId}:${choice.rank}`, rank: choice.rank, choice, bonus, className: choice.className, accent: choice.accent, accentLight: choice.accentLight }
  })
  const first = classes[0]
  for (const bonus of waiting.values()) steps.push({ key: `bonus:${bonus.rank}`, rank: bonus.rank, bonus, className: first?.name ?? "", accent: first?.accentDark || "#927640", accentLight: first?.accentLight || "#d8c39a" })
  return steps.sort((left, right) => left.rank - right.rank || Number(Boolean(right.bonus)) - Number(Boolean(left.bonus)))
}

/** Note les bonus d'un rang comme obtenus ; le sort sur mesure rejoint les sorts de la fiche. */
export function takeRankBonus(value: string, rank: number, taken: RankBonusTaken) {
  const state = parseClassChoices(value)
  const spell = taken.spell
  const extras = spell ? [...state.extras.filter((id) => id !== spell), spell] : state.extras
  return JSON.stringify({
    ...state,
    extras,
    removed: spell ? state.removed.filter((id) => id !== spell) : state.removed,
    order: spell ? [...state.order.filter((id) => id !== spell), spell] : state.order,
    rankBonuses: { from: state.rankBonuses.from ?? 0, taken: { ...state.rankBonuses.taken, [String(rank)]: { ...taken, at: new Date().toISOString() } } },
  })
}

/** Ce qu'un personnage perd en descendant au niveau `level` : sorts choisis et bonus obtenus aux rangs au-dessus. */
export type RankLoss = { ranks: number[]; spells: Array<{ classId: string; rank: number; spellId: string }>; bonuses: Array<{ rank: number; taken: RankBonusTaken }> }

export function rankLossOf(value: string, level: number): RankLoss {
  const state = parseClassChoices(value)
  const spells = Object.entries(state.choices).flatMap(([classId, ranks]) => Object.entries(ranks ?? {}).flatMap(([rank, spellId]) => Number(rank) > level && typeof spellId === "string" && spellId ? [{ classId, rank: Number(rank), spellId }] : []))
  const bonuses = Object.entries(state.rankBonuses.taken).flatMap(([rank, taken]) => Number(rank) > level ? [{ rank: Number(rank), taken }] : [])
  const ranks = [...new Set([...spells.map((item) => item.rank), ...bonuses.map((item) => item.rank)])].sort((left, right) => left - right)
  return { ranks, spells, bonuses }
}

/**
 * Les choix après une descente au niveau `level` : les sorts choisis aux rangs au-dessus
 * sont oubliés, leurs bonus et leurs sorts sur mesure aussi, et ces rangs redeviennent à
 * choisir quand le personnage les reprend. (Les valeurs ajoutées à la fiche sont retirées
 * par la fiche, qui sait où elles ont été écrites.)
 */
export function dropRanksAbove(value: string, level: number) {
  const state = parseClassChoices(value)
  const loss = rankLossOf(value, level)
  if (!loss.ranks.length && (state.rankBonuses.from === null || state.rankBonuses.from <= level)) return value
  const customSpells = new Set(loss.bonuses.flatMap((item) => item.taken.spell ? [item.taken.spell] : []))
  const choices = Object.fromEntries(Object.entries(state.choices).map(([classId, ranks]) => [classId, Object.fromEntries(Object.entries(ranks ?? {}).filter(([rank]) => Number(rank) <= level))]))
  const taken = Object.fromEntries(Object.entries(state.rankBonuses.taken).filter(([rank]) => Number(rank) <= level))
  return JSON.stringify({
    ...state,
    choices,
    extras: state.extras.filter((id) => !customSpells.has(id)),
    order: state.order.filter((id) => !customSpells.has(id)),
    rankBonuses: { from: state.rankBonuses.from === null ? null : Math.min(state.rankBonuses.from, level), taken },
  })
}

/** La clé des pastilles « nouveau sort » d'un personnage. */
export const newSpellsKey = (ownerId: string) => `sorts:${ownerId}`

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
  const fresh = useNewSlot(spell.id)
  return <details
    onPointerMove={fresh.isNew ? fresh.seen : undefined}
    onFocusCapture={fresh.isNew ? fresh.seen : undefined}
    className={`group relative rounded-xl border bg-background/45 transition-colors ${dragOver ? "border-dashed" : ""}`}
    style={{ borderColor: dragOver ? accent : `${tone.background}66` }}
    onDragOver={manual ? (event) => { event.preventDefault(); onDragOver?.(event) } : undefined}
    onDrop={manual ? (event) => { event.preventDefault(); onDrop?.() } : undefined}
  >
    {/* Dans l'en-tête : le reste d'un <details> replié n'est pas affiché, la pastille y restait invisible. */}
    <summary className="relative flex cursor-pointer list-none items-center gap-3 px-3 py-3 [&::-webkit-details-marker]:hidden">
      {fresh.isNew && <span className="absolute -left-1 -top-1 z-10 size-2.5 rounded-full bg-rose-400 ring-2 ring-card" title="Nouveau sort — disparaît au survol" aria-label="Nouveau sort" />}
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


/**
 * La progression de classe d'un personnage. La fenêtre « Nouveau sort » appartient à la
 * fiche (elle s'ouvre au passage de niveau, quel que soit l'onglet) : `onOpenChoice`
 * l'ouvre, `onSpellRemoved` la propose après le retrait d'un sort choisi à un rang.
 */
export function ClassProgression({ classes, spells, level, characterLevel = level, value, onCommit, loading = false, error = "", ownerId = "", onOpenChoice, onSpellRemoved }: { classes: ClassRecord[]; spells: ClassSpell[]; level: number; /** Le Level du personnage, au-delà de 20 compris (bonus de rang). */ characterLevel?: number; value: string; onCommit: (value: string) => Promise<void>; loading?: boolean; error?: string; ownerId?: string; onOpenChoice?: () => void; onSpellRemoved?: () => void }) {
  const state = useMemo(() => parseClassChoices(value), [value])
  // Les sorts tout juste obtenus portent une pastille jusqu'à ce qu'on les survole.
  const spellsKey = newSpellsKey(ownerId)
  const newSpells = useNewSlots(spellsKey)
  // Bonus de rang (communs à toutes les classes), pour l'emplacement « Nouveau sort / Bonus de rang ».
  const { bonuses: rankBonuses } = useRankBonuses()
  const [sort, setSort] = usePersistentState<"rank" | "name" | "type" | "manual">(
    "eraser:class-progression:sort", "rank",
    (v): v is "rank" | "name" | "type" | "manual" => v === "rank" || v === "name" || v === "type" || v === "manual",
  )
  const [searchOpen, setSearchOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [searchCategory, setSearchCategory] = useState<"all" | ClassSpell["category"]>("all")
  const known = knownSpellsForCharacter(classes, spells, level, value)
  // Ce que la fenêtre de passage de rang propose : sorts à choisir et bonus de rang.
  const steps = useMemo(() => pendingRankSteps(classes, spells, characterLevel, value, rankBonuses), [classes, spells, characterLevel, value, rankBonuses])
  const currentStep = steps[0]

  async function update(next: CharacterClassChoices) { await onCommit(JSON.stringify(next)) }
  function setCharges(spell: ClassSpell, count: number) {
    return update({ ...state, charges: { ...state.charges, [spell.id]: Math.max(0, Math.min(spell.charges ?? 0, count)) } })
  }
  function addExtra(spellId: string) {
    if (state.extras.includes(spellId) && !state.removed.includes(spellId)) return
    if (ownerId) markNewSlots(spellsKey, [spellId])
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
  /**
   * Retirer un sort de la fiche :
   * - choisi à un rang de classe : le choix de ce rang est annulé, et le rang repropose ses
   *   trois sorts (« Nouveau sort ») ;
   * - acquis d'office au rang commun : mis de côté, pour pouvoir être rétabli ;
   * - ajouté à la main (hors classe) : il quitte simplement la liste.
   */
  function removeSpell(spell: ClassSpell) {
    const classIds = new Set(classes.map((item) => item.id))
    const chosenAt = Object.entries(spell.classRanks).filter(([classId, rank]) => classIds.has(classId) && rank > 0 && rank <= level && state.choices[classId]?.[String(rank)] === spell.id)
    const common = Object.entries(spell.classRanks).some(([classId, rank]) => classIds.has(classId) && rank === 0)
    const choices = { ...state.choices }
    for (const [classId, rank] of chosenAt) {
      const ranks = { ...(choices[classId] || {}) }
      delete ranks[String(rank)]
      choices[classId] = ranks
    }
    const saved = update({
      ...state,
      choices,
      extras: state.extras.filter((id) => id !== spell.id),
      removed: common && !chosenAt.length ? [...state.removed.filter((id) => id !== spell.id), spell.id] : state.removed.filter((id) => id !== spell.id),
    })
    // Le rang libéré repropose ses sorts tout de suite (on peut aussi choisir plus tard).
    if (chosenAt.length) onSpellRemoved?.()
    return saved
  }
  function restoreSpell(spellId: string) {
    if (ownerId) markNewSlots(spellsKey, [spellId])
    return update({ ...state, removed: state.removed.filter((id) => id !== spellId) })
  }
  // « Retirés de la fiche » : seulement ceux qu'un clic ferait revenir (acquis d'office au
  // rang commun, ou encore choisis à leur rang dans une ancienne fiche).
  const classIdSet = new Set(classes.map((item) => item.id))
  const removedSpells = state.removed.flatMap((id) => {
    const spell = originals.get(id)
    if (!spell) return []
    const comesBack = state.extras.includes(id) || Object.entries(spell.classRanks).some(([classId, rank]) => classIdSet.has(classId) && rank <= level && (rank === 0 || state.choices[classId]?.[String(rank)] === id))
    return comesBack ? [personalizeSpell(spell, state.edits[id])] : []
  })
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

  return <NewSlotsContext.Provider value={newSpells}><div className="space-y-9">
    {currentStep && onOpenChoice && <NewSpellSlot
      count={steps.length}
      accent={currentStep.accent}
      title={currentStep.choice ? "Nouveau sort" : "Bonus de rang"}
      detail={currentStep.choice ? `${currentStep.className} · rang ${currentStep.rank}${currentStep.bonus ? " · bonus de rang" : ""}` : `Rang ${currentStep.rank}`}
      onOpen={onOpenChoice}
    />}
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

  </div></NewSlotsContext.Provider>
}
