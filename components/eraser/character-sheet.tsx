"use client"

import { IndexRichText } from "@/components/eraser/index-references"
import dynamic from "next/dynamic"
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react"
import { Backpack, BookOpen, Check, ChevronDown, ChevronUp, CircleUserRound, GraduationCap, ImagePlus, LoaderCircle, Minus, NotebookPen, PawPrint, Plus, Sparkles, Swords, X } from "lucide-react"

import { Checkbox } from "@/components/ui/checkbox"
import { InlineEdit } from "@/components/eraser/inline-edit"
import { showItemNotifications, unseenItemNotifications, useInventoryReceived } from "@/components/eraser/item-notifications"
import type { ItemNotification } from "@/lib/item-notifications"
import { markNewSlots, receivedSlots, useNewSlots } from "@/components/eraser/new-inventory-items"
import { useCommitOnLeave } from "@/components/eraser/use-commit-on-leave"
import { TokenButton } from "@/components/eraser/token-editor"
import { IndexImage } from "@/components/eraser/index-image"
import { RichTextField } from "@/components/eraser/rich-text"
import { CharacterSummons, type SummonsUpdate } from "@/components/eraser/character-summons"
import { parseSummonsData, type SummonsData } from "@/lib/summons"
import { ClassGaugeView, useClassGauges } from "@/components/eraser/class-gauges"
import { ClassDisplayButton } from "@/components/eraser/class-display-button"
import { classDisplayOf, withClassDisplay } from "@/lib/class-visibility"
import { formulaValues, gaugeContributions, gaugesOfClass, gaugeStatesOf, gaugeVisibleIn, resolveGauge, withGaugeState, type ClassGauge, type ResolvedGauge } from "@/lib/class-specifics"
import { activeForm, chosenFormsOf, formContributions, formGroupsOfClass, formStateEntriesOf, formStatesOf, withChosenForm, withFormStateEntry, type ClassForm, type ClassFormGroup } from "@/lib/class-forms"
import { ClassFormSwitcher } from "@/components/eraser/class-form-switcher"
import { ClassDeckPanel } from "@/components/eraser/class-deck-panel"
import { cardsOfClass, deckStatesOf, decksOfClass, withDeckState, type DeckState } from "@/lib/class-decks"

import { Button } from "@/components/ui/button"
import { chooseClassSpell, ClassProgression, dropRanksAbove, knownSpellsForCharacter, newSpellsKey, parseClassChoices, pendingRankSteps, rankLossOf, selectedCharacterClasses, takeRankBonus, type RankBonusTaken, type RankLoss } from "@/components/eraser/class-progression"
import { SpellChoiceDialog, type RankBonusSelection } from "@/components/eraser/spell-choice-dialog"
import { useRankBonuses } from "@/components/eraser/rank-bonus"
import { isAnyCharacteristicTarget, isMovementTarget } from "@/lib/rank-bonuses"
import { CharacterStatesPanel, useStatesCatalog } from "@/components/eraser/character-states"
import { FxOverlay, PageFxOverlay, PortraitFx, pageImageFxClass, portraitImageFxClass, stateFxOf } from "@/components/eraser/portrait-fx"
import { applyRule, hasRule, ruleLabel, type ModifierRule } from "@/lib/state-change"
import { portraitLayers, stateContributions, withoutStateWrites, withStateWrites, writesToRevert, type CharacterState, type StateWrite } from "@/lib/character-states"
import { SpellChargeStars } from "@/components/eraser/spell-charges"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  characterClassChoicesIndex,
  characterCustomTabsIndex,
  characterNarrativeStart,
  characterSecondaryCalculatedFields,
  characterSecondaryCalculationValueIndex,
  characterSkillMetrics,
  characterValueHeaders,
} from "@/lib/character-sheet-schema"
import {
  builtinCharacterCatalog,
  builtinPrincipalColors,
  catalogDescriptionOf,
  catalogGroups,
  characterLayout,
  CRITICAL_FAILURE_METRIC,
  CRITICAL_SUCCESS_METRIC,
  movementRole,
  type CatalogCharacteristic,
  type CatalogGroup,
  type CatalogSkill,
  type CharacterCatalog,
} from "@/lib/character-catalog"
import { useCatalogDescriptions, useCharacterCatalog } from "@/components/eraser/use-character-catalog"
import { HelpMark } from "@/components/eraser/help-mark"
import type { CharacterSheetChange, CharacterSheetRecord, ClassRecord } from "@/lib/google-sheets"
import type { ClassSpell } from "@/lib/class-content"
import { keepCatalogFields, type CharacterInventoryRecord } from "@/lib/inventory-schema"
import { ObjectIcon } from "@/components/eraser/object-icon"
import { loadFullInventory } from "@/lib/inventory-fetch"
import {
  buildItemModifierTargets,
  cappedSkillTotal,
  characteristicModifierTargetId,
  formatModifierAmount,
  indexInventoryModifiers,
  indexItemUsage,
  linkedItemsFor,
  usageItemsFor,
  modifierTargetIdForName,
  modifierTotalFor,
  modifierRuleFor,
  CURRENT_LIFE_TARGET_ID,
  withStateModifiers,
  skillModifierTargetId,
  type LinkedModifierItem,
  type UsageItem,
} from "@/lib/item-modifiers"
import { characterLifeState } from "@/lib/character-life"
import { foldName } from "@/lib/index-columns"
import { rollDiceExpression } from "@/lib/math-expression"
import { rangeLabel, rollHits, signedDice } from "@/lib/state-change"
import type { StateEffect } from "@/lib/character-states"
import type { StateRollOutcome } from "@/components/eraser/character-states"
import { evaluateRelativeExpression } from "@/lib/math-expression"
import { parseListCell, serializeListCell } from "@/lib/multiple-values"
import { parseCompanions, type Companion } from "@/lib/companions"
import { playItemEquipped, playItemUnequipped, preloadSounds } from "@/lib/sounds"

const CharacterInventory = dynamic(() => import("@/components/eraser/character-inventory").then((module) => module.CharacterInventory), {
  loading: () => <div className="grid min-h-32 place-items-center"><LoaderCircle className="size-5 animate-spin text-muted-foreground" /></div>,
})
const CharacterCompanions = dynamic(() => import("@/components/eraser/character-companions").then((module) => module.CharacterCompanions), {
  loading: () => <div className="grid min-h-32 place-items-center"><LoaderCircle className="size-5 animate-spin text-muted-foreground" /></div>,
})
const CharacterRelations = dynamic(() => import("@/components/eraser/character-relations").then((module) => module.CharacterRelations), {
  loading: () => <div className="grid min-h-32 place-items-center"><LoaderCircle className="size-5 animate-spin text-muted-foreground" /></div>,
})

type CharacterTabType = "competences" | "inventaire" | "classe" | "journal" | "invocation" | "compagnon"
/** `summons` : templates et invocations d’un onglet Invocation (voir lib/summons). */
type CharacterTab = { id: string; type: CharacterTabType; label: string; removable: boolean; companions?: Companion[]; summons?: SummonsData }

const tabTypes: Array<{ type: CharacterTabType; label: string }> = [
  { type: "competences", label: "Compétences" }, { type: "inventaire", label: "Inventaire" },
  { type: "classe", label: "Sorts" }, { type: "journal", label: "Journal" },
  { type: "invocation", label: "Invocation" }, { type: "compagnon", label: "Compagnon" },
]

// Le « + » n’ajoute que des onglets supplémentaires ; les quatre de base sont toujours là.
// Un onglet déjà ajouté d’un autre type reste affiché.
const addableTabTypes = tabTypes.filter((tab) => tab.type === "invocation" || tab.type === "compagnon")

const baseCharacterTabs: CharacterTab[] = tabTypes.slice(0, 4).map((tab) => ({ ...tab, id: `base-${tab.type}`, removable: false }))


function parseCharacterTabs(value: string): CharacterTab[] {
  try {
    const parsed = JSON.parse(value)
    if (!Array.isArray(parsed)) return []
    // Les compagnons et les invocations restent avec leur onglet : réécrire les onglets ne les efface pas.
    return parsed.flatMap((tab) => tab && typeof tab.id === "string" && tabTypes.some((candidate) => candidate.type === tab.type)
      ? [{ id: tab.id, type: tab.type as CharacterTabType, label: typeof tab.label === "string" && tab.label.trim() ? tab.label.trim() : tabTypes.find((candidate) => candidate.type === tab.type)?.label || "Onglet", removable: true, ...(tab.type === "compagnon" ? { companions: parseCompanions(tab.companions) } : {}), ...(tab.type === "invocation" ? { summons: parseSummonsData(tab.summons) } : {}) }]
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

type GroupColor = { accent: string; soft: string; border: string }
const tone = (accent: string): GroupColor => ({ accent, soft: `${accent}18`, border: `${accent}55` })

/**
 * La couleur d'une carte : celle choisie dans l'Index des caractéristiques et compétences,
 * sinon celle d'origine ; une caractéristique ajoutée sans couleur prend la suivante du cycle.
 */
const extraColors = ["#8a6fb0", "#b48745", "#4f7fb0", "#a76f9d", "#6d8f6a"]

function groupColor(characteristic: CatalogCharacteristic | null, position: number) {
  if (!characteristic) return tone("#7d7f86")
  return tone(characteristic.color || builtinPrincipalColors[characteristic.key] || extraColors[position % extraColors.length])
}


function Stepper({ label, value, onCommit }: { label: string; value: string; onCommit: (value: string) => Promise<void> }) {
  const numeric = sheetNumber(value || "0")
  return <div className="inline-flex items-center gap-1"><button type="button" onClick={() => onCommit(String(numeric - 1))} className="flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted" aria-label={`Diminuer ${label}`}><Minus className="size-3" /></button><InlineEdit numeric singleClick compact label={label} value={value} onCommit={onCommit}><span className="min-w-7 text-center text-xl font-semibold tabular-nums">{value || "0"}</span></InlineEdit><button type="button" onClick={() => onCommit(String(numeric + 1))} className="flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted" aria-label={`Augmenter ${label}`}><Plus className="size-3" /></button></div>
}

function SelectEdit({ label, value, options, onCommit }: { label: string; value: string; options: string[]; onCommit: (value: string) => Promise<void> }) {
  const [editing, setEditing] = useState(false)
  if (!editing) return <button type="button" onDoubleClick={() => setEditing(true)} className="min-h-8 max-w-full truncate rounded-md px-2 text-sm font-semibold" title={`Double-cliquer pour modifier ${label}`}>{value || "—"}</button>
  return <NativeSelect autoFocus aria-label={label} value={value} onBlur={() => setEditing(false)} onChange={(event) => { void onCommit(event.target.value); setEditing(false) }} className="h-8 min-w-0 max-w-full border-0 bg-transparent px-1 text-sm font-medium shadow-none">
    <NativeSelectOption value="">—</NativeSelectOption>{options.map((option) => <NativeSelectOption key={option} value={option}>{option}</NativeSelectOption>)}
  </NativeSelect>
}

function MultipleValues({ label, value, options, selectActive = false, onCommit }: { label: string; value: string; options?: Array<{ value: string; label: string }>; selectActive?: boolean; onCommit: (value: string) => Promise<void> }) {
  const { entries, selected } = parseListCell(value)
  const [draft, setDraft] = useState("")
  const [wantsToAdd, setAdding] = useState(false)
  // Vide (la dernière valeur vient d'être retirée, ou rien n'a encore été choisi) : l'ajout reste toujours proposé.
  const adding = wantsToAdd || entries.length === 0
  // Texte lisible dans la feuille (« A · B ») ; pour un titre, le titre choisi vient en premier.
  function serialize(nextEntries: string[], nextSelected = selected) { return serializeListCell(nextEntries, selectActive ? nextSelected : undefined) }
  async function add(raw: string) {
    const nextValue = raw.replace(/\s+·\s+/g, " ").trim(); if (!nextValue || entries.includes(nextValue)) return
    // La case se vide tout de suite : ce qui est tapé pendant l'enregistrement n'est pas effacé à son retour.
    setDraft(""); setAdding(false)
    await onCommit(serialize([...entries, nextValue], selected || nextValue))
  }
  return <div className="min-w-0"><div className="flex flex-wrap items-center gap-1.5">{entries.map((entry) => <button key={entry} type="button" onClick={() => selectActive && onCommit(serialize(entries, entry))} className={`group/tag inline-flex max-w-full shrink items-center gap-1 rounded-full border px-2 py-1 text-xs ${selectActive && selected === entry ? "border-primary/60 bg-primary/15 text-primary" : "bg-background/55"}`} title={selectActive ? "Choisir comme titre affiché" : undefined}><span className="truncate">{options?.find((option) => option.value === entry)?.label || entry}</span><span role="button" tabIndex={0} onClick={(event) => { event.stopPropagation(); void onCommit(serialize(entries.filter((item) => item !== entry))) }} className="shrink-0 text-muted-foreground opacity-50 hover:text-destructive hover:opacity-100" aria-label={`Retirer ${entry}`}><X className="size-3" /></span></button>)}{entries.length > 0 && !adding && <button type="button" onClick={() => setAdding(true)} className="flex size-6 shrink-0 items-center justify-center rounded-full border border-dashed text-muted-foreground hover:border-primary/50 hover:text-primary" aria-label={`Ajouter ${label}`}><Plus className="size-3.5" /></button>}</div>{adding && <div className="mt-1.5 flex gap-1">{options ? <NativeSelect value="" onChange={(event) => add(event.target.value)} className="h-7 min-w-28 border-0 bg-transparent px-1 text-xs shadow-none"><NativeSelectOption value="">Ajouter…</NativeSelectOption>{options.filter((option) => !entries.includes(option.value)).map((option) => <NativeSelectOption key={option.value} value={option.value}>{option.label}</NativeSelectOption>)}</NativeSelect> : <><Input autoFocus value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void add(draft) } if (event.key === "Escape") { setDraft(""); setAdding(false) } }} onBlur={() => { if (draft.trim()) void add(draft) }} placeholder={`Ajouter ${label.toLowerCase()}…`} className="h-7 min-w-28 border-0 bg-transparent px-1 text-xs shadow-none" /><button type="button" onClick={() => add(draft)} className="flex size-7 items-center justify-center rounded-md text-primary hover:bg-primary/10"><Plus className="size-3.5" /></button>{entries.length > 0 && <button type="button" onClick={() => setAdding(false)} className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"><X className="size-3.5" /></button>}</>}</div>}</div>
}

function calculateExpression(expression: string, fallback: number) {
  try { return evaluateRelativeExpression(expression, fallback) } catch { return fallback }
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

/**
 * Un clic de souris sur une case déjà ouverte par le survol la laisse ouverte (il la
 * refermait aussitôt) ; au doigt ou au clavier, il l'ouvre et la referme.
 */
function clickKeepsOpen(event: { nativeEvent: Event }) {
  return "pointerType" in event.nativeEvent && (event.nativeEvent as PointerEvent).pointerType === "mouse"
}

function sheetNumber(value: string) {
  const parsed = Number.parseFloat(String(value ?? "").replace(",", "."))
  return Number.isFinite(parsed) ? parsed : 0
}

/** Affiche un total en y ajoutant les modificateurs d’objets, sans toucher à la valeur de la feuille. */
function totalWithModifier(raw: string, modifier: number, fallback = "0", rule?: ModifierRule) {
  if (!modifier && !hasRule(rule)) return raw || fallback
  // Une case vide vaut 0 : Folie vide avec un état à +100 donne 100.
  const text = String(raw ?? "").trim()
  const parsed = text ? Number.parseFloat(text.replace(",", ".")) : 0
  if (!Number.isFinite(parsed)) return raw || fallback
  // « = », plancher et plafond des états posés, après les ajouts.
  return String(Math.round(applyRule(parsed + modifier, rule) * 100) / 100)
}

/** Le modificateur en clair : « +10 », « =100 », « +10 ≥1 ». */
function modifierText(modifier: number, rule?: ModifierRule) {
  return [modifier ? formatModifierAmount(modifier) : "", ruleLabel(rule)].filter(Boolean).join(" ")
}

/**
 * Un même objet peut viser une compétence et sa caractéristique : on additionne ses apports.
 * Un apport à un seuil critique reste sur sa propre ligne, étiquetée.
 */
function mergeLinkedItems(...lists: LinkedModifierItem[][]) {
  const merged = new Map<string, LinkedModifierItem>()
  for (const entry of lists.flat()) {
    const key = `${entry.slotId}:${entry.tag ?? ""}`
    const existing = merged.get(key)
    merged.set(key, existing ? { ...existing, amount: existing.amount + entry.amount } : entry)
  }
  return [...merged.values()]
}

const tagLinkedItems = (tag: string, ...lists: LinkedModifierItem[][]) => lists.flat().map((item) => ({ ...item, tag }))

/**
 * Place un panneau de survol sous son déclencheur, ou au-dessus quand la fenêtre
 * n’a pas la place en dessous et qu’il y en a davantage au-dessus.
 */
function useFlipPlacement() {
  const anchorRef = useRef<HTMLDivElement>(null)
  const [above, setAbove] = useState(false)
  const measure = useCallback((panel: HTMLElement | null) => {
    const anchor = anchorRef.current
    if (!panel || !anchor) return
    const rect = anchor.getBoundingClientRect()
    const spaceBelow = window.innerHeight - rect.bottom
    setAbove(spaceBelow < panel.offsetHeight + 12 && rect.top > spaceBelow)
  }, [])
  return { anchorRef, above, measure }
}

type SlotToggle = { pendingSlot: string; onToggle: (slotId: string, equipped: boolean) => void }

function ModifierBadge({ amount, plain = false }: { amount: number; plain?: boolean }) {
  if (!amount) return null
  const tone = plain ? "bg-white/25 text-white" : amount < 0 ? "bg-rose-500/15 text-rose-300" : "bg-emerald-500/15 text-emerald-300"
  return <span className={`inline-flex shrink-0 items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums ${tone}`} title="Apporté par les objets équipés">{formatModifierAmount(amount)}</span>
}

/**
 * La teinte d'une case visée par un état : la couleur du premier effet en vigueur qui en a
 * une (« Folie » en rouge quand l'effet est rouge). Vide sans état coloré.
 */
function stateTint(items: LinkedModifierItem[]) {
  return items.find((entry) => entry.source === "état" && /^#[0-9a-f]{3,8}$/i.test(entry.color || ""))?.color || ""
}

function LinkedItemsPanel({ items, toggle, borderColor, total }: { items: LinkedModifierItem[]; toggle: SlotToggle; borderColor: string; total?: string }) {
  if (!items.length) return null
  return <div className="mt-2 border-t pt-2" style={{ borderColor }}>
    <p className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"><Backpack className="size-3" />{items.some((entry) => entry.source === "état") ? items.some((entry) => entry.source !== "état") ? "Objets et états liés" : "États" : "Objets liés"}</p>
    <div className="space-y-1">
      {items.map((entry) => entry.source === "état" ? <div key={`${entry.slotId}:${entry.tag ?? ""}`} className="flex items-center gap-2 rounded-lg border border-l-4 bg-background/45 px-2 py-1.5 text-xs" style={{ borderColor, borderLeftColor: entry.color || "#78716c" }}>
        <span className="min-w-0 flex-1 truncate font-medium">{entry.name}</span>
        {entry.tag && <span className="shrink-0 truncate text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">{entry.tag}</span>}
        {entry.label ? <span className="shrink-0 font-semibold tabular-nums text-sky-300">{entry.label}</span> : entry.amount !== 0 && <span className={`shrink-0 font-semibold tabular-nums ${entry.amount < 0 ? "text-rose-300" : "text-emerald-300"}`}>{formatModifierAmount(entry.amount)}</span>}
      </div> : <label key={`${entry.slotId}:${entry.tag ?? ""}`} className="flex cursor-pointer items-center gap-2 rounded-lg border bg-background/45 px-2 py-1.5 text-xs" style={{ borderColor }}>
        <Checkbox checked={entry.equipped} disabled={toggle.pendingSlot === entry.slotId} onCheckedChange={(checked) => toggle.onToggle(entry.slotId, checked === true)} aria-label={`${entry.equipped ? "Déséquiper" : "Équiper"} ${entry.name}`} />
        <span className={`min-w-0 flex-1 truncate font-medium ${entry.equipped ? "" : "text-muted-foreground"}`}>{entry.name}</span>
        {entry.tag && <span className="shrink-0 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">{entry.tag}</span>}
        <span className={`shrink-0 font-semibold tabular-nums ${entry.amount < 0 ? "text-rose-300" : "text-emerald-300"} ${entry.equipped ? "" : "opacity-40"}`}>{formatModifierAmount(entry.amount)}</span>
      </label>)}
    </div>
    {total !== undefined && <p className="mt-1.5 text-right text-[10px] text-muted-foreground">Total avec {items.some((entry) => entry.source === "état") ? "objets et états" : "objets"} : <b className="text-foreground">{total}</b></p>}
  </div>
}

/**
 * Les objets qui s'utilisent avec cette compétence (leur colonne Compétence), à équiper ou
 * déséquiper d'ici, en plus des objets liés par un modificateur.
 */
function UsageItemsPanel({ items, toggle, borderColor }: { items: UsageItem[]; toggle: SlotToggle; borderColor: string }) {
  if (!items.length) return null
  return <div className="mt-2 border-t pt-2" style={{ borderColor }}>
    <p className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"><Swords className="size-3" />Objets qui l’utilisent</p>
    <div className="space-y-1">
      {items.map((entry) => <label key={entry.slotId} className="flex cursor-pointer items-center gap-2 rounded-lg border bg-background/45 px-2 py-1.5 text-xs" style={{ borderColor }}>
        <Checkbox checked={entry.equipped} disabled={toggle.pendingSlot === entry.slotId} onCheckedChange={(checked) => toggle.onToggle(entry.slotId, checked === true)} aria-label={`${entry.equipped ? "Déséquiper" : "Équiper"} ${entry.name}`} />
        <span className={`flex size-5 shrink-0 items-center justify-center overflow-hidden rounded ${entry.equipped ? "" : "opacity-50"}`}>{/^(?:https?:\/\/|\/)/i.test(entry.image)
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={entry.image} alt="" className="size-full object-cover" />
          : <ObjectIcon icon={entry.icon} name={entry.name} type={entry.type} subtype={entry.subtype} className="size-full" emojiClassName="text-sm" fallback={<Swords className="size-3 text-muted-foreground" />} />}</span>
        <span className={`min-w-0 flex-1 truncate font-medium ${entry.equipped ? "" : "text-muted-foreground"}`}>{entry.name}</span>
      </label>)}
    </div>
  </div>
}

/** Entoure une carte non dépliable (vie, folie, caractéristique…) d’un survol listant ses objets liés. */
function ModifierHoverShell({ items, toggle, title, color, total, children }: { items: LinkedModifierItem[]; toggle: SlotToggle; title: string; color: string; total?: string; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const { anchorRef, above, measure } = useFlipPlacement()
  if (!items.length) return <>{children}</>
  return <div ref={anchorRef} className="relative h-full min-w-0" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)} onFocusCapture={() => setOpen(true)}>
    {children}
    {open && <div ref={measure} className={`absolute left-1/2 ${above ? "bottom-[calc(100%-3px)]" : "top-[calc(100%-3px)]"} z-40 w-60 -translate-x-1/2 rounded-xl border bg-popover p-3 text-left text-popover-foreground shadow-2xl`} style={{ borderColor: `${color}66` }}>
      <p className="font-display text-sm font-semibold" style={{ color }}>{title}</p>
      <LinkedItemsPanel items={items} toggle={toggle} borderColor={`${color}40`} total={total} />
    </div>}
  </div>
}

/** Les neuf colonnes d'une compétence dans la fiche, dans l'ordre de `characterSkillMetrics`. */
type SkillCells = number[]

function SkillRow({ help = "", skill, cells, characteristicCell, values, color, commit, abilities, charges, setCharges, skillModifier, characteristicModifier, successModifier, failureModifier, linkedItems, usageItems = [], tint = "", fx = [], skillRule, characteristicRule, toggle }: { /** La description de l'index (HTML), au survol du « ? ». */ help?: string; /** Les objets qui s'utilisent avec cette compétence. */ usageItems?: UsageItem[]; skill: CatalogSkill; cells: SkillCells; characteristicCell: number; values: string[]; color: GroupColor; commit: (index: number, value: string) => Promise<void>; abilities: ClassSpell[]; charges: Record<string, number>; setCharges: (spell: ClassSpell, value: number) => void; skillModifier: number; characteristicModifier: number; successModifier: number; failureModifier: number; linkedItems: LinkedModifierItem[]; /** La couleur d'un état qui vise cette compétence. */ tint?: string; /** Les FX d'un état qui vise cette compétence. */ fx?: ReturnType<typeof stateFxOf>; skillRule?: ModifierRule; characteristicRule?: ModifierRule; toggle: SlotToggle }) {
  const [open, setOpen] = useState(false)
  const shortName = skill.name
    .replace(/^Maîtrise\b/, "Maît")
    .replace(/^Résistance\b/, "Rés")
    .replace(/^Volonté(?= )/, "Vol")
    .replace(/^Connaissances?\b/, "Co")
  // La feuille calcule déjà « caractéristique + bonus », borné entre 10 et 90. Tant qu’aucun
  // objet équipé ne vise cette compétence, on réaffiche sa valeur telle quelle.
  const statModifier = skillModifier + characteristicModifier
  // « = », plancher et plafond : sur la caractéristique d'abord, puis sur la compétence.
  const ruled = hasRule(skillRule) || hasRule(characteristicRule)
  const statTotal = statModifier || ruled
    ? String(cappedSkillTotal(applyRule(applyRule((characteristicCell >= 0 ? sheetNumber(values[characteristicCell]) : 0) + characteristicModifier, characteristicRule) + sheetNumber(values[cells[0]]) + skillModifier, skillRule)))
    : values[cells[2]] || "—"
  const totals = [
    statTotal,
    totalWithModifier(values[cells[5]], successModifier, "—"),
    totalWithModifier(values[cells[8]], failureModifier, "—"),
  ]
  const metricModifiers = [statModifier, successModifier, failureModifier]
  const { anchorRef, above, measure } = useFlipPlacement()
  return <div ref={anchorRef} className="group/skill relative" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)} onFocusCapture={() => setOpen(true)}>
    <button type="button" onClick={(event) => setOpen((current) => clickKeepsOpen(event) || !current)} className={`relative grid w-full grid-cols-[minmax(0,1fr)_repeat(3,2.15rem)] items-center gap-1 border-t px-3 py-2.5 text-left text-xs transition hover:bg-white/[.035] ${open ? "bg-white/[.055]" : ""}`} style={{ borderColor: color.border, ...(tint ? { backgroundColor: `${tint}38`, boxShadow: `inset 3px 0 0 ${tint}` } : {}) }}>
      <span className={`whitespace-normal pr-1 font-medium leading-tight ${shortName.length > 24 ? "text-[10px]" : "text-[11px]"}`}>{shortName}<HelpMark title={skill.name} className="ml-1 text-muted-foreground opacity-0 hover:text-foreground group-hover/skill:opacity-100">{help && <IndexRichText html={help} />}</HelpMark></span>{totals.map((total, index) => <span key={index} className={`text-center font-semibold tabular-nums ${index === 0 ? `text-foreground ${portraitImageFxClass(fx)}` : index === 1 ? "text-emerald-300" : "text-rose-300"}`}>{total}</span>)}
      <FxOverlay fx={fx} />
    </button>
    {open && <div ref={measure} className={`absolute left-2 right-2 ${above ? "bottom-[calc(100%-2px)]" : "top-[calc(100%-2px)]"} z-30 rounded-xl border bg-popover p-3 text-popover-foreground shadow-2xl`} style={{ borderColor: color.border }}>
      <p className="mb-2 font-display text-sm font-semibold" style={{ color: color.accent }}>{shortName}</p><div className="mb-2 grid grid-cols-[1fr_3.5rem_3.5rem] gap-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"><span>Calcul</span><span>B/M</span><span>Mod.</span></div>
      {[{ label: "Stat", bonus: 0 }, { label: "Réussite critique", bonus: 3 }, { label: "Échec critique", bonus: 6 }].map((line, lineIndex) => {
        const bonusIndex = cells[line.bonus]
        const lineModifier = metricModifiers[lineIndex]
        return <div key={line.label} className="grid grid-cols-[1fr_3.5rem_3.5rem] items-center gap-2 border-t py-2 text-xs"><span>{line.label}</span><InlineEdit compact numeric singleClick label={`${skill.name} — ${line.label}`} value={values[bonusIndex]} onCommit={(value) => commit(bonusIndex, value)}><span className="rounded bg-primary/10 px-1.5 py-1 text-center font-semibold text-primary">{values[bonusIndex] || "0"}</span></InlineEdit><span className={`rounded px-1.5 py-1 text-center font-semibold ${lineModifier ? (lineModifier < 0 ? "bg-rose-500/15 text-rose-300" : "bg-emerald-500/15 text-emerald-300") : "bg-muted font-normal text-muted-foreground"}`} title="Apporté par les objets équipés et la classe">{lineModifier ? formatModifierAmount(lineModifier) : "0"}</span></div>
      })}
      <LinkedItemsPanel items={linkedItems} toggle={toggle} borderColor={color.border} total={statModifier || ruled ? statTotal : undefined} />
      <UsageItemsPanel items={usageItems} toggle={toggle} borderColor={color.border} />
      {abilities.length > 0 && <div className="mt-2 border-t pt-2" style={{ borderColor: color.border }}><p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Actifs et passifs liés</p><div className="space-y-1.5">{abilities.map((spell) => {
        const active = spell.category === "actif"
        // Le nom d'abord. Un actif montre ses charges à côté, son type passe sous la
        // description ; un passif garde son étiquette. Survoler un nom coupé l'affiche en
        // entier, par-dessus l'étiquette ou les charges.
        return <details key={spell.id} className="rounded-lg border bg-background/45 px-2.5 py-2" style={{ borderColor: color.border }}><summary className="flex cursor-pointer list-none items-center gap-2 text-xs font-semibold [&::-webkit-details-marker]:hidden"><span className="peer min-w-0 flex-1 truncate hover:whitespace-normal hover:break-words" title={spell.name}>{spell.name}</span>{active
          ? <span className="shrink-0 peer-hover:hidden"><SpellChargeStars total={spell.charges} current={charges[spell.id] ?? spell.charges ?? 0} interactive onChange={(value) => setCharges(spell, value)} accent={color.accent} /></span>
          : <span className="shrink-0 text-[9px] text-muted-foreground peer-hover:hidden">{spell.type}</span>}</summary><blockquote className="mt-2 border-l-2 pl-2 text-xs leading-5 text-muted-foreground" style={{ borderColor: color.accent }}>{spell.effect && <IndexRichText as="div" html={spell.effectHtml || spell.effect} />}{spell.description && <IndexRichText as="div" html={spell.descriptionHtml || spell.description} className="mt-1" />}{active && spell.type && <p className="mt-1.5 text-[10px] font-semibold uppercase tracking-wider" style={{ color: color.accent }}>{spell.type}</p>}</blockquote></details>
      })}</div></div>}
    </div>}
  </div>
}

/**
 * En-tête coloré d’une caractéristique. Son survol montre les seuils critiques propres à la
 * caractéristique et les objets liés, au-dessus quand la place manque en dessous.
 */
function CharacteristicHeader({ help = "", characteristic, cells, color, values, commit, statModifier, statRule, criticalModifiers, linkedItems, usageItems = [], toggle }: { /** La description de l'index (HTML), au survol du « ? ». */ help?: string; /** Les objets qui s'utilisent avec cette caractéristique. */ usageItems?: UsageItem[]; characteristic: CatalogCharacteristic; cells: { value: number; success: number; failure: number }; color: GroupColor; values: string[]; commit: (index: number, value: string) => Promise<void>; statModifier: number; statRule?: ModifierRule; criticalModifiers: Record<"success" | "failure", number>; linkedItems: LinkedModifierItem[]; toggle: SlotToggle }) {
  const { anchorRef, above, measure } = useFlipPlacement()
  const panelRef = useRef<HTMLDivElement>(null)
  const place = () => measure(panelRef.current)
  // Un état coloré qui vise la caractéristique teinte son en-tête de sa couleur.
  const tint = stateTint(linkedItems)
  const fx = stateFxOf(linkedItems)
  const total = totalWithModifier(values[cells.value], statModifier, "0", statRule)
  const changed = statModifier !== 0 || hasRule(statRule)
  return <div ref={anchorRef} onMouseEnter={place} onFocusCapture={place} className="group relative rounded-t-2xl px-4 py-3 text-white" style={{ backgroundColor: color.accent, backgroundImage: tint ? `linear-gradient(${tint}d9, ${tint}d9)` : undefined }}>
    <FxOverlay fx={fx} />
    <div className="flex items-center justify-between gap-2"><span className="flex min-w-0 items-center gap-1.5"><h3 className="truncate font-display text-lg font-semibold" title={characteristic.name}>{skillGroupTitle(characteristic.name)}</h3><HelpMark title={characteristic.name} className="text-white/70 opacity-0 hover:text-white group-hover:opacity-100">{help && <IndexRichText html={help} />}</HelpMark></span><span className="flex items-center gap-1.5"><InlineEdit numeric singleClick compact label={characteristic.name} value={values[cells.value]} onCommit={(value) => commit(cells.value, value)}><span className={`inline-block text-2xl font-bold tabular-nums ${portraitImageFxClass(fx)}`} title={changed ? `Base ${values[cells.value] || "0"} ${modifierText(statModifier, statRule)}` : undefined}>{total}</span></InlineEdit></span></div>
    <div ref={panelRef} className={`pointer-events-none absolute left-3 right-3 z-40 rounded-xl border bg-popover p-3 text-popover-foreground opacity-0 shadow-2xl transition group-hover:pointer-events-auto group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100 ${above ? "bottom-[calc(100%-2px)] -translate-y-1" : "top-[calc(100%-2px)] translate-y-1"}`} style={{ borderColor: color.border }}>
      <p className="font-display text-sm font-semibold" style={{ color: color.accent }}>{characteristic.name}</p><p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Seuils critiques</p>
      <div className="grid grid-cols-2 gap-2">{(["success", "failure"] as const).map((kind) => { const index = cells[kind]; return <div key={kind}><p className="mb-1 flex items-center justify-between gap-1 text-[10px] text-muted-foreground">{kind === "success" ? "Réussite" : "Échec"}<ModifierBadge amount={criticalModifiers[kind]} /></p><InlineEdit numeric singleClick compact label={`${characteristic.name} ${kind}`} value={values[index]} onCommit={(value) => commit(index, value)}><span className="block rounded-lg bg-muted px-2 py-1.5 text-center font-semibold tabular-nums">{values[index] || "0"}</span></InlineEdit></div> })}</div>
      {changed && <p className="mt-2 flex items-center justify-between gap-2 border-t pt-2 text-xs" style={{ borderColor: color.border }}><span className="text-muted-foreground">Base</span><InlineEdit numeric singleClick compact label={`${characteristic.name} : valeur de base`} value={values[cells.value]} onCommit={(value) => commit(cells.value, value)}><span className="rounded bg-primary/10 px-1.5 py-0.5 font-semibold tabular-nums text-primary">{values[cells.value] || "0"}</span></InlineEdit><span className="rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-emerald-300">{modifierText(statModifier, statRule)}</span></p>}
      <LinkedItemsPanel items={linkedItems} toggle={toggle} borderColor={color.border} total={total} />
      <UsageItemsPanel items={usageItems} toggle={toggle} borderColor={color.border} />
    </div>
  </div>
}

function CalculatedSecondaryCard({ fieldIndex, label, popupLabel, help = "", color: baseColor, values, commit, compact = false, modifier = 0, rule, linkedItems = [], toggle }: { fieldIndex: number; label: string; popupLabel?: string; /** Description au survol du « ? ». */ help?: string; color: string; values: string[]; commit: (index: number, value: string) => Promise<void>; compact?: boolean; modifier?: number; rule?: ModifierRule; linkedItems?: LinkedModifierItem[]; toggle: SlotToggle }) {
  const [open, setOpen] = useState(false)
  const definitionIndex = characterSecondaryCalculatedFields.findIndex((field) => field.valueIndex === fieldIndex)
  const bonusIndex = characterSecondaryCalculationValueIndex(definitionIndex, "bonus")
  const total = totalWithModifier(values[fieldIndex], modifier, "0", rule)
  const { anchorRef, above, measure } = useFlipPlacement()
  // Un état coloré qui vise cette case la teinte de sa couleur.
  const color = stateTint(linkedItems) || baseColor
  const fx = stateFxOf(linkedItems)
  return <div ref={anchorRef} className="group/help relative h-full min-w-0" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
    <button type="button" onClick={(event) => setOpen((current) => clickKeepsOpen(event) || !current)} className={`relative flex h-full w-full flex-col items-center justify-center rounded-lg text-center ${compact ? "min-h-14 px-2 py-2" : "min-h-20 px-3 py-3"}`} style={{ backgroundColor: `${color}${compact ? "24" : "12"}`, borderBottom: compact ? `2px solid ${color}66` : undefined, borderTop: compact ? undefined : `2px solid ${color}` }}><span className="whitespace-normal text-[9px] font-semibold uppercase leading-tight tracking-wide text-muted-foreground">{label}<HelpMark title={popupLabel || label} className="ml-0.5 size-3 normal-case opacity-0 hover:text-foreground group-hover/help:opacity-100">{help && <IndexRichText html={help} />}</HelpMark></span><span className={`${compact ? "mt-1 text-lg" : "mt-2 text-xl"} inline-block font-semibold tabular-nums ${portraitImageFxClass(fx)}`} style={{ color }}>{total}</span><FxOverlay fx={fx} /></button>
    {open && <div ref={measure} className={`absolute left-1/2 ${above ? "bottom-[calc(100%-3px)]" : "top-[calc(100%-3px)]"} z-40 w-56 -translate-x-1/2 rounded-xl border bg-popover p-3 shadow-2xl`} style={{ borderColor: `${color}66` }}><p className="font-display text-sm font-semibold" style={{ color }}>{popupLabel || label}</p><p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Calcul du total</p><div className="grid grid-cols-2 gap-2"><div><p className="mb-1 text-[10px] text-muted-foreground">Bonus/Malus</p><InlineEdit numeric singleClick compact label={`${popupLabel || label} bonus/malus`} value={values[bonusIndex]} onCommit={(value) => commit(bonusIndex, value)}><span className="block rounded-lg bg-primary/10 px-2 py-1.5 text-center font-semibold text-primary">{values[bonusIndex] || "0"}</span></InlineEdit></div><div><p className="mb-1 text-[10px] text-muted-foreground">Modificateur</p><span className={`block rounded-lg px-2 py-1.5 text-center font-semibold ${modifier || hasRule(rule) ? (modifier < 0 ? "bg-rose-500/15 text-rose-300" : "bg-emerald-500/15 text-emerald-300") : "bg-muted text-muted-foreground"}`} title="Apporté par les objets équipés, les états et la classe">{modifierText(modifier, rule) || "0"}</span></div></div><LinkedItemsPanel items={linkedItems} toggle={toggle} borderColor={`${color}40`} /></div>}
  </div>
}

/**
 * Un compteur (Folie, Destin, Notoriété, Moralité, secondaires ajoutées) : le total avec
 * objets et états, et au survol son calcul (valeur de base modifiable, modificateur) et ce
 * qui le change. − et + changent la valeur de base ; un état coloré teinte la carte.
 */
function CounterTile({ label, help = "", color, span, value, modifier, rule, linkedItems, toggle, onCommit }: { label: string; /** Description au survol du « ? ». */ help?: string; color: string; span: string; value: string; modifier: number; rule?: ModifierRule; linkedItems: LinkedModifierItem[]; toggle: SlotToggle; onCommit: (value: string) => Promise<void> }) {
  const [open, setOpen] = useState(false)
  const { anchorRef, above, measure } = useFlipPlacement()
  const tint = stateTint(linkedItems)
  const fx = stateFxOf(linkedItems)
  const shown = tint || color
  const numeric = sheetNumber(value || "0")
  const total = totalWithModifier(value, modifier, "0", rule)
  const changed = modifier !== 0 || hasRule(rule)
  return <div ref={anchorRef} className={`group/help relative flex min-h-20 flex-col items-center justify-center rounded-xl px-2 py-2 text-center ${span}`} style={{ backgroundColor: `${shown}${tint ? "33" : "16"}`, borderTop: `2px solid ${shown}` }} onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)} onFocusCapture={() => setOpen(true)}>
    <FxOverlay fx={fx} />
    <p className="text-[9px] font-semibold uppercase tracking-[.16em] text-muted-foreground">{label}<HelpMark title={label} className="ml-1 size-3 normal-case tracking-normal opacity-0 hover:text-foreground group-hover/help:opacity-100">{help && <IndexRichText html={help} />}</HelpMark></p>
    <div className="mt-1 inline-flex items-center gap-1">
      <button type="button" onClick={() => onCommit(String(numeric - 1))} className="flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted" aria-label={`Diminuer ${label}`}><Minus className="size-3" /></button>
      <InlineEdit numeric singleClick compact label={label} value={value} onCommit={onCommit}><span className={`inline-block min-w-7 text-center text-xl font-semibold tabular-nums ${portraitImageFxClass(fx)}`} style={changed || tint ? { color: shown } : undefined} title={changed ? `Base ${value || "0"} ${modifierText(modifier, rule)}` : undefined}>{total}</span></InlineEdit>
      <button type="button" onClick={() => onCommit(String(numeric + 1))} className="flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted" aria-label={`Augmenter ${label}`}><Plus className="size-3" /></button>
    </div>
    {open && <div ref={measure} className={`absolute left-1/2 ${above ? "bottom-[calc(100%-3px)]" : "top-[calc(100%-3px)]"} z-40 w-60 -translate-x-1/2 rounded-xl border bg-popover p-3 text-left text-popover-foreground shadow-2xl`} style={{ borderColor: `${shown}66` }}>
      <p className="font-display text-sm font-semibold" style={{ color: shown }}>{label}</p>
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Calcul du total</p>
      <div className="grid grid-cols-3 gap-2">
        <div><p className="mb-1 text-[10px] text-muted-foreground">Base</p><InlineEdit numeric singleClick compact label={`${label} : valeur de base`} value={value} onCommit={onCommit}><span className="block rounded-lg bg-primary/10 px-2 py-1.5 text-center font-semibold tabular-nums text-primary">{value || "0"}</span></InlineEdit></div>
        <div><p className="mb-1 text-[10px] text-muted-foreground">Modificateur</p><span className={`block rounded-lg px-2 py-1.5 text-center font-semibold tabular-nums ${changed ? (modifier < 0 ? "bg-rose-500/15 text-rose-300" : "bg-emerald-500/15 text-emerald-300") : "bg-muted text-muted-foreground"}`} title="Apporté par les objets équipés et les états">{modifierText(modifier, rule) || "0"}</span></div>
        <div><p className="mb-1 text-[10px] text-muted-foreground">Total</p><span className="block rounded-lg bg-muted px-2 py-1.5 text-center font-semibold tabular-nums" style={{ color: shown }}>{total}</span></div>
      </div>
      <LinkedItemsPanel items={linkedItems} toggle={toggle} borderColor={`${shown}40`} />
    </div>}
  </div>
}

function CombinedCalculatedCard({ label, groupColor, fields, values, commit, modifierFor, ruleFor, linkedFor, toggle }: { label: string; groupColor: string; fields: Array<{ index: number; label: string; shortLabel?: string; color: string; help?: string }>; values: string[]; commit: (index: number, value: string) => Promise<void>; modifierFor: (valueIndex: number) => number; ruleFor: (valueIndex: number) => ModifierRule | undefined; linkedFor: (valueIndex: number) => LinkedModifierItem[]; toggle: SlotToggle }) {
  return <div className="h-full min-h-20 rounded-xl border p-1.5 shadow-sm" style={{ backgroundColor: `${groupColor}18`, borderColor: `${groupColor}55`, borderTop: `2px solid ${groupColor}` }}>
    <p className="mb-1 text-center text-[9px] font-semibold uppercase tracking-[.18em]" style={{ color: groupColor }}>{label}</p>
    <div className="grid grid-cols-2 gap-1">
      {fields.map((field) => <CalculatedSecondaryCard compact key={field.index} fieldIndex={field.index} label={field.shortLabel || field.label} popupLabel={field.label} help={field.help} color={field.color} values={values} commit={commit} modifier={modifierFor(field.index)} rule={ruleFor(field.index)} linkedItems={linkedFor(field.index)} toggle={toggle} />)}
    </div>
  </div>
}

type MovementRole = "gratuite" | "mineure" | "majeure"
const movementLabels: Record<MovementRole, { short: string; long: string }> = {
  gratuite: { short: "Gratuite", long: "Action gratuite" },
  mineure: { short: "Mineure", long: "Action mineure" },
  majeure: { short: "Majeure", long: "Action majeure" },
}

/**
 * Une action de déplacement dans la case Déplacement. Son survol montre son calcul :
 * bonus/malus (sa valeur, modifiable), modificateur (objets, états) et total ; les
 * actions mineure et majeure s'ajoutent à l'action gratuite.
 */
function MovementCell({ role, name, help = "", color: baseColor, value, own, shown, freeTotal, modifier, rule, linkedItems, toggle, onCommit, alignEnd = false }: { /** La dernière case : son survol s'aligne sur son bord droit, sans sortir de la fenêtre. */ alignEnd?: boolean; role: MovementRole | null; name: string; help?: string; color: string; value: string; /** Son propre total (bonus/malus + modificateur). */ own: string; /** Ce que la case affiche (gratuite comprise). */ shown: string; /** Le total de l'action gratuite, ajouté aux deux autres. */ freeTotal: string | null; modifier: number; rule?: ModifierRule; linkedItems: LinkedModifierItem[]; toggle: SlotToggle; onCommit: (value: string) => Promise<void> }) {
  const [open, setOpen] = useState(false)
  const { anchorRef, above, measure } = useFlipPlacement()
  const color = stateTint(linkedItems) || baseColor
  const fx = stateFxOf(linkedItems)
  const changed = modifier !== 0 || hasRule(rule)
  const label = role ? movementLabels[role].short : name
  return <div ref={anchorRef} className="group/help relative h-full min-w-0" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)} onFocusCapture={() => setOpen(true)}>
    <button type="button" onClick={(event) => setOpen((current) => clickKeepsOpen(event) || !current)} className="relative flex h-full min-h-14 w-full flex-col items-center justify-center rounded-lg px-1 py-2 text-center" style={{ backgroundColor: `${color}24`, borderBottom: `2px solid ${color}66` }}>
      <span className="whitespace-normal text-[9px] font-semibold uppercase leading-tight tracking-wide text-muted-foreground">{label}<HelpMark title={name} className="ml-0.5 size-3 normal-case opacity-0 hover:text-foreground group-hover/help:opacity-100">{help && <IndexRichText html={help} />}</HelpMark></span>
      <span className={`mt-1 inline-block text-lg font-semibold tabular-nums ${portraitImageFxClass(fx)}`} style={{ color }}>{shown}</span>
      <FxOverlay fx={fx} />
    </button>
    {open && <div ref={measure} className={`absolute ${alignEnd ? "right-0" : "left-1/2 -translate-x-1/2"} ${above ? "bottom-[calc(100%-3px)]" : "top-[calc(100%-3px)]"} z-40 w-60 rounded-xl border bg-popover p-3 text-left text-popover-foreground shadow-2xl`} style={{ borderColor: `${color}66` }}>
      <p className="font-display text-sm font-semibold" style={{ color }}>{name}</p>
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Calcul du total</p>
      <div className="grid grid-cols-3 gap-2">
        <div><p className="mb-1 text-[10px] text-muted-foreground">Bonus/Malus</p><InlineEdit numeric singleClick compact label={`${name} : bonus/malus`} value={value} onCommit={onCommit}><span className="block rounded-lg bg-primary/10 px-2 py-1.5 text-center font-semibold tabular-nums text-primary">{value || "0"}</span></InlineEdit></div>
        <div><p className="mb-1 text-[10px] text-muted-foreground">Mod.</p><span className={`block rounded-lg px-2 py-1.5 text-center font-semibold tabular-nums ${changed ? (modifier < 0 ? "bg-rose-500/15 text-rose-300" : "bg-emerald-500/15 text-emerald-300") : "bg-muted text-muted-foreground"}`} title="Apporté par les objets équipés et les états">{modifierText(modifier, rule) || "0"}</span></div>
        <div><p className="mb-1 text-[10px] text-muted-foreground">Total</p><span className="block rounded-lg bg-muted px-2 py-1.5 text-center font-semibold tabular-nums" style={{ color }}>{own}</span></div>
      </div>
      {freeTotal !== null && <p className="mt-2 flex items-center justify-between gap-2 border-t pt-2 text-xs" style={{ borderColor: `${color}40` }}><span className="text-muted-foreground">Gratuite {freeTotal} + {role ? movementLabels[role].short.toLocaleLowerCase("fr") : "action"} {own}</span><b className="tabular-nums" style={{ color }}>{shown}</b></p>}
      <LinkedItemsPanel items={linkedItems} toggle={toggle} borderColor={`${color}40`} />
    </div>}
  </div>
}

function LifePool({ label = "Points de vie", help = "", color = "#6e9ee8", current, total, commit, modifier = 0, rule, currentModifier = 0, currentRule }: { label?: string; /** Description au survol du « ? ». */ help?: string; color?: string; current: string; total: string; commit: (index: number, value: string) => Promise<void>; modifier?: number; rule?: ModifierRule; currentModifier?: number; currentRule?: ModifierRule }) {
  const [editing, setEditing] = useState(false)
  const [expression, setExpression] = useState(current || "0")
  const [editingTotal, setEditingTotal] = useState(false)
  const [totalExpression, setTotalExpression] = useState(total || "0")
  // Ce que les états font à la vie : affiché, la base reste celle de la feuille.
  const shownCurrent = totalWithModifier(current, currentModifier, "0", currentRule)
  const shownTotal = totalWithModifier(total, modifier, "0", rule)
  const currentChanged = currentModifier !== 0 || hasRule(currentRule)
  const totalChanged = modifier !== 0 || hasRule(rule)
  const currentNumber = sheetNumber(shownCurrent || "0")
  const totalNumber = sheetNumber(shownTotal || "0")
  const healthRatio = totalNumber > 0 ? Math.max(0, Math.min(100, (currentNumber / totalNumber) * 100)) : 0
  // Une expression (« -10 », « *2 ») s'applique aussi en cliquant ailleurs, sans Entrée.
  const leaveCurrent = useCommitOnLeave(editing, expression, current || "0", (next) => commit(9, String(calculateExpression(next, sheetNumber(current || "0")))))
  const leaveTotal = useCommitOnLeave(editingTotal, totalExpression, total || "0", (next) => commit(10, String(calculateExpression(next, sheetNumber(total || "0")))))
  async function save() { if (await leaveCurrent.save()) setEditing(false) }
  async function saveTotal() { if (await leaveTotal.save()) setEditingTotal(false) }
  return <div className="group/help flex h-full min-h-20 flex-col items-center justify-between rounded-xl px-4 py-3 text-center shadow-sm" style={{ backgroundColor: `${color}16`, borderTop: `2px solid ${color}` }}><p className="text-[9px] font-semibold uppercase tracking-[.16em] text-muted-foreground">{label}<HelpMark title={label} className="ml-1 size-3 normal-case tracking-normal opacity-0 hover:text-foreground group-hover/help:opacity-100">{help && <IndexRichText html={help} />}</HelpMark></p><div className="my-auto flex flex-wrap items-center justify-center gap-2">{editing ? <div className="flex min-w-0 items-center gap-1"><Input autoFocus value={expression} onChange={(event) => setExpression(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void save(); if (event.key === "Escape") { leaveCurrent.cancel(); setEditing(false) } }} onBlur={() => void save()} className="h-8 w-24" placeholder="-10%, *2…" /><button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => void save()} className="flex size-8 items-center justify-center rounded-md text-primary hover:bg-primary/10"><Check className="size-4" /></button></div> : <button type="button" onClick={() => { setExpression(current || "0"); setEditing(true) }} className="text-2xl font-semibold tabular-nums" style={{ color }} title={currentChanged ? `Base ${current || "0"} ${modifierText(currentModifier, currentRule)} — valeur, +10, -10%, *2 ou /3` : "Valeur, +10, -10%, *2 ou /3"}>{shownCurrent}</button>}<span className="text-sm text-muted-foreground">sur</span>{editingTotal ? <div className="flex min-w-0 items-center gap-1"><Input autoFocus value={totalExpression} onChange={(event) => setTotalExpression(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void saveTotal(); if (event.key === "Escape") { leaveTotal.cancel(); setEditingTotal(false) } }} onBlur={() => void saveTotal()} className="h-8 w-24" placeholder="+10%, *2…" /><button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => void saveTotal()} className="flex size-8 items-center justify-center rounded-md text-primary hover:bg-primary/10"><Check className="size-4" /></button></div> : <button type="button" onClick={() => { setTotalExpression(total || "0"); setEditingTotal(true) }} className="text-2xl font-semibold tabular-nums opacity-80" style={{ color }} title={totalChanged ? `Base ${total || "0"} ${modifierText(modifier, rule)} — valeur, +10%, *2 ou /3` : "Valeur, +10%, *2 ou /3"}>{shownTotal}</button>}</div><div className="w-full"><div className="mb-1 flex justify-between text-[8px] font-semibold uppercase tracking-wider text-muted-foreground"><span>Actuelle</span><span>Totale</span></div><div className="h-1.5 overflow-hidden rounded-full" style={{ backgroundColor: `${color}26` }}><div className="h-full rounded-full transition-[width]" style={{ width: `${healthRatio}%`, backgroundColor: color }} /></div></div></div>
}

/**
 * Une case pas encore confirmée par le serveur : sa valeur, l'en-tête que la fiche voyait à
 * sa place (refusée si les colonnes de la feuille ont bougé entre-temps) et, pour une case
 * JSON réécrite en entier, la valeur d'où elle est partie.
 */
type PendingChange = Omit<CharacterSheetChange, "index"> & {
  /** Des cases qui vont ensemble (les bonus d'un rang et le rang noté comme obtenu) : abandonnées ensemble. */
  group?: string
}

/** Les cases JSON que la fiche réécrit en entier : sorts choisis (états, charges, choix) et onglets ajoutés. */
const wholeJsonCells = new Set([characterClassChoicesIndex, characterCustomTabsIndex])

// Les classes et sorts lus par la dernière fiche ouverte (gardés d'une fiche à l'autre).
let knownClassCatalog: { classes: ClassRecord[]; spells: ClassSpell[] } | null = null


/** L'identifiant d'un lancer d'effet d'état (pour retirer ses écritures à « Annuler »). */
let stateWriteCounter = 0
const nextStateWriteId = () => `w${Date.now().toString(36)}${(stateWriteCounter += 1).toString(36)}`
export function CharacterSheet({ initialCharacter, catalog: initialCatalog = builtinCharacterCatalog, classes, classSpells, initialInventory, loadClassCatalog = false }: { initialCharacter: CharacterSheetRecord; catalog?: CharacterCatalog; classes: ClassRecord[]; classSpells: ClassSpell[]; initialInventory?: CharacterInventoryRecord; loadClassCatalog?: boolean }) {
  const [character, setCharacter] = useState(initialCharacter)
  const [values, setValues] = useState(initialCharacter.values)
  // Les caractéristiques et compétences viennent de leur index ; leurs colonnes sont
  // retrouvées par leur en-tête (celles ajoutées à l'index sont à la fin de la feuille).
  const catalog = useCharacterCatalog(initialCatalog)
  // Le « ? » des caractéristiques et compétences : la colonne « Description » de leur index.
  const descriptions = useCatalogDescriptions()
  const headers = character.headers
  const layout = useMemo(() => characterLayout(headers?.length ? headers : characterValueHeaders), [headers])
  const groups = useMemo(() => catalogGroups(catalog), [catalog])
  const secondaries = useMemo(() => catalog.characteristics.filter((item) => item.kind === "secondaire"), [catalog])
  const modifierTargets = useMemo(() => buildItemModifierTargets(catalog, layout), [catalog, layout])
  // Les classes et sorts déjà lus sur une autre fiche s'affichent tout de suite, relus derrière.
  const [availableClasses, setAvailableClasses] = useState(() => loadClassCatalog && knownClassCatalog ? knownClassCatalog.classes : classes)
  const [availableClassSpells, setAvailableClassSpells] = useState(() => loadClassCatalog && knownClassCatalog ? knownClassCatalog.spells : classSpells)
  const [classCatalogLoading, setClassCatalogLoading] = useState(loadClassCatalog && !knownClassCatalog)
  const [classCatalogError, setClassCatalogError] = useState("")
  // « Réessayer » relance la lecture des classes (après une coupure de Google Sheets).
  const [classCatalogAttempt, setClassCatalogAttempt] = useState(0)
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
  const inventoryRef = useRef(inventory)
  useEffect(() => { inventoryRef.current = inventory }, [inventory])
  const [equipPending, setEquipPending] = useState("")

  /**
   * Enregistrement : seules les cases changées partent, dans une file (un envoi à la
   * fois). Une case reste « en attente » tant que le serveur ne l'a pas confirmée : un
   * échec (Google lent ou injoignable) est réessayé, signalé, et la case repart avec le
   * prochain enregistrement. Le joueur et le MJ sur la même fiche ne s'écrasent plus.
   */
  const pendingChanges = useRef(new Map<number, PendingChange>())
  const persistQueue = useRef(Promise.resolve())
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error" | "conflict" | "rejected" | "too-large">("idle")
  // Ce que le serveur a refusé (nom vide, image trop lourde) : dit tel quel, le reste continue.
  const [rejection, setRejection] = useState("")
  // Un portrait pas encore envoyé (Google injoignable) : « Réessayer » le renvoie.
  const failedPortrait = useRef<File | null>(null)
  // Les cases abandonnées au dernier conflit, nommées dans l'avertissement.
  const [conflictHeaders, setConflictHeaders] = useState<string[]>([])
  const inventoryEndpoint = `/api/characters/${encodeURIComponent(character.id)}/inventory`
  // Les états posés (Index des états) changent les valeurs comme des objets équipés.
  const statesCatalog = useStatesCatalog()
  const postedStates = useMemo(() => parseClassChoices(values[characterClassChoicesIndex] || "").states, [values])
  const targetOfName = useCallback((name: string) => modifierTargetIdForName(catalog, name), [catalog])
  // Spécificités de classe (jauges, formes) des classes du personnage. Les formes actives
  // changent la fiche comme des états : leurs effets passent par les mêmes modificateurs.
  const { gauges: allClassGauges, formGroups: allFormGroups, decks: allDecks, cards: allDeckCards } = useClassGauges()
  const specificClasses = useMemo(() => selectedCharacterClasses(values[2] || "", availableClasses), [availableClasses, values])
  const characterFormGroups = useMemo(() => specificClasses.flatMap((item) => formGroupsOfClass(allFormGroups, item)), [allFormGroups, specificClasses])
  const chosenForms = useMemo(() => chosenFormsOf(values[characterClassChoicesIndex] || ""), [values])
  // Les états que posent les formes actives : posés seuls, comme Coma et Mort, jamais
  // enregistrés ; ils partent quand la forme change. Un état déjà posé à la main reste le sien.
  const formStateLinks = useMemo(() => formStatesOf(characterFormGroups, chosenForms), [characterFormGroups, chosenForms])
  // Le niveau choisi par le joueur et ce que leurs effets ont écrit, rangés avec la forme.
  const formStateEntries = useMemo(() => formStateEntriesOf(values[characterClassChoicesIndex] || ""), [values])
  const formStates = useMemo<CharacterState[]>(() => formStateLinks.flatMap((link) => {
    if (postedStates.some((posted) => foldName(posted.name) === foldName(link.name))) return []
    const definition = statesCatalog.catalog.states.find((candidate) => foldName(candidate.name) === foldName(link.name))
    if (!definition) return []
    const entry = formStateEntries[link.groupId]?.[foldName(link.name)] ?? {}
    return [{ id: definition.id, name: definition.name, level: Math.min(entry.level ?? link.level, definition.levels) as 1 | 2, ...(entry.written?.length ? { written: entry.written } : {}) }]
  }), [formStateEntries, formStateLinks, postedStates, statesCatalog.catalog])
  /** Le groupe de formes qui pose cet état (nom), s'il n'est pas posé à la main. */
  const formStateGroupOf = (name: string) => formStates.some((state) => foldName(state.name) === foldName(name)) ? formStateLinks.find((link) => foldName(link.name) === foldName(name))?.groupId : undefined
  const formStateSources = useMemo(() => Object.fromEntries(formStateLinks.map((link) => [foldName(link.name), `Posé par ${link.source}`])), [formStateLinks])
  const characterGauges = useMemo(() => specificClasses.flatMap((item) => gaugesOfClass(allClassGauges, item)), [allClassGauges, specificClasses])
  const gaugeStates = useMemo(() => gaugeStatesOf(values[characterClassChoicesIndex] || ""), [values])
  /** Les valeurs de la fiche telles qu'elles s'affichent avec ces modificateurs, pour les formules. */
  const sheetFormulaValues = useCallback((index: ReturnType<typeof indexInventoryModifiers>) => {
    const targetAt = new Map(modifierTargets.filter((target) => target.valueIndex >= 0).map((target) => [target.valueIndex, target.id]))
    const shown = (cell: number) => {
      if (cell < 0) return Number.NaN
      const id = targetAt.get(cell)
      return sheetNumber(totalWithModifier(values[cell], id ? modifierTotalFor(index, id) : 0, "0", id ? modifierRuleFor(index, id) : undefined))
    }
    return formulaValues([
      ...catalog.characteristics.map((item) => [item.name, shown(layout.index(item.key))] as [string, number]),
      ...catalog.skills.map((skill) => [skill.name, shown(layout.index(skill.key, "Total de stats"))] as [string, number]),
      ["Niveau", Math.max(0, Math.trunc(Number(values[3]) || 0))],
      ["Points de vie actuels", sheetNumber(totalWithModifier(values[9], modifierTotalFor(index, CURRENT_LIFE_TARGET_ID), "0", modifierRuleFor(index, CURRENT_LIFE_TARGET_ID)))],
      ["Points de vie max", shown(10)],
    ])
  }, [catalog, layout, modifierTargets, values])
  // Objets et états posés à la main : la base sur laquelle les formes s'ajoutent.
  const postedIndex = useMemo(() => withStateModifiers(indexInventoryModifiers(inventory?.containers || []), stateContributions(statesCatalog.catalog, [...postedStates, ...formStates], targetOfName)), [formStates, inventory, postedStates, statesCatalog.catalog, targetOfName])
  const activeFormNames = useMemo(() => characterFormGroups.flatMap((group) => activeForm(group, chosenForms[group.id])?.name ?? []), [characterFormGroups, chosenForms])
  /**
   * Les jauges d'abord, les formes ensuite : pas de boucle entre les deux. Une jauge
   * « S'ajoute à » compte dans sa caractéristique (la folie temporaire est de la Folie) ;
   * un effet de forme lit la fiche avec ces ajouts (« +{Folie} * 2 » compte les deux) et la
   * valeur de chaque jauge (« +{Folie temporaire} * 2 »).
   */
  const gaugeBaseValues = useMemo(() => characterGauges.length ? sheetFormulaValues(postedIndex) : formulaValues([]), [characterGauges.length, postedIndex, sheetFormulaValues])
  const gaugeChanges = useMemo(() => gaugeContributions(characterGauges, gaugeStates, gaugeBaseValues, activeFormNames, targetOfName), [activeFormNames, characterGauges, gaugeBaseValues, gaugeStates, targetOfName])
  const formFormulaValues = useMemo(() => {
    if (!characterFormGroups.length) return formulaValues([])
    const base = sheetFormulaValues(withStateModifiers(postedIndex, gaugeChanges))
    const gaugesNow = formulaValues(characterGauges.map((gauge) => [gauge.name, resolveGauge(gauge, gaugeBaseValues, gaugeStates[gauge.id]).current]))
    return new Map([...base, ...gaugesNow])
  }, [characterFormGroups.length, characterGauges, gaugeBaseValues, gaugeChanges, gaugeStates, postedIndex, sheetFormulaValues])
  const formChanges = useMemo(() => [...gaugeChanges, ...formContributions(characterFormGroups, chosenForms, targetOfName, formFormulaValues)], [characterFormGroups, chosenForms, formFormulaValues, gaugeChanges, targetOfName])
  // Coma et Mort se posent seuls, d'après la vie (avec les états posés à la main), et partent
  // quand elle remonte. Ils ne sont pas enregistrés dans la fiche.
  const autoLife = useMemo(() => {
    const posted = withStateModifiers(postedIndex, formChanges)
    const generalId = modifierTargets.find((target) => target.valueIndex === 10)?.id ?? ""
    const state = characterLifeState(
      totalWithModifier(values[9], modifierTotalFor(posted, CURRENT_LIFE_TARGET_ID), "", modifierRuleFor(posted, CURRENT_LIFE_TARGET_ID)),
      totalWithModifier(values[10], modifierTotalFor(posted, generalId), "0", modifierRuleFor(posted, generalId)),
    )
    const named = (name: string) => statesCatalog.catalog.states.find((definition) => foldName(definition.name) === foldName(name))
    const definition = state === "dead" ? named("Mort") : state === "down" ? named("Coma") : undefined
    const auto: CharacterState[] = definition && ![...postedStates, ...formStates].some((posted) => foldName(posted.name) === foldName(definition.name)) ? [{ id: definition.id, name: definition.name, level: 1 }] : []
    // L'ancien filtre (gris, rouge) reste tant que l'état n'existe pas ou n'a aucun effet.
    const styledByState = Boolean(definition && definition.effects[0].length > 0)
    return { state, auto, styledByState }
  }, [formChanges, formStates, modifierTargets, postedIndex, postedStates, statesCatalog.catalog, values])
  const characterStates = useMemo(() => [...postedStates, ...formStates, ...autoLife.auto], [autoLife.auto, formStates, postedStates])
  const stateChanges = useMemo(() => stateContributions(statesCatalog.catalog, characterStates, targetOfName), [characterStates, statesCatalog.catalog, targetOfName])
  const modifierIndex = useMemo(() => withStateModifiers(indexInventoryModifiers(inventory?.containers || []), [...stateChanges, ...formChanges]), [formChanges, inventory, stateChanges])
  // Les objets rangés par la compétence qu'ils utilisent (colonne Compétence de chaque exemplaire).
  const itemUsage = useMemo(() => indexItemUsage(inventory?.containers || []), [inventory])
  const portrait = useMemo(() => portraitLayers(statesCatalog.catalog, characterStates), [characterStates, statesCatalog.catalog])
  const modifiersByValueIndex = useMemo(() => {
    const map = new Map<number, { total: number; rule?: ModifierRule; items: LinkedModifierItem[] }>()
    for (const target of modifierTargets) {
      if (target.valueIndex < 0) continue
      map.set(target.valueIndex, { total: modifierTotalFor(modifierIndex, target.id), rule: modifierRuleFor(modifierIndex, target.id), items: linkedItemsFor(modifierIndex, target.id) })
    }
    return map
  }, [modifierIndex, modifierTargets])
  const modifierForValue = (valueIndex: number) => modifiersByValueIndex.get(valueIndex)?.total || 0
  const ruleForValue = (valueIndex: number) => modifiersByValueIndex.get(valueIndex)?.rule
  // La vie actuelle : un état peut la borner (« ≥1 » : plus de dégâts létaux) ou la changer.
  const currentLifeRule = modifierRuleFor(modifierIndex, CURRENT_LIFE_TARGET_ID)
  const currentLifeModifier = modifierTotalFor(modifierIndex, CURRENT_LIFE_TARGET_ID)
  const currentLifeItems = linkedItemsFor(modifierIndex, CURRENT_LIFE_TARGET_ID)
  const linkedForValue = (valueIndex: number) => modifiersByValueIndex.get(valueIndex)?.items || []

  async function setSlotEquipped(slotId: string, equipped: boolean) {
    if (equipped) playItemEquipped()
    else playItemUnequipped()
    // La case change tout de suite (et les totaux avec) ; un refus la remet comme avant.
    const setEquipped = (value: boolean) => setInventory((current) => current && { ...current, containers: current.containers.map((container) => ({ ...container, slots: container.slots.map((slot) => slot.id === slotId ? { ...slot, equipped: value } : slot) })) })
    setEquipped(equipped)
    setEquipPending(slotId)
    try {
      const response = await fetch(inventoryEndpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "set-equipped", slotId, equipped }) })
      const payload = (await response.json().catch(() => ({}))) as { inventory?: CharacterInventoryRecord }
      if (response.ok && payload.inventory) setInventory((current) => ({ ...payload.inventory!, items: payload.inventory!.items.length ? payload.inventory!.items : current?.items || [] }))
      else setEquipped(!equipped)
    } catch {
      setEquipped(!equipped)
    } finally {
      setEquipPending((current) => current === slotId ? "" : current)
    }
  }
  const slotToggle: SlotToggle = { pendingSlot: equipPending, onToggle: (slotId, equipped) => void setSlotEquipped(slotId, equipped) }

  // Les sons de la fiche, chargés d'avance : le premier ne part pas en retard.
  useEffect(() => { preloadSounds(["levelup", "choixsort", "equiperitem", "desequiperitem", "notifrecevoirobjet"]) }, [])

  // Toujours la dernière version de la fiche : deux champs quittés coup sur coup
  // (clic ailleurs, survol refermé) partent chacun de la précédente, sans l'effacer.
  const latestValues = useRef(values)
  useEffect(() => { latestValues.current = values }, [values])
  // La dernière fiche confirmée par le serveur : chaque case part avec l'en-tête vu à sa place,
  // et une case JSON avec la valeur d'où elle est partie.
  const serverSheet = useRef({ headers: initialCharacter.headers, values: initialCharacter.values })

  /** La fiche du serveur, avec par-dessus les cases pas encore confirmées. */
  function applyServer(next: CharacterSheetRecord) {
    serverSheet.current = { headers: next.headers, values: next.values }
    const merged = next.values.map((cell, index) => pendingChanges.current.get(index)?.value ?? cell)
    latestValues.current = merged
    setCharacter(next)
    setValues(merged)
  }

  /** Les cases refusées par le serveur sont oubliées : la fiche reprend ce qu'il a confirmé. */
  function dropPending(indexes: Iterable<number>) {
    for (const index of indexes) pendingChanges.current.delete(index)
    const server = serverSheet.current.values
    const merged = latestValues.current.map((cell, index) => pendingChanges.current.get(index)?.value ?? server[index] ?? cell)
    latestValues.current = merged
    setValues(merged)
  }

  function reject(message: string) {
    setRejection(message)
    setSaveState("rejected")
  }

  function flush(file?: File) {
    const run = persistQueue.current.then(async () => {
      const portrait = file ?? failedPortrait.current ?? undefined
      if (!pendingChanges.current.size && !portrait) {
        setSaveState((state) => state === "saving" ? "idle" : state)
        return
      }
      const batch = new Map(pendingChanges.current)
      // Le groupe reste dans la fiche : seules la place, l'en-tête et la valeur partent.
      const changes = [...batch].map(([index, change]) => ({ index, header: change.header, value: change.value, ...(change.before !== undefined ? { before: change.before } : {}) }))
      const delays = [800, 2500, 6000]
      for (let attempt = 0; ; attempt += 1) {
        try {
          let response: Response
          if (portrait) {
            const form = new FormData(); form.append("portrait", portrait); form.append("changes", JSON.stringify(changes))
            response = await fetch(`/api/characters/${encodeURIComponent(character.id)}`, { method: "PATCH", body: form })
          } else {
            response = await fetch(`/api/characters/${encodeURIComponent(character.id)}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ changes }) })
          }
          const payload = (await response.json().catch(() => ({}))) as { character?: CharacterSheetRecord; error?: string; rejected?: string }
          if (response.status === 400 || response.status === 403 || response.status === 404) {
            // Refusé, pas en panne : réessayer ne changerait rien, et bloquerait tout ce qui suit.
            // Seul ce qui est refusé est abandonné ; les autres cases repartent seules.
            // Un portrait parti avec un nom refusé repart avec le reste.
            failedPortrait.current = payload.rejected === "name" && portrait ? portrait : null
            if (payload.rejected === "name") dropPending([0])
            else if (payload.rejected !== "portrait") dropPending(batch.keys())
            reject(payload.error || "Cette modification a été refusée.")
            if ((pendingChanges.current.size || failedPortrait.current) && (payload.rejected === "name" || payload.rejected === "portrait")) void flush()
            return
          }
          if (response.status === 409) {
            // La fiche a changé ailleurs entre-temps (colonne déplacée, case JSON réécrite par un
            // autre) : rien n'a été écrit. Seules les cases touchées par ce changement sont
            // abandonnées, la fiche relue s'affiche ; les autres cases repartent dessus.
            const reread = payload.character
            const dropped = portrait ? ["Portrait"] : []
            for (const [index, pending] of pendingChanges.current) {
              const moved = !reread || (reread.headers[index] ?? "") !== pending.header
              const overwritten = pending.before !== undefined && (reread?.values[index] ?? "") !== pending.before
              if (!moved && !overwritten) continue
              dropped.push(pending.header.replace(/ JSON$/, ""))
              pendingChanges.current.delete(index)
              // Les bonus d'un rang ne partent pas sans le rang noté comme obtenu : ils seraient
              // ajoutés de nouveau quand la fenêtre le reproposerait.
              if (pending.group) {
                for (const [other, change] of pendingChanges.current) {
                  if (change.group !== pending.group) continue
                  dropped.push(change.header.replace(/ JSON$/, ""))
                  pendingChanges.current.delete(other)
                }
              }
            }
            failedPortrait.current = null
            if (reread) applyServer(reread)
            setConflictHeaders([...new Set(dropped)])
            setSaveState("conflict")
            if (pendingChanges.current.size) void flush()
            return
          }
          if (!response.ok || !payload.character) throw new Error(payload.error || "SAVE_FAILED")
          for (const [index, change] of batch) {
            const pending = pendingChanges.current.get(index)
            if (pending?.value === change.value) pendingChanges.current.delete(index)
            // Une case JSON changée de nouveau pendant l'envoi part maintenant de ce qui vient d'être écrit.
            else if (pending?.before !== undefined) pending.before = change.value
          }
          if (portrait) failedPortrait.current = null
          applyServer(payload.character)
          // L'avertissement d'un conflit reste affiché tant que rien de nouveau n'est saisi.
          const stillPending = pendingChanges.current.size > 0
          setSaveState((state) => stillPending ? "saving" : state === "conflict" || state === "rejected" ? state : "saved")
          return
        } catch {
          if (attempt >= delays.length) {
            if (portrait) failedPortrait.current = portrait
            setSaveState("error")
            return
          }
          await new Promise((resolve) => window.setTimeout(resolve, delays[attempt]))
        }
      }
    })
    persistQueue.current = run.catch(() => {})
    return run
  }

  async function commit(index: number, value: string, group?: string) {
    // Un plancher ou un plafond sur la vie actuelle (« ≥1 » : plus de dégâts létaux) vaut
    // aussi pour ce qui est enregistré : tant que l'état est posé, la vie n'y descend pas.
    if (index === 9 && (currentLifeRule?.min !== undefined || currentLifeRule?.max !== undefined)) {
      const typed = Number.parseFloat(String(value).replace(",", "."))
      if (Number.isFinite(typed)) value = String(applyRule(typed, { min: currentLifeRule.min, max: currentLifeRule.max }))
    }
    const next = latestValues.current.map((cell, cellIndex) => cellIndex === index ? value : cell)
    latestValues.current = next
    setValues(next)
    const previous = pendingChanges.current.get(index)
    const server = serverSheet.current
    pendingChanges.current.set(index, {
      value,
      header: (server.headers.length ? server.headers : characterValueHeaders)[index] ?? "",
      // Une case JSON part de la valeur confirmée (ou de celle d'où partait sa modification encore en attente).
      ...(wholeJsonCells.has(index) ? { before: previous?.before ?? server.values[index] ?? "" } : {}),
      ...(group ? { group } : {}),
    })
    setSaveState("saving")
    // La valeur est déjà affichée : le champ se referme sans attendre Google (jusqu'à 9 s
    // quand il est lent). L'envoi continue derrière, suivi par « Enregistrement… ».
    void flush()
  }

  async function changePortrait(file?: File) {
    if (!file) return
    setPortraitPending(true); await flush(file); setPortraitPending(false)
  }

  // Quitter la page avec des cases pas encore enregistrées : le navigateur prévient.
  useEffect(() => {
    function warn(event: BeforeUnloadEvent) {
      if (!pendingChanges.current.size) return
      event.preventDefault()
      event.returnValue = ""
    }
    window.addEventListener("beforeunload", warn)
    return () => window.removeEventListener("beforeunload", warn)
  }, [])
  useEffect(() => {
    if (saveState !== "saved") return
    const timer = window.setTimeout(() => setSaveState((current) => current === "saved" ? "idle" : current), 1800)
    return () => window.clearTimeout(timer)
  }, [saveState])

  const classOptions = availableClasses.map((item) => ({ value: item.name, label: item.name }))
  const socialClasses = ["Errant·e", "Serf·ve", "Vilain·e", "Tenancier·ère", "Membre du clergé", "Noble"]
  const alignments = ["Bon·ne", "Neutre", "Mauvais·e"]
  const activeTitle = parseListCell(values[35]).selected
  const campaignAccent = character.campaigns[0]?.accentColor || "#927640"
  const customTabs = parseCharacterTabs(values[characterCustomTabsIndex] || "")
  const characterTabs = [...baseCharacterTabs, ...customTabs]
  // Les sorts de classe s'arrêtent au rang 20 ; les bonus de rang continuent au-delà.
  const characterLevel = Math.max(0, Math.trunc(Number(values[3]) || 0))
  const currentLevel = Math.min(20, characterLevel)
  const characterClassValue = values[2] || ""
  const assignedClasses = useMemo(() => selectedCharacterClasses(characterClassValue, availableClasses), [characterClassValue, availableClasses])
  const classChoicesValue = values[characterClassChoicesIndex] || ""
  const classChoiceState = parseClassChoices(classChoicesValue)

  // Spécificités de classe : les jauges des classes du personnage. Une formule lit les
  // valeurs de la fiche telles qu'elles s'affichent (objets et états compris).
  // Les jauges affichées lisent la fiche avec tout : objets, états et formes actives.
  const gaugeValues = useMemo(() => characterGauges.length ? sheetFormulaValues(modifierIndex) : formulaValues([]), [characterGauges.length, modifierIndex, sheetFormulaValues])
  const resolvedGauges = useMemo(() => characterGauges.map((gauge) => resolveGauge(gauge, gaugeValues, gaugeStates[gauge.id])), [characterGauges, gaugeStates, gaugeValues])
  // Ce que le joueur change part de la dernière version de la case : rien d'autre n'y est touché.
  const setGaugeState = (gaugeId: string, patch: Parameters<typeof withGaugeState>[2]) => void commit(characterClassChoicesIndex, withGaugeState(latestValues.current[characterClassChoicesIndex] || "", gaugeId, patch))
  const gaugeView = (resolved: ResolvedGauge, compact = false) => <ClassGaugeView key={resolved.gauge.id} resolved={resolved} compact={compact}
    onCurrent={(value) => setGaugeState(resolved.gauge.id, { current: value })}
    onMax={(value) => setGaugeState(resolved.gauge.id, { max: value })}
    onReset={() => setGaugeState(resolved.gauge.id, { current: undefined })} />
  // Une jauge liée à des formes ne s'affiche que dans celles-ci.
  const gaugesAt = (placement: ClassGauge["placement"]) => resolvedGauges.filter((resolved) => resolved.gauge.placement === placement && gaugeVisibleIn(resolved.gauge, activeFormNames))
  /** Changer de forme : les jauges liées à la forme quittée (et pas à la nouvelle) reviennent à leur départ si elles le demandent. */
  function chooseForm(group: ClassFormGroup, form: ClassForm) {
    const previous = activeForm(group, chosenForms[group.id])
    const reset = characterGauges.filter((gauge) => gauge.resetOnLeave && previous && gaugeVisibleIn(gauge, [previous.name]) && !gaugeVisibleIn(gauge, [form.name])).map((gauge) => gauge.id)
    // Les états que la forme quittée posait partent : ce que leurs effets ont écrit est
    // défait (« Retiré en sortant de l'état »), sauf s'ils sont aussi posés par la nouvelle.
    const staying = new Set(form.states.map((state) => foldName(state.name)))
    const leaving = formStates.filter((state) => !staying.has(foldName(state.name)) && formStateLinks.some((link) => link.groupId === group.id && foldName(link.name) === foldName(state.name)))
    for (const { cell, delta } of writesToRevert(statesCatalog.catalog, leaving)) {
      void commit(cell, String(Math.round((sheetNumber(latestValues.current[cell] ?? "") - delta) * 100) / 100))
    }
    void commit(characterClassChoicesIndex, withChosenForm(latestValues.current[characterClassChoicesIndex] || "", group.id, form.id, reset, form.states.map((state) => state.name)))
  }
  /** Le niveau d'un état posé par une forme, choisi par le joueur ; false pour Coma et Mort (figés). */
  function setFormStateLevel(state: CharacterState, level: 1 | 2) {
    const groupId = formStateGroupOf(state.name)
    if (!groupId) return false
    void commit(characterClassChoicesIndex, withFormStateEntry(latestValues.current[characterClassChoicesIndex] || "", groupId, state.name, (entry) => ({ ...entry, level })))
    return true
  }
  // Les decks des classes du personnage, avec leurs cartes (onglet « Cartes »).
  const characterDecks = useMemo(() => specificClasses.flatMap((item) => decksOfClass(allDecks, item).map((deck) => ({ deck, cards: cardsOfClass(allDeckCards, item.name) }))), [allDeckCards, allDecks, specificClasses])
  const deckStates = useMemo(() => deckStatesOf(values[characterClassChoicesIndex] || ""), [values])
  /** Une carte déplacée : la case des sorts choisis repart de sa dernière version. */
  const commitRef = useRef(commit)
  useEffect(() => { commitRef.current = commit })
  const setDeckState = useCallback((deckId: string, state: DeckState) => {
    void commitRef.current(characterClassChoicesIndex, withDeckState(latestValues.current[characterClassChoicesIndex] || "", deckId, state))
  }, [])
  const decksAt = (placement: ClassGauge["placement"]) => characterDecks.filter(({ deck }) => deck.placement === placement).map(({ deck, cards }) => <ClassDeckPanel key={deck.id} deck={deck} cards={cards} state={deckStates[deck.id] ?? { hand: [], discard: [], removed: [] }} onChange={(state) => setDeckState(deck.id, state)} />)
  const formsAt = (placement: ClassGauge["placement"], compact = false) => characterFormGroups.filter((group) => group.placement === placement).map((group) => <ClassFormSwitcher key={group.id} group={group} chosen={chosenForms[group.id]} compact={compact} values={formFormulaValues} onChoose={(form) => chooseForm(group, form)} />)
  // Recomputing this per keystroke was the most expensive step in the render (it
  // scans every known spell against every skill row via linkedAbilities below).
  const knownClassSpells = useMemo(
    () => knownSpellsForCharacter(assignedClasses, availableClassSpells, currentLevel, classChoicesValue),
    [assignedClasses, availableClassSpells, currentLevel, classChoicesValue],
  )

  // Un rang atteint dont le sort n'est pas encore choisi : pastille sur l'onglet Sorts.
  // Des objets reçus pas encore survolés : la même pastille discrète sur l'onglet Inventaire.
  const newSlots = useNewSlots(character.id)
  const hasNewItems = Boolean(inventory?.containers.some((container) => container.slots.some((slot) => slot.item && newSlots.isNew(slot.id))))
  // Le passage de rang : les sorts à choisir et les bonus de rang à obtenir, rang par rang.
  const { bonuses: rankBonuses, loaded: rankBonusesLoaded } = useRankBonuses()
  const pendingSteps = useMemo(
    () => pendingRankSteps(assignedClasses, availableClassSpells, characterLevel, classChoicesValue, rankBonuses),
    [assignedClasses, availableClassSpells, characterLevel, classChoicesValue, rankBonuses],
  )
  const pendingChoiceCount = pendingSteps.length
  const currentChoice = pendingSteps[0]
  // La dernière proposition reste affichée le temps que la fenêtre se referme (après le
  // dernier choix, il n'y en a plus) : elle ne disparaît plus d'un coup.
  const [shownChoice, setShownChoice] = useState(currentChoice)
  if (currentChoice && currentChoice !== shownChoice) setShownChoice(currentChoice)

  // « Nouveau sort » : la fenêtre s'ouvre d'elle-même au passage de niveau et quand un sort
  // choisi à un rang est retiré, quel que soit l'onglet affiché. « Choisir plus tard » la
  // ferme ; l'emplacement brillant de l'onglet Sorts la rouvre.
  const [spellChoiceOpen, setSpellChoiceOpen] = useState(false)
  const [spellChoiceWanted, setSpellChoiceWanted] = useState(false)
  useEffect(() => {
    if (!spellChoiceWanted || classCatalogLoading || !rankBonusesLoaded) return
    const timer = window.setTimeout(() => {
      setSpellChoiceWanted(false)
      if (currentChoice) setSpellChoiceOpen(true)
    }, 0)
    return () => window.clearTimeout(timer)
  }, [classCatalogLoading, currentChoice, rankBonusesLoaded, spellChoiceWanted])
  // Une descente de niveau qui retirerait des sorts ou des bonus attend d'être confirmée.
  const [levelDrop, setLevelDrop] = useState<{ value: string; level: number; loss: RankLoss } | null>(null)
  function commitLevel(typed: string) {
    // Un niveau est un entier positif : « -1 » devient 0, « 3,5 » devient 3 (vide reste vide).
    const nextLevel = Math.max(0, Math.trunc(sheetNumber(typed) || 0))
    const value = typed.trim() ? String(nextLevel) : ""
    if (nextLevel < characterLevel) {
      const loss = rankLossOf(latestValues.current[characterClassChoicesIndex] || "", nextLevel)
      if (loss.ranks.length) { setLevelDrop({ value, level: nextLevel, loss }); return Promise.resolve() }
      const choices = latestValues.current[characterClassChoicesIndex] || ""
      const dropped = dropRanksAbove(choices, nextLevel)
      if (dropped !== choices) void commit(characterClassChoicesIndex, dropped)
      return commit(3, value)
    }
    if (nextLevel > characterLevel) {
      setSpellChoiceWanted(true)
    }
    return commit(3, value)
  }

  // Les caractéristiques principales, entre lesquelles répartir un bonus « Caractéristique ».
  const principalCharacteristics = useMemo(() => catalog.characteristics.filter((item) => item.kind === "principale").map((item, position) => ({ key: item.key, name: item.name, color: groupColor(item, position).accent })), [catalog])
  const movementItems = useMemo(() => catalog.characteristics.filter((item) => item.kind === "deplacement"), [catalog])
  const freeMovement = movementItems.find((item) => movementRole(item) === "gratuite") ?? movementItems[0]
  /** La case où un bonus de rang s'ajoute : le bonus/malus de sa cible (sa valeur de base s'il n'en a pas). */
  function rankBonusCell(target: string) {
    if (isMovementTarget(target)) return freeMovement ? layout.index(freeMovement.key) : -1
    const targetId = targetOfName(target)
    return targetId ? writableIndexFor(targetId) : -1
  }
  function addToCell(index: number, amount: number, group: string) {
    const next = Math.round((sheetNumber(latestValues.current[index] ?? "") + amount) * 100) / 100
    void commit(index, String(next), group)
  }
  /**
   * Descend au niveau confirmé : les bonus des rangs perdus sont retirés de leurs cases (là
   * où ils avaient été ajoutés), leurs sorts choisis et sorts sur mesure oubliés. En reprenant
   * ces rangs, la fenêtre de passage de rang repropose tout.
   */
  function confirmLevelDrop() {
    const drop = levelDrop
    if (!drop) return
    setLevelDrop(null)
    // Bonus retirés, rangs oubliés et niveau : enregistrés ensemble, ou pas du tout.
    const group = `niveau-${drop.level}-${crypto.randomUUID()}`
    for (const { taken } of drop.loss.bonuses) {
      for (const entry of taken.applied) {
        const index = rankBonusCell(entry.target)
        if (index >= 0 && entry.amount) addToCell(index, -entry.amount, group)
      }
    }
    void commit(characterClassChoicesIndex, dropRanksAbove(latestValues.current[characterClassChoicesIndex] || "", drop.level), group)
    void commit(3, String(drop.level), group)
  }

  /**
   * Le passage d'un rang : le sort choisi, puis les bonus gardés, ajoutés au bonus/malus de
   * leur cible (jamais au modificateur, réservé à ce qui est temporaire), et le sort sur
   * mesure ajouté aux sorts de la fiche. Le rang est noté comme obtenu : rien n'est ajouté deux fois.
   */
  function chooseSpell(spell: ClassSpell | null, selection: RankBonusSelection | null) {
    const step = currentChoice
    if (!step) return
    let choices = latestValues.current[characterClassChoicesIndex] || ""
    // Les bonus et le rang noté comme obtenu : enregistrés ensemble, ou pas du tout.
    const group = `rang-${step.rank}-${crypto.randomUUID()}`
    if (spell && step.choice) {
      markNewSlots(newSpellsKey(character.id), [spell.id])
      choices = chooseClassSpell(choices, step.choice.classId, step.choice.rank, spell.id)
    }
    if (step.bonus && selection?.manual) {
      // Déjà reportés à la main : le rang est noté comme obtenu, rien n'est ajouté.
      choices = takeRankBonus(choices, step.rank, { applied: [], manual: true })
    } else if (step.bonus && selection) {
      const applied: RankBonusTaken["applied"] = []
      for (const entry of step.bonus.bonuses) {
        if (!selection.slots.includes(entry.slot)) continue
        if (isAnyCharacteristicTarget(entry.target)) {
          const sign = entry.amount < 0 ? -1 : 1
          for (const [key, points] of Object.entries(selection.spread[entry.slot] ?? {})) {
            const index = layout.index(key)
            if (!points || index < 0) continue
            addToCell(index, sign * points, group)
            applied.push({ target: catalog.characteristics.find((item) => item.key === key)?.name ?? key, amount: sign * points })
          }
          continue
        }
        const index = rankBonusCell(entry.target)
        if (index < 0 || !entry.amount) continue
        addToCell(index, entry.amount, group)
        applied.push({ target: entry.target, amount: entry.amount })
      }
      if (selection.spell) markNewSlots(newSpellsKey(character.id), [selection.spell.id])
      choices = takeRankBonus(choices, step.rank, { applied, ...(selection.spell ? { spell: selection.spell.id } : {}) })
    }
    if (pendingChoiceCount <= 1) setSpellChoiceOpen(false)
    return commit(characterClassChoicesIndex, choices, group)
  }

  // Les sorts de chaque compétence, calculés une fois par liste de sorts (et non à chaque
  // rendu de chaque ligne) : la même liste revient tant que rien n'a changé.
  const abilitiesBySkill = useMemo(() => {
    const fold = (text: string) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("fr")
    const spells = knownClassSpells.filter((spell) => spell.category !== "bonus").map((spell) => ({ spell, skills: spell.skills.map(fold) }))
    const map = new Map<string, ClassSpell[]>()
    for (const skill of catalog.skills) {
      const normalized = fold(skill.name)
      map.set(skill.name, spells.filter((entry) => entry.skills.some((candidate) => candidate === normalized || candidate.includes(normalized) || normalized.includes(candidate))).map((entry) => entry.spell))
    }
    return map
  }, [catalog.skills, knownClassSpells])
  const linkedAbilities = (skillName: string) => abilitiesBySkill.get(skillName) ?? []

  /**
   * La case où un effet lancé écrit : la vie actuelle, le bonus d'une compétence ou d'une
   * carte calculée (jamais un total calculé par la feuille), sinon la valeur de base.
   */
  function writableIndexFor(targetId: string) {
    if (targetId === CURRENT_LIFE_TARGET_ID) return 9
    if (targetId.startsWith("comp:")) return layout.index(targetId.slice(5), characterSkillMetrics[0])
    const target = modifierTargets.find((candidate) => candidate.id === targetId)
    if (!target || target.valueIndex < 0 || target.kind === "critique") return -1
    const calculated = characterSecondaryCalculatedFields.findIndex((field) => field.valueIndex === target.valueIndex)
    return calculated >= 0 ? characterSecondaryCalculationValueIndex(calculated, "bonus") : target.valueIndex
  }

  /**
   * Lance un effet d'état depuis la fiche : le jet (« 1d20 16-20 »), puis, s'il réussit (ou
   * sans jet), le changement de valeur, dés compris (« -1d20-20 »). Contrairement aux
   * modificateurs, le résultat est écrit dans la fiche : ce sont des dégâts. « Annuler »
   * remet les valeurs d'avant.
   */
  function rollStateEffect(effect: StateEffect, state?: CharacterState): StateRollOutcome {
    const lines: string[] = []
    let hit = true
    try {
      if (effect.roll) {
        const rolled = rollDiceExpression(effect.roll.dice)
        hit = rollHits(rolled.total, effect.roll.range)
        lines.push(`${effect.roll.dice} → ${rolled.total}${effect.roll.range ? ` (${rangeLabel(effect.roll.range)}) : ${hit ? "réussi" : "raté"}` : ""}`)
      }
      const operation = effect.operation
      const changes: Array<{ index: number; before: string; label: string; delta: number }> = []
      if (hit && operation) {
        let amount = operation.kind === "add" ? operation.amount : 0
        if (operation.kind === "roll") {
          // Le signe tout devant vaut pour le total : « -1d20+20 » retire (1d20+20).
          const { sign, dice } = signedDice(operation.expression)
          const rolled = rollDiceExpression(dice)
          amount = sign * rolled.total
          lines.push(`${operation.expression} : ${rolled.detail}${/^\d*d\d+$/i.test(dice) ? "" : ` → ${dice} = ${rolled.total}`} → ${amount > 0 ? "+" : ""}${amount}`)
        }
        for (const name of effect.targets) {
          const targetId = targetOfName(name)
          const index = targetId ? writableIndexFor(targetId) : -1
          if (index < 0) continue
          const before = latestValues.current[index] ?? ""
          const base = sheetNumber(before)
          let after = operation.kind === "set" ? operation.value : operation.kind === "min" ? Math.max(base, operation.value) : operation.kind === "max" ? Math.min(base, operation.value) : base + amount
          // Le plancher de la vie actuelle (« ≥1 ») vaut aussi pour un lancer.
          if (index === 9) after = applyRule(after, { min: currentLifeRule?.min, max: currentLifeRule?.max })
          const written = Math.round(after * 100) / 100
          changes.push({ index, before, label: `${name} ${base} → ${written}`, delta: Math.round((written - base) * 100) / 100 })
          void commit(index, String(written))
        }
      }
      // Rien n'a été écrit : on dit pourquoi plutôt que de laisser croire que ça a marché.
      if (hit && !operation && effect.roll && !effect.roll.range) {
        const damage = `-${effect.roll.dice.replace(/^[+-]/, "")}`
        lines.push(`Rien n’est appliqué : « Jet » est la condition et « Changement de valeur » est vide. Pour des dégâts, écrire ${damage} dans « Changement de valeur » et vider « Jet ».`)
      } else if (hit && operation && !changes.length) {
        lines.push(effect.targets.length ? `Rien n’est appliqué : « ${effect.targets.join(", ")} » n’est pas une valeur que la fiche peut écrire.` : "Rien n’est appliqué : l’effet n’a pas de cible.")
      }
      // Ce que l'état a écrit est noté avec lui : il le retire en partant (« Retiré en sortant de l'état »).
      const writeId = nextStateWriteId()
      const writes: StateWrite[] = changes.flatMap((change) => change.delta ? [{ id: writeId, effect: effect.name, cell: change.index, delta: change.delta }] : [])
      // Un état posé par une forme range ses écritures avec la forme : défaites en la quittant.
      const formGroup = state ? formStateGroupOf(state.name) : undefined
      const recordWrites = (add: boolean) => {
        if (!state || !writes.length) return
        if (formGroup) void commit(characterClassChoicesIndex, withFormStateEntry(latestValues.current[characterClassChoicesIndex] || "", formGroup, state.name, (entry) => ({ ...entry, written: add ? [...(entry.written ?? []), ...writes].slice(-80) : (entry.written ?? []).filter((write) => write.id !== writeId) })))
        else commitStates(add ? withStateWrites(statesNow(), state.name, writes) : withoutStateWrites(statesNow(), writeId))
      }
      recordWrites(true)
      return { hit, lines: [...lines, ...changes.map((change) => change.label)], undo: changes.length ? () => {
        for (const change of changes) void commit(change.index, change.before)
        recordWrites(false)
      } : undefined }
    } catch {
      return { hit: false, lines: ["Ces dés n’ont pas pu être lancés : vérifier l’écriture dans l’Index des états."] }
    }
  }

  /** Les états posés tels qu'enregistrés à l'instant (avec ce que chacun a écrit). */
  const statesNow = () => parseClassChoices(latestValues.current[characterClassChoicesIndex] || "").states
  function commitStates(next: CharacterState[]) {
    void commit(characterClassChoicesIndex, JSON.stringify({ ...parseClassChoices(latestValues.current[characterClassChoicesIndex] || ""), states: next }))
  }

  /**
   * Les états changés depuis la fiche. Un état retiré emporte ce que ses effets ont écrit
   * (dés, effet redéclenché) quand « Retiré en sortant de l'état » est coché : les dégâts
   * sur la vie actuelle, décochés, restent.
   */
  function updateStates(next: CharacterState[]) {
    const previous = statesNow()
    const kept = new Set(next.map((state) => foldName(state.name)))
    for (const { cell, delta } of writesToRevert(statesCatalog.catalog, previous.filter((state) => !kept.has(foldName(state.name))))) {
      void commit(cell, String(Math.round((sheetNumber(latestValues.current[cell] ?? "") - delta) * 100) / 100))
    }
    // Ce qui a été écrit depuis le dernier affichage reste noté sur les états gardés.
    const writtenOf = new Map(previous.map((state) => [foldName(state.name), state.written]))
    commitStates(next.map((state) => {
      const written = writtenOf.get(foldName(state.name))
      return written?.length ? { ...state, written } : state
    }))
  }

  function updateSpellCharges(spell: ClassSpell, count: number) {
    void commit(characterClassChoicesIndex, JSON.stringify({ ...classChoiceState, charges: { ...classChoiceState.charges, [spell.id]: Math.max(0, Math.min(spell.charges ?? 0, count)) } }))
  }

  // Les objets reçus par ce personnage pendant qu'on n'était pas sur sa fiche (hors ligne,
  // en vue MJ, sur un autre personnage) : annoncés à l'ouverture, avec leur pastille.
  useEffect(() => {
    let alive = true
    let running = false
    async function check() {
      if (running || document.visibilityState !== "visible") return
      running = true
      try {
        const response = await fetch(`/api/notifications?target=${encodeURIComponent(character.id)}`, { cache: "no-store" })
        const payload = (await response.json().catch(() => ({}))) as { notifications?: ItemNotification[] }
        const received = response.ok ? payload.notifications ?? [] : []
        if (!alive || !received.length) return
        // Montrées (puis effacées) par la carte des notifications ; déjà montrées, rien à relire.
        const fresh = unseenItemNotifications(received)
        showItemNotifications(received)
        if (!fresh.length) return
        const loaded = await fetch(`${inventoryEndpoint}?summary=1`).then(async (reply) => reply.ok ? ((await reply.json()) as { inventory?: CharacterInventoryRecord }).inventory ?? null : null).catch(() => null)
        if (!alive || !loaded) return
        const slots = loaded.containers.flatMap((container) => container.slots)
        const names = new Set(fresh.filter((item) => !item.slotId).map((item) => item.itemName.trim().toLocaleLowerCase("fr")))
        markNewSlots(character.id, [
          ...fresh.flatMap((item) => item.slotId && slots.some((slot) => slot.id === item.slotId && slot.item) ? [item.slotId] : []),
          // Une notification plus ancienne, sans case : les objets du même nom.
          ...slots.filter((slot) => slot.item && names.has(slot.item.name.trim().toLocaleLowerCase("fr"))).map((slot) => slot.id),
        ])
        setInventory((current) => keepCatalogFields(loaded, current))
      } catch {
        // Hors ligne : on réessaie plus tard.
      } finally {
        running = false
      }
    }
    void check()
    const timer = window.setInterval(() => void check(), 20_000)
    const wake = () => void check()
    window.addEventListener("focus", wake)
    return () => { alive = false; window.clearInterval(timer); window.removeEventListener("focus", wake) }
  }, [character.id, inventoryEndpoint])

  // Un objet envoyé à ce personnage : l'inventaire affiché se met à jour tout seul.
  useInventoryReceived([character.id], () => {
    fetch(`${inventoryEndpoint}?summary=1`)
      .then(async (response) => ({ ok: response.ok, payload: (await response.json()) as { inventory?: CharacterInventoryRecord } }))
      .then(({ ok, payload }) => {
        if (!ok || !payload.inventory) return
        // La pastille de l'objet reçu, même si l'onglet Inventaire n'est pas ouvert.
        markNewSlots(character.id, receivedSlots(inventoryRef.current, payload.inventory))
        setInventory((current) => keepCatalogFields(payload.inventory!, current))
      })
      .catch(() => { /* la notification a suffi */ })
  })

  useEffect(() => {
    if (initialInventory) return
    let active = true
    fetch(`${inventoryEndpoint}?summary=1`)
      .then(async (response) => ({ ok: response.ok, payload: (await response.json()) as { inventory?: CharacterInventoryRecord } }))
      // Le résumé n'efface pas ce que le chargement complet aurait déjà apporté (il peut arriver après lui).
      .then(({ ok, payload }) => { if (active && ok && payload.inventory) setInventory((current) => keepCatalogFields(payload.inventory!, current)) })
      .catch(() => { /* la fiche reste utilisable sans ses objets */ })
      .finally(() => { if (active) setInventoryLoading(false) })
    // Puis le catalogue complet, en tâche de fond : il porte la mise en forme et les
    // icônes des objets rangés avant qu'elles ne soient recopiées dans l'inventaire.
    // Revenu sans le catalogue (Google occupé), il est redemandé quelques secondes plus tard.
    void loadFullInventory(inventoryEndpoint, (loaded) => setInventory((current) => keepCatalogFields(loaded, current)), () => active)
    return () => { active = false }
  }, [initialInventory, inventoryEndpoint])

  useEffect(() => {
    if (!loadClassCatalog) return
    let cancelled = false
    async function load() {
      if (!knownClassCatalog) setClassCatalogLoading(true)
      setClassCatalogError("")
      try {
        // Jamais d'attente sans fin : le service local répond en 25 s au plus ; au-delà, « Réessayer ».
        const response = await fetch("/api/classes/catalog", { cache: "no-store", signal: AbortSignal.timeout(45_000) })
        const payload = await response.json() as { classes?: ClassRecord[]; spells?: ClassSpell[]; error?: string }
        if (!response.ok || !payload.classes || !payload.spells) throw new Error(payload.error || "Catalogue indisponible")
        knownClassCatalog = { classes: payload.classes, spells: payload.spells }
        if (!cancelled) {
          setAvailableClasses(payload.classes)
          setAvailableClassSpells(payload.spells)
        }
      } catch (error) {
        // Déjà connus : la fiche garde ceux lus avant plutôt que d'afficher une erreur.
        if (!cancelled && !knownClassCatalog) setClassCatalogError(error instanceof Error && error.name === "TimeoutError" ? "Le service local d’Eraser n’a pas donné les classes à temps." : error instanceof Error ? error.message : "Les classes et leurs sorts sont indisponibles.")
      } finally {
        if (!cancelled) setClassCatalogLoading(false)
      }
    }
    void load()
    return () => { cancelled = true }
  }, [loadClassCatalog, classCatalogAttempt])

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
    // L'onglet s'ouvre tout de suite (un double clic n'en ajoute pas deux) ; il s'enregistre derrière.
    setAddingTab(false)
    const commitTabs = commit(characterCustomTabsIndex, JSON.stringify([...parseCharacterTabs(latestValues.current[characterCustomTabsIndex] || ""), nextTab]))
    setActiveTab(nextTab.id)
    await commitTabs
  }

  /** Les compagnons d'un onglet Compagnon, réécrits dans la case des onglets à partir de sa dernière version. */
  function updateTabCompanions(tabId: string, update: (current: Companion[]) => Companion[]) {
    const tabs = parseCharacterTabs(latestValues.current[characterCustomTabsIndex] || "")
    const next = tabs.map((tab) => tab.id === tabId ? { ...tab, companions: update(tab.companions ?? []) } : tab)
    return commit(characterCustomTabsIndex, JSON.stringify(next))
  }

  /**
   * Les invocations d’un onglet, à partir de la fiche la plus récente : deux clics rapides
   * (− − sur la vie) partent chacun du précédent. Google coupe une case au-delà de 50 000
   * caractères, ce qui casserait tout le JSON des onglets : au-delà, rien n’est écrit.
   */
  const updateSummons = (tabId: string): SummonsUpdate => async (change) => {
    const tabs = parseCharacterTabs(latestValues.current[characterCustomTabsIndex] || "")
    const tab = tabs.find((candidate) => candidate.id === tabId)
    if (!tab) return false
    const nextSummons: SummonsData = change(parseSummonsData(tab.summons))
    const serialized = JSON.stringify(tabs.map((candidate) => candidate.id === tabId ? { ...candidate, summons: nextSummons } : candidate))
    if (serialized.length > 48_000) { setSaveState("too-large"); return false }
    await commit(characterCustomTabsIndex, serialized)
    return true
  }

  const summonSuggestions = useMemo(() => ({
    principals: catalog.characteristics.filter((item) => item.kind === "principale").map((item) => item.name),
    secondaries: catalog.characteristics.filter((item) => item.kind === "secondaire").map((item) => item.name),
    skills: catalog.skills.map((skill) => skill.name),
  }), [catalog])
  const [removingTab, setRemovingTab] = useState<CharacterTab | null>(null)

  /** Un onglet Invocation ou Compagnon garni demande confirmation : son contenu partirait avec lui. */
  function askRemoveCharacterTab(tab: CharacterTab) {
    const data = parseSummonsData(tab.summons)
    const filled = tab.type === "invocation" ? data.templates.length + data.summons.length > 0 : tab.type === "compagnon" && (tab.companions?.length ?? 0) > 0
    if (filled) setRemovingTab(tab)
    else void removeCharacterTab(tab.id)
  }

  async function removeCharacterTab(id: string) {
    const nextTabs = parseCharacterTabs(latestValues.current[characterCustomTabsIndex] || "").filter((tab) => tab.id !== id)
    if (activeTab === id) setActiveTab("base-competences")
    await commit(characterCustomTabsIndex, JSON.stringify(nextTabs))
  }

  /**
   * Les caractéristiques secondaires, dans l'ordre de leur index. Celles d'origine gardent
   * leur affichage (points de vie, listes, cartes calculées regroupées par deux) ; une
   * secondaire ajoutée s'affiche en compteur.
   */
  const secondaryKeys = new Set(secondaries.map((item) => item.key))
  const secondaryName = (key: string, fallback: string) => secondaries.find((item) => item.key === key)?.name ?? fallback
  const secondaryColor = (key: string, fallback: string) => secondaries.find((item) => item.key === key)?.color || fallback
  const combinedCards: Array<{ label: string; color: string; span: string; members: Array<{ key: string; index: number; label: string; short: string; color: string }> }> = [
    { label: "Dégâts", color: "#b96485", span: "sm:col-span-2 xl:col-span-4", members: [{ key: "Bonus de dégâts physiques", index: 17, label: "Dégâts physiques", short: "Physiques", color: "#c85f78" }, { key: "Bonus de dégâts magiques", index: 18, label: "Dégâts magiques", short: "Magiques", color: "#a96991" }] },
    { label: "Armure", color: "#6da184", span: "sm:col-span-2 xl:col-span-4", members: [{ key: "Armure physique", index: 19, label: "Armure physique", short: "Physique", color: "#74a968" }, { key: "Armure magique", index: 20, label: "Armure magique", short: "Magique", color: "#6599a0" }] },
    { label: "Critique", color: "#d19466", span: "sm:col-span-2 xl:col-span-4", members: [{ key: "Échec critique", index: 22, label: "Échec critique", short: "Échec", color: "#c86f6f" }, { key: "Réussite critique", index: 23, label: "Réussite critique", short: "Réussite", color: "#d9b85c" }] },
  ]
  const counterStyles: Record<string, { color: string; span: string }> = {
    "Notoriété": { color: "#70a8c5", span: "xl:col-span-2" },
    "Moralité": { color: "#bd7b99", span: "xl:col-span-2" },
    "Folie": { color: "#8f79b5", span: "xl:col-span-2" },
    // La case Déplacement prend place à droite du Destin, au-dessus de la Rapidité.
    "Destin": { color: "#e7ae69", span: movementItems.length ? "xl:col-span-2" : "xl:col-span-5" },
  }
  const secondaryHelp = (key: string) => catalogDescriptionOf(descriptions, secondaries.find((candidate) => candidate.key === key) ?? { key, name: key })
  const counterTile = (key: string, label: string, index: number, style: { color: string; span: string }) => <CounterTile key={key} label={label} help={secondaryHelp(key)} color={style.color} span={style.span} value={values[index]} modifier={modifierForValue(index)} rule={ruleForValue(index)} linkedItems={linkedForValue(index)} toggle={slotToggle} onCommit={(value) => commit(index, value)} />
  const listTile = (key: string, label: string, index: number, options: string[], color: string) => <div key={key} className="group/help flex min-h-20 flex-col items-center justify-center rounded-xl px-3 py-2 text-center xl:col-span-2" style={{ backgroundColor: `${color}16`, borderTop: `2px solid ${color}` }}><p className="text-[9px] font-semibold uppercase tracking-[.16em] text-muted-foreground">{label}<HelpMark title={label} className="ml-1 size-3 normal-case tracking-normal opacity-0 hover:text-foreground group-hover/help:opacity-100">{secondaryHelp(key) && <IndexRichText html={secondaryHelp(key)} />}</HelpMark></p><div className="mt-1 max-w-full"><SelectEdit label={label} value={values[index]} options={options} onCommit={(value) => commit(index, value)} /></div></div>
  const renderedCombined = new Set<string>()
  const secondaryTiles = secondaries.flatMap((item) => {
    const index = layout.index(item.key)
    if (index < 0) return []
    if (item.key === "Vie totale") { const lifeColor = stateTint(linkedForValue(10)) || stateTint(currentLifeItems) || item.color || "#6e9ee8"; const lifeGauges = gaugesAt("vie"); const lifeForms = formsAt("vie", true); const lifeDecks = decksAt("vie"); const lifeExtras = lifeGauges.length + lifeForms.length + lifeDecks.length; const lifeCard = <ModifierHoverShell items={[...currentLifeItems, ...linkedForValue(10)]} toggle={slotToggle} title={item.name} color={lifeColor} total={totalWithModifier(values[10], modifierForValue(10), "0", ruleForValue(10))}><LifePool label={item.name} help={secondaryHelp(item.key)} color={lifeColor} current={values[9]} total={values[10]} commit={commit} modifier={modifierForValue(10)} rule={ruleForValue(10)} currentModifier={currentLifeModifier} currentRule={currentLifeRule} /></ModifierHoverShell>; return [<div key={item.key} className={`relative rounded-xl xl:col-span-3 xl:row-span-2 ${lifeExtras ? "flex flex-col gap-1.5" : ""}`}><FxOverlay fx={stateFxOf([...linkedForValue(10), ...currentLifeItems])} />{lifeExtras ? <><div className="min-h-0 flex-1">{lifeCard}</div><div className="space-y-1.5">{lifeForms}{lifeGauges.map((resolved) => gaugeView(resolved, true))}{lifeDecks}</div></> : lifeCard}</div>] }
    if (item.key === "Classe sociale") return [listTile(item.key, item.name, index, socialClasses, item.color || "#75a9c8")]
    if (item.key === "Alignement") return [listTile(item.key, item.name, index, alignments, item.color || "#c37998")]
    if (item.key === "Rapidité") return [<div key={item.key} className="xl:col-span-3"><CalculatedSecondaryCard fieldIndex={21} label={item.name} help={secondaryHelp(item.key)} color={item.color || "#e8aa62"} values={values} commit={commit} modifier={modifierForValue(21)} rule={ruleForValue(21)} linkedItems={linkedForValue(21)} toggle={slotToggle} /></div>]
    const combined = combinedCards.find((card) => card.members.some((member) => member.key === item.key))
    if (combined) {
      if (renderedCombined.has(combined.label)) return []
      renderedCombined.add(combined.label)
      const fields = combined.members.filter((member) => secondaryKeys.has(member.key)).map((member) => {
        // Renommée dans l'index, la case prend son nouveau nom ; sinon elle garde son libellé d'origine.
        const name = secondaryName(member.key, member.key)
        return { index: member.index, label: name === member.key ? member.label : name, shortLabel: name === member.key ? member.short : name, color: secondaryColor(member.key, member.color), help: secondaryHelp(member.key) }
      })
      return [<div key={combined.label} className={combined.span}><CombinedCalculatedCard label={combined.label} groupColor={combined.color} fields={fields} values={values} commit={commit} modifierFor={modifierForValue} ruleFor={ruleForValue} linkedFor={linkedForValue} toggle={slotToggle} /></div>]
    }
    const style = counterStyles[item.key] ?? { color: "#8a9bb0", span: "xl:col-span-2" }
    return [counterTile(item.key, item.name, index, { ...style, color: item.color || style.color })]
  })
  /**
   * La case Déplacement : actions gratuite, mineure et majeure côte à côte. Les actions
   * mineure et majeure affichent l'action gratuite en plus de la leur.
   */
  const movementCells = movementItems.flatMap((item) => {
    const index = layout.index(item.key)
    return index < 0 ? [] : [{ item, index, role: movementRole(item) }]
  }).sort((left, right) => ["gratuite", "mineure", "majeure"].indexOf(left.role ?? "") - ["gratuite", "mineure", "majeure"].indexOf(right.role ?? ""))
  const movementColor = freeMovement?.color || "#5f9fa0"
  const ownMovement = (cell: { index: number }) => totalWithModifier(values[cell.index], modifierForValue(cell.index), "0", ruleForValue(cell.index))
  const freeCell = movementCells.find((cell) => cell.role === "gratuite")
  const freeTotal = freeCell ? ownMovement(freeCell) : null
  const movementTile = movementCells.length ? <div key="Déplacement" className="sm:col-span-2 lg:col-span-1 xl:col-span-3"><div className="h-full min-h-20 rounded-xl border p-1.5 shadow-sm" style={{ backgroundColor: `${movementColor}18`, borderColor: `${movementColor}55`, borderTop: `2px solid ${movementColor}` }}>
    <p className="mb-1 text-center text-[9px] font-semibold uppercase tracking-[.18em]" style={{ color: movementColor }}>Déplacement</p>
    <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${movementCells.length}, minmax(0, 1fr))` }}>
      {movementCells.map((cell, position) => {
        const own = ownMovement(cell)
        const addsFree = Boolean(freeTotal !== null && cell.role && cell.role !== "gratuite")
        const shown = addsFree ? String(Math.round((sheetNumber(freeTotal!) + sheetNumber(own)) * 100) / 100) : own
        return <MovementCell key={cell.item.key} role={cell.role} name={cell.item.name} help={catalogDescriptionOf(descriptions, cell.item)} color={cell.item.color || movementColor} value={values[cell.index]} own={own} shown={shown} freeTotal={addsFree ? freeTotal : null} modifier={modifierForValue(cell.index)} rule={ruleForValue(cell.index)} linkedItems={linkedForValue(cell.index)} toggle={slotToggle} onCommit={(value) => commit(cell.index, value)} alignEnd={position === movementCells.length - 1} />
      })}
    </div>
  </div></div> : null
  // Ordre de la fiche : la Rapidité à droite du Critique, le Déplacement à droite du Destin (au-dessus d'elle).
  const orderedTiles = [...secondaryTiles]
  const rapidity = orderedTiles.findIndex((tile) => tile.key === "Rapidité")
  if (rapidity >= 0 && orderedTiles.some((tile) => tile.key === "Critique")) {
    const [tile] = orderedTiles.splice(rapidity, 1)
    orderedTiles.splice(orderedTiles.findIndex((candidate) => candidate.key === "Critique") + 1, 0, tile)
  }
  if (movementTile) {
    const destiny = orderedTiles.findIndex((tile) => tile.key === "Destin")
    const firstCombined = orderedTiles.findIndex((tile) => tile.key === "Dégâts")
    orderedTiles.splice(destiny >= 0 ? destiny + 1 : firstCombined >= 0 ? firstCombined : orderedTiles.length, 0, movementTile)
  }
  const secondaryCharacteristics = orderedTiles.length ? <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-[repeat(18,minmax(0,1fr))]">{orderedTiles}</div> : null

  const successLabel = "Réussite crit."
  const failureLabel = "Échec crit."

  /**
   * Une caractéristique et ses compétences. Les seuils critiques d’une compétence cumulent
   * les objets liés au seuil global, à celui de la caractéristique et au sien.
   */
  function renderSkillGroup(group: CatalogGroup, groupIndex: number) {
    const color = groupColor(group.characteristic, groupIndex)
    const key = group.characteristic?.key ?? ""
    const characteristicId = group.characteristic ? characteristicModifierTargetId(key) : ""
    const characteristicCells = { value: key ? layout.index(key) : -1, success: key ? layout.index(key, CRITICAL_SUCCESS_METRIC) : -1, failure: key ? layout.index(key, CRITICAL_FAILURE_METRIC) : -1 }
    const globalSuccess = layout.index(CRITICAL_SUCCESS_METRIC)
    const globalFailure = layout.index(CRITICAL_FAILURE_METRIC)
    const rows = group.skills.flatMap((skill) => {
      const cells = characterSkillMetrics.map((metric) => layout.index(skill.key, metric))
      return cells.every((cell) => cell >= 0) ? [{ skill, cells }] : []
    })
    return <article key={key || "autres"} className="overflow-visible rounded-2xl border bg-card/80 shadow-sm" style={{ borderColor: color.border }}>
      {group.characteristic && characteristicCells.value >= 0 && characteristicCells.success >= 0 && characteristicCells.failure >= 0
        ? <CharacteristicHeader
          help={catalogDescriptionOf(descriptions, group.characteristic)}
          characteristic={group.characteristic}
          cells={characteristicCells}
          color={color}
          values={values}
          commit={commit}
          statModifier={modifierForValue(characteristicCells.value)}
          statRule={ruleForValue(characteristicCells.value)}
          criticalModifiers={{ success: modifierForValue(characteristicCells.success), failure: modifierForValue(characteristicCells.failure) }}
          linkedItems={mergeLinkedItems(linkedForValue(characteristicCells.value), tagLinkedItems(successLabel, linkedForValue(characteristicCells.success)), tagLinkedItems(failureLabel, linkedForValue(characteristicCells.failure)))}
          usageItems={usageItemsFor(itemUsage, group.characteristic.name, group.characteristic.key)}
          toggle={slotToggle}
        />
        : <div className="rounded-t-2xl px-4 py-3 text-white" style={{ backgroundColor: color.accent }}><h3 className="font-display text-lg font-semibold">{group.characteristic?.name ?? "Autres compétences"}</h3>{!group.characteristic && <p className="text-[10px] text-white/75">Sans caractéristique reconnue dans l’index</p>}</div>}
      <div className="grid grid-cols-[minmax(0,1fr)_repeat(3,2.15rem)] gap-1 px-3 py-2 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground"><span>Compétence</span><span className="text-center">Stat</span><span className="text-center">RC</span><span className="text-center">EC</span></div>
      {rows.map(({ skill, cells }) => {
        const successIndexes = [globalSuccess, characteristicCells.success, cells[5]].filter((index) => index >= 0)
        const failureIndexes = [globalFailure, characteristicCells.failure, cells[8]].filter((index) => index >= 0)
        return <SkillRow
          key={skill.key}
          help={catalogDescriptionOf(descriptions, skill)}
          skill={skill}
          cells={cells}
          characteristicCell={characteristicCells.value}
          values={values}
          color={color}
          commit={commit}
          abilities={linkedAbilities(skill.name)}
          charges={classChoiceState.charges}
          setCharges={updateSpellCharges}
          skillModifier={modifierTotalFor(modifierIndex, skillModifierTargetId(skill.key))}
          characteristicModifier={characteristicId ? modifierTotalFor(modifierIndex, characteristicId) : 0}
          skillRule={modifierRuleFor(modifierIndex, skillModifierTargetId(skill.key))}
          characteristicRule={characteristicId ? modifierRuleFor(modifierIndex, characteristicId) : undefined}
          successModifier={successIndexes.reduce((total, index) => total + modifierForValue(index), 0)}
          failureModifier={failureIndexes.reduce((total, index) => total + modifierForValue(index), 0)}
          linkedItems={mergeLinkedItems(
            linkedItemsFor(modifierIndex, skillModifierTargetId(skill.key)),
            characteristicId ? linkedItemsFor(modifierIndex, characteristicId) : [],
            tagLinkedItems(successLabel, ...successIndexes.map(linkedForValue)),
            tagLinkedItems(failureLabel, ...failureIndexes.map(linkedForValue)),
          )}
          usageItems={usageItemsFor(itemUsage, skill.name, skill.key)}
          tint={stateTint(linkedItemsFor(modifierIndex, skillModifierTargetId(skill.key)))}
          fx={stateFxOf(linkedItemsFor(modifierIndex, skillModifierTargetId(skill.key)))}
          toggle={slotToggle}
        />
      })}
    </article>
  }

  function renderSkillsContent() { return <div className="grid items-start gap-4 md:grid-cols-2 xl:grid-cols-5">
    {groups.map(renderSkillGroup)}
  </div> }

  function renderTabContent(tab: CharacterTab) {
    if (tab.type === "competences") return renderSkillsContent()
    if (tab.type === "inventaire") return inventoryLoading
      ? <div className="grid min-h-32 place-items-center rounded-2xl border border-dashed"><LoaderCircle className="size-5 animate-spin text-muted-foreground" /></div>
      : <CharacterInventory characterId={character.id} inventory={inventory} onInventoryChange={setInventory} />
    if (tab.type === "classe") {
      const progression = <ClassProgression classes={assignedClasses} spells={availableClassSpells} level={currentLevel} characterLevel={characterLevel} value={classChoicesValue} onCommit={(value) => commit(characterClassChoicesIndex, value)} loading={classCatalogLoading} error={classCatalogError} ownerId={character.id} onOpenChoice={() => setSpellChoiceOpen(true)} onSpellRemoved={() => setSpellChoiceWanted(true)} />
      const spellGauges = gaugesAt("sorts")
      const spellForms = formsAt("sorts")
      const spellDecks = decksAt("sorts")
      return spellGauges.length || spellForms.length || spellDecks.length ? <div className="space-y-4">{(spellGauges.length > 0 || spellForms.length > 0) && <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{spellForms}{spellGauges.map((resolved) => gaugeView(resolved))}</div>}{spellDecks}{progression}</div> : progression
    }
    if (tab.type === "compagnon") return <CharacterCompanions characterId={character.id} companions={tab.companions ?? []} onChange={(update) => updateTabCompanions(tab.id, update)} />
    if (tab.type === "journal") return <div className="space-y-8"><CharacterRelations characterId={character.id} campaigns={character.campaigns} /><NotesEditor embedded value={values[8]} onCommit={(value) => commit(8, value)} /></div>
    if (tab.type === "invocation") return <CharacterSummons data={parseSummonsData(tab.summons)} onUpdate={updateSummons(tab.id)} suggestions={summonSuggestions} />
    return <div className="min-h-56 rounded-2xl border border-dashed border-border/55 bg-card/20" />
  }

  const activeCharacterTab = characterTabs.find((tab) => tab.id === activeTab) ?? characterTabs[0]
  // Coma et Mort donnent leur propre apparence quand ils existent avec un effet.
  const lifeState = autoLife.styledByState ? "alive" : autoLife.state

  return <div data-life={lifeState} className={`character-life relative w-full flex-1 px-4 py-7 sm:px-7 md:py-10 ${pageImageFxClass(portrait.sheetFx)}`} style={{ "--character-accent": campaignAccent } as CSSProperties} title={autoLife.state === "dead" ? "Vie actuelle à moins la vie totale ou en dessous" : autoLife.state === "down" ? "Vie actuelle à 0 ou moins" : undefined}>
    {/* Bichromie rouge sang de la fiche « morte » : la luminosité de chaque point devient
        un rouge, du plus sombre au rose pâle, comme le gris le fait pour une fiche à terre. */}
    {/* Un effet « appliqué à la page » teinte toute la fiche de sa couleur, comme à 0 PV. */}
    {portrait.sheetColors.length > 0 && <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-[5] mix-blend-color" style={{ background: portrait.sheetColors.length > 1 ? `linear-gradient(160deg, ${portrait.sheetColors.join(", ")})` : portrait.sheetColors[0], opacity: 0.35 }} />}
    {/* Les FX « appliqués à la page entière » se dessinent sur toute la fiche. */}
    <PageFxOverlay fx={portrait.sheetFx} />
    <svg aria-hidden="true" width="0" height="0" className="pointer-events-none absolute"><filter id="eraser-life-dead" colorInterpolationFilters="sRGB"><feColorMatrix type="matrix" values="0.1318 0.4434 0.0448 0 0.35 0.1446 0.4863 0.0491 0 0.02 0.1382 0.4649 0.0469 0 0.03 0 0 0 1 0" /></filter></svg>
    <section className="relative overflow-hidden rounded-[1.75rem] border bg-card/85 p-5 shadow-xl shadow-black/10 sm:p-7" style={{ borderColor: `${campaignAccent}55` }}>
      <div className="absolute inset-x-0 top-0 h-1" style={{ background: `linear-gradient(90deg, ${campaignAccent}, ${campaignAccent}66 58%, transparent)` }} />
      <div className="flex flex-col gap-6 lg:flex-row">
        <div className="flex w-40 shrink-0 flex-col gap-1 sm:w-52 lg:w-56 xl:w-64">
        <label className="group relative flex aspect-[3/4] w-full shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-2xl bg-muted text-muted-foreground shadow-inner">
          {values[characterNarrativeStart + 1] ? <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={values[characterNarrativeStart + 1]} alt={`Portrait de ${character.name}`} decoding="async" fetchPriority="high" className={`size-full object-cover ${portraitImageFxClass(portrait.fx)}`} />
          </> : <CircleUserRound className="size-20 opacity-30" />}
          {/* Les états posés teintent le portrait (couleur de leurs effets) et y posent leurs images. */}
          {portrait.colors.length > 0 && <span aria-hidden="true" className="pointer-events-none absolute inset-0 mix-blend-color" style={{ background: portrait.colors.length > 1 ? `linear-gradient(160deg, ${portrait.colors.join(", ")})` : portrait.colors[0], opacity: 0.55 }} />}
          {portrait.colors.length > 0 && <span aria-hidden="true" className="pointer-events-none absolute inset-0" style={{ boxShadow: `inset 0 0 28px ${portrait.colors[0]}aa` }} />}
          {portrait.images.map((image) => <span key={image} aria-hidden="true" className="pointer-events-none absolute inset-0"><IndexImage value={image} alt="" className="size-full object-contain" fallback={null} /></span>)}
          <PortraitFx fx={portrait.fx} />
          <span className="absolute inset-x-3 bottom-3 flex items-center justify-center gap-2 rounded-lg bg-black/65 px-3 py-2 text-xs text-white opacity-0 backdrop-blur transition group-hover:opacity-100"><ImagePlus className="size-4" />{portraitPending ? "Envoi…" : "Changer"}</span>
          <input type="file" accept="image/*" className="sr-only" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; void changePortrait(file) }} />
        </label>
        <TokenButton kind="character" ownerId={character.id} name={values[0] || character.name} source={values[characterNarrativeStart + 1] || ""} style={{ kind: "character" }} disabledReason={values[characterNarrativeStart + 1] ? "" : "Ajoute d’abord un portrait"} />
        <CharacterStatesPanel states={postedStates} autoStates={[...formStates, ...autoLife.auto]} autoSources={formStateSources} onAutoLevel={setFormStateLevel} catalog={statesCatalog.catalog} loaded={statesCatalog.loaded} error={statesCatalog.error} onChange={updateStates} onRoll={rollStateEffect} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div><p className="text-[10px] font-semibold uppercase tracking-[.28em]" style={{ color: campaignAccent }}>Identité</p><InlineEdit label="Nom" value={values[0]} onCommit={(value) => {
              // Un nom vide (ou trop long) est refusé ici : l'ancien reste affiché.
              const name = value.trim()
              if (!name || name.length > 120) { reject(name ? "le nom fait plus de 120 caractères." : "le personnage doit garder un nom."); return Promise.resolve() }
              return commit(0, value)
            }}><h1 className="mt-1 font-display text-4xl font-semibold tracking-tight sm:text-6xl">{values[0] || "Sans nom"}</h1></InlineEdit>{activeTitle && <p className="mt-1 font-display text-lg" style={{ color: campaignAccent }}>{activeTitle}</p>}</div>
            <div className="flex flex-wrap justify-end gap-2">{character.campaigns.length ? character.campaigns.map((campaign) => <span key={campaign.id} className="rounded-full border px-3 py-1 text-xs font-medium" style={{ color: campaign.accentColor, borderColor: `${campaign.accentColor}66`, backgroundColor: `${campaign.accentColor}12` }}>{campaign.name}</span>) : <span className="rounded-full border px-3 py-1 text-xs text-muted-foreground">Sans campagne</span>}</div>
          </div>
          <div className="mt-6 divide-y border-y">
            <div className="grid gap-x-8 gap-y-4 py-4 sm:grid-cols-2 xl:grid-cols-12">
              <div className="xl:col-span-4"><p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Peuples</p><MultipleValues label="un peuple" value={values[1]} onCommit={(value) => commit(1, value)} /></div>
              <div className="xl:col-span-5"><div className="flex items-center gap-2"><p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Classes</p><ClassDisplayButton value={classDisplayOf(values[characterClassChoicesIndex] || "")} suggestions={classOptions.map((option) => option.label)} onChange={(display) => void commit(characterClassChoicesIndex, withClassDisplay(latestValues.current[characterClassChoicesIndex] || "", display))} /></div><MultipleValues label="une classe" value={values[2]} options={classOptions} onCommit={(value) => commit(2, value)} />{!classOptions.length && (classCatalogLoading
                ? <p className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground"><LoaderCircle className="size-3 animate-spin" />Lecture des classes…</p>
                : <p className="mt-1 text-[11px] text-amber-600 dark:text-amber-400">{classCatalogError || "Aucune classe n’a pu être lue."} <button type="button" onClick={() => { knownClassCatalog = null; setClassCatalogAttempt((attempt) => attempt + 1) }} className="font-semibold underline underline-offset-2">Réessayer</button></p>)}</div>
              <div className="xl:col-span-3"><p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Level</p><Stepper label="Level" value={values[3]} onCommit={commitLevel} /></div>
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

    {secondaryCharacteristics && <div className="mt-6">{secondaryCharacteristics}</div>}
    {(gaugesAt("bandeau").length > 0 || formsAt("bandeau").length > 0) && <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{formsAt("bandeau")}{gaugesAt("bandeau").map((resolved) => gaugeView(resolved))}</div>}
    {decksAt("bandeau").length > 0 && <div className="mt-2 space-y-2">{decksAt("bandeau")}</div>}

    <Tabs value={activeCharacterTab.id} onValueChange={setActiveTab} className="mt-9 rounded-2xl border border-[#74664f3d] bg-[linear-gradient(135deg,rgba(146,118,64,.10),rgba(255,255,255,.018))] p-2 shadow-sm">
      <div className="overflow-hidden">
        <TabsList variant="line" className="h-auto w-full min-w-0 flex-wrap justify-start bg-transparent">
          {characterTabs.map((tab) => <TabsTrigger key={tab.id} value={tab.id} className="h-10 gap-2 rounded-xl px-3 data-[state=active]:bg-[#92764018] data-[state=active]:shadow-sm"><CharacterTabIcon type={tab.type} /><span className="relative">{tab.label}{tab.type === "classe" && pendingChoiceCount > 0 && <span className="absolute -right-2.5 -top-1 size-2 rounded-full bg-rose-400/90 ring-2 ring-card" title={pendingChoiceCount > 1 ? `${pendingChoiceCount} nouveaux sorts à choisir` : "Un nouveau sort à choisir"} />}{tab.type === "inventaire" && hasNewItems && <span className="absolute -right-2.5 -top-1 size-2 rounded-full bg-rose-400/90 ring-2 ring-card" title="Nouvel objet reçu" />}</span>{tab.removable && <span role="button" tabIndex={0} className="ml-1 rounded-full p-0.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" onClick={(event) => { event.stopPropagation(); askRemoveCharacterTab(tab) }} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); event.stopPropagation(); askRemoveCharacterTab(tab) } }} aria-label={`Retirer l’onglet ${tab.label}`}><X className="size-3" /></span>}</TabsTrigger>)}
          <Button type="button" variant="ghost" size="icon-sm" onClick={() => setAddingTab(true)} aria-label="Ajouter un onglet" title="Ajouter un onglet"><Plus /></Button>
        </TabsList>
      </div>
      <TabsContent value={activeCharacterTab.id} forceMount className="mt-2 rounded-xl p-2 sm:p-3">{renderTabContent(activeCharacterTab)}</TabsContent>
    </Tabs>

    {saveState !== "idle" && <div className={`fixed bottom-5 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-full border px-3 py-1.5 text-xs shadow-lg backdrop-blur ${saveState === "error" || saveState === "conflict" || saveState === "too-large" ? "border-destructive/40 bg-destructive/10 text-destructive" : "bg-card/90 text-muted-foreground"}`} role="status" aria-live="polite">
      {saveState === "saving" && <><LoaderCircle className="size-3.5 animate-spin" />Enregistrement…</>}
      {saveState === "saved" && <><Check className="size-3.5 text-emerald-600" />Enregistré</>}
      {saveState === "error" && <><X className="size-3.5" />Pas encore enregistré : Google ne répond pas.<button type="button" className="font-semibold underline" onClick={() => { setSaveState("saving"); void flush() }}>Réessayer</button></>}
      {saveState === "rejected" && <><X className="size-3.5" />Pas enregistré : {rejection}<button type="button" className="font-semibold underline" onClick={() => setSaveState("idle")}>Fermer</button></>}
      {saveState === "too-large" && <><X className="size-3.5" />Pas enregistré : les onglets de cette fiche sont trop remplis. Renvoie une invocation ou raccourcis un texte.<button type="button" className="font-semibold underline" onClick={() => setSaveState("idle")}>OK</button></>}
      {saveState === "conflict" && <><X className="size-3.5" />{conflictHeaders.length ? `La fiche a changé ailleurs entre-temps. Pas enregistré : ${conflictHeaders.join(", ")}. Recommence sur la fiche à jour.` : "La fiche a changé entre-temps : actualise puis recommence."}</>}
    </div>}

    {shownChoice && <SpellChoiceDialog
      open={spellChoiceOpen && Boolean(currentChoice)}
      onOpenChange={setSpellChoiceOpen}
      title={shownChoice.choice ? "Nouveau sort" : "Bonus de rang"}
      subtitle={shownChoice.choice ? `${shownChoice.className} · rang ${shownChoice.rank}` : `Rang ${shownChoice.rank}`}
      options={shownChoice.choice?.options ?? []}
      accent={shownChoice.accent}
      accentLight={shownChoice.accentLight}
      choiceKey={shownChoice.key}
      remaining={Math.max(1, pendingChoiceCount)}
      bonus={shownChoice.bonus}
      characteristics={principalCharacteristics}
      canApply={(target) => rankBonusCell(target) >= 0}
      spellPool={availableClassSpells.filter((spell) => !knownClassSpells.some((known) => known.id === spell.id))}
      onChoose={chooseSpell}
      onLater={() => setSpellChoiceOpen(false)}
    />}

    <Dialog open={Boolean(levelDrop)} onOpenChange={(open) => { if (!open) setLevelDrop(null) }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Descendre au niveau {levelDrop?.level} ?</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">Ce que le personnage avait gagné aux rangs perdus est retiré de sa fiche. En reprenant ces niveaux, tout sera à rechoisir.</p>
        <div className="max-h-72 space-y-2 overflow-y-auto">
          {levelDrop?.loss.ranks.map((rank) => {
            const spells = levelDrop.loss.spells.filter((item) => item.rank === rank)
            const taken = levelDrop.loss.bonuses.find((item) => item.rank === rank)?.taken
            const custom = taken?.spell ? availableClassSpells.find((spell) => spell.id === taken.spell)?.name ?? "un sort sur mesure" : ""
            return <div key={rank} className="rounded-xl border border-border/70 bg-background/50 px-3 py-2 text-sm">
              <p className="font-display font-semibold">Rang {rank}</p>
              <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                {spells.map((item) => <li key={`${item.classId}:${item.spellId}`}>Sort : <b className="text-foreground">{availableClassSpells.find((spell) => spell.id === item.spellId)?.name ?? "sort choisi"}</b>{assignedClasses.length > 1 ? ` (${assignedClasses.find((entry) => entry.id === item.classId)?.name ?? "classe"})` : ""}</li>)}
                {taken?.applied.map((entry, index) => <li key={`${entry.target}:${index}`}>Bonus retiré : <b className="text-foreground">{entry.amount > 0 ? "+" : ""}{entry.amount} {entry.target}</b></li>)}
                {custom && <li>Sort sur mesure retiré : <b className="text-foreground">{custom}</b></li>}
              </ul>
            </div>
          })}
        </div>
        <div className="flex flex-wrap justify-end gap-2 pt-1">
          <Button type="button" variant="outline" onClick={() => setLevelDrop(null)}>Annuler</Button>
          <Button type="button" variant="destructive" onClick={confirmLevelDrop}><Minus />Retirer et descendre</Button>
        </div>
      </DialogContent>
    </Dialog>

    <Dialog open={Boolean(removingTab)} onOpenChange={(open) => { if (!open) setRemovingTab(null) }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Retirer l’onglet « {removingTab?.label} » ?</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">{removingTab?.type === "compagnon" ? "Ses compagnons disparaîtront de la fiche avec lui." : "Ses templates et ses invocations disparaîtront de la fiche avec lui."}</p>
        <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={() => setRemovingTab(null)}>Garder</Button><Button type="button" variant="destructive" onClick={() => { const tab = removingTab; setRemovingTab(null); if (tab) void removeCharacterTab(tab.id) }}>Retirer l’onglet</Button></div>
      </DialogContent>
    </Dialog>

    <Dialog open={addingTab} onOpenChange={setAddingTab}>
      <DialogContent>
        <DialogHeader><DialogTitle>Ajouter un onglet</DialogTitle></DialogHeader>
        <div className="grid gap-4 pt-2">
          <label className="grid gap-1.5 text-sm font-medium">Type d’onglet<NativeSelect value={newTabType} onChange={(event) => setNewTabType(event.target.value as CharacterTabType)}>{addableTabTypes.map((tab) => <NativeSelectOption key={tab.type} value={tab.type}>{tab.label}</NativeSelectOption>)}</NativeSelect></label>
          <Button type="button" onClick={() => void addCharacterTab()}><Plus />Ajouter l’onglet</Button>
        </div>
      </DialogContent>
    </Dialog>
  </div>
}
