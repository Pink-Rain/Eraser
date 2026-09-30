"use client"

import { useMemo, useState, type ReactNode } from "react"
import { ChevronDown, ChevronRight, Eye, EyeOff, LoaderCircle, Lock, Plus, Save, Settings2, Trash2, Undo2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { Textarea } from "@/components/ui/textarea"
import {
  columnTypeLabel,
  fileAcceptLabels,
  foldName,
  indexColumnKinds,
  rollupLabels,
  type FileAccept,
  type IndexColumnKind,
  type IndexColumnSpec,
  type RollupFunction,
} from "@/lib/index-columns"
import { unitFamilies, type UnitFamily } from "@/lib/index-numbers"
import {
  creatableKinds,
  freePolicy,
  headerProblem,
  tabProblem,
  type ColumnPolicy,
  type IndexEditorModel,
  type RelationTarget,
  type SchemaOperation,
} from "@/lib/index-schema-shared"

type DraftColumn = { id: string; original?: string; header: string; spec: IndexColumnSpec; originalSpec?: IndexColumnSpec; policy: ColumnPolicy; removed: boolean }
type DraftTab = { id: string; original?: string; name: string; columns: DraftColumn[]; removed: boolean; remove: boolean; removeReason?: string; addColumns: boolean; addColumnsReason?: string }

let draftCounter = 0
const nextId = () => `draft-${draftCounter++}`

function draftOf(model: IndexEditorModel): DraftTab[] {
  return model.tabs.map((tab) => ({
    id: nextId(),
    original: tab.name,
    name: tab.name,
    removed: false,
    remove: tab.remove,
    removeReason: tab.removeReason,
    addColumns: tab.addColumns,
    addColumnsReason: tab.addColumnsReason,
    columns: tab.columns.map((column) => ({ id: nextId(), original: column.header, header: column.header, spec: column.spec, originalSpec: column.spec, policy: column.policy, removed: false })),
  }))
}

/** Les opérations à envoyer au serveur, dans l'ordre où elles doivent s'appliquer. */
export function operationsOf(tabs: DraftTab[]): SchemaOperation[] {
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
      if (column.removed) { operations.push({ op: "remove-column", tab: tab.original, header: column.original }); continue }
      const header = column.header.trim()
      if (header !== column.original) operations.push({ op: "rename", tab: tab.original, header: column.original, to: header })
      if (JSON.stringify(column.spec) !== JSON.stringify(column.originalSpec)) operations.push({ op: "spec", tab: tab.original, header, spec: column.spec })
    }
  }
  return operations
}

function describe(operation: SchemaOperation) {
  switch (operation.op) {
    case "add-tab": return `Nouvel onglet « ${operation.name} » (${operation.columns.length} colonne${operation.columns.length > 1 ? "s" : ""})`
    case "remove-tab": return `Onglet « ${operation.tab} » mis à la corbeille`
    case "add-column": return `Nouvelle colonne « ${operation.header} » (${operation.tab})`
    case "remove-column": return `Colonne « ${operation.header} » mise à la corbeille (${operation.tab})`
    case "rename": return `« ${operation.header} » renommée « ${operation.to} » (${operation.tab})`
    case "spec": return `« ${operation.header} » : ${columnTypeLabel(operation.spec)} (${operation.tab})`
  }
}

/** Le spec par défaut d'un type fraîchement choisi. */
function defaultSpec(kind: IndexColumnKind, targets: RelationTarget[], relations: DraftColumn[]): IndexColumnSpec {
  const target = targets[0]
  switch (kind) {
    case "rich": return { kind: "rich" }
    case "fixed": return { kind: "fixed" }
    case "number": return { kind: "number", number: { unit: "none" } }
    case "choice": return { kind: "choice", options: [] }
    case "checkbox": return { kind: "checkbox" }
    case "linked-choice": return { kind: "linked-choice", source: { index: target?.index ?? "peoples", tab: target?.tabs[0]?.name ?? "" } }
    case "linked": return { kind: "linked", also: ["rich"], link: { index: target?.index ?? "peoples", tab: "*", column: "" } }
    case "file": return { kind: "file", file: { accept: "any", multiple: true } }
    case "color": return { kind: "color" }
    case "gauge": return { kind: "gauge", gauge: { style: "bar", max: 10 } }
    case "lookup": return { kind: "lookup", lookup: { via: relations[0]?.header ?? "", field: "" } }
    case "rollup": return { kind: "rollup", rollup: { via: relations[0]?.header ?? "", fn: "count" } }
    case "spells": return { kind: "spells", spells: { source: "all" } }
    default: return { kind }
  }
}

function LockNote({ policy }: { policy: ColumnPolicy }) {
  if (!policy.reasons.length) return null
  return <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs leading-5 text-amber-900 dark:text-amber-200">
    <p className="flex items-center gap-1.5 font-semibold"><Lock className="size-3.5" />Verrouillée</p>
    <ul className="mt-1 list-disc pl-4">{policy.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>
    <p className="mt-1"><span className="font-semibold">Modifiable :</span> {policy.allowed}</p>
  </div>
}

const smallLabel = "grid gap-1 text-[11px] font-semibold text-muted-foreground"

/** Les réglages propres au type d'une colonne. */
function SpecSettings({ spec, onChange, targets, relations, disabled }: { spec: IndexColumnSpec; onChange: (spec: IndexColumnSpec) => void; targets: RelationTarget[]; relations: DraftColumn[]; disabled: boolean }) {
  const set = (changes: Partial<IndexColumnSpec>) => onChange({ ...spec, ...changes })
  const targetOf = (index: string | undefined) => targets.find((target) => target.index === index)
  let body: ReactNode = null
  if (spec.kind === "choice") {
    body = <>
      <label className={smallLabel}>Choix (un par ligne)<Textarea disabled={disabled} rows={4} value={(spec.options ?? []).map((option) => option.value).join("\n")} onChange={(event) => set({ options: event.target.value.split("\n").map((value) => value.trim()).filter(Boolean).map((value) => ({ value })) })} /></label>
      <label className="flex items-center gap-2 text-xs"><Checkbox disabled={disabled} checked={Boolean(spec.allowCustom)} onCheckedChange={(checked) => set({ allowCustom: checked === true })} />Accepter une valeur hors liste</label>
    </>
  } else if (spec.kind === "number") {
    const format = spec.number ?? {}
    const family = format.unit ?? "none"
    body = <div className="grid gap-2 sm:grid-cols-3">
      <label className={smallLabel}>Unité<NativeSelect disabled={disabled} value={family} onChange={(event) => set({ number: { ...format, unit: event.target.value as UnitFamily, defaultUnit: event.target.value === "none" ? undefined : unitFamilies[event.target.value as Exclude<UnitFamily, "none">].units[0].code } })}>
        <NativeSelectOption value="none">Aucune (nombre simple)</NativeSelectOption>
        {Object.entries(unitFamilies).map(([key, value]) => <NativeSelectOption key={key} value={key}>{value.label}</NativeSelectOption>)}
      </NativeSelect></label>
      {family !== "none" && <label className={smallLabel}>Unité par défaut<NativeSelect disabled={disabled} value={format.defaultUnit ?? ""} onChange={(event) => set({ number: { ...format, defaultUnit: event.target.value } })}>
        {unitFamilies[family].units.map((unit) => <NativeSelectOption key={unit.code} value={unit.code}>{unit.code} — {unit.title}</NativeSelectOption>)}
      </NativeSelect></label>}
      <label className={smallLabel}>Décimales<Input disabled={disabled} type="number" min={0} max={4} value={format.decimals ?? ""} placeholder="Auto" onChange={(event) => set({ number: { ...format, decimals: event.target.value === "" ? undefined : Math.max(0, Math.min(4, Number(event.target.value))) } })} /></label>
      {family === "none" && <>
        <label className={smallLabel}>Avant le nombre<Input disabled={disabled} value={format.prefix ?? ""} placeholder="~" onChange={(event) => set({ number: { ...format, prefix: event.target.value || undefined } })} /></label>
        <label className={smallLabel}>Après le nombre<Input disabled={disabled} value={format.suffix ?? ""} placeholder="PV" onChange={(event) => set({ number: { ...format, suffix: event.target.value || undefined } })} /></label>
      </>}
      <label className="flex items-center gap-2 text-xs"><Checkbox disabled={disabled} checked={Boolean(format.range)} onCheckedChange={(checked) => set({ number: { ...format, range: checked === true } })} />Plage (« 2–5 »)</label>
      {family === "none" && <label className="flex items-center gap-2 text-xs"><Checkbox disabled={disabled} checked={Boolean(format.percent)} onCheckedChange={(checked) => set({ number: { ...format, percent: checked === true } })} />Pourcentage</label>}
    </div>
  } else if (spec.kind === "file") {
    const file = spec.file ?? { accept: "any" as FileAccept }
    body = <div className="grid gap-2 sm:grid-cols-2">
      <label className={smallLabel}>Fichiers acceptés<NativeSelect disabled={disabled} value={file.accept} onChange={(event) => set({ file: { ...file, accept: event.target.value as FileAccept } })}>
        {Object.entries(fileAcceptLabels).map(([key, label]) => <NativeSelectOption key={key} value={key}>{label}</NativeSelectOption>)}
      </NativeSelect></label>
      <label className="flex items-center gap-2 self-end text-xs"><Checkbox disabled={disabled} checked={Boolean(file.multiple)} onCheckedChange={(checked) => set({ file: { ...file, multiple: checked === true } })} />Plusieurs fichiers (galerie)</label>
    </div>
  } else if (spec.kind === "gauge") {
    const gauge = spec.gauge ?? { style: "bar" as const, max: 10 }
    body = <div className="grid gap-2 sm:grid-cols-2">
      <label className={smallLabel}>Affichage<NativeSelect disabled={disabled} value={gauge.style} onChange={(event) => set({ gauge: { ...gauge, style: event.target.value as typeof gauge.style } })}>
        <NativeSelectOption value="bar">Barre</NativeSelectOption><NativeSelectOption value="icons">Icônes à cliquer</NativeSelectOption><NativeSelectOption value="ring">Anneau</NativeSelectOption>
      </NativeSelect></label>
      <label className={smallLabel}>Maximum<Input disabled={disabled} type="number" min={1} max={gauge.style === "icons" ? 10 : 1000} value={gauge.max} onChange={(event) => set({ gauge: { ...gauge, max: Math.max(1, Number(event.target.value) || 1) } })} /></label>
    </div>
  } else if (spec.kind === "linked-choice") {
    const source = spec.source ?? { index: targets[0]?.index ?? "peoples", tab: "" }
    const target = targetOf(source.index)
    body = <div className="grid gap-2 sm:grid-cols-2">
      <label className={smallLabel}>Index d’où viennent les noms<NativeSelect disabled={disabled} value={source.index} onChange={(event) => set({ source: { index: event.target.value as typeof source.index, tab: targetOf(event.target.value)?.tabs[0]?.name ?? "" } })}>{targets.map((item) => <NativeSelectOption key={item.index} value={item.index}>{item.title}</NativeSelectOption>)}</NativeSelect></label>
      <label className={smallLabel}>Onglet où créer un nom absent<NativeSelect disabled={disabled} value={source.tab} onChange={(event) => set({ source: { ...source, tab: event.target.value } })}>{(target?.tabs ?? []).map((tab) => <NativeSelectOption key={tab.name} value={tab.name}>{tab.name}</NativeSelectOption>)}</NativeSelect></label>
    </div>
  } else if (spec.kind === "linked") {
    const link = spec.link ?? { index: targets[0]?.index ?? "peoples", tab: "*", column: "" }
    const target = targetOf(link.index)
    body = spec.link === undefined && disabled ? null : <div className="grid gap-2 sm:grid-cols-3">
      <label className={smallLabel}>Index lié<NativeSelect disabled={disabled} value={link.index} onChange={(event) => set({ link: { ...link, index: event.target.value as typeof link.index, tab: "*" } })}>{targets.map((item) => <NativeSelectOption key={item.index} value={item.index}>{item.title}</NativeSelectOption>)}</NativeSelect></label>
      <label className={smallLabel}>Onglet<NativeSelect disabled={disabled} value={link.tab} onChange={(event) => set({ link: { ...link, tab: event.target.value } })}><NativeSelectOption value="*">Tous les onglets</NativeSelectOption>{(target?.tabs ?? []).map((tab) => <NativeSelectOption key={tab.name} value={tab.name}>{tab.name}</NativeSelectOption>)}</NativeSelect></label>
      <label className={smallLabel}>Colonne qui répond, en face<Input disabled={disabled} value={link.column} placeholder="Créée si elle n’existe pas" onChange={(event) => set({ link: { ...link, column: event.target.value } })} /></label>
    </div>
  } else if (spec.kind === "lookup" || spec.kind === "rollup") {
    const settings = spec.kind === "lookup" ? spec.lookup ?? { via: "", field: "" } : spec.rollup ?? { via: "", fn: "count" as RollupFunction }
    const via = relations.find((column) => foldName(column.header) === foldName(settings.via))
    const targetIndex = via?.spec.kind === "linked-choice" ? via.spec.source?.index : via?.spec.link?.index
    const fields = [...new Set((targetOf(targetIndex)?.tabs ?? []).flatMap((tab) => tab.columns))]
    const update = (changes: Record<string, string>) => spec.kind === "lookup" ? set({ lookup: { ...(settings as { via: string; field: string }), ...changes } }) : set({ rollup: { ...(settings as { via: string; fn: RollupFunction; field?: string }), ...changes } as NonNullable<IndexColumnSpec["rollup"]> })
    body = relations.length ? <div className="grid gap-2 sm:grid-cols-3">
      <label className={smallLabel}>Relation à suivre<NativeSelect disabled={disabled} value={settings.via} onChange={(event) => update({ via: event.target.value })}>{relations.map((column) => <NativeSelectOption key={column.id} value={column.header}>{column.header}</NativeSelectOption>)}</NativeSelect></label>
      <label className={smallLabel}>Colonne d’en face<NativeSelect disabled={disabled} value={("field" in settings ? settings.field : "") ?? ""} onChange={(event) => update({ field: event.target.value })}>{spec.kind === "rollup" && <NativeSelectOption value="">— (compter les lignes)</NativeSelectOption>}{fields.map((field) => <NativeSelectOption key={field} value={field}>{field}</NativeSelectOption>)}</NativeSelect></label>
      {spec.kind === "rollup" && <label className={smallLabel}>Calcul<NativeSelect disabled={disabled} value={(settings as { fn: RollupFunction }).fn} onChange={(event) => update({ fn: event.target.value })}>{Object.entries(rollupLabels).map(([key, label]) => <NativeSelectOption key={key} value={key}>{label}</NativeSelectOption>)}</NativeSelect></label>}
    </div> : <p className="text-xs text-muted-foreground">Ajoute d’abord une relation dans cet onglet (Colonne liée ou Liste déroulante liée) : la Recherche et l’Agrégat la suivent.</p>
  } else if (spec.kind === "spells") {
    const spells = spec.spells ?? { source: "all" as const }
    body = <div className="grid gap-2 sm:grid-cols-2">
      <label className={smallLabel}>Sorts proposés<NativeSelect disabled={disabled} value={spells.source} onChange={(event) => set({ spells: { ...spells, source: event.target.value as typeof spells.source } })}><NativeSelectOption value="all">Classes et créatures</NativeSelectOption><NativeSelectOption value="class">Sorts des classes</NativeSelectOption><NativeSelectOption value="creature">Sorts des créatures</NativeSelectOption></NativeSelect></label>
      <label className={smallLabel}>Catégorie<NativeSelect disabled={disabled} value={spells.category ?? ""} onChange={(event) => set({ spells: { ...spells, category: (event.target.value || undefined) as typeof spells.category } })}><NativeSelectOption value="">Toutes</NativeSelectOption><NativeSelectOption value="actif">Actifs</NativeSelectOption><NativeSelectOption value="passif">Passifs</NativeSelectOption></NativeSelect></label>
    </div>
  } else if (spec.kind === "fixed") {
    body = <label className={smallLabel}>Apparence<NativeSelect disabled={disabled} value={spec.display ?? ""} onChange={(event) => set({ display: (event.target.value || undefined) as IndexColumnSpec["display"] })}><NativeSelectOption value="">Normale</NativeSelectOption><NativeSelectOption value="bold">Gras</NativeSelectOption><NativeSelectOption value="muted">Discrète</NativeSelectOption><NativeSelectOption value="skills">Rouge gras</NativeSelectOption></NativeSelect></label>
  }
  return body ? <div className="grid gap-2">{body}</div> : null
}

function ColumnRow({ column, relations, targets, readOnly, onChange }: { column: DraftColumn; relations: DraftColumn[]; targets: RelationTarget[]; readOnly: boolean; onChange: (column: DraftColumn) => void }) {
  const [open, setOpen] = useState(false)
  const { policy } = column
  const lockedTitle = policy.reasons.length ? `${policy.reasons.join("\n")}\n\nModifiable : ${policy.allowed}` : undefined
  const kinds = creatableKinds.includes(column.spec.kind) ? creatableKinds : [column.spec.kind, ...creatableKinds]
  const set = (changes: Partial<DraftColumn>) => onChange({ ...column, ...changes })
  const setSpec = (spec: IndexColumnSpec) => set({ spec })
  return <li className={`rounded-xl border ${column.removed ? "border-dashed bg-muted/30 opacity-60" : "bg-card/70"}`}>
    <div className="flex flex-wrap items-center gap-2 p-2">
      <button type="button" onClick={() => setOpen(!open)} className="rounded p-1 text-muted-foreground hover:bg-muted" aria-label={open ? "Replier" : "Déplier les réglages"}>{open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}</button>
      <Input value={column.header} disabled={readOnly || column.removed || !policy.rename} onChange={(event) => set({ header: event.target.value })} className="h-8 min-w-40 flex-1 font-medium" aria-label="Nom de la colonne" />
      <NativeSelect value={column.spec.kind} disabled={readOnly || column.removed || !policy.type} onChange={(event) => setSpec({ ...defaultSpec(event.target.value as IndexColumnKind, targets, relations), hidden: column.spec.hidden, description: column.spec.description })} className="h-8 w-52 text-xs" aria-label="Type">
        {kinds.map((kind) => <NativeSelectOption key={kind} value={kind}>{indexColumnKinds[kind].label}</NativeSelectOption>)}
      </NativeSelect>
      <Button type="button" variant="ghost" size="icon-sm" disabled={readOnly || column.removed} onClick={() => setSpec({ ...column.spec, hidden: !column.spec.hidden })} title={column.spec.hidden ? "Masquée : cliquer pour l’afficher" : "Visible : cliquer pour la masquer"} aria-label="Masquer">{column.spec.hidden ? <EyeOff /> : <Eye />}</Button>
      {policy.reasons.length > 0 && <span className="grid size-8 place-items-center text-amber-600" title={lockedTitle} aria-label={lockedTitle}><Lock className="size-4" /></span>}
      {column.removed
        ? <Button type="button" variant="ghost" size="icon-sm" onClick={() => set({ removed: false })} title="Annuler la suppression" aria-label="Annuler la suppression"><Undo2 /></Button>
        : <Button type="button" variant="ghost" size="icon-sm" className="text-destructive" disabled={readOnly || !policy.remove} onClick={() => set({ removed: true })} title={policy.remove ? "Mettre à la corbeille" : lockedTitle} aria-label="Supprimer la colonne"><Trash2 /></Button>}
    </div>
    <p className="px-11 pb-2 text-[11px] text-muted-foreground">{columnTypeLabel(column.spec)}{column.spec.description ? ` — ${column.spec.description}` : ""}</p>
    {open && <div className="grid gap-3 border-t p-3">
      <LockNote policy={policy} />
      <p className="text-xs text-muted-foreground">{indexColumnKinds[column.spec.kind].description}</p>
      <SpecSettings spec={column.spec} onChange={setSpec} targets={targets} relations={relations.filter((relation) => relation.id !== column.id)} disabled={readOnly || column.removed || !policy.type} />
      <label className={smallLabel}>Description (au survol de l’en-tête)<Input disabled={readOnly || column.removed} value={column.spec.description ?? ""} onChange={(event) => setSpec({ ...column.spec, description: event.target.value || undefined })} placeholder="À quoi sert cette colonne ?" /></label>
    </div>}
  </li>
}

/**
 * L'éditeur des colonnes et onglets d'un index. Rien n'est écrit tant qu'on n'a pas
 * enregistré ; le résumé dit exactement ce qui va changer dans Google Sheets.
 */
export function IndexEditor({ model, open, pending = false, error = "", title, intro, onClose, onApply, leading, submitLabel = "Enregistrer", startTabs = [], canSubmit = true }: {
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
  onClose: () => void
  onApply: (operations: SchemaOperation[]) => void
}) {
  const [tabs, setTabs] = useState<DraftTab[]>(() => [...draftOf(model), ...startTabs.map((name): DraftTab => ({ id: nextId(), name, columns: [], removed: false, remove: true, addColumns: true }))])
  const [selected, setSelected] = useState(tabs[0]?.id ?? "")
  const [newTab, setNewTab] = useState("")
  const [newColumn, setNewColumn] = useState("")
  const readOnly = Boolean(model.readOnly)
  const tab = tabs.find((candidate) => candidate.id === selected) ?? tabs[0]
  const operations = useMemo(() => operationsOf(tabs), [tabs])
  const liveTabs = tabs.filter((candidate) => !candidate.removed)
  const problems = useMemo(() => tabs.flatMap((candidate) => candidate.removed ? [] : [
    ...(!candidate.original ? [tabProblem(candidate.name, tabs.filter((other) => other.id !== candidate.id && !other.removed).map((other) => other.name))] : []),
    ...candidate.columns.filter((column) => !column.removed).map((column) => headerProblem(column.header, candidate.columns.filter((other) => other.id !== column.id && !other.removed).map((other) => other.header))),
    ...candidate.columns.filter((column) => !column.removed && column.spec.kind === "linked" && column.spec.link && !column.spec.link.column.trim() && !column.original).map(() => "Une colonne liée doit nommer la colonne qui lui répond en face."),
  ].filter(Boolean).map((problem) => `${candidate.name} : ${problem}`)), [tabs])

  const updateTab = (next: DraftTab) => setTabs((current) => current.map((candidate) => candidate.id === next.id ? next : candidate))
  const relations = tab?.columns.filter((column) => !column.removed && (column.spec.kind === "linked" || column.spec.kind === "linked-choice")) ?? []

  function addTab() {
    const name = newTab.trim()
    if (!name || tabProblem(name, liveTabs.map((candidate) => candidate.name))) return
    const draft: DraftTab = { id: nextId(), name, columns: [], removed: false, remove: true, addColumns: true }
    setTabs((current) => [...current, draft])
    setSelected(draft.id)
    setNewTab("")
  }

  function addColumn() {
    if (!tab) return
    const header = newColumn.trim()
    if (!header || headerProblem(header, tab.columns.filter((column) => !column.removed).map((column) => column.header))) return
    updateTab({ ...tab, columns: [...tab.columns, { id: nextId(), header, spec: { kind: "rich" }, policy: freePolicy, removed: false }] })
    setNewColumn("")
  }

  return <Dialog open={open} onOpenChange={(next) => { if (!next && !pending) onClose() }}>
    <DialogContent className="flex max-h-[92svh] flex-col gap-4 sm:max-w-5xl">
      <DialogHeader>
        <DialogTitle className="font-display text-2xl">{title ?? `Modifier « ${model.title} »`}</DialogTitle>
        <DialogDescription>{intro ?? (readOnly ? model.readOnlyReason : "Colonnes, types et onglets. Rien n’est écrit dans Google Sheets avant « Enregistrer » ; une colonne ou un onglet supprimé part dans la corbeille, d’où on peut le restaurer.")}</DialogDescription>
      </DialogHeader>
      {leading}
      <div className="grid min-h-0 flex-1 gap-4 overflow-hidden md:grid-cols-[13rem_minmax(0,1fr)]">
        <aside className="grid content-start gap-1 overflow-y-auto">
          <p className="px-1 text-[11px] font-semibold uppercase tracking-[.14em] text-muted-foreground">Onglets</p>
          {tabs.map((candidate) => <div key={candidate.id} className={`flex items-center gap-1 rounded-lg px-1 ${candidate.id === tab?.id ? "bg-primary/10" : ""}`}>
            <button type="button" onClick={() => setSelected(candidate.id)} className={`min-w-0 flex-1 truncate rounded-md px-2 py-1.5 text-left text-sm ${candidate.removed ? "line-through opacity-60" : ""}`}>{candidate.name}{!candidate.original && <span className="ml-1 text-[10px] text-primary">nouveau</span>}</button>
            {candidate.removed
              ? <Button type="button" variant="ghost" size="icon-xs" onClick={() => updateTab({ ...candidate, removed: false })} title="Annuler la suppression" aria-label="Annuler la suppression"><Undo2 /></Button>
              : <Button type="button" variant="ghost" size="icon-xs" className="text-destructive" disabled={readOnly || !candidate.remove || liveTabs.length <= 1} onClick={() => updateTab({ ...candidate, removed: true })} title={candidate.remove ? "Mettre l’onglet à la corbeille" : candidate.removeReason} aria-label="Supprimer l’onglet">{candidate.remove ? <Trash2 /> : <Lock />}</Button>}
          </div>)}
          {model.addTabs && !readOnly
            ? <form className="mt-2 flex gap-1" onSubmit={(event) => { event.preventDefault(); addTab() }}><Input value={newTab} onChange={(event) => setNewTab(event.target.value)} placeholder="Nouvel onglet" className="h-8 text-xs" /><Button type="submit" size="icon-sm" variant="outline" aria-label="Ajouter l’onglet"><Plus /></Button></form>
            : model.addTabsReason && <p className="mt-2 flex gap-1 px-1 text-[11px] text-muted-foreground"><Lock className="mt-0.5 size-3 shrink-0" />{model.addTabsReason}</p>}
        </aside>
        <section className="grid min-h-0 content-start gap-2 overflow-y-auto pr-1">
          {tab ? <>
            <ul className="grid gap-2">
              {tab.columns.map((column) => <ColumnRow key={column.id} column={column} relations={relations} targets={model.relationTargets} readOnly={readOnly || tab.removed} onChange={(next) => updateTab({ ...tab, columns: tab.columns.map((candidate) => candidate.id === next.id ? next : candidate) })} />)}
            </ul>
            {!tab.columns.length && <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">« Nom » et « ID » sont créés d’office. Ajoute tes colonnes ici.</p>}
            {tab.addColumns && !readOnly && !tab.removed
              ? <form className="flex gap-2" onSubmit={(event) => { event.preventDefault(); addColumn() }}><Input value={newColumn} onChange={(event) => setNewColumn(event.target.value)} placeholder="Nom de la nouvelle colonne" className="h-9" /><Button type="submit" variant="outline"><Plus />Ajouter une colonne</Button></form>
              : tab.addColumnsReason && <p className="flex gap-1.5 text-xs text-muted-foreground"><Lock className="mt-0.5 size-3.5 shrink-0" />{tab.addColumnsReason}</p>}
          </> : <p className="text-sm text-muted-foreground">Ajoute un onglet pour commencer.</p>}
        </section>
      </div>
      {(operations.length > 0 || problems.length > 0 || error) && <div className="grid max-h-32 gap-1 overflow-y-auto rounded-xl border bg-muted/30 px-3 py-2 text-xs">
        {problems.map((problem) => <p key={problem} className="text-destructive">{problem}</p>)}
        {error && <p className="text-destructive">{error}</p>}
        {operations.length > 0 && <p className="font-semibold"><Settings2 className="mr-1 inline size-3.5" />{operations.length} changement{operations.length > 1 ? "s" : ""} à écrire dans Google Sheets :</p>}
        {operations.map((operation, index) => <p key={index} className="text-muted-foreground">• {describe(operation)}</p>)}
      </div>}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose} disabled={pending}>{readOnly ? "Fermer" : "Annuler"}</Button>
        {!readOnly && <Button type="button" disabled={pending || !canSubmit || !operations.length || problems.length > 0} onClick={() => onApply(operations)}>{pending ? <LoaderCircle className="animate-spin" /> : <Save />}{submitLabel}</Button>}
      </DialogFooter>
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
    {open && <IndexEditor model={open} open onClose={() => setOpen(null)} onApply={() => setOpen(null)} />}
  </>
}
