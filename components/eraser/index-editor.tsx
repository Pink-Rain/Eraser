"use client"

import { useMemo, useState, type DragEvent, type ReactNode } from "react"
import { ArrowDown, ArrowLeftRight, ArrowUp, Bold, BookOpen, Columns3, LayoutTemplate, MessageSquareQuote, CircleHelp, Copy, Dices, Eye, EyeOff, FolderTree, FunctionSquare, Gauge, GripVertical, Hash, Italic, List, ListChecks, ListTree, LoaderCircle, Lock, LockOpen, MousePointerClick, Palette, Paperclip, Pencil, Plus, Save, Search as SearchIcon, Settings2, Sigma, Sparkles, SquareCheck, Strikethrough, Trash2, TriangleAlert, Type as TypeIcon, Underline, Undo2, type LucideIcon, Shapes } from "lucide-react"

import { IconPicker, IndexIconGlyph } from "@/components/eraser/index-gauge"
import { IndexGuide, type GuideSection } from "@/components/eraser/index-guide"
import { PresetBar, useColumnPresets } from "@/components/eraser/index-presets-ui"
import { IndexLayoutEditor, type LayoutColumn } from "@/components/eraser/index-layout-editor"
import { columnStyleCss, pillStyle, stylePalette } from "@/components/eraser/index-style"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { Textarea } from "@/components/ui/textarea"
import { actionStepCatalog, describeStep, newStep, stepInfo } from "@/lib/index-actions"
import {
  columnTypeLabel,
  fileAcceptLabels,
  foldName,
  formulaResultLabels,
  gaugeScaleOf,
  indexColumnKinds,
  isColorSourceSpec,
  isSheetSpec,
  kindGroups,
  normalizeSpec,
  placementLabels,
  placementOf,
  randomSourceLabels,
  rollupLabels,
  type ActionButton,
  type ActionStep,
  type ColumnPlacement,
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
import { renameLayoutColumns, serializeIndexLayout, tabLayout, type IndexLayout, type LayoutKind, type TabLayouts } from "@/lib/index-layouts"
import { unitFamilies, type UnitFamily } from "@/lib/index-numbers"
import {
  creatableKinds,
  freePolicy,
  headerProblem,
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
type DraftColumn = { id: string; original?: string; originalIndex?: number; header: string; spec: IndexColumnSpec; originalSpec?: IndexColumnSpec; policy: ColumnPolicy; lockedPolicy?: ColumnPolicy; removed: boolean }
type DraftTab = { id: string; original?: string; name: string; columns: DraftColumn[]; removed: boolean; remove: boolean; removeReason?: string; rename?: boolean; renameReason?: string; addColumns: boolean; addColumnsReason?: string }

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
    if (kind === "form" ? !isSheetSpec(spec) || formHidden.includes(spec.kind) : hoverHidden.includes(spec.kind)) return []
    return [{ header: item.header.trim(), spec }]
  })
}

function draftOf(model: IndexEditorModel): DraftTab[] {
  return model.tabs.map((tab) => ({
    id: nextId(),
    original: tab.name,
    name: tab.name,
    removed: false,
    remove: tab.remove,
    removeReason: tab.removeReason,
    rename: tab.rename,
    renameReason: tab.renameReason,
    addColumns: tab.addColumns,
    addColumnsReason: tab.addColumnsReason,
    // Les réglages sont lus sous leur forme actuelle (« Affichage fixe » → style imposé…).
    columns: tab.columns.map((column, index) => { const spec = normalizeSpec(column.spec); return { id: nextId(), original: column.header, originalIndex: index, header: column.header, spec, originalSpec: spec, policy: column.policy, removed: false } }),
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
      const force = column.lockedPolicy ? { force: true } : {}
      if (column.removed) { operations.push({ op: "remove-column", tab: tab.original, header: column.original, ...force }); continue }
      const header = column.header.trim()
      if (header !== column.original) operations.push({ op: "rename", tab: tab.original, header: column.original, to: header, ...force })
      if (column.originalSpec && !sameSpec(column.spec, column.originalSpec)) operations.push({ op: "spec", tab: tab.original, header, spec: column.spec, ...force })
    }
    // L'ordre : les colonnes gardées puis les nouvelles, telles que le serveur les aurait sans déplacement.
    const live = tab.columns.filter((column) => !column.removed)
    const natural = [...live.filter((column) => column.original).sort((left, right) => (left.originalIndex ?? 0) - (right.originalIndex ?? 0)), ...live.filter((column) => !column.original)]
    if (live.some((column, index) => column.id !== natural[index].id)) operations.push({ op: "order-columns", tab: tab.original, headers: live.map((column) => column.header.trim()) })
    if (tab.name.trim() !== tab.original) operations.push({ op: "rename-tab", tab: tab.original, to: tab.name.trim() })
  }
  const liveTabs = tabs.filter((tab) => !tab.removed)
  const naturalTabs = [...originalTabOrder.flatMap((name) => liveTabs.filter((tab) => tab.original === name)), ...liveTabs.filter((tab) => !tab.original)]
  if (liveTabs.some((tab, index) => tab.id !== naturalTabs[index]?.id)) operations.push({ op: "order-tabs", tabs: liveTabs.map((tab) => tab.name.trim()) })
  return operations
}

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

/**
 * Le cadenas d'une colonne : ce qui la lit, et le bouton pour la modifier quand même.
 * Déverrouiller demande une confirmation qui redit ce qui risque de casser ; ensuite
 * l'avertissement reste affiché tant que les changements ne sont pas enregistrés.
 */
function LockNote({ policy, unlocked, readOnly, onUnlock, onRelock }: { policy: ColumnPolicy; unlocked: boolean; readOnly: boolean; onUnlock: () => void; onRelock: () => void }) {
  const [confirming, setConfirming] = useState(false)
  if (!policy.reasons.length) return null
  const reasons = policy.reasons.filter(Boolean)
  if (unlocked) return <div className="rounded-lg border border-destructive/35 bg-destructive/[.06] px-3 py-2 text-xs leading-5 text-foreground">
    <p className="flex items-center gap-1.5 font-semibold text-destructive"><TriangleAlert className="size-3.5" />Déverrouillée : attention</p>
    <p className="mt-1">Eraser lit cette colonne ailleurs. Si tu changes son nom, son type ou la supprimes, voici ce qui risque de ne plus marcher :</p>
    <ul className="mt-1 list-disc pl-4">{reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>
    <Button type="button" variant="link" size="sm" className="h-auto px-0 text-xs" onClick={onRelock}>Annuler et reverrouiller</Button>
  </div>
  return <div className="rounded-lg border border-amber-700/30 bg-amber-100/60 px-3 py-2 text-xs leading-5 text-amber-950">
    <p className="flex items-center gap-1.5 font-semibold"><Lock className="size-3.5" />Verrouillée</p>
    <ul className="mt-1 list-disc pl-4">{reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>
    <p className="mt-1"><span className="font-semibold">Modifiable sans risque :</span> {policy.allowed}</p>
    {!readOnly && <Button type="button" variant="outline" size="sm" className="mt-2 h-7 border-amber-800/40 bg-transparent text-xs text-amber-950 hover:bg-amber-200/60" onClick={() => setConfirming(true)}><LockOpen />Modifier quand même</Button>}
    <AlertDialog open={confirming} onOpenChange={setConfirming}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2"><TriangleAlert className="size-5 text-destructive" />Déverrouiller cette colonne ?</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="grid gap-2 text-sm">
              <p>Cette colonne est verrouillée parce qu’Eraser s’en sert ailleurs :</p>
              <ul className="list-disc pl-5">{reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>
              <p>Tu pourras changer son nom, son type et ses réglages, ou la supprimer. Si ça casse quelque chose, remets-la comme avant (son nom et son type d’origine) : les données de la feuille ne sont pas effacées.</p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Laisser verrouillée</AlertDialogCancel>
          <AlertDialogAction onClick={() => { setConfirming(false); onUnlock() }}>Je comprends, déverrouiller</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>
}

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

function ListSettings({ spec, onChange, disabled }: Pick<SettingsProps, "spec" | "onChange" | "disabled">) {
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
            <ColorSwatches disabled={disabled} value={option.color} onChange={(color) => setOptions(options.map((item, position) => position === index ? { ...item, color } : item))} />
            {groups.length > 0 && <NativeSelect disabled={disabled} value={option.group ?? ""} onChange={(event) => setOptions(options.map((item, position) => position === index ? { ...item, group: event.target.value || undefined } : item))} className="h-7 w-32 text-xs"><NativeSelectOption value="">Sans groupe</NativeSelectOption>{groups.map((group) => <NativeSelectOption key={group.name} value={group.name}>{group.name}</NativeSelectOption>)}</NativeSelect>}
            <span className="ml-auto flex">
              <Button type="button" variant="ghost" size="icon-xs" disabled={disabled || index === 0} onClick={() => move(index, -1)} aria-label="Monter"><ArrowUp /></Button>
              <Button type="button" variant="ghost" size="icon-xs" disabled={disabled || index === options.length - 1} onClick={() => move(index, 1)} aria-label="Descendre"><ArrowDown /></Button>
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
        <Input disabled={disabled} value={group.name} onChange={(event) => onChange({ ...spec, groups: groups.map((item, position) => position === index ? { ...item, name: event.target.value } : item), options: options.map((option) => option.group === group.name ? { ...option, group: event.target.value } : option) })} className="h-7 w-40 text-xs" />
        <ColorSwatches disabled={disabled} value={group.color} onChange={(color) => onChange({ ...spec, groups: groups.map((item, position) => position === index ? { ...item, color } : item) })} />
        <Button type="button" variant="ghost" size="icon-xs" className="text-destructive" disabled={disabled} onClick={() => onChange({ ...spec, groups: groups.filter((_, position) => position !== index), options: options.map((option) => option.group === group.name ? { ...option, group: undefined } : option) })} aria-label="Retirer le groupe"><Trash2 /></Button>
      </div>)}
      <div><Button type="button" variant="ghost" size="sm" disabled={disabled} onClick={() => onChange({ ...spec, groups: [...groups, { name: groups.length ? `Groupe ${groups.length + 1}` : "À faire" }] })}><Plus />Ajouter un groupe</Button></div>
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
    <div><Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => setButtons([...buttons, { id: nextId(), label: "Bouton", icon: "zap", steps: [] }])}><Plus />Ajouter un bouton</Button></div>
  </>
}

function TypeSettings(props: SettingsProps) {
  const { spec, onChange, disabled, targets, siblings } = props
  const set = (changes: Partial<IndexColumnSpec>) => onChange({ ...spec, ...changes })
  const targetOf = (index: string | undefined) => targets.find((target) => target.index === index)
  const relations = siblings.filter((column) => !column.removed && (column.spec.kind === "linked" || column.spec.kind === "linked-choice"))
  switch (spec.kind) {
    case "rich": return <p className="text-xs text-muted-foreground">Chaque case garde sa mise en forme. Pour un style commun à toute la colonne (et sans mise en forme propre à chaque case), règle le « Style imposé » plus bas.</p>
    case "name-form": return <p className="text-xs text-muted-foreground">Un clic sur le nom ouvre la fiche de la ligne, avec tous ses champs (ceux du tableau et ceux « Formulaire seulement »). Le nom se modifie dans la fiche.</p>
    case "number": return <NumberFormatSettings spec={spec} onChange={onChange} disabled={disabled} />
    case "checkbox": return <label className="flex items-center gap-2 text-xs"><Checkbox disabled={disabled} checked={Boolean(spec.emptyChecked)} onCheckedChange={(checked) => set({ emptyChecked: checked === true })} />Une case vide compte comme cochée (comme « Actif » des objets)</label>
    case "color": return <p className="text-xs text-muted-foreground">Une pastille et un sélecteur de couleur ; la feuille garde le code (#aa3355).</p>
    case "glyph": return <div className="grid gap-2 text-xs">
      <p className="text-muted-foreground">Chaque case propose toutes les icônes (recherche en français ou en anglais) ou un émoji ; la feuille garde le nom de l’icône.</p>
      <div className="grid gap-1"><span className="font-semibold">Couleur</span><ColorSwatches value={spec.glyph?.color} disabled={disabled} onChange={(color) => set({ glyph: { ...spec.glyph, color } })} /></div>
      <label className="flex items-center gap-2"><Checkbox disabled={disabled} checked={spec.glyph?.filled !== false} onCheckedChange={(checked) => set({ glyph: { ...spec.glyph, filled: checked === true } })} />Icône pleine (décochée : seulement son contour)</label>
    </div>
    case "tab-sort": return <p className="text-xs text-muted-foreground">Chaque valeur devient un onglet qui porte son nom et montre les lignes qui l’ont. La ligne reste dans son onglet et apparaît en plus dans celui de sa valeur : rien n’est déplacé dans Sheets. La liste propose les valeurs déjà utilisées ; une valeur nouvelle crée son onglet.</p>
    case "choice": return <ListSettings spec={spec} onChange={onChange} disabled={disabled} />
    case "linked-choice": {
      const source = spec.source ?? { index: targets[0]?.index ?? "peoples", tab: "" }
      const target = targetOf(source.index)
      return <>
        <div className="grid gap-2 sm:grid-cols-2">
          <label className={smallLabel}>Index d’où viennent les noms<NativeSelect disabled={disabled} value={source.index} onChange={(event) => set({ source: { index: event.target.value as typeof source.index, tab: targetOf(event.target.value)?.tabs[0]?.name ?? "" } })}>{targets.map((item) => <NativeSelectOption key={item.index} value={item.index}>{item.title}</NativeSelectOption>)}</NativeSelect></label>
          <label className={smallLabel}>Onglet où créer un nom absent<NativeSelect disabled={disabled} value={source.tab} onChange={(event) => set({ source: { ...source, tab: event.target.value } })}>{(target?.tabs ?? []).map((tab) => <NativeSelectOption key={tab.name} value={tab.name}>{tab.name}</NativeSelectOption>)}</NativeSelect></label>
        </div>
        <label className="flex items-center gap-2 text-xs"><Checkbox disabled={disabled} checked={Boolean(spec.multiple)} onCheckedChange={(checked) => set({ multiple: checked === true })} /><span><b>Choix multiple</b> : plusieurs noms par case</span></label>
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

function PlacementSettings({ spec, onChange, disabled }: { spec: IndexColumnSpec; onChange: (spec: IndexColumnSpec) => void; disabled: boolean }) {
  const placement = placementOf(spec)
  const texts: Record<ColumnPlacement, string> = {
    both: "Dans le tableau, la fiche et le formulaire d’ajout.",
    table: "Seulement dans le tableau.",
    sheet: "Seulement dans la fiche et le formulaire d’ajout (« · Formulaire »).",
  }
  return <div className={box}>
    <p className="font-semibold">Où s’affiche la colonne</p>
    <div className="grid gap-1.5 md:grid-cols-3">
      {(Object.keys(placementLabels) as ColumnPlacement[]).map((key) => <button key={key} type="button" disabled={disabled} onClick={() => onChange({ ...spec, placement: key, form: undefined })} className={`rounded-lg border p-2 text-left text-xs ${placement === key ? "border-primary bg-primary/10" : "hover:bg-muted"}`}><b>{placementLabels[key]}</b><br /><span className="text-muted-foreground">{texts[key]}</span></button>)}
    </div>
    <label className="flex items-center gap-2 text-xs"><Checkbox disabled={disabled || placement === "sheet"} checked={Boolean(spec.hidden)} onCheckedChange={(checked) => onChange({ ...spec, hidden: checked === true || undefined })} /><span><b>Masquée</b> : cachée du tableau ; le bouton « Colonnes masquées » la montre d’un clic.</span></label>
    <label className={smallLabel}>Description (au survol de l’en-tête et dans la fiche)<Input disabled={disabled} value={spec.description ?? ""} onChange={(event) => onChange({ ...spec, description: event.target.value || undefined })} placeholder="À quoi sert cette colonne ?" /></label>
  </div>
}

/** L'icône de chaque type, pour le repérer d'un coup d'œil dans la liste. */
const kindIcons: Partial<Record<IndexColumnKind, LucideIcon>> = {
  "rich": TypeIcon, "number": Hash, "checkbox": SquareCheck, "color": Palette, "gauge": Gauge, "glyph": Shapes,
  "choice": List, "linked-choice": ListTree, "linked": ArrowLeftRight, "tab-sort": FolderTree,
  "lookup": SearchIcon, "rollup": Sigma, "formula": FunctionSquare, "random": Dices,
  "actions": MousePointerClick, "file": Paperclip, "spells": Sparkles,
}

/**
 * Le choix du type : une liste compacte, une ligne par type (icône, nom, ce qui le
 * distingue des autres). Le détail du type survolé s'affiche dessous, sans tout déplier.
 */
function TypePicker({ spec, onPick, policy, disabled, family }: { spec: IndexColumnSpec; onPick: (kind: IndexColumnKind) => void; policy: ColumnPolicy; disabled: boolean; family: IndexEditorModel["family"] }) {
  const [open, setOpen] = useState(false)
  const [hovered, setHovered] = useState<IndexColumnKind | null>(null)
  const objects = family === "objects"
  const blocked = (kind: IndexColumnKind) => {
    if (kind === spec.kind) return ""
    if (!policy.type && !(["name", "name-form"].includes(kind) && ["name", "name-form"].includes(spec.kind))) return "Type verrouillé : voir le cadenas."
    if (objects && ["linked", "linked-choice", "lookup", "rollup", "tab-sort"].includes(kind)) return "Pas encore dans l’index des objets : l’inventaire et les boutiques lisent leurs cases comme du texte."
    return ""
  }
  const current = indexColumnKinds[spec.kind]
  const CurrentIcon = kindIcons[spec.kind] ?? TypeIcon
  const detail = indexColumnKinds[hovered ?? spec.kind]
  return <div className={box}>
    <div className="flex items-center gap-2">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><CurrentIcon className="size-4" /></span>
      <div className="min-w-0 flex-1"><p className={sectionTitle}>Type</p><p className="truncate font-semibold">{current.label}</p></div>
      <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => setOpen(!open)}>{open ? "Fermer" : "Changer"}</Button>
    </div>
    {!open && <p className="text-xs text-muted-foreground">{current.short ?? current.description}</p>}
    {open && <>
      <div className="grid gap-x-3 gap-y-2 sm:grid-cols-2" onMouseLeave={() => setHovered(null)}>
        {kindGroups.map((group) => {
          const kinds = creatableKinds.filter((kind) => indexColumnKinds[kind].group === group)
          if (!kinds.length) return null
          return <div key={group} className="grid content-start gap-0.5">
            <p className={`${sectionTitle} px-1`}>{group}</p>
            {kinds.map((kind) => {
              const reason = blocked(kind)
              const Icon = kindIcons[kind] ?? TypeIcon
              return <button key={kind} type="button" disabled={Boolean(reason) || disabled} title={reason || indexColumnKinds[kind].description} onMouseEnter={() => setHovered(kind)} onFocus={() => setHovered(kind)} onClick={() => { onPick(kind); setOpen(false) }} className={`flex min-w-0 items-center gap-2 rounded-md px-1.5 py-1 text-left text-xs disabled:opacity-40 ${kind === spec.kind ? "bg-primary/12 text-primary" : "hover:bg-muted"}`}>
                <Icon className="size-3.5 shrink-0" />
                <b className="shrink-0">{indexColumnKinds[kind].label}</b>
                {reason ? <Lock className="ml-auto size-3 shrink-0" /> : <span className="min-w-0 truncate text-muted-foreground">{indexColumnKinds[kind].short}</span>}
              </button>
            })}
          </div>
        })}
      </div>
      <div className="rounded-lg bg-muted/40 px-3 py-2 text-xs leading-5">
        <b>{detail.label}</b> — {detail.description}
        {detail.example && <span className="block text-muted-foreground">Exemple : {detail.example}</span>}
      </div>
    </>}
  </div>
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
export function IndexEditor({ model, open, pending = false, error = "", title, intro, onClose, onApply, onDeleteIndex, leading, submitLabel = "Enregistrer", startTabs = [], canSubmit = true, sampleRows = {}, layouts = {}, onSaveLayouts }: {
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
  onSaveLayouts?: (changes: Array<{ tab: string; form: IndexLayout | null; hover: IndexLayout | null }>) => Promise<void>
}) {
  const [tabs, setTabs] = useState<DraftTab[]>(() => [...draftOf(model), ...startTabs.map((name): DraftTab => ({ id: nextId(), name, columns: [], removed: false, remove: true, rename: true, addColumns: true }))])
  const originalTabOrder = useMemo(() => model.tabs.map((tab) => tab.name), [model])
  const [selectedTab, setSelectedTab] = useState(tabs[0]?.id ?? "")
  const [selectedColumn, setSelectedColumn] = useState(tabs[0]?.columns[0]?.id ?? "")
  const [renaming, setRenaming] = useState<string | null>(null)
  const [newTab, setNewTab] = useState("")
  // Un nouvel onglet peut partir d'un preset : il reçoit aussitôt ses colonnes.
  const { presets } = useColumnPresets()
  const [newTabPreset, setNewTabPreset] = useState("")
  const [newColumn, setNewColumn] = useState("")
  const [showChanges, setShowChanges] = useState(false)
  const [guide, setGuide] = useState<GuideSection | null>(null)
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
  const [mode, setMode] = useState<"columns" | LayoutKind>("columns")
  // Les mises en page touchées, par onglet (identifiant du brouillon) ; `null` : automatique.
  const [layoutDrafts, setLayoutDrafts] = useState<Record<string, Partial<Record<LayoutKind, IndexLayout | null>>>>({})
  const [layoutSaving, setLayoutSaving] = useState(false)
  const [layoutError, setLayoutError] = useState("")
  const layoutsEnabled = Boolean(onSaveLayouts) && !readOnly
  const layoutOf = (draft: DraftTab, kind: LayoutKind) => {
    const touched = layoutDrafts[draft.id]
    if (touched && kind in touched) return touched[kind] ?? null
    return draft.original ? tabLayout(layouts, draft.original, kind) : null
  }
  /**
   * Ce qu'il faut écrire : les mises en page touchées, et celles qui suivent un onglet ou
   * des colonnes renommés (elles nomment leurs colonnes).
   */
  const layoutChanges = useMemo(() => tabs.flatMap((draft) => {
    if (draft.removed) return []
    const saved = { form: draft.original ? tabLayout(layouts, draft.original, "form") : null, hover: draft.original ? tabLayout(layouts, draft.original, "hover") : null }
    const touched = layoutDrafts[draft.id] ?? {}
    const renames = new Map(draft.columns.filter((item) => item.original && !item.removed && item.header.trim() && item.header.trim() !== item.original).map((item) => [foldName(item.original!), item.header.trim()]))
    const next = (kind: LayoutKind) => { const layout = kind in touched ? touched[kind] ?? null : saved[kind]; return layout ? renameLayoutColumns(layout, renames) : null }
    const form = next("form")
    const hover = next("hover")
    const name = draft.name.trim()
    const renamed = Boolean(draft.original) && name !== draft.original
    const changed = renamed || serializeIndexLayout(form) !== serializeIndexLayout(saved.form) || serializeIndexLayout(hover) !== serializeIndexLayout(saved.hover)
    if (!changed || !name) return []
    // Un onglet renommé : sa mise en page suit son nouveau nom, l'ancienne ligne est retirée.
    const retired = renamed && (saved.form || saved.hover) ? [{ tab: draft.original!, form: null, hover: null }] : []
    if (renamed && !form && !hover && !retired.length) return []
    return [...retired, { tab: name, form, hover }]
  }), [layoutDrafts, layouts, tabs])

  async function submit() {
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
    const keep = { hidden: column.spec.hidden, description: column.spec.description, placement: column.spec.placement, style: ["name", "name-form"].includes(kind) && ["name", "name-form"].includes(column.spec.kind) ? column.spec.style : column.spec.style ?? base.style }
    updateColumn({ ...column, spec: { ...base, ...keep, kind } })
  }

  const policy = column?.policy ?? freePolicy
  const columnDisabled = readOnly || Boolean(column?.removed) || Boolean(tab?.removed)
  // Une colonne verrouillée garde son affichage modifiable (style, emplacement, description…).
  const typeDisabled = columnDisabled || !policy.type
  const displayDisabled = columnDisabled
  const lockedTitle = (item: DraftColumn) => item.policy.reasons.length ? `${item.policy.reasons.join("\n")}\n\nModifiable sans risque : ${item.policy.allowed}\nPour le reste : « Modifier quand même », dans ses réglages.` : undefined

  return <Dialog open={open} onOpenChange={(next) => { if (!next && !pending) onClose() }}>
    <DialogContent className="flex h-[94svh] max-h-[94svh] flex-col gap-3 sm:max-w-[min(96vw,1440px)]">
      <DialogHeader className="shrink-0">
        <div className="flex flex-wrap items-start justify-between gap-2 pr-8">
          <div>
            <DialogTitle className="font-display text-2xl">{title ?? `Modifier « ${model.title} »`}</DialogTitle>
            <DialogDescription>{intro ?? (readOnly ? model.readOnlyReason : "Onglets à gauche, colonnes au milieu, réglages de la colonne choisie à droite. Rien n’est écrit dans Google Sheets avant « Enregistrer » ; ce qui est supprimé part dans la corbeille.")}</DialogDescription>
          </div>
          <span className="flex flex-wrap items-center gap-2">
            {layoutsEnabled && <span className="inline-flex rounded-lg border bg-muted/30 p-0.5" role="tablist" aria-label="Que modifier">
              {([["columns", Columns3, "Colonnes"], ["form", LayoutTemplate, "Mise en page de la fiche"], ["hover", MessageSquareQuote, "Survol « { » d’une ligne"]] as const).map(([key, Icon, label]) => <Button key={key} type="button" role="tab" aria-selected={mode === key} size="sm" variant={mode === key ? "default" : "ghost"} className="h-7" onClick={() => setMode(key)}><Icon />{label}</Button>)}
            </span>}
            <Button type="button" variant="outline" size="sm" onClick={() => setGuide("types")}><BookOpen />Guide « ? »</Button>
          </span>
        </div>
      </DialogHeader>
      {leading && <div className="shrink-0">{leading}</div>}
      <div className={`grid min-h-0 flex-1 gap-3 overflow-hidden ${mode === "columns" ? "md:grid-cols-[13rem_18rem_minmax(0,1fr)]" : "md:grid-cols-[13rem_minmax(0,1fr)]"}`}>
        {/* Onglets */}
        <aside className="flex min-h-0 flex-col gap-1 overflow-y-auto rounded-xl border bg-muted/20 p-2">
          <p className={`${sectionTitle} px-1`}>Onglets</p>
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
          {!readOnly && tabs.length > 1 && <p className="mt-auto px-1 pt-2 text-[10px] text-muted-foreground">Glisse un onglet par sa poignée pour changer l’ordre ; double-clic pour le renommer.</p>}
        </aside>

        {mode !== "columns" && tab && <section className="grid min-h-0 content-start gap-3 overflow-y-auto pr-1">
          <div className="rounded-xl border bg-muted/20 px-3 py-2 text-xs leading-5 text-muted-foreground">
            {mode === "form"
              ? <>Mise en page de la <b className="text-foreground">fiche</b> des lignes de « {tab.name} » (et du formulaire « Ajouter »). Elle vaut partout où la fiche s’ouvre. Les colonnes « Tableau seulement » n’y figurent pas.</>
              : <>Ce qu’affiche le <b className="text-foreground">survol</b> d’une ligne de « {tab.name} » citée en entier avec « {"{"} » (dans une description, une note, un chat…). Pour les joueurs, les colonnes privées restent cachées.</>}
          </div>
          <IndexLayoutEditor
            key={`${tab.id}:${mode}`}
            kind={mode}
            columns={layoutColumnsOf(tab, mode)}
            value={layoutOf(tab, mode)}
            onChange={(layout) => setLayoutDrafts((current) => ({ ...current, [tab.id]: { ...current[tab.id], [mode]: layout } }))}
            sample={sampleRows[tab.original ?? tab.name]?.[0]}
            disabled={pending || layoutSaving || tab.removed}
          />
        </section>}

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
                  {place === "sheet" && <span className="rounded bg-muted px-1">Formulaire</span>}
                  {place === "table" && <span className="rounded bg-muted px-1">Tableau seul</span>}
                  {spec.hidden && <span className="rounded bg-muted px-1">Masquée</span>}
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
              <div className="flex flex-wrap items-end gap-2">
                <label className={`${smallLabel} min-w-48 flex-1`}>Nom de la colonne<Input value={column.header} disabled={columnDisabled || !policy.rename} onChange={(event) => updateColumn({ ...column, header: event.target.value })} className="h-9 text-base font-semibold" /></label>
                {column.removed
                  ? <Button type="button" variant="outline" onClick={() => updateColumn({ ...column, removed: false })}><Undo2 />Annuler la suppression</Button>
                  : <Button type="button" variant="outline" className="text-destructive" disabled={readOnly || tab.removed || !policy.remove} onClick={() => updateColumn({ ...column, removed: true })} title={policy.remove ? "Mettre la colonne à la corbeille" : lockedTitle(column)}>{policy.remove ? <Trash2 /> : <Lock />}Supprimer</Button>}
                {column.spec.hidden ? <EyeOff className="mb-2 size-4 text-muted-foreground" aria-label="Masquée" /> : <Eye className="mb-2 size-4 text-muted-foreground" aria-label="Visible" />}
              </div>
              <p className="text-[11px] text-muted-foreground">Au survol de l’en-tête : {columnTypeLabel(column.spec)}</p>
              <LockNote
                policy={column.lockedPolicy ?? policy}
                unlocked={Boolean(column.lockedPolicy)}
                readOnly={columnDisabled}
                onUnlock={() => updateColumn({ ...column, lockedPolicy: column.policy, policy: { ...freePolicy, reasons: column.policy.reasons, allowed: "Tout (déverrouillée)." } })}
                onRelock={() => updateColumn({ ...column, policy: column.lockedPolicy ?? column.policy, lockedPolicy: undefined, header: column.original ?? column.header, spec: column.originalSpec ?? column.spec, removed: false })}
              />
            </div>
            <TypePicker spec={column.spec} policy={policy} disabled={columnDisabled} family={model.family} onPick={pickKind} />
            <div className={box}>
              <p className="font-semibold">Réglages du type {indexColumnKinds[column.spec.kind].label}</p>
              <TypeSettings
                spec={column.spec}
                onChange={(spec) => updateColumn({ ...column, spec })}
                disabled={typeDisabled}
                targets={model.relationTargets}
                siblings={tab.columns.filter((item) => item.id !== column.id)}
                tabs={tabs}
                family={model.family}
                indexKey={model.key}
                sampleRows={sampleRows[tab.original ?? tab.name] ?? []}
                openGuide={(section) => setGuide(section)}
              />
              {typeDisabled && !readOnly && <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Lock className="size-3.5" />Type verrouillé : l’emplacement, « Masquée », la description et le style imposé restent modifiables ci-dessous.</p>}
            </div>
            <PlacementSettings spec={column.spec} onChange={(spec) => updateColumn({ ...column, spec })} disabled={displayDisabled} />
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
          <span className="font-semibold">{operations.length + layoutChanges.length ? `${operations.length + layoutChanges.length} changement${operations.length + layoutChanges.length > 1 ? "s" : ""} à écrire dans Google Sheets` : "Aucun changement pour l’instant"}</span>
          {operations.length + layoutChanges.length > 0 && <Button type="button" variant="link" size="sm" className="h-auto p-0 text-xs" onClick={() => setShowChanges(!showChanges)}>{showChanges ? "Masquer le détail" : "Voir le détail"}</Button>}
        </div>
        {showChanges && <ul className="mt-1 grid max-h-32 gap-0.5 overflow-y-auto text-muted-foreground">
          {operations.map((operation, index) => <li key={index}>• {describe(operation)}</li>)}
          {layoutChanges.map((change, index) => <li key={`layout-${index}`}>• Mise en page de « {change.tab} » : {!change.form && !change.hover ? "affichage automatique" : [change.form ? "fiche personnalisée" : "fiche automatique", change.hover ? "survol personnalisé" : "survol automatique"].join(", ")}</li>)}
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
        <Button type="button" variant="outline" onClick={onClose} disabled={pending}>{readOnly ? "Fermer" : "Annuler"}</Button>
        {!readOnly && <Button type="button" disabled={pending || layoutSaving || !canSubmit || !(operations.length || layoutChanges.length) || problems.length > 0} onClick={() => void submit()}>{pending || layoutSaving ? <LoaderCircle className="animate-spin" /> : <Save />}{submitLabel}</Button>}
        </span>
      </DialogFooter>
      {guide && <IndexGuide open section={guide} onClose={() => setGuide(null)} />}
    </DialogContent>
  </Dialog>
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

