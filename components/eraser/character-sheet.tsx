"use client"

import dynamic from "next/dynamic"
import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from "react"
import { Backpack, BookOpen, Check, ChevronDown, ChevronUp, CircleUserRound, GraduationCap, ImagePlus, LoaderCircle, Minus, NotebookPen, PawPrint, Plus, Sparkles, X } from "lucide-react"

import { Checkbox } from "@/components/ui/checkbox"
import { useCommitOnLeave } from "@/components/eraser/use-commit-on-leave"
import { TokenButton } from "@/components/eraser/token-editor"
import { RichTextField } from "@/components/eraser/rich-text"

import { Button } from "@/components/ui/button"
import { ClassProgression, knownSpellsForCharacter, parseClassChoices, selectedCharacterClasses } from "@/components/eraser/class-progression"
import { SpellChargeStars } from "@/components/eraser/spell-charges"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import {
  characterCriticalValueIndex,
  characterClassChoicesIndex,
  characterCustomTabsIndex,
  characterNarrativeStart,
  characterSecondaryCalculatedFields,
  characterSecondaryCalculationValueIndex,
  characterSkillGroups,
  characterSkills,
  characterSkillValueIndex,
} from "@/lib/character-sheet-schema"
import type { CharacterSheetRecord, ClassRecord } from "@/lib/google-sheets"
import type { ClassSpell } from "@/lib/class-content"
import type { CharacterInventoryRecord } from "@/lib/inventory-schema"
import {
  cappedSkillTotal,
  characteristicModifierTargetId,
  formatModifierAmount,
  indexInventoryModifiers,
  itemModifierTargets,
  linkedItemsFor,
  modifierTotalFor,
  skillModifierTargetId,
  type LinkedModifierItem,
} from "@/lib/item-modifiers"
import { evaluateRelativeExpression } from "@/lib/math-expression"

const CharacterInventory = dynamic(() => import("@/components/eraser/character-inventory").then((module) => module.CharacterInventory), {
  loading: () => <div className="grid min-h-32 place-items-center"><LoaderCircle className="size-5 animate-spin text-muted-foreground" /></div>,
})
const CharacterRelations = dynamic(() => import("@/components/eraser/character-relations").then((module) => module.CharacterRelations), {
  loading: () => <div className="grid min-h-32 place-items-center"><LoaderCircle className="size-5 animate-spin text-muted-foreground" /></div>,
})

type CharacterTabType = "competences" | "inventaire" | "classe" | "journal" | "invocation" | "compagnon"
type CharacterTab = { id: string; type: CharacterTabType; label: string; removable: boolean }

const tabTypes: Array<{ type: CharacterTabType; label: string }> = [
  { type: "competences", label: "Compétences" }, { type: "inventaire", label: "Inventaire" },
  { type: "classe", label: "Sorts" }, { type: "journal", label: "Journal" },
  { type: "invocation", label: "Invocation" }, { type: "compagnon", label: "Compagnon" },
]

const baseCharacterTabs: CharacterTab[] = tabTypes.slice(0, 4).map((tab) => ({ ...tab, id: `base-${tab.type}`, removable: false }))

// characterSkillGroups never changes at runtime, so this offset table is computed
// once for the module instead of on every character-sheet render (every keystroke).
const skillOffsetByGroup = characterSkillGroups.map((_, index) => characterSkillGroups.slice(0, index).reduce((total, group) => total + group.skills.length, 0))

function parseCharacterTabs(value: string): CharacterTab[] {
  try {
    const parsed = JSON.parse(value)
    if (!Array.isArray(parsed)) return []
    return parsed.flatMap((tab) => tab && typeof tab.id === "string" && tabTypes.some((candidate) => candidate.type === tab.type)
      ? [{ id: tab.id, type: tab.type as CharacterTabType, label: typeof tab.label === "string" && tab.label.trim() ? tab.label.trim() : tabTypes.find((candidate) => candidate.type === tab.type)?.label || "Onglet", removable: true }]
      : [])
  } catch { return [] }
}

function CharacterTabIcon({ type }: { type: CharacterTabType }) {
  if (type === "competences") return <Sparkles />
  if (type === "inventaire") return <Backpack />
  if (type === "classe") return <GraduationCap />
  if (type === "journal") return <BookOpen />
  if (type === "compagnon") return <PawPrint />
  return <CircleUserRound />
}

/** « Capacité de combat » → « Cap de combat » : les titres de l'onglet Compétences restent lisibles. */
function skillGroupTitle(characteristic: string) {
  return characteristic.replace(/^Capacité(?= )/, "Cap")
}

const palette = [
  { accent: "#b9504e", soft: "#b9504e18", border: "#b9504e55" },
  { accent: "#b9504e", soft: "#b9504e18", border: "#b9504e55" },
  { accent: "#b9504e", soft: "#b9504e18", border: "#b9504e55" },
  { accent: "#648f4e", soft: "#648f4e18", border: "#648f4e55" },
  { accent: "#648f4e", soft: "#648f4e18", border: "#648f4e55" },
  { accent: "#397f88", soft: "#397f8818", border: "#397f8855" },
  { accent: "#397f88", soft: "#397f8818", border: "#397f8855" },
  { accent: "#397f88", soft: "#397f8818", border: "#397f8855" },
  { accent: "#397f88", soft: "#397f8818", border: "#397f8855" },
  { accent: "#397f88", soft: "#397f8818", border: "#397f8855" },
]

type InlineEditProps = {
  label: string
  value: string
  onCommit: (value: string) => Promise<void>
  compact?: boolean
  multiline?: boolean
  numeric?: boolean
  singleClick?: boolean
  children?: ReactNode
}

function Stepper({ label, value, onCommit }: { label: string; value: string; onCommit: (value: string) => Promise<void> }) {
  const numeric = Number.parseFloat(value || "0") || 0
  return <div className="inline-flex items-center gap-1"><button type="button" onClick={() => onCommit(String(numeric - 1))} className="flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted" aria-label={`Diminuer ${label}`}><Minus className="size-3" /></button><InlineEdit numeric singleClick compact label={label} value={value} onCommit={onCommit}><span className="min-w-7 text-center text-xl font-semibold tabular-nums">{value || "0"}</span></InlineEdit><button type="button" onClick={() => onCommit(String(numeric + 1))} className="flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted" aria-label={`Augmenter ${label}`}><Plus className="size-3" /></button></div>
}

function SelectEdit({ label, value, options, onCommit }: { label: string; value: string; options: string[]; onCommit: (value: string) => Promise<void> }) {
  const [editing, setEditing] = useState(false)
  if (!editing) return <button type="button" onDoubleClick={() => setEditing(true)} className="min-h-8 max-w-full truncate rounded-md px-2 text-sm font-semibold" title={`Double-cliquer pour modifier ${label}`}>{value || "—"}</button>
  return <NativeSelect autoFocus aria-label={label} value={value} onBlur={() => setEditing(false)} onChange={(event) => { void onCommit(event.target.value); setEditing(false) }} className="h-8 min-w-0 max-w-full border-0 bg-transparent px-1 text-sm font-medium shadow-none">
    <NativeSelectOption value="">—</NativeSelectOption>{options.map((option) => <NativeSelectOption key={option} value={option}>{option}</NativeSelectOption>)}
  </NativeSelect>
}

function parseMultiple(value: string): { entries: string[]; selected: string } {
  if (!value) return { entries: [] as string[], selected: "" }
  try {
    const parsed = JSON.parse(value)
    if (Array.isArray(parsed)) { const entries = parsed.filter((item): item is string => typeof item === "string" && Boolean(item.trim())); return { entries, selected: entries[0] || "" } }
    if (parsed && Array.isArray(parsed.values)) { const entries = parsed.values.filter((item: unknown): item is string => typeof item === "string" && Boolean(item.trim())); return { entries, selected: typeof parsed.selected === "string" ? parsed.selected : entries[0] || "" } }
  } catch { /* ancienne valeur simple */ }
  return { entries: [value], selected: value }
}

function MultipleValues({ label, value, options, selectActive = false, onCommit }: { label: string; value: string; options?: Array<{ value: string; label: string }>; selectActive?: boolean; onCommit: (value: string) => Promise<void> }) {
  const { entries, selected } = parseMultiple(value)
  const [draft, setDraft] = useState("")
  const [adding, setAdding] = useState(entries.length === 0)
  function serialize(nextEntries: string[], nextSelected = selected) { return JSON.stringify(selectActive ? { values: nextEntries, selected: nextEntries.includes(nextSelected) ? nextSelected : nextEntries[0] || "" } : nextEntries) }
  async function add(raw: string) {
    const nextValue = raw.trim(); if (!nextValue || entries.includes(nextValue)) return
    await onCommit(serialize([...entries, nextValue], selected || nextValue)); setDraft(""); setAdding(false)
  }
  return <div className="min-w-0"><div className="flex flex-wrap items-center gap-1.5">{entries.map((entry) => <button key={entry} type="button" onClick={() => selectActive && onCommit(serialize(entries, entry))} className={`group/tag inline-flex max-w-full shrink items-center gap-1 rounded-full border px-2 py-1 text-xs ${selectActive && selected === entry ? "border-primary/60 bg-primary/15 text-primary" : "bg-background/55"}`} title={selectActive ? "Choisir comme titre affiché" : undefined}><span className="truncate">{options?.find((option) => option.value === entry)?.label || entry}</span><span role="button" tabIndex={0} onClick={(event) => { event.stopPropagation(); void onCommit(serialize(entries.filter((item) => item !== entry))) }} className="shrink-0 text-muted-foreground opacity-50 hover:text-destructive hover:opacity-100" aria-label={`Retirer ${entry}`}><X className="size-3" /></span></button>)}{entries.length > 0 && !adding && <button type="button" onClick={() => setAdding(true)} className="flex size-6 shrink-0 items-center justify-center rounded-full border border-dashed text-muted-foreground hover:border-primary/50 hover:text-primary" aria-label={`Ajouter ${label}`}><Plus className="size-3.5" /></button>}</div>{adding && <div className="mt-1.5 flex gap-1">{options ? <NativeSelect value="" onChange={(event) => add(event.target.value)} className="h-7 min-w-28 border-0 bg-transparent px-1 text-xs shadow-none"><NativeSelectOption value="">Ajouter…</NativeSelectOption>{options.filter((option) => !entries.includes(option.value)).map((option) => <NativeSelectOption key={option.value} value={option.value}>{option.label}</NativeSelectOption>)}</NativeSelect> : <><Input autoFocus value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void add(draft) } if (event.key === "Escape") { setDraft(""); setAdding(false) } }} onBlur={() => { if (draft.trim()) void add(draft) }} placeholder={`Ajouter ${label.toLowerCase()}…`} className="h-7 min-w-28 border-0 bg-transparent px-1 text-xs shadow-none" /><button type="button" onClick={() => add(draft)} className="flex size-7 items-center justify-center rounded-md text-primary hover:bg-primary/10"><Plus className="size-3.5" /></button>{entries.length > 0 && <button type="button" onClick={() => setAdding(false)} className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"><X className="size-3.5" /></button>}</>}</div>}</div>
}

function calculateExpression(expression: string, fallback: number) {
  try { return evaluateRelativeExpression(expression, fallback) } catch { return fallback }
}

function InlineEdit({ label, value, onCommit, compact, multiline, numeric, singleClick, children }: InlineEditProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const [pending, setPending] = useState(false)
  // Enregistré dès qu'on clique ailleurs ou que le survol se referme, sans Entrée.
  const leave = useCommitOnLeave(editing, draft, value, onCommit)

  function start() { setDraft(value); setEditing(true) }

  async function save() {
    setPending(true)
    const done = await leave.save()
    setPending(false)
    if (done) setEditing(false)
  }

  function cancel() { leave.cancel(); setDraft(value); setEditing(false) }

  function keyDown(event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) {
    if (event.key === "Escape") cancel()
    if (!multiline && event.key === "Enter") void save()
  }

  // Les boutons gardent le focus dans le champ : cliquer dessus ne déclenche pas d'enregistrement par perte du focus.
  const keepFocus = (event: React.MouseEvent) => event.preventDefault()
  if (editing) return <div className={compact ? "flex min-w-0 items-center gap-1" : "flex items-start gap-1"}>{multiline ? <Textarea autoFocus value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={keyDown} onBlur={() => void save()} className="min-h-24" /> : <Input autoFocus type={numeric ? "number" : "text"} value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={keyDown} onBlur={() => void save()} className={compact ? "h-8 min-w-16 px-2" : "h-9"} />}<button type="button" onMouseDown={keepFocus} onClick={() => void save()} disabled={pending} className="flex size-8 shrink-0 items-center justify-center rounded-md text-primary hover:bg-primary/10" aria-label={`Enregistrer ${label}`}>{pending ? <LoaderCircle className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}</button><button type="button" onMouseDown={keepFocus} onClick={cancel} className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted" aria-label="Annuler"><X className="size-3.5" /></button></div>

  return <button type="button" onClick={singleClick ? start : undefined} onDoubleClick={!singleClick ? start : undefined} className="min-w-0 text-left" title={singleClick ? "Cliquer pour modifier" : "Double-cliquer pour modifier"}>{children ?? <span className={value ? "" : "text-muted-foreground/55"}>{value || "Non renseigné"}</span>}</button>
}

/**
 * Carnet de notes et récits de la fiche. Même moteur d'édition que partout ailleurs :
 * la mise en page (repli, bordures, mode discret) est la seule chose propre à la fiche.
 */
function NotesEditor({ value, onCommit, label = "Carnet de notes", compact = false, collapsible = false, embedded = false, plain = false }: { value: string; onCommit: (value: string) => Promise<void>; label?: string; compact?: boolean; collapsible?: boolean; embedded?: boolean; plain?: boolean }) {
  const [expanded, setExpanded] = useState(true)
  const shell = plain
    ? "min-w-0"
    : compact
      ? "overflow-hidden rounded-xl border border-border/55 bg-background/20 shadow-sm"
      : `${embedded ? "" : "mt-6"} overflow-hidden rounded-2xl border border-[#74664f55] bg-[linear-gradient(135deg,rgba(146,118,64,.10),rgba(255,255,255,.015))] shadow-sm`

  return <section className={shell}>
    <div className={`flex flex-wrap items-center gap-1 px-3 py-2 ${plain ? "px-0 pb-1 pt-0" : "border-b border-border/45"}`}>
      <div className={`mr-2 flex items-center gap-2 font-medium ${plain ? "text-[11px] uppercase tracking-[.16em] text-muted-foreground" : "text-sm"}`} style={plain ? undefined : { color: "var(--character-accent, #d7b77d)" }}>
        {!plain && <NotebookPen className="size-4" />}{label}
      </div>
      {collapsible && <Button type="button" size="icon-xs" variant="ghost" onClick={() => setExpanded((current) => !current)} className="ml-auto" aria-label={expanded ? `Réduire ${label}` : `Afficher ${label}`}>{expanded ? <ChevronUp /> : <ChevronDown />}</Button>}
    </div>
    {expanded && <RichTextField
      value={value}
      onCommit={(html) => void onCommit(html)}
      placeholder="Écrire…"
      minHeight={compact || plain ? "min-h-20" : "min-h-32"}
      className={plain ? "border-0 bg-transparent" : "rounded-none border-0 bg-transparent"}
    />}
  </section>
}

function sheetNumber(value: string) {
  const parsed = Number.parseFloat(String(value ?? "").replace(",", "."))
  return Number.isFinite(parsed) ? parsed : 0
}

/** Affiche un total en y ajoutant les modificateurs d’objets, sans toucher à la valeur de la feuille. */
/**
 * Sous 0 PV, la fiche passe en gris ; à moins la vie totale ou en dessous, en rouge.
 * Seul un filtre change : tout reste cliquable.
 */
function characterLifeState(current: string, total: string): "alive" | "down" | "dead" {
  const currentNumber = Number.parseFloat(String(current ?? "").replace(",", "."))
  const totalNumber = Number.parseFloat(String(total ?? "").replace(",", "."))
  if (!Number.isFinite(currentNumber) || currentNumber >= 0) return "alive"
  return Number.isFinite(totalNumber) && totalNumber > 0 && currentNumber <= -totalNumber ? "dead" : "down"
}

function totalWithModifier(raw: string, modifier: number, fallback = "0") {
  if (!modifier) return raw || fallback
  const parsed = Number.parseFloat(String(raw ?? "").replace(",", "."))
  if (!Number.isFinite(parsed)) return raw || fallback
  return String(Math.round((parsed + modifier) * 100) / 100)
}

/** Un même objet peut viser une compétence et sa caractéristique : on additionne ses apports. */
function mergeLinkedItems(...lists: LinkedModifierItem[][]) {
  const merged = new Map<string, LinkedModifierItem>()
  for (const entry of lists.flat()) {
    const existing = merged.get(entry.slotId)
    merged.set(entry.slotId, existing ? { ...existing, amount: existing.amount + entry.amount } : entry)
  }
  return [...merged.values()]
}

type SlotToggle = { pendingSlot: string; onToggle: (slotId: string, equipped: boolean) => void }

function ModifierBadge({ amount, plain = false }: { amount: number; plain?: boolean }) {
  if (!amount) return null
  const tone = plain ? "bg-white/25 text-white" : amount < 0 ? "bg-rose-500/15 text-rose-300" : "bg-emerald-500/15 text-emerald-300"
  return <span className={`inline-flex shrink-0 items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums ${tone}`} title="Apporté par les objets équipés">{formatModifierAmount(amount)}</span>
}

function LinkedItemsPanel({ items, toggle, borderColor, total }: { items: LinkedModifierItem[]; toggle: SlotToggle; borderColor: string; total?: string }) {
  if (!items.length) return null
  return <div className="mt-2 border-t pt-2" style={{ borderColor }}>
    <p className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"><Backpack className="size-3" />Objets liés</p>
    <div className="space-y-1">
      {items.map((entry) => <label key={entry.slotId} className="flex cursor-pointer items-center gap-2 rounded-lg border bg-background/45 px-2 py-1.5 text-xs" style={{ borderColor }}>
        <Checkbox checked={entry.equipped} disabled={toggle.pendingSlot === entry.slotId} onCheckedChange={(checked) => toggle.onToggle(entry.slotId, checked === true)} aria-label={`${entry.equipped ? "Déséquiper" : "Équiper"} ${entry.name}`} />
        <span className={`min-w-0 flex-1 truncate font-medium ${entry.equipped ? "" : "text-muted-foreground"}`}>{entry.name}</span>
        <span className={`shrink-0 font-semibold tabular-nums ${entry.amount < 0 ? "text-rose-300" : "text-emerald-300"} ${entry.equipped ? "" : "opacity-40"}`}>{formatModifierAmount(entry.amount)}</span>
      </label>)}
    </div>
    {total !== undefined && <p className="mt-1.5 text-right text-[10px] text-muted-foreground">Total avec objets : <b className="text-foreground">{total}</b></p>}
  </div>
}

/** Entoure une carte non dépliable (vie, folie, caractéristique…) d’un survol listant ses objets liés. */
function ModifierHoverShell({ items, toggle, title, color, total, children }: { items: LinkedModifierItem[]; toggle: SlotToggle; title: string; color: string; total?: string; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  if (!items.length) return <>{children}</>
  return <div className="relative h-full min-w-0" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)} onFocusCapture={() => setOpen(true)}>
    {children}
    {open && <div className="absolute left-1/2 top-[calc(100%-3px)] z-40 w-60 -translate-x-1/2 rounded-xl border bg-popover p-3 text-left text-popover-foreground shadow-2xl" style={{ borderColor: `${color}66` }}>
      <p className="font-display text-sm font-semibold" style={{ color }}>{title}</p>
      <LinkedItemsPanel items={items} toggle={toggle} borderColor={`${color}40`} total={total} />
    </div>}
  </div>
}

function SkillRow({ skillIndex, values, color, commit, abilities, charges, setCharges, skillModifier, characteristicModifier, successModifier, failureModifier, linkedItems, toggle }: { skillIndex: number; values: string[]; color: (typeof palette)[number]; commit: (index: number, value: string) => Promise<void>; abilities: ClassSpell[]; charges: Record<string, number>; setCharges: (spell: ClassSpell, value: number) => void; skillModifier: number; characteristicModifier: number; successModifier: number; failureModifier: number; linkedItems: LinkedModifierItem[]; toggle: SlotToggle }) {
  const [open, setOpen] = useState(false)
  const skill = characterSkills[skillIndex]
  const shortName = skill.name
    .replace(/^Maîtrise\b/, "Maît")
    .replace(/^Résistance\b/, "Rés")
    .replace(/^Volonté(?= )/, "Vol")
    .replace(/^Connaissances?\b/, "Co")
  // La feuille calcule déjà « caractéristique + bonus », borné entre 10 et 90. Tant qu’aucun
  // objet équipé ne vise cette compétence, on réaffiche sa valeur telle quelle.
  const statModifier = skillModifier + characteristicModifier
  const statTotal = statModifier
    ? String(cappedSkillTotal(sheetNumber(values[skill.characteristicIndex]) + characteristicModifier + sheetNumber(values[characterSkillValueIndex(skillIndex, 0)]) + skillModifier))
    : values[characterSkillValueIndex(skillIndex, 2)] || "—"
  const totals = [
    statTotal,
    totalWithModifier(values[characterSkillValueIndex(skillIndex, 5)], successModifier, "—"),
    totalWithModifier(values[characterSkillValueIndex(skillIndex, 8)], failureModifier, "—"),
  ]
  const metricModifiers = [statModifier, successModifier, failureModifier]
  return <div className="relative" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)} onFocusCapture={() => setOpen(true)}>
    <button type="button" onClick={() => setOpen((current) => !current)} className={`grid w-full grid-cols-[minmax(0,1fr)_repeat(3,2.15rem)] items-center gap-1 border-t px-3 py-2.5 text-left text-xs transition hover:bg-white/[.035] ${open ? "bg-white/[.055]" : ""}`} style={{ borderColor: color.border }}>
      <span className={`whitespace-normal pr-1 font-medium leading-tight ${shortName.length > 24 ? "text-[10px]" : "text-[11px]"}`}>{shortName}</span>{totals.map((total, index) => <span key={index} className={`text-center font-semibold tabular-nums ${index === 0 ? "text-foreground" : index === 1 ? "text-emerald-300" : "text-rose-300"}`}>{total}</span>)}
    </button>
    {open && <div className="absolute left-2 right-2 top-[calc(100%-2px)] z-30 rounded-xl border bg-popover p-3 text-popover-foreground shadow-2xl" style={{ borderColor: color.border }}>
      <p className="mb-2 font-display text-sm font-semibold" style={{ color: color.accent }}>{shortName}</p><div className="mb-2 grid grid-cols-[1fr_3.5rem_3.5rem] gap-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"><span>Calcul</span><span>B/M</span><span>Mod.</span></div>
      {[{ label: "Stat", bonus: 0 }, { label: "Réussite critique", bonus: 3 }, { label: "Échec critique", bonus: 6 }].map((line, lineIndex) => {
        const bonusIndex = characterSkillValueIndex(skillIndex, line.bonus)
        const lineModifier = metricModifiers[lineIndex]
        return <div key={line.label} className="grid grid-cols-[1fr_3.5rem_3.5rem] items-center gap-2 border-t py-2 text-xs"><span>{line.label}</span><InlineEdit compact numeric singleClick label={`${skill.name} — ${line.label}`} value={values[bonusIndex]} onCommit={(value) => commit(bonusIndex, value)}><span className="rounded bg-primary/10 px-1.5 py-1 text-center font-semibold text-primary">{values[bonusIndex] || "0"}</span></InlineEdit><span className={`rounded px-1.5 py-1 text-center font-semibold ${lineModifier ? (lineModifier < 0 ? "bg-rose-500/15 text-rose-300" : "bg-emerald-500/15 text-emerald-300") : "bg-muted font-normal text-muted-foreground"}`} title="Apporté par les objets équipés et la classe">{lineModifier ? formatModifierAmount(lineModifier) : "0"}</span></div>
      })}
      <LinkedItemsPanel items={linkedItems} toggle={toggle} borderColor={color.border} total={statModifier ? statTotal : undefined} />
      {abilities.length > 0 && <div className="mt-2 border-t pt-2" style={{ borderColor: color.border }}><p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Actifs et passifs liés</p><div className="space-y-1.5">{abilities.map((spell) => {
        const active = spell.category === "actif"
        // Le nom d'abord. Un actif montre ses charges à côté, son type passe sous la
        // description ; un passif garde son étiquette. Survoler un nom coupé l'affiche en
        // entier, par-dessus l'étiquette ou les charges.
        return <details key={spell.id} className="rounded-lg border bg-background/45 px-2.5 py-2" style={{ borderColor: color.border }}><summary className="flex cursor-pointer list-none items-center gap-2 text-xs font-semibold [&::-webkit-details-marker]:hidden"><span className="peer min-w-0 flex-1 truncate hover:whitespace-normal hover:break-words" title={spell.name}>{spell.name}</span>{active
          ? <span className="shrink-0 peer-hover:hidden"><SpellChargeStars total={spell.charges} current={charges[spell.id] ?? spell.charges ?? 0} interactive onChange={(value) => setCharges(spell, value)} accent={color.accent} /></span>
          : <span className="shrink-0 text-[9px] text-muted-foreground peer-hover:hidden">{spell.type}</span>}</summary><blockquote className="mt-2 border-l-2 pl-2 text-xs leading-5 text-muted-foreground" style={{ borderColor: color.accent }}>{spell.effect && <div dangerouslySetInnerHTML={{ __html: spell.effectHtml || spell.effect }} />}{spell.description && <div className="mt-1" dangerouslySetInnerHTML={{ __html: spell.descriptionHtml || spell.description }} />}{active && spell.type && <p className="mt-1.5 text-[10px] font-semibold uppercase tracking-wider" style={{ color: color.accent }}>{spell.type}</p>}</blockquote></details>
      })}</div></div>}
    </div>}
  </div>
}

function CalculatedSecondaryCard({ fieldIndex, label, popupLabel, color, values, commit, compact = false, modifier = 0, linkedItems = [], toggle }: { fieldIndex: number; label: string; popupLabel?: string; color: string; values: string[]; commit: (index: number, value: string) => Promise<void>; compact?: boolean; modifier?: number; linkedItems?: LinkedModifierItem[]; toggle: SlotToggle }) {
  const [open, setOpen] = useState(false)
  const definitionIndex = characterSecondaryCalculatedFields.findIndex((field) => field.valueIndex === fieldIndex)
  const bonusIndex = characterSecondaryCalculationValueIndex(definitionIndex, "bonus")
  const total = totalWithModifier(values[fieldIndex], modifier)
  return <div className="relative h-full min-w-0" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
    <button type="button" onClick={() => setOpen((current) => !current)} className={`flex h-full w-full flex-col items-center justify-center rounded-lg text-center ${compact ? "min-h-14 px-2 py-2" : "min-h-20 px-3 py-3"}`} style={{ backgroundColor: `${color}${compact ? "24" : "12"}`, borderBottom: compact ? `2px solid ${color}66` : undefined, borderTop: compact ? undefined : `2px solid ${color}` }}><span className="whitespace-normal text-[9px] font-semibold uppercase leading-tight tracking-wide text-muted-foreground">{label}</span><span className={`${compact ? "mt-1 text-lg" : "mt-2 text-xl"} font-semibold tabular-nums`} style={{ color }}>{total}</span></button>
    {open && <div className="absolute left-1/2 top-[calc(100%-3px)] z-40 w-56 -translate-x-1/2 rounded-xl border bg-popover p-3 shadow-2xl" style={{ borderColor: `${color}66` }}><p className="font-display text-sm font-semibold" style={{ color }}>{popupLabel || label}</p><p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Calcul du total</p><div className="grid grid-cols-2 gap-2"><div><p className="mb-1 text-[10px] text-muted-foreground">Bonus/Malus</p><InlineEdit numeric singleClick compact label={`${popupLabel || label} bonus/malus`} value={values[bonusIndex]} onCommit={(value) => commit(bonusIndex, value)}><span className="block rounded-lg bg-primary/10 px-2 py-1.5 text-center font-semibold text-primary">{values[bonusIndex] || "0"}</span></InlineEdit></div><div><p className="mb-1 text-[10px] text-muted-foreground">Modificateur</p><span className={`block rounded-lg px-2 py-1.5 text-center font-semibold ${modifier ? (modifier < 0 ? "bg-rose-500/15 text-rose-300" : "bg-emerald-500/15 text-emerald-300") : "bg-muted text-muted-foreground"}`} title="Apporté par les objets équipés et la classe">{modifier ? formatModifierAmount(modifier) : "0"}</span></div></div><LinkedItemsPanel items={linkedItems} toggle={toggle} borderColor={`${color}40`} /></div>}
  </div>
}

function CombinedCalculatedCard({ label, groupColor, fields, values, commit, modifierFor, linkedFor, toggle }: { label: string; groupColor: string; fields: Array<{ index: number; label: string; shortLabel?: string; color: string }>; values: string[]; commit: (index: number, value: string) => Promise<void>; modifierFor: (valueIndex: number) => number; linkedFor: (valueIndex: number) => LinkedModifierItem[]; toggle: SlotToggle }) {
  return <div className="h-full min-h-20 rounded-xl border p-1.5 shadow-sm" style={{ backgroundColor: `${groupColor}18`, borderColor: `${groupColor}55`, borderTop: `2px solid ${groupColor}` }}>
    <p className="mb-1 text-center text-[9px] font-semibold uppercase tracking-[.18em]" style={{ color: groupColor }}>{label}</p>
    <div className="grid grid-cols-2 gap-1">
      {fields.map((field) => <CalculatedSecondaryCard compact key={field.index} fieldIndex={field.index} label={field.shortLabel || field.label} popupLabel={field.label} color={field.color} values={values} commit={commit} modifier={modifierFor(field.index)} linkedItems={linkedFor(field.index)} toggle={toggle} />)}
    </div>
  </div>
}

function LifePool({ current, total, commit, modifier = 0 }: { current: string; total: string; commit: (index: number, value: string) => Promise<void>; modifier?: number }) {
  const [editing, setEditing] = useState(false)
  const [expression, setExpression] = useState(current || "0")
  const [editingTotal, setEditingTotal] = useState(false)
  const [totalExpression, setTotalExpression] = useState(total || "0")
  const currentNumber = Number.parseFloat(current || "0") || 0
  const totalNumber = (Number.parseFloat(total || "0") || 0) + modifier
  const healthRatio = totalNumber > 0 ? Math.max(0, Math.min(100, (currentNumber / totalNumber) * 100)) : 0
  // Une expression (« -10 », « *2 ») s'applique aussi en cliquant ailleurs, sans Entrée.
  const leaveCurrent = useCommitOnLeave(editing, expression, current || "0", (next) => commit(9, String(calculateExpression(next, Number(current) || 0))))
  const leaveTotal = useCommitOnLeave(editingTotal, totalExpression, total || "0", (next) => commit(10, String(calculateExpression(next, Number(total) || 0))))
  async function save() { if (await leaveCurrent.save()) setEditing(false) }
  async function saveTotal() { if (await leaveTotal.save()) setEditingTotal(false) }
  return <div className="flex h-full min-h-20 flex-col items-center justify-between rounded-xl bg-[#6e9ee816] px-4 py-3 text-center shadow-sm" style={{ borderTop: "2px solid #6e9ee8" }}><p className="text-[9px] font-semibold uppercase tracking-[.16em] text-muted-foreground">Points de vie</p><div className="my-auto flex flex-wrap items-center justify-center gap-2">{editing ? <div className="flex min-w-0 items-center gap-1"><Input autoFocus value={expression} onChange={(event) => setExpression(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void save(); if (event.key === "Escape") { leaveCurrent.cancel(); setEditing(false) } }} onBlur={() => void save()} className="h-8 w-24" placeholder="-10%, *2…" /><button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => void save()} className="flex size-8 items-center justify-center rounded-md text-primary hover:bg-primary/10"><Check className="size-4" /></button></div> : <button type="button" onClick={() => { setExpression(current || "0"); setEditing(true) }} className="text-2xl font-semibold tabular-nums text-[#6798e2]" title="Valeur, +10, -10%, *2 ou /3">{current || "0"}</button>}<span className="text-sm text-muted-foreground">sur</span>{editingTotal ? <div className="flex min-w-0 items-center gap-1"><Input autoFocus value={totalExpression} onChange={(event) => setTotalExpression(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void saveTotal(); if (event.key === "Escape") { leaveTotal.cancel(); setEditingTotal(false) } }} onBlur={() => void saveTotal()} className="h-8 w-24" placeholder="+10%, *2…" /><button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => void saveTotal()} className="flex size-8 items-center justify-center rounded-md text-primary hover:bg-primary/10"><Check className="size-4" /></button></div> : <button type="button" onClick={() => { setTotalExpression(total || "0"); setEditingTotal(true) }} className="text-2xl font-semibold tabular-nums text-[#86ace6]" title="Valeur, +10%, *2 ou /3">{total || "0"}</button>}<ModifierBadge amount={modifier} /></div><div className="w-full"><div className="mb-1 flex justify-between text-[8px] font-semibold uppercase tracking-wider text-muted-foreground"><span>Actuelle</span><span>Totale</span></div><div className="h-1.5 overflow-hidden rounded-full bg-[#6e9ee826]"><div className="h-full rounded-full bg-[#6e9ee8] transition-[width]" style={{ width: `${healthRatio}%` }} /></div></div></div>
}

export function CharacterSheet({ initialCharacter, classes, classSpells, initialInventory, loadClassCatalog = false }: { initialCharacter: CharacterSheetRecord; classes: ClassRecord[]; classSpells: ClassSpell[]; initialInventory?: CharacterInventoryRecord; loadClassCatalog?: boolean }) {
  const [character, setCharacter] = useState(initialCharacter)
  const [values, setValues] = useState(initialCharacter.values)
  const [availableClasses, setAvailableClasses] = useState(classes)
  const [availableClassSpells, setAvailableClassSpells] = useState(classSpells)
  const [classCatalogLoading, setClassCatalogLoading] = useState(loadClassCatalog)
  const [classCatalogError, setClassCatalogError] = useState("")
  const [portraitPending, setPortraitPending] = useState(false)
  const [narrativeExpanded, setNarrativeExpanded] = useState(true)
  const [mechanicsExpanded, setMechanicsExpanded] = useState(true)
  const [activeTab, setActiveTab] = useState("base-competences")
  const [viewStateReady, setViewStateReady] = useState(false)
  const [addingTab, setAddingTab] = useState(false)
  const [newTabType, setNewTabType] = useState<CharacterTabType>("invocation")
  // L’inventaire vit ici : l’onglet Compétences a besoin des objets équipés et de leurs liens.
  const [inventory, setInventory] = useState<CharacterInventoryRecord | null>(initialInventory ?? null)
  const [inventoryLoading, setInventoryLoading] = useState(!initialInventory)
  const [equipPending, setEquipPending] = useState("")

  // Joueurs qui cliquent vite sur +/- : chaque commit part en écriture Google Sheets
  // en remplaçant toute la fiche. Sans file d’attente, deux requêtes en vol peuvent
  // répondre dans le désordre et faire "reculer" une valeur qui vient d’être augmentée.
  // On sérialise les envois et on n’applique que la réponse du dernier commit lancé.
  const persistSeq = useRef(0)
  const persistQueue = useRef(Promise.resolve())

  const inventoryEndpoint = `/api/characters/${encodeURIComponent(character.id)}/inventory`
  const modifierIndex = useMemo(() => indexInventoryModifiers(inventory?.containers || []), [inventory])
  const modifiersByValueIndex = useMemo(() => {
    const map = new Map<number, { total: number; items: LinkedModifierItem[] }>()
    for (const target of itemModifierTargets) {
      map.set(target.valueIndex, { total: modifierTotalFor(modifierIndex, target.id), items: linkedItemsFor(modifierIndex, target.id) })
    }
    return map
  }, [modifierIndex])
  const modifierForValue = (valueIndex: number) => modifiersByValueIndex.get(valueIndex)?.total || 0
  const linkedForValue = (valueIndex: number) => modifiersByValueIndex.get(valueIndex)?.items || []

  async function setSlotEquipped(slotId: string, equipped: boolean) {
    setEquipPending(slotId)
    try {
      const response = await fetch(inventoryEndpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "set-equipped", slotId, equipped }) })
      const payload = (await response.json()) as { inventory?: CharacterInventoryRecord }
      if (response.ok && payload.inventory) setInventory((current) => ({ ...payload.inventory!, items: payload.inventory!.items.length ? payload.inventory!.items : current?.items || [] }))
    } catch { /* l’inventaire reste affiché tel quel */ }
    setEquipPending("")
  }
  const slotToggle: SlotToggle = { pendingSlot: equipPending, onToggle: (slotId, equipped) => void setSlotEquipped(slotId, equipped) }

  async function persist(nextValues: string[], portrait?: File) {
    const seq = (persistSeq.current += 1)
    const run = persistQueue.current.then(async () => {
      let response: Response
      if (portrait) {
        const form = new FormData(); form.append("portrait", portrait); form.append("values", JSON.stringify(nextValues))
        response = await fetch(`/api/characters/${encodeURIComponent(character.id)}`, { method: "PATCH", body: form })
      } else {
        response = await fetch(`/api/characters/${encodeURIComponent(character.id)}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ values: nextValues }) })
      }
      const payload = (await response.json()) as { character?: CharacterSheetRecord }
      if (payload.character && seq === persistSeq.current) { setCharacter(payload.character); setValues(payload.character.values) }
    })
    persistQueue.current = run.catch(() => {})
    return run
  }

  // Toujours la dernière version de la fiche : deux champs quittés coup sur coup
  // (clic ailleurs, survol refermé) partent chacun de la précédente, sans l'effacer.
  const latestValues = useRef(values)
  useEffect(() => { latestValues.current = values }, [values])
  async function commit(index: number, value: string) {
    const next = latestValues.current.map((cell, cellIndex) => cellIndex === index ? value : cell)
    latestValues.current = next
    setValues(next)
    await persist(next)
  }

  async function changePortrait(file?: File) {
    if (!file) return
    setPortraitPending(true); await persist(values, file); setPortraitPending(false)
  }

  const classOptions = availableClasses.map((item) => ({ value: item.name, label: item.name }))
  const socialClasses = ["Errant·e", "Serf·ve", "Vilain·e", "Tenancier·ère", "Membre du clergé", "Noble"]
  const alignments = ["Bon·ne", "Neutre", "Mauvais·e"]
  const calculatedSecondary = [
    { index: 17, label: "Dégâts physiques", shortLabel: "Physiques", color: "#c85f78" }, { index: 18, label: "Dégâts magiques", shortLabel: "Magiques", color: "#a96991" },
    { index: 19, label: "Armure physique", shortLabel: "Physique", color: "#74a968" }, { index: 20, label: "Armure magique", shortLabel: "Magique", color: "#6599a0" },
    { index: 21, label: "Rapidité", color: "#e8aa62" }, { index: 22, label: "Échec critique", color: "#c86f6f" },
    { index: 23, label: "Réussite critique", color: "#d9b85c" },
  ]
  const activeTitle = parseMultiple(values[35]).selected
  const campaignAccent = character.campaigns[0]?.accentColor || "#927640"
  const customTabs = parseCharacterTabs(values[characterCustomTabsIndex] || "")
  const characterTabs = [...baseCharacterTabs, ...customTabs]
  const currentLevel = Math.max(0, Math.min(20, Math.trunc(Number(values[3]) || 0)))
  const characterClassValue = values[2] || ""
  const assignedClasses = useMemo(() => selectedCharacterClasses(characterClassValue, availableClasses), [characterClassValue, availableClasses])
  const classChoicesValue = values[characterClassChoicesIndex] || ""
  const classChoiceState = parseClassChoices(classChoicesValue)
  // Recomputing this per keystroke was the most expensive step in the render (it
  // scans every known spell against every skill row via linkedAbilities below).
  const knownClassSpells = useMemo(
    () => knownSpellsForCharacter(assignedClasses, availableClassSpells, currentLevel, classChoicesValue),
    [assignedClasses, availableClassSpells, currentLevel, classChoicesValue],
  )

  function linkedAbilities(skillName: string) {
    const normalized = skillName.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("fr")
    return knownClassSpells.filter((spell) => spell.category !== "bonus" && spell.skills.some((skill) => {
      const candidate = skill.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("fr")
      return candidate === normalized || candidate.includes(normalized) || normalized.includes(candidate)
    }))
  }

  function updateSpellCharges(spell: ClassSpell, count: number) {
    void commit(characterClassChoicesIndex, JSON.stringify({ ...classChoiceState, charges: { ...classChoiceState.charges, [spell.id]: Math.max(0, Math.min(spell.charges ?? 0, count)) } }))
  }

  useEffect(() => {
    if (initialInventory) return
    let active = true
    fetch(`${inventoryEndpoint}?summary=1`)
      .then(async (response) => ({ ok: response.ok, payload: (await response.json()) as { inventory?: CharacterInventoryRecord } }))
      .then(({ ok, payload }) => { if (active && ok && payload.inventory) setInventory(payload.inventory) })
      .catch(() => { /* la fiche reste utilisable sans ses objets */ })
      .finally(() => { if (active) setInventoryLoading(false) })
    // Puis le catalogue complet, en tâche de fond : il porte la mise en forme et les
    // icônes des objets rangés avant qu'elles ne soient recopiées dans l'inventaire.
    fetch(inventoryEndpoint)
      .then(async (response) => ({ ok: response.ok, payload: (await response.json()) as { inventory?: CharacterInventoryRecord } }))
      .then(({ ok, payload }) => { if (active && ok && payload.inventory) setInventory(payload.inventory) })
      .catch(() => { /* le résumé suffit à jouer */ })
    return () => { active = false }
  }, [initialInventory, inventoryEndpoint])

  useEffect(() => {
    if (!loadClassCatalog) return
    let cancelled = false
    async function load() {
      setClassCatalogLoading(true)
      setClassCatalogError("")
      try {
        const response = await fetch("/api/classes/catalog", { cache: "no-store" })
        const payload = await response.json() as { classes?: ClassRecord[]; spells?: ClassSpell[]; error?: string }
        if (!response.ok || !payload.classes || !payload.spells) throw new Error(payload.error || "Catalogue indisponible")
        if (!cancelled) {
          setAvailableClasses(payload.classes)
          setAvailableClassSpells(payload.spells)
        }
      } catch (error) {
        if (!cancelled) setClassCatalogError(error instanceof Error ? error.message : "Les classes et leurs sorts sont indisponibles.")
      } finally {
        if (!cancelled) setClassCatalogLoading(false)
      }
    }
    void load()
    return () => { cancelled = true }
  }, [loadClassCatalog])

  useEffect(() => {
    const restore = window.setTimeout(() => {
      try {
        const stored = JSON.parse(localStorage.getItem(`eraser:character-sheet:${character.id}:view`) || "{}") as { activeTab?: string; narrativeExpanded?: boolean; mechanicsExpanded?: boolean }
        if (stored.activeTab && characterTabs.some((tab) => tab.id === stored.activeTab)) setActiveTab(stored.activeTab)
        if (typeof stored.narrativeExpanded === "boolean") setNarrativeExpanded(stored.narrativeExpanded)
        if (typeof stored.mechanicsExpanded === "boolean") setMechanicsExpanded(stored.mechanicsExpanded)
      } catch { /* état local absent ou ancien */ }
      setViewStateReady(true)
    }, 0)
    return () => window.clearTimeout(restore)
  // Les onglets personnalisés sont déjà présents au premier rendu de la fiche.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [character.id])

  useEffect(() => {
    if (!viewStateReady) return
    localStorage.setItem(`eraser:character-sheet:${character.id}:view`, JSON.stringify({ activeTab, narrativeExpanded, mechanicsExpanded }))
  }, [activeTab, character.id, mechanicsExpanded, narrativeExpanded, viewStateReady])

  async function addCharacterTab() {
    const definition = tabTypes.find((tab) => tab.type === newTabType)
    if (!definition) return
    const nextTab: CharacterTab = { id: crypto.randomUUID(), type: definition.type, label: definition.label, removable: true }
    await commit(characterCustomTabsIndex, JSON.stringify([...customTabs, nextTab]))
    setActiveTab(nextTab.id)
    setAddingTab(false)
  }

  async function removeCharacterTab(id: string) {
    const nextTabs = customTabs.filter((tab) => tab.id !== id)
    if (activeTab === id) setActiveTab("base-competences")
    await commit(characterCustomTabsIndex, JSON.stringify(nextTabs))
  }

  const secondaryCharacteristics = <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-[repeat(18,minmax(0,1fr))]">
    <div className="xl:col-span-3 xl:row-span-2"><ModifierHoverShell items={linkedForValue(10)} toggle={slotToggle} title="Vie totale" color="#6e9ee8" total={totalWithModifier(values[10], modifierForValue(10))}><LifePool current={values[9]} total={values[10]} commit={commit} modifier={modifierForValue(10)} /></ModifierHoverShell></div>
    <div className="flex min-h-20 flex-col items-center justify-center rounded-xl bg-[#75a9c816] px-3 py-2 text-center xl:col-span-3" style={{ borderTop: "2px solid #75a9c8" }}><p className="text-[9px] font-semibold uppercase tracking-[.16em] text-muted-foreground">Classe sociale</p><div className="mt-1 max-w-full"><SelectEdit label="Classe sociale" value={values[11]} options={socialClasses} onCommit={(value) => commit(11, value)} /></div></div>
    <div className="flex min-h-20 flex-col items-center justify-center rounded-xl bg-[#70a8c516] px-3 py-2 text-center xl:col-span-2" style={{ borderTop: "2px solid #70a8c5" }}><p className="text-[9px] font-semibold uppercase tracking-[.16em] text-muted-foreground">Notoriété</p><ModifierHoverShell items={linkedForValue(12)} toggle={slotToggle} title="Notoriété" color="#70a8c5" total={totalWithModifier(values[12], modifierForValue(12))}><div className="mt-1 flex items-center justify-center gap-1.5"><Stepper label="Notoriété" value={values[12]} onCommit={(value) => commit(12, value)} /><ModifierBadge amount={modifierForValue(12)} /></div></ModifierHoverShell></div>
    <div className="flex min-h-20 flex-col items-center justify-center rounded-xl bg-[#c3799816] px-3 py-2 text-center xl:col-span-3" style={{ borderTop: "2px solid #c37998" }}><p className="text-[9px] font-semibold uppercase tracking-[.16em] text-muted-foreground">Alignement</p><div className="mt-1 max-w-full"><SelectEdit label="Alignement" value={values[13]} options={alignments} onCommit={(value) => commit(13, value)} /></div></div>
    {[{ index: 14, label: "Moralité", color: "#bd7b99", span: "xl:col-span-2" }, { index: 15, label: "Folie", color: "#8f79b5", span: "xl:col-span-2" }, { index: 16, label: "Destin", color: "#e7ae69", span: "xl:col-span-3" }].map((field) => <div key={field.index} className={`flex min-h-20 flex-col items-center justify-center rounded-xl px-2 py-2 text-center ${field.span}`} style={{ backgroundColor: `${field.color}16`, borderTop: `2px solid ${field.color}` }}><p className="text-[9px] font-semibold uppercase tracking-[.16em] text-muted-foreground">{field.label}</p><ModifierHoverShell items={linkedForValue(field.index)} toggle={slotToggle} title={field.label} color={field.color} total={totalWithModifier(values[field.index], modifierForValue(field.index))}><div className="mt-1 flex items-center justify-center gap-1.5"><Stepper label={field.label} value={values[field.index]} onCommit={(value) => commit(field.index, value)} /><ModifierBadge amount={modifierForValue(field.index)} /></div></ModifierHoverShell></div>)}
    <div className="sm:col-span-2 xl:col-span-4"><CombinedCalculatedCard label="Dégâts" groupColor="#b96485" fields={calculatedSecondary.slice(0, 2)} values={values} commit={commit} modifierFor={modifierForValue} linkedFor={linkedForValue} toggle={slotToggle} /></div>
    <div className="sm:col-span-2 xl:col-span-4"><CombinedCalculatedCard label="Armure" groupColor="#6da184" fields={calculatedSecondary.slice(2, 4)} values={values} commit={commit} modifierFor={modifierForValue} linkedFor={linkedForValue} toggle={slotToggle} /></div>
    <div className="xl:col-span-2"><CalculatedSecondaryCard fieldIndex={calculatedSecondary[4].index} label={calculatedSecondary[4].label} color={calculatedSecondary[4].color} values={values} commit={commit} modifier={modifierForValue(calculatedSecondary[4].index)} linkedItems={linkedForValue(calculatedSecondary[4].index)} toggle={slotToggle} /></div>
    <div className="sm:col-span-2 xl:col-span-5"><CombinedCalculatedCard label="Critique" groupColor="#d19466" fields={[{ ...calculatedSecondary[5], shortLabel: "Échec" }, { ...calculatedSecondary[6], shortLabel: "Réussite" }]} values={values} commit={commit} modifierFor={modifierForValue} linkedFor={linkedForValue} toggle={slotToggle} /></div>
  </div>

  function renderSkillsContent() { return <div className="grid items-start gap-4 md:grid-cols-2 xl:grid-cols-5">
    {characterSkillGroups.map((group, groupIndex) => {
      const color = palette[groupIndex]
      return <article key={group.characteristic} className="overflow-visible rounded-2xl border bg-card/80 shadow-sm" style={{ borderColor: color.border }}>
        <div className="group relative rounded-t-2xl px-4 py-3 text-white" style={{ backgroundColor: color.accent }}>
          <div className="flex items-center justify-between gap-2"><h3 className="truncate font-display text-lg font-semibold" title={group.characteristic}>{skillGroupTitle(group.characteristic)}</h3><span className="flex items-center gap-1.5"><InlineEdit numeric singleClick compact label={group.characteristic} value={values[group.characteristicIndex]} onCommit={(value) => commit(group.characteristicIndex, value)}><span className="text-2xl font-bold tabular-nums">{values[group.characteristicIndex] || "0"}</span></InlineEdit><ModifierBadge amount={modifierForValue(group.characteristicIndex)} plain /></span></div>
          <div className="pointer-events-none absolute left-3 right-3 top-[calc(100%-2px)] z-40 translate-y-1 rounded-xl border bg-popover p-3 text-popover-foreground opacity-0 shadow-2xl transition group-hover:pointer-events-auto group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100" style={{ borderColor: color.border }}><p className="font-display text-sm font-semibold" style={{ color: color.accent }}>{group.characteristic}</p><p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Seuils critiques</p><div className="grid grid-cols-2 gap-2">{(["success", "failure"] as const).map((kind) => { const index = characterCriticalValueIndex(groupIndex, kind); return <div key={kind}><p className="mb-1 text-[10px] text-muted-foreground">{kind === "success" ? "Réussite" : "Échec"}</p><InlineEdit numeric singleClick compact label={`${group.characteristic} ${kind}`} value={values[index]} onCommit={(value) => commit(index, value)}><span className="block rounded-lg bg-muted px-2 py-1.5 text-center font-semibold tabular-nums">{values[index] || "0"}</span></InlineEdit></div> })}</div><LinkedItemsPanel items={linkedForValue(group.characteristicIndex)} toggle={slotToggle} borderColor={color.border} total={totalWithModifier(values[group.characteristicIndex], modifierForValue(group.characteristicIndex))} /></div>
        </div>
        <div className="grid grid-cols-[minmax(0,1fr)_repeat(3,2.15rem)] gap-1 px-3 py-2 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground"><span>Compétence</span><span className="text-center">Stat</span><span className="text-center">RC</span><span className="text-center">EC</span></div>
        {group.skills.map((_, localIndex) => { const skillIndex = skillOffsetByGroup[groupIndex] + localIndex; return <SkillRow key={characterSkills[skillIndex].name} skillIndex={skillIndex} values={values} color={color} commit={commit} abilities={linkedAbilities(characterSkills[skillIndex].name)} charges={classChoiceState.charges} setCharges={updateSpellCharges} skillModifier={modifierTotalFor(modifierIndex, skillModifierTargetId(characterSkills[skillIndex].name))} characteristicModifier={modifierTotalFor(modifierIndex, characteristicModifierTargetId(group.characteristic))} successModifier={modifierForValue(23)} failureModifier={modifierForValue(22)} linkedItems={mergeLinkedItems(linkedItemsFor(modifierIndex, skillModifierTargetId(characterSkills[skillIndex].name)), linkedItemsFor(modifierIndex, characteristicModifierTargetId(group.characteristic)))} toggle={slotToggle} /> })}
      </article>
    })}
  </div> }

  function renderTabContent(tab: CharacterTab) {
    if (tab.type === "competences") return renderSkillsContent()
    if (tab.type === "inventaire") return inventoryLoading
      ? <div className="grid min-h-32 place-items-center rounded-2xl border border-dashed"><LoaderCircle className="size-5 animate-spin text-muted-foreground" /></div>
      : <CharacterInventory characterId={character.id} inventory={inventory} onInventoryChange={setInventory} />
    if (tab.type === "classe") return <ClassProgression classes={assignedClasses} spells={availableClassSpells} level={currentLevel} value={classChoicesValue} onCommit={(value) => commit(characterClassChoicesIndex, value)} loading={classCatalogLoading} error={classCatalogError} />
    if (tab.type === "journal") return <div className="grid items-start gap-7 xl:grid-cols-[minmax(0,1.35fr)_minmax(22rem,.65fr)]"><CharacterRelations characterId={character.id} campaigns={character.campaigns} /><aside className="min-w-0"><NotesEditor embedded value={values[8]} onCommit={(value) => commit(8, value)} /></aside></div>
    return <div className="min-h-56 rounded-2xl border border-dashed border-border/55 bg-card/20" />
  }

  const activeCharacterTab = characterTabs.find((tab) => tab.id === activeTab) ?? characterTabs[0]
  const lifeState = characterLifeState(values[9], totalWithModifier(values[10], modifierForValue(10)))

  return <div data-life={lifeState} className="character-life w-full flex-1 px-4 py-7 sm:px-7 md:py-10" style={{ "--character-accent": campaignAccent } as CSSProperties} title={lifeState === "dead" ? "Vie actuelle à moins la vie totale ou en dessous" : lifeState === "down" ? "Vie actuelle sous 0" : undefined}>
    {/* Bichromie rouge sang de la fiche « morte » : la luminosité de chaque point devient
        un rouge, du plus sombre au rose pâle, comme le gris le fait pour une fiche à terre. */}
    <svg aria-hidden="true" width="0" height="0" className="pointer-events-none absolute"><filter id="eraser-life-dead" colorInterpolationFilters="sRGB"><feColorMatrix type="matrix" values="0.1318 0.4434 0.0448 0 0.35 0.1446 0.4863 0.0491 0 0.02 0.1382 0.4649 0.0469 0 0.03 0 0 0 1 0" /></filter></svg>
    <section className="relative overflow-hidden rounded-[1.75rem] border bg-card/85 p-5 shadow-xl shadow-black/10 sm:p-7" style={{ borderColor: `${campaignAccent}55` }}>
      <div className="absolute inset-x-0 top-0 h-1" style={{ background: `linear-gradient(90deg, ${campaignAccent}, ${campaignAccent}66 58%, transparent)` }} />
      <div className="flex flex-col gap-6 lg:flex-row">
        <div className="flex w-40 shrink-0 flex-col gap-1 sm:w-52 lg:w-56 xl:w-64">
        <label className="group relative flex aspect-[3/4] w-full shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-2xl bg-muted text-muted-foreground shadow-inner">
          {values[characterNarrativeStart + 1] ? <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={values[characterNarrativeStart + 1]} alt={`Portrait de ${character.name}`} decoding="async" fetchPriority="high" className="size-full object-cover" />
          </> : <CircleUserRound className="size-20 opacity-30" />}
          <span className="absolute inset-x-3 bottom-3 flex items-center justify-center gap-2 rounded-lg bg-black/65 px-3 py-2 text-xs text-white opacity-0 backdrop-blur transition group-hover:opacity-100"><ImagePlus className="size-4" />{portraitPending ? "Envoi…" : "Changer"}</span>
          <input type="file" accept="image/*" className="sr-only" onChange={(event) => changePortrait(event.target.files?.[0])} />
        </label>
        <TokenButton kind="character" ownerId={character.id} name={values[0] || character.name} source={values[characterNarrativeStart + 1] || ""} style={{ kind: "character" }} disabledReason={values[characterNarrativeStart + 1] ? "" : "Ajoute d’abord un portrait"} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div><p className="text-[10px] font-semibold uppercase tracking-[.28em]" style={{ color: campaignAccent }}>Identité</p><InlineEdit label="Nom" value={values[0]} onCommit={(value) => commit(0, value)}><h1 className="mt-1 font-display text-4xl font-semibold tracking-tight sm:text-6xl">{values[0] || "Sans nom"}</h1></InlineEdit>{activeTitle && <p className="mt-1 font-display text-lg" style={{ color: campaignAccent }}>{activeTitle}</p>}</div>
            <div className="flex flex-wrap justify-end gap-2">{character.campaigns.length ? character.campaigns.map((campaign) => <span key={campaign.id} className="rounded-full border px-3 py-1 text-xs font-medium" style={{ color: campaign.accentColor, borderColor: `${campaign.accentColor}66`, backgroundColor: `${campaign.accentColor}12` }}>{campaign.name}</span>) : <span className="rounded-full border px-3 py-1 text-xs text-muted-foreground">Sans campagne</span>}</div>
          </div>
          <div className="mt-6 divide-y border-y">
            <div className="grid gap-x-8 gap-y-4 py-4 sm:grid-cols-2 xl:grid-cols-12">
              <div className="xl:col-span-4"><p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Peuples</p><MultipleValues label="un peuple" value={values[1]} onCommit={(value) => commit(1, value)} /></div>
              <div className="xl:col-span-5"><p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Classes</p><MultipleValues label="une classe" value={values[2]} options={classOptions} onCommit={(value) => commit(2, value)} /></div>
              <div className="xl:col-span-3"><p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Level</p><Stepper label="Level" value={values[3]} onCommit={(value) => commit(3, value)} /></div>
            </div>
            <div className="grid gap-x-8 gap-y-4 py-4 sm:grid-cols-2 xl:grid-cols-12">
              <div className="xl:col-span-6"><p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Langues parlées</p><MultipleValues label="une langue" value={values[24]} onCommit={(value) => commit(24, value)} /></div>
              <div className="xl:col-span-6"><p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Titres honorifiques</p><MultipleValues selectActive label="un titre" value={values[35]} onCommit={(value) => commit(35, value)} /></div>
            </div>
            <div className="grid gap-x-8 gap-y-4 py-4 sm:grid-cols-2 xl:grid-cols-12">
              {[{ index: 4, label: "Taille" }, { index: 5, label: "Poids" }, { index: 6, label: "Âge" }].map((field) => <div key={field.index} className="xl:col-span-2"><p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{field.label}</p><InlineEdit compact label={field.label} value={values[field.index]} onCommit={(value) => commit(field.index, value)}><p className="mt-1 text-sm font-medium">{values[field.index] || "—"}</p></InlineEdit></div>)}
              <div className="xl:col-span-3"><p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Religions</p><MultipleValues label="une religion" value={values[37]} onCommit={(value) => commit(37, value)} /></div>
              <div className="xl:col-span-3"><p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Autre</p><InlineEdit compact label="Autre" value={values[7]} onCommit={(value) => commit(7, value)}><p className="mt-1 text-sm font-medium">{values[7] || "—"}</p></InlineEdit></div>
            </div>
          </div>
          <div className="mt-5">
            <button type="button" onClick={() => setNarrativeExpanded((current) => !current)} className="flex w-full items-center justify-between border-y border-border/55 px-1 py-2 text-left text-[10px] font-semibold uppercase tracking-[.18em] text-muted-foreground hover:text-foreground" aria-expanded={narrativeExpanded}>
              <span>But · Personnalité · Histoire</span>
              {narrativeExpanded ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
            </button>
            {narrativeExpanded && <div className="mt-4 grid divide-y border-y py-4 2xl:grid-cols-3 2xl:divide-x 2xl:divide-y-0"><div className="pb-4 2xl:pb-0 2xl:pr-5"><NotesEditor plain compact label="But" value={values[38]} onCommit={(value) => commit(38, value)} /></div><div className="py-4 2xl:px-5 2xl:py-0"><NotesEditor plain compact label="Personnalité" value={values[39]} onCommit={(value) => commit(39, value)} /></div><div className="pt-4 2xl:pl-5 2xl:pt-0"><NotesEditor plain compact label="Histoire" value={values[40]} onCommit={(value) => commit(40, value)} /></div></div>}
          </div>
        </div>
      </div>
    </section>

    <div className="mt-6">{secondaryCharacteristics}</div>

    <section className="hidden">
      <button type="button" onClick={() => setMechanicsExpanded((current) => !current)} className="flex w-full items-center justify-between border-y border-border/55 px-1 py-3 text-left" aria-expanded={mechanicsExpanded}>
        <div><p className="text-[10px] font-semibold uppercase tracking-[.25em] text-primary/70">Système de jeu</p><h2 className="font-display text-3xl font-semibold">Caractéristiques & compétences</h2></div>
        {mechanicsExpanded ? <ChevronUp className="size-5 text-muted-foreground" /> : <ChevronDown className="size-5 text-muted-foreground" />}
      </button>
      {mechanicsExpanded && <div className="mt-5">
      <div className="mb-3"><p className="text-[10px] font-semibold uppercase tracking-[.25em] text-primary/70">Repères</p><h3 className="font-display text-2xl font-semibold">Caractéristiques secondaires</h3></div>
      <div className="grid gap-2 rounded-2xl border border-border/60 bg-card/35 p-2.5 shadow-sm sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-[repeat(18,minmax(0,1fr))]">
        <div className="xl:col-span-3 xl:row-span-2"><ModifierHoverShell items={linkedForValue(10)} toggle={slotToggle} title="Vie totale" color="#6e9ee8" total={totalWithModifier(values[10], modifierForValue(10))}><LifePool current={values[9]} total={values[10]} commit={commit} modifier={modifierForValue(10)} /></ModifierHoverShell></div>
        <div className="flex min-h-20 flex-col items-center justify-center rounded-xl bg-[#75a9c816] px-3 py-2 text-center xl:col-span-3" style={{ borderTop: "2px solid #75a9c8" }}><p className="text-[9px] font-semibold uppercase tracking-[.16em] text-muted-foreground">Classe sociale</p><div className="mt-1 max-w-full"><SelectEdit label="Classe sociale" value={values[11]} options={socialClasses} onCommit={(value) => commit(11, value)} /></div></div>
        <div className="flex min-h-20 flex-col items-center justify-center rounded-xl bg-[#70a8c516] px-3 py-2 text-center xl:col-span-2" style={{ borderTop: "2px solid #70a8c5" }}><p className="text-[9px] font-semibold uppercase tracking-[.16em] text-muted-foreground">Notoriété</p><ModifierHoverShell items={linkedForValue(12)} toggle={slotToggle} title="Notoriété" color="#70a8c5" total={totalWithModifier(values[12], modifierForValue(12))}><div className="mt-1 flex items-center justify-center gap-1.5"><Stepper label="Notoriété" value={values[12]} onCommit={(value) => commit(12, value)} /><ModifierBadge amount={modifierForValue(12)} /></div></ModifierHoverShell></div>
        <div className="flex min-h-20 flex-col items-center justify-center rounded-xl bg-[#c3799816] px-3 py-2 text-center xl:col-span-3" style={{ borderTop: "2px solid #c37998" }}><p className="text-[9px] font-semibold uppercase tracking-[.16em] text-muted-foreground">Alignement</p><div className="mt-1 max-w-full"><SelectEdit label="Alignement" value={values[13]} options={alignments} onCommit={(value) => commit(13, value)} /></div></div>
        {[{ index: 14, label: "Moralité", color: "#bd7b99", span: "xl:col-span-2" }, { index: 15, label: "Folie", color: "#8f79b5", span: "xl:col-span-2" }, { index: 16, label: "Destin", color: "#e7ae69", span: "xl:col-span-3" }].map((field) => <div key={field.index} className={`flex min-h-20 flex-col items-center justify-center rounded-xl px-2 py-2 text-center ${field.span}`} style={{ backgroundColor: `${field.color}16`, borderTop: `2px solid ${field.color}` }}><p className="text-[9px] font-semibold uppercase tracking-[.16em] text-muted-foreground">{field.label}</p><ModifierHoverShell items={linkedForValue(field.index)} toggle={slotToggle} title={field.label} color={field.color} total={totalWithModifier(values[field.index], modifierForValue(field.index))}><div className="mt-1 flex items-center justify-center gap-1.5"><Stepper label={field.label} value={values[field.index]} onCommit={(value) => commit(field.index, value)} /><ModifierBadge amount={modifierForValue(field.index)} /></div></ModifierHoverShell></div>)}
        <div className="sm:col-span-2 xl:col-span-4"><CombinedCalculatedCard label="Dégâts" groupColor="#b96485" fields={calculatedSecondary.slice(0, 2)} values={values} commit={commit} modifierFor={modifierForValue} linkedFor={linkedForValue} toggle={slotToggle} /></div>
        <div className="sm:col-span-2 xl:col-span-4"><CombinedCalculatedCard label="Armure" groupColor="#6da184" fields={calculatedSecondary.slice(2, 4)} values={values} commit={commit} modifierFor={modifierForValue} linkedFor={linkedForValue} toggle={slotToggle} /></div>
        <div className="xl:col-span-2"><CalculatedSecondaryCard fieldIndex={calculatedSecondary[4].index} label={calculatedSecondary[4].label} color={calculatedSecondary[4].color} values={values} commit={commit} modifier={modifierForValue(calculatedSecondary[4].index)} linkedItems={linkedForValue(calculatedSecondary[4].index)} toggle={slotToggle} /></div>
        <div className="sm:col-span-2 xl:col-span-5"><CombinedCalculatedCard label="Critique" groupColor="#d19466" fields={[{ ...calculatedSecondary[5], shortLabel: "Échec" }, { ...calculatedSecondary[6], shortLabel: "Réussite" }]} values={values} commit={commit} modifierFor={modifierForValue} linkedFor={linkedForValue} toggle={slotToggle} /></div>
      </div>
      <div className="mb-4 mt-9"><p className="text-[10px] font-semibold uppercase tracking-[.25em] text-primary/70">Aptitudes</p><h3 className="font-display text-2xl font-semibold">Caractéristiques principales & compétences</h3></div>
      <div className="grid items-start gap-4 md:grid-cols-2 xl:grid-cols-5">
        {characterSkillGroups.map((group, groupIndex) => {
          const color = palette[groupIndex]
          return <article key={group.characteristic} className="overflow-visible rounded-2xl border bg-card/80 shadow-sm" style={{ borderColor: color.border }}>
            <div className="group relative rounded-t-2xl px-4 py-3 text-white" style={{ backgroundColor: color.accent }}>
              <div className="flex items-center justify-between gap-2"><h3 className="truncate font-display text-lg font-semibold" title={group.characteristic}>{skillGroupTitle(group.characteristic)}</h3><span className="flex items-center gap-1.5"><InlineEdit numeric singleClick compact label={group.characteristic} value={values[group.characteristicIndex]} onCommit={(value) => commit(group.characteristicIndex, value)}><span className="text-2xl font-bold tabular-nums">{values[group.characteristicIndex] || "0"}</span></InlineEdit><ModifierBadge amount={modifierForValue(group.characteristicIndex)} plain /></span></div>
              <div className="pointer-events-none absolute left-3 right-3 top-[calc(100%-2px)] z-40 translate-y-1 rounded-xl border bg-popover p-3 text-popover-foreground opacity-0 shadow-2xl transition group-hover:pointer-events-auto group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100" style={{ borderColor: color.border }}>
                <p className="font-display text-sm font-semibold" style={{ color: color.accent }}>{group.characteristic}</p><p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Seuils critiques</p>
                <div className="grid grid-cols-2 gap-2">{(["success", "failure"] as const).map((kind) => { const index = characterCriticalValueIndex(groupIndex, kind); return <div key={kind}><p className="mb-1 text-[10px] text-muted-foreground">{kind === "success" ? "Réussite" : "Échec"}</p><InlineEdit numeric singleClick compact label={`${group.characteristic} ${kind}`} value={values[index]} onCommit={(value) => commit(index, value)}><span className="block rounded-lg bg-muted px-2 py-1.5 text-center font-semibold tabular-nums">{values[index] || "0"}</span></InlineEdit></div> })}</div>
                <LinkedItemsPanel items={linkedForValue(group.characteristicIndex)} toggle={slotToggle} borderColor={color.border} total={totalWithModifier(values[group.characteristicIndex], modifierForValue(group.characteristicIndex))} />
              </div>
            </div>
            <div className="grid grid-cols-[minmax(0,1fr)_repeat(3,2.15rem)] gap-1 px-3 py-2 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground"><span>Compétence</span><span className="text-center">Stat</span><span className="text-center">RC</span><span className="text-center">EC</span></div>
            {group.skills.map((_, localIndex) => { const skillIndex = skillOffsetByGroup[groupIndex] + localIndex; return <SkillRow key={characterSkills[skillIndex].name} skillIndex={skillIndex} values={values} color={color} commit={commit} abilities={linkedAbilities(characterSkills[skillIndex].name)} charges={classChoiceState.charges} setCharges={updateSpellCharges} skillModifier={modifierTotalFor(modifierIndex, skillModifierTargetId(characterSkills[skillIndex].name))} characteristicModifier={modifierTotalFor(modifierIndex, characteristicModifierTargetId(group.characteristic))} successModifier={modifierForValue(23)} failureModifier={modifierForValue(22)} linkedItems={mergeLinkedItems(linkedItemsFor(modifierIndex, skillModifierTargetId(characterSkills[skillIndex].name)), linkedItemsFor(modifierIndex, characteristicModifierTargetId(group.characteristic)))} toggle={slotToggle} /> })}
          </article>
        })}
      </div>
      </div>}
    </section>
    <Tabs value={activeCharacterTab.id} onValueChange={setActiveTab} className="mt-9 rounded-2xl border border-[#74664f3d] bg-[linear-gradient(135deg,rgba(146,118,64,.10),rgba(255,255,255,.018))] p-2 shadow-sm">
      <div className="overflow-hidden">
        <TabsList variant="line" className="h-auto w-full min-w-0 flex-wrap justify-start bg-transparent">
          {characterTabs.map((tab) => <TabsTrigger key={tab.id} value={tab.id} className="h-10 gap-2 rounded-xl px-3 data-[state=active]:bg-[#92764018] data-[state=active]:shadow-sm"><CharacterTabIcon type={tab.type} /><span>{tab.label}</span>{tab.removable && <span role="button" tabIndex={0} className="ml-1 rounded-full p-0.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" onClick={(event) => { event.stopPropagation(); void removeCharacterTab(tab.id) }} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); event.stopPropagation(); void removeCharacterTab(tab.id) } }} aria-label={`Retirer l’onglet ${tab.label}`}><X className="size-3" /></span>}</TabsTrigger>)}
          <Button type="button" variant="ghost" size="icon-sm" onClick={() => setAddingTab(true)} aria-label="Ajouter un onglet" title="Ajouter un onglet"><Plus /></Button>
        </TabsList>
      </div>
      <TabsContent value={activeCharacterTab.id} forceMount className="mt-2 rounded-xl p-2 sm:p-3">{renderTabContent(activeCharacterTab)}</TabsContent>
    </Tabs>

    <Dialog open={addingTab} onOpenChange={setAddingTab}>
      <DialogContent>
        <DialogHeader><DialogTitle>Ajouter un onglet</DialogTitle></DialogHeader>
        <div className="grid gap-4 pt-2">
          <label className="grid gap-1.5 text-sm font-medium">Type d’onglet<NativeSelect value={newTabType} onChange={(event) => setNewTabType(event.target.value as CharacterTabType)}>{tabTypes.map((tab) => <NativeSelectOption key={tab.type} value={tab.type}>{tab.label}</NativeSelectOption>)}</NativeSelect></label>
          <Button type="button" onClick={() => void addCharacterTab()}><Plus />Ajouter l’onglet</Button>
        </div>
      </DialogContent>
    </Dialog>
  </div>
}
