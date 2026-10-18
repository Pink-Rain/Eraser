"use client"

import { usePathname } from "next/navigation"
import { useMemo, useState, type DragEvent, type ReactNode } from "react"
import { ArrowDown, ArrowLeftRight, ArrowUp, Bold, BookOpen, Columns3, LayoutGrid, LayoutTemplate, MessageSquareQuote, CircleHelp, Copy, Dices, Eye, EyeOff, FolderTree, FunctionSquare, Gauge, GripVertical, Hash, Italic, List, ListChecks, ListTree, LoaderCircle, Lock, LockOpen, MousePointerClick, Palette, Paperclip, Pencil, Plus, Save, Search as SearchIcon, Settings2, Sigma, Sparkles, SquareCheck, Strikethrough, Trash2, TriangleAlert, Type as TypeIcon, Underline, Undo2, type LucideIcon, Shapes, X, PanelLeftClose, PanelLeftOpen, Maximize2, Minimize2 } from "lucide-react"

import { IconPicker, IndexIconGlyph } from "@/components/eraser/index-gauge"
import { IndexGuide, type GuideSection } from "@/components/eraser/index-guide"
import { LayoutViewsPanel, PresetBar, useColumnPresets } from "@/components/eraser/index-presets-ui"
import { IndexLayoutEditor, type LayoutColumn } from "@/components/eraser/index-layout-editor"
import { CardsPanel, IndexCardEditor, duplicateCard } from "@/components/eraser/index-card-editor"
import { ColumnDescriptionButton, ColumnLockButton, ColumnTypeMenu } from "@/components/eraser/index-column-toolbar"
import { IndexPresentationsEditor, LIST_FAMILY, MAIN_PRESENTATION_ID, PresentationsPanel } from "@/components/eraser/index-presentations-editor"
import { columnStyleCss, pillStyle, stylePalette } from "@/components/eraser/index-style"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { Textarea } from "@/components/ui/textarea"
import { actionStepCatalog, buttonPresets, describeStep, newStep, stepInfo } from "@/lib/index-actions"
import {
  columnTypeLabel,
  fileAcceptLabels,
  foldName,
  formulaResultLabels,
  gaugeScaleOf,
  indexColumnKinds,
  isColorSourceSpec,
  isComputedSpec,
  normalizeSpec,
  placementOf,
  randomSourceLabels,
  rollupLabels,
  type ActionButton,
  type ActionStep,
  type ChoiceSource,
  type ColumnStyle,
  type FileAccept,
  type FormulaResult,
  type GaugeSettings,
  type IndexColumnKind,
  type IndexColumnSpec,
  type RandomSettings,
  type RandomSource,
  type RollupFunction,
} from "@/lib/index-columns"
import { columnFormulaValue, computeFormulaDisplay, formulaDisplayText, formulaFunctions, formulaProblem, seededRandom } from "@/lib/index-formula"
import { DEFAULT_FORM_ID, layoutId, renameLayoutColumns, serializeIndexLayout, serializeNamedLayouts, tabLayout, type IndexLayout, type LayoutKind, type NamedLayout, type TabLayouts } from "@/lib/index-layouts"
import { automaticLayoutFor, builtinLayoutFor, eraserLayoutStarters, tabLayoutsOf } from "@/lib/index-layout-defaults"
import { renameCardColumns, serializeTabCards, tabCardsOf, type CardColumn, type CardTemplate, type TabCards } from "@/lib/index-cards"
import { lockOverrideFor, sameTabLocks, type TabLocks } from "@/lib/index-locks"
import { tabLocksOf } from "@/lib/index-locks"
import { unitFamilies, type UnitFamily } from "@/lib/index-numbers"
import type { StatDefinition } from "@/lib/index-stats"
import { fitLayoutToColumns, isPresentationKind, namedPresentationsOf, presentationEntries, presentationKinds, type PresentationKind, type TabPresentations, type Presentation, type PresentationPreset } from "@/lib/index-presentations"
import { layoutIcons } from "@/components/eraser/index-windows"

/** Ce que montre l'éditeur : les colonnes, le formulaire, le survol, les cartes ou une vue. */
export type EditorMode = "columns" | LayoutKind | "cards" | `view:${PresentationKind}` | "stats"
import {
  alignColumns,
  canonicalObjectHeader,
  freePolicy,
  headerProblem,
  isDisplayOnlyChange,
  isObjectSpellingFix,
  sameSpec,
  tabProblem,
  type ColumnPolicy,
  type IndexEditorModel,
  type RelationTarget,
  type SchemaOperation,
} from "@/lib/index-schema-shared"

/**
 * `lockedPolicy` : le cadenas d'origine, gardé quand on déverrouille la colonne (le
 * changement part alors avec `force`, et l'avertissement reste affiché).
 */
type DraftColumn = { id: string; original?: string; originalIndex?: number; header: string; spec: IndexColumnSpec; originalSpec?: IndexColumnSpec; policy: ColumnPolicy; /** Le cadenas tel qu'il était à l'ouverture (ce qui est enregistré). */ originalPolicy?: ColumnPolicy; lockedPolicy?: ColumnPolicy; removed: boolean }

/** Une colonne dont le nom, le type ou la présence sont protégés. */
const isLockedPolicy = (policy: ColumnPolicy) => policy.reasons.length > 0 || (!policy.rename && !policy.type && !policy.remove)
/** Les mises en page touchées d'un onglet : les étoilées (`null` : retour à celle d'Eraser), les autres versions. */
type LayoutDraft = { form?: IndexLayout | null; hover?: IndexLayout | null; forms?: NamedLayout[]; hovers?: NamedLayout[] }

type DraftTab = { id: string; original?: string; name: string; itemLabel?: string; originalItemLabel?: string; columns: DraftColumn[]; removed: boolean; remove: boolean; removeReason?: string; rename?: boolean; renameReason?: string; addColumns: boolean; addColumnsReason?: string }

let draftCounter = 0
const nextId = () => `draft-${draftCounter++}`

/**
 * Les colonnes qu'une mise en page peut placer : celles de la fiche (sauf l'identifiant et
 * ce qu'Eraser calcule hors fiche), ou celles qu'un survol sait montrer (une valeur gardée).
 */
function layoutColumnsOf(tab: DraftTab, kind: LayoutKind): LayoutColumn[] {
  const formHidden = ["id", "auto-links", "ranked-links", "tab", "archived"]
  // Le survol a toujours le nom en titre : il n'est pas proposé comme case.
  const hoverHidden = ["id", "actions", "auto-links", "ranked-links", "tab", "archived", "formula", "lookup", "rollup", "name", "name-form"]
  return tab.columns.filter((item) => !item.removed && item.header.trim()).flatMap((item) => {
    const spec = normalizeSpec(item.spec)
    // Toute colonne peut aller dans la fiche ou le survol, masquée ou non : c'est la mise en page qui décide.
    if ((kind === "form" ? formHidden : hoverHidden).includes(spec.kind)) return []
    return [{ header: item.header.trim(), spec }]
  })
}

/** Les colonnes qu'une carte peut montrer : toutes, sauf ce qui n'a pas de valeur à afficher. */
function cardColumnsOf(tab: DraftTab): CardColumn[] {
  const hidden = ["id", "archived", "tab", "auto-links", "ranked-links", "actions"]
  return tab.columns.filter((item) => !item.removed && item.header.trim()).flatMap((item) => {
    const spec = normalizeSpec(item.spec)
    return hidden.includes(spec.kind) ? [] : [{ header: item.header.trim(), spec }]
  })
}

function draftOf(model: IndexEditorModel): DraftTab[] {
  return model.tabs.map((tab) => ({
    id: nextId(),
    original: tab.name,
    name: tab.name,
    itemLabel: tab.itemLabel,
    originalItemLabel: tab.itemLabel,
    removed: false,
    remove: tab.remove,
    removeReason: tab.removeReason,
    rename: tab.rename,
    renameReason: tab.renameReason,
    addColumns: tab.addColumns,
    addColumnsReason: tab.addColumnsReason,
    // Les réglages sont lus sous leur forme actuelle (« Affichage fixe » → style imposé…).
    columns: tab.columns.map((column, index) => { const spec = normalizeSpec(column.spec); return { id: nextId(), original: column.header, originalIndex: index, header: column.header, spec, originalSpec: spec, policy: column.policy, originalPolicy: column.policy, removed: false } }),
  }))
}

/** Les opérations à envoyer au serveur, dans l'ordre où elles doivent s'appliquer. */
export function operationsOf(tabs: DraftTab[], originalTabOrder: string[] = []): SchemaOperation[] {
  const operations: SchemaOperation[] = []
  for (const tab of tabs) {
    if (!tab.original) {
      if (!tab.removed) operations.push({ op: "add-tab", name: tab.name.trim(), columns: tab.columns.filter((column) => !column.removed).map((column) => ({ header: column.header.trim(), spec: column.spec })) })
      continue
    }
    if (tab.removed) { operations.push({ op: "remove-tab", tab: tab.original }); continue }
    for (const column of tab.columns) {
      if (!column.original) {
        if (!column.removed) operations.push({ op: "add-column", tab: tab.original, header: column.header.trim(), spec: column.spec })
        continue
      }
      // Déverrouillée ici (cadenas retiré) : le changement part avec `force`, le cadenas est enregistré avant.
      const force = column.lockedPolicy || (column.originalPolicy && isLockedPolicy(column.originalPolicy) && !isLockedPolicy(column.policy)) ? { force: true } : {}
      if (column.removed) { operations.push({ op: "remove-column", tab: tab.original, header: column.original, ...force }); continue }
      const header = column.header.trim()
      if (header !== column.original) operations.push({ op: "rename", tab: tab.original, header: column.original, to: header, ...force })
      if (column.originalSpec && !sameSpec(column.spec, column.originalSpec)) operations.push({ op: "spec", tab: tab.original, header, spec: column.spec, ...force })
    }
    // L'ordre : les colonnes gardées puis les nouvelles, telles que le serveur les aurait sans déplacement.
    const live = tab.columns.filter((column) => !column.removed)
    const natural = [...live.filter((column) => column.original).sort((left, right) => (left.originalIndex ?? 0) - (right.originalIndex ?? 0)), ...live.filter((column) => !column.original)]
    if (live.some((column, index) => column.id !== natural[index].id)) operations.push({ op: "order-columns", tab: tab.original, headers: live.map((column) => column.header.trim()) })
    if (tab.itemLabel !== undefined && (tab.itemLabel ?? "").trim() !== (tab.originalItemLabel ?? "").trim()) operations.push({ op: "tab-label", tab: tab.original, label: tab.itemLabel.trim() })
    if (tab.name.trim() !== tab.original) operations.push({ op: "rename-tab", tab: tab.original, to: tab.name.trim() })
  }
  const liveTabs = tabs.filter((tab) => !tab.removed)
  const naturalTabs = [...originalTabOrder.flatMap((name) => liveTabs.filter((tab) => tab.original === name)), ...liveTabs.filter((tab) => !tab.original)]
  if (liveTabs.some((tab, index) => tab.id !== naturalTabs[index]?.id)) operations.push({ op: "order-tabs", tabs: liveTabs.map((tab) => tab.name.trim()) })
  return operations
}

/**
 * La colonne « Onglet » des vues qui couvrent plusieurs onglets (« Tout ») : son libellé, sa
 * place, masquée ou non, et les onglets vers lesquels une ligne peut être déplacée.
 */
/** Les types dont une case peut recevoir une valeur d'office à l'ajout d'une ligne. */
const DEFAULT_VALUE_KINDS = new Set<IndexColumnKind>(["rich", "number", "checkbox", "choice", "color", "fixed", "tab-sort", "linked-choice"])

function describe(operation: SchemaOperation) {
  const text = describeOperation(operation)
  return "force" in operation && operation.force ? `${text} · colonne déverrouillée` : text
}

function describeOperation(operation: SchemaOperation) {
  switch (operation.op) {
    case "add-tab": return `Nouvel onglet « ${operation.name} » (${operation.columns.length} colonne${operation.columns.length > 1 ? "s" : ""} en plus de Nom et ID)`
    case "remove-tab": return `Onglet « ${operation.tab} » mis à la corbeille`
    case "add-column": return `Nouvelle colonne « ${operation.header} » : ${columnTypeLabel(operation.spec)} (${operation.tab})`
    case "remove-column": return `Colonne « ${operation.header} » mise à la corbeille (${operation.tab})`
    case "rename": return `« ${operation.header} » renommée « ${operation.to} » (${operation.tab})`
    case "spec": return `« ${operation.header} » : ${columnTypeLabel(operation.spec)} (${operation.tab})`
    case "order-columns": return `Nouvel ordre des colonnes de « ${operation.tab} »`
    case "rename-tab": return `Onglet « ${operation.tab} » renommé « ${operation.to} »`
    case "order-tabs": return `Nouvel ordre des onglets : ${operation.tabs.join(", ")}`
    case "tab-label": return `Onglet « ${operation.tab} » : une ligne s’appelle « ${operation.label || "(par défaut)"} »`
    case "tab-column": return `Colonne « Onglet » de la vue « Tout » : ${[operation.settings.hidden ? "masquée" : `« ${operation.settings.label || "Onglet"} »`, operation.settings.after ? `après « ${operation.settings.after} »` : "", operation.settings.targets ? `onglets d’arrivée : ${operation.settings.targets.join(", ") || "aucun"}` : ""].filter(Boolean).join(", ")}`
  }
}

/** Le réglage par défaut d'un type fraîchement choisi. */
function defaultSpec(kind: IndexColumnKind, targets: RelationTarget[], relations: DraftColumn[]): IndexColumnSpec {
  const target = targets[0]
  switch (kind) {
    case "rich": return { kind: "rich" }
    case "name": return { kind: "name", style: { bold: true } }
    case "name-form": return { kind: "name-form", style: { bold: true } }
    case "number": return { kind: "number", number: { unit: "none" } }
    case "choice": return { kind: "choice", options: [] }
    case "checkbox": return { kind: "checkbox" }
    case "linked-choice": return { kind: "linked-choice", source: { index: target?.index ?? "peoples", tab: target?.tabs[0]?.name ?? "" } }
    case "linked": return { kind: "linked", link: { index: target?.index ?? "peoples", tab: "*", column: "" } }
    case "file": return { kind: "file", file: { accept: "any", multiple: true } }
    case "color": return { kind: "color" }
    case "gauge": return { kind: "gauge", gauge: { style: "icons", max: 5, scale: "column", icon: "star" } }
    case "glyph": return { kind: "glyph", glyph: { filled: true } }
    case "lookup": return { kind: "lookup", lookup: { via: relations[0]?.header ?? "", field: "" } }
    case "rollup": return { kind: "rollup", rollup: { via: relations[0]?.header ?? "", fn: "count" } }
    case "formula": return { kind: "formula", formula: { expression: "", result: "auto" } }
    case "random": return { kind: "random", random: { source: "dice", dice: "1d20", mode: "reroll" } }
    case "actions": return { kind: "actions", actions: [{ id: nextId(), label: "Bouton", icon: "zap", steps: [] }] }
    case "spells": return { kind: "spells", spells: { source: "all" } }
    default: return { kind }
  }
}

const sectionTitle = "text-[11px] font-semibold uppercase tracking-[.14em] text-muted-foreground"
const smallLabel = "grid gap-1 text-[11px] font-semibold text-muted-foreground"
const box = "grid gap-3 rounded-xl border bg-card/60 p-3"

/** Des pastilles de couleur, plus une couleur libre. */
function ColorSwatches({ value, onChange, disabled = false, allowNone = true, allowMuted = false }: { value?: string; onChange: (value: string | undefined) => void; disabled?: boolean; allowNone?: boolean; allowMuted?: boolean }) {
  return <div className="flex flex-wrap items-center gap-1">
    {allowNone && <button type="button" disabled={disabled} onClick={() => onChange(undefined)} className={`grid size-6 place-items-center rounded-full border text-[10px] text-muted-foreground ${!value ? "ring-2 ring-primary" : ""}`} title="Aucune">—</button>}
    {stylePalette.filter((color) => allowMuted || color.value !== "muted").map((color) => <button key={color.value} type="button" disabled={disabled} onClick={() => onChange(color.value)} title={color.label} aria-label={color.label} className={`size-6 rounded-full border ${value === color.value ? "ring-2 ring-primary ring-offset-1" : ""}`} style={color.value === "muted" ? { background: "var(--muted)" } : { backgroundColor: color.value }} />)}
    <label className="relative size-6 cursor-pointer overflow-hidden rounded-full border" title="Autre couleur" style={{ background: value && value.startsWith("#") && !stylePalette.some((color) => color.value === value) ? value : "conic-gradient(red, yellow, lime, cyan, blue, magenta, red)" }}>
      <input type="color" disabled={disabled} value={value?.startsWith("#") ? value : "#927640"} onChange={(event) => onChange(event.target.value)} className="absolute inset-0 cursor-pointer opacity-0" />
    </label>
  </div>
}

// ---------------------------------------------------------------------------
// Réglages par type
// ---------------------------------------------------------------------------

type SettingsProps = {
  spec: IndexColumnSpec
  onChange: (spec: IndexColumnSpec) => void
  disabled: boolean
  targets: RelationTarget[]
  /** Les autres colonnes de l'onglet (relations, maximum de jauge, formules…). */
  siblings: DraftColumn[]
  tabs: DraftTab[]
  family: IndexEditorModel["family"]
  indexKey: string
  sampleRows: Array<Record<string, string>>
  openGuide: (section: GuideSection) => void
  /** L'apparence (couleurs, groupes, ordre des options) : modifiable même quand le type est verrouillé. */
  lookDisabled?: boolean
}

function NumberFormatSettings({ spec, onChange, disabled }: Pick<SettingsProps, "spec" | "onChange" | "disabled">) {
  const format = spec.number ?? {}
  const family = format.unit ?? "none"
  const set = (changes: Partial<NonNullable<IndexColumnSpec["number"]>>) => onChange({ ...spec, number: { ...format, ...changes } })
  return <div className="grid gap-2 sm:grid-cols-3">
    <label className={smallLabel}>Unité<NativeSelect disabled={disabled} value={family} onChange={(event) => set({ unit: event.target.value as UnitFamily, defaultUnit: event.target.value === "none" ? undefined : unitFamilies[event.target.value as Exclude<UnitFamily, "none">].units[0].code })}>
      <NativeSelectOption value="none">Aucune (nombre simple)</NativeSelectOption>
      {Object.entries(unitFamilies).map(([key, value]) => <NativeSelectOption key={key} value={key}>{value.label}</NativeSelectOption>)}
    </NativeSelect></label>
    {family !== "none" && <label className={smallLabel}>Unité par défaut<NativeSelect disabled={disabled} value={format.defaultUnit ?? ""} onChange={(event) => set({ defaultUnit: event.target.value })}>
      {unitFamilies[family].units.map((unit) => <NativeSelectOption key={unit.code} value={unit.code}>{unit.code} — {unit.title}</NativeSelectOption>)}
    </NativeSelect></label>}
    <label className={smallLabel}>Décimales<Input disabled={disabled} type="number" min={0} max={4} value={format.decimals ?? ""} placeholder="Automatique" onChange={(event) => set({ decimals: event.target.value === "" ? undefined : Math.max(0, Math.min(4, Number(event.target.value))) })} /></label>
    {family === "none" && <>
      <label className={smallLabel}>Texte avant<Input disabled={disabled} value={format.prefix ?? ""} placeholder="~" onChange={(event) => set({ prefix: event.target.value || undefined })} /></label>
      <label className={smallLabel}>Texte après<Input disabled={disabled} value={format.suffix ?? ""} placeholder="PV, kg…" onChange={(event) => set({ suffix: event.target.value || undefined })} /></label>
    </>}
    <label className="flex items-center gap-2 text-xs"><Checkbox disabled={disabled} checked={Boolean(format.range)} onCheckedChange={(checked) => set({ range: checked === true })} />Plage (« 2–5 »)</label>
    {family === "none" && <label className="flex items-center gap-2 text-xs"><Checkbox disabled={disabled} checked={Boolean(format.percent)} onCheckedChange={(checked) => set({ percent: checked === true })} />Pourcentage</label>}
  </div>
}

function ListSettings({ spec, onChange, disabled, lookDisabled = disabled }: Pick<SettingsProps, "spec" | "onChange" | "disabled" | "lookDisabled">) {
  const options = spec.options ?? []
  const groups = spec.groups ?? []
  const [bulk, setBulk] = useState(false)
  const setOptions = (next: NonNullable<IndexColumnSpec["options"]>) => onChange({ ...spec, options: next })
  const move = (index: number, delta: number) => { const next = [...options]; const [item] = next.splice(index, 1); next.splice(Math.max(0, Math.min(next.length, index + delta)), 0, item); setOptions(next) }
  return <>
    <div className="flex flex-wrap gap-x-5 gap-y-2">
      <label className="flex items-center gap-2 text-xs"><Checkbox disabled={disabled} checked={Boolean(spec.multiple)} onCheckedChange={(checked) => onChange({ ...spec, multiple: checked === true })} /><span><b>Choix multiple</b> : plusieurs valeurs par case (étiquettes)</span></label>
      <label className="flex items-center gap-2 text-xs"><Checkbox disabled={disabled} checked={Boolean(spec.allowCustom)} onCheckedChange={(checked) => onChange({ ...spec, allowCustom: checked === true })} /><span><b>Ajout libre</b> : accepter une valeur hors liste</span></label>
    </div>
    <div className="grid gap-1.5">
      <div className="flex items-center justify-between"><p className={smallLabel}>Options ({options.length})</p><Button type="button" variant="ghost" size="sm" disabled={disabled} onClick={() => setBulk(!bulk)}><ListChecks />{bulk ? "Éditer une par une" : "Coller une liste"}</Button></div>
      {bulk
        ? <Textarea disabled={disabled} rows={6} value={options.map((option) => option.value).join("\n")} onChange={(event) => setOptions(event.target.value.split("\n").map((value) => value.trim()).filter(Boolean).map((value) => options.find((option) => option.value === value) ?? { value }))} placeholder="Une option par ligne" />
        : <ul className="grid gap-1">
          {options.map((option, index) => <li key={index} className="flex flex-wrap items-center gap-1.5 rounded-lg border bg-background/60 p-1.5">
            <span className="inline-flex max-w-40 truncate rounded-full border px-2 py-0.5 text-xs" style={pillStyle(option.color ?? groups.find((group) => option.group && foldName(group.name) === foldName(option.group))?.color)}>{option.value || "…"}</span>
            <Input disabled={disabled} value={option.value} onChange={(event) => setOptions(options.map((item, position) => position === index ? { ...item, value: event.target.value } : item))} className="h-7 w-40 text-xs" aria-label="Valeur" />
            <ColorSwatches disabled={lookDisabled} value={option.color} onChange={(color) => setOptions(options.map((item, position) => position === index ? { ...item, color } : item))} />
            {groups.length > 0 && <NativeSelect disabled={lookDisabled} value={option.group ?? ""} onChange={(event) => setOptions(options.map((item, position) => position === index ? { ...item, group: event.target.value || undefined } : item))} className="h-7 w-32 text-xs"><NativeSelectOption value="">Sans groupe</NativeSelectOption>{groups.map((group) => <NativeSelectOption key={group.name} value={group.name}>{group.name}</NativeSelectOption>)}</NativeSelect>}
            <span className="ml-auto flex">
              <Button type="button" variant="ghost" size="icon-xs" disabled={lookDisabled || index === 0} onClick={() => move(index, -1)} aria-label="Monter"><ArrowUp /></Button>
              <Button type="button" variant="ghost" size="icon-xs" disabled={lookDisabled || index === options.length - 1} onClick={() => move(index, 1)} aria-label="Descendre"><ArrowDown /></Button>
              <Button type="button" variant="ghost" size="icon-xs" className="text-destructive" disabled={disabled} onClick={() => setOptions(options.filter((_, position) => position !== index))} aria-label="Retirer"><Trash2 /></Button>
            </span>
          </li>)}
          <li><Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => setOptions([...options, { value: "" }])}><Plus />Ajouter une option</Button></li>
        </ul>}
    </div>
    <div className="grid gap-1.5 rounded-lg border border-dashed p-2">
      <p className={smallLabel}>Groupes (statut) — facultatif</p>
      <p className="text-xs text-muted-foreground">Range les options par étapes, dans l’ordre : « À faire », « En cours », « Fini ». Le menu les montre par groupe ; une option sans couleur prend celle de son groupe.</p>
      {groups.map((group, index) => <div key={index} className="flex flex-wrap items-center gap-1.5">
        <Input disabled={lookDisabled} value={group.name} onChange={(event) => onChange({ ...spec, groups: groups.map((item, position) => position === index ? { ...item, name: event.target.value } : item), options: options.map((option) => option.group === group.name ? { ...option, group: event.target.value } : option) })} className="h-7 w-40 text-xs" />
        <ColorSwatches disabled={lookDisabled} value={group.color} onChange={(color) => onChange({ ...spec, groups: groups.map((item, position) => position === index ? { ...item, color } : item) })} />
        <Button type="button" variant="ghost" size="icon-xs" className="text-destructive" disabled={lookDisabled} onClick={() => onChange({ ...spec, groups: groups.filter((_, position) => position !== index), options: options.map((option) => option.group === group.name ? { ...option, group: undefined } : option) })} aria-label="Retirer le groupe"><Trash2 /></Button>
      </div>)}
      <div><Button type="button" variant="ghost" size="sm" disabled={lookDisabled} onClick={() => onChange({ ...spec, groups: [...groups, { name: groups.length ? `Groupe ${groups.length + 1}` : "À faire" }] })}><Plus />Ajouter un groupe</Button></div>
    </div>
  </>
}

function GaugeSettingsEditor({ spec, onChange, disabled, siblings }: Pick<SettingsProps, "spec" | "onChange" | "disabled" | "siblings">) {
  const gauge: GaugeSettings = spec.gauge ?? { style: "icons", max: 5 }
  const scale = gaugeScaleOf(gauge)
  const set = (changes: Partial<GaugeSettings>) => onChange({ ...spec, gauge: { ...gauge, mode: undefined, ...changes } })
  const numeric = siblings.filter((column) => !column.removed && ["number", "gauge", "formula", "rollup"].includes(column.spec.kind))
  const scales: Array<{ value: GaugeSettings["scale"]; title: string; text: string }> = [
    { value: "column", title: "Même maximum pour toute la colonne", text: "La case dit combien est rempli : « 2 » sur 5 donne ✦✦✧✧✧." },
    { value: "cell", title: "Chaque case a sa propre jauge", text: "Le nombre tapé est le nombre d’icônes : « 3 » donne ✦✦✦ (les charges d’un sort)." },
    { value: "from-column", title: "Maximum lu dans une autre colonne", text: "« PV » se remplit sur « PV max » de la même ligne." },
  ]
  return <>
    <div className="grid gap-1.5">
      <p className={smallLabel}>Jusqu’où va la jauge ?</p>
      <div className="grid gap-1.5 md:grid-cols-3">
        {scales.map((item) => <button key={item.value} type="button" disabled={disabled} onClick={() => set({ scale: item.value })} className={`rounded-lg border p-2 text-left text-xs ${scale === item.value ? "border-primary bg-primary/10" : "hover:bg-muted"}`}><b>{item.title}</b><br /><span className="text-muted-foreground">{item.text}</span></button>)}
      </div>
    </div>
    <div className="grid gap-2 sm:grid-cols-3">
      <label className={smallLabel}>Affichage<NativeSelect disabled={disabled || scale === "cell"} value={scale === "cell" ? "icons" : gauge.style} onChange={(event) => set({ style: event.target.value as GaugeSettings["style"] })}>
        <NativeSelectOption value="icons">Icônes à cliquer</NativeSelectOption><NativeSelectOption value="bar">Barre à faire glisser</NativeSelectOption><NativeSelectOption value="ring">Anneau avec − et +</NativeSelectOption>
      </NativeSelect></label>
      {scale === "column" && <label className={smallLabel}>Maximum<Input disabled={disabled} type="number" min={1} max={gauge.style === "icons" ? 20 : 100000} value={gauge.max} onChange={(event) => set({ max: Math.max(1, Number(event.target.value) || 1) })} /></label>}
      {scale === "cell" && <label className={smallLabel}>Plus grand nombre proposé au clic<Input disabled={disabled} type="number" min={1} max={20} value={gauge.max} onChange={(event) => set({ max: Math.max(1, Math.min(20, Number(event.target.value) || 1)) })} /></label>}
      {scale === "from-column" && <label className={smallLabel}>Colonne du maximum<NativeSelect disabled={disabled} value={gauge.maxColumn ?? ""} onChange={(event) => set({ maxColumn: event.target.value || undefined })}><NativeSelectOption value="">— Choisir —</NativeSelectOption>{numeric.map((column) => <NativeSelectOption key={column.id} value={column.header}>{column.header}</NativeSelectOption>)}</NativeSelect></label>}
      {scale === "cell" && <label className={smallLabel}>Valeur « sans limite » (facultatif)<Input disabled={disabled} value={gauge.unlimited ?? ""} maxLength={3} placeholder="✦" onChange={(event) => set({ unlimited: event.target.value || undefined })} /></label>}
    </div>
    <div className="grid gap-2 sm:grid-cols-2">
      <div className={smallLabel}>Icône<IconPicker disabled={disabled} icon={gauge.icon} emoji={gauge.emoji} onChange={(value) => set({ icon: value.icon, emoji: value.emoji })} /></div>
      <div className={smallLabel}>Couleur<ColorSwatches disabled={disabled || Boolean(gauge.levels)} value={gauge.color} onChange={(color) => set({ color })} /></div>
      {!gauge.emoji?.trim() && <div className={smallLabel}>Couleur des traits (icône pleine)<ColorSwatches disabled={disabled} value={gauge.strokeColor} onChange={(strokeColor) => set({ strokeColor })} /><span className="text-[10px] font-normal text-muted-foreground">« — » : traits clairs, comme découpés dans l’icône.</span></div>}
    </div>
    <label className="flex items-center gap-2 text-xs"><Checkbox disabled={disabled} checked={Boolean(gauge.perRow)} onCheckedChange={(checked) => set({ perRow: checked === true || undefined })} />Icône et couleur choisies ligne par ligne (celles ci-dessus servent par défaut)</label>
    {scale !== "cell" && <label className="flex items-center gap-2 text-xs"><Checkbox disabled={disabled} checked={Boolean(gauge.levels)} onCheckedChange={(checked) => set({ levels: checked === true })} />Couleur selon le niveau : rouge quand c’est bas, vert quand c’est plein</label>}
    <div className="flex items-center gap-2 rounded-lg bg-muted/30 px-3 py-2 text-xs"><span className="text-muted-foreground">Aperçu :</span><span className="flex gap-0.5" style={{ color: gauge.color || "var(--primary)" }}>{Array.from({ length: scale === "cell" ? 3 : Math.min(gauge.max || 5, 10) }, (_, index) => <IndexIconGlyph key={index} icon={gauge.icon} emoji={gauge.emoji} stroke={gauge.strokeColor} filled={scale === "cell" || index < Math.ceil((gauge.max || 5) / 2)} />)}</span></div>
  </>
}

function FormulaEditor({ spec, onChange, disabled, siblings, sampleRows, openGuide }: Pick<SettingsProps, "spec" | "onChange" | "disabled" | "siblings" | "sampleRows" | "openGuide">) {
  const formula = spec.formula ?? { expression: "", result: "auto" as FormulaResult }
  const [search, setSearch] = useState("")
  const set = (changes: Partial<NonNullable<IndexColumnSpec["formula"]>>) => onChange({ ...spec, formula: { ...formula, ...changes } })
  const insert = (text: string) => set({ expression: `${formula.expression}${formula.expression && !/\s$/.test(formula.expression) ? " " : ""}${text}` })
  const problem = formula.expression.trim() ? formulaProblem(formula.expression) : ""
  const columns = siblings.filter((column) => !column.removed)
  const matches = search.trim() ? formulaFunctions.filter((definition) => foldName(`${definition.name} ${definition.description}`).includes(foldName(search))).slice(0, 8) : []
  const previews = sampleRows.slice(0, 3).map((row, index) => {
    const byName = new Map(columns.map((column) => [foldName(column.header), column]))
    const display = computeFormulaDisplay(formula.expression, {
      column: (name) => { const column = byName.get(foldName(name)); if (!column) return undefined; return columnFormulaValue(row[column.original ?? column.header] ?? "", column.spec) },
      columnInfo: (name) => { const column = byName.get(foldName(name)); return column ? { raw: row[column.original ?? column.header] ?? "", spec: column.spec } : undefined },
      random: seededRandom(`${index}:${formula.expression}`),
      rowNumber: index + 2,
    }, formula.result, spec.number)
    return { name: (row["Nom"] ?? "").replace(/<[^>]+>/g, "") || `Ligne ${index + 2}`, display }
  })
  return <>
    <div className="flex items-center justify-between gap-2"><p className={smallLabel}>Formule</p><Button type="button" variant="ghost" size="sm" onClick={() => openGuide("formulas")}><CircleHelp />Toutes les fonctions</Button></div>
    <Textarea disabled={disabled} rows={3} value={formula.expression} onChange={(event) => set({ expression: event.target.value })} placeholder={"SI({Rang} >= 3; \"Élite\"; \"Commun\")"} className="font-mono text-sm" spellCheck={false} />
    {problem ? <p className="rounded-lg bg-destructive/5 px-2 py-1 text-xs text-destructive">{problem}</p> : formula.expression.trim() ? <p className="text-xs text-emerald-700 dark:text-emerald-400">Formule bien écrite.</p> : null}
    <div className="grid gap-1">
      <p className={smallLabel}>Insérer une colonne</p>
      <div className="flex flex-wrap gap-1">{columns.map((column) => <button key={column.id} type="button" disabled={disabled} onClick={() => insert(`{${column.header}}`)} className="rounded-full border px-2 py-0.5 text-[11px] hover:bg-muted">{`{${column.header}}`}</button>)}</div>
    </div>
    <div className="grid gap-1">
      <p className={smallLabel}>Insérer une fonction</p>
      <Input disabled={disabled} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Chercher : arrondi, texte, hasard, relation…" className="h-8 text-xs" />
      {matches.map((definition) => <button key={definition.name} type="button" disabled={disabled} onClick={() => { insert(definition.signature.replace(/\(.*\)$/, "(")); setSearch("") }} className="rounded-lg border px-2 py-1 text-left text-xs hover:bg-muted"><b className="font-mono">{definition.signature}</b> — <span className="text-muted-foreground">{definition.description}</span></button>)}
    </div>
    <div className="grid gap-2 sm:grid-cols-2">
      <label className={smallLabel}>Type du résultat<NativeSelect disabled={disabled} value={formula.result ?? "auto"} onChange={(event) => set({ result: event.target.value as FormulaResult })}>{Object.entries(formulaResultLabels).map(([key, label]) => <NativeSelectOption key={key} value={key}>{label}</NativeSelectOption>)}</NativeSelect></label>
    </div>
    {(formula.result === "number" || formula.result === "auto") && <div className="grid gap-1"><p className={smallLabel}>Format du nombre</p><NumberFormatSettings spec={spec} onChange={onChange} disabled={disabled} /></div>}
    {formula.expression.trim() && !problem && previews.length > 0 && <div className="grid gap-1 rounded-lg bg-muted/30 p-2 text-xs">
      <p className="font-semibold">Aperçu sur les premières lignes</p>
      {previews.map((preview) => <p key={preview.name} className="flex gap-2"><span className="w-32 truncate text-muted-foreground">{preview.name}</span><span className={preview.display.kind === "error" ? "text-destructive" : "font-semibold"}>{preview.display.kind === "error" ? `#ERREUR : ${preview.display.message}` : preview.display.kind === "checkbox" ? (preview.display.value ? "VRAI" : "FAUX") : formulaDisplayText(preview.display) || "(vide)"}</span></p>)}
    </div>}
  </>
}

function RandomSettingsEditor({ spec, onChange, disabled, siblings, targets, indexKey, openGuide }: Pick<SettingsProps, "spec" | "onChange" | "disabled" | "siblings" | "targets" | "indexKey" | "openGuide">) {
  const random: RandomSettings = spec.random ?? { source: "dice", dice: "1d20" }
  const set = (changes: Partial<RandomSettings>) => onChange({ ...spec, random: { ...random, ...changes } })
  const index = random.index ?? { index: "self" as const, tab: "*" }
  const target = index.index === "self" || index.index === indexKey ? targets.find((item) => item.index === indexKey) : targets.find((item) => item.index === index.index)
  const targetColumns = [...new Set((target?.tabs ?? []).filter((tab) => index.tab === "*" || tab.name === index.tab).flatMap((tab) => tab.columns))]
  return <>
    <div className="flex items-center justify-between"><p className={smallLabel}>Ce qu’on tire</p><Button type="button" variant="ghost" size="sm" onClick={() => openGuide("random")}><CircleHelp />Aide</Button></div>
    <div className="grid gap-1.5 md:grid-cols-2">
      {(Object.keys(randomSourceLabels) as RandomSource[]).map((source) => <button key={source} type="button" disabled={disabled} onClick={() => set({ source })} className={`rounded-lg border px-2 py-1.5 text-left text-xs ${random.source === source ? "border-primary bg-primary/10 font-semibold" : "hover:bg-muted"}`}>{randomSourceLabels[source]}</button>)}
    </div>
    {random.source === "number" && <div className="grid gap-2 sm:grid-cols-3">
      <label className={smallLabel}>Minimum<Input disabled={disabled} type="number" value={random.min ?? 1} onChange={(event) => set({ min: Number(event.target.value) })} /></label>
      <label className={smallLabel}>Maximum<Input disabled={disabled} type="number" value={random.max ?? 20} onChange={(event) => set({ max: Number(event.target.value) })} /></label>
      <label className={smallLabel}>Décimales<Input disabled={disabled} type="number" min={0} max={4} value={random.decimals ?? 0} onChange={(event) => set({ decimals: Number(event.target.value) })} /></label>
    </div>}
    {random.source === "dice" && <label className={smallLabel}>Jet<Input disabled={disabled} value={random.dice ?? ""} placeholder="2d6+1" onChange={(event) => set({ dice: event.target.value })} /></label>}
    {random.source === "list" && <div className="grid gap-1">
      <p className={smallLabel}>Options et poids (un poids 3 sort trois fois plus souvent qu’un poids 1 ; 0 ne sort jamais)</p>
      {(random.options ?? []).map((option, position) => <div key={position} className="flex items-center gap-1.5">
        <Input disabled={disabled} value={option.value} onChange={(event) => set({ options: (random.options ?? []).map((item, index) => index === position ? { ...item, value: event.target.value } : item) })} className="h-8 flex-1 text-sm" placeholder="Pluie" />
        <Input disabled={disabled} type="number" min={0} value={option.weight ?? 1} onChange={(event) => set({ options: (random.options ?? []).map((item, index) => index === position ? { ...item, weight: Math.max(0, Number(event.target.value)) } : item) })} className="h-8 w-20 text-sm" aria-label="Poids" />
        <Button type="button" variant="ghost" size="icon-xs" className="text-destructive" disabled={disabled} onClick={() => set({ options: (random.options ?? []).filter((_, index) => index !== position) })} aria-label="Retirer"><Trash2 /></Button>
      </div>)}
      <div><Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => set({ options: [...(random.options ?? []), { value: "", weight: 1 }] })}><Plus />Ajouter une option</Button></div>
    </div>}
    {random.source === "index" && <div className="grid gap-2 sm:grid-cols-2">
      <label className={smallLabel}>Index<NativeSelect disabled={disabled} value={index.index === indexKey ? "self" : index.index} onChange={(event) => set({ index: { ...index, index: event.target.value as NonNullable<RandomSettings["index"]>["index"], tab: "*" } })}>
        <NativeSelectOption value="self">Cet index</NativeSelectOption>
        {targets.filter((item) => item.index !== indexKey).map((item) => <NativeSelectOption key={item.index} value={item.index}>{item.title}</NativeSelectOption>)}
      </NativeSelect></label>
      <label className={smallLabel}>Onglet<NativeSelect disabled={disabled} value={index.tab} onChange={(event) => set({ index: { ...index, tab: event.target.value } })}><NativeSelectOption value="*">Tous les onglets</NativeSelectOption>{(target?.tabs ?? []).map((tab) => <NativeSelectOption key={tab.name} value={tab.name}>{tab.name}</NativeSelectOption>)}</NativeSelect></label>
      <label className={`${smallLabel} sm:col-span-2`}>Condition (formule sur les colonnes de l’index tiré, facultative)<Input disabled={disabled} value={index.filter ?? ""} onChange={(event) => set({ index: { ...index, filter: event.target.value || undefined } })} placeholder={"{Emplacement principal} = \"Forêt\""} className="font-mono text-xs" /></label>
      <label className={smallLabel}>Colonne de poids (facultative)<NativeSelect disabled={disabled} value={index.weightColumn ?? ""} onChange={(event) => set({ index: { ...index, weightColumn: event.target.value || undefined } })}><NativeSelectOption value="">Aucune : même chance pour tous</NativeSelectOption>{targetColumns.map((column) => <NativeSelectOption key={column} value={column}>{column}</NativeSelectOption>)}</NativeSelect></label>
      <label className={smallLabel}>Colonne à écrire<NativeSelect disabled={disabled} value={index.field ?? ""} onChange={(event) => set({ index: { ...index, field: event.target.value || undefined } })}><NativeSelectOption value="">Le Nom</NativeSelectOption>{targetColumns.map((column) => <NativeSelectOption key={column} value={column}>{column}</NativeSelectOption>)}</NativeSelect></label>
    </div>}
    {random.source === "column" && <label className={smallLabel}>Colonne de la ligne<NativeSelect disabled={disabled} value={random.column ?? ""} onChange={(event) => set({ column: event.target.value })}><NativeSelectOption value="">— Choisir —</NativeSelectOption>{siblings.filter((column) => !column.removed).map((column) => <NativeSelectOption key={column.id} value={column.header}>{column.header}</NativeSelectOption>)}</NativeSelect></label>}
    {random.source === "formula" && <label className={smallLabel}>Formule<Textarea disabled={disabled} rows={2} value={random.formula ?? ""} onChange={(event) => set({ formula: event.target.value })} placeholder={"TIRER(\"Pluie\"; \"Soleil\"; \"Brume\") & \" \" & ALEA.ENTRE(1; 10) & \"°C\""} className="font-mono text-xs" /></label>}
    <div className="grid gap-2 sm:grid-cols-3">
      <label className={smallLabel}>Nombre de tirages<Input disabled={disabled} type="number" min={1} max={50} value={random.count ?? 1} onChange={(event) => set({ count: Math.max(1, Math.min(50, Number(event.target.value) || 1)) })} /></label>
      <label className="flex items-center gap-2 self-end pb-2 text-xs"><Checkbox disabled={disabled} checked={Boolean(random.unique)} onCheckedChange={(checked) => set({ unique: checked === true })} />Sans doublon</label>
    </div>
    <div className="grid gap-1.5 md:grid-cols-2">
      <button type="button" disabled={disabled} onClick={() => set({ mode: "reroll" })} className={`rounded-lg border p-2 text-left text-xs ${random.mode !== "fixed" ? "border-primary bg-primary/10" : "hover:bg-muted"}`}><b>Relançable</b><br /><span className="text-muted-foreground">Le dé reste dans la case : chaque clic retire.</span></button>
      <button type="button" disabled={disabled} onClick={() => set({ mode: "fixed" })} className={`rounded-lg border p-2 text-left text-xs ${random.mode === "fixed" ? "border-primary bg-primary/10" : "hover:bg-muted"}`}><b>Figé</b><br /><span className="text-muted-foreground">Une fois tiré, le résultat ne bouge plus (vider la case pour retirer).</span></button>
    </div>
  </>
}

function StepFields({ step, onChange, disabled, siblings, tabs, targets, indexKey }: { step: ActionStep; onChange: (step: ActionStep) => void; disabled: boolean; siblings: DraftColumn[]; tabs: DraftTab[]; targets: RelationTarget[]; indexKey: string }) {
  const info = stepInfo(step.type)
  const record = step as unknown as Record<string, unknown>
  const set = (key: string, value: unknown) => onChange({ ...step, [key]: value } as ActionStep)
  const columns = siblings.filter((column) => !column.removed)
  const createTarget = step.type === "create" ? targets.find((item) => item.index === step.index) : undefined
  return <div className="grid gap-2 sm:grid-cols-2">
    {info.fields.map((field) => {
      const value = record[field.key]
      if (field.kind === "column") return <label key={field.key} className={smallLabel}>{field.label}<NativeSelect disabled={disabled} value={String(value ?? "")} onChange={(event) => set(field.key, event.target.value)}><NativeSelectOption value="">— Choisir —</NativeSelectOption>{columns.filter((column) => step.type !== "toggle" || column.spec.kind === "checkbox").filter((column) => step.type !== "roll" || column.spec.kind === "random").filter((column) => step.type !== "open-linked" || column.spec.kind === "linked" || column.spec.kind === "linked-choice").map((column) => <NativeSelectOption key={column.id} value={column.header}>{column.header}</NativeSelectOption>)}</NativeSelect></label>
      if (field.kind === "tab") return <label key={field.key} className={smallLabel}>{field.label}<NativeSelect disabled={disabled} value={String(value ?? "")} onChange={(event) => set(field.key, event.target.value)}><NativeSelectOption value="">— Choisir —</NativeSelectOption>{(step.type === "create" ? createTarget?.tabs.map((tab) => tab.name) ?? [] : tabs.filter((tab) => !tab.removed).map((tab) => tab.name)).map((name) => <NativeSelectOption key={name} value={name}>{name}</NativeSelectOption>)}</NativeSelect></label>
      if (field.kind === "index") return <label key={field.key} className={smallLabel}>{field.label}<NativeSelect disabled={disabled} value={String(value ?? "")} onChange={(event) => onChange({ ...step, [field.key]: event.target.value, ...(step.type === "create" ? { tab: "", values: {} } : {}) } as ActionStep)}><NativeSelectOption value="">— Choisir —</NativeSelectOption>{targets.map((item) => <NativeSelectOption key={item.index} value={item.index}>{item.index === indexKey ? `${item.title} (celui-ci)` : item.title}</NativeSelectOption>)}</NativeSelect></label>
      if (field.kind === "audience") return <label key={field.key} className={smallLabel}>{field.label}<NativeSelect disabled={disabled} value={String(value ?? "public")} onChange={(event) => set(field.key, event.target.value)}><NativeSelectOption value="public">Tout le monde</NativeSelectOption><NativeSelectOption value="gm">Le MJ seulement</NativeSelectOption></NativeSelect></label>
      if (field.kind === "boolean") return <label key={field.key} className="flex items-center gap-2 self-end pb-2 text-xs"><Checkbox disabled={disabled} checked={Boolean(value)} onCheckedChange={(checked) => set(field.key, checked === true)} />{field.label}</label>
      if (field.kind === "mapping") {
        const values = (value ?? {}) as Record<string, string>
        const tab = step.type === "create" ? createTarget?.tabs.find((item) => item.name === step.tab) ?? createTarget?.tabs[0] : undefined
        return <div key={field.key} className="grid gap-1 sm:col-span-2">
          <p className={smallLabel}>{field.label} (texte, {"{Colonne}"} de cette ligne, ou =formule ; vide = rien)</p>
          {(tab?.columns ?? []).filter((header) => !["id", "identifiant"].includes(foldName(header))).map((header) => <label key={header} className="grid grid-cols-[9rem_minmax(0,1fr)] items-center gap-2 text-xs"><span className="truncate font-medium">{header}</span><Input disabled={disabled} value={values[header] ?? ""} onChange={(event) => set(field.key, { ...values, [header]: event.target.value })} className="h-8 font-mono text-xs" placeholder={foldName(header) === "nom" ? "{Nom} (copie)" : ""} /></label>)}
          {!tab && <p className="text-xs text-muted-foreground">Choisis d’abord l’index.</p>}
        </div>
      }
      return <label key={field.key} className={`${smallLabel} ${field.kind === "text" ? "sm:col-span-2" : ""}`}>{field.label}<Input disabled={disabled} value={String(value ?? "")} onChange={(event) => set(field.key, event.target.value)} placeholder={field.hint} className={field.kind !== "text" ? "font-mono text-xs" : ""} /></label>
    })}
  </div>
}

function ButtonsEditor({ spec, onChange, disabled, siblings, tabs, targets, family, indexKey, openGuide }: Pick<SettingsProps, "spec" | "onChange" | "disabled" | "siblings" | "tabs" | "targets" | "family" | "indexKey" | "openGuide">) {
  const buttons = spec.actions ?? []
  const setButtons = (next: ActionButton[]) => onChange({ ...spec, actions: next })
  const update = (id: string, changes: Partial<ActionButton>) => setButtons(buttons.map((button) => button.id === id ? { ...button, ...changes } : button))
  const available = actionStepCatalog.filter((step) => !step.only || (step.only === "objects" ? family === "objects" : family !== "objects"))
  const groups = [...new Set(available.map((step) => step.group))]
  return <>
    <div className="flex items-center justify-between"><p className={smallLabel}>Boutons ({buttons.length})</p><Button type="button" variant="ghost" size="sm" onClick={() => openGuide("buttons")}><CircleHelp />Toutes les actions</Button></div>
    {buttons.map((button, index) => <div key={button.id} className="grid gap-2 rounded-xl border bg-background/60 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex h-7 items-center gap-1 rounded-md border px-2 text-xs font-semibold" style={pillStyle(button.color || "#927640")}><IndexIconGlyph icon={button.icon || "zap"} className="size-3.5" filled={false} />{!button.iconOnly && (button.label || "Bouton")}</span>
        <span className="ml-auto flex">
          <Button type="button" variant="ghost" size="icon-xs" disabled={disabled || index === 0} onClick={() => { const next = [...buttons]; next.splice(index - 1, 0, next.splice(index, 1)[0]); setButtons(next) }} aria-label="Monter"><ArrowUp /></Button>
          <Button type="button" variant="ghost" size="icon-xs" disabled={disabled || index === buttons.length - 1} onClick={() => { const next = [...buttons]; next.splice(index + 1, 0, next.splice(index, 1)[0]); setButtons(next) }} aria-label="Descendre"><ArrowDown /></Button>
          <Button type="button" variant="ghost" size="icon-xs" disabled={disabled} onClick={() => setButtons([...buttons.slice(0, index + 1), { ...button, id: nextId(), label: `${button.label} (copie)` }, ...buttons.slice(index + 1)])} aria-label="Dupliquer"><Copy /></Button>
          <Button type="button" variant="ghost" size="icon-xs" className="text-destructive" disabled={disabled} onClick={() => setButtons(buttons.filter((item) => item.id !== button.id))} aria-label="Supprimer le bouton"><Trash2 /></Button>
        </span>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className={smallLabel}>Libellé<Input disabled={disabled} value={button.label} onChange={(event) => update(button.id, { label: event.target.value })} /></label>
        <div className={smallLabel}>Icône<IconPicker disabled={disabled} icon={button.icon} onChange={(value) => update(button.id, { icon: value.icon })} /></div>
        <div className={smallLabel}>Couleur<ColorSwatches disabled={disabled} value={button.color} onChange={(color) => update(button.id, { color })} /></div>
        <label className="flex items-center gap-2 self-end pb-2 text-xs"><Checkbox disabled={disabled} checked={Boolean(button.iconOnly)} onCheckedChange={(checked) => update(button.id, { iconOnly: checked === true })} />Icône seule (libellé au survol)</label>
        <label className={`${smallLabel} sm:col-span-2`}>Confirmation (facultative)<Input disabled={disabled} value={button.confirm ?? ""} onChange={(event) => update(button.id, { confirm: event.target.value || undefined })} placeholder="Supprimer {Nom} ?" /></label>
        <label className={`${smallLabel} sm:col-span-2`}>Afficher seulement si (formule, facultative)<Input disabled={disabled} value={button.condition ?? ""} onChange={(event) => update(button.id, { condition: event.target.value || undefined })} placeholder="{Charges} > 0" className="font-mono text-xs" /></label>
      </div>
      <div className="grid gap-2">
        <p className={smallLabel}>Étapes, dans l’ordre</p>
        {button.steps.map((step, position) => <div key={position} className="grid gap-2 rounded-lg border border-dashed p-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="grid size-5 place-items-center rounded-full bg-primary/15 text-[10px] font-bold text-primary">{position + 1}</span>
            <NativeSelect disabled={disabled} value={step.type} onChange={(event) => update(button.id, { steps: button.steps.map((item, index) => index === position ? newStep(event.target.value as ActionStep["type"]) : item) })} className="h-8 w-64 text-xs">
              {groups.map((group) => <optgroup key={group} label={group}>{available.filter((item) => item.group === group).map((item) => <NativeSelectOption key={item.type} value={item.type}>{item.label}</NativeSelectOption>)}</optgroup>)}
            </NativeSelect>
            <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">{describeStep(step)}</span>
            <Button type="button" variant="ghost" size="icon-xs" disabled={disabled || position === 0} onClick={() => { const steps = [...button.steps]; steps.splice(position - 1, 0, steps.splice(position, 1)[0]); update(button.id, { steps }) }} aria-label="Monter"><ArrowUp /></Button>
            <Button type="button" variant="ghost" size="icon-xs" disabled={disabled || position === button.steps.length - 1} onClick={() => { const steps = [...button.steps]; steps.splice(position + 1, 0, steps.splice(position, 1)[0]); update(button.id, { steps }) }} aria-label="Descendre"><ArrowDown /></Button>
            <Button type="button" variant="ghost" size="icon-xs" className="text-destructive" disabled={disabled} onClick={() => update(button.id, { steps: button.steps.filter((_, index) => index !== position) })} aria-label="Retirer l’étape"><Trash2 /></Button>
          </div>
          <p className="text-[11px] text-muted-foreground">{stepInfo(step.type).description}</p>
          <StepFields step={step} disabled={disabled} siblings={siblings} tabs={tabs} targets={targets} indexKey={indexKey} onChange={(next) => update(button.id, { steps: button.steps.map((item, index) => index === position ? next : item) })} />
        </div>)}
        <div><Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => update(button.id, { steps: [...button.steps, newStep("notify")] })}><Plus />Ajouter une étape</Button></div>
      </div>
    </div>)}
    <div className="flex flex-wrap items-center gap-2">
      <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => setButtons([...buttons, { id: nextId(), label: "Bouton", icon: "zap", steps: [] }])}><Plus />Ajouter un bouton</Button>
      {/* Des boutons tout faits, les mêmes dans tous les index. */}
      <NativeSelect disabled={disabled} value="" aria-label="Ajouter un bouton tout fait" onChange={(event) => { const preset = buttonPresets.find((item) => item.key === event.target.value); if (preset) setButtons([...buttons, { ...structuredClone(preset.button), id: nextId() }]) }} className="h-8 w-60 text-xs">
        <NativeSelectOption value="">+ Bouton tout fait…</NativeSelectOption>
        {buttonPresets.filter((preset) => !preset.only || (preset.only === "objects" ? family === "objects" : family !== "objects")).map((preset) => <NativeSelectOption key={preset.key} value={preset.key} title={preset.description}>{preset.label}</NativeSelectOption>)}
      </NativeSelect>
    </div>
  </>
}

function TypeSettings(props: SettingsProps) {
  const { spec, onChange, disabled, targets, siblings } = props
  const set = (changes: Partial<IndexColumnSpec>) => onChange({ ...spec, ...changes })
  const targetOf = (index: string | undefined) => targets.find((target) => target.index === index)
  const relations = siblings.filter((column) => !column.removed && (column.spec.kind === "linked" || column.spec.kind === "linked-choice"))
  switch (spec.kind) {
    case "rich": return <div className="grid gap-2">
      <p className="text-xs text-muted-foreground">Chaque case garde sa mise en forme. Pour un style commun à toute la colonne (et sans mise en forme propre à chaque case), règle le « Style imposé » plus bas.</p>
      <label className="flex items-center gap-2 text-xs"><Checkbox disabled={disabled} checked={Boolean(spec.htmlText)} onCheckedChange={(checked) => set({ htmlText: checked === true || undefined })} /><span><b>Mise en forme gardée en HTML</b> : la case contient le HTML tel quel (listes, paragraphes), pour une page qui le lit ; Sheets montre alors les balises.</span></label>
    </div>
    case "name-form": return <p className="text-xs text-muted-foreground">Un clic sur le nom ouvre la fiche de la ligne, avec tous ses champs (masqués compris, rangés selon sa mise en page). Le nom se modifie dans la fiche, qui s’enregistre d’elle-même.</p>
    case "number": return <NumberFormatSettings spec={spec} onChange={onChange} disabled={disabled} />
    case "checkbox": return <label className="flex items-center gap-2 text-xs"><Checkbox disabled={disabled} checked={Boolean(spec.emptyChecked)} onCheckedChange={(checked) => set({ emptyChecked: checked === true })} />Une case vide compte comme cochée (comme « Actif » des items)</label>
    case "color": return <p className="text-xs text-muted-foreground">Une pastille et un sélecteur de couleur ; la feuille garde le code (#aa3355).</p>
    case "glyph": return <div className="grid gap-2 text-xs">
      <p className="text-muted-foreground">Chaque case propose toutes les icônes (recherche en français ou en anglais) ou un émoji ; la feuille garde le nom de l’icône.</p>
      <div className="grid gap-1"><span className="font-semibold">Couleur</span><ColorSwatches value={spec.glyph?.color} disabled={disabled} onChange={(color) => set({ glyph: { ...spec.glyph, color } })} /></div>
      <label className="flex items-center gap-2"><Checkbox disabled={disabled} checked={spec.glyph?.filled !== false} onCheckedChange={(checked) => set({ glyph: { ...spec.glyph, filled: checked === true } })} />Icône pleine (décochée : seulement son contour)</label>
    </div>
    case "tab-sort": return <p className="text-xs text-muted-foreground">Chaque valeur devient un onglet qui porte son nom et montre les lignes qui l’ont. La ligne reste dans son onglet et apparaît en plus dans celui de sa valeur : rien n’est déplacé dans Sheets. La liste propose les valeurs déjà utilisées ; une valeur nouvelle crée son onglet.</p>
    case "choice": return <ListSettings spec={spec} onChange={onChange} disabled={disabled} lookDisabled={props.lookDisabled ?? disabled} />
    case "linked-choice": {
      const source = spec.source ?? { index: targets[0]?.index ?? "peoples", tab: "" }
      const target = targetOf(source.index)
      return <>
        <div className="grid gap-2 sm:grid-cols-2">
          <label className={smallLabel}>Index d’où viennent les noms<NativeSelect disabled={disabled} value={source.index} onChange={(event) => set({ source: { index: event.target.value as typeof source.index, tab: targetOf(event.target.value)?.tabs[0]?.name ?? "" } })}>{targets.map((item) => <NativeSelectOption key={item.index} value={item.index}>{item.title}</NativeSelectOption>)}</NativeSelect></label>
          <label className={smallLabel}>Onglet où créer un nom absent<NativeSelect disabled={disabled} value={source.tab} onChange={(event) => set({ source: { ...source, tab: event.target.value } })}>{(target?.tabs ?? []).map((tab) => <NativeSelectOption key={tab.name} value={tab.name}>{tab.name}</NativeSelectOption>)}</NativeSelect></label>
        </div>
        <label className="flex items-center gap-2 text-xs"><Checkbox disabled={disabled} checked={Boolean(source.onlyTab)} onCheckedChange={(checked) => set({ source: { ...source, onlyTab: checked === true || undefined } })} /><span><b>Seulement cet onglet</b> (sinon : tous les onglets de l’index)</span></label>
        <div className="grid gap-1.5">
          <span className="text-xs font-semibold">Autres sources de noms</span>
          {(spec.moreSources ?? []).map((extra, position) => {
            const extraTarget = targetOf(extra.index)
            const update = (next: ChoiceSource | null) => set({ moreSources: (spec.moreSources ?? []).flatMap((item, index) => index === position ? next ? [next] : [] : [item]) })
            return <div key={position} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-end gap-2">
              <label className={smallLabel}>Index<NativeSelect disabled={disabled} value={extra.index} onChange={(event) => update({ index: event.target.value as typeof extra.index, tab: targetOf(event.target.value)?.tabs[0]?.name ?? "", onlyTab: true })}>{targets.map((item) => <NativeSelectOption key={item.index} value={item.index}>{item.title}</NativeSelectOption>)}</NativeSelect></label>
              <label className={smallLabel}>Onglet<NativeSelect disabled={disabled} value={extra.onlyTab ? extra.tab : "*"} onChange={(event) => update(event.target.value === "*" ? { ...extra, tab: extraTarget?.tabs[0]?.name ?? extra.tab, onlyTab: undefined } : { ...extra, tab: event.target.value, onlyTab: true })}><NativeSelectOption value="*">Tous les onglets</NativeSelectOption>{(extraTarget?.tabs ?? []).map((tab) => <NativeSelectOption key={tab.name} value={tab.name}>{tab.name}</NativeSelectOption>)}</NativeSelect></label>
              <Button type="button" size="icon-sm" variant="ghost" disabled={disabled} aria-label="Retirer cette source" onClick={() => update(null)}><X /></Button>
            </div>
          })}
          <Button type="button" size="sm" variant="outline" className="justify-self-start" disabled={disabled} onClick={() => set({ moreSources: [...(spec.moreSources ?? []), { index: source.index, tab: target?.tabs[0]?.name ?? source.tab, onlyTab: true }] })}><Plus />Ajouter une source</Button>
        </div>
        <label className="flex items-center gap-2 text-xs"><Checkbox disabled={disabled} checked={Boolean(spec.multiple)} onCheckedChange={(checked) => set({ multiple: checked === true })} /><span><b>Choix multiple</b> : plusieurs noms par case</span></label>
        {spec.multiple && <label className="flex items-center gap-2 text-xs"><Checkbox disabled={disabled} checked={spec.listSeparator?.trim() === "-"} onCheckedChange={(checked) => set({ listSeparator: checked === true ? "-" : undefined })} /><span>Séparer les noms par un tiret (« Forêt - Ville ») plutôt qu’une virgule</span></label>}
        <label className="flex items-center gap-2 text-xs"><Checkbox disabled={disabled} checked={Boolean(spec.strict)} onCheckedChange={(checked) => set({ strict: checked === true || undefined })} /><span><b>Signaler les noms introuvables</b> : en rouge, pour les corriger (rien n’est effacé)</span></label>
      </>
    }
    case "linked": {
      const link = spec.link ?? { index: targets[0]?.index ?? "peoples", tab: "*", column: "" }
      const target = targetOf(link.index)
      if (!spec.link && disabled) return <p className="text-xs text-muted-foreground">Colonne liée prévue par Eraser.</p>
      return <div className="grid gap-2 sm:grid-cols-3">
        <label className={smallLabel}>Index lié<NativeSelect disabled={disabled} value={link.index} onChange={(event) => set({ link: { ...link, index: event.target.value as typeof link.index, tab: "*" } })}>{targets.map((item) => <NativeSelectOption key={item.index} value={item.index}>{item.title}</NativeSelectOption>)}</NativeSelect></label>
        <label className={smallLabel}>Onglet<NativeSelect disabled={disabled} value={link.tab} onChange={(event) => set({ link: { ...link, tab: event.target.value } })}><NativeSelectOption value="*">Tous les onglets</NativeSelectOption>{(target?.tabs ?? []).map((tab) => <NativeSelectOption key={tab.name} value={tab.name}>{tab.name}</NativeSelectOption>)}</NativeSelect></label>
        <label className={smallLabel}>Colonne qui répond, en face<Input disabled={disabled} value={link.column} placeholder="Créée si elle n’existe pas" onChange={(event) => set({ link: { ...link, column: event.target.value } })} /></label>
      </div>
    }
    case "lookup":
    case "rollup": {
      const settings = spec.kind === "lookup" ? spec.lookup ?? { via: "", field: "" } : spec.rollup ?? { via: "", fn: "count" as RollupFunction }
      const via = relations.find((column) => foldName(column.header) === foldName(settings.via))
      const targetIndex = via?.spec.kind === "linked-choice" ? via.spec.source?.index : via?.spec.link?.index
      const fields = [...new Set((targetOf(targetIndex)?.tabs ?? []).flatMap((tab) => tab.columns))]
      const update = (changes: Record<string, string>) => spec.kind === "lookup" ? set({ lookup: { ...(settings as { via: string; field: string }), ...changes } }) : set({ rollup: { ...(settings as { via: string; fn: RollupFunction; field?: string }), ...changes } as NonNullable<IndexColumnSpec["rollup"]> })
      if (!relations.length) return <p className="text-xs text-muted-foreground">Ajoute d’abord une relation dans cet onglet (Colonne liée ↔ ou Liste liée) : la Recherche et l’Agrégat la suivent.</p>
      return <div className="grid gap-2 sm:grid-cols-3">
        <label className={smallLabel}>Relation à suivre<NativeSelect disabled={disabled} value={settings.via} onChange={(event) => update({ via: event.target.value })}><NativeSelectOption value="">— Choisir —</NativeSelectOption>{relations.map((column) => <NativeSelectOption key={column.id} value={column.header}>{column.header}</NativeSelectOption>)}</NativeSelect></label>
        <label className={smallLabel}>Colonne d’en face<NativeSelect disabled={disabled} value={("field" in settings ? settings.field : "") ?? ""} onChange={(event) => update({ field: event.target.value })}>{spec.kind === "rollup" ? <NativeSelectOption value="">— (compter les lignes)</NativeSelectOption> : <NativeSelectOption value="">— Choisir —</NativeSelectOption>}{fields.map((field) => <NativeSelectOption key={field} value={field}>{field}</NativeSelectOption>)}</NativeSelect></label>
        {spec.kind === "rollup" && <label className={smallLabel}>Calcul<NativeSelect disabled={disabled} value={(settings as { fn: RollupFunction }).fn} onChange={(event) => update({ fn: event.target.value })}>{Object.entries(rollupLabels).map(([key, label]) => <NativeSelectOption key={key} value={key}>{label}</NativeSelectOption>)}</NativeSelect></label>}
        {spec.kind === "rollup" && <div className="sm:col-span-3"><p className={smallLabel}>Format du résultat (pour une somme de prix…)</p><NumberFormatSettings spec={spec} onChange={onChange} disabled={disabled} /></div>}
      </div>
    }
    case "formula": return <FormulaEditor {...props} />
    case "random": return <RandomSettingsEditor {...props} />
    case "actions": return <ButtonsEditor {...props} />
    case "gauge": return <GaugeSettingsEditor spec={spec} onChange={onChange} disabled={disabled} siblings={siblings} />
    case "file": {
      const file = spec.file ?? { accept: "any" as FileAccept }
      return <div className="grid gap-2 sm:grid-cols-2">
        <label className={smallLabel}>Fichiers acceptés<NativeSelect disabled={disabled} value={file.accept} onChange={(event) => set({ file: { ...file, accept: event.target.value as FileAccept } })}>{Object.entries(fileAcceptLabels).map(([key, label]) => <NativeSelectOption key={key} value={key}>{label}</NativeSelectOption>)}</NativeSelect></label>
        <label className="flex items-center gap-2 self-end pb-2 text-xs"><Checkbox disabled={disabled} checked={Boolean(file.multiple)} onCheckedChange={(checked) => set({ file: { ...file, multiple: checked === true } })} />Plusieurs fichiers (galerie)</label>
      </div>
    }
    case "spells": {
      const spells = spec.spells ?? { source: "all" as const }
      return <div className="grid gap-2 sm:grid-cols-2">
        <label className={smallLabel}>Sorts proposés<NativeSelect disabled={disabled} value={spells.source} onChange={(event) => set({ spells: { ...spells, source: event.target.value as typeof spells.source } })}><NativeSelectOption value="all">Classes et créatures</NativeSelectOption><NativeSelectOption value="class">Sorts des classes</NativeSelectOption><NativeSelectOption value="creature">Sorts des créatures</NativeSelectOption></NativeSelect></label>
        <label className={smallLabel}>Catégorie<NativeSelect disabled={disabled} value={spells.category ?? ""} onChange={(event) => set({ spells: { ...spells, category: (event.target.value || undefined) as typeof spells.category } })}><NativeSelectOption value="">Toutes</NativeSelectOption><NativeSelectOption value="actif">Actifs</NativeSelectOption><NativeSelectOption value="passif">Passifs</NativeSelectOption></NativeSelect></label>
      </div>
    }
    default: return <p className="text-xs text-muted-foreground">{indexColumnKinds[spec.kind].description}</p>
  }
}

// ---------------------------------------------------------------------------
// Style imposé et emplacement
// ---------------------------------------------------------------------------

/** « ou celle de la colonne … » : une couleur prise, ligne par ligne, dans une colonne Couleur de l'onglet. */
function ColorColumnPicker({ value, columns, disabled, label, onChange }: { value?: string; columns: string[]; disabled: boolean; label: string; onChange: (value: string | undefined) => void }) {
  if (!columns.length && !value) return <p className="text-[10px] font-normal text-muted-foreground">Ajoute une colonne Couleur à l’onglet pour colorer chaque ligne de sa couleur.</p>
  return <label className="flex items-center gap-1.5 text-[11px] font-normal text-muted-foreground">
    <span className="shrink-0">ou, ligne par ligne :</span>
    <NativeSelect disabled={disabled} value={value ?? ""} onChange={(event) => onChange(event.target.value || undefined)} className="h-7 min-w-0 flex-1 text-[11px]" aria-label={label}>
      <NativeSelectOption value="">La couleur choisie ci-dessus</NativeSelectOption>
      {[...new Set([...columns, ...(value ? [value] : [])])].map((header) => <NativeSelectOption key={header} value={header}>{columns.includes(header) ? `La colonne « ${header} »` : `« ${header} » (introuvable)`}</NativeSelectOption>)}
    </NativeSelect>
  </label>
}

function StyleSettings({ spec, onChange, disabled, colorColumns = [] }: { spec: IndexColumnSpec; onChange: (spec: IndexColumnSpec) => void; disabled: boolean; /** Les colonnes Couleur de l'onglet, d'où une ligne peut prendre ses couleurs. */ colorColumns?: string[] }) {
  const style = spec.style
  const active = Boolean(style) && !style?.keepCellFormatting
  const set = (changes: Partial<ColumnStyle>) => onChange({ ...spec, style: { ...(style ?? {}), ...changes } })
  const toggle = (key: "bold" | "italic" | "underline" | "strike") => set({ [key]: !style?.[key] })
  const look = columnStyleCss(style)
  const textKinds = ["rich", "linked", "name", "name-form"].includes(spec.kind)
  return <div className={box}>
    <div className="flex items-center justify-between gap-2">
      <p className="font-semibold">Style imposé</p>
      <label className="flex items-center gap-2 text-xs"><Checkbox disabled={disabled} checked={active} onCheckedChange={(checked) => onChange({ ...spec, style: checked === true ? { ...(style ?? {}), keepCellFormatting: undefined } : undefined })} />Imposer un style à toute la colonne</label>
    </div>
    <p className="text-xs text-muted-foreground">{textKinds ? "Toute la colonne prend ce style, et la mise en forme propre à chaque case est retirée (le Nom en gras, les Compétences en rouge…). Sans style imposé, chaque case garde la sienne." : "Toute la colonne prend ce style (couleur, fond, taille…)."}</p>
    {active && <>
      <div className="flex flex-wrap items-center gap-1">
        {([["bold", Bold, "Gras"], ["italic", Italic, "Italique"], ["underline", Underline, "Souligné"], ["strike", Strikethrough, "Barré"]] as const).map(([key, Icon, label]) => <Button key={key} type="button" size="icon-sm" variant={style?.[key] ? "default" : "outline"} disabled={disabled} onClick={() => toggle(key)} title={label} aria-label={label}><Icon /></Button>)}
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <div className={smallLabel}>Couleur du texte<ColorSwatches disabled={disabled} value={style?.color} allowMuted onChange={(color) => set({ color })} /><ColorColumnPicker label="Couleur du texte prise dans une colonne" value={style?.colorColumn} columns={colorColumns} disabled={disabled} onChange={(colorColumn) => set({ colorColumn })} /></div>
        <div className={smallLabel}>Couleur de fond<ColorSwatches disabled={disabled} value={style?.background} onChange={(background) => set({ background })} /><ColorColumnPicker label="Couleur de fond prise dans une colonne" value={style?.backgroundColumn} columns={colorColumns} disabled={disabled} onChange={(backgroundColumn) => set({ backgroundColumn })} /></div>
        <label className={smallLabel}>Taille<NativeSelect disabled={disabled} value={style?.size ?? ""} onChange={(event) => set({ size: (event.target.value || undefined) as ColumnStyle["size"] })}><NativeSelectOption value="">Normale</NativeSelectOption><NativeSelectOption value="sm">Petite</NativeSelectOption><NativeSelectOption value="md">Moyenne</NativeSelectOption><NativeSelectOption value="lg">Grande</NativeSelectOption><NativeSelectOption value="xl">Très grande</NativeSelectOption></NativeSelect></label>
        <label className={smallLabel}>Police<NativeSelect disabled={disabled} value={style?.font ?? ""} onChange={(event) => set({ font: (event.target.value || undefined) as ColumnStyle["font"] })}><NativeSelectOption value="">Normale</NativeSelectOption><NativeSelectOption value="serif">Avec empattement</NativeSelectOption><NativeSelectOption value="display">Titre (police d’Eraser)</NativeSelectOption><NativeSelectOption value="mono">Machine à écrire</NativeSelectOption></NativeSelect></label>
        <label className={smallLabel}>Casse<NativeSelect disabled={disabled} value={style?.letterCase ?? ""} onChange={(event) => set({ letterCase: (event.target.value || undefined) as ColumnStyle["letterCase"] })}><NativeSelectOption value="">Telle qu’écrite</NativeSelectOption><NativeSelectOption value="upper">MAJUSCULES</NativeSelectOption><NativeSelectOption value="lower">minuscules</NativeSelectOption><NativeSelectOption value="title">Majuscule Au Début</NativeSelectOption></NativeSelect></label>
        <label className={smallLabel}>Alignement<NativeSelect disabled={disabled} value={style?.align ?? ""} onChange={(event) => set({ align: (event.target.value || undefined) as ColumnStyle["align"] })}><NativeSelectOption value="">Automatique</NativeSelectOption><NativeSelectOption value="left">À gauche</NativeSelectOption><NativeSelectOption value="center">Centré</NativeSelectOption><NativeSelectOption value="right">À droite</NativeSelectOption></NativeSelect></label>
      </div>
      <div className="rounded-lg border bg-background/60 px-3 py-2 text-sm"><span className="mr-2 text-[11px] text-muted-foreground">Aperçu :</span><span className={look.className} style={look.style}>Forêt noire, 12 PO</span></div>
      {(style?.colorColumn || style?.backgroundColumn) && <p className="text-[11px] text-muted-foreground">Chaque ligne prend {[style.colorColumn && `la couleur de sa case « ${style.colorColumn} » pour le texte`, style.backgroundColumn && `celle de « ${style.backgroundColumn} » pour le fond`].filter(Boolean).join(", et ")} ; une case de couleur vide garde la couleur choisie ci-dessus.</p>}
    </>}
  </div>
}

/**
 * Les deux options d'une colonne qui ne tiennent ni au type ni au style : « Lecture seule »
 * (visible partout, modifiable ailleurs) et « Nomme la ligne » (le nom d'une ligne dans un
 * onglet sans colonne Nom). L'œil, la description et le cadenas sont sur la première ligne.
 */
function OptionsSettings({ spec, onChange, disabled }: { spec: IndexColumnSpec; onChange: (spec: IndexColumnSpec) => void; disabled: boolean }) {
  const nameLike = spec.kind === "id" || spec.kind === "name-form" || spec.kind === "name"
  if (nameLike) return null
  return <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t pt-2 text-xs">
    {!isComputedSpec(spec) && <label className="flex items-center gap-2" title="Visible, triable, cherchable, dans les fiches et les survols, mais rien ne s’y saisit ni ne s’y colle depuis l’index : ses données viennent d’ailleurs."><Checkbox disabled={disabled} checked={Boolean(spec.readOnly)} onCheckedChange={(checked) => onChange({ ...spec, readOnly: checked === true || undefined })} /><span><b>Lecture seule</b> <span className="text-muted-foreground">(se modifie ailleurs)</span></span></label>}
    <label className="flex items-center gap-2" title="Dans un onglet sans colonne Nom, cette colonne donne son nom à la ligne : titre de la fiche, citations « { », pages de ligne. Sans effet quand l’onglet a une colonne Nom."><Checkbox disabled={disabled} checked={Boolean(spec.rowLabel)} onCheckedChange={(checked) => onChange({ ...spec, rowLabel: checked === true || undefined })} /><span><b>Nomme la ligne</b> <span className="text-muted-foreground">(onglet sans colonne Nom)</span></span></label>
  </div>
}

/** L'icône de chaque type, pour le repérer d'un coup d'œil dans la liste. */
const kindIcons: Partial<Record<IndexColumnKind, LucideIcon>> = {
  "rich": TypeIcon, "number": Hash, "checkbox": SquareCheck, "color": Palette, "gauge": Gauge, "glyph": Shapes,
  "choice": List, "linked-choice": ListTree, "linked": ArrowLeftRight, "tab-sort": FolderTree,
  "lookup": SearchIcon, "rollup": Sigma, "formula": FunctionSquare, "random": Dices,
  "actions": MousePointerClick, "file": Paperclip, "spells": Sparkles,
}

// ---------------------------------------------------------------------------
// La fenêtre
// ---------------------------------------------------------------------------

function useDragList<T extends { id: string }>(items: T[], onMove: (next: T[]) => void) {
  const [dragging, setDragging] = useState<string | null>(null)
  const [over, setOver] = useState<string | null>(null)
  const props = (item: T) => ({
    draggable: true,
    onDragStart: (event: DragEvent) => { setDragging(item.id); event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", item.id) },
    onDragOver: (event: DragEvent) => { if (!dragging) return; event.preventDefault(); setOver(item.id) },
    onDragEnd: () => { setDragging(null); setOver(null) },
    onDrop: (event: DragEvent) => {
      event.preventDefault()
      if (!dragging || dragging === item.id) return
      const next = [...items]
      const from = next.findIndex((candidate) => candidate.id === dragging)
      const [moved] = next.splice(from, 1)
      next.splice(next.findIndex((candidate) => candidate.id === item.id) + (from <= items.findIndex((candidate) => candidate.id === item.id) ? 1 : 0), 0, moved)
      onMove(next)
      setDragging(null); setOver(null)
    },
  })
  const move = (id: string, delta: number) => {
    const next = [...items]
    const from = next.findIndex((candidate) => candidate.id === id)
    const to = Math.max(0, Math.min(next.length - 1, from + delta))
    if (from === to) return
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    onMove(next)
  }
  return { props, move, over, dragging }
}

/**
 * L'éditeur des colonnes et onglets d'un index : les onglets à gauche, les colonnes au
 * milieu, les réglages de la colonne choisie à droite, tous visibles. Rien n'est écrit
 * tant qu'on n'a pas enregistré ; le résumé dit exactement ce qui va changer.
 */
export function IndexEditor({ model, open, pending = false, error = "", title, intro, onClose, onApply, onDeleteIndex, leading, submitLabel = "Enregistrer", startTabs = [], canSubmit = true, sampleRows = {}, layouts = {}, onSaveLayouts, cardsIndex, cards = {}, onSaveCards, initialMode = "columns", initialTab, locks = {}, onSaveLocks, presentations = {}, onSavePresentations, viewPresets = [], onSaveViewPreset, onDeleteViewPreset, previewRows = {}, valuesOf, optionsOf, statsPanel, stats = [] }: {
  model: IndexEditorModel
  open: boolean
  pending?: boolean
  error?: string
  title?: string
  intro?: ReactNode
  leading?: ReactNode
  submitLabel?: string
  /** Onglets neufs proposés d'emblée (création d'un index). */
  startTabs?: string[]
  /** Condition supplémentaire pour enregistrer (le titre d'un nouvel index…). */
  canSubmit?: boolean
  /** Les premières lignes de chaque onglet (en-tête → texte), pour l'aperçu des formules. */
  sampleRows?: Record<string, Array<Record<string, string>>>
  onClose: () => void
  onApply: (operations: SchemaOperation[]) => void
  /** Supprimer tout l'index (à la corbeille). Absent : pas de bouton. */
  onDeleteIndex?: () => void
  /** Les mises en page enregistrées (fiche et survol), par onglet. */
  layouts?: Record<string, TabLayouts>
  /** Enregistre les mises en page changées. Absent : pas d'onglets « Fiche » et « Survol ». */
  onSaveLayouts?: (changes: Array<{ tab: string; form: IndexLayout | null; hover: IndexLayout | null; forms?: NamedLayout[]; hovers?: NamedLayout[] }>) => Promise<void>
  /** La clé de l'index pour ses cartes (celles qu'Eraser avait déjà). */
  cardsIndex?: string
  /** Les cartes enregistrées, par onglet. */
  cards?: Record<string, TabCards>
  /** Enregistre les cartes changées (`null` : retour aux cartes d'Eraser). Absent : pas d'onglet « Cartes ». */
  onSaveCards?: (changes: Array<{ tab: string; cards: TabCards | null }>) => Promise<void>
  /** Ce que l'éditeur ouvre d'abord (« Cartes » depuis la vue en cartes). */
  initialMode?: EditorMode
  /** Les vues réglées (liste, kanban…), par onglet ; `onSavePresentations` absent : pas d'onglet « Vues ». */
  presentations?: Record<string, TabPresentations>
  onSavePresentations?: (changes: Array<{ tab: string; presentations: TabPresentations | null }>) => Promise<void>
  /** Les presets de vues, communs à tous les index. */
  viewPresets?: PresentationPreset[]
  onSaveViewPreset?: (preset: { id?: string; name: string; layout: Presentation }) => Promise<unknown>
  onDeleteViewPreset?: (id: string) => Promise<unknown>
  /** Des lignes de chaque onglet (en-tête → valeur) pour l'aperçu des vues. */
  previewRows?: Record<string, Array<Record<string, string>>>
  /** Les choix d'une colonne liste d'un onglet (couleurs des sections, du kanban). */
  optionsOf?: (tab: string, header: string) => Array<{ value: string; color?: string }>
  /** Les valeurs d'une colonne dans toutes les lignes de l'onglet (une par case), pas seulement celles des aperçus. */
  valuesOf?: (tab: string, header: string) => string[]
  /** Le constructeur des statistiques de l'index (onglet « Stats ») ; absent : pas d'onglet. */
  statsPanel?: ReactNode
  /** Les statistiques de l'index : une tuile du tableau de bord en dessine une. */
  stats?: StatDefinition[]
  /** L'onglet ouvert d'abord (son nom). */
  initialTab?: string
  /** Les cadenas réglés (posés, retirés, usages ajoutés), par onglet. */
  locks?: Record<string, TabLocks>
  /** Enregistre les cadenas changés (`null` : plus aucun réglage dans l'onglet). */
  onSaveLocks?: (changes: Array<{ tab: string; locks: TabLocks | null }>) => Promise<void>
}) {
  const [tabs, setTabs] = useState<DraftTab[]>(() => [...draftOf(model), ...startTabs.map((name): DraftTab => ({ id: nextId(), name, columns: [], removed: false, remove: true, rename: true, addColumns: true }))])
  const originalTabOrder = useMemo(() => model.tabs.map((tab) => tab.name), [model])
  const [selectedTab, setSelectedTab] = useState(() => (initialTab ? tabs.find((candidate) => candidate.original === initialTab) : undefined)?.id ?? tabs[0]?.id ?? "")
  const [selectedColumn, setSelectedColumn] = useState(() => tabs.find((candidate) => candidate.id === selectedTab)?.columns[0]?.id ?? tabs[0]?.columns[0]?.id ?? "")
  const [renaming, setRenaming] = useState<string | null>(null)
  const [newTab, setNewTab] = useState("")
  // Un nouvel onglet peut partir d'un preset : il reçoit aussitôt ses colonnes.
  const { presets } = useColumnPresets()
  const [newTabPreset, setNewTabPreset] = useState("")
  // « Aligner les autres onglets » : ce qui vient d'être préparé, à vérifier avant « Enregistrer ».
  const [alignNotice, setAlignNotice] = useState("")
  const [newColumn, setNewColumn] = useState("")
  const [showChanges, setShowChanges] = useState(false)
  const [guide, setGuide] = useState<GuideSection | null>(null)
  // Le panneau des onglets, à gauche : on le replie pour donner la place aux réglages.
  const [asideOpen, setAsideOpen] = useState(true)
  // « Réduire » : l'éditeur se cache (ses brouillons restent) ; fermer avec des changements demande confirmation.
  const [minimized, setMinimized] = useState(false)
  // Changer de page (l'éditeur reste ouvert dans la coque) : il se réduit ; « Reprendre » le rouvre tel quel.
  const pathname = usePathname()
  const [openedOn, setOpenedOn] = useState(pathname)
  if (pathname !== openedOn) { setOpenedOn(pathname); setMinimized(true) }
  const [confirmClose, setConfirmClose] = useState(false)
  // La carte modifiée, par onglet (le panneau des cartes et l'éditeur la partagent).
  const [selectedCard, setSelectedCard] = useState<Record<string, string | null>>({})
  const readOnly = Boolean(model.readOnly)
  const tab = tabs.find((candidate) => candidate.id === selectedTab) ?? tabs[0]
  const column = tab?.columns.find((candidate) => candidate.id === selectedColumn) ?? tab?.columns[0]
  const operations = useMemo(() => operationsOf(tabs, originalTabOrder), [originalTabOrder, tabs])
  const liveTabs = tabs.filter((candidate) => !candidate.removed)
  const problems = useMemo(() => tabs.flatMap((candidate) => candidate.removed ? [] : [
    ...(candidate.name.trim() !== candidate.original ? [tabProblem(candidate.name, tabs.filter((other) => other.id !== candidate.id && !other.removed).map((other) => other.name))] : []),
    // Seuls les noms ajoutés ou modifiés sont vérifiés : deux colonnes du même nom déjà dans
    // la feuille (« Rareté » en double) ne doivent pas empêcher d'enregistrer autre chose.
    ...candidate.columns.filter((item) => !item.removed && item.header.trim() !== item.original).map((item) => headerProblem(item.header, candidate.columns.filter((other) => other.id !== item.id && !other.removed).map((other) => other.header))),
    ...candidate.columns.filter((item) => !item.removed && item.spec.kind === "linked" && item.spec.link && !item.spec.link.column.trim() && !item.original).map((item) => `« ${item.header} » : une colonne liée doit nommer la colonne qui lui répond en face.`),
    ...candidate.columns.filter((item) => !item.removed && item.spec.kind === "formula" && item.spec.formula?.expression.trim() && formulaProblem(item.spec.formula.expression)).map((item) => `« ${item.header} » : ${formulaProblem(item.spec.formula!.expression)}`),
    ...candidate.columns.filter((item) => !item.removed && item.spec.kind === "gauge" && gaugeScaleOf(item.spec.gauge) === "from-column" && !item.spec.gauge?.maxColumn).map((item) => `« ${item.header} » : choisis la colonne qui donne le maximum de la jauge.`),
  ].filter(Boolean).map((problem) => `${candidate.name} : ${problem}`)), [tabs])

  // « Colonnes », ou la mise en page de la fiche ou du survol de l'onglet choisi.
  const [mode, setMode] = useState<EditorMode>(() => (initialMode === "cards" && !onSaveCards) || (initialMode.startsWith("view:") && !onSavePresentations) || (initialMode === "stats" && !statsPanel) ? "columns" : initialMode)
  // La Liste réunit liste, kanban et maître-détail sous un seul onglet (« view:list ») : sa version choisie dit sa forme (« forme|id »).
  const openedKind = mode.startsWith("view:") ? mode.slice(5) as PresentationKind : null
  const listFamily = openedKind !== null && LIST_FAMILY.includes(openedKind)
  const viewKind = listFamily ? "list" as PresentationKind : openedKind
  /**
   * Les mises en page touchées, par onglet (identifiant du brouillon) : le formulaire étoilé
   * (`null` : retour à celui d'Eraser ou à l'automatique), le survol, les autres formulaires.
   */
  const [layoutDrafts, setLayoutDrafts] = useState<Record<string, LayoutDraft>>({})
  // Le formulaire ou le survol ouvert dans l'éditeur, par genre et par onglet (« principal » : l'étoilé).
  const [editedLayout, setEditedLayout] = useState<Record<string, string>>({})
  // La version de chaque vue ouverte dans l'éditeur, par genre et par onglet (« principal » : l'étoilée).
  const [editedView, setEditedView] = useState<Record<string, string>>({})
  const [layoutSaving, setLayoutSaving] = useState(false)
  const [layoutError, setLayoutError] = useState("")
  const layoutsEnabled = Boolean(onSaveLayouts) && !readOnly
  const savedLayoutsOf = (draft: DraftTab) => draft.original ? tabLayoutsOf(layouts, draft.original) : null
  /**
   * La mise en page réellement utilisée par un onglet (étoilée ou survol) : la touchée, sinon
   * l'enregistrée, sinon celle d'Eraser, sinon l'automatique écrite d'après les colonnes.
   */
  const layoutOf = (draft: DraftTab, kind: LayoutKind): { layout: IndexLayout; source: "saved" | "eraser" | "automatic" } => {
    const touched = layoutDrafts[draft.id]
    const builtin = draft.original ? builtinLayoutFor(model.key, draft.original, kind) : null
    const fallback = () => builtin ? { layout: builtin, source: "eraser" as const } : { layout: automaticLayoutFor(kind, layoutColumnsOf(draft, kind)), source: "automatic" as const }
    if (touched && kind in touched) return touched[kind] ? { layout: touched[kind]!, source: "saved" } : fallback()
    const saved = draft.original ? tabLayout(layouts, draft.original, kind) : null
    return saved ? { layout: saved, source: "saved" } : fallback()
  }
  const sampleRowsOf = (draft: DraftTab) => sampleRows[draft.original ?? draft.name] ?? []
  /** Les autres formulaires (ou survols) d'un onglet (touchés, sinon enregistrés). */
  const namedLayoutsOf = (draft: DraftTab, kind: LayoutKind): NamedLayout[] => {
    const key = kind === "form" ? "forms" : "hovers"
    const touched = layoutDrafts[draft.id]
    if (touched && key in touched) return touched[key] ?? []
    return savedLayoutsOf(draft)?.[key] ?? []
  }
  const namedFormsOf = (draft: DraftTab) => namedLayoutsOf(draft, "form")
  const touchLayout = (draft: DraftTab, changes: LayoutDraft) => setLayoutDrafts((current) => ({ ...current, [draft.id]: { ...current[draft.id], ...changes } }))
  /**
   * Ce qu'il faut écrire : les mises en page touchées, et celles qui suivent un onglet ou
   * des colonnes renommés (elles nomment leurs colonnes). La mise en page d'Eraser (ou
   * l'automatique) n'est écrite que si on y a touché, ou si une colonne qu'elle range est renommée.
   */
  const layoutChanges = useMemo(() => tabs.flatMap((draft) => {
    if (draft.removed) return []
    const savedEntry = draft.original ? tabLayoutsOf(layouts, draft.original) : null
    const saved = { form: savedEntry?.form ?? null, hover: savedEntry?.hover ?? null, forms: savedEntry?.forms ?? [], hovers: savedEntry?.hovers ?? [] }
    const touched = layoutDrafts[draft.id] ?? {}
    const renames = new Map(draft.columns.filter((item) => item.original && !item.removed && item.header.trim() && item.header.trim() !== item.original).map((item) => [foldName(item.original!), item.header.trim()]))
    const builtinRenamed = (kind: LayoutKind) => {
      const builtin = draft.original && renames.size ? builtinLayoutFor(model.key, draft.original, kind) : null
      const renamedBuiltin = builtin ? renameLayoutColumns(builtin, renames) : null
      return renamedBuiltin && serializeIndexLayout(renamedBuiltin) !== serializeIndexLayout(builtin) ? renamedBuiltin : null
    }
    const next = (kind: LayoutKind) => {
      if (!(kind in touched) && !saved[kind]) return builtinRenamed(kind)
      const layout = kind in touched ? touched[kind] ?? null : saved[kind]
      return layout ? renameLayoutColumns(layout, renames) : null
    }
    const form = next("form")
    const hover = next("hover")
    const forms = ("forms" in touched ? touched.forms ?? [] : saved.forms).map((item) => ({ ...item, layout: renameLayoutColumns(item.layout, renames) }))
    const hovers = ("hovers" in touched ? touched.hovers ?? [] : saved.hovers).map((item) => ({ ...item, layout: renameLayoutColumns(item.layout, renames) }))
    const name = draft.name.trim()
    const renamed = Boolean(draft.original) && name !== draft.original
    const changed = renamed || serializeIndexLayout(form) !== serializeIndexLayout(saved.form) || serializeIndexLayout(hover) !== serializeIndexLayout(saved.hover) || serializeNamedLayouts(forms) !== serializeNamedLayouts(saved.forms) || serializeNamedLayouts(hovers) !== serializeNamedLayouts(saved.hovers)
    if (!changed || !name) return []
    // Un onglet renommé : sa mise en page suit son nouveau nom, l'ancienne ligne est retirée.
    const retired = renamed && (saved.form || saved.hover || saved.forms.length || saved.hovers.length) ? [{ tab: draft.original!, form: null, hover: null, forms: [] as NamedLayout[], hovers: [] as NamedLayout[] }] : []
    if (renamed && !form && !hover && !forms.length && !hovers.length && !retired.length) return []
    return [...retired, { tab: name, form, hover, forms, hovers }]
  }), [layoutDrafts, layouts, model.key, tabs])

  // Les cartes touchées, par onglet (identifiant du brouillon) ; `null` : retour aux cartes d'Eraser.
  const [cardDrafts, setCardDrafts] = useState<Record<string, TabCards | null>>({})
  const cardsEnabled = Boolean(onSaveCards) && !readOnly
  const savedCardsOf = (draft: DraftTab) => tabCardsOf(cards, cardsIndex ?? model.key, draft.original ?? draft.name.trim())
  const cardsOf = (draft: DraftTab): TabCards & { builtin: boolean } => {
    if (draft.id in cardDrafts) {
      const touched = cardDrafts[draft.id]
      return touched ? { ...touched, builtin: false } : { ...tabCardsOf({}, cardsIndex ?? model.key, draft.original ?? draft.name.trim()), builtin: true }
    }
    return savedCardsOf(draft)
  }
  /**
   * Ce qu'il faut écrire : les cartes touchées, et celles qui suivent un onglet ou des
   * colonnes renommés (elles nomment leurs colonnes).
   */
  const cardChanges = useMemo(() => tabs.flatMap((draft): Array<{ tab: string; cards: TabCards | null }> => {
    const name = draft.name.trim()
    if (draft.removed || !name) return []
    const saved = draft.original ? tabCardsOf(cards, cardsIndex ?? model.key, draft.original) : { cards: [], builtin: true }
    const savedValue: TabCards = { cards: saved.cards, ...(saved.defaultId ? { defaultId: saved.defaultId } : {}) }
    const touched = draft.id in cardDrafts
    // « Revenir aux cartes d'Eraser » : l'entrée enregistrée est effacée.
    if (touched && cardDrafts[draft.id] === null) return saved.builtin ? [] : [{ tab: draft.original ?? name, cards: null }]
    // Les cartes d'Eraser jamais touchées ne s'écrivent pas : elles restent celles d'Eraser.
    if (!touched && saved.builtin) return []
    const renamed = Boolean(draft.original) && name !== draft.original
    const renames = new Map(draft.columns.filter((item) => item.original && !item.removed && item.header.trim() && item.header.trim() !== item.original).map((item) => [foldName(item.original!), item.header.trim()]))
    const base = touched ? cardDrafts[draft.id]! : savedValue
    const next: TabCards = { ...base, cards: base.cards.map((card) => renameCardColumns(card, renames)) }
    if (!renamed && !saved.builtin && serializeTabCards(next) === serializeTabCards(savedValue)) return []
    // Un onglet renommé : ses cartes suivent son nouveau nom, l'ancienne entrée est retirée.
    const retired = renamed && !saved.builtin ? [{ tab: draft.original!, cards: null }] : []
    return [...retired, { tab: name, cards: next }]
  }), [cardDrafts, cards, cardsIndex, model.key, tabs])

  // Les vues touchées, par onglet (identifiant du brouillon).
  const [presentationDrafts, setPresentationDrafts] = useState<Record<string, TabPresentations>>({})
  const presentationsEnabled = Boolean(onSavePresentations) && !readOnly
  const savedPresentationsOf = (name: string) => Object.entries(presentations).find(([tabName]) => foldName(tabName) === foldName(name))?.[1] ?? {}
  const presentationsOf = (draft: DraftTab) => presentationDrafts[draft.id] ?? savedPresentationsOf(draft.original ?? draft.name.trim())
  /** Ce qu'il faut écrire : les vues touchées, et celles qui suivent un onglet ou des colonnes renommés. */
  const presentationChanges = useMemo(() => tabs.flatMap((draft): Array<{ tab: string; presentations: TabPresentations | null }> => {
    const name = draft.name.trim()
    if (draft.removed || !name) return []
    const saved = draft.original ? savedPresentationsOf(draft.original) : {}
    const touched = draft.id in presentationDrafts
    const renamed = Boolean(draft.original) && name !== draft.original
    const renames = new Map(draft.columns.filter((item) => item.original && !item.removed && item.header.trim() && item.header.trim() !== item.original).map((item) => [foldName(item.original!), item.header.trim()]))
    if (!touched && !renamed && !renames.size) return []
    const rename = (value?: string) => value ? renames.get(foldName(value)) ?? value : value
    const renamedLayout = <T extends Presentation>(layout: T): T => ({ ...layout, groupBy: rename(layout.groupBy), kanbanColumn: rename(layout.kanbanColumn), dateColumn: rename(layout.dateColumn), sortBy: rename(layout.sortBy), colorBy: rename(layout.colorBy), imageColumn: rename(layout.imageColumn), fields: layout.fields?.map((field) => rename(field)!), detailFields: layout.detailFields?.map((field) => rename(field)!), tiles: layout.tiles?.map((tile) => ({ ...tile, column: rename(tile.column) })), ...(layout.itemTemplate ? { itemTemplate: renameCardColumns(layout.itemTemplate, renames) } : {}) })
    const base = touched ? presentationDrafts[draft.id] : saved
    // Chaque vue étoilée, et les autres versions (`named`), suivent les colonnes renommées.
    const next: TabPresentations = Object.fromEntries(presentationEntries(base).map(([kind, layout]) => [kind, renamedLayout(layout)]))
    if (base.named?.length) next.named = base.named.map((item) => ({ ...item, layout: renamedLayout(item.layout) }))
    if (!renamed && JSON.stringify(next) === JSON.stringify(saved)) return []
    const retired = renamed && Object.keys(saved).length ? [{ tab: draft.original!, presentations: null }] : []
    return [...retired, { tab: name, presentations: Object.keys(next).length ? next : null }]
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `presentations` est lu par savedPresentationsOf
  }), [presentationDrafts, presentations, tabs])

  /**
   * Les cadenas à écrire : pour chaque onglet dont un cadenas a changé, tous les réglages de
   * ses colonnes (sous leur nouveau nom) ; `null` quand plus rien n'est réglé.
   */
  const lockChanges = useMemo(() => tabs.flatMap((draft): Array<{ tab: string; locks: TabLocks | null }> => {
    const name = draft.name.trim()
    if (draft.removed || !name || !draft.original) return []
    const saved = tabLocksOf(locks, draft.original)
    const next: TabLocks = {}
    for (const item of draft.columns) {
      if (item.removed || !item.header.trim()) continue
      const override = lockOverrideFor(item.policy)
      if (override) next[foldName(item.header.trim())] = override
    }
    const renamed = name !== draft.original
    if (!renamed && sameTabLocks(saved, Object.keys(next).length ? next : null)) return []
    const retired = renamed && saved ? [{ tab: draft.original, locks: null }] : []
    return [...retired, { tab: name, locks: Object.keys(next).length ? next : null }]
  }), [locks, tabs])

  async function submit() {
    if (lockChanges.length && onSaveLocks) {
      setLayoutSaving(true); setLayoutError("")
      try { await onSaveLocks(lockChanges) } catch (reason) {
        setLayoutError(reason instanceof Error ? reason.message : "Les cadenas n’ont pas pu être enregistrés.")
        setLayoutSaving(false)
        return
      }
      setLayoutSaving(false)
    }
    if (presentationChanges.length && onSavePresentations) {
      setLayoutSaving(true); setLayoutError("")
      try { await onSavePresentations(presentationChanges) } catch (reason) {
        setLayoutError(reason instanceof Error ? reason.message : "Les vues n’ont pas pu être enregistrées.")
        setLayoutSaving(false)
        return
      }
      setLayoutSaving(false)
    }
    if (cardChanges.length && onSaveCards) {
      setLayoutSaving(true); setLayoutError("")
      try { await onSaveCards(cardChanges) } catch (reason) {
        setLayoutError(reason instanceof Error ? reason.message : "Les cartes n’ont pas pu être enregistrées.")
        setLayoutSaving(false)
        return
      }
      setLayoutSaving(false)
    }
    if (layoutChanges.length && onSaveLayouts) {
      setLayoutSaving(true); setLayoutError("")
      try { await onSaveLayouts(layoutChanges) } catch (reason) {
        setLayoutError(reason instanceof Error ? reason.message : "La mise en page n’a pas pu être enregistrée.")
        setLayoutSaving(false)
        return
      }
      setLayoutSaving(false)
    }
    if (operations.length) onApply(operations)
    else onClose()
  }

  const updateTab = (next: DraftTab) => setTabs((current) => current.map((candidate) => candidate.id === next.id ? next : candidate))
  const updateColumn = (next: DraftColumn) => tab && updateTab({ ...tab, columns: tab.columns.map((candidate) => candidate.id === next.id ? next : candidate) })
  const tabDrag = useDragList(tabs, (next) => setTabs(next))
  const columnDrag = useDragList(tab?.columns ?? [], (next) => tab && updateTab({ ...tab, columns: next }))

  function addTab() {
    const name = newTab.trim()
    if (!name || tabProblem(name, liveTabs.map((candidate) => candidate.name))) return
    const preset = presets.find((candidate) => candidate.id === newTabPreset)
    const columns = (preset?.columns ?? []).map((item): DraftColumn => ({ id: nextId(), header: item.header, spec: item.spec, policy: freePolicy, removed: false }))
    const draft: DraftTab = { id: nextId(), name, columns, removed: false, remove: true, rename: true, addColumns: true }
    setTabs((current) => [...current, draft])
    setSelectedTab(draft.id)
    setSelectedColumn(columns[0]?.id ?? "")
    setNewTab("")
    setNewTabPreset("")
  }

  /**
   * Index des items : tous les onglets prennent les colonnes de `reference` — noms bien
   * écrits (« Cout » → « Prix », « Rareté principal » → « Rareté principale »), types,
   * styles imposés et ordre. Les colonnes absentes sont ajoutées ; celles que la référence
   * n'a pas restent à la fin, sans rien supprimer. Rien n'est écrit avant « Enregistrer ».
   */
  function alignOn(reference: DraftTab) {
    const canRename = (item: DraftColumn, header: string) => header === item.header.trim() || item.policy.rename || isObjectSpellingFix(item.header, header)
    const canType = (item: DraftColumn, spec: IndexColumnSpec) => item.policy.type || isDisplayOnlyChange(item.spec, spec)
    const fix = (item: DraftColumn): DraftColumn => { const header = canonicalObjectHeader(item.header); return !item.removed && canRename(item, header) ? { ...item, header } : item }
    const source = reference.columns.filter((item) => !item.removed && item.header.trim()).map((item) => ({ header: item.header.trim(), spec: item.spec }))
    setTabs((current) => current.map((candidate) => {
      if (candidate.removed) return candidate
      if (candidate.id === reference.id) return { ...candidate, columns: candidate.columns.map(fix) }
      const live = candidate.columns.filter((item) => !item.removed)
      const columns = alignColumns(source, live, (item) => item.header).flatMap((entry): DraftColumn[] => {
        if (entry.item) return [{
          ...entry.item,
          header: canRename(entry.item, entry.header) ? entry.header : entry.item.header,
          spec: entry.spec && canType(entry.item, entry.spec) ? entry.spec : entry.item.spec,
        }]
        if (!candidate.addColumns || !entry.spec) return []
        return [{ id: nextId(), header: entry.header, spec: entry.spec, policy: freePolicy, removed: false }]
      })
      return { ...candidate, columns: [...columns, ...candidate.columns.filter((item) => item.removed)] }
    }))
    setAlignNotice(`Les autres onglets prennent les colonnes de « ${reference.name} » (noms, types, styles et ordre). Vérifie le résumé en bas, puis « ${submitLabel} ».`)
  }

  /** Les colonnes d'un preset absentes de l'onglet choisi, ajoutées à la fin. */
  function applyPreset(columns: Array<{ header: string; spec: IndexColumnSpec }>) {
    if (!tab) return
    const present = new Set(tab.columns.filter((item) => !item.removed).map((item) => item.header.trim().toLocaleLowerCase("fr")))
    const added = columns.filter((item) => !present.has(item.header.trim().toLocaleLowerCase("fr"))).map((item): DraftColumn => ({ id: nextId(), header: item.header, spec: item.spec, policy: freePolicy, removed: false }))
    if (!added.length) return
    updateTab({ ...tab, columns: [...tab.columns, ...added] })
    setSelectedColumn(added[0].id)
  }

  function addColumn() {
    if (!tab) return
    const header = newColumn.trim()
    if (!header || headerProblem(header, tab.columns.filter((item) => !item.removed).map((item) => item.header))) return
    const draft: DraftColumn = { id: nextId(), header, spec: { kind: "rich" }, policy: freePolicy, removed: false }
    updateTab({ ...tab, columns: [...tab.columns, draft] })
    setSelectedColumn(draft.id)
    setNewColumn("")
  }

  function pickKind(kind: IndexColumnKind) {
    if (!column || !tab) return
    const siblings = tab.columns.filter((item) => item.id !== column.id)
    const relations = siblings.filter((item) => !item.removed && (item.spec.kind === "linked" || item.spec.kind === "linked-choice"))
    const base = defaultSpec(kind, model.relationTargets, relations)
    // Passer de Nom à Nom formulaire garde tout le reste ; sinon, seul l'affichage suit.
    const keep = { hidden: column.spec.hidden, readOnly: column.spec.readOnly, description: column.spec.description, placement: column.spec.placement, style: ["name", "name-form"].includes(kind) && ["name", "name-form"].includes(column.spec.kind) ? column.spec.style : column.spec.style ?? base.style }
    updateColumn({ ...column, spec: { ...base, ...keep, kind } })
  }

  /** Les autres onglets (pas à la corbeille), pour « Copier vers… ». */
  const otherTabsOf = (draft: DraftTab) => tabs.filter((candidate) => candidate.id !== draft.id && !candidate.removed).map((candidate) => ({ id: candidate.id, name: candidate.name }))
  /** Les colonnes qu'une vue peut lire (sans l'identifiant). */
  const viewColumnsOf = (draft: DraftTab) => draft.columns.filter((item) => !item.removed && item.header.trim() && !/^id$/i.test(item.header.trim())).map((item) => item.header.trim())

  const policy = column?.policy ?? freePolicy
  const columnDisabled = readOnly || Boolean(column?.removed) || Boolean(tab?.removed)
  // Une colonne verrouillée garde son affichage modifiable (style, emplacement, description…).
  const typeDisabled = columnDisabled || !policy.type
  const displayDisabled = columnDisabled
  const lockedTitle = (item: DraftColumn) => item.policy.reasons.length ? `${item.policy.reasons.join("\n")}\n\nModifiable sans risque : ${item.policy.allowed}\nPour le reste : « Modifier quand même », dans ses réglages.` : undefined

  // Les changements pas encore enregistrés : fermer demande confirmation ; « Réduire » les garde en attente.
  const pendingCount = operations.length + layoutChanges.length + cardChanges.length + presentationChanges.length + lockChanges.length
  const requestClose = () => {
    if (pending) return
    if (pendingCount > 0 && !readOnly) setConfirmClose(true)
    else onClose()
  }
  const canSave = !readOnly && !pending && !layoutSaving && canSubmit && pendingCount > 0 && problems.length === 0

  return <>
  {minimized && open && <div className="fixed right-4 bottom-4 z-50 flex max-w-[calc(100vw-2rem)] items-center gap-2 rounded-full border bg-popover py-1.5 pr-1.5 pl-4 text-sm shadow-xl" role="status">
    <Pencil className="size-4 shrink-0 text-primary" aria-hidden="true" />
    <span className="min-w-0 truncate"><b className="font-semibold">{title ?? `Modifier « ${model.title} »`}</b>{pendingCount > 0 && <span className="text-muted-foreground"> · {pendingCount} changement{pendingCount > 1 ? "s" : ""} en attente</span>}</span>
    <Button type="button" size="sm" className="h-8 rounded-full" onClick={() => setMinimized(false)}><Maximize2 />Reprendre</Button>
    <Button type="button" variant="ghost" size="icon-sm" className="rounded-full" onClick={requestClose} aria-label="Fermer l’éditeur" title="Fermer l’éditeur"><X /></Button>
  </div>}
  <AlertDialog open={confirmClose} onOpenChange={setConfirmClose}>
    <AlertDialogContent className="sm:max-w-xl">
      <AlertDialogHeader>
        <AlertDialogTitle>Quitter sans enregistrer ?</AlertDialogTitle>
        <AlertDialogDescription>{pendingCount} changement{pendingCount > 1 ? "s" : ""} de « {model.title} » {pendingCount > 1 ? "ne sont pas enregistrés" : "n’est pas enregistré"} : en quittant, {pendingCount > 1 ? "ils seront perdus" : "il sera perdu"}. « Réduire » (en haut de la fenêtre) les garde de côté pendant que tu regardes l’index.</AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter className="flex-wrap gap-2 sm:justify-between">
        <AlertDialogAction variant="destructive" onClick={() => { setConfirmClose(false); setMinimized(false); onClose() }}>Quitter sans enregistrer</AlertDialogAction>
        <span className="flex flex-col-reverse gap-2 sm:flex-row">
          <AlertDialogCancel>Continuer à modifier</AlertDialogCancel>
          {canSave && <AlertDialogAction onClick={() => { setConfirmClose(false); setMinimized(false); void submit() }}><Save />{submitLabel}</AlertDialogAction>}
        </span>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
  <Dialog open={open && !minimized} onOpenChange={(next) => { if (!next) requestClose() }}>
    <DialogContent className="flex h-[94svh] max-h-[94svh] flex-col gap-3 sm:max-w-[min(96vw,1440px)]">
      <DialogHeader className="shrink-0">
        <div className="flex flex-wrap items-start justify-between gap-2 pr-28">
          <div>
            <DialogTitle className="font-display text-2xl">{title ?? `Modifier « ${model.title} »`}</DialogTitle>
            <DialogDescription>{intro ?? (readOnly ? model.readOnlyReason : "Onglets à gauche, colonnes au milieu, réglages de la colonne choisie à droite. Rien n’est écrit dans Google Sheets avant « Enregistrer » ; ce qui est supprimé part dans la corbeille.")}</DialogDescription>
          </div>
          <span className="flex flex-wrap items-center gap-2">
            {(layoutsEnabled || cardsEnabled || presentationsEnabled) && <span className="inline-flex flex-wrap rounded-lg border bg-muted/30 p-0.5" role="tablist" aria-label="Que modifier">
              {([["columns", Columns3, "Colonnes"], ...(layoutsEnabled ? [["form", LayoutTemplate, "Formulaire"], ["hover", MessageSquareQuote, "Survol"]] as const : []), ...(cardsEnabled ? [["cards", LayoutGrid, "Cartes"]] as const : []), ...(presentationsEnabled ? presentationKinds.filter((kind) => kind.value === "list" || !LIST_FAMILY.includes(kind.value)).map((kind) => [`view:${kind.value}`, layoutIcons[kind.value], kind.label] as const) : []), ...(statsPanel && !readOnly ? [["stats", layoutIcons.stats, "Stats"] as const] : [])] as Array<readonly [EditorMode, LucideIcon, string]>).map(([key, Icon, label]) => <Button key={key} type="button" role="tab" aria-selected={mode === key || (key === "view:list" && listFamily)} size="sm" variant={mode === key || (key === "view:list" && listFamily) ? "default" : "ghost"} className="h-7" onClick={() => setMode(key)}><Icon />{label}</Button>)}
            </span>}
            {!readOnly && <Button type="button" variant="ghost" size="sm" className="absolute top-3 right-11 h-7 text-muted-foreground" onClick={() => setMinimized(true)} title="Réduire : les modifications restent en attente pendant que tu regardes l’index (changer d’onglet, ouvrir une ligne…) ; « Reprendre » rouvre l’éditeur tel quel."><Minimize2 />Réduire</Button>}
          </span>
        </div>
      </DialogHeader>
      {leading && <div className="shrink-0">{leading}</div>}
      <div className={`grid min-h-0 flex-1 gap-3 overflow-hidden ${mode === "columns" ? asideOpen ? "md:grid-cols-[13rem_18rem_minmax(0,1fr)]" : "md:grid-cols-[2.25rem_18rem_minmax(0,1fr)]" : asideOpen ? "md:grid-cols-[13rem_minmax(0,1fr)]" : "md:grid-cols-[2.25rem_minmax(0,1fr)]"}`}>
        {/* Onglets (repliables) */}
        {!asideOpen && <aside className="flex min-h-0 flex-col items-center gap-2 rounded-xl border bg-muted/20 py-2">
          <Button type="button" variant="ghost" size="icon-sm" onClick={() => setAsideOpen(true)} aria-label="Afficher les onglets" title="Afficher le panneau des onglets"><PanelLeftOpen /></Button>
          <span className="[writing-mode:vertical-rl] rotate-180 text-[11px] font-semibold uppercase tracking-[.14em] text-muted-foreground">{tab?.name ?? "Onglets"}</span>
        </aside>}
        <aside className={`min-h-0 flex-col gap-2 overflow-y-auto ${asideOpen ? "flex" : "hidden"}`}>
          {/* Les onglets de l'index, et les réglages de l'onglet choisi */}
          <section className="flex shrink-0 flex-col gap-1 rounded-xl border bg-muted/20 p-2" aria-label="Onglets">
            <div className="flex items-center justify-between gap-1 px-1">
              <p className={sectionTitle}>Onglets</p>
              <Button type="button" variant="ghost" size="icon-xs" onClick={() => setAsideOpen(false)} aria-label="Replier les onglets" title="Replier le panneau des onglets"><PanelLeftClose /></Button>
            </div>
            {tabs.map((candidate) => <div key={candidate.id} {...(readOnly ? {} : tabDrag.props(candidate))} className={`group flex items-center gap-1 rounded-lg px-1 ${candidate.id === tab?.id ? "bg-primary/10" : "hover:bg-muted/60"} ${tabDrag.over === candidate.id ? "ring-2 ring-primary/50" : ""}`}>
              {!readOnly && <GripVertical className="size-3.5 shrink-0 cursor-grab text-muted-foreground/60" aria-hidden="true" />}
              {renaming === candidate.id
                ? <Input autoFocus value={candidate.name} onChange={(event) => updateTab({ ...candidate, name: event.target.value })} onBlur={() => setRenaming(null)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === "Escape") setRenaming(null) }} className="h-7 text-sm" />
                : <button type="button" onClick={() => { setSelectedTab(candidate.id); setSelectedColumn(candidate.columns[0]?.id ?? "") }} onDoubleClick={() => { if (!readOnly && (candidate.rename ?? true) && !candidate.removed) setRenaming(candidate.id) }} className={`min-w-0 flex-1 truncate rounded-md px-1.5 py-1.5 text-left text-sm ${candidate.removed ? "line-through opacity-60" : ""}`} title={candidate.rename === false ? candidate.renameReason : "Double-clic pour renommer"}>{candidate.name}{!candidate.original && <span className="ml-1 text-[10px] text-primary">nouveau</span>}</button>}
              {!readOnly && !candidate.removed && renaming !== candidate.id && <Button type="button" variant="ghost" size="icon-xs" className="opacity-0 group-hover:opacity-100" disabled={candidate.rename === false} title={candidate.rename === false ? candidate.renameReason : "Renommer l’onglet"} onClick={() => setRenaming(candidate.id)} aria-label="Renommer l’onglet">{candidate.rename === false ? <Lock /> : <Pencil />}</Button>}
              {candidate.removed
                ? <Button type="button" variant="ghost" size="icon-xs" onClick={() => updateTab({ ...candidate, removed: false })} title="Annuler la suppression" aria-label="Annuler la suppression"><Undo2 /></Button>
                : <Button type="button" variant="ghost" size="icon-xs" className="text-destructive" disabled={readOnly || !candidate.remove || liveTabs.length <= 1} onClick={() => updateTab({ ...candidate, removed: true })} title={candidate.remove ? "Mettre l’onglet à la corbeille" : candidate.removeReason} aria-label="Supprimer l’onglet">{candidate.remove ? <Trash2 /> : <Lock />}</Button>}
            </div>)}
            {model.addTabs && !readOnly
              ? <form className="mt-1 grid gap-1" onSubmit={(event) => { event.preventDefault(); addTab() }}>
                <span className="flex gap-1"><Input value={newTab} onChange={(event) => setNewTab(event.target.value)} placeholder="Nouvel onglet" className="h-8 text-xs" /><Button type="submit" size="icon-sm" variant="outline" aria-label="Ajouter l’onglet"><Plus /></Button></span>
                {presets.length > 0 && <NativeSelect value={newTabPreset} onChange={(event) => setNewTabPreset(event.target.value)} className="h-7 text-[11px]" aria-label="Colonnes du nouvel onglet">
                  <NativeSelectOption value="">Sans preset (Nom et ID)</NativeSelectOption>
                  {presets.map((preset) => <NativeSelectOption key={preset.id} value={preset.id}>Preset : {preset.name}</NativeSelectOption>)}
                </NativeSelect>}
              </form>
              : model.addTabsReason && <p className="mt-1 flex gap-1 px-1 text-[11px] text-muted-foreground"><Lock className="mt-0.5 size-3 shrink-0" />{model.addTabsReason}</p>}
            {!readOnly && tab && !tab.removed && tab.itemLabel !== undefined && <label className="mt-1 grid gap-1 border-t border-dashed px-1 pt-2 text-[11px] text-muted-foreground" title="Le mot des boutons et messages de l’onglet : « + Ajouter un lieu », « Ce lieu a été supprimé »…">
              Une ligne de « {tab.name} » s’appelle
              <Input value={tab.itemLabel} maxLength={60} onChange={(event) => updateTab({ ...tab, itemLabel: event.target.value })} placeholder="une ligne" className="h-7 text-xs" />
            </label>}
            {model.family === "objects" && !readOnly && tab && !tab.removed && liveTabs.length > 1 && <div className="mt-1 grid gap-1 border-t border-dashed pt-2">
              <Button type="button" variant="outline" size="sm" className="h-auto min-h-8 whitespace-normal py-1 text-xs" onClick={() => alignOn(tab)} title="Mêmes noms (fautes corrigées), mêmes types, mêmes styles imposés et même ordre pour tous les onglets. Rien n’est supprimé.">
                <Columns3 />Aligner les autres onglets sur « {tab.name} »
              </Button>
              {alignNotice && <p className="text-[10px] leading-4 text-muted-foreground">{alignNotice}</p>}
            </div>}
            {!readOnly && tabs.length > 1 && <p className="px-1 pt-1 text-[10px] leading-4 text-muted-foreground">Glisse un onglet par sa poignée pour changer l’ordre ; double-clic pour le renommer.</p>}
          </section>

          {/* La vue modifiée de l'onglet choisi : le même menu partout (versions, presets) */}
          {(mode === "form" || mode === "hover") && layoutsEnabled && tab && !tab.removed && (() => {
            const kind: LayoutKind = mode
            const named = namedLayoutsOf(tab, kind)
            const editKey = `${kind}:${tab.id}`
            const chosen = named.find((item) => item.id === editedLayout[editKey])
            const current = chosen ? chosen.layout : layoutOf(tab, kind).layout
            const label = kind === "form" ? "Formulaire" : "Survol"
            const select = (id: string) => setEditedLayout((state) => ({ ...state, [editKey]: id }))
            const setNamed = (list: NamedLayout[], main?: IndexLayout) => touchLayout(tab, { ...(kind === "form" ? { forms: list } : { hovers: list }), ...(main ? kind === "form" ? { form: main } : { hover: main } : {}) })
            const add = (name: string, layout: IndexLayout) => { const id = layoutId(); setNamed([...named, { id, name, layout }]); select(id) }
            return <LayoutViewsPanel
              key={editKey}
              kind={kind}
              tabName={tab.name}
              items={[{ id: DEFAULT_FORM_ID, name: `${label} principal` }, ...named.map((item) => ({ id: item.id, name: item.name }))]}
              selectedId={chosen?.id ?? DEFAULT_FORM_ID}
              onSelect={select}
              onStar={(id) => {
                // L'étoile passe à cette version : elle devient celle qu'Eraser montre, l'ancienne garde une place nommée.
                const target = named.find((item) => item.id === id)
                if (!target) return
                setNamed([...named.filter((item) => item.id !== id), { id: layoutId(), name: `Ancien ${label.toLocaleLowerCase("fr")} principal`, layout: layoutOf(tab, kind).layout }], target.layout)
                select(DEFAULT_FORM_ID)
              }}
              onRename={(id, name) => setNamed(named.map((item) => item.id === id ? { ...item, name } : item))}
              onMove={(delta) => {
                // Seules les versions nommées se déplacent : l'étoilée reste en tête.
                if (!chosen) return
                const at = named.findIndex((item) => item.id === chosen.id)
                const to = at + delta
                if (at < 0 || to < 0 || to >= named.length) return
                const list = [...named]
                list.splice(to, 0, list.splice(at, 1)[0])
                setNamed(list)
              }}
              onNew={() => add(`${label} ${named.length + 2}`, automaticLayoutFor(kind, layoutColumnsOf(tab, kind)))}
              onDuplicate={() => add(`${chosen ? chosen.name : `${label} principal`} (copie)`, current)}
              onRemove={() => { if (!chosen) return; setNamed(named.filter((item) => item.id !== chosen.id)); select(DEFAULT_FORM_ID) }}
              full={named.length >= 11}
              layout={current}
              otherTabs={otherTabsOf(tab).map((other) => { const target = tabs.find((candidate) => candidate.id === other.id); return target && namedLayoutsOf(target, kind).length >= 11 ? { ...other, disabled: true, hint: "12 versions au plus" } : other })}
              disabled={pending || layoutSaving}
              onApply={(layout) => chosen ? setNamed(named.map((item) => item.id === chosen.id ? { ...item, layout } : item)) : touchLayout(tab, kind === "form" ? { form: layout } : { hover: layout })}
              onCopyTo={(ids, star) => setLayoutDrafts((state) => ({ ...state, ...Object.fromEntries(ids.flatMap((id) => {
                // La copie s'ajoute aux versions de l'onglet, sans rien remplacer ; à l'étoile, l'ancienne étoilée garde une place nommée.
                const target = tabs.find((candidate) => candidate.id === id)
                if (!target) return []
                const key = kind === "form" ? "forms" : "hovers"
                const touched = state[id]
                const list = touched && key in touched ? touched[key] ?? [] : savedLayoutsOf(target)?.[key] ?? []
                if (list.length >= 11) return []
                const copy = { id: layoutId(), name: `${chosen ? chosen.name : `${label} principal`} (de « ${tab.name} »)`, layout: current }
                if (!star) return [[id, { ...touched, [key]: [...list, copy] }]]
                const previous = { id: layoutId(), name: `Ancien ${label.toLocaleLowerCase("fr")} principal`, layout: layoutOf(target, kind).layout }
                return [[id, { ...touched, [kind]: current, [key]: [...list, previous] }]]
              })) }))}
            />
          })()}
          {mode === "cards" && cardsEnabled && tab && !tab.removed && (() => {
            const entry = cardsOf(tab)
            return <CardsPanel
              key={tab.id}
              tabName={tab.name}
              columns={cardColumnsOf(tab)}
              value={entry}
              builtin={entry.builtin}
              builtins={tabCardsOf({}, cardsIndex ?? model.key, tab.original ?? tab.name.trim()).cards}
              samples={sampleRows[tab.original ?? tab.name] ?? []}
              otherTabs={otherTabsOf(tab).map((other) => { const target = tabs.find((candidate) => candidate.id === other.id); return target && cardsOf(target).cards.length >= 12 ? { ...other, disabled: true, hint: "12 cartes au plus" } : other })}
              selected={selectedCard[tab.id] ?? null}
              onSelect={(id) => setSelectedCard((current) => ({ ...current, [tab.id]: id }))}
              disabled={pending || layoutSaving}
              onChange={(next) => setCardDrafts((current) => ({ ...current, [tab.id]: { cards: next.cards, ...(next.defaultId ? { defaultId: next.defaultId } : {}) } }))}
              onCopyTo={(ids, card, star) => setCardDrafts((current) => ({ ...current, ...Object.fromEntries(ids.flatMap((id) => {
                // La carte s'ajoute (un onglet plein n'est pas proposé) ; à l'étoile, elle devient celle montrée d'abord.
                const target = tabs.find((candidate) => candidate.id === id)
                const base = target ? cardsOf(target) : { cards: [] as CardTemplate[] }
                if (base.cards.length >= 12) return []
                const copy = duplicateCard(card)
                return [[id, { ...base, cards: [...base.cards, copy], ...(star ? { defaultId: copy.id } : {}) }]]
              })) }))}
              onReset={() => setCardDrafts((current) => ({ ...current, [tab.id]: null }))}
            />
          })()}
          {viewKind && presentationsEnabled && tab && !tab.removed && (() => {
            const editKey = `${viewKind}:${tab.id}`
            return <PresentationsPanel
              key={editKey}
              kind={viewKind}
              family={listFamily ? LIST_FAMILY : undefined}
              tabName={tab.name}
              columns={viewColumnsOf(tab)}
              value={presentationsOf(tab)}
              selectedId={editedView[editKey] ?? (listFamily ? `${openedKind}|${MAIN_PRESENTATION_ID}` : MAIN_PRESENTATION_ID)}
              onSelect={(id) => setEditedView((state) => ({ ...state, [editKey]: id }))}
              onChange={(next) => setPresentationDrafts((state) => ({ ...state, [tab.id]: next }))}
              presets={viewPresets}
              onSavePreset={onSaveViewPreset}
              onDeletePreset={onDeleteViewPreset}
              otherTabs={otherTabsOf(tab).map((other) => { const target = tabs.find((candidate) => candidate.id === other.id); return target && namedPresentationsOf(presentationsOf(target), viewKind).length >= 11 ? { ...other, disabled: true, hint: "12 versions au plus" } : other })}
              onCopyTo={(ids, layout, star, name) => setPresentationDrafts((state) => ({ ...state, ...Object.fromEntries(ids.flatMap((id) => {
                // La vue s'ajoute aux versions de l'onglet, sans rien remplacer ; à l'étoile, l'ancienne étoilée garde une place nommée.
                // Sa forme est la sienne (une version kanban de la Liste reste un kanban).
                const form = isPresentationKind(layout.kind) ? layout.kind : viewKind
                const target = tabs.find((candidate) => candidate.id === id)
                if (!target) return []
                const value = state[id] ?? presentationsOf(target)
                if (namedPresentationsOf(value, form).length >= 11) return []
                const fitted = { ...fitLayoutToColumns(layout, viewColumnsOf(target)), kind: form }
                const copyId = () => Math.random().toString(36).slice(2, 10)
                if (!star) return [[id, { ...value, named: [...(value.named ?? []), { id: copyId(), name: `${name} (de « ${tab.name} »)`, layout: fitted }] }]]
                const previous = value[form] ? [{ id: copyId(), name: "Ancienne vue principale", layout: { ...value[form]!, kind: form } }] : []
                return [[id, { ...value, [form]: fitted, named: [...(value.named ?? []), ...previous] }]]
              })) }))}
              disabled={pending || layoutSaving}
            />
          })()}
        </aside>

        {mode === "stats" && statsPanel && <section className="grid min-h-0 content-start gap-3 overflow-y-auto pr-1">
          <div className="rounded-xl border bg-muted/20 px-3 py-2 text-xs leading-5 text-muted-foreground">
            Les <b className="text-foreground">statistiques</b> de cet index, sur tous ses onglets. Une statistique <b className="text-foreground">épinglée</b> s’affiche dans les onglets stat de l’index. Enregistrées aussitôt dans Eraser, pour tout le monde.
          </div>
          {statsPanel}
        </section>}

        {viewKind && tab && (() => {
          // La version ouverte : « forme|id » pour la Liste (la liste principale d'office), sinon son identifiant.
          const chosen = editedView[`${viewKind}:${tab.id}`] ?? (listFamily ? `${openedKind}|${MAIN_PRESENTATION_ID}` : MAIN_PRESENTATION_ID)
          const [editedKind, versionId] = listFamily && chosen.includes("|") ? [chosen.split("|")[0] as PresentationKind, chosen.split("|")[1]] : [viewKind, chosen]
          return <section className="grid min-h-0 content-start gap-3 overflow-y-auto pr-1 lg:grid-rows-[minmax(0,1fr)] lg:overflow-hidden lg:pr-0">
          <IndexPresentationsEditor
            key={`${tab.id}:${editedKind}:${versionId}`}
            kind={editedKind}
            versionId={versionId}
            tabName={tab.name}
            columns={tab.columns.filter((item) => !item.removed && item.header.trim() && !/^id$/i.test(item.header.trim())).map((item) => item.header.trim())}
            rows={previewRows[tab.original ?? tab.name.trim()] ?? sampleRows[tab.original ?? tab.name.trim()] ?? []}
            value={presentationsOf(tab)}
            onChange={(next) => setPresentationDrafts((current) => ({ ...current, [tab.id]: next }))}
            optionsOf={optionsOf ? (header) => optionsOf(tab.original ?? tab.name.trim(), header) : undefined}
            cards={cardsEnabled ? cardsOf(tab).cards : []}
            cardColumns={cardsEnabled ? cardColumnsOf(tab) : []}
            forms={[{ id: DEFAULT_FORM_ID, name: "Formulaire principal", layout: layoutOf(tab, "form").layout }, ...namedFormsOf(tab)]}
            hovers={namedLayoutsOf(tab, "hover").map((hover) => ({ id: hover.id, name: hover.name }))}
            stats={stats}
          />
        </section>
        })()}

        {mode === "cards" && tab && <section className="grid min-h-0 content-start gap-3 overflow-y-auto pr-1 lg:grid-rows-[minmax(0,1fr)] lg:overflow-hidden lg:pr-0">
          {(() => {
            const entry = cardsOf(tab)
            return <IndexCardEditor
              key={tab.id}
              tabName={tab.name}
              columns={cardColumnsOf(tab)}
              value={entry}
              builtins={tabCardsOf({}, cardsIndex ?? model.key, tab.original ?? tab.name.trim()).cards}
              samples={sampleRows[tab.original ?? tab.name] ?? []}
              selected={selectedCard[tab.id] ?? null}
              onSelect={(id) => setSelectedCard((current) => ({ ...current, [tab.id]: id }))}
              hovers={namedLayoutsOf(tab, "hover").map((hover) => ({ id: hover.id, name: hover.name }))}
              extras={{ forms: [{ id: DEFAULT_FORM_ID, name: "Formulaire principal" }, ...namedFormsOf(tab).map((form) => ({ id: form.id, name: form.name }))], indexes: model.relationTargets, tabs: tabs.filter((item) => !item.removed).map((item) => item.name), family: model.family === "objects" ? "objects" : "world" }}
              disabled={pending || layoutSaving || tab.removed}
              onChange={(next) => setCardDrafts((current) => ({ ...current, [tab.id]: { cards: next.cards, ...(next.defaultId ? { defaultId: next.defaultId } : {}) } }))}
            />
          })()}
        </section>}

        {(mode === "form" || mode === "hover") && tab && (() => {
          const formId = editedLayout[`${mode}:${tab.id}`] ?? DEFAULT_FORM_ID
          const list = namedLayoutsOf(tab, mode)
          const named = formId !== DEFAULT_FORM_ID ? list.find((item) => item.id === formId) : undefined
          const main = layoutOf(tab, mode)
          const current = named ? { layout: named.layout, source: "saved" as const } : main
          const columns = layoutColumnsOf(tab, mode)
          // L'aperçu en grand passe d'une ligne à l'autre : celles de l'aperçu des vues (une quarantaine), sinon les premières.
          const sampleRows = previewRows[tab.original ?? tab.name.trim()]?.length ? previewRows[tab.original ?? tab.name.trim()] : sampleRowsOf(tab)
          const update = (layout: IndexLayout) => {
            if (!named) return touchLayout(tab, mode === "form" ? { form: layout } : { hover: layout })
            const next = list.map((item) => item.id === named.id ? { ...item, layout } : item)
            touchLayout(tab, mode === "form" ? { forms: next } : { hovers: next })
          }
          return <section className="grid min-h-0 content-start gap-3 overflow-y-auto pr-1 lg:grid-rows-[minmax(0,1fr)] lg:overflow-hidden lg:pr-0">
            <IndexLayoutEditor
              key={`${tab.id}:${mode}:${named?.id ?? DEFAULT_FORM_ID}`}
              kind={mode}
              columns={columns}
              value={current.layout}
              source={current.source}
              onChange={update}
              onReset={named ? undefined : () => touchLayout(tab, mode === "form" ? { form: null } : { hover: null })}
              resetLabel={tab.original && builtinLayoutFor(model.key, tab.original, mode) ? "Revenir à la mise en page d’Eraser" : "Revenir à l’affichage automatique"}
              sample={sampleRows[0]}
              samples={sampleRows}
              indexTitle={model.title}
              sampleRow={sampleRows[0] ? { index: model.key, id: sampleRows[0].ID ?? "", tab: tab.original ?? tab.name } : undefined}
              forms={[{ id: DEFAULT_FORM_ID, name: "Formulaire principal" }, ...namedFormsOf(tab).map((item) => ({ id: item.id, name: item.name }))]}
              valuesOf={valuesOf && tab.original ? (header) => valuesOf(tab.original!, tab.columns.find((column) => foldName(column.header) === foldName(header))?.original ?? header) : undefined}
              eraserStarters={tab.original ? eraserLayoutStarters(model.key, tab.original, mode) : []}
              disabled={pending || layoutSaving || tab.removed}
            />
          </section>
        })()}

        {/* Colonnes */}
        {mode === "columns" && <>
        <section className="flex min-h-0 flex-col gap-1 overflow-y-auto rounded-xl border bg-muted/20 p-2">
          <p className={`${sectionTitle} px-1`}>Colonnes de « {tab?.name} »</p>
          {tab?.columns.map((item, index) => {
            const spec = item.spec
            const place = placementOf(spec)
            return <div key={item.id} {...(readOnly || tab.removed ? {} : columnDrag.props(item))} className={`group flex items-center gap-1 rounded-lg px-1 py-0.5 ${item.id === column?.id ? "bg-primary/10" : "hover:bg-muted/60"} ${columnDrag.over === item.id ? "ring-2 ring-primary/50" : ""} ${item.removed ? "opacity-55" : ""}`}>
              {!readOnly && <GripVertical className="size-3.5 shrink-0 cursor-grab text-muted-foreground/60" aria-hidden="true" />}
              <button type="button" onClick={() => setSelectedColumn(item.id)} className="grid min-w-0 flex-1 px-1 py-1 text-left">
                <span className={`truncate text-sm font-medium ${item.removed ? "line-through" : ""}`}>{item.header || "(sans nom)"}{!item.original && <span className="ml-1 text-[10px] text-primary">nouvelle</span>}</span>
                <span className="flex flex-wrap items-center gap-1 text-[10px] text-muted-foreground">
                  {indexColumnKinds[spec.kind].label}
                  {(spec.hidden || place === "sheet") && <EyeOff className="size-3" aria-label="Masquée du tableau" />}
                  {spec.style && !spec.style.keepCellFormatting && <span className="rounded bg-muted px-1">Style</span>}
                  {item.lockedPolicy ? <LockOpen className="size-3 text-destructive" aria-label="Déverrouillée : voir l’avertissement" /> : item.policy.reasons.length > 0 && <Lock className="size-3 text-amber-700" aria-label={lockedTitle(item)} />}
                </span>
              </button>
              {!readOnly && !tab.removed && <span className="flex opacity-0 group-hover:opacity-100">
                <Button type="button" variant="ghost" size="icon-xs" disabled={index === 0} onClick={() => columnDrag.move(item.id, -1)} aria-label="Monter"><ArrowUp /></Button>
                <Button type="button" variant="ghost" size="icon-xs" disabled={index === tab.columns.length - 1} onClick={() => columnDrag.move(item.id, 1)} aria-label="Descendre"><ArrowDown /></Button>
              </span>}
            </div>
          })}
          {tab && !tab.columns.length && <p className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">« Nom » et « ID » sont créés d’office. Ajoute tes colonnes ici.</p>}
          {tab?.addColumns && !readOnly && !tab.removed
            ? <form className="mt-1 flex gap-1" onSubmit={(event) => { event.preventDefault(); addColumn() }}><Input value={newColumn} onChange={(event) => setNewColumn(event.target.value)} placeholder="Nouvelle colonne" className="h-8 text-xs" /><Button type="submit" size="icon-sm" variant="outline" aria-label="Ajouter la colonne"><Plus /></Button></form>
            : tab?.addColumnsReason && <p className="mt-1 flex gap-1 px-1 text-[11px] text-muted-foreground"><Lock className="mt-0.5 size-3 shrink-0" />{tab.addColumnsReason}</p>}
          {tab && !tab.removed && <div className="mt-2"><PresetBar tabName={tab.name} columns={tab.columns.filter((item) => !item.removed).map((item) => ({ header: item.header, spec: item.spec }))} canApply={Boolean(tab.addColumns) && !readOnly} readOnly={readOnly} onApply={applyPreset} /></div>}
          {!readOnly && <p className="mt-auto px-1 pt-2 text-[10px] text-muted-foreground">Glisse une colonne (ou utilise les flèches) pour changer sa place, dans Eraser et dans Google Sheets.</p>}
        </section>

        {/* Réglages */}
        <section className="grid min-h-0 content-start gap-3 overflow-y-auto pr-1">
          {column && tab ? <>
            <div className={box}>
              {/* Première ligne : le nom, la description, l'œil, le cadenas, la poubelle, et le type. */}
              <div className="flex flex-wrap items-center gap-1.5">
                <Input value={column.header} disabled={columnDisabled || !policy.rename} onChange={(event) => updateColumn({ ...column, header: event.target.value })} className="h-9 min-w-40 flex-1 text-base font-semibold" aria-label="Nom de la colonne" placeholder="Nom de la colonne" title={!policy.rename && !columnDisabled ? "Nom verrouillé : voir le cadenas." : undefined} />
                <span className="flex items-center gap-0.5">
                  <ColumnDescriptionButton value={column.spec.description ?? ""} disabled={displayDisabled} onChange={(description) => updateColumn({ ...column, spec: { ...column.spec, description: description || undefined } })} />
                  {(() => { const hiddenColumn = Boolean(column.spec.hidden) || placementOf(column.spec) === "sheet"; return <Button type="button" variant={hiddenColumn ? "secondary" : "ghost"} size="icon-sm" className={hiddenColumn ? "text-muted-foreground" : "text-muted-foreground/60"} disabled={displayDisabled} onClick={() => updateColumn({ ...column, spec: { ...column.spec, hidden: hiddenColumn ? undefined : true, placement: placementOf(column.spec) === "sheet" ? undefined : column.spec.placement, form: undefined } })} aria-pressed={hiddenColumn} aria-label={hiddenColumn ? "Colonne masquée : la montrer dans le tableau" : "Colonne visible : la masquer du tableau"} title={hiddenColumn ? "Masquée du tableau (« Colonnes masquées » la montre d’un clic). Cliquer pour la montrer." : "Visible dans le tableau. Cliquer pour la masquer."}>{hiddenColumn ? <EyeOff /> : <Eye />}</Button> })()}
                  <ColumnLockButton policy={policy} disabled={columnDisabled} onChange={(next) => updateColumn({ ...column, policy: next, lockedPolicy: undefined })} />
                  {column.removed
                    ? <Button type="button" variant="secondary" size="icon-sm" onClick={() => updateColumn({ ...column, removed: false })} aria-label="Annuler la suppression" title="Mise à la corbeille à « Enregistrer » : cliquer pour annuler"><Undo2 /></Button>
                    : <Button type="button" variant="ghost" size="icon-sm" className={policy.remove ? "text-destructive/80 hover:text-destructive" : "text-muted-foreground/50"} disabled={readOnly || tab.removed || !policy.remove} onClick={() => updateColumn({ ...column, removed: true })} aria-label="Mettre la colonne à la corbeille" title={policy.remove ? "Mettre la colonne à la corbeille (à « Enregistrer »)" : "Suppression verrouillée : voir le cadenas."}>{policy.remove ? <Trash2 /> : <Lock />}</Button>}
                </span>
                <ColumnTypeMenu spec={column.spec} policy={policy} disabled={columnDisabled} family={model.family} onPick={pickKind} icons={kindIcons} />
              </div>
              {column.removed && <p className="text-[11px] text-muted-foreground">Cette colonne part à la corbeille à « {submitLabel} » (restaurable depuis Administration › Corbeille).</p>}
              {policy.unlocked && !column.removed && <p className="flex items-center gap-1.5 text-[11px] text-destructive"><TriangleAlert className="size-3.5 shrink-0" />Cadenas d’Eraser retiré : ce qui lit cette colonne par son nom peut casser si elle change. Le cadenas se remet d’un clic.</p>}
            </div>
            <div className={box}>
              <p className="font-semibold">Réglages du type {indexColumnKinds[column.spec.kind].label}</p>
              <TypeSettings
                spec={column.spec}
                onChange={(spec) => updateColumn({ ...column, spec })}
                disabled={typeDisabled}
                lookDisabled={displayDisabled}
                targets={model.relationTargets}
                siblings={tab.columns.filter((item) => item.id !== column.id)}
                tabs={tabs}
                family={model.family}
                indexKey={model.key}
                sampleRows={sampleRows[tab.original ?? tab.name] ?? []}
                openGuide={(section) => setGuide(section)}
              />
              {model.family === "world" && DEFAULT_VALUE_KINDS.has(column.spec.kind) && <label className="grid gap-1 text-xs">
                <span><b>Valeur d’une nouvelle ligne</b> : écrite dans la case laissée vide quand une ligne est ajoutée (ou tapée dans Sheets puis reçue par Eraser).</span>
                <Input disabled={typeDisabled} value={column.spec.defaultValue ?? ""} maxLength={200} onChange={(event) => updateColumn({ ...column, spec: { ...column.spec, defaultValue: event.target.value || (column.originalSpec?.defaultValue ? "" : undefined) } })} placeholder={column.spec.kind === "checkbox" ? "Oui ou Non" : "Vide"} className="h-8 text-xs" />
              </label>}
              {typeDisabled && !readOnly && <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Lock className="size-3.5" />Type verrouillé (cadenas) : la description, l’œil, le style imposé{column.spec.kind === "choice" ? ", les couleurs, les groupes et l’ordre des options" : ""} restent modifiables.</p>}
              <OptionsSettings spec={column.spec} onChange={(spec) => updateColumn({ ...column, spec })} disabled={displayDisabled} />
            </div>
            <StyleSettings spec={column.spec} onChange={(spec) => updateColumn({ ...column, spec })} disabled={displayDisabled} colorColumns={tab.columns.filter((item) => item.id !== column.id && !item.removed && item.header.trim() && isColorSourceSpec(item.spec)).map((item) => item.header.trim())} />
          </> : <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">Choisis une colonne à gauche, ou ajoute-en une.</p>}
        </section>
        </>}
      </div>

      {/* Résumé : toujours lisible, jamais écrasé */}
      <div className="shrink-0 rounded-xl border bg-muted/30 px-3 py-2 text-xs">
        {problems.length > 0 && <div className="mb-1 grid max-h-20 gap-0.5 overflow-y-auto">{problems.map((problem) => <p key={problem} className="text-destructive">{problem}</p>)}</div>}
        {error && <p className="mb-1 text-destructive">{error}</p>}
        {layoutError && <p className="mb-1 text-destructive">{layoutError}</p>}
        <div className="flex items-center gap-2">
          <Settings2 className="size-3.5 shrink-0" />
          <span className="font-semibold">{operations.length + layoutChanges.length + cardChanges.length + presentationChanges.length + lockChanges.length
            ? [
              operations.length ? `${operations.length} changement${operations.length > 1 ? "s" : ""} à écrire dans Google Sheets` : "",
              // Les mises en page sont des réglages d'Eraser : gardées sur son serveur partagé, pas dans Sheets.
              layoutChanges.length ? `${layoutChanges.length} mise${layoutChanges.length > 1 ? "s" : ""} en page à enregistrer dans Eraser (pour tout le monde)` : "",
              presentationChanges.length ? `Vues de ${presentationChanges.filter((change) => change.presentations).length || presentationChanges.length} onglet(s) à enregistrer dans Eraser (pour tout le monde)` : "",
              cardChanges.length ? (() => { const count = cardChanges.filter((change) => change.cards).length || cardChanges.length; return `Cartes de ${count} onglet${count > 1 ? "s" : ""} à enregistrer dans Eraser (pour tout le monde)` })() : "",
              lockChanges.length ? `Cadenas de ${lockChanges.length} onglet${lockChanges.length > 1 ? "s" : ""} à enregistrer dans Eraser (pour tout le monde)` : "",
            ].filter(Boolean).join(" · ")
            : "Aucun changement pour l’instant"}</span>
          {operations.length + layoutChanges.length + cardChanges.length + presentationChanges.length + lockChanges.length > 0 && <Button type="button" variant="link" size="sm" className="h-auto p-0 text-xs" onClick={() => setShowChanges(!showChanges)}>{showChanges ? "Masquer le détail" : "Voir le détail"}</Button>}
        </div>
        {showChanges && <ul className="mt-1 grid max-h-32 gap-0.5 overflow-y-auto text-muted-foreground">
          {operations.map((operation, index) => <li key={index}>• {describe(operation)}</li>)}
          {presentationChanges.map((change, index) => <li key={`views-${index}`}>• Vues de « {change.tab} » (dans Eraser) : {change.presentations ? `${presentationEntries(change.presentations).length} réglée(s)${change.presentations.named?.length ? `, ${change.presentations.named.length} autre(s) version(s)` : ""}` : "réglages d’office"}</li>)}
          {cardChanges.map((change, index) => <li key={`cards-${index}`}>• Cartes de « {change.tab} » (dans Eraser) : {change.cards ? `${change.cards.cards.length} carte${change.cards.cards.length > 1 ? "s" : ""}` : "retour aux cartes d’Eraser"}</li>)}
          {lockChanges.map((change, index) => <li key={`locks-${index}`}>• Cadenas de « {change.tab} » (dans Eraser) : {change.locks ? `${Object.keys(change.locks).length} colonne${Object.keys(change.locks).length > 1 ? "s" : ""} réglée${Object.keys(change.locks).length > 1 ? "s" : ""}` : "ceux d’Eraser"}</li>)}
          {layoutChanges.map((change, index) => <li key={`layout-${index}`}>• Mise en page de « {change.tab} » (dans Eraser) : {!change.form && !change.hover && !change.forms?.length ? "affichage d’Eraser" : [change.form ? "formulaire réglé" : "formulaire d’Eraser", change.hover ? "survol réglé" : "survol d’Eraser", ...(change.forms?.length ? [`${change.forms.length} autre${change.forms.length > 1 ? "s" : ""} formulaire${change.forms.length > 1 ? "s" : ""}`] : [])].join(", ")}</li>)}
        </ul>}
      </div>
      <DialogFooter className="shrink-0 sm:justify-between">
        <span>
          {onDeleteIndex && model.deleteIndex && (model.deleteIndex.allowed
            ? <AlertDialog>
              <AlertDialogTrigger asChild><Button type="button" variant="ghost" className="text-destructive" disabled={pending}><Trash2 />Supprimer l’index</Button></AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Supprimer l’index « {model.title} » ?</AlertDialogTitle>
                  <AlertDialogDescription>Il part dans la corbeille (Administration › Corbeille) avec tous ses onglets : il disparaît d’Eraser, mais son classeur reste intact dans Google Drive et on peut le restaurer. « Supprimer définitivement », depuis la corbeille, met le classeur dans la corbeille de Google Drive.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter><AlertDialogCancel>Annuler</AlertDialogCancel><AlertDialogAction variant="destructive" onClick={onDeleteIndex}>Mettre à la corbeille</AlertDialogAction></AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            : <Button type="button" variant="ghost" disabled title={model.deleteIndex.reason} className="text-muted-foreground"><Lock />Supprimer l’index</Button>)}
          {model.deleteIndex && !model.deleteIndex.allowed && model.deleteIndex.reason && <span className="ml-1 hidden text-[11px] text-muted-foreground lg:inline">{model.deleteIndex.reason}</span>}
        </span>
        <span className="flex gap-2">
        <Button type="button" variant="outline" size="icon" onClick={() => setGuide("types")} aria-label="Guide des colonnes" title="Guide : types de colonnes, formules, boutons, aléatoire"><BookOpen /></Button>
        <Button type="button" variant="outline" onClick={requestClose} disabled={pending}>{readOnly ? "Fermer" : "Annuler"}</Button>
        {!readOnly && <Button type="button" disabled={pending || layoutSaving || !canSubmit || !(operations.length || layoutChanges.length || cardChanges.length || presentationChanges.length || lockChanges.length) || problems.length > 0} onClick={() => void submit()}>{pending || layoutSaving ? <LoaderCircle className="animate-spin" /> : <Save />}{submitLabel}</Button>}
        </span>
      </DialogFooter>
      {guide && <IndexGuide open section={guide} onClose={() => setGuide(null)} />}
    </DialogContent>
  </Dialog>
  </>
}

/**
 * « Modifier » d'un index que le code d'Eraser lit colonne par colonne (sorts, PNJ,
 * campagnes, personnages) : l'éditeur s'ouvre en lecture seule et explique chaque cadenas.
 */
export function ReadOnlyIndexEditorButton({ model, disabled = false }: { model: () => IndexEditorModel; disabled?: boolean }) {
  const [open, setOpen] = useState<IndexEditorModel | null>(null)
  return <>
    <Button type="button" variant="outline" onClick={() => setOpen(model())} disabled={disabled} title="Voir les colonnes de cet index et ce qui les verrouille"><Settings2 />Modifier</Button>
    {open && <IndexEditor model={open} open onClose={() => setOpen(null)} onApply={() => setOpen(null)} onDeleteIndex={() => undefined} />}
  </>
}

