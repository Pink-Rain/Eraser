"use client"

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { Braces, Check, ExternalLink, Gauge, Layers, LoaderCircle, Pencil, Plus, Search, Spade, Trash2, X } from "lucide-react"

import { ClassGaugeView, publishGauges, useClassGauges, type ClassGaugeTable } from "@/components/eraser/class-gauges"
import { ClassFormSwitcher } from "@/components/eraser/class-form-switcher"
import { SuggestInput } from "@/components/eraser/suggest-input"
import { emptyFormGroup, formColors, formEffectOperation, formGroupsOfClass, type ClassForm, type ClassFormGroup } from "@/lib/class-forms"
import type { CharacterCatalog } from "@/lib/character-catalog"
import { useCharacterCatalog } from "@/components/eraser/use-character-catalog"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { RichTextField } from "@/components/eraser/rich-text"
import {
  emptyGauge,
  evaluateFormula,
  formulaNameGroups,
  formulaValues,
  gaugeColors,
  gaugeCurrentModes,
  gaugeDisplays,
  gaugeMaxModes,
  gaugePlacements,
  gaugesOfClass,
  resolveGauge,
  sampleFormulaValues,
  type ClassGauge,
  type FormulaValues,
  type GaugeState,
  type GaugeThreshold,
} from "@/lib/class-specifics"

let keyCounter = 0
const newSummonKey = () => `seuil-${(keyCounter += 1)}`

const fold = (value: string) => value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLocaleLowerCase("fr")

/** Les sortes de spécificités : jauge et formes ; le deck arrive. */
const specificKinds: Array<{ key: string; label: string; hint: string; icon: ReactNode; ready: boolean }> = [
  { key: "jauge", label: "Jauge", hint: "Rage, mana, concentration : une barre reliée à la fiche ou tenue par le joueur", icon: <Gauge className="size-4" />, ready: true },
  { key: "formes", label: "Formes", hint: "Plusieurs formes, une active à la fois, chacune avec ses effets temporaires sur la fiche", icon: <Layers className="size-4" />, ready: true },
  { key: "deck", label: "Deck", hint: "Bientôt : des cartes à tirer, défausser, retirer", icon: <Spade className="size-4" />, ready: false },
]

async function postSpecifics(body: unknown) {
  const response = await fetch("/api/classes/specifics", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })
  const payload = (await response.json().catch(() => ({}))) as ClassGaugeTable & { error?: string }
  if (!response.ok) throw new Error(payload.error || "La spécificité n’a pas pu être enregistrée.")
  publishGauges(payload)
  return payload
}

/**
 * Les spécificités d'une classe, dans « Création des classes » : des outils (jauge, et
 * bientôt formes et deck) que le MJ règle pour cette classe. Chaque sorte a son onglet
 * dans le classeur « Sorts de classe ».
 */
export function ClassSpecificsEditor({ classId, className, accent }: { classId: string; className: string; accent: string }) {
  const { table, loading, error } = useClassGauges(true)
  const catalog = useCharacterCatalog()
  const gauges = useMemo(() => gaugesOfClass(table?.gauges ?? [], { id: classId, name: className }), [table, classId, className])
  const formGroups = useMemo(() => formGroupsOfClass(table?.formGroups ?? [], { id: classId, name: className }), [table, classId, className])
  const formNames = useMemo(() => [...new Set(formGroups.flatMap((group) => group.forms.map((form) => form.name)))], [formGroups])
  const sample = useMemo(() => sampleFormulaValues(catalog), [catalog])
  const [editing, setEditing] = useState<ClassGauge | null>(null)
  const [editingForms, setEditingForms] = useState<ClassFormGroup | null>(null)
  const [removing, setRemoving] = useState<{ kind: "gauge" | "forms"; id: string; name: string } | null>(null)
  const [removeError, setRemoveError] = useState("")

  function newFormGroup() {
    const group = emptyFormGroup(classId, className, formGroups.length)
    setEditingForms({ ...group, forms: [
      { id: "", name: "Forme de base", color: formColors[0], isDefault: true, effects: [], description: "", order: 0 },
      { id: "", name: "Seconde forme", color: formColors[2], isDefault: false, effects: [], description: "", order: 1 },
    ] })
  }

  function newGauge() {
    const gauge = emptyGauge(classId, className, "", gauges.length ? Math.max(...gauges.map((item) => item.order)) + 1 : 0)
    setEditing({ ...gauge, color: accent && /^#[0-9a-f]{6}$/i.test(accent) ? accent : gauge.color })
  }

  async function remove(target: { kind: "gauge" | "forms"; id: string }) {
    setRemoveError("")
    try { await postSpecifics({ action: target.kind === "gauge" ? "delete-gauge" : "delete-form-group", id: target.id }); setRemoving(null) } catch (reason) { setRemoveError(reason instanceof Error ? reason.message : "La spécificité n’a pas pu être supprimée.") }
  }

  return <div className="space-y-3">
    <div className="flex flex-wrap items-center gap-2">
      <p className="max-w-2xl text-sm text-muted-foreground">Les règles propres à {className} : chaque spécificité apparaît sur la fiche des personnages de cette classe.</p>
      <span className="ml-auto" />
      {table?.exists && <a href={table.sheetUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"><ExternalLink className="size-3.5" />Onglet « Jauges »</a>}
      <DropdownMenu>
        <DropdownMenuTrigger asChild><Button type="button" size="sm"><Plus />Ajouter une spécificité</Button></DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-80">
          <DropdownMenuLabel>Outils</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {specificKinds.map((kind) => <DropdownMenuItem key={kind.key} disabled={!kind.ready} onSelect={() => { if (kind.key === "jauge") newGauge(); if (kind.key === "formes") newFormGroup() }} className="items-start gap-2 py-2">
            <span className="mt-0.5 text-muted-foreground">{kind.icon}</span>
            <span className="min-w-0"><span className="block font-medium">{kind.label}</span><span className="block text-xs text-muted-foreground">{kind.hint}</span></span>
          </DropdownMenuItem>)}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>

    {error && <p className="rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">{error}</p>}
    {loading && <p className="flex items-center gap-2 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" />Lecture des spécificités…</p>}
    {!loading && !error && !gauges.length && !formGroups.length && <p className="rounded-2xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">Aucune spécificité pour l’instant. « Ajouter une spécificité » propose les outils disponibles.</p>}

    {formGroups.length > 0 && <div className="grid gap-3 md:grid-cols-2">
      {formGroups.map((group) => <article key={group.id} className="space-y-2 rounded-2xl border bg-background/30 p-3" style={{ borderColor: `${(group.forms.find((form) => form.isDefault) ?? group.forms[0])?.color ?? "#7d7f86"}40` }}>
        <div className="flex items-center gap-2">
          <Layers className="size-4 text-muted-foreground" />
          <h4 className="min-w-0 flex-1 truncate font-display text-base font-semibold">{group.name}<span className="ml-2 text-xs font-normal text-muted-foreground">{group.forms.length} formes</span></h4>
          <Button type="button" variant="ghost" size="icon-xs" onClick={() => setEditingForms(group)} aria-label={`Modifier ${group.name}`}><Pencil /></Button>
          <Button type="button" variant="ghost" size="icon-xs" className="hover:text-destructive" onClick={() => { setRemoveError(""); setRemoving({ kind: "forms", id: group.id, name: group.name }) }} aria-label={`Supprimer ${group.name}`}><Trash2 /></Button>
        </div>
        <ClassFormSwitcher group={group} />
        <p className="text-[11px] text-muted-foreground">{gaugePlacements.find((item) => item.value === group.placement)?.label} · forme de départ : {group.forms.find((form) => form.isDefault)?.name ?? group.forms[0]?.name}</p>
      </article>)}
    </div>}

    {gauges.length > 0 && <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {gauges.map((gauge) => {
        const resolved = resolveGauge(gauge, sample)
        return <article key={gauge.id} className="space-y-2 rounded-2xl border bg-background/30 p-3" style={{ borderColor: `${gauge.color}40` }}>
          <div className="flex items-center gap-2">
            <Gauge className="size-4" style={{ color: gauge.color }} />
            <h4 className="min-w-0 flex-1 truncate font-display text-base font-semibold">{gauge.name}</h4>
            <Button type="button" variant="ghost" size="icon-xs" onClick={() => setEditing(gauge)} aria-label={`Modifier ${gauge.name}`}><Pencil /></Button>
            <Button type="button" variant="ghost" size="icon-xs" className="hover:text-destructive" onClick={() => { setRemoveError(""); setRemoving({ kind: "gauge", id: gauge.id, name: gauge.name }) }} aria-label={`Supprimer ${gauge.name}`}><Trash2 /></Button>
          </div>
          <ClassGaugeView resolved={resolved} showErrors />
          <p className="text-[11px] text-muted-foreground">{gaugePlacements.find((item) => item.value === gauge.placement)?.label} · {gaugeMaxModes.find((item) => item.value === gauge.maxMode)?.label.toLowerCase()} · {gauge.currentMode === "formule" ? "valeur calculée" : "tenue par le joueur"}{gauge.forms.length ? ` · seulement en ${gauge.forms.join(", ")}` : ""}</p>
        </article>
      })}
    </div>}

    {editing && <GaugeEditor key={editing.id || "new"} initial={editing} catalogGroups={formulaNameGroups(catalog)} sample={sample} formNames={formNames} onClose={() => setEditing(null)} onSaved={() => setEditing(null)} />}
    {editingForms && <FormGroupEditor key={editingForms.id || "new"} initial={editingForms} targetGroups={effectTargetGroups(catalog)} onClose={() => setEditingForms(null)} onSaved={() => setEditingForms(null)} />}

    <AlertDialog open={Boolean(removing)} onOpenChange={(open) => { if (!open) setRemoving(null) }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Supprimer {removing?.kind === "forms" ? "les formes" : "la jauge"} « {removing?.name} » ?</AlertDialogTitle>
          <AlertDialogDescription>{removing?.kind === "forms" ? `Leurs lignes sont retirées de l’onglet « Formes » et elles disparaissent des fiches des personnages de ${className}.` : `Sa ligne est retirée de l’onglet « Jauges » et elle disparaît des fiches des personnages de ${className}.`}</AlertDialogDescription>
        </AlertDialogHeader>
        {removeError && <p className="text-sm text-destructive">{removeError}</p>}
        <AlertDialogFooter>
          <AlertDialogCancel>Garder</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={(event) => { event.preventDefault(); if (removing) void remove(removing) }}>Supprimer</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>
}

/* ───────────────────────────── Éditeur ───────────────────────────── */

function Choice<T extends string>({ value, options, onChange }: { value: T; options: Array<{ value: T; label: string; hint: string }>; onChange: (value: T) => void }) {
  return <div className="grid gap-1.5 sm:grid-cols-3">
    {options.map((option) => <button key={option.value} type="button" aria-pressed={value === option.value} onClick={() => onChange(option.value)} className={`rounded-xl border px-3 py-2 text-left transition ${value === option.value ? "border-primary/60 bg-primary/10" : "border-border/60 hover:border-primary/35"}`}>
      <span className="flex items-center gap-1.5 text-sm font-medium">{value === option.value && <Check className="size-3.5 text-primary" />}{option.label}</span>
      <span className="block text-[11px] text-muted-foreground">{option.hint}</span>
    </button>)}
  </div>
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return <div className="grid gap-1.5">
    <p className="text-sm font-medium">{label}{hint && <span className="ml-2 text-xs font-normal text-muted-foreground">{hint}</span>}</p>
    {children}
  </div>
}

/**
 * Un nombre ou une formule : les valeurs de la fiche s'insèrent entre accolades depuis la
 * liste (« {Points de vie max} »). Le résultat avec les valeurs d'exemple s'affiche dessous.
 */
function FormulaField({ value, onChange, groups, sample, placeholder, ariaLabel }: { value: string; onChange: (value: string) => void; groups: Array<{ label: string; items: string[] }>; sample: FormulaValues; placeholder?: string; ariaLabel: string }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const input = useRef<HTMLInputElement>(null)
  const result = value.trim() ? evaluateFormula(value, sample) : null
  const shown = groups.map((group) => ({ ...group, items: group.items.filter((item) => !query.trim() || fold(item).includes(fold(query.trim()))) })).filter((group) => group.items.length)

  function insert(name: string) {
    const element = input.current
    const token = `{${name}}`
    const start = element?.selectionStart ?? value.length
    const end = element?.selectionEnd ?? value.length
    const next = `${value.slice(0, start)}${token}${value.slice(end)}`
    onChange(next)
    setOpen(false)
    setQuery("")
    window.setTimeout(() => { element?.focus(); element?.setSelectionRange(start + token.length, start + token.length) }, 0)
  }

  return <div className="grid gap-1">
    <div className="flex gap-1.5">
      <Input ref={input} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} aria-label={ariaLabel} className="h-9 min-w-0 flex-1 font-mono text-sm" />
      <Button type="button" variant="outline" size="sm" className="h-9" onClick={() => setOpen((current) => !current)} aria-expanded={open}><Braces />Valeur de la fiche</Button>
    </div>
    {open && <div className="rounded-xl border bg-popover p-2 shadow-sm">
      <div className="relative mb-1.5"><Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" /><Input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Escape") { event.stopPropagation(); setOpen(false) } }} placeholder="Chercher une valeur…" className="h-8 pl-8" /></div>
      <div className="max-h-56 space-y-2 overflow-y-auto">
        {shown.map((group) => <div key={group.label}>
          <p className="px-1 pb-1 text-[10px] font-semibold uppercase tracking-[.14em] text-muted-foreground">{group.label}</p>
          <div className="flex flex-wrap gap-1">{group.items.map((item) => <button key={item} type="button" onClick={() => insert(item)} className="rounded-full border px-2 py-0.5 text-xs hover:border-primary/50 hover:bg-primary/10">{item}</button>)}</div>
        </div>)}
        {!shown.length && <p className="px-1 py-2 text-xs text-muted-foreground">Aucune valeur ne correspond.</p>}
      </div>
    </div>}
    {result && (result.ok
      ? <p className="text-[11px] text-muted-foreground">Exemple : <span className="font-semibold tabular-nums text-foreground">{result.value}</span></p>
      : <p className="text-[11px] text-amber-500">{result.error}</p>)}
  </div>
}

function GaugeEditor({ initial, catalogGroups, sample, formNames, onClose, onSaved }: { initial: ClassGauge; catalogGroups: Array<{ label: string; items: string[] }>; sample: FormulaValues; formNames: string[]; onClose: () => void; onSaved: () => void }) {
  const [gauge, setGauge] = useState(initial)
  // Le texte mis en forme s'enregistre en quittant son champ : « Enregistrer » lit la toute dernière version.
  const latest = useRef(gauge)
  useEffect(() => { latest.current = gauge }, [gauge])
  // Chaque seuil garde sa clé : son champ mis en forme ne passe pas à un autre quand on en retire un.
  const [thresholdKeys, setThresholdKeys] = useState(() => initial.thresholds.map(() => newSummonKey()))
  const [state, setState] = useState<GaugeState>({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const set = <K extends keyof ClassGauge>(key: K, value: ClassGauge[K]) => setGauge((current) => ({ ...current, [key]: value }))
  const withSelf = [{ label: "Cette jauge", items: ["Minimum", "Maximum"] }, ...catalogGroups]
  const resolved = resolveGauge({ ...gauge, name: gauge.name.trim() || "Nouvelle jauge" }, sample, state)

  const setThreshold = (index: number, patch: Partial<GaugeThreshold>) => setGauge((current) => ({ ...current, thresholds: current.thresholds.map((item, position) => position === index ? { ...item, ...patch } : item) }))
  function addThreshold() {
    setGauge((current) => ({ ...current, thresholds: [...current.thresholds, { value: "", label: "" }] }))
    setThresholdKeys((current) => [...current, newSummonKey()])
  }
  function removeThreshold(index: number) {
    setGauge((current) => ({ ...current, thresholds: current.thresholds.filter((_, position) => position !== index) }))
    setThresholdKeys((current) => current.filter((_, position) => position !== index))
  }

  async function save() {
    const current = latest.current
    if (!current.name.trim()) { setError("Donne un nom à la jauge."); return }
    setSaving(true); setError("")
    try { await postSpecifics({ action: "save-gauge", gauge: { ...current, name: current.name.trim() } }); onSaved() } catch (reason) { setError(reason instanceof Error ? reason.message : "La jauge n’a pas pu être enregistrée.") }
    setSaving(false)
  }

  return <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
    <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-5xl" onInteractOutside={(event) => event.preventDefault()}>
      <DialogHeader>
        <DialogTitle>{initial.id ? `Modifier la jauge « ${initial.name} »` : `Nouvelle jauge — ${initial.className}`}</DialogTitle>
        <DialogDescription>Une barre, des pastilles ou un nombre, reliés à la fiche ou tenus par le joueur. Elle s’enregistre dans l’onglet « Jauges » de « Sorts de classe ».</DialogDescription>
      </DialogHeader>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-5">
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
            <Field label="Nom"><Input autoFocus={!initial.id} value={gauge.name} onChange={(event) => set("name", event.target.value)} placeholder="Rage, Mana, Concentration…" /></Field>
            <Field label="Couleur"><div className="flex h-9 flex-wrap items-center gap-1">{gaugeColors.map((swatch) => <button key={swatch} type="button" onClick={() => set("color", swatch)} className={`size-6 rounded-full transition ${gauge.color === swatch ? "ring-2 ring-foreground ring-offset-2 ring-offset-background" : "opacity-70 hover:opacity-100"}`} style={{ backgroundColor: swatch }} aria-label={`Couleur ${swatch}`} aria-pressed={gauge.color === swatch} />)}<input type="color" value={/^#[0-9a-f]{6}$/i.test(gauge.color) ? gauge.color : "#c0392b"} onChange={(event) => set("color", event.target.value)} className="size-7 cursor-pointer rounded-full border-0 bg-transparent p-0" aria-label="Autre couleur" /></div></Field>
          </div>

          <Field label="Maximum"><Choice value={gauge.maxMode} options={gaugeMaxModes} onChange={(value) => set("maxMode", value)} />
            <FormulaField value={gauge.max} onChange={(value) => set("max", value)} groups={catalogGroups} sample={sample} ariaLabel="Maximum" placeholder={gauge.maxMode === "formule" ? "{Points de vie max}" : gauge.maxMode === "joueur" ? "Maximum de départ : 10" : "100"} />
            {gauge.maxMode === "joueur" && <p className="text-[11px] text-muted-foreground">Le maximum de départ ; le joueur le change ensuite sur sa fiche.</p>}
          </Field>

          <Field label="Valeur actuelle"><Choice value={gauge.currentMode} options={gaugeCurrentModes} onChange={(value) => set("currentMode", value)} />
            <FormulaField value={gauge.current} onChange={(value) => set("current", value)} groups={withSelf} sample={formulaValues([...sample.entries(), ["Minimum", resolved.min], ["Maximum", resolved.max]])} ariaLabel={gauge.currentMode === "formule" ? "Formule de la valeur actuelle" : "Valeur de départ"} placeholder={gauge.currentMode === "formule" ? "{Points de vie max} - {Points de vie actuels}" : "Valeur de départ : 0, ou {Maximum} pour pleine"} />
            <p className="text-[11px] text-muted-foreground">{gauge.currentMode === "formule" ? "Calculée à chaque changement de la fiche ; le joueur ne la modifie pas." : "La valeur d’un nouveau personnage, et celle du bouton de remise à zéro."}</p>
          </Field>

          {gauge.currentMode === "joueur" && <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Pas des boutons − / +"><Input type="number" min={0.01} step="any" value={gauge.step} onChange={(event) => set("step", Math.max(0.01, Number(event.target.value) || 1))} className="h-9 w-28" /></Field>
            <Field label="Remise à zéro"><label className="flex h-9 items-center gap-2 text-sm"><input type="checkbox" checked={gauge.resetButton} onChange={(event) => set("resetButton", event.target.checked)} className="size-4 accent-primary" />Un bouton remet la valeur de départ</label></Field>
          </div>}

          <Field label="Minimum" hint="0 si vide"><FormulaField value={gauge.min} onChange={(value) => set("min", value)} groups={catalogGroups} sample={sample} ariaLabel="Minimum" placeholder="0" /></Field>

          <Field label="Emplacement sur la fiche"><Choice value={gauge.placement} options={gaugePlacements} onChange={(value) => set("placement", value)} /></Field>
          <Field label="Affichage"><Choice value={gauge.display} options={gaugeDisplays} onChange={(value) => set("display", value)} /></Field>

          <Field label="Seuils" hint="des repères sur la jauge ; leur texte s’affiche au survol (facultatif)">
            <div className="space-y-2">
              {gauge.thresholds.map((threshold, index) => <div key={thresholdKeys[index]} className="space-y-1.5 rounded-xl border border-border/60 bg-background/30 p-2">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-muted-foreground">À partir de</span>
                  <Input value={threshold.value} onChange={(event) => setThreshold(index, { value: event.target.value })} placeholder="50 ou {Maximum} * 50%" aria-label="Valeur du seuil" className="h-8 w-56 font-mono text-sm" />
                  <span className="ml-auto" />
                  <Button type="button" variant="ghost" size="icon-sm" onClick={() => removeThreshold(index)} aria-label="Retirer ce seuil"><X /></Button>
                </div>
                <RichTextField value={threshold.label} onCommit={(html) => setThreshold(index, { label: html })} ariaLabel="Texte du seuil" placeholder="Frénésie : inflige 10 points de dégâts… (« { » pour citer un index)" minHeight="min-h-9" toolbar="always" />
              </div>)}
              {gauge.thresholds.length < 12 && <Button type="button" variant="ghost" size="xs" onClick={addThreshold}><Plus />Ajouter un seuil</Button>}
            </div>
          </Field>

          {(formNames.length > 0 || gauge.forms.length > 0) && <Field label="Formes" hint="la jauge ne s’affiche que dans les formes cochées (aucune : toujours)">
            <div className="flex flex-wrap gap-1.5">
              {[...new Set([...formNames, ...gauge.forms])].map((name) => {
                const on = gauge.forms.some((item) => fold(item) === fold(name))
                return <button key={name} type="button" aria-pressed={on} onClick={() => set("forms", on ? gauge.forms.filter((item) => fold(item) !== fold(name)) : [...gauge.forms, name])} className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition ${on ? "border-primary/60 bg-primary/15 text-primary" : "border-dashed text-muted-foreground hover:border-primary/40"}`}>{on ? <Check className="size-3" /> : <Layers className="size-3" />}{name}</button>
              })}
            </div>
            {gauge.forms.length > 0 && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={gauge.resetOnLeave} onChange={(event) => set("resetOnLeave", event.target.checked)} className="size-4 accent-primary" />Revenir à la valeur de départ en quittant ces formes</label>}
          </Field>}

          <Field label="Description" hint="affichée au survol sur la fiche"><RichTextField value={gauge.description} onCommit={(html) => set("description", html)} ariaLabel="Description de la jauge" placeholder="Comment elle se remplit, ce qu’elle permet… (« { » pour citer un index)" toolbar="always" /></Field>
        </div>

        <aside className="min-w-0 space-y-2 lg:sticky lg:top-0 lg:self-start">
          <p className="text-[11px] font-semibold uppercase tracking-[.16em] text-muted-foreground">Aperçu</p>
          <ClassGaugeView resolved={resolved} showErrors onCurrent={(value) => setState((current) => ({ ...current, current: value }))} onMax={(value) => setState((current) => ({ ...current, max: value }))} onReset={() => setState((current) => ({ ...current, current: undefined }))} />
          {gauge.placement === "vie" && <div><p className="mb-1 text-[10px] text-muted-foreground">Sous la barre de vie (seuil au survol) :</p><ClassGaugeView resolved={resolved} compact /></div>}
          <p className="text-[11px] leading-5 text-muted-foreground">Avec une fiche d’exemple : vie 60 / 100, niveau 5, caractéristiques et compétences à 50. Les boutons de l’aperçu se testent sans rien enregistrer.</p>
        </aside>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t pt-4">
        {error && <p className="text-sm text-destructive">{error}</p>}
        <span className="ml-auto" />
        <Button type="button" variant="ghost" onClick={onClose}>Annuler</Button>
        <Button type="button" onClick={() => void save()} disabled={saving || !gauge.name.trim()}>{saving ? <LoaderCircle className="animate-spin" /> : <Check />}Enregistrer la jauge</Button>
      </div>
    </DialogContent>
  </Dialog>
}

/* ───────────────────────────── Formes ───────────────────────────── */

/** Ce qu'un effet de forme peut viser : la vie, les caractéristiques et les compétences de l'index. */
function effectTargetGroups(catalog: CharacterCatalog) {
  const of = (kind: string) => catalog.characteristics.filter((item) => item.kind === kind && !["Classe sociale", "Alignement"].includes(item.key)).map((item) => item.name)
  return [
    { label: "Vie", items: ["Points de vie actuels"] },
    { label: "Caractéristiques principales", items: of("principale") },
    { label: "Caractéristiques secondaires", items: of("secondaire") },
    { label: "Déplacement", items: of("deplacement") },
    { label: "Compétences", items: catalog.skills.map((skill) => skill.name) },
  ].filter((group) => group.items.length)
}

let formKeyCounter = 0
const newFormKey = () => `forme-${(formKeyCounter += 1)}`

function FormGroupEditor({ initial, targetGroups, onClose, onSaved }: { initial: ClassFormGroup; targetGroups: Array<{ label: string; items: string[] }>; onClose: () => void; onSaved: () => void }) {
  const [group, setGroup] = useState(initial)
  const latest = useRef(group)
  useEffect(() => { latest.current = group }, [group])
  // Chaque forme garde sa clé : sa description mise en forme ne passe pas à une autre quand on en retire une.
  const [keys, setKeys] = useState(() => initial.forms.map(() => newFormKey()))
  const [preview, setPreview] = useState<string | undefined>(undefined)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const setForm = (index: number, patch: Partial<ClassForm>) => setGroup((current) => ({ ...current, forms: current.forms.map((form, position) => position === index ? { ...form, ...patch } : patch.isDefault ? { ...form, isDefault: false } : form) }))
  function addForm() {
    setGroup((current) => ({ ...current, forms: [...current.forms, { id: "", name: "", color: formColors[current.forms.length % formColors.length], isDefault: false, effects: [], description: "", order: current.forms.length }] }))
    setKeys((current) => [...current, newFormKey()])
  }
  function removeForm(index: number) {
    setGroup((current) => {
      const forms = current.forms.filter((_, position) => position !== index)
      if (forms.length && !forms.some((form) => form.isDefault)) forms[0] = { ...forms[0], isDefault: true }
      return { ...current, forms }
    })
    setKeys((current) => current.filter((_, position) => position !== index))
  }
  function moveForm(index: number, by: number) {
    const move = <T,>(list: T[]) => { const next = [...list]; const [item] = next.splice(index, 1); next.splice(Math.max(0, Math.min(next.length, index + by)), 0, item); return next }
    setGroup((current) => ({ ...current, forms: move(current.forms) }))
    setKeys(move)
  }
  const setEffect = (formIndex: number, effectIndex: number, patch: Partial<{ target: string; change: string }>) => setGroup((current) => ({ ...current, forms: current.forms.map((form, position) => position === formIndex ? { ...form, effects: form.effects.map((effect, at) => at === effectIndex ? { ...effect, ...patch } : effect) } : form) }))

  async function save() {
    const current = latest.current
    const named = current.forms.filter((form) => form.name.trim())
    if (named.length < 2) { setError("Il faut au moins deux formes nommées."); return }
    setSaving(true); setError("")
    try { await postSpecifics({ action: "save-form-group", group: { ...current, forms: named } }); onSaved() } catch (reason) { setError(reason instanceof Error ? reason.message : "Les formes n’ont pas pu être enregistrées.") }
    setSaving(false)
  }

  const previewGroup = { ...group, forms: group.forms.map((form, index) => ({ ...form, id: form.id || keys[index], name: form.name.trim() || `Forme ${index + 1}` })) }
  return <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
    <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-5xl" onInteractOutside={(event) => event.preventDefault()} onEscapeKeyDown={(event) => {
      const focused = document.activeElement
      if (focused?.getAttribute("role") === "combobox" && focused.getAttribute("aria-expanded") === "true") event.preventDefault()
    }}>
      <DialogHeader>
        <DialogTitle>{initial.id ? `Modifier « ${initial.name} »` : `Nouvelles formes — ${initial.className}`}</DialogTitle>
        <DialogDescription>Une seule forme est active à la fois. Ses effets changent la fiche tant qu’elle est active, sans toucher aux valeurs de base. Elles s’enregistrent dans l’onglet « Formes » de « Sorts de classe ».</DialogDescription>
      </DialogHeader>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-5">
          <Field label="Nom du groupe" hint="affiché sur la fiche"><Input autoFocus={!initial.id} value={group.name} onChange={(event) => setGroup((current) => ({ ...current, name: event.target.value }))} placeholder="Forme, Posture, Aspect…" /></Field>
          <Field label="Emplacement sur la fiche"><Choice value={group.placement} options={gaugePlacements} onChange={(value) => setGroup((current) => ({ ...current, placement: value }))} /></Field>

          <div className="space-y-3">
            {group.forms.map((form, index) => <section key={keys[index]} className="space-y-3 rounded-2xl border p-3" style={{ borderColor: `${form.color}55`, borderTop: `3px solid ${form.color}` }}>
              <div className="flex flex-wrap items-center gap-2">
                <Input value={form.name} onChange={(event) => setForm(index, { name: event.target.value })} placeholder={`Nom de la forme ${index + 1}`} aria-label={`Nom de la forme ${index + 1}`} className="h-9 min-w-40 flex-1 font-medium" />
                <div className="flex items-center gap-1">{formColors.map((swatch) => <button key={swatch} type="button" onClick={() => setForm(index, { color: swatch })} className={`size-5 rounded-full transition ${form.color === swatch ? "ring-2 ring-foreground ring-offset-2 ring-offset-background" : "opacity-70 hover:opacity-100"}`} style={{ backgroundColor: swatch }} aria-label={`Couleur ${swatch}`} aria-pressed={form.color === swatch} />)}</div>
                <label className="flex items-center gap-1.5 text-xs"><input type="radio" name={`depart-${initial.id || "nouveau"}`} checked={form.isDefault} onChange={() => setForm(index, { isDefault: true })} className="accent-primary" />Forme de départ</label>
                <Button type="button" variant="ghost" size="icon-xs" disabled={index === 0} onClick={() => moveForm(index, -1)} aria-label="Monter la forme"><span aria-hidden>↑</span></Button>
                <Button type="button" variant="ghost" size="icon-xs" disabled={index === group.forms.length - 1} onClick={() => moveForm(index, 1)} aria-label="Descendre la forme"><span aria-hidden>↓</span></Button>
                <Button type="button" variant="ghost" size="icon-xs" className="hover:text-destructive" disabled={group.forms.length <= 2} onClick={() => removeForm(index)} aria-label="Retirer la forme" title={group.forms.length <= 2 ? "Il faut au moins deux formes" : "Retirer la forme"}><X /></Button>
              </div>

              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground">Effets tant que la forme est active</p>
                {form.effects.map((effect, effectIndex) => {
                  const valid = !effect.change.trim() || Boolean(formEffectOperation(effect.change))
                  return <div key={effectIndex} className="flex items-start gap-1.5">
                    <SuggestInput className="flex-1" groups={targetGroups} value={effect.target} onChange={(target) => setEffect(index, effectIndex, { target })} placeholder="Caractéristique ou compétence" aria-label="Cible de l’effet" />
                    <div className="w-28 shrink-0"><Input value={effect.change} onChange={(event) => setEffect(index, effectIndex, { change: event.target.value })} placeholder="+10, -5, =0, ≥5" aria-label="Changement" aria-invalid={!valid} className="h-8 font-mono text-sm" />{!valid && <p className="mt-0.5 text-[10px] text-amber-500">+x, -x, =x, ≥x ou ≤x</p>}</div>
                    <Button type="button" variant="ghost" size="icon-sm" onClick={() => setGroup((current) => ({ ...current, forms: current.forms.map((item, position) => position === index ? { ...item, effects: item.effects.filter((_, at) => at !== effectIndex) } : item) }))} aria-label="Retirer l’effet"><X /></Button>
                  </div>
                })}
                <Button type="button" variant="ghost" size="xs" onClick={() => setGroup((current) => ({ ...current, forms: current.forms.map((item, position) => position === index ? { ...item, effects: [...item.effects, { target: "", change: "" }] } : item) }))}><Plus />Ajouter un effet</Button>
              </div>

              <div className="grid gap-1.5"><p className="text-xs font-medium text-muted-foreground">Description <span className="font-normal">(au survol sur la fiche)</span></p><RichTextField value={form.description} onCommit={(html) => setForm(index, { description: html })} ariaLabel={`Description de la forme ${index + 1}`} placeholder="Ce que change cette forme… (« { » pour citer un index)" minHeight="min-h-14" toolbar="always" /></div>
            </section>)}
            {group.forms.length < 12 && <Button type="button" variant="outline" size="sm" className="border-dashed" onClick={addForm}><Plus />Ajouter une forme</Button>}
          </div>
        </div>

        <aside className="min-w-0 space-y-2 lg:sticky lg:top-0 lg:self-start">
          <p className="text-[11px] font-semibold uppercase tracking-[.16em] text-muted-foreground">Aperçu</p>
          <ClassFormSwitcher group={previewGroup} chosen={preview} onChoose={(form) => setPreview(form.id)} />
          <p className="text-[11px] leading-5 text-muted-foreground">Clique sur une forme pour l’essayer ; le survol montre ses effets et sa description. Rien n’est enregistré tant que tu n’as pas cliqué sur « Enregistrer ».</p>
        </aside>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t pt-4">
        {error && <p className="text-sm text-destructive">{error}</p>}
        <span className="ml-auto" />
        <Button type="button" variant="ghost" onClick={onClose}>Annuler</Button>
        <Button type="button" onClick={() => void save()} disabled={saving}>{saving ? <LoaderCircle className="animate-spin" /> : <Check />}Enregistrer les formes</Button>
      </div>
    </DialogContent>
  </Dialog>
}
