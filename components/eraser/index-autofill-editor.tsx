"use client"

/**
 * « Remplissage automatique » d'une colonne, dans « Modifier » : la colonne d'après laquelle
 * elle se remplit, puis, pour chaque valeur de cette colonne, ce que la case reçoit, saisi avec
 * le champ du type de la colonne (un nombre, du texte, une jauge, des noms liés, des sections…).
 * Modèle : `lib/index-autofill.ts`.
 */
import { useMemo, useState } from "react"
import { LoaderCircle, Plus, Search, Wand2, X } from "lucide-react"

import { IndexField, useWorldIndexOptions } from "@/components/eraser/index-cells"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { autoFillParts, canAutoFill, canDecideAutoFill, plainCellText, type AutoFillRule, type AutoFillSettings } from "@/lib/index-autofill"
import { foldName, indexColumnKinds, type ChoiceSource, type IndexColumnSpec } from "@/lib/index-columns"

type Column = { header: string; spec: IndexColumnSpec }

/** Au-delà, la liste se cherche : une centaine de champs ouverts ralentirait la fenêtre. */
const SHOWN = 40

/** Les valeurs qu'une colonne source peut prendre : ses choix, puis celles des lignes. */
function sourceValues(source: Column, rows: string[], linked: string[]) {
  const spec = source.spec
  const values: string[] = []
  if (spec.kind === "checkbox") values.push("Oui", "Non")
  for (const option of spec.options ?? []) values.push(option.value)
  values.push(...linked)
  // Une case à plusieurs valeurs (liste multiple, noms liés…) donne chacune d'elles.
  const split = Boolean(spec.multiple) || spec.kind === "linked" || spec.kind === "index-list"
  const fromRows = rows.flatMap((value) => split ? autoFillParts(plainCellText(value)) : [plainCellText(value)]).filter(Boolean)
  // Les choix gardent leur ordre ; les valeurs des lignes viennent ensuite, rangées.
  values.push(...fromRows.sort((left, right) => left.localeCompare(right, "fr")))
  const seen = new Set<string>()
  return values.filter((value) => {
    const key = foldName(value)
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/** Le champ d'une valeur : celui du type de la colonne, sans ce qui ne vaut que dans le tableau. */
function fieldSpecOf(spec: IndexColumnSpec): IndexColumnSpec {
  const field: IndexColumnSpec = { ...spec }
  for (const key of ["autoFill", "hidden", "readOnly", "placement", "defaultValue"] as const) delete field[key]
  return field
}

export function AutoFillSettingsEditor({ header, spec, columns, valuesOf, disabled, onChange, saved, fillOnSave, onFillOnSave, onFillNow }: {
  /** La colonne réglée. */
  header: string
  spec: IndexColumnSpec
  /** Les autres colonnes de l'onglet (sources possibles). */
  columns: Column[]
  /** Les valeurs d'une colonne dans les lignes de l'onglet (une par case). */
  valuesOf?: (header: string) => string[]
  disabled: boolean
  onChange: (settings: AutoFillSettings | undefined) => void
  /** Le réglage est-il celui qui est enregistré ? (« Remplir les lignes existantes » s'en sert.) */
  saved: boolean
  /** Remplir aussi les lignes déjà là à l'enregistrement. */
  fillOnSave: boolean
  onFillOnSave: (value: boolean) => void
  /** Remplit tout de suite les lignes existantes (réglage enregistré) ; renvoie le nombre de lignes changées. */
  onFillNow?: () => Promise<number>
}) {
  const settings = spec.autoFill
  const sources = columns.filter((column) => column.header.trim() && foldName(column.header) !== foldName(header) && canDecideAutoFill(column.spec) && !/^id$/i.test(column.header.trim()))
  const source = settings ? columns.find((column) => foldName(column.header) === foldName(settings.from)) : undefined
  const [query, setQuery] = useState("")
  const [extra, setExtra] = useState("")
  const [showAll, setShowAll] = useState(false)
  const [filling, setFilling] = useState(false)
  const [fillNotice, setFillNotice] = useState("")
  // Une liste liée : tous les noms de son index, pas seulement ceux déjà choisis.
  const linkedSources = useMemo((): ChoiceSource[] => source?.spec.kind === "linked-choice" && source.spec.source ? [source.spec.source, ...(source.spec.moreSources ?? [])] : [], [source])
  const linkedOptions = useWorldIndexOptions(linkedSources)
  const rows = useMemo(() => source && valuesOf ? valuesOf(source.header) : [], [source, valuesOf])
  const values = useMemo(() => {
    if (!source) return []
    const listed = sourceValues(source, rows, (linkedOptions ?? []).map((option) => option.value))
    // Une règle dont la valeur n'apparaît plus nulle part reste visible (pour la retirer).
    const missing = (settings?.rules ?? []).map((rule) => rule.when).filter((when) => !listed.some((value) => foldName(value) === foldName(when)))
    return [...listed, ...missing]
  }, [linkedOptions, rows, settings, source])
  const colorOf = (value: string) => source?.spec.options?.find((option) => foldName(option.value) === foldName(value))?.color
  const ruleOf = (value: string) => settings?.rules.find((rule) => foldName(rule.when) === foldName(value))
  const filtered = values.filter((value) => !query.trim() || foldName(value).includes(foldName(query)))
  const shown = showAll || query.trim() ? filtered : filtered.slice(0, SHOWN)
  const fieldSpec = fieldSpecOf(spec)

  if (!canAutoFill(spec)) return null

  const setRules = (rules: AutoFillRule[]) => settings && onChange({ ...settings, rules })
  const setRule = (when: string, value: string) => {
    if (!settings) return
    const others = settings.rules.filter((rule) => foldName(rule.when) !== foldName(when))
    // Une valeur vidée retire la règle : la case n'est plus touchée pour cette valeur.
    setRules(plainCellText(value) || /<img|<hr/i.test(value) ? [...others, { when, value }] : others)
  }
  const pickSource = (from: string) => {
    if (!from) return onChange(undefined)
    // Changer de source repart de zéro : les règles d'avant parlaient d'autres valeurs.
    onChange({ from, rules: settings && foldName(settings.from) === foldName(from) ? settings.rules : [] })
  }
  const addExtra = () => {
    const when = extra.replace(/\s+/g, " ").trim()
    if (!when || !settings) return
    // La valeur rejoint la liste (à la fin), prête à être réglée ; la liste entière reste visible.
    if (!values.some((value) => foldName(value) === foldName(when))) setRules([...settings.rules, { when, value: "" }])
    setQuery("")
    setShowAll(true)
    setExtra("")
  }
  const fillNow = async () => {
    if (!onFillNow) return
    setFilling(true); setFillNotice("")
    try {
      const count = await onFillNow()
      setFillNotice(count ? `${count} ligne${count > 1 ? "s" : ""} mise${count > 1 ? "s" : ""} à jour.` : "Toutes les lignes étaient déjà à jour.")
    } catch (reason) {
      setFillNotice(reason instanceof Error ? reason.message : "Les lignes n’ont pas pu être remplies.")
    }
    setFilling(false)
  }
  const ruleCount = settings?.rules.filter((rule) => plainCellText(rule.value) || /<img|<hr/i.test(rule.value)).length ?? 0

  return <div className="grid gap-3 rounded-xl border bg-card/60 p-3">
    <div className="flex flex-wrap items-center gap-2">
      <Wand2 className="size-4 text-primary" aria-hidden="true" />
      <p className="font-semibold">Remplissage automatique</p>
      <NativeSelect value={source?.header ?? settings?.from ?? ""} disabled={disabled} onChange={(event) => pickSource(event.target.value)} className="h-8 min-w-48 text-xs" aria-label="Colonne d’après laquelle remplir">
        <NativeSelectOption value="">Non : saisie libre</NativeSelectOption>
        {settings && !source && <NativeSelectOption value={settings.from}>{settings.from} (introuvable)</NativeSelectOption>}
        {sources.map((column) => <NativeSelectOption key={column.header} value={column.header}>D’après « {column.header} »</NativeSelectOption>)}
      </NativeSelect>
    </div>
    {!settings && <p className="text-[11px] text-muted-foreground">Choisis une autre colonne de la ligne : pour chacune de ses valeurs, tu règles ce que « {header || "cette colonne"} » reçoit. La case se remplit dès que cette valeur est saisie, et reste modifiable à la main.</p>}
    {settings && <>
      <p className="text-[11px] text-muted-foreground">
        Quand « {settings.from} » change, « {header || "cette colonne"} » ({indexColumnKinds[spec.kind].label.toLowerCase()}) reçoit la valeur réglée ici. Une valeur laissée vide ne touche pas la case. Plusieurs valeurs dans la case (« Arme, Bouclier ») : la première réglée l’emporte.
      </p>
      {source && (values.length > 6 || query) && <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Chercher parmi les ${values.length} valeurs de « ${source.header} »…`} className="h-8 pl-8 text-xs" />
      </div>}
      <div className="grid max-h-[28rem] gap-1.5 overflow-y-auto pr-1">
        {source && !values.length && <p className="rounded-lg border border-dashed p-3 text-center text-xs text-muted-foreground">« {source.header} » n’a encore aucune valeur dans cet onglet : ajoute-en une ci-dessous.</p>}
        {shown.map((value) => {
          const rule = ruleOf(value)
          const color = colorOf(value)
          return <div key={foldName(value)} className={`grid items-start gap-2 rounded-lg border px-2 py-1.5 sm:grid-cols-[minmax(7rem,12rem)_minmax(0,1fr)_auto] ${rule && plainCellText(rule.value) ? "bg-primary/5" : "bg-background/40"}`}>
            <span className="flex min-h-8 items-center gap-1.5 text-xs font-semibold">
              {color && <span className="size-2.5 shrink-0 rounded-full" style={{ background: color }} aria-hidden="true" />}
              <span className="break-words">{value}</span>
              <span className="text-muted-foreground" aria-hidden="true">→</span>
            </span>
            <div className="min-w-0">
              <IndexField label={`${header} si « ${settings.from} » vaut « ${value} »`} hideLabel spec={fieldSpec} value={rule?.value ?? ""} disabled={disabled} placeholder="Ne pas toucher la case" onChange={(next) => setRule(value, next)} />
            </div>
            <Button type="button" variant="ghost" size="icon-sm" disabled={disabled || !rule} onClick={() => setRule(value, "")} aria-label={`Ne plus remplir pour « ${value} »`} title="Vider : la case n’est plus touchée pour cette valeur" className={rule ? "text-muted-foreground" : "invisible"}><X /></Button>
          </div>
        })}
        {!showAll && !query.trim() && filtered.length > SHOWN && <Button type="button" variant="link" size="sm" className="justify-self-start" onClick={() => setShowAll(true)}>Afficher les {filtered.length - SHOWN} autres valeurs</Button>}
        {query.trim() && !filtered.length && <p className="px-1 text-xs text-muted-foreground">Aucune valeur ne correspond.</p>}
      </div>
      <form className="flex gap-1" onSubmit={(event) => { event.preventDefault(); addExtra() }}>
        <Input value={extra} disabled={disabled} onChange={(event) => setExtra(event.target.value)} placeholder={`Une valeur de « ${settings.from} » pas encore utilisée…`} className="h-8 text-xs" />
        <Button type="submit" variant="outline" size="sm" disabled={disabled || !extra.trim()}><Plus />Ajouter</Button>
      </form>
      <div className="grid items-start gap-2 rounded-lg border border-dashed px-2 py-1.5 sm:grid-cols-[minmax(7rem,12rem)_minmax(0,1fr)_auto]">
        <span className="flex min-h-8 items-center text-xs font-semibold text-muted-foreground">Toute autre valeur →</span>
        <div className="min-w-0">
          <IndexField label={`${header} pour toute autre valeur de « ${settings.from} »`} hideLabel spec={fieldSpec} value={settings.otherwise ?? ""} disabled={disabled} placeholder="Ne pas toucher la case" onChange={(next) => onChange({ ...settings, otherwise: plainCellText(next) || /<img|<hr/i.test(next) ? next : undefined })} />
        </div>
        <Button type="button" variant="ghost" size="icon-sm" disabled={disabled || !settings.otherwise} onClick={() => onChange({ ...settings, otherwise: undefined })} aria-label="Ne rien mettre pour les autres valeurs" className={settings.otherwise ? "text-muted-foreground" : "invisible"}><X /></Button>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-muted-foreground">{ruleCount} valeur{ruleCount > 1 ? "s" : ""} réglée{ruleCount > 1 ? "s" : ""}{settings.otherwise ? ", et toutes les autres" : ""}.</span>
        {saved && onFillNow
          ? <Button type="button" variant="outline" size="sm" disabled={disabled || filling} onClick={() => void fillNow()} title="Écrit la valeur réglée dans chaque ligne de l’onglet (une ligne dont la valeur n’est pas réglée garde sa case)">{filling ? <LoaderCircle className="animate-spin" /> : <Wand2 />}Remplir les lignes existantes</Button>
          : !saved && <label className="flex items-center gap-2"><Checkbox checked={fillOnSave} disabled={disabled} onCheckedChange={(checked) => onFillOnSave(checked === true)} />À l’enregistrement, remplir aussi les lignes déjà là</label>}
        {fillNotice && <span className="text-muted-foreground">{fillNotice}</span>}
      </div>
    </>}
  </div>
}
