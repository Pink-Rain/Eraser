/**
 * Les tirages au sort des index : colonne Aléatoire, action « Tirer », bouton « Tirer
 * une ligne ». Le hasard vient de `crypto` ; un tirage est ensuite écrit dans la case
 * (il ne change plus tout seul) et se relance seulement si la colonne le permet.
 */
import { type RandomSettings } from "@/lib/index-columns"
import { computeFormulaDisplay, evaluateFormula, formulaDisplayText, numericCellValue, toBoolean, type FormulaContext } from "@/lib/index-formula"
import { formatAmount } from "@/lib/index-numbers"

/** Un nombre au hasard (0 ≤ x < 1), tiré par `crypto`. */
export function cryptoRandom() {
  const buffer = new Uint32Array(1)
  crypto.getRandomValues(buffer)
  return buffer[0] / 4294967296
}

export type Weighted<T> = { value: T; weight: number }

/**
 * Tire `count` éléments selon leur poids (un poids de 0 n'est jamais tiré ; sans poids,
 * tout vaut 1). `unique` : un élément ne sort qu'une fois.
 */
export function weightedPick<T>(items: Array<Weighted<T>>, random: () => number, count = 1, unique = false): T[] {
  const pool = items.filter((item) => Number.isFinite(item.weight) && item.weight > 0)
  const result: T[] = []
  for (let draw = 0; draw < count && pool.length; draw += 1) {
    const total = pool.reduce((sum, item) => sum + item.weight, 0)
    let target = random() * total
    let index = 0
    for (; index < pool.length - 1; index += 1) {
      target -= pool[index].weight
      if (target < 0) break
    }
    result.push(pool[index].value)
    if (unique) pool.splice(index, 1)
  }
  return result
}

/** Une ligne d'un index, vue par un tirage : son nom, ses cases et de quoi y calculer une formule. */
export type RandomCandidateRow = {
  name: string
  cell: (header: string) => string
  formula: FormulaContext
}

export type RandomContext = {
  random: () => number
  /** La ligne où l'on tire (source « formule » et « colonne »). */
  row: FormulaContext
  /** Les lignes d'un index (source « ligne d'un index ») ; « self » : l'index de la ligne. */
  rowsOf?: (index: string, tab: string) => RandomCandidateRow[] | undefined
}

export type RandomDraw = { values: string[]; detail?: string; error?: string }

function rollDice(expression: string, random: () => number) {
  const rolls: string[] = []
  const replaced = expression.replace(/\s+/g, "").replace(/(\d*)d(\d+)/gi, (notation, countText: string, sidesText: string) => {
    const count = Math.max(1, Number(countText || "1"))
    const sides = Number(sidesText)
    if (!Number.isInteger(count) || !Number.isInteger(sides) || count > 100 || sides < 2 || sides > 10000) throw new Error(`« ${notation} » n’est pas un jet valable (100 dés de 10 000 faces au plus).`)
    const values = Array.from({ length: count }, () => 1 + Math.floor(random() * sides))
    rolls.push(`${notation.toLowerCase()} [${values.join(", ")}]`)
    return `(${values.reduce((sum, value) => sum + value, 0)})`
  })
  if (!rolls.length) throw new Error("Écris le jet comme « 2d6+1 ».")
  const total = computeFormulaDisplay(replaced, { column: () => undefined })
  if (total.kind !== "number") throw new Error(`« ${expression} » n’est pas un jet valable.`)
  return { total: total.text, detail: rolls.join(" · ") }
}

/** Un tirage selon les réglages d'une colonne Aléatoire (ou d'une action « Tirer »). */
export function drawRandom(settings: RandomSettings, context: RandomContext): RandomDraw {
  const count = Math.max(1, Math.min(50, Math.trunc(settings.count ?? 1)))
  const unique = Boolean(settings.unique)
  const { random } = context
  try {
    switch (settings.source) {
      case "number": {
        const low = settings.min ?? 1
        const high = settings.max ?? 20
        if (high < low) return { values: [], error: "Le minimum dépasse le maximum." }
        const decimals = Math.max(0, Math.min(4, Math.trunc(settings.decimals ?? 0)))
        const values: string[] = []
        const seen = new Set<string>()
        let attempts = 0
        while (values.length < count && attempts < count * 50) {
          attempts += 1
          const value = decimals ? Math.round((low + random() * (high - low)) * 10 ** decimals) / 10 ** decimals : Math.ceil(low) + Math.floor(random() * (Math.floor(high) - Math.ceil(low) + 1))
          const text = formatAmount(value, decimals || undefined)
          if (unique && seen.has(text)) continue
          seen.add(text)
          values.push(text)
        }
        return { values }
      }
      case "dice": {
        const expression = (settings.dice || "1d20").trim()
        const draws = Array.from({ length: count }, () => rollDice(expression, random))
        return { values: draws.map((draw) => draw.total), detail: draws.map((draw) => draw.detail).join(" / ") }
      }
      case "list": {
        const options = (settings.options ?? []).filter((option) => option.value.trim())
        if (!options.length) return { values: [], error: "Ajoute des options à tirer." }
        return { values: weightedPick(options.map((option) => ({ value: option.value, weight: option.weight ?? 1 })), random, count, unique) }
      }
      case "column": {
        const name = settings.column ?? ""
        const value = context.row.column(name)
        if (value === undefined) return { values: [], error: `La colonne « ${name} » n’existe pas.` }
        const items = (Array.isArray(value) ? value : value === null ? [] : String(value).split(/\s*[,;\n]\s*/)).map((item) => String(item ?? "").trim()).filter(Boolean)
        if (!items.length) return { values: [], error: `« ${name} » est vide sur cette ligne.` }
        return { values: weightedPick(items.map((item) => ({ value: item, weight: 1 })), random, count, unique) }
      }
      case "index": {
        const target = settings.index
        if (!target) return { values: [], error: "Choisis l’index où tirer une ligne." }
        const rows = context.rowsOf?.(target.index, target.tab || "*")
        if (!rows) return { values: [], error: "Cet index n’est pas encore chargé : réessaie dans un instant." }
        const filter = target.filter?.trim()
        const candidates = rows.filter((row) => {
          if (!row.name.trim()) return false
          if (!filter) return true
          try { return toBoolean(evaluateFormula(filter, row.formula)) } catch { return false }
        })
        if (!candidates.length) return { values: [], error: filter ? "Aucune ligne ne remplit la condition." : "Cet index est vide." }
        const weighted = candidates.map((row) => ({ value: row, weight: target.weightColumn ? numericCellValue(row.cell(target.weightColumn)) ?? 0 : 1 }))
        const picked = weightedPick(weighted, random, count, unique)
        if (!picked.length) return { values: [], error: "Toutes les lignes ont un poids nul." }
        return { values: picked.map((row) => target.field ? row.cell(target.field).replace(/<[^>]+>/g, "").trim() : row.name) }
      }
      case "formula": {
        const source = settings.formula?.trim()
        if (!source) return { values: [], error: "Écris la formule à tirer." }
        const values = Array.from({ length: count }, () => {
          const display = computeFormulaDisplay(source, { ...context.row, random })
          if (display.kind === "error") throw new Error(display.message)
          return formulaDisplayText(display)
        })
        return { values }
      }
    }
  } catch (error) {
    return { values: [], error: error instanceof Error ? error.message : "Tirage impossible." }
  }
}

/** Le texte écrit dans la case : les valeurs tirées, séparées par des virgules. */
export function drawText(draw: RandomDraw) {
  return draw.values.join(", ")
}

