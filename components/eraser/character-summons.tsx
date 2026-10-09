"use client"

import { useState, type ReactNode } from "react"
import { ArrowDown, ArrowUp, Check, ChevronDown, ChevronUp, Copy, Crosshair, Footprints, Gauge, Heart, LayoutTemplate, ListPlus, Minus, Pencil, Plus, Skull, Sparkles, Trash2, Type, Undo2, WandSparkles, X, Zap } from "lucide-react"

import { InlineEdit } from "@/components/eraser/inline-edit"
import { SuggestInput } from "@/components/eraser/suggest-input"
import { SpellChargeStars } from "@/components/eraser/spell-charges"
import { useCommitOnLeave } from "@/components/eraser/use-commit-on-leave"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { evaluateRelativeExpression } from "@/lib/math-expression"
import {
  duplicateSummon,
  groupSummons,
  isLifeGauge,
  isSummonDown,
  newSummonField,
  newSummonId,
  summonColors,
  summonFieldKinds,
  summonFromTemplate,
  summonLife,
  summonLifeField,
  SUMMON_MAX_CHARGES,
  type Summon,
  type SummonField,
  type SummonsData,
  type SummonTemplate,
} from "@/lib/summons"

/** Applique un changement à partir des invocations les plus récentes ; `false` si rien n'a pu être enregistré. */
export type SummonsUpdate = (change: (data: SummonsData) => SummonsData) => Promise<boolean>

/** Les noms proposés : caractéristiques principales et secondaires de l'index, compétences. */
type Suggestions = { principals: string[]; secondaries: string[]; skills: string[] }

type EditorTarget =
  | { kind: "template"; template: SummonTemplate; isNew: boolean }
  | { kind: "summon"; summon: Summon }

function calculate(expression: string, fallback: number) {
  try { return evaluateRelativeExpression(expression, fallback) } catch { return fallback }
}

function FieldIcon({ field, className = "size-3.5" }: { field: Pick<SummonField, "kind"> & { long?: boolean; group?: string }; className?: string }) {
  if (field.kind === "life") return "label" in field && isLifeGauge(field as Pick<SummonField, "kind" | "label">) ? <Heart className={className} /> : <Gauge className={className} />
  if (field.kind === "stats") return <Sparkles className={className} />
  if (field.kind === "spell") return <WandSparkles className={className} />
  return <Type className={className} />
}

/* ────────────────────────────── Onglet ────────────────────────────── */

export function CharacterSummons({ data, onUpdate, suggestions }: { data: SummonsData; onUpdate: SummonsUpdate; suggestions: Suggestions }) {
  const [editor, setEditor] = useState<EditorTarget | null>(null)
  const [dismissing, setDismissing] = useState<Summon | null>(null)
  const groups = groupSummons(data)

  function createTemplate() {
    const color = summonColors[data.templates.length % summonColors.length]
    setEditor({ kind: "template", isNew: true, template: { id: newSummonId(), name: "", color, fields: [newSummonField("life", { label: "Points de vie" }), newSummonField("stats")] } })
  }

  function summon(template: SummonTemplate) {
    return onUpdate((current) => {
      const fresh = current.templates.find((item) => item.id === template.id) ?? template
      return { ...current, summons: [...current.summons, summonFromTemplate(fresh, current.summons)] }
    })
  }

  const updateSummon = (summonId: string, change: (summon: Summon) => Summon) => onUpdate((current) => ({ ...current, summons: current.summons.map((item) => item.id === summonId ? change(item) : item) }))

  async function saveEditor(target: EditorTarget) {
    const saved = target.kind === "template"
      ? await onUpdate((current) => current.templates.some((item) => item.id === target.template.id)
        ? { ...current, templates: current.templates.map((item) => item.id === target.template.id ? target.template : item) }
        : { ...current, templates: [...current.templates, target.template] })
      : await updateSummon(target.summon.id, () => target.summon)
    if (saved) setEditor(null)
  }

  async function deleteTemplate(templateId: string) {
    if (await onUpdate((current) => ({ ...current, templates: current.templates.filter((item) => item.id !== templateId) }))) setEditor(null)
  }

  return <div className="space-y-6">
    <section className="rounded-2xl border border-border/50 bg-background/20 p-3">
      <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[.16em] text-muted-foreground"><LayoutTemplate className="size-3.5" />Templates d’invocation</div>
      {data.templates.length === 0
        ? <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border/60 px-4 py-8 text-center">
          <WandSparkles className="size-7 text-muted-foreground/70" />
          <p className="max-w-md text-sm text-muted-foreground">Un template est le modèle d’une créature : ses points de vie, ses caractéristiques, ses sorts. Crée-le une fois, puis invoque autant d’exemplaires que tu veux.</p>
          <Button type="button" onClick={createTemplate}><Plus />Créer un template d’invocation</Button>
        </div>
        : <div className="flex flex-wrap items-center gap-2">
          {data.templates.map((template) => {
            const count = data.summons.filter((item) => item.templateId === template.id).length
            return <div key={template.id} className="group/template flex items-center overflow-hidden rounded-xl border shadow-sm" style={{ borderColor: `${template.color}66`, backgroundColor: `${template.color}14` }}>
              <button type="button" onClick={() => void summon(template)} className="flex items-center gap-2 py-1.5 pl-3 pr-2 text-sm font-medium transition hover:bg-white/5" title={`Invoquer : ${template.name}`}>
                <span className="size-2.5 rounded-full" style={{ backgroundColor: template.color }} />
                <span className="max-w-48 truncate">{template.name}</span>
                {count > 0 && <span className="rounded-full bg-background/60 px-1.5 text-[10px] tabular-nums text-muted-foreground">{count}</span>}
                <span className="flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-xs font-semibold" style={{ color: template.color, backgroundColor: `${template.color}22` }}><Plus className="size-3" />Invoquer</span>
              </button>
              <button type="button" onClick={() => setEditor({ kind: "template", isNew: false, template })} className="flex h-full items-center border-l px-2 py-2 text-muted-foreground transition hover:bg-white/5 hover:text-foreground" style={{ borderColor: `${template.color}40` }} aria-label={`Modifier le template ${template.name}`} title="Modifier le template"><Pencil className="size-3.5" /></button>
            </div>
          })}
          <Button type="button" variant="outline" size="sm" className="border-dashed" onClick={createTemplate}><Plus />Créer un template</Button>
        </div>}
    </section>

    {groups.length === 0 && data.templates.length > 0 && <p className="rounded-xl border border-dashed border-border/50 px-4 py-6 text-center text-sm text-muted-foreground">Aucune invocation pour l’instant. Clique sur « Invoquer » d’un template pour en faire apparaître une.</p>}

    {groups.map((group) => <section key={group.key}>
      <div className="mb-2 flex items-center gap-2">
        <span className="h-5 w-1 rounded-full" style={{ backgroundColor: group.color }} />
        <h3 className="font-display text-lg font-semibold" style={{ color: group.color }}>{group.type}</h3>
        <span className="text-xs tabular-nums text-muted-foreground">{group.summons.length}</span>
        {group.template && <Button type="button" variant="ghost" size="xs" className="ml-auto" onClick={() => void summon(group.template!)}><Plus />Invoquer</Button>}
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {group.summons.map((item) => <SummonCard key={item.id} summon={item} onChange={(change) => updateSummon(item.id, change)} onEdit={() => setEditor({ kind: "summon", summon: item })} onDuplicate={() => void onUpdate((current) => {
          const source = current.summons.find((candidate) => candidate.id === item.id) ?? item
          const copy = duplicateSummon(source, current.summons)
          const at = current.summons.findIndex((candidate) => candidate.id === item.id)
          return { ...current, summons: [...current.summons.slice(0, at + 1), copy, ...current.summons.slice(at + 1)] }
        })} onDismiss={() => setDismissing(item)} />)}
      </div>
    </section>)}

    {editor && <SummonEditor key={editor.kind === "template" ? editor.template.id : editor.summon.id} target={editor} suggestions={suggestions} usedBy={editor.kind === "template" ? data.summons.filter((item) => item.templateId === editor.template.id).length : 0} onClose={() => setEditor(null)} onSave={saveEditor} onDeleteTemplate={deleteTemplate} />}

    <AlertDialog open={Boolean(dismissing)} onOpenChange={(open) => { if (!open) setDismissing(null) }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Renvoyer « {dismissing?.name} » ?</AlertDialogTitle>
          <AlertDialogDescription>L’invocation disparaît de la fiche avec son état actuel. Le template reste là pour en invoquer une nouvelle.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Garder</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={() => { const target = dismissing; setDismissing(null); if (target) void onUpdate((current) => ({ ...current, summons: current.summons.filter((item) => item.id !== target.id) })) }}>Renvoyer</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>
}

/* ──────────────────────────── Mini-fiche ──────────────────────────── */

type CardChange = (change: (summon: Summon) => Summon) => Promise<boolean>

function SummonCard({ summon, onChange, onEdit, onDuplicate, onDismiss }: { summon: Summon; onChange?: CardChange; onEdit?: () => void; onDuplicate?: () => void; onDismiss?: () => void }) {
  const [collapsed, setCollapsed] = useState(false)
  const down = isSummonDown(summon)
  const life = summonLifeField(summon) ?? summon.fields.find((field): field is Extract<SummonField, { kind: "life" }> => field.kind === "life")
  const changeField = onChange && ((fieldId: string, change: (field: SummonField) => SummonField) => onChange((current) => ({ ...current, fields: current.fields.map((field) => field.id === fieldId ? change(field) : field) })))
  const live = Boolean(onChange)

  return <article className="group/summon relative min-w-0 overflow-hidden rounded-xl border bg-card/40 shadow-sm transition" style={{ borderColor: `${summon.color}55`, borderTop: `3px solid ${summon.color}` }}>
    <header className="flex items-center gap-1.5 px-3 pt-2.5">
      <div className="min-w-0 flex-1">
        {live
          ? <InlineEdit singleClick compact label="Nom de l’invocation" value={summon.name} onCommit={async (value) => { if (value.trim()) await onChange!((current) => ({ ...current, name: value.trim() })) }}><span className={`block truncate font-display text-base font-semibold ${down ? "text-muted-foreground line-through decoration-rose-400/60" : ""}`}>{summon.name}</span></InlineEdit>
          : <span className="block truncate font-display text-base font-semibold">{summon.name || "Invocation"}</span>}
        <p className="truncate text-[10px] uppercase tracking-[.14em] text-muted-foreground">{summon.type}</p>
      </div>
      {down && <span className="flex items-center gap-1 rounded-full bg-rose-500/15 px-2 py-0.5 text-[10px] font-semibold text-rose-300" title="Plus de points de vie"><Skull className="size-3" />Vaincue</span>}
      {live && <div className="flex items-center opacity-60 transition group-hover/summon:opacity-100 group-focus-within/summon:opacity-100">
        <Button type="button" variant="ghost" size="icon-xs" onClick={onEdit} aria-label={`Modifier ${summon.name}`} title="Modifier les champs"><Pencil /></Button>
        <Button type="button" variant="ghost" size="icon-xs" onClick={onDuplicate} aria-label={`Dupliquer ${summon.name}`} title="Dupliquer"><Copy /></Button>
        <Button type="button" variant="ghost" size="icon-xs" className="hover:text-destructive" onClick={onDismiss} aria-label={`Renvoyer ${summon.name}`} title="Renvoyer"><Undo2 /></Button>
        <Button type="button" variant="ghost" size="icon-xs" onClick={() => setCollapsed((value) => !value)} aria-label={collapsed ? "Déplier" : "Replier"} title={collapsed ? "Déplier" : "Replier"}>{collapsed ? <ChevronDown /> : <ChevronUp />}</Button>
      </div>}
    </header>
    {collapsed && life
      ? <div className="px-3 pb-3 pt-2"><LifeBar field={life} color={summon.color} compact onChange={changeField && ((change) => changeField(life.id, change))} /></div>
      : !collapsed && <div className={`space-y-3 px-3 pb-3 pt-2 transition ${down ? "opacity-60 saturate-[.35]" : ""}`}>
        {summon.fields.length === 0 && <p className="text-xs text-muted-foreground">Aucun champ. {live ? "Le crayon permet d’en ajouter." : ""}</p>}
        {summon.fields.map((field) => <SummonFieldView key={field.id} field={field} color={summon.color} onChange={changeField && ((change) => changeField(field.id, change))} />)}
      </div>}
  </article>
}

type FieldChange = (change: (field: SummonField) => SummonField) => Promise<boolean>

function SummonFieldView({ field, color, onChange }: { field: SummonField; color: string; onChange?: FieldChange }) {
  if (field.kind === "life") return <LifeBar field={field} color={color} onChange={onChange} />
  if (field.kind === "stats") return <div>
    {field.label && <p className="mb-1 text-[9px] font-semibold uppercase tracking-[.16em] text-muted-foreground">{field.label}</p>}
    {field.stats.length === 0
      ? <p className="text-xs text-muted-foreground/70">—</p>
      : <div className="grid grid-cols-[repeat(auto-fill,minmax(5.5rem,1fr))] gap-1">{field.stats.map((stat) => <div key={stat.id} className="min-w-0 rounded-lg px-1.5 py-1 text-center" style={{ backgroundColor: `${color}14` }}>
        <p className="line-clamp-2 break-words text-[9px] leading-tight text-muted-foreground" title={stat.name}>{stat.name || "—"}</p>
        {onChange
          ? <InlineEdit singleClick compact label={stat.name || "Caractéristique"} value={stat.value} onCommit={async (value) => { await onChange((current) => current.kind === "stats" ? { ...current, stats: current.stats.map((item) => item.id === stat.id ? { ...item, value } : item) } : current) }}><span className="block text-sm font-semibold tabular-nums">{stat.value || "—"}</span></InlineEdit>
          : <span className="block text-sm font-semibold tabular-nums">{stat.value || "—"}</span>}
      </div>)}</div>}
  </div>
  if (field.kind === "spell") {
    // Sur une vraie carte, une option cochée mais laissée vide ne s'affiche pas ; l'aperçu la montre.
    const shown = (value: string | undefined) => value !== undefined && (!onChange || value.trim() !== "")
    const chips = [
      shown(field.action) && <SpellChip key="action" icon={<Zap className="size-3" />} label="Action" value={field.action!} />,
      shown(field.distance) && <SpellChip key="distance" icon={<Crosshair className="size-3" />} label="Distance" value={field.distance!} />,
      shown(field.skill) && <SpellChip key="skill" icon={<Footprints className="size-3" />} label="Compétence" value={field.skill!} />,
    ].filter(Boolean)
    return <div className="rounded-lg border border-border/40 bg-background/30 px-2.5 py-2">
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <WandSparkles className="size-3.5 shrink-0" style={{ color }} />
      <span className="min-w-0 flex-1 truncate text-sm font-semibold">{field.label || "Sort"}</span>
      {field.charges ? <SpellChargeStars total={field.charges} current={field.chargesLeft ?? field.charges} accent={color} interactive={Boolean(onChange)} onChange={(value) => void onChange?.((current) => current.kind === "spell" ? { ...current, chargesLeft: value } : current)} /> : null}
    </div>
    {chips.length > 0 && <div className="mt-1.5 flex flex-wrap gap-1">{chips}</div>}
    {field.description && <p className="mt-1.5 whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">{field.description}</p>}
  </div>
  }
  return <div className="min-w-0">
    <p className="text-[9px] font-semibold uppercase tracking-[.16em] text-muted-foreground">{field.label || "Champ"}</p>
    {onChange
      ? <InlineEdit singleClick multiline={field.long} label={field.label || "Champ"} value={field.value} onCommit={async (value) => { await onChange((current) => current.kind === "text" ? { ...current, value } : current) }}><span className={`block text-sm ${field.long ? "whitespace-pre-wrap" : "truncate"} ${field.value ? "" : "text-muted-foreground/55"}`}>{field.value || "Non renseigné"}</span></InlineEdit>
      : <span className={`block text-sm ${field.long ? "whitespace-pre-wrap" : "truncate"} ${field.value ? "" : "text-muted-foreground/55"}`}>{field.value || "Non renseigné"}</span>}
  </div>
}

function SpellChip({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return <span className="inline-flex max-w-full items-center gap-1 rounded-full border border-border/50 bg-background/50 px-2 py-0.5 text-[11px]" title={label}>{icon}<span className="text-muted-foreground">{label}</span><span className="truncate font-medium">{value || "—"}</span></span>
}

/** La vie d'une invocation : − et + d'un point, et un clic sur un nombre pour taper « -5 », « +3 », « *2 »… */
function LifeBar({ field, color, compact = false, onChange }: { field: Extract<SummonField, { kind: "life" }>; color: string; compact?: boolean; onChange?: FieldChange }) {
  const [editing, setEditing] = useState<"current" | "max" | null>(null)
  const [draft, setDraft] = useState("")
  const { ratio, down } = summonLife(field)
  const shown = down ? "#c86f6f" : color
  const write = (key: "current" | "max", value: string) => onChange?.((current) => current.kind === "life" ? { ...current, [key]: value } : current)
  const original = editing ? field[editing] || "0" : ""
  const leave = useCommitOnLeave(Boolean(editing), draft, original, async (next) => { if (editing) await write(editing, String(calculate(next, Number.parseFloat(field[editing]) || 0))) })
  async function save() { if (await leave.save()) setEditing(null) }
  const step = (amount: number) => write("current", String((Number.parseFloat(field.current) || 0) + amount))

  function number(key: "current" | "max") {
    if (editing === key) return <Input autoFocus value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void save(); if (event.key === "Escape") { leave.cancel(); setEditing(null) } }} onBlur={() => void save()} className="h-7 w-20 px-2 text-sm" placeholder="-5, +3, *2…" aria-label={key === "current" ? "Points de vie actuels" : "Points de vie maximum"} />
    const value = field[key] || "0"
    const style = { color: shown }
    const className = `tabular-nums font-semibold ${compact ? "text-base" : "text-xl"} ${key === "max" ? "opacity-75" : ""}`
    if (!onChange) return <span className={className} style={style}>{value}</span>
    return <button type="button" onClick={() => { setDraft(value); setEditing(key) }} className={`${className} rounded px-0.5 hover:bg-white/5`} style={style} title="Valeur, +3, -5, *2 ou /2">{value}</button>
  }

  return <div>
    <div className="flex items-center gap-1.5">
      {!compact && <p className="mr-auto flex items-center gap-1 text-[9px] font-semibold uppercase tracking-[.16em] text-muted-foreground"><FieldIcon field={field} className="size-3" />{field.label || "Jauge"}</p>}
      {onChange && <button type="button" onClick={() => void step(-1)} className="flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted" aria-label={`Retirer 1 à ${field.label || "la jauge"}`}><Minus className="size-3" /></button>}
      <span className="inline-flex items-baseline gap-1">{number("current")}<span className="text-xs text-muted-foreground">/</span>{number("max")}</span>
      {onChange && <button type="button" onClick={() => void step(1)} className="flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted" aria-label={`Ajouter 1 à ${field.label || "la jauge"}`}><Plus className="size-3" /></button>}
      {compact && <div className="ml-2 h-1.5 flex-1 overflow-hidden rounded-full" style={{ backgroundColor: `${shown}26` }}><div className="h-full rounded-full transition-[width]" style={{ width: `${ratio}%`, backgroundColor: shown }} /></div>}
    </div>
    {!compact && <div className="mt-1 h-1.5 overflow-hidden rounded-full" style={{ backgroundColor: `${shown}26` }}><div className="h-full rounded-full transition-[width]" style={{ width: `${ratio}%`, backgroundColor: shown }} /></div>}
  </div>
}

/* ───────────────────────────── Éditeur ───────────────────────────── */

function SummonEditor({ target, suggestions, usedBy, onClose, onSave, onDeleteTemplate }: { target: EditorTarget; suggestions: Suggestions; usedBy: number; onClose: () => void; onSave: (target: EditorTarget) => Promise<void>; onDeleteTemplate: (templateId: string) => Promise<void> }) {
  const isTemplate = target.kind === "template"
  const [name, setName] = useState(isTemplate ? target.template.name : target.summon.name)
  const [color, setColor] = useState(isTemplate ? target.template.color : target.summon.color)
  const [fields, setFields] = useState<SummonField[]>(isTemplate ? target.template.fields : target.summon.fields)
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const patch = (fieldId: string, change: (field: SummonField) => SummonField) => setFields((current) => current.map((field) => field.id === fieldId ? change(field) : field))
  const move = (index: number, by: number) => setFields((current) => {
    const next = [...current]; const [field] = next.splice(index, 1); next.splice(Math.max(0, Math.min(next.length, index + by)), 0, field); return next
  })

  const previewName = name.trim() || (isTemplate ? "Nouveau template" : "Invocation")
  const preview: Summon = isTemplate
    ? { id: "preview", templateId: target.template.id, type: previewName, color, name: previewName, fields }
    : { ...target.summon, name: previewName, fields }

  async function save() {
    if (!name.trim()) return
    setSaving(true)
    await onSave(isTemplate ? { ...target, template: { ...target.template, name: name.trim(), color, fields } } : { kind: "summon", summon: { ...target.summon, name: name.trim(), fields } })
    setSaving(false)
  }

  return <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
    <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-5xl" onInteractOutside={(event) => event.preventDefault()} onEscapeKeyDown={(event) => {
      // Échap dans une liste de propositions ouverte ne ferme que la liste.
      const focused = document.activeElement
      if (focused?.getAttribute("role") === "combobox" && focused.getAttribute("aria-expanded") === "true") event.preventDefault()
    }}>
      <DialogHeader>
        <DialogTitle>{isTemplate ? target.isNew ? "Créer un template d’invocation" : "Modifier le template" : `Modifier ${target.summon.name}`}</DialogTitle>
        <DialogDescription>{isTemplate
          ? usedBy > 0 ? `Les ${usedBy > 1 ? `${usedBy} invocations déjà présentes gardent` : "invocation déjà présente garde"} ${usedBy > 1 ? "leurs" : "ses"} champs : seules les prochaines suivront ce template.` : "Ajoute des champs, nomme-les et pré-remplis-les : chaque invocation partira de ce modèle."
          : `Les champs de cette invocation seulement : le template « ${target.summon.type} » ne change pas.`}</DialogDescription>
      </DialogHeader>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <label className="grid min-w-48 flex-1 gap-1.5 text-sm font-medium">{isTemplate ? "Nom du template" : "Nom de l’invocation"}
              <Input autoFocus={isTemplate && target.isNew} value={name} onChange={(event) => setName(event.target.value)} placeholder={isTemplate ? "Loup spectral, Golem de pierre…" : "Nom"} onKeyDown={(event) => { if (event.key === "Enter") void save() }} />
            </label>
            {isTemplate && <div className="grid gap-1.5 text-sm font-medium">Couleur<div className="flex h-9 items-center gap-1">{summonColors.map((swatch) => <button key={swatch} type="button" onClick={() => setColor(swatch)} className={`size-6 rounded-full transition ${color === swatch ? "ring-2 ring-foreground ring-offset-2 ring-offset-background" : "opacity-70 hover:opacity-100"}`} style={{ backgroundColor: swatch }} aria-label={`Couleur ${swatch}`} aria-pressed={color === swatch} />)}</div></div>}
          </div>

          <div className="space-y-2">
            {fields.length === 0 && <p className="rounded-xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">Aucun champ pour l’instant : ajoute-en avec les boutons ci-dessous.</p>}
            {fields.map((field, index) => <FieldEditor key={field.id} field={field} suggestions={suggestions} first={index === 0} last={index === fields.length - 1} onChange={(change) => patch(field.id, change)} onMove={(by) => move(index, by)} onRemove={() => setFields((current) => current.filter((item) => item.id !== field.id))} />)}
          </div>

          <div>
            <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[.16em] text-muted-foreground"><ListPlus className="size-3.5" />Ajouter un champ</p>
            <div className="grid gap-1.5 sm:grid-cols-2 xl:grid-cols-3">
              {summonFieldKinds.map((kind) => <button key={kind.label} type="button" onClick={() => setFields((current) => [...current, newSummonField(kind.kind, { long: kind.long })])} className="flex items-start gap-2 rounded-lg border border-dashed px-2.5 py-2 text-left transition hover:border-primary/50 hover:bg-primary/5">
                <span className="mt-0.5 text-muted-foreground"><FieldIcon field={kind} /></span>
                <span className="min-w-0"><span className="block text-sm font-medium">{kind.label}</span><span className="block text-[11px] text-muted-foreground">{kind.hint}</span></span>
              </button>)}
            </div>
          </div>
        </div>

        <aside className="min-w-0 lg:sticky lg:top-0 lg:self-start">
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[.16em] text-muted-foreground">Aperçu</p>
          <SummonCard summon={preview} />
        </aside>
      </div>


      <div className="flex flex-wrap items-center gap-2 border-t pt-4">
        {isTemplate && !target.isNew && <Button type="button" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setConfirmDelete(true)}><Trash2 />Supprimer le template</Button>}
        <span className="ml-auto" />
        <Button type="button" variant="ghost" onClick={onClose}>Annuler</Button>
        <Button type="button" onClick={() => void save()} disabled={saving || !name.trim()}><Check />{isTemplate ? "Enregistrer le template" : "Enregistrer"}</Button>
      </div>

      {isTemplate && <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer le template « {target.template.name} » ?</AlertDialogTitle>
            <AlertDialogDescription>{usedBy > 0 ? "Les invocations déjà présentes restent sur la fiche, rangées sous le même type." : "Il ne sera plus proposé en haut de l’onglet."}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => void onDeleteTemplate(target.template.id)}>Supprimer</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>}
    </DialogContent>
  </Dialog>
}

const fieldKindLabel = (field: SummonField) => field.kind === "life" ? "Jauge" : field.kind === "stats" ? "Caractéristiques" : field.kind === "spell" ? "Sort" : field.long ? "Texte long" : "Champ libre"

function FieldEditor({ field, suggestions, first, last, onChange, onMove, onRemove }: { field: SummonField; suggestions: Suggestions; first: boolean; last: boolean; onChange: (change: (field: SummonField) => SummonField) => void; onMove: (by: number) => void; onRemove: () => void }) {
  const characteristicGroups = [{ label: "Principales", items: suggestions.principals }, { label: "Secondaires", items: suggestions.secondaries }]
  return <div className="rounded-xl border border-border/60 bg-background/30 p-2.5">
    <div className="flex items-center gap-2">
      <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground" title={fieldKindLabel(field)}><FieldIcon field={field} /></span>
      <Input value={field.label} onChange={(event) => onChange((current) => ({ ...current, label: event.target.value }))} placeholder={field.kind === "spell" ? "Nom du sort" : "Nom du champ"} aria-label={field.kind === "spell" ? "Nom du sort" : "Nom du champ"} className="h-8 min-w-0 flex-1 font-medium" />
      <span className="hidden text-[10px] uppercase tracking-wider text-muted-foreground sm:inline">{fieldKindLabel(field)}</span>
      <Button type="button" variant="ghost" size="icon-xs" disabled={first} onClick={() => onMove(-1)} aria-label="Monter le champ"><ArrowUp /></Button>
      <Button type="button" variant="ghost" size="icon-xs" disabled={last} onClick={() => onMove(1)} aria-label="Descendre le champ"><ArrowDown /></Button>
      <Button type="button" variant="ghost" size="icon-xs" className="hover:text-destructive" onClick={onRemove} aria-label="Supprimer le champ"><X /></Button>
    </div>

    <div className="mt-2 pl-9">
      {field.kind === "life" && <div className="flex flex-wrap gap-3">
        <label className="grid gap-1 text-xs text-muted-foreground">Actuels<Input inputMode="decimal" value={field.current} onChange={(event) => onChange((current) => current.kind === "life" ? { ...current, current: event.target.value } : current)} className="h-8 w-24" /></label>
        <label className="grid gap-1 text-xs text-muted-foreground">Maximum<Input inputMode="decimal" value={field.max} onChange={(event) => onChange((current) => current.kind === "life" ? { ...current, max: event.target.value } : current)} className="h-8 w-24" /></label>
      </div>}

      {field.kind === "stats" && <div className="space-y-1.5">
        {field.stats.map((stat) => <div key={stat.id} className="flex items-center gap-1.5">
          <SuggestInput className="flex-1" groups={characteristicGroups} value={stat.name} onChange={(name) => onChange((current) => current.kind === "stats" ? { ...current, stats: current.stats.map((item) => item.id === stat.id ? { ...item, name } : item) } : current)} placeholder="Caractéristique (liste ou libre)" aria-label="Nom de la caractéristique" />
          <Input value={stat.value} onChange={(event) => onChange((current) => current.kind === "stats" ? { ...current, stats: current.stats.map((item) => item.id === stat.id ? { ...item, value: event.target.value } : item) } : current)} placeholder="0" aria-label={`Valeur de ${stat.name || "la caractéristique"}`} className="h-8 w-20 tabular-nums" />
          <Button type="button" variant="ghost" size="icon-xs" className="hover:text-destructive" onClick={() => onChange((current) => current.kind === "stats" ? { ...current, stats: current.stats.filter((item) => item.id !== stat.id) } : current)} aria-label={`Retirer ${stat.name || "la caractéristique"}`}><X /></Button>
        </div>)}
        <Button type="button" variant="ghost" size="xs" onClick={() => onChange((current) => current.kind === "stats" ? { ...current, stats: [...current.stats, { id: newSummonId(), name: "", value: "0" }] } : current)}><Plus />Ajouter une caractéristique</Button>
      </div>}

      {field.kind === "spell" && <div className="space-y-2">
        <div className="flex flex-wrap gap-1.5">
          {([["action", "Action", <Zap key="i" className="size-3" />], ["distance", "Distance", <Crosshair key="i" className="size-3" />], ["skill", "Compétence", <Footprints key="i" className="size-3" />]] as const).map(([key, label, icon]) => {
            const on = field[key] !== undefined
            return <button key={key} type="button" aria-pressed={on} onClick={() => onChange((current) => { if (current.kind !== "spell") return current; const next = { ...current }; if (on) delete next[key]; else next[key] = ""; return next })} className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition ${on ? "border-primary/60 bg-primary/15 text-primary" : "border-dashed text-muted-foreground hover:border-primary/40"}`}>{on ? <Check className="size-3" /> : icon}{label}</button>
          })}
          <button type="button" aria-pressed={Boolean(field.charges)} onClick={() => onChange((current) => { if (current.kind !== "spell") return current; const next = { ...current }; if (next.charges) { delete next.charges; delete next.chargesLeft } else { next.charges = 1; next.chargesLeft = 1 } return next })} className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition ${field.charges ? "border-primary/60 bg-primary/15 text-primary" : "border-dashed text-muted-foreground hover:border-primary/40"}`}>{field.charges ? <Check className="size-3" /> : <Sparkles className="size-3" />}Charge</button>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {field.action !== undefined && <label className="grid gap-1 text-xs text-muted-foreground">Action<Input value={field.action} onChange={(event) => onChange((current) => current.kind === "spell" ? { ...current, action: event.target.value } : current)} placeholder="Principale, bonus, réaction…" className="h-8" /></label>}
          {field.distance !== undefined && <label className="grid gap-1 text-xs text-muted-foreground">Distance<Input value={field.distance} onChange={(event) => onChange((current) => current.kind === "spell" ? { ...current, distance: event.target.value } : current)} placeholder="Contact, 10 m…" className="h-8" /></label>}
          {field.skill !== undefined && <div className="grid gap-1 text-xs text-muted-foreground">Compétence<SuggestInput groups={[{ items: suggestions.skills }]} value={field.skill} onChange={(skill) => onChange((current) => current.kind === "spell" ? { ...current, skill } : current)} placeholder="Liste ou libre" aria-label="Compétence du sort" /></div>}
          {field.charges ? <div className="grid gap-1 text-xs text-muted-foreground">Charges<div className="flex h-8 items-center gap-2"><Button type="button" variant="ghost" size="icon-xs" disabled={field.charges <= 1} onClick={() => onChange((current) => current.kind === "spell" && current.charges ? { ...current, charges: current.charges - 1, chargesLeft: Math.min(current.chargesLeft ?? current.charges, current.charges - 1) } : current)} aria-label="Une charge de moins"><Minus /></Button><SpellChargeStars total={field.charges} current={field.charges} accent="currentColor" className="text-primary" /><Button type="button" variant="ghost" size="icon-xs" disabled={field.charges >= SUMMON_MAX_CHARGES} onClick={() => onChange((current) => current.kind === "spell" && current.charges ? { ...current, charges: current.charges + 1, chargesLeft: current.charges + 1 } : current)} aria-label="Une charge de plus"><Plus /></Button></div></div> : null}
        </div>
        <Textarea value={field.description} onChange={(event) => onChange((current) => current.kind === "spell" ? { ...current, description: event.target.value } : current)} placeholder="Effet du sort, dégâts, conditions…" aria-label="Description du sort" className="min-h-16 text-sm" />
      </div>}

      {field.kind === "text" && <div className="space-y-1.5">
        {field.long
          ? <Textarea value={field.value} onChange={(event) => onChange((current) => current.kind === "text" ? { ...current, value: event.target.value } : current)} placeholder="Valeur pré-remplie (facultatif)" aria-label={`Valeur de ${field.label || "ce champ"}`} className="min-h-16 text-sm" />
          : <Input value={field.value} onChange={(event) => onChange((current) => current.kind === "text" ? { ...current, value: event.target.value } : current)} placeholder="Valeur pré-remplie (facultatif)" aria-label={`Valeur de ${field.label || "ce champ"}`} className="h-8" />}
        <button type="button" onClick={() => onChange((current) => { if (current.kind !== "text") return current; const next = { ...current }; if (next.long) delete next.long; else next.long = true; return next })} className="text-[11px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">{field.long ? "Passer en champ court" : "Passer en texte long"}</button>
      </div>}
    </div>
  </div>
}
