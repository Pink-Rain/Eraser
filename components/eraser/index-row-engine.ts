/**
 * Le moteur d'une ligne d'index, partagé par les index du monde et l'index des objets :
 * la valeur que voit une formule dans chaque colonne, le résultat des colonnes Formule,
 * le maximum d'une jauge lu dans une autre colonne, les conditions des boutons.
 * La page fournit la façon de lire ses cases ; tout le reste est identique partout.
 */
import { buttonVisible as isButtonVisible } from "@/lib/index-actions"
import { foldName, gaugeScaleOf, normalizeSpec, type ActionButton, type IndexColumnSpec } from "@/lib/index-columns"
import {
  columnFormulaValue,
  computeFormulaDisplay,
  evaluateFormula,
  FormulaError,
  formulaDisplayText,
  numericCellValue,
  seededRandom,
  type FormulaContext,
  type FormulaDisplay,
  type FormulaValue,
} from "@/lib/index-formula"

export type RowEngineSource = {
  /** Le type d'une colonne de la ligne ; `undefined` si la colonne n'existe pas. */
  specOf: (rowKey: string, header: string) => IndexColumnSpec | undefined
  /** Le texte d'une case (avec les modifications pas encore revenues de Sheets). */
  raw: (rowKey: string, header: string) => string
  rowInfo: (rowKey: string) => { tabName: string; rowNumber: number } | null
  /** Les valeurs d'une colonne des lignes reliées par une relation. */
  related?: (rowKey: string, via: string, field: string) => string[] | undefined
  relatedCount?: (rowKey: string, via: string) => number | undefined
  /** Le résultat d'une colonne Recherche ou Agrégat. */
  computed?: (rowKey: string, spec: IndexColumnSpec) => string[]
  /** Germe du hasard des formules : changé par « Actualiser ». */
  seed: string
}

export type RowEngine = ReturnType<typeof createRowEngine>

export function createRowEngine(source: RowEngineSource) {
  const cache = new Map<string, FormulaDisplay>()

  function context(rowKey: string, stack: string[] = []): FormulaContext {
    const info = source.rowInfo(rowKey)
    return {
      column: (name): FormulaValue | undefined => {
        const spec = source.specOf(rowKey, name)
        if (!spec) return undefined
        const normalized = normalizeSpec(spec)
        if (normalized.kind === "formula") {
          const key = foldName(name)
          if (stack.includes(key)) throw new FormulaError(`Les formules de {${name}} et de cette colonne se citent l’une l’autre.`)
          return evaluateFormula(normalized.formula?.expression ?? "", context(rowKey, [...stack, key]))
        }
        if (normalized.kind === "lookup") return source.computed?.(rowKey, spec) ?? []
        if (normalized.kind === "rollup") {
          const [value] = source.computed?.(rowKey, spec) ?? []
          if (value === undefined || value === "") return null
          return numericCellValue(value) ?? value
        }
        if (normalized.kind === "actions") return null
        return columnFormulaValue(source.raw(rowKey, name), spec)
      },
      columnInfo: (name) => { const spec = source.specOf(rowKey, name); return spec ? { raw: source.raw(rowKey, name), spec } : undefined },
      related: source.related ? (via, field) => source.related!(rowKey, via, field) : undefined,
      relatedCount: source.relatedCount ? (via) => source.relatedCount!(rowKey, via) : undefined,
      rowNumber: info?.rowNumber,
      tabName: info?.tabName,
      random: seededRandom(`${source.seed}:${rowKey}:${stack.join("/")}`),
    }
  }

  /** Le résultat d'une colonne Formule sur une ligne (gardé jusqu'au prochain changement). */
  function formula(rowKey: string, header: string, spec: IndexColumnSpec): FormulaDisplay {
    const key = `${rowKey}\u0000${foldName(header)}`
    const cached = cache.get(key)
    if (cached) return cached
    const normalized = normalizeSpec(spec)
    const display = computeFormulaDisplay(normalized.formula?.expression ?? "", context(rowKey, [foldName(header)]), normalized.formula?.result, normalized.number)
    cache.set(key, display)
    return display
  }

  /** Le texte d'une colonne calculée : pour trier, chercher et copier. */
  function computedText(rowKey: string, header: string, spec: IndexColumnSpec) {
    const normalized = normalizeSpec(spec)
    if (normalized.kind === "formula") return formulaDisplayText(formula(rowKey, header, spec))
    if (normalized.kind === "lookup" || normalized.kind === "rollup") return (source.computed?.(rowKey, spec) ?? []).join(", ")
    return undefined
  }

  /** Jauge « maximum lu dans une autre colonne » : le maximum de la ligne. */
  function gaugeMax(rowKey: string, spec: IndexColumnSpec) {
    const settings = normalizeSpec(spec).gauge
    if (!settings || gaugeScaleOf(settings) !== "from-column" || !settings.maxColumn) return null
    const value = context(rowKey).column(settings.maxColumn)
    if (value === undefined || value === null) return null
    return typeof value === "number" ? value : numericCellValue(String(value))
  }

  function buttonVisible(rowKey: string, button: ActionButton) {
    return isButtonVisible(button, context(rowKey))
  }

  return { context, formula, computedText, gaugeMax, buttonVisible, invalidate: () => cache.clear() }
}
