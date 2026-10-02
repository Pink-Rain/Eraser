/**
 * Ce qu'un effet d'état fait à une valeur (colonne « Changement de valeur ») et le jet de
 * dés qui le déclenche (colonne « Jet »). Tant que l'état est posé, `+`, `-`, `=`, `≥` et
 * `≤` changent la valeur affichée ; quand il part, tout redevient comme avant. Les dés,
 * eux, se lancent depuis la fiche et changent la valeur pour de bon (des dégâts). Le signe
 * écrit tout devant vaut pour le total : « -1d20+20 » retire (1d20+20).
 *
 *   +10  -30  10      ajoute ou retire
 *   =100              remplace la valeur
 *   ≥1   >=1          plancher : jamais moins
 *   ≤50  <=50         plafond : jamais plus
 *   -1d20+20  +2d6    se lance depuis la fiche : -1d20+20 retire le total de 1d20+20
 *   1d20-20           sans signe devant : ajoute (1d20-20), négatif si le dé fait moins de 20
 *
 *   Jet : 1d20 16-20  (aussi « 1d20 : 16 & 20 », « 1d10 ≤3 », « 1d10 >=8 », « 1d6 6 »)
 *
 * Ce fichier ne dépend de rien : la page, le serveur et les tests s'en servent.
 */
export type ValueOperation =
  | { kind: "add"; amount: number }
  | { kind: "set"; value: number }
  | { kind: "min"; value: number }
  | { kind: "max"; value: number }
  | { kind: "roll"; expression: string }

/** Ce que les états posés imposent à une valeur, en plus des ajouts. */
export type ModifierRule = { set?: number; min?: number; max?: number }

export type RollSpec = { dice: string; range: { min: number; max: number } | null }

const number = "[+-]?\\d+(?:\\.\\d+)?"
const dice = /\d*d\d+/i

function clean(text: string) {
  return text.replace(/\s+/g, "").replace(/[−–]/g, "-").replace(/,/g, ".").replace(/×/g, "*")
}

/** La colonne « Changement de valeur » lue : null si elle est vide ou illisible. */
export function parseValueChange(text: string): ValueOperation | null {
  const value = clean(text)
  if (!value) return null
  if (dice.test(value)) return /^[+-]?[\dd+\-*/().]+$/i.test(value) ? { kind: "roll", expression: value } : null
  const match = value.match(new RegExp(`^(=|≥|>=|min|≤|<=|max)?(${number})$`, "i"))
  if (match) {
    const amount = Number(match[2])
    const operator = (match[1] ?? "").toLowerCase()
    if (operator === "=") return { kind: "set", value: amount }
    if (operator === "≥" || operator === ">=" || operator === "min") return { kind: "min", value: amount }
    if (operator === "≤" || operator === "<=" || operator === "max") return { kind: "max", value: amount }
    return { kind: "add", amount }
  }
  // Un texte (« -10 PV ») : son premier nombre, comme avant.
  const first = value.match(new RegExp(number))
  return first ? { kind: "add", amount: Number(first[0]) } : null
}

/** L'opération telle qu'on l'écrit : « +10 », « =100 », « ≥1 », « -1d20+20 ». */
export function operationLabel(operation: ValueOperation) {
  if (operation.kind === "add") return `${operation.amount >= 0 ? "+" : ""}${operation.amount}`
  if (operation.kind === "set") return `=${operation.value}`
  if (operation.kind === "min") return `≥${operation.value}`
  if (operation.kind === "max") return `≤${operation.value}`
  return operation.expression
}

/**
 * Des dés à lancer, séparés du signe écrit tout devant : il vaut pour le total.
 * « -1d20+20 » → retirer (1d20+20) ; « +2d6 » ou « 2d6 » → ajouter.
 */
export function signedDice(expression: string): { sign: 1 | -1; dice: string } {
  const value = clean(expression)
  const match = value.match(/^([+-])(.+)$/)
  return match ? { sign: match[1] === "-" ? -1 : 1, dice: match[2] } : { sign: 1, dice: value }
}

/** Ajoute une règle à celles déjà posées : le dernier « = » l'emporte, les bornes se cumulent. */
export function mergeRule(rule: ModifierRule | undefined, operation: ValueOperation): ModifierRule | undefined {
  if (operation.kind === "set") return { ...rule, set: operation.value }
  if (operation.kind === "min") return { ...rule, min: rule?.min === undefined ? operation.value : Math.max(rule.min, operation.value) }
  if (operation.kind === "max") return { ...rule, max: rule?.max === undefined ? operation.value : Math.min(rule.max, operation.value) }
  return rule
}

/** La valeur une fois les règles appliquées : « = » d'abord, puis plancher et plafond. */
export function applyRule(value: number, rule: ModifierRule | undefined) {
  if (!rule) return value
  let result = rule.set ?? value
  if (rule.min !== undefined) result = Math.max(rule.min, result)
  if (rule.max !== undefined) result = Math.min(rule.max, result)
  return result
}

export function hasRule(rule: ModifierRule | undefined): rule is ModifierRule {
  return Boolean(rule && (rule.set !== undefined || rule.min !== undefined || rule.max !== undefined))
}

/** La règle en clair, pour le survol : « =100 », « ≥1 », « ≥1 ≤50 ». */
export function ruleLabel(rule: ModifierRule | undefined) {
  if (!rule) return ""
  return [rule.set !== undefined ? `=${rule.set}` : "", rule.min !== undefined ? `≥${rule.min}` : "", rule.max !== undefined ? `≤${rule.max}` : ""].filter(Boolean).join(" ")
}

/** La colonne « Jet » lue : les dés, puis la plage qui réussit (vide : toujours). */
export function parseRoll(text: string): RollSpec | null {
  const value = text.replace(/[−–]/g, "-").trim()
  const diceMatch = value.match(/^\s*([\dd+\-*/() ]*\d*d\d+[\dd+\-*/() ]*?)(?=\s*(?::|$|\s(?:entre|de|≥|>=|≤|<=|\d)))/i)
  if (!diceMatch) return null
  const diceText = diceMatch[1].replace(/\s+/g, "")
  if (!dice.test(diceText)) return null
  const rest = value.slice(diceMatch[0].length).replace(/^[\s:]+/, "").replace(/^(entre|de)\s+/i, "").trim()
  if (!rest) return { dice: diceText, range: null }
  const between = rest.match(/^(\d+)\s*(?:-|à|a|&|et|\.\.)\s*(\d+)$/i)
  if (between) {
    const [low, high] = [Number(between[1]), Number(between[2])].sort((left, right) => left - right)
    return { dice: diceText, range: { min: low, max: high } }
  }
  const atLeast = rest.match(/^(?:≥|>=|\+)\s*(\d+)$/) ?? rest.match(/^(\d+)\s*(?:\+|et plus|ou plus)$/i)
  if (atLeast) return { dice: diceText, range: { min: Number(atLeast[1]), max: Number.POSITIVE_INFINITY } }
  const atMost = rest.match(/^(?:≤|<=)\s*(\d+)$/) ?? rest.match(/^(\d+)\s*(?:ou moins|et moins)$/i)
  if (atMost) return { dice: diceText, range: { min: Number.NEGATIVE_INFINITY, max: Number(atMost[1]) } }
  const exact = rest.match(/^(\d+)$/)
  if (exact) return { dice: diceText, range: { min: Number(exact[1]), max: Number(exact[1]) } }
  return null
}

/** La plage en clair : « 16-20 », « ≥8 », « ≤3 », « 6 ». */
export function rangeLabel(range: RollSpec["range"]) {
  if (!range) return ""
  if (range.min === range.max) return String(range.min)
  if (range.max === Number.POSITIVE_INFINITY) return `≥${range.min}`
  if (range.min === Number.NEGATIVE_INFINITY) return `≤${range.max}`
  return `${range.min}-${range.max}`
}

export function rollHits(total: number, range: RollSpec["range"]) {
  return !range || (total >= range.min && total <= range.max)
}
