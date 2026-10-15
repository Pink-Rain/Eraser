"use client"

import { useCallback, useId, useMemo, useState, type ReactNode } from "react"
import { ChevronLeft, ChevronRight, Combine, Copy, LayoutGrid, LoaderCircle, MoreHorizontal, Pencil, Pin, PinOff, Plus, Search, TextCursorInput, Trash2, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { colorColumn, colorModeOf, FormIcon, hueOf, mini, prepareFor, rampOf, StatResult, SWATCHES, unitWord, type PickRows, type StatData } from "@/components/eraser/index-stats-charts"
import { splitListValue } from "@/lib/index-columns"
import {
  autoStatTitle, cellParts, cellText, cleanColumnGroups, cleanStat, cleanStats, columnFamilies, COMPARE_FORMS, defaultGroupName, fitForm, formProblem, GROUP_LIMITS, groupOf,
  groupRef, groupStatRows, isGroupRef, memberLabels, movePinned, newStatId, numericColumns, percentChoices, pinnedFirst, pinnedWidth, RANK_COLUMN, RANK_LABEL, STAT_LIMITS, statColumnBlocks,
  statColumnLabel, statDimensions, statForms, statMeasures, statOperators, statSlots, statWidths, suggestColumnGroups, tableTopChoices, unitRows,
  type StatColorMode, type StatColumnGroup, type StatCondition, type StatDefinition, type StatForm, type StatLeaf, type StatOperator, type StatWidth,
} from "@/lib/index-stats"

export { FormIcon }

/**
 * Les statistiques d'un index. Dans « Modifier › Stats » : la phrase à trous qui construit une
 * statistique, sa forme et ses couleurs, son aperçu en direct, les lignes concernées (chacune
 * ouvre sa fiche), les colonnes regroupées et les statistiques enregistrées. Dans un onglet stat
 * (`pinnedOnly`) : seulement les statistiques épinglées. Tout se calcule sur les lignes déjà
 * chargées : aucune lecture Google de plus.
 */
export type IndexStatsProps = {
  /** Les statistiques de l'index (épinglées ou non). */
  stats: StatDefinition[]
  /** Les colonnes regroupées de l'index (« Rareté (P+S) »). */
  groups?: StatColumnGroup[]
  /** L'onglet stat : seulement les épinglées, sans constructeur. */
  pinnedOnly?: boolean
  /** Avec `pinnedOnly` : une seule statistique, sur toute la largeur (bloc « Stat épinglée » d'une page). */
  single?: boolean
  /**
   * Avec `pinnedOnly` : les statistiques que montre cet onglet stat (dans l'ordre de l'index),
   * épinglées ou non ; absent : toutes les épinglées. Les statistiques restent toutes enregistrées.
   */
  statIds?: string[]
  /** L'onglet stat : ouvrir « Modifier › Stats ». */
  onManage?: () => void
  /** Les lignes de l'index (recherche comprise), tous onglets de données. */
  rows: string[]
  /** Les colonnes proposées dans la phrase (en-têtes réels, sans l'identifiant). */
  columns: string[]
  tabs: string[]
  valueOf: (rowKey: string, column: string) => string
  tabOf: (rowKey: string) => string
  nameOf: (rowKey: string) => string
  /** Les choix d'une colonne liste : leur ordre et leur couleur. */
  optionsOf: (column: string) => Array<{ value: string; color?: string }>
  /** Liste à choix multiple : le séparateur écrit dans la feuille (« - » pour « Forêt - Ville »). */
  separatorOf?: (column: string) => string | undefined
  /** Ouvrir la fiche d'une ligne (`rows` : les lignes concernées, pour passer de l'une à l'autre) ; absent : elles se lisent seulement. */
  onOpen?: (rowKey: string, rows?: string[]) => void
  /** Modifier les statistiques (comme modifier l'onglet) ; sinon elles se lisent seulement. */
  canEdit: boolean
  /** Enregistre les statistiques ; `groups` : les colonnes regroupées aussi (sinon elles restent). */
  onSave: (stats: StatDefinition[], groups?: StatColumnGroup[]) => Promise<void>
}

/** La colonne virtuelle « Onglet » : l'onglet d'où vient la ligne (index à plusieurs onglets). */
export const TAB_PSEUDO = "Onglet"

/* ---------- Petites pièces ---------- */

const chip = "mx-0.5 max-w-full rounded-lg border border-border bg-card px-2 py-0.5 align-middle font-sans text-sm text-foreground shadow-[inset_0_-2px_0_rgb(59_92_138_/_0.45)] [field-sizing:content] hover:border-[#3b5c8a] focus-visible:outline-2 focus-visible:outline-[#3b5c8a] disabled:opacity-60"
const dropButton = "inline-grid size-6 place-items-center rounded-md align-middle font-sans text-muted-foreground hover:bg-muted hover:text-foreground"
const twinButton = "mx-0.5 inline-flex items-center rounded-lg border border-[#3b5c8a]/70 px-2.5 py-0.5 align-middle font-sans text-[13px] leading-normal text-[#3b5c8a] hover:bg-[#3b5c8a]/10"
const sectionLabel = "text-[10.5px] font-semibold tracking-[0.14em] text-muted-foreground uppercase"
const fold = (value: string) => value.toLocaleLowerCase("fr")

function ChipSelect({ value, onChange, label, children, disabled, className = "" }: { value: string; onChange: (value: string) => void; label: string; children: ReactNode; disabled?: boolean; className?: string }) {
  return <select aria-label={label} value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} className={`${chip} ${className}`}>{children}</select>
}

/* ---------- La phrase ---------- */

type ColumnKind = "number" | "list" | "text"

const operatorsByKind: Record<ColumnKind, StatOperator[]> = {
  number: ["est", "n-est-pas", "au-moins", "au-plus", "superieur", "inferieur", "vide", "non-vide"],
  list: ["est", "n-est-pas", "au-moins", "au-plus", "contient", "ne-contient-pas", "vide", "non-vide"],
  text: ["est", "n-est-pas", "contient", "ne-contient-pas", "commence", "vide", "non-vide"],
}

type SentenceProps = {
  stat: StatDefinition
  onChange: (stat: StatDefinition) => void
  columns: string[]
  numeric: string[]
  tabs: string[]
  groups: StatColumnGroup[]
  labelOf: (column: string) => string
  orderOf: (column: string) => string[]
  kindOf: (column: string) => ColumnKind
  valuesOf: (column: string) => string[]
  isMulti: (column: string) => boolean
  slots: { size: number; used: StatColumnGroup[]; labels: string[] }
  merge: { label: string; run: () => void } | null
  split: { label: string; run: () => void } | null
  defaultLeaf: () => StatLeaf
}

/** Des options de colonnes : les colonnes, puis les colonnes regroupées (et le rang dans le groupe). */
function ColumnOptions({ current, columns, groups, labelOf, rank }: { current: string; columns: string[]; groups: StatColumnGroup[]; labelOf: (column: string) => string; rank?: boolean }) {
  const refs = groups.map((group) => groupRef(group.id))
  const known = current === "" || columns.includes(current) || refs.includes(current) || (rank && current === RANK_COLUMN)
  return <>
    {!known && <option value={current}>{labelOf(current)}</option>}
    <optgroup label="Colonnes">{columns.map((column) => <option key={column} value={column}>{column}</option>)}</optgroup>
    {(refs.length > 0 || rank) && <optgroup label="Colonnes regroupées">
      {groups.map((group) => <option key={group.id} value={groupRef(group.id)}>{group.name}</option>)}
      {rank && <option value={RANK_COLUMN}>{RANK_LABEL}</option>}
    </optgroup>}
  </>
}

/** Des conditions : reliées par « et », chacune avec ses « ou ». */
function Conditions({ list, onChange, lead, props }: { list: StatCondition[]; onChange: (list: StatCondition[]) => void; lead: string; props: SentenceProps }) {
  const id = useId()
  const { columns, groups, labelOf, orderOf, kindOf, valuesOf } = props
  const leavesOf = (condition: StatCondition): StatLeaf[] => [{ column: condition.column, operator: condition.operator, value: condition.value }, ...(condition.or ?? [])]
  const build = (leaves: StatLeaf[]): StatCondition => leaves.length > 1 ? { ...leaves[0], or: leaves.slice(1) } : { ...leaves[0] }
  const setLeaves = (index: number, leaves: StatLeaf[]) => onChange(leaves.length ? list.map((condition, at) => at === index ? build(leaves) : condition) : list.filter((_, at) => at !== index))
  return <>{list.map((condition, index) => {
    const leaves = leavesOf(condition)
    return <span key={index}>
      {" "}<b className="font-semibold">{index ? "et" : lead}</b>{" "}
      <span className={leaves.length > 1 ? "rounded-xl border border-border bg-[#3b5c8a]/5 px-1 py-0.5 [box-decoration-break:clone]" : ""}>
        {leaves.length > 1 && <span className="text-muted-foreground" aria-hidden="true">( </span>}
        {leaves.map((leaf, at) => {
          const kind = kindOf(leaf.column)
          const operators = statOperators.filter((operator) => operatorsByKind[kind].includes(operator.value) || operator.value === leaf.operator)
          const operator = statOperators.find((candidate) => candidate.value === leaf.operator)
          const order = orderOf(leaf.column)
          const listId = `${id}-${index}-${at}`
          const update = (changes: Partial<StatLeaf>) => setLeaves(index, leaves.map((entry, position) => position === at ? { ...entry, ...changes } : entry))
          return <span key={at} className="whitespace-normal">
            {at > 0 && <b className="mx-1 font-semibold text-[#3b5c8a]">ou</b>}
            <ChipSelect label="Colonne de la condition" value={leaf.column} onChange={(column) => { const next = kindOf(column); update({ column, operator: next === "number" ? "au-moins" : "est", value: orderOf(column)[0] ?? "" }) }}><ColumnOptions current={leaf.column} columns={columns} groups={groups} labelOf={labelOf} /></ChipSelect>
            <ChipSelect label="Comparaison" value={leaf.operator} onChange={(value) => update({ operator: value as StatOperator, ...(!leaf.value && order.length ? { value: order[0] } : {}) })}>{operators.map((candidate) => <option key={candidate.value} value={candidate.value}>{candidate.label}</option>)}</ChipSelect>
            {operator?.needsValue !== false && (order.length
              ? <ChipSelect label="Valeur" value={leaf.value} onChange={(value) => update({ value })}>{(() => { const choices = [...order, ...valuesOf(leaf.column).filter((value) => !order.some((entry) => fold(entry) === fold(value)))]; return <>{!choices.some((value) => fold(value) === fold(leaf.value)) && <option value={leaf.value}>{leaf.value || "valeur…"}</option>}{choices.map((value) => <option key={value} value={value}>{value}</option>)}</> })()}</ChipSelect>
              : <><input aria-label="Valeur" list={listId} value={leaf.value} onChange={(event) => update({ value: event.target.value })} className={`${chip} w-28 sm:w-32`} placeholder="valeur" inputMode={kind === "number" ? "decimal" : undefined} /><datalist id={listId}>{valuesOf(leaf.column).map((value) => <option key={value} value={value} />)}</datalist></>)}
            <button type="button" className={dropButton} aria-label="Retirer cette condition" onClick={() => setLeaves(index, leaves.filter((_, position) => position !== at))}><X className="size-3.5" /></button>
          </span>
        })}
        {leaves.length < STAT_LIMITS.or + 1 && <button type="button" className={mini} onClick={() => setLeaves(index, [...leaves, { ...leaves[leaves.length - 1] }])} aria-label="Ajouter une condition « ou »">+ ou</button>}
        {leaves.length > 1 && <span className="text-muted-foreground" aria-hidden="true"> )</span>}
      </span>
    </span>
  })}</>
}

function Sentence(props: SentenceProps) {
  const { stat, onChange, columns, numeric, tabs, groups, labelOf, isMulti, slots, merge, split, defaultLeaf } = props
  const set = (changes: Partial<StatDefinition>) => onChange({ ...stat, ...changes })
  const where = stat.where ?? []
  const blocks = statColumnBlocks(stat)
  const dims = statDimensions(stat)
  const used = new Set(dims)
  const pool = [...columns, ...groups.map((group) => groupRef(group.id))]
  const free = pool.filter((column) => !used.has(column))
  // La prochaine colonne proposée : une liste (ses choix) plutôt qu'un nombre ou un nom.
  const nextColumn = () => free.find((column) => props.orderOf(column).length > 1) ?? free.find((column) => !numeric.includes(column) && !/^nom$/i.test(column)) ?? free[0]
  const groupInDims = dims.some((column) => isGroupRef(column))
  const setBlocks = (next: string[][]) => { const clean = next.filter((block) => block.length); set({ cols: clean[0] ?? [], blocks: clean.slice(1) }) }
  const percents = percentChoices(stat)
  const canCompare = COMPARE_FORMS.includes(stat.form)
  const levelChoices = (current: string) => <ColumnOptions current={current} columns={columns.filter((column) => column === current || !used.has(column))} groups={groups.filter((group) => groupRef(group.id) === current || !used.has(groupRef(group.id)))} labelOf={labelOf} rank={(groupInDims && (!used.has(RANK_COLUMN) || current === RANK_COLUMN)) || current === RANK_COLUMN} />
  const multi = dims.some((column) => isMulti(column))
  const twin = (merge || split) && <>{merge && <button type="button" className={twinButton} onClick={merge.run}>{merge.label}</button>}{split && <button type="button" className={twinButton} onClick={split.run}>{split.label}</button>}</>
  const subject = slots.size ? "emplacements" : "lignes"
  return <div className="font-display text-[16px] leading-[2.1] [overflow-wrap:anywhere] sm:text-lg sm:leading-[2.15]">
    <p>
      <ChipSelect label="Mesure" value={stat.measure} onChange={(value) => { const measure = value as StatDefinition["measure"]; set(measure === "count" ? { measure, field: undefined } : { measure, field: stat.field && numeric.includes(stat.field) ? stat.field : numeric[0] }) }}>
        {statMeasures.map((measure) => <option key={measure.value} value={measure.value} disabled={measure.numeric && !numeric.length}>{measure.label}</option>)}
      </ChipSelect>
      {stat.measure !== "count" && <ChipSelect label="Colonne mesurée" value={stat.field ?? ""} onChange={(field) => set({ field })}>{numeric.map((column) => <option key={column} value={column}>{column}</option>)}</ChipSelect>}
      {" "}<b className="font-semibold" title={slots.size ? "Une ligne compte une fois par colonne remplie du groupe" : undefined}>les {subject}</b>{" "}
      {tabs.length > 1 && <ChipSelect label="Lignes de" value={stat.source ?? ""} onChange={(source) => set({ source: source || undefined })}>
        <option value="">de tout l’index</option>
        {tabs.map((tab) => <option key={tab} value={tab}>de l’onglet {tab}</option>)}
      </ChipSelect>}
      <Conditions list={where} onChange={(list) => set({ where: list })} lead="où" props={props} />
      {" "}{where.length < STAT_LIMITS.conditions && <button type="button" className={mini} onClick={() => set({ where: [...where, defaultLeaf()] })}>+ condition</button>}
    </p>
    <p>
      <b className="font-semibold">{blocks.length ? "en lignes" : "réparties par"}</b>{" "}
      {stat.by.length
        ? <>{stat.by.map((column, index) => <span key={`by:${index}`} className="whitespace-nowrap">
            {index > 0 && <b className="mx-1 font-normal text-muted-foreground">›</b>}
            <ChipSelect label={`Niveau ${index + 1} des lignes`} value={column} onChange={(value) => set({ by: stat.by.map((entry, at) => at === index ? value : entry) })}>{levelChoices(column)}</ChipSelect>
            <button type="button" className={dropButton} aria-label="Retirer ce niveau" onClick={() => set({ by: stat.by.filter((_, at) => at !== index), ...(stat.by.length === 1 ? { cols: [], blocks: [] } : {}) })}><X className="size-3.5" /></button>
          </span>)}
          {stat.by.length < STAT_LIMITS.levels && free.length > 0 && <button type="button" className={mini} onClick={() => set({ by: [...stat.by, nextColumn()] })}>+ niveau</button>}
          {!blocks.length && free.length > 0 && <button type="button" className={mini} onClick={() => set({ cols: [nextColumn()], form: stat.form === "table" ? "table" : "cross" })}>+ en colonnes</button>}
          {!blocks.length && twin}</>
        : <ChipSelect label="Réparties par" value="" onChange={(column) => set({ by: column ? [column] : [] })}><option value="">rien</option><ColumnOptions current="" columns={columns} groups={groups} labelOf={labelOf} /></ChipSelect>}
    </p>
    {blocks.length > 0 && <p>
      <b className="font-semibold">en colonnes</b>{" "}
      {blocks.map((block, blockIndex) => <span key={`block:${blockIndex}`}>
        {blockIndex > 0 && <> <b className="font-semibold">et à côté</b> </>}
        <span className={blocks.length > 1 ? "rounded-xl border border-dashed border-border px-1 py-0.5 [box-decoration-break:clone]" : ""} aria-label={blocks.length > 1 ? `Bloc de colonnes ${blockIndex + 1}` : undefined}>
          {block.map((column, index) => <span key={`${blockIndex}:${index}`} className="whitespace-nowrap">
            {index > 0 && <b className="mx-1 font-normal text-muted-foreground">›</b>}
            <ChipSelect label={blocks.length > 1 ? `Bloc ${blockIndex + 1}, niveau ${index + 1}` : `Niveau ${index + 1} des colonnes`} value={column} onChange={(value) => setBlocks(blocks.map((entry, at) => at === blockIndex ? entry.map((item, position) => position === index ? value : item) : entry))}>{levelChoices(column)}</ChipSelect>
            <button type="button" className={dropButton} aria-label="Retirer ce niveau de colonnes" onClick={() => setBlocks(blocks.map((entry, at) => at === blockIndex ? entry.filter((_, position) => position !== index) : entry))}><X className="size-3.5" /></button>
          </span>)}
          {block.length < STAT_LIMITS.columnLevels && free.length > 0 && <button type="button" className={mini} onClick={() => setBlocks(blocks.map((entry, at) => at === blockIndex ? [...entry, nextColumn()] : entry))}>+ niveau</button>}
        </span>
      </span>)}
      {" "}{blocks.length < STAT_LIMITS.blocks && free.length > 0 && <button type="button" className={mini} title="Un autre groupe de colonnes, posé à côté (Tableau à niveaux)" onClick={() => onChange({ ...stat, cols: blocks[0], blocks: [...blocks.slice(1), [nextColumn()]], form: "table" })}>+ bloc de colonnes</button>}
      {stat.top !== undefined && stat.form !== "ranking" && <span className="font-sans text-[13px] whitespace-nowrap text-muted-foreground"> · <ChipSelect label="Valeurs gardées par niveau de colonnes" value={String(stat.top)} onChange={(value) => set({ top: Number(value) })}>{tableTopChoices.map((choice) => <option key={choice} value={choice}>{choice ? `les ${choice}` : "toutes les"}</option>)}</ChipSelect> valeurs les plus fréquentes</span>}
      {twin}
    </p>}
    {(multi || groupInDims) && <div className="grid gap-0.5 py-1 font-sans text-[13px] leading-snug text-muted-foreground">
      {multi && <label className="inline-flex items-center gap-2"><input type="checkbox" checked={!stat.joined} onChange={(event) => set({ joined: event.target.checked ? undefined : true })} />une ligne à plusieurs valeurs compte dans chacune</label>}
      {groupInDims && <label className="inline-flex items-center gap-2"><input type="checkbox" checked={Boolean(stat.once)} onChange={(event) => set({ once: event.target.checked ? true : undefined })} />compter chaque ligne une seule fois par valeur</label>}
      {slots.size > 0 && <p className="max-w-prose">
        {slots.used.map((group) => `« ${group.name} »`).join(" et ")} : chaque ligne compte une fois par colonne remplie du groupe ({slots.used[0].columns.join(", ")}) — on compte des <b className="font-semibold text-foreground">emplacements</b>, pas des lignes.
        {slots.used.length > 1 && ` Les groupes s’alignent rang par rang : ${slots.labels.map((label) => `${label} avec ${label}`).join(", ")}.`}
      </p>}
    </div>}
    {(canCompare || percents.length > 1) && <p>
      {canCompare && <><b className="font-semibold">comparé à</b>{" "}
        <ChipSelect label="Comparer à" value={stat.compare ?? "none"} onChange={(value) => set(value === "none" ? { compare: undefined, compareWhere: undefined } : value === "rest" ? { compare: "rest", compareWhere: undefined } : { compare: "filter", compareWhere: stat.compareWhere?.length ? stat.compareWhere : [defaultLeaf()] })}>
          <option value="none">rien</option>
          <option value="rest">le reste de l’index</option>
          <option value="filter">d’autres lignes…</option>
        </ChipSelect>
        {stat.compare === "filter" && <><Conditions list={stat.compareWhere ?? []} onChange={(list) => set({ compareWhere: list, ...(list.length ? {} : { compare: undefined }) })} lead="où" props={props} />{" "}{(stat.compareWhere?.length ?? 0) < STAT_LIMITS.conditions && <button type="button" className={mini} onClick={() => set({ compareWhere: [...(stat.compareWhere ?? []), defaultLeaf()] })}>+ condition</button>}</>}
      </>}
      {canCompare && percents.length > 1 && <span className="text-muted-foreground"> · </span>}
      {percents.length > 1 && <><b className="font-semibold">afficher</b>{" "}<ChipSelect label="Afficher" value={stat.percent ?? "none"} onChange={(value) => set({ percent: value as StatDefinition["percent"] })}>{percents.map((choice) => <option key={choice.value} value={choice.value}>{choice.label}</option>)}</ChipSelect></>}
    </p>}
  </div>
}

/* ---------- Couleurs ---------- */

function Swatches({ current, onPick, label }: { current: string; onPick: (hex: string) => void; label: string }) {
  return <span className="inline-flex flex-wrap items-center gap-1.5" role="group" aria-label={label}>
    {SWATCHES.map(([name, hex]) => <button key={hex} type="button" aria-pressed={current === hex} aria-label={`${name} ${hex}`} title={`${name} ${hex}`} onClick={() => onPick(hex)} className={`size-[18px] rounded-full border-2 border-card ${current === hex ? "shadow-[0_0_0_2px_var(--foreground)]" : "shadow-[0_0_0_1px_var(--border)]"}`} style={{ backgroundColor: hex }} />)}
    <label className="inline-flex items-center" title="Une couleur libre"><span className="sr-only">Couleur libre</span><input type="color" value={current || "#3b5c8a"} onChange={(event) => onPick(event.target.value)} className="h-5 w-7 cursor-pointer rounded border bg-card p-px" /></label>
  </span>
}

function ColorControls({ stat, onChange }: { stat: StatDefinition; onChange: (stat: StatDefinition) => void }) {
  const table = stat.form === "table" || stat.form === "cross"
  const colors = stat.colors ?? {}
  if (table) return <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Couleurs"><span className={sectionLabel}>Dégradé</span><Swatches label="Teinte du dégradé" current={rampOf(stat)} onPick={(ramp) => onChange({ ...stat, colors: { ...colors, ramp } })} /></div>
  const byValue = Boolean(colorColumn(stat)) && !(COMPARE_FORMS.includes(stat.form) && stat.compare)
  const mode = byValue ? colorModeOf(stat) : "hue"
  const modes: Array<[StatColorMode, string]> = byValue ? [["column", "de la colonne"], ["hue", "une teinte"], ["value", "par valeur"]] : []
  return <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Couleurs">
    <span className={sectionLabel}>Couleurs</span>
    {modes.length > 0 && <span className="inline-flex rounded-lg border bg-background p-0.5" role="group" aria-label="Mode de couleur">
      {modes.map(([value, label]) => <button key={value} type="button" aria-pressed={mode === value} onClick={() => onChange({ ...stat, colors: { ...colors, mode: value } })} className={`rounded-md px-2 py-0.5 text-xs ${mode === value ? "bg-card font-semibold text-foreground shadow-[0_0_0_1px_var(--border)]" : "text-muted-foreground"}`}>{label}</button>)}
    </span>}
    {mode === "hue" && <Swatches label="Teinte" current={hueOf(stat)} onPick={(hue) => onChange({ ...stat, colors: { ...colors, hue, ...(byValue ? { mode: "hue" as const } : {}) } })} />}
    {mode === "value" && <span className="text-xs text-muted-foreground">clic sur une pastille de la légende</span>}
  </div>
}

/* ---------- Les colonnes regroupées ---------- */

function GroupsPanel({ groups, columns, canEdit, pending, usage, onSave }: { groups: StatColumnGroup[]; columns: string[]; canEdit: boolean; pending: boolean; usage: (group: StatColumnGroup) => number; onSave: (groups: StatColumnGroup[], message: string, undo?: StatColumnGroup[]) => void }) {
  const [editing, setEditing] = useState<{ id: string | null; name: string; columns: string[] } | null>(null)
  const suggestions = suggestColumnGroups(columns, groups)
  const save = () => {
    if (!editing || editing.columns.length < 2) return
    const name = editing.name.replace(/\s+/g, " ").trim() || defaultGroupName(editing.columns)
    const next = editing.id ? groups.map((group) => group.id === editing.id ? { ...group, name, columns: editing.columns } : group) : [...groups, { id: newStatId(groups, Math.random, "g"), name, columns: editing.columns }]
    onSave(next, editing.id ? `Groupe « ${name} » modifié.` : `Colonnes regroupées : « ${name} ».`)
    setEditing(null)
  }
  const toggle = (column: string) => setEditing((current) => current && { ...current, columns: current.columns.includes(column) ? current.columns.filter((entry) => entry !== column) : current.columns.length < GROUP_LIMITS.columns ? [...current.columns, column] : current.columns })
  return <div className="grid gap-2.5 rounded-xl border border-dashed border-border bg-card/60 p-3 text-sm">
    <p className="text-xs text-muted-foreground">Des colonnes regardées comme une seule : « Rareté (P+S) » compte la rareté principale <em>et</em> la secondaire. Elles se choisissent partout dans la phrase, sous « Colonnes regroupées ».</p>
    {groups.length > 0 && <ul className="grid gap-1.5" aria-label="Colonnes regroupées">
      {groups.map((group) => <li key={group.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-border/60 bg-card px-2.5 py-1.5">
        <Combine className="size-3.5 shrink-0 text-[#3b5c8a]" aria-hidden="true" />
        <span className="font-semibold">{group.name}</span>
        <span className="flex min-w-0 flex-1 flex-wrap gap-1">{group.columns.map((column) => <span key={column} className="rounded-full border border-border bg-muted/60 px-2 text-xs">{column}</span>)}</span>
        {usage(group) > 0 && <span className="text-xs text-muted-foreground">{usage(group)} stat{usage(group) > 1 ? "s" : ""}</span>}
        {canEdit && <span className="flex gap-1">
          <button type="button" className={dropButton} disabled={pending} aria-label={`Modifier le groupe « ${group.name} »`} title="Modifier" onClick={() => setEditing({ id: group.id, name: group.name, columns: group.columns })}><Pencil className="size-3.5" /></button>
          <button type="button" className={`${dropButton} hover:text-destructive`} disabled={pending} aria-label={`Supprimer le groupe « ${group.name} »`} title="Supprimer" onClick={() => onSave(groups.filter((entry) => entry.id !== group.id), `Groupe « ${group.name} » supprimé${usage(group) ? ` : ${usage(group)} statistique${usage(group) > 1 ? "s l’utilisent" : " l’utilise"} encore` : ""}.`, groups)}><Trash2 className="size-3.5" /></button>
        </span>}
      </li>)}
    </ul>}
    {canEdit && suggestions.length > 0 && <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-xs text-muted-foreground">Proposés :</span>
      {suggestions.map((family) => <button key={family.name} type="button" disabled={pending} className={twinButton} onClick={() => onSave([...groups, { id: newStatId(groups, Math.random, "g"), name: family.name, columns: family.columns }], `Colonnes regroupées : « ${family.name} ».`)}>Regrouper {family.columns.join(" + ")}</button>)}
    </div>}
    {canEdit && !editing && groups.length < GROUP_LIMITS.groups && <div><button type="button" className={mini} onClick={() => setEditing({ id: null, name: "", columns: [] })}>+ Regrouper des colonnes…</button></div>}
    {editing && <div className="grid gap-2 rounded-lg border bg-background p-2.5">
      <label className="grid gap-1 text-xs font-semibold">Nom du groupe<input value={editing.name} maxLength={GROUP_LIMITS.name} onChange={(event) => setEditing({ ...editing, name: event.target.value })} placeholder={editing.columns.length >= 2 ? defaultGroupName(editing.columns) : "Rareté (P+S)"} className="rounded-lg border bg-card px-2 py-1 text-sm font-normal" onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); save() } else if (event.key === "Escape") { event.preventDefault(); setEditing(null) } }} /></label>
      <fieldset className="grid gap-1">
        <legend className="text-xs font-semibold">Colonnes, dans l’ordre (2 à {GROUP_LIMITS.columns})</legend>
        <div className="flex max-h-40 flex-wrap gap-1 overflow-auto">{columns.map((column) => { const at = editing.columns.indexOf(column); return <button key={column} type="button" aria-pressed={at >= 0} onClick={() => toggle(column)} className={`rounded-full border px-2 py-0.5 text-xs ${at >= 0 ? "border-[#3b5c8a] bg-[#3b5c8a]/10 font-semibold" : "hover:bg-muted"}`}>{at >= 0 && <span className="mr-1 tabular-nums text-[#3b5c8a]">{at + 1}.</span>}{column}</button> })}</div>
      </fieldset>
      <div className="flex flex-wrap items-center gap-1.5">
        <Button type="button" size="sm" disabled={editing.columns.length < 2 || pending} onClick={save}>{editing.id ? "Enregistrer le groupe" : "Créer le groupe"}</Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(null)}>Annuler</Button>
        {editing.columns.length >= 2 && <span className="text-xs text-muted-foreground">Rangs : {memberLabels(editing.columns).join(" · ")}</span>}
      </div>
    </div>}
  </div>
}

/* ---------- L'onglet ---------- */

// La phrase seule (sans nom ni épingle), dans l'ordre que lui donne le nettoyage : deux réglages égaux s'écrivent pareil.
const comparable = (stat: StatDefinition) => JSON.stringify(cleanStat({ ...stat, id: "x", title: "x", pinned: false, width: undefined, rows: undefined }))

function startStat(columns: string[], orderOf: (column: string) => string[], numeric: string[]): StatDefinition {
  // Une première colonne à répartir : une liste (ses choix), sinon Type, sinon la première qui n'est pas un nombre.
  const column = columns.find((candidate) => orderOf(candidate).length > 1) ?? columns.find((candidate) => /^(type|catégorie|categorie)$/i.test(candidate)) ?? columns.find((candidate) => !numeric.includes(candidate) && !/^nom$/i.test(candidate)) ?? columns[0]
  return fitForm({ id: "", title: "", measure: "count", by: column ? [column] : [], form: "bars" })
}

type Toast = { text: string; action?: { label: string; run: () => void } }

/**
 * « Lignes concernées » : les lignes que compte une statistique, ou celles de la part cliquée
 * dans son graphique. Chacune ouvre sa fiche ; la fiche passe ensuite de l'une à l'autre.
 */
function ConcernedRows({ rows, label, extra, onReset, metaOf, nameOf, onOpen, max = 300, className = "max-h-60" }: { rows: string[]; label: string; extra?: string; onReset?: () => void; metaOf: (row: string) => string; nameOf: (row: string) => string; onOpen?: (rowKey: string, rows?: string[]) => void; max?: number; className?: string }) {
  return <div className="grid gap-2">
    <div className="flex flex-wrap items-center gap-2">
      <span className={sectionLabel}>Lignes concernées</span>
      <span className="max-w-full rounded-full bg-muted px-2.5 py-0.5 text-xs [overflow-wrap:anywhere]">{label} · {rows.length}{extra ?? ""}</span>
      {onReset && <button type="button" className={mini} onClick={onReset}>Toutes</button>}
    </div>
    <ul className={`grid grid-cols-[repeat(auto-fill,minmax(min(15rem,100%),1fr))] gap-1.5 overflow-auto pr-0.5 ${className}`}>
      {rows.slice(0, max).map((row) => {
        const meta = metaOf(row)
        const body = <><span className="min-w-0"><span className="block truncate font-semibold">{nameOf(row) || "Sans nom"}</span>{meta && <span className="block truncate text-xs text-muted-foreground">{meta}</span>}</span>{onOpen && <span className="text-muted-foreground" aria-hidden="true">›</span>}</>
        return <li key={row}>{onOpen
          ? <button type="button" onClick={() => onOpen(row, rows)} aria-haspopup="dialog" className="flex w-full min-w-0 items-center justify-between gap-2 rounded-lg border border-border/60 bg-card px-2.5 py-1 text-left text-[13px] hover:bg-muted focus-visible:outline-2 focus-visible:outline-[#3b5c8a]" title={`Ouvrir la fiche de « ${nameOf(row) || "Sans nom"} »`}>{body}</button>
          : <div className="flex w-full min-w-0 items-center justify-between gap-2 rounded-lg border border-border/60 bg-card px-2.5 py-1 text-[13px]">{body}</div>}</li>
      })}
      {!rows.length && <li className="text-sm text-muted-foreground">Aucune ligne.</li>}
    </ul>
    {rows.length > max && <p className="text-xs text-muted-foreground">… et {rows.length - max} autres lignes.</p>}
  </div>
}

/** La place d'une épinglée sur la grille de six colonnes (une seule colonne sur un écran étroit). */
const widthClass: Record<StatWidth, string> = {
  third: "md:col-span-3 lg:col-span-2",
  half: "md:col-span-3",
  "two-thirds": "md:col-span-6 lg:col-span-4",
  full: "md:col-span-6",
}

type Arrange = { pending: boolean; first: boolean; last: boolean; onWidth: (width: StatWidth | null) => void; onRows: (rows: StatDefinition["rows"] | null) => void; onMove?: (step: -1 | 1) => void; onUnpin?: () => void }

const seg = "rounded-md px-2 py-0.5 text-xs aria-pressed:bg-card aria-pressed:font-semibold aria-pressed:text-foreground aria-pressed:shadow-[0_0_0_1px_var(--border)] text-muted-foreground hover:text-foreground disabled:opacity-50"

/** « Organiser » : la largeur, la place et les lignes d'une épinglée. */
function ArrangeBar({ stat, arrange }: { stat: StatDefinition; arrange: Arrange }) {
  const auto = pinnedWidth({ form: stat.form })
  return <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl border border-dashed border-[#3b5c8a]/50 bg-[#3b5c8a]/5 px-2 py-1.5">
    <span className="inline-flex items-center rounded-lg bg-muted/70 p-0.5" role="group" aria-label="Largeur">
      <button type="button" className={seg} aria-pressed={!stat.width} disabled={arrange.pending} onClick={() => arrange.onWidth(null)} title={`Selon sa forme (${statWidths.find((width) => width.value === auto)?.label})`}>Auto</button>
      {statWidths.map((width) => <button key={width.value} type="button" className={seg} aria-pressed={stat.width === width.value} disabled={arrange.pending} onClick={() => arrange.onWidth(width.value)} title={width.value === "full" ? "Toute la ligne" : `${width.label} de la ligne`}>{width.label}</button>)}
    </span>
    <span className="inline-flex items-center rounded-lg bg-muted/70 p-0.5" role="group" aria-label="Lignes concernées">
      {([[null, "Lignes"], ["folded", "Repliées"], ["hidden", "Sans lignes"]] as const).map(([value, label]) => <button key={label} type="button" className={seg} aria-pressed={(stat.rows ?? null) === value} disabled={arrange.pending} onClick={() => arrange.onRows(value)}>{label}</button>)}
    </span>
    <span className="ml-auto inline-flex items-center gap-0.5">
      {arrange.onMove && <button type="button" className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40" disabled={arrange.pending || arrange.first} onClick={() => arrange.onMove?.(-1)} aria-label="Avancer" title="Avancer"><ChevronLeft className="size-4" /></button>}
      {arrange.onMove && <button type="button" className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40" disabled={arrange.pending || arrange.last} onClick={() => arrange.onMove?.(1)} aria-label="Reculer" title="Reculer"><ChevronRight className="size-4" /></button>}
      {arrange.onUnpin && <button type="button" className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40" disabled={arrange.pending} onClick={arrange.onUnpin} aria-label="Ne plus épingler" title="Ne plus épingler"><PinOff className="size-4" /></button>}
    </span>
  </div>
}

/**
 * Une statistique épinglée, dans l'onglet stat : son graphique, dont chaque part se clique,
 * et ses lignes concernées en dessous (affichées, repliées ou masquées : « Organiser »).
 */
function PinnedStat({ stat, data, expanded, onToggle, tabs, tabOf, nameOf, onOpen, arrange, full = false }: { full?: boolean; stat: StatDefinition; data: StatData; expanded: Set<string>; onToggle: (key: string) => void; tabs: string[]; tabOf: (rowKey: string) => string; nameOf: (rowKey: string) => string; onOpen?: (rowKey: string, rows?: string[]) => void; arrange?: Arrange }) {
  const prepared = useMemo(() => prepareFor(stat, data), [data, stat])
  const [picked, setPicked] = useState<{ label: string; rows: string[]; id: string } | null>(null)
  const [unfolded, setUnfolded] = useState<boolean | null>(null)
  const open = unfolded ?? stat.rows !== "folded"
  const withRows = stat.rows !== "hidden"
  const concerned = picked?.rows ?? unitRows(prepared.units)
  const slots = prepared.size
  const width = full ? "full" : pinnedWidth(stat)
  const metaOf = (row: string) => [tabs.length > 1 ? tabOf(row) : "", stat.by[0] ? cellText(prepared.valueOf({ row, slot: -1 }, stat.by[0])) : ""].filter(Boolean).join(" · ")
  return <article className={`grid min-w-0 content-start gap-2.5 rounded-2xl border bg-card p-4 ${widthClass[width]} ${arrange ? "border-[#3b5c8a]/60" : ""}`}>
    <span className="flex min-w-0 items-center gap-1.5 text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase"><Pin className="size-3 shrink-0 text-[#a87a1f]" /><span className="truncate">{stat.title}</span></span>
    {arrange && <ArrangeBar stat={stat} arrange={arrange} />}
    <StatResult stat={stat} data={data} prepared={prepared} expanded={expanded} onToggle={onToggle} onPick={withRows ? (label, rows, id) => { setPicked((current) => current?.id === id ? null : { label, rows, id }); setUnfolded(true) } : undefined} picked={picked?.id} />
    {withRows && <div className="grid gap-2 border-t border-border/60 pt-2.5">
      {open && <ConcernedRows rows={concerned} label={picked?.label ?? (stat.where?.length ? "Lignes retenues" : "Toutes les lignes")} extra={!picked && slots ? ` (${prepared.units.length.toLocaleString("fr-FR")} ${unitWord(slots, prepared.units.length)})` : ""} onReset={picked ? () => setPicked(null) : undefined} metaOf={metaOf} nameOf={nameOf} onOpen={onOpen} max={200} className="max-h-56" />}
      <button type="button" aria-expanded={open} onClick={() => setUnfolded(!open)} className="justify-self-start text-xs text-muted-foreground hover:text-foreground">{open ? "Replier les lignes" : `Voir les ${concerned.length.toLocaleString("fr-FR")} lignes concernées${picked ? ` (${picked.label})` : ""}`}</button>
    </div>}
  </article>
}

export function IndexStats({ stats, groups: groupsProp, pinnedOnly = false, single = false, statIds, onManage, rows, columns, tabs, valueOf, tabOf, nameOf, optionsOf, separatorOf, onOpen, canEdit, onSave }: IndexStatsProps) {
  // Un groupe créé ou modifié se voit tout de suite, avant même la réponse du serveur.
  const [pendingGroups, setPendingGroups] = useState<StatColumnGroup[] | null>(null)
  const groups = useMemo(() => pendingGroups ?? groupsProp ?? [], [groupsProp, pendingGroups])
  const ordered = useMemo(() => pinnedFirst(stats), [stats])
  // « Forêt - Ville » (listes séparées par un tiret) se lit comme « Forêt, Ville ».
  const dashed = useMemo(() => new Map(columns.filter((column) => separatorOf?.(column)?.trim() === "-").map((column) => [column, optionsOf(column)])), [columns, optionsOf, separatorOf])
  const readValue = useCallback((rowKey: string, column: string) => {
    const raw = valueOf(rowKey, column)
    const options = dashed.get(column)
    return options && raw ? splitListValue(cellText(raw), options, "-").join(", ") : raw
  }, [dashed, valueOf])
  const numeric = useMemo(() => numericColumns(columns, rows, readValue), [columns, readValue, rows])
  const orderOf = useCallback((column: string) => column === TAB_PSEUDO && tabs.length > 1 && !optionsOf(column).length ? tabs : optionsOf(column).map((option) => option.value), [optionsOf, tabs])
  const labelOf = useCallback((column: string) => statColumnLabel(groups, column), [groups])
  const data = useMemo<StatData>(() => ({
    rows, valueOf: readValue, tabOf, nameOf, groups, numeric, labelOf, orderOf,
    colorOf: (column, value) => optionsOf(column).find((option) => option.value.toLocaleLowerCase("fr") === value.toLocaleLowerCase("fr"))?.color,
  }), [groups, labelOf, nameOf, numeric, optionsOf, orderOf, readValue, rows, tabOf])
  const [editing, setEditing] = useState<string | null>(() => ordered[0]?.id ?? null)
  const [draft, setDraft] = useState<StatDefinition>(() => ordered[0] ?? startStat(columns, orderOf, numeric))
  const [title, setTitle] = useState(() => ordered[0]?.title ?? "")
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())
  const [selection, setSelection] = useState<{ label: string; rows: string[]; id: string; draft: string } | null>(null)
  const [libFilter, setLibFilter] = useState<"all" | "pinned">("all")
  const [libQuery, setLibQuery] = useState("")
  const [renaming, setRenaming] = useState<{ id: string; value: string } | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState("")
  const [formHint, setFormHint] = useState("")
  const [allForms, setAllForms] = useState(false)
  const [groupsOpen, setGroupsOpen] = useState(false)
  const [toast, setToast] = useState<Toast | null>(null)
  const [arranging, setArranging] = useState(false)

  const saved = editing ? stats.find((stat) => stat.id === editing) ?? null : null
  const shownTitle = title.trim() || autoStatTitle(draft, labelOf)
  const dirty = !saved || comparable(saved) !== comparable(draft) || saved.title !== shownTitle
  const draftKey = comparable(draft)
  const picked = selection && selection.draft === draftKey ? selection : null
  const prepared = useMemo(() => prepareFor(draft, data), [data, draft])
  const slots = useMemo(() => statSlots(draft, groups), [draft, groups])
  const context = { slots: slots.size > 0, numeric: numeric.length, distinct: draft.by[0] ? groupStatRows(prepared.units, prepared.valueOf, draft.by[0], { whole: Boolean(draft.joined) }).length : undefined }

  // Les valeurs proposées dans les conditions : celles des colonnes qu'elles visent (un groupe : toutes ses colonnes).
  const conditionColumns = [...(draft.where ?? []), ...(draft.compareWhere ?? [])].flatMap((condition) => [condition.column, ...(condition.or ?? []).map((leaf) => leaf.column)]).join("\u001f")
  const conditionValues = useMemo(() => new Map(conditionColumns.split("\u001f").filter(Boolean).map((column) => {
    const seen = new Map<string, string>()
    const members = groupOf(groups, column)?.columns ?? [column]
    for (const row of rows) for (const member of members) for (const value of cellParts(readValue(row, member))) if (!seen.has(value.toLocaleLowerCase("fr"))) seen.set(value.toLocaleLowerCase("fr"), value)
    return [column, [...seen.values()].sort((left, right) => left.localeCompare(right, "fr", { numeric: true })).slice(0, 80)]
  })), [conditionColumns, groups, readValue, rows])
  const valuesOf = (column: string) => conditionValues.get(column) ?? []
  const kindOf = (column: string): "number" | "list" | "text" => {
    const members = groupOf(groups, column)?.columns ?? [column]
    if (members.every((member) => numeric.includes(member))) return "number"
    return prepared.orderOf(column).length ? "list" : "text"
  }
  const isMulti = (column: string) => prepared.units.some((unit) => cellParts(prepared.valueOf(unit, column)).length > 1)
  const defaultLeaf = (): StatLeaf => {
    const column = columns.find((candidate) => orderOf(candidate).length > 1 && !statDimensions(draft).includes(candidate)) ?? columns.find((candidate) => !numeric.includes(candidate)) ?? columns[0] ?? ""
    return { column, operator: "est", value: orderOf(column)[0] ?? "" }
  }

  const flash = useCallback((text: string, action?: Toast["action"]) => {
    setToast({ text, action })
    window.setTimeout(() => setToast((current) => current?.text === text ? null : current), action ? 6000 : 3200)
  }, [])

  async function persist(next: StatDefinition[], message: string, options: { undo?: () => void; groups?: StatColumnGroup[] } = {}) {
    setPending(true); setError("")
    try {
      await onSave(cleanStats(next), options.groups ? cleanColumnGroups(options.groups) : undefined)
      flash(message, options.undo ? { label: "Annuler", run: options.undo } : undefined)
      return true
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Les statistiques n’ont pas pu être enregistrées.")
      return false
    } finally {
      setPending(false)
    }
  }

  function saveGroups(next: StatColumnGroup[], message: string, undo?: StatColumnGroup[]) {
    const clean = cleanColumnGroups(next)
    setPendingGroups(clean)
    void persist(stats, message, { groups: clean, undo: undo ? () => saveGroups(undo, "Groupe rétabli.") : undefined }).finally(() => setPendingGroups(null))
  }

  const change = (next: StatDefinition) => { setDraft(fitForm(next, { slots: statSlots(next, groups).size > 0, numeric: numeric.length })); setFormHint("") }

  function load(stat: StatDefinition | null) {
    const before = { draft, editing, title }
    const lost = dirty && (Boolean(saved) || Boolean(title.trim()) || comparable(draft) !== comparable(startStat(columns, orderOf, numeric)))
    setEditing(stat?.id ?? null)
    setDraft(stat ?? startStat(columns, orderOf, numeric))
    setTitle(stat?.title ?? "")
    setFormHint("")
    setAllForms(false)
    if (lost) flash(saved ? `Modifications de « ${saved.title} » laissées de côté.` : "Brouillon laissé de côté.", { label: "Rétablir", run: () => { setEditing(before.editing); setDraft(before.draft); setTitle(before.title) } })
  }

  async function save(copy = false) {
    if (!canEdit) return
    const current = copy ? null : saved
    if (!current && stats.length >= STAT_LIMITS.stats) { setError(`${STAT_LIMITS.stats} statistiques au plus par index : supprime-en une d’abord.`); return }
    const id = current?.id ?? newStatId(stats)
    const entry: StatDefinition = { ...fitForm(draft), id, title: copy ? `${shownTitle} (copie)`.slice(0, STAT_LIMITS.title) : shownTitle }
    // Une copie ou une nouvelle n'est pas épinglée ; une mise à jour garde son épingle.
    delete entry.pinned; delete entry.width; delete entry.rows
    if (current?.pinned) entry.pinned = true
    // Sa place dans l'onglet stat (largeur, lignes) se règle là-bas : une mise à jour la garde.
    if (current?.width) entry.width = current.width
    if (current?.rows) entry.rows = current.rows
    const next = current ? stats.map((stat) => stat.id === id ? entry : stat) : copy && saved ? stats.flatMap((stat) => stat.id === saved.id ? [stat, entry] : [stat]) : [entry, ...stats]
    if (await persist(next, current ? `« ${entry.title} » mise à jour.` : copy ? `Copie enregistrée : « ${entry.title} ».` : `« ${entry.title} » enregistrée.`)) {
      setEditing(id); setDraft(entry); setTitle(entry.title)
    }
  }

  async function togglePin(id: string) {
    const target = stats.find((stat) => stat.id === id)
    if (!target) return
    const next = stats.map((stat) => { if (stat.id !== id) return stat; const copy = { ...stat }; if (stat.pinned) delete copy.pinned; else copy.pinned = true; return copy })
    await persist(next, target.pinned ? `« ${target.title} » n’est plus épinglée.` : `« ${target.title} » épinglée en tête.`)
  }

  /** L'onglet stat : la largeur ou les lignes d'une épinglée, enregistrées tout de suite. */
  async function arrange(id: string, patch: { width?: StatWidth | null; rows?: StatDefinition["rows"] | null }) {
    const next = stats.map((stat) => {
      if (stat.id !== id) return stat
      const copy = { ...stat }
      if (patch.width !== undefined) { if (patch.width) copy.width = patch.width; else delete copy.width }
      if (patch.rows !== undefined) { if (patch.rows) copy.rows = patch.rows; else delete copy.rows }
      return copy
    })
    await persist(next, "Disposition enregistrée.")
  }

  async function duplicate(id: string) {
    const target = stats.find((stat) => stat.id === id)
    if (!target) return
    if (stats.length >= STAT_LIMITS.stats) { setError(`${STAT_LIMITS.stats} statistiques au plus par index : supprime-en une d’abord.`); return }
    const copy: StatDefinition = { ...target, id: newStatId(stats), title: `${target.title} (copie)`.slice(0, STAT_LIMITS.title) }
    delete copy.pinned; delete copy.width; delete copy.rows
    await persist(stats.flatMap((stat) => stat.id === id ? [stat, copy] : [stat]), `« ${target.title} » dupliquée.`)
  }

  async function remove(id: string) {
    const target = stats.find((stat) => stat.id === id)
    if (!target) return
    const before = stats
    const wasEditing = editing === id
    if (await persist(stats.filter((stat) => stat.id !== id), `« ${target.title} » supprimée.`, { undo: () => { void persist(before, "Suppression annulée.").then((done) => { if (done && wasEditing) setEditing(id) }) } }) && wasEditing) setEditing(null)
  }

  async function rename(id: string, value: string) {
    setRenaming(null)
    const target = stats.find((stat) => stat.id === id)
    const name = value.replace(/\s+/g, " ").trim().slice(0, STAT_LIMITS.title)
    if (!target || !name || name === target.title) return
    if (await persist(stats.map((stat) => stat.id === id ? { ...stat, title: name } : stat), `Renommée : « ${name} ».`) && editing === id) setTitle(name)
  }

  /* --- Fusionner / séparer des colonnes jumelles (Rareté principale et secondaire…) --- */
  const families = useMemo(() => columnFamilies(columns), [columns])
  const ownerOf = (list: StatColumnGroup[], column: string) => list.find((group) => group.columns.some((member) => fold(member) === fold(column)))
  const mergeable = statDimensions(draft).filter((column) => !isGroupRef(column) && column !== RANK_COLUMN).map((column) => ownerOf(groups, column)?.columns ?? (canEdit ? families.find((family) => family.columns.some((member) => fold(member) === fold(column)))?.columns : undefined)).find(Boolean)
  const splittable = statColumnBlocks(draft).flat().map((column) => groupOf(groups, column)).find(Boolean)
  function mergeTwins() {
    let nextGroups = groups
    const created: string[] = []
    const refFor = (column: string) => {
      if (isGroupRef(column) || column === RANK_COLUMN) return column
      const owner = ownerOf(nextGroups, column)
      if (owner) return groupRef(owner.id)
      const family = families.find((candidate) => candidate.columns.some((member) => fold(member) === fold(column)))
      if (!family || !canEdit) return column
      const group = { id: newStatId(nextGroups, Math.random, "g"), name: family.name, columns: family.columns }
      nextGroups = cleanColumnGroups([...nextGroups, group])
      created.push(nextGroups[nextGroups.length - 1].name)
      return groupRef(nextGroups[nextGroups.length - 1].id)
    }
    const unique = (list: string[]) => list.filter((column, index) => list.indexOf(column) === index)
    const by = unique(draft.by.map(refFor))
    const seen = new Set<string>()
    const blocks = statColumnBlocks(draft).map((block) => unique(block.map(refFor)).filter((column) => !by.includes(column))).filter((block) => { const key = block.join("\u001f"); if (!block.length || seen.has(key)) return false; seen.add(key); return true })
    change({ ...draft, by, cols: blocks[0] ?? [], blocks: blocks.slice(1) })
    if (created.length) saveGroups(nextGroups, `Colonnes regroupées : ${created.map((name) => `« ${name} »`).join(", ")}.`)
  }
  function splitTwins() {
    const out: string[][] = []
    for (const block of statColumnBlocks(draft)) {
      const inside = block.map((column) => groupOf(groups, column)).filter((group): group is StatColumnGroup => Boolean(group))
      if (!inside.length) { out.push(block); continue }
      const size = Math.max(...inside.map((group) => group.columns.length))
      const clean = block.filter((column) => column !== RANK_COLUMN)
      for (let rank = 0; rank < size; rank += 1) out.push(clean.map((column) => groupOf(groups, column)?.columns[rank] ?? column))
    }
    change({ ...draft, cols: out[0] ?? [], blocks: out.slice(1, STAT_LIMITS.blocks) })
  }
  const twinWords = (members: string[]) => memberLabels(members).join(" et ")

  const onToggle = (key: string) => setExpanded((current) => { const next = new Set(current); if (next.has(key)) next.delete(key); else next.add(key); return next })
  const pick: PickRows = (label, list, id) => setSelection({ label, rows: list, id, draft: draftKey })
  const searchKey = libQuery.trim().toLocaleLowerCase("fr")
  const listed = ordered.filter((stat) => (libFilter === "all" || stat.pinned) && (!searchKey || `${stat.title} ${autoStatTitle(stat, labelOf)}`.toLocaleLowerCase("fr").includes(searchKey)))
  // Un onglet stat qui choisit ses statistiques : celles-là ; sinon toutes les épinglées.
  const chosen = pinnedOnly && statIds?.length ? new Set(statIds) : null
  const pinned = ordered.filter((stat) => chosen ? chosen.has(stat.id) : stat.pinned)
  const concerned = picked?.rows ?? unitRows(prepared.units)
  const usage = (group: StatColumnGroup) => stats.filter((stat) => JSON.stringify(stat).includes(`"${groupRef(group.id)}"`)).length
  const allowedForms = statForms.map((form) => ({ ...form, problem: formProblem(draft, form.value, context) }))
  const hiddenForms = allowedForms.filter((form) => form.problem && form.value !== draft.form)

  function chooseForm(form: StatForm, label: string, problem: string) {
    if (problem) { setFormHint(`${label} : ${problem}`); return }
    const next: StatDefinition = { ...draft, form }
    if (form === "histogram" && !next.hist && numeric[0]) next.hist = { field: numeric[0], bins: 6, scale: "auto" }
    if (form === "scatter" && !next.scatter && numeric[0]) next.scatter = { x: numeric[0], y: numeric[1] ?? numeric[0] }
    change(next)
  }

  const toastView = toast && <div role="status" className="fixed bottom-5 left-1/2 z-50 flex w-max max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-3 rounded-xl bg-foreground px-3.5 py-2 text-[13px] text-background shadow-lg">
    <span>{toast.text}</span>
    {toast.action && <button type="button" className="shrink-0 rounded-md px-1.5 py-0.5 font-bold text-[#f0c46c] hover:underline" onClick={() => { const action = toast.action!; setToast(null); action.run() }}>{toast.action.label}</button>}
  </div>

  const manage = onManage && <Button type="button" variant="outline" size="sm" onClick={onManage}><Pencil />Créer et épingler des stats</Button>
  if (pinnedOnly) return pinned.length
    ? <div className="grid grid-cols-[minmax(0,1fr)] gap-3">
      {(manage || (canEdit && !single)) && <div className="flex flex-wrap items-center justify-end gap-2">
        {arranging && <span className="mr-auto text-xs text-muted-foreground">Largeur, ordre et lignes de chaque statistique : tout s’enregistre aussitôt.</span>}
        {canEdit && !single && <Button type="button" variant={arranging ? "default" : "outline"} size="sm" aria-pressed={arranging} onClick={() => setArranging((value) => !value)}><LayoutGrid />{arranging ? "Terminé" : "Organiser"}</Button>}
        {manage}
      </div>}
      {error && <p className="rounded-lg border border-destructive/25 bg-destructive/5 px-3 py-2 text-sm text-destructive" role="alert">{error}</p>}
      <section aria-label="Statistiques épinglées" className={`grid grid-cols-[minmax(0,1fr)] items-start gap-3 ${single ? "" : "md:grid-cols-6"}`}>
        {pinned.map((stat, index) => <PinnedStat key={stat.id} stat={stat} data={data} expanded={expanded} onToggle={onToggle} tabs={tabs} tabOf={tabOf} nameOf={nameOf} onOpen={onOpen} full={single}
          arrange={arranging && canEdit && !single ? { pending, first: index === 0, last: index === pinned.length - 1, onWidth: (width) => void arrange(stat.id, { width }), onRows: (rows) => void arrange(stat.id, { rows }), ...(chosen ? {} : { onMove: (step: -1 | 1) => void persist(movePinned(stats, stat.id, step), "Ordre enregistré."), onUnpin: () => void togglePin(stat.id) }) } : undefined} />)}
      </section>
      {toastView}
    </div>
    : <div className="grid place-items-center gap-3 rounded-xl border border-dashed px-5 py-12 text-center text-sm text-muted-foreground"><p>{chosen ? "Les statistiques choisies pour cet onglet n’existent plus. Choisis-en d’autres (crayon de l’onglet), ou crée-les dans « Modifier › Stats »." : "Aucune statistique épinglée. Crée-les et épingle-les dans « Modifier › Stats »."}</p>{manage}</div>

  return <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
    {pinned.length > 0 && <section aria-label="Statistiques épinglées" className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {pinned.map((stat) => <button key={stat.id} type="button" onClick={() => load(stat)} className={`grid min-w-0 content-start gap-2.5 rounded-2xl border bg-card p-4 text-left transition-colors hover:border-[#3b5c8a] ${editing === stat.id ? "border-[#3b5c8a] shadow-[inset_3px_0_0_#3b5c8a]" : ""}`}>
        <span className="flex min-w-0 items-center gap-1.5 text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase"><Pin className="size-3 shrink-0 text-[#a87a1f]" /><span className="truncate">{stat.title}</span></span>
        <StatResult stat={stat} data={data} compact expanded={expanded} onToggle={onToggle} />
      </button>)}
    </section>}

    <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <section aria-label="Constructeur de statistique" className="grid min-w-0 grid-cols-[minmax(0,1fr)] overflow-hidden rounded-2xl border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-3.5 pt-3.5 pb-3 sm:px-4">
          <div className="grid min-w-0 flex-[1_1_18rem] gap-0.5">
            <input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={STAT_LIMITS.title} placeholder={autoStatTitle(draft, labelOf)} aria-label="Nom de la statistique" readOnly={!canEdit}
              onKeyDown={(event) => { if (event.key === "Enter" && canEdit) { event.preventDefault(); void save() } else if (event.key === "Escape") { event.preventDefault(); setTitle(saved?.title ?? ""); event.currentTarget.blur() } }}
              className="-ml-2 w-[calc(100%+0.5rem)] min-w-0 truncate rounded-lg border border-transparent bg-transparent px-2 py-0.5 font-display text-xl font-semibold placeholder:font-normal placeholder:text-muted-foreground placeholder:italic hover:border-border/60 focus:border-border focus:bg-background focus:outline-none" />
            {canEdit && <span className="flex items-center gap-1.5 text-xs text-muted-foreground" aria-live="polite"><span className={`size-1.5 rounded-full ${!saved ? "bg-[#3b5c8a]" : dirty ? "bg-[#a87a1f]" : "bg-[#13917a]"}`} />{!saved ? "Nouvelle statistique" : dirty ? "Modifications non enregistrées" : "Enregistrée"}</span>}
          </div>
          <div className="flex w-full flex-wrap items-center gap-1.5 sm:w-auto">
            <Button type="button" variant="outline" size="sm" onClick={() => load(null)}><Plus />Nouvelle</Button>
            {canEdit && saved && <Button type="button" variant="outline" size="sm" aria-pressed={Boolean(saved.pinned)} disabled={pending} onClick={() => void togglePin(saved.id)} className={saved.pinned ? "border-[#a87a1f]/70 bg-[#a87a1f]/15" : ""}>{saved.pinned ? <PinOff /> : <Pin />}{saved.pinned ? "Épinglée" : "Épingler"}</Button>}
            {canEdit && saved && <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => void save(true)} title="Enregistrer une copie"><Copy />Copie</Button>}
            {canEdit && <Button type="button" size="sm" className="ml-auto sm:ml-0" disabled={pending || (Boolean(saved) && !dirty)} onClick={() => void save()}>{pending ? <LoaderCircle className="animate-spin" /> : null}Enregistrer</Button>}
          </div>
        </div>
        <div className="grid gap-2 border-y border-border/60 bg-background/45 px-3.5 py-2.5 sm:px-4">
          <Sentence stat={draft} onChange={change} columns={columns} numeric={numeric} tabs={tabs} groups={groups} labelOf={labelOf} orderOf={prepared.orderOf} kindOf={kindOf} valuesOf={valuesOf} isMulti={isMulti} slots={slots} defaultLeaf={defaultLeaf}
            merge={mergeable ? { label: `⇄ fusionner ${twinWords(mergeable)}`, run: mergeTwins } : null}
            split={!mergeable && splittable ? { label: `⇄ séparer ${twinWords(splittable.columns)}`, run: splitTwins } : null} />
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" aria-expanded={groupsOpen} onClick={() => setGroupsOpen((value) => !value)} className={`${mini} ${groupsOpen ? "border-solid border-[#3b5c8a] text-foreground" : ""}`}><Combine className="mr-1 size-3.5" aria-hidden="true" />Colonnes regroupées{groups.length ? ` (${groups.length})` : ""}{canEdit && !groups.length && suggestColumnGroups(columns, groups).length ? " · regrouper des colonnes…" : ""}</button>
          </div>
          {groupsOpen && <GroupsPanel groups={groups} columns={columns.filter((column) => column !== TAB_PSEUDO)} canEdit={canEdit} pending={pending} usage={usage} onSave={saveGroups} />}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-3.5 pt-3 sm:px-4">
          <div className="-mx-3.5 flex w-[calc(100%+1.75rem)] flex-nowrap gap-1 overflow-x-auto px-3.5 pb-1 [scrollbar-width:none] sm:mx-0 sm:w-auto sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0" role="group" aria-label="Forme">
            {allowedForms.filter((form) => !form.problem || allForms || form.value === draft.form).map((form) => <button key={form.value} type="button" aria-pressed={draft.form === form.value} aria-disabled={Boolean(form.problem)} title={form.problem ? `${form.label} : ${form.problem}` : form.label}
              onClick={() => chooseForm(form.value, form.label, form.problem)}
              className={`inline-flex shrink-0 items-center gap-1 rounded-lg border px-2 py-0.5 pl-1 text-[12.5px] whitespace-nowrap ${draft.form === form.value ? "border-[#3b5c8a] bg-[#3b5c8a]/10 font-semibold text-foreground" : form.problem ? "border-dashed border-border/70 text-muted-foreground opacity-50" : "border-border/70 text-muted-foreground hover:border-border hover:text-foreground"}`}>
              <FormIcon form={form.value} />{form.label}
            </button>)}
            {hiddenForms.length > 0 && <button type="button" aria-expanded={allForms} onClick={() => setAllForms((value) => !value)} className="shrink-0 rounded-lg border border-dashed border-border px-2.5 py-0.5 text-[12.5px] text-muted-foreground hover:text-foreground" title={allForms ? "Cacher les formes qui ne conviennent pas" : "Voir les formes qui ne conviennent pas à cette phrase, et pourquoi"}>{allForms ? "Moins" : `+ ${hiddenForms.length}`}</button>}
          </div>
          <ColorControls stat={draft} onChange={change} />
        </div>
        {formHint && <p className="px-4 pt-1.5 text-xs text-muted-foreground" role="status">{formHint}</p>}
        <div className="min-w-0 px-3.5 pt-3 pb-4 sm:px-4" aria-live="polite">
          <StatResult key={`${draft.id}|${draft.form}|${statDimensions(draft).join("›")}`} stat={draft} data={data} prepared={prepared} expanded={expanded} onToggle={onToggle} onPick={pick} picked={picked?.id} onChange={change} />
        </div>
        <div className="grid gap-2 border-t border-border/60 bg-background/30 px-3.5 pt-3 pb-4 sm:px-4">
          {/* Sous le nom : son onglet et sa valeur dans la première colonne de « réparties par ». */}
          <ConcernedRows rows={concerned} label={picked?.label ?? (draft.where?.length ? "Lignes retenues" : "Toutes les lignes")} extra={!picked && slots.size ? ` (${prepared.units.length.toLocaleString("fr-FR")} ${unitWord(slots.size, prepared.units.length)})` : ""} onReset={picked ? () => setSelection(null) : undefined}
            metaOf={(row) => [tabs.length > 1 ? tabOf(row) : "", draft.by[0] ? cellText(prepared.valueOf({ row, slot: -1 }, draft.by[0])) : ""].filter(Boolean).join(" · ")} nameOf={nameOf} onOpen={onOpen} />
        </div>
        {error && <p className="border-t border-destructive/25 bg-destructive/5 px-4 py-2 text-sm text-destructive" role="alert">{error}</p>}
      </section>

      <aside aria-labelledby="stats-library-title" className="grid min-w-0 gap-2.5 rounded-2xl border bg-card p-3 lg:sticky lg:top-4 lg:max-h-[calc(100dvh-2rem)] lg:grid-rows-[auto_auto_minmax(0,1fr)]">
        <h2 id="stats-library-title" className="px-1 font-display text-lg font-semibold">Enregistrées<span className="ml-1.5 font-sans text-xs font-semibold text-muted-foreground">{stats.length}</span></h2>
        <div className="flex flex-wrap items-center gap-1.5 px-1">
          <span className="inline-flex rounded-lg border bg-background p-0.5" role="group" aria-label="Filtrer">
            {([["all", "Toutes", stats.length], ["pinned", "Épinglées", pinned.length]] as const).map(([value, label, count]) => <button key={value} type="button" aria-pressed={libFilter === value} onClick={() => setLibFilter(value)} className={`rounded-md px-2 py-0.5 text-xs ${libFilter === value ? "bg-card font-semibold text-foreground shadow-[0_0_0_1px_var(--border)]" : "text-muted-foreground"}`}>{label}<small className="ml-1 text-[11px] text-muted-foreground tabular-nums">{count}</small></button>)}
          </span>
          <label className="relative min-w-0 flex-[1_1_7rem]"><Search className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" /><input type="search" value={libQuery} onChange={(event) => setLibQuery(event.target.value)} placeholder="Rechercher…" aria-label="Rechercher une statistique enregistrée" className="w-full rounded-lg border bg-background py-1 pr-2 pl-7 text-[13px]" /></label>
        </div>
        <ul className="grid min-h-0 content-start gap-0.5 overflow-auto" aria-label="Statistiques enregistrées">
          {listed.map((stat) => <li key={stat.id} className={`relative grid grid-cols-[minmax(0,1fr)_auto] items-center rounded-xl hover:bg-muted ${editing === stat.id ? "bg-[#3b5c8a]/10 shadow-[inset_3px_0_0_#3b5c8a]" : ""}`}>
            {renaming?.id === stat.id
              ? <input autoFocus value={renaming.value} maxLength={STAT_LIMITS.title} aria-label="Nouveau nom de la statistique" onChange={(event) => setRenaming({ id: stat.id, value: event.target.value })} onBlur={() => void rename(stat.id, renaming.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void rename(stat.id, renaming.value) } else if (event.key === "Escape") { event.preventDefault(); setRenaming(null) } }} className="col-span-2 m-1.5 min-w-0 rounded-lg border border-[#3b5c8a] bg-card px-2 py-1 text-[13.5px] font-semibold" />
              : <>
                <button type="button" onClick={() => load(stat)} title={`Ouvrir « ${stat.title} »`} aria-current={editing === stat.id ? "true" : undefined} className="grid min-w-0 grid-cols-[2.6rem_minmax(0,1fr)] items-center gap-x-2.5 rounded-xl py-1.5 pr-1 pl-2 text-left focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[#3b5c8a]">
                  <span className="row-span-2 grid h-8 w-10 place-items-center rounded-lg border border-border/60 bg-background"><FormIcon form={stat.form} className="h-5 w-7" /></span>
                  <span className="flex min-w-0 items-center gap-1.5 text-[13.5px] font-semibold"><span className="truncate">{stat.title}</span>{stat.pinned && <Pin className="size-3 shrink-0 text-[#a87a1f]" aria-label="épinglée" />}</span>
                  <span className="truncate text-xs text-muted-foreground">{statForms.find((form) => form.value === stat.form)?.label}{stat.title !== autoStatTitle(stat, labelOf) ? ` · ${autoStatTitle(stat, labelOf)}` : ""}</span>
                </button>
                {canEdit ? <DropdownMenu>
                  <DropdownMenuTrigger asChild><button type="button" aria-label={`Actions pour « ${stat.title} »`} disabled={pending} className="mr-1 grid size-8 place-items-center rounded-lg text-muted-foreground hover:bg-card hover:text-foreground data-[state=open]:bg-card data-[state=open]:shadow-[0_0_0_1px_var(--border)]"><MoreHorizontal className="size-4" /></button></DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="min-w-52">
                    <DropdownMenuItem onSelect={() => load(stat)}><Pencil />Modifier</DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => setRenaming({ id: stat.id, value: stat.title })}><TextCursorInput />Renommer</DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => void duplicate(stat.id)}><Copy />Dupliquer</DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => void togglePin(stat.id)}>{stat.pinned ? <PinOff /> : <Pin />}{stat.pinned ? "Ne plus épingler" : "Épingler en tête"}</DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem variant="destructive" onSelect={() => void remove(stat.id)}><Trash2 />Supprimer</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu> : <span />}
              </>}
          </li>)}
          {!listed.length && <li className="rounded-xl border border-dashed px-2 py-5 text-center text-[13px] text-muted-foreground">{libQuery.trim() ? `Aucune statistique ne contient « ${libQuery.trim()} ».` : libFilter === "pinned" ? "Aucune statistique épinglée." : "Aucune statistique enregistrée."}</li>}
        </ul>
      </aside>
    </div>

    {toastView}
  </div>
}
