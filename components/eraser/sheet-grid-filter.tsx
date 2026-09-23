"use client"

import { useMemo, useState } from "react"
import { ArrowDownAZ, ArrowUpAZ, ChevronRight, Search, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"

/**
 * Tri et filtres d'une colonne, comme le menu d'en-tête de Google Sheets — sans les
 * filtres par couleur. Un filtre combine une condition et une liste de valeurs
 * masquées : ce qui est décoché disparaît, une valeur nouvelle reste visible.
 */
export const filterConditions = [
  { type: "none", label: "Aucune", needsValue: false },
  { type: "empty", label: "Cellule vide", needsValue: false },
  { type: "not-empty", label: "Cellule non vide", needsValue: false },
  { type: "contains", label: "Le texte contient", needsValue: true },
  { type: "not-contains", label: "Le texte ne contient pas", needsValue: true },
  { type: "starts", label: "Le texte commence par", needsValue: true },
  { type: "ends", label: "Le texte se termine par", needsValue: true },
  { type: "exact", label: "Le texte est exactement", needsValue: true },
  { type: "gt", label: "Supérieur à", needsValue: true },
  { type: "gte", label: "Supérieur ou égal à", needsValue: true },
  { type: "lt", label: "Inférieur à", needsValue: true },
  { type: "lte", label: "Inférieur ou égal à", needsValue: true },
  { type: "eq", label: "Est égal à", needsValue: true },
  { type: "neq", label: "N’est pas égal à", needsValue: true },
] as const

export type FilterConditionType = (typeof filterConditions)[number]["type"]

export type ColumnFilter = { condition?: { type: FilterConditionType; value: string }; hidden?: string[] }

export type GridFilters = Record<string, ColumnFilter>

export function isGridFilters(value: unknown): value is GridFilters {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false
  return Object.values(value as Record<string, unknown>).every((filter) => {
    if (!filter || typeof filter !== "object") return false
    const candidate = filter as { condition?: { type?: unknown; value?: unknown }; hidden?: unknown }
    if (candidate.hidden !== undefined && !(Array.isArray(candidate.hidden) && candidate.hidden.every((item) => typeof item === "string"))) return false
    if (candidate.condition !== undefined && !(filterConditions.some((condition) => condition.type === candidate.condition?.type) && typeof candidate.condition.value === "string")) return false
    return true
  })
}

export function filterIsActive(filter: ColumnFilter | undefined) {
  return Boolean(filter && ((filter.condition && filter.condition.type !== "none") || filter.hidden?.length))
}

function fold(value: string) {
  return value.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase("fr").trim()
}

function number(value: string) {
  const parsed = Number(value.replace(/\s/g, "").replace(",", "."))
  return value.trim() && Number.isFinite(parsed) ? parsed : null
}

/** Compare en nombres quand les deux côtés en sont, en texte sinon. */
function compare(left: string, right: string) {
  const a = number(left)
  const b = number(right)
  if (a !== null && b !== null) return a - b
  return left.localeCompare(right, "fr", { sensitivity: "base", numeric: true })
}

export function passesFilter(filter: ColumnFilter | undefined, raw: string) {
  if (!filter) return true
  const value = raw.trim()
  if (filter.hidden?.includes(value)) return false
  const condition = filter.condition
  if (!condition || condition.type === "none") return true
  const expected = condition.value.trim()
  const folded = fold(value)
  const target = fold(expected)
  switch (condition.type) {
    case "empty": return !value
    case "not-empty": return Boolean(value)
    case "contains": return folded.includes(target)
    case "not-contains": return !folded.includes(target)
    case "starts": return folded.startsWith(target)
    case "ends": return folded.endsWith(target)
    case "exact": return folded === target
    case "gt": return Boolean(value) && compare(value, expected) > 0
    case "gte": return Boolean(value) && compare(value, expected) >= 0
    case "lt": return Boolean(value) && compare(value, expected) < 0
    case "lte": return Boolean(value) && compare(value, expected) <= 0
    case "eq": return compare(value, expected) === 0
    case "neq": return compare(value, expected) !== 0
    default: return true
  }
}

export function sortValues(left: string, right: string) {
  return compare(left.trim(), right.trim())
}

function Section({ title, open, onToggle, children }: { title: string; open: boolean; onToggle: () => void; children: React.ReactNode }) {
  return <div>
    <button type="button" onClick={onToggle} className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted">
      <ChevronRight className={`size-3.5 transition-transform ${open ? "rotate-90" : ""}`} />{title}
    </button>
    {open && <div className="grid gap-2 px-2 pb-2 pt-1">{children}</div>}
  </div>
}

/** Le contenu du menu d'en-tête : tri, filtre par condition, filtre par valeurs. */
export function ColumnMenu({ label, values, filter, sortDirection, onSort, onApply, onClose }: {
  label: string
  /** Les valeurs distinctes de la colonne (texte brut), « » pour les cellules vides. */
  values: string[]
  filter: ColumnFilter | undefined
  sortDirection: "asc" | "desc" | null
  onSort: (direction: "asc" | "desc" | null) => void
  onApply: (filter: ColumnFilter | null) => void
  onClose: () => void
}) {
  const [condition, setCondition] = useState(filter?.condition ?? { type: "none" as FilterConditionType, value: "" })
  const [hidden, setHidden] = useState(() => new Set(filter?.hidden ?? []))
  const [query, setQuery] = useState("")
  const [openSection, setOpenSection] = useState<"condition" | "values" | null>(filter?.condition && filter.condition.type !== "none" ? "condition" : "values")
  const needsValue = filterConditions.find((item) => item.type === condition.type)?.needsValue ?? false
  const shown = useMemo(() => values.filter((value) => !query.trim() || fold(value || "(vides)").includes(fold(query))), [query, values])

  function apply() {
    const next: ColumnFilter = {}
    if (condition.type !== "none" && (!needsValue || condition.value.trim())) next.condition = condition
    if (hidden.size) next.hidden = [...hidden]
    onApply(filterIsActive(next) ? next : null)
    onClose()
  }

  return <div className="grid w-72 gap-1 text-sm">
    <p className="truncate px-2 pb-1 pt-0.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
    <button type="button" onClick={() => { onSort(sortDirection === "asc" ? null : "asc"); onClose() }} className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-muted ${sortDirection === "asc" ? "font-semibold text-primary" : ""}`}><ArrowDownAZ className="size-4" />Trier de A à Z</button>
    <button type="button" onClick={() => { onSort(sortDirection === "desc" ? null : "desc"); onClose() }} className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-muted ${sortDirection === "desc" ? "font-semibold text-primary" : ""}`}><ArrowUpAZ className="size-4" />Trier de Z à A</button>
    {sortDirection && <button type="button" onClick={() => { onSort(null); onClose() }} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-muted-foreground hover:bg-muted"><X className="size-4" />Retirer le tri</button>}
    <div className="my-1 border-t" />
    <Section title="Filtrer par condition" open={openSection === "condition"} onToggle={() => setOpenSection(openSection === "condition" ? null : "condition")}>
      <NativeSelect value={condition.type} onChange={(event) => setCondition({ ...condition, type: event.target.value as FilterConditionType })} className="w-full" size="sm">
        {filterConditions.map((item) => <NativeSelectOption key={item.type} value={item.type}>{item.label}</NativeSelectOption>)}
      </NativeSelect>
      {needsValue && <Input value={condition.value} onChange={(event) => setCondition({ ...condition, value: event.target.value })} placeholder="Valeur ou formule" className="h-8" onKeyDown={(event) => { if (event.key === "Enter") apply() }} />}
    </Section>
    <Section title="Filtrer par valeurs" open={openSection === "values"} onToggle={() => setOpenSection(openSection === "values" ? null : "values")}>
      <div className="flex flex-wrap items-center gap-x-1 text-xs">
        <button type="button" className="text-primary underline" onClick={() => setHidden(new Set([...hidden].filter((value) => !shown.includes(value))))}>Sélectionner les {shown.length}</button>
        <span>-</span>
        <button type="button" className="text-primary underline" onClick={() => setHidden(new Set([...hidden, ...shown]))}>Effacer</button>
        <span className="ml-auto text-muted-foreground">Affichage de {shown.length}</span>
      </div>
      <div className="relative"><Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" /><Input value={query} onChange={(event) => setQuery(event.target.value)} className="h-8 pl-8" /></div>
      <div className="max-h-56 overflow-y-auto rounded-md border p-1">
        {shown.map((value) => <label key={value || "\u0000"} className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 hover:bg-muted">
          <Checkbox checked={!hidden.has(value)} onCheckedChange={(checked) => setHidden((current) => { const next = new Set(current); if (checked === true) next.delete(value); else next.add(value); return next })} />
          <span className={`truncate ${value ? "" : "italic text-muted-foreground"}`}>{value || "(Vides)"}</span>
        </label>)}
        {!shown.length && <p className="px-2 py-3 text-center text-xs text-muted-foreground">Aucune valeur.</p>}
      </div>
    </Section>
    <div className="mt-1 flex items-center gap-2 border-t pt-2">
      {filterIsActive(filter) && <Button type="button" variant="ghost" size="sm" onClick={() => { onApply(null); onClose() }}>Retirer le filtre</Button>}
      <Button type="button" variant="outline" size="sm" className="ml-auto" onClick={onClose}>Annuler</Button>
      <Button type="button" size="sm" onClick={apply}>OK</Button>
    </div>
  </div>
}
