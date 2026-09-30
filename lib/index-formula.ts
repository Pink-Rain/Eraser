/**
 * Les formules des index : une syntaxe de tableur en français, où les colonnes de la
 * ligne s'écrivent entre accolades.
 *
 *   {Prix} * 2
 *   SI({Rang} >= 3; "Élite"; "Commun")
 *   JOINDRE(" · "; {Type}; {Sous-type})
 *
 * Rien n'est exécuté comme du code : la formule est lue par un petit analyseur, puis
 * calculée avec les seules fonctions de `formulaFunctions`. Chaque fonction y est
 * décrite avec ses exemples ; le guide « ? » de l'éditeur est construit à partir de
 * cette liste, et un test vérifie que chaque exemple donne bien le résultat annoncé.
 */
import {
  choiceKey,
  foldName,
  isCheckedValue,
  normalizeSpec,
  splitListValue,
  type FormulaResult,
  type IndexColumnSpec,
} from "@/lib/index-columns"
import { findUnit, formatAmount, formatIndexNumber, parseIndexNumber, type NumberFormat } from "@/lib/index-numbers"
import { rollDiceExpression } from "@/lib/math-expression"

// ---------------------------------------------------------------------------
// Valeurs
// ---------------------------------------------------------------------------

/** Une valeur de formule : nombre, texte, vrai/faux, vide, ou liste de valeurs. */
export type FormulaValue = number | string | boolean | null | FormulaValue[]

export class FormulaError extends Error {
  /** Position (en caractères) dans la formule, quand elle est connue. */
  readonly position?: number
  constructor(message: string, position?: number) {
    super(message)
    this.name = "FormulaError"
    this.position = position
  }
}

/** Ce que la formule sait de sa ligne. */
export type FormulaContext = {
  /** La valeur typée d'une colonne de la ligne ; `undefined` si la colonne n'existe pas. */
  column: (name: string) => FormulaValue | undefined
  /** Le texte brut et le type d'une colonne (CONVERTIR, RECHERCHE). */
  columnInfo?: (name: string) => { raw: string; spec?: IndexColumnSpec } | undefined
  /** Les valeurs d'une colonne des lignes reliées par une relation de la ligne. */
  related?: (via: string, field: string) => string[] | undefined
  /** Le nombre de lignes reliées par une relation. */
  relatedCount?: (via: string) => number | undefined
  /** Hasard (0 ≤ x < 1). Donné par l'appelant pour qu'un tirage reste stable. */
  random?: () => number
  rowNumber?: number
  tabName?: string
  now?: Date
}

function plainText(value: string) {
  return value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(?:p|div|li)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/gi, "'")
    .replace(/&amp;/gi, "&")
    .replace(/\n+$/, "")
    .trim()
}

function splitNamesOf(value: string) {
  const seen = new Set<string>()
  return value.split(/[,;\n]+/).map((name) => name.replace(/\s+/g, " ").trim()).filter((name) => {
    const key = foldName(name)
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/** La valeur d'unité par défaut d'un format de nombre (1 PO = 100 : la base est le PC). */
function unitFactor(format: NumberFormat | undefined) {
  if (!format?.unit || format.unit === "none") return 1
  return findUnit(format.unit, format.defaultUnit ?? "")?.factor ?? 1
}

/**
 * La valeur d'une case telle qu'une formule la voit, d'après le type de sa colonne :
 * un Nombre est un nombre (dans l'unité par défaut de la colonne : « 50 PC » dans une
 * colonne en PO vaut 0,5), une case à cocher est VRAI ou FAUX, une liste à plusieurs
 * choix ou une colonne liée est une liste, le reste est du texte.
 */
export function columnFormulaValue(raw: string, input?: IndexColumnSpec): FormulaValue {
  const text = plainText(raw)
  if (!input) return text || null
  const spec = normalizeSpec(input)
  switch (spec.kind) {
    case "checkbox":
      return isCheckedValue(text, spec.emptyChecked)
    case "number": {
      if (!text) return null
      const parsed = parseIndexNumber(text, spec.number ?? {})
      return parsed ? parsed.base / unitFactor(spec.number) : text
    }
    case "gauge": {
      if (!text) return null
      const parsed = Number.parseFloat(text.replace(",", "."))
      return Number.isFinite(parsed) ? parsed : text
    }
    case "linked":
    case "spells":
      return splitNamesOf(text)
    case "choice":
    case "linked-choice":
      return spec.multiple ? splitListValue(text, spec.options ?? []) : text || null
    case "file":
      return spec.file?.multiple ? text.split("\n").map((item) => item.trim()).filter(Boolean) : text || null
    default:
      return text || null
  }
}

function isList(value: FormulaValue): value is FormulaValue[] {
  return Array.isArray(value)
}

function flatten(values: FormulaValue[]): FormulaValue[] {
  return values.flatMap((value) => isList(value) ? flatten(value) : [value])
}

/** Un nombre à partir d'une valeur : « 12 », « 1,5 », « 12 kg » (le nombre en tête). */
export function toNumber(value: FormulaValue, position?: number): number {
  if (value === null) return 0
  if (typeof value === "number") return value
  if (typeof value === "boolean") return value ? 1 : 0
  if (isList(value)) {
    if (value.length === 1) return toNumber(value[0], position)
    if (!value.length) return 0
    throw new FormulaError("Une liste ne peut pas servir de nombre ici : utilise SOMME, MOYENNE, NB…", position)
  }
  const text = value.trim()
  if (!text) return 0
  const parsed = parseIndexNumber(text)
  if (parsed) return parsed.base
  throw new FormulaError(`« ${text} » n’est pas un nombre.`, position)
}

/** Le texte d'une valeur, tel qu'il s'affiche. */
export function toText(value: FormulaValue): string {
  if (value === null) return ""
  if (typeof value === "boolean") return value ? "VRAI" : "FAUX"
  if (typeof value === "number") return formatAmount(roundFloat(value))
  if (isList(value)) return value.map(toText).filter(Boolean).join(", ")
  return value
}

export function toBoolean(value: FormulaValue): boolean {
  if (value === null) return false
  if (typeof value === "boolean") return value
  if (typeof value === "number") return value !== 0
  if (isList(value)) return value.length > 0
  const text = value.trim()
  if (/^(faux|false|non|no|0)$/i.test(text)) return false
  return text.length > 0
}

function isEmpty(value: FormulaValue) {
  return value === null || (typeof value === "string" && !value.trim()) || (isList(value) && !value.length)
}

/** Évite 0,1 + 0,2 = 0,30000000000000004. */
function roundFloat(value: number) {
  return Math.round(value * 1e10) / 1e10
}

function compare(left: FormulaValue, right: FormulaValue): number {
  const bothNumeric = (value: FormulaValue) => typeof value === "number" || typeof value === "boolean" || value === null || (typeof value === "string" && value.trim() !== "" && parseIndexNumber(value.trim()) !== null && /^-?\d/.test(value.trim()))
  if (bothNumeric(left) && bothNumeric(right) && !(typeof left === "string" && typeof right === "string")) {
    const a = toNumber(left), b = toNumber(right)
    return a === b ? 0 : a < b ? -1 : 1
  }
  const a = foldName(toText(left)), b = foldName(toText(right))
  return a === b ? 0 : a.localeCompare(b, "fr", { numeric: true })
}

function equals(left: FormulaValue, right: FormulaValue): boolean {
  if (isList(left) && !isList(right)) return left.some((item) => equals(item, right))
  if (isList(right) && !isList(left)) return right.some((item) => equals(left, item))
  if (typeof left === "boolean" || typeof right === "boolean") return toBoolean(left) === toBoolean(right)
  return compare(left, right) === 0
}

// ---------------------------------------------------------------------------
// Lecture de la formule
// ---------------------------------------------------------------------------

type Token =
  | { type: "number"; value: number; position: number }
  | { type: "string"; value: string; position: number }
  | { type: "column"; value: string; position: number }
  | { type: "name"; value: string; position: number }
  | { type: "operator"; value: string; position: number }
  | { type: "open" | "close" | "separator"; position: number }

const operatorAliases: Record<string, string> = { "×": "*", "÷": "/", "≠": "<>", "≤": "<=", "≥": ">=", "==": "=", "!=": "<>" }

function tokenize(source: string): Token[] {
  const tokens: Token[] = []
  let index = 0
  while (index < source.length) {
    const char = source[index]
    if (/\s/.test(char)) { index += 1; continue }
    const position = index
    if (char === "{") {
      const end = source.indexOf("}", index)
      if (end < 0) throw new FormulaError("Accolade « { » jamais fermée : les colonnes s'écrivent {Nom de la colonne}.", position)
      const name = source.slice(index + 1, end).trim()
      if (!name) throw new FormulaError("Nom de colonne vide entre accolades.", position)
      tokens.push({ type: "column", value: name, position })
      index = end + 1
      continue
    }
    if (char === "\"" || char === "«" || char === "“") {
      const closing = char === "\"" ? "\"" : char === "«" ? "»" : "”"
      let value = ""
      index += 1
      while (true) {
        if (index >= source.length) throw new FormulaError("Texte jamais fermé : il manque un guillemet.", position)
        if (source[index] === closing) {
          if (closing === "\"" && source[index + 1] === "\"") { value += "\""; index += 2; continue }
          index += 1
          break
        }
        value += source[index]
        index += 1
      }
      tokens.push({ type: "string", value: closing === "»" ? value.trim() : value, position })
      continue
    }
    if (/\d/.test(char) || (char === "." && /\d/.test(source[index + 1] ?? ""))) {
      // 1,5 et 1.5 sont des décimales ; « 1, 5 » (avec une espace) sépare deux arguments.
      const match = source.slice(index).match(/^\d*(?:[.,]\d+)?/)!
      tokens.push({ type: "number", value: Number(match[0].replace(",", ".")), position })
      index += match[0].length
      continue
    }
    if (char === "(") { tokens.push({ type: "open", position }); index += 1; continue }
    if (char === ")") { tokens.push({ type: "close", position }); index += 1; continue }
    if (char === ";" || char === ",") { tokens.push({ type: "separator", position }); index += 1; continue }
    const two = source.slice(index, index + 2)
    if (["<=", ">=", "<>", "!=", "=="].includes(two)) { tokens.push({ type: "operator", value: operatorAliases[two] ?? two, position }); index += 2; continue }
    if ("+-*/^%&=<>×÷≠≤≥".includes(char)) { tokens.push({ type: "operator", value: operatorAliases[char] ?? char, position }); index += 1; continue }
    const name = source.slice(index).match(/^[\p{L}_][\p{L}\p{N}_.]*/u)
    if (name) { tokens.push({ type: "name", value: name[0], position }); index += name[0].length; continue }
    throw new FormulaError(`Caractère inattendu « ${char} ».`, position)
  }
  return tokens
}

export type FormulaNode =
  | { type: "number"; value: number }
  | { type: "string"; value: string }
  | { type: "boolean"; value: boolean }
  | { type: "column"; name: string; position: number }
  | { type: "call"; name: string; args: FormulaNode[]; position: number }
  | { type: "unary"; operator: "-" | "+"; operand: FormulaNode; position: number }
  | { type: "percent"; operand: FormulaNode; position: number }
  | { type: "binary"; operator: string; left: FormulaNode; right: FormulaNode; position: number }

class Parser {
  private index = 0
  private readonly tokens: Token[]
  private readonly source: string
  constructor(source: string) {
    this.source = source
    this.tokens = tokenize(source)
  }

  parse(): FormulaNode {
    if (!this.tokens.length) throw new FormulaError("La formule est vide.")
    const node = this.comparison()
    const extra = this.tokens[this.index]
    if (extra) throw new FormulaError(extra.type === "separator" ? "Point-virgule en trop : il sépare les arguments d’une fonction, à l’intérieur de ses parenthèses." : extra.type === "close" ? "Parenthèse « ) » en trop." : "La formule continue après une expression complète : il manque sans doute un opérateur (+, &, …).", extra.position)
    return node
  }

  private peek() { return this.tokens[this.index] }
  private next() { return this.tokens[this.index++] }
  private isOperator(...operators: string[]) {
    const token = this.peek()
    return token?.type === "operator" && operators.includes(token.value)
  }

  private comparison(): FormulaNode {
    let left = this.concat()
    while (this.isOperator("=", "<>", "<", ">", "<=", ">=")) {
      const token = this.next() as Extract<Token, { type: "operator" }>
      left = { type: "binary", operator: token.value, left, right: this.concat(), position: token.position }
    }
    return left
  }

  private concat(): FormulaNode {
    let left = this.additive()
    while (this.isOperator("&")) {
      const token = this.next()
      left = { type: "binary", operator: "&", left, right: this.additive(), position: token.position }
    }
    return left
  }

  private additive(): FormulaNode {
    let left = this.multiplicative()
    while (this.isOperator("+", "-")) {
      const token = this.next() as Extract<Token, { type: "operator" }>
      left = { type: "binary", operator: token.value, left, right: this.multiplicative(), position: token.position }
    }
    return left
  }

  private multiplicative(): FormulaNode {
    let left = this.power()
    while (this.isOperator("*", "/")) {
      const token = this.next() as Extract<Token, { type: "operator" }>
      left = { type: "binary", operator: token.value, left, right: this.power(), position: token.position }
    }
    return left
  }

  private power(): FormulaNode {
    const base = this.unary()
    if (this.isOperator("^")) {
      const token = this.next()
      return { type: "binary", operator: "^", left: base, right: this.power(), position: token.position }
    }
    return base
  }

  private unary(): FormulaNode {
    if (this.isOperator("-", "+")) {
      const token = this.next() as Extract<Token, { type: "operator" }>
      return { type: "unary", operator: token.value as "-" | "+", operand: this.unary(), position: token.position }
    }
    return this.postfix()
  }

  private postfix(): FormulaNode {
    let node = this.primary()
    while (this.isOperator("%")) {
      const token = this.next()
      node = { type: "percent", operand: node, position: token.position }
    }
    return node
  }

  private primary(): FormulaNode {
    const token = this.next()
    if (!token) throw new FormulaError("La formule s’arrête trop tôt : il manque une valeur.", this.source.length)
    if (token.type === "number") return { type: "number", value: token.value }
    if (token.type === "string") return { type: "string", value: token.value }
    if (token.type === "column") return { type: "column", name: token.value, position: token.position }
    if (token.type === "open") {
      const node = this.comparison()
      const close = this.next()
      if (close?.type !== "close") throw new FormulaError("Il manque une parenthèse fermante « ) ».", close?.position ?? this.source.length)
      return node
    }
    if (token.type === "name") {
      const upper = token.value.toUpperCase()
      if (this.peek()?.type === "open") {
        this.next()
        const args: FormulaNode[] = []
        if (this.peek()?.type !== "close") {
          while (true) {
            args.push(this.comparison())
            const separator = this.peek()
            if (separator?.type === "separator") { this.next(); continue }
            break
          }
        }
        const close = this.next()
        if (close?.type !== "close") throw new FormulaError(`Il manque la parenthèse fermante de ${upper}( ).`, close?.position ?? this.source.length)
        return { type: "call", name: upper, args, position: token.position }
      }
      if (["VRAI", "TRUE"].includes(upper)) return { type: "boolean", value: true }
      if (["FAUX", "FALSE"].includes(upper)) return { type: "boolean", value: false }
      if (findFunction(upper)) return { type: "call", name: upper, args: [], position: token.position }
      throw new FormulaError(`« ${token.value} » : les colonnes s’écrivent entre accolades, {${token.value}}, et les textes entre guillemets, "${token.value}".`, token.position)
    }
    if (token.type === "separator") throw new FormulaError("Point-virgule mal placé : il sépare les arguments d’une fonction.", token.position)
    if (token.type === "close") throw new FormulaError("Parenthèse « ) » inattendue.", token.position)
    throw new FormulaError(`« ${token.type === "operator" ? token.value : "("} » mal placé.`, token.position)
  }
}

const parseCache = new Map<string, FormulaNode | FormulaError>()

/** L'arbre d'une formule (gardé en mémoire : une colonne recalcule la même formule sur chaque ligne). */
export function parseFormula(source: string): FormulaNode {
  const cached = parseCache.get(source)
  if (cached instanceof FormulaError) throw cached
  if (cached) return cached
  try {
    const node = new Parser(source).parse()
    if (parseCache.size > 500) parseCache.clear()
    parseCache.set(source, node)
    return node
  } catch (error) {
    if (error instanceof FormulaError) parseCache.set(source, error)
    throw error
  }
}

/** Les colonnes citées par une formule. */
export function formulaColumns(source: string): string[] {
  try {
    const names: string[] = []
    const walk = (node: FormulaNode) => {
      if (node.type === "column") names.push(node.name)
      else if (node.type === "call") node.args.forEach(walk)
      else if (node.type === "unary" || node.type === "percent") walk(node.operand)
      else if (node.type === "binary") { walk(node.left); walk(node.right) }
    }
    walk(parseFormula(source))
    return [...new Set(names)]
  } catch {
    return []
  }
}

// ---------------------------------------------------------------------------
// Fonctions
// ---------------------------------------------------------------------------

export type FormulaCategory = "Logique" | "Nombres" | "Texte" | "Listes" | "Relations" | "Unités" | "Hasard" | "Ligne"

export const formulaCategories: Array<{ name: FormulaCategory; description: string }> = [
  { name: "Logique", description: "Choisir selon une condition, tester si une case est vide." },
  { name: "Nombres", description: "Calculer : somme, moyenne, arrondi, bornes…" },
  { name: "Texte", description: "Assembler, couper, chercher et transformer du texte." },
  { name: "Listes", description: "Travailler sur les colonnes à plusieurs valeurs (listes à choix multiple, colonnes liées)." },
  { name: "Relations", description: "Aller chercher des valeurs dans les lignes reliées d’un autre index." },
  { name: "Unités", description: "Convertir la monnaie, les distances et les poids." },
  { name: "Hasard", description: "Tirer au sort. Le résultat reste le même jusqu’à « Actualiser » ; pour garder un tirage, utilise une colonne Aléatoire." },
  { name: "Ligne", description: "Des informations sur la ligne elle-même." },
]

type Evaluate = (node: FormulaNode) => FormulaValue

export type FormulaFunction = {
  name: string
  aliases?: string[]
  category: FormulaCategory
  /** La forme d'appel, comme dans le guide : « SI(condition; si_vrai; si_faux) ». */
  signature: string
  description: string
  /** Exemples vérifiés par les tests (sur la ligne d'exemple `formulaSampleRow`). */
  examples: Array<{ formula: string; result: string; note?: string }>
  /** Nombre d'arguments attendus. */
  min: number
  max?: number
  /** Arguments passés sans être calculés (SI n'évalue que la branche choisie). */
  lazy?: boolean
  /** Les arguments qui désignent une colonne par son nom ({Relation}) au lieu de sa valeur. */
  columnArgs?: number[]
  /** Le résultat change à chaque tirage : les exemples ne sont pas comparés. */
  random?: boolean
  run: (args: FormulaValue[], context: FormulaContext, lazy: { nodes: FormulaNode[]; evaluate: Evaluate }) => FormulaValue
}

function numbersOf(args: FormulaValue[]) {
  return flatten(args).filter((value) => !isEmpty(value)).map((value) => toNumber(value))
}

function roundTo(value: number, digits: number, mode: "round" | "up" | "down") {
  const factor = 10 ** Math.trunc(digits)
  const scaled = roundFloat(value * factor)
  const rounded = mode === "round" ? Math.sign(scaled) * Math.round(Math.abs(scaled)) : mode === "up" ? Math.sign(scaled) * Math.ceil(Math.abs(scaled)) : Math.sign(scaled) * Math.floor(Math.abs(scaled))
  return rounded / factor
}

function listOf(value: FormulaValue): FormulaValue[] {
  if (isList(value)) return value
  if (isEmpty(value)) return []
  return [value]
}

function randomOf(context: FormulaContext) {
  return context.random ?? Math.random
}

function capitalize(text: string) {
  return text.toLocaleLowerCase("fr").replace(/(^|[\s'’-])(\p{L})/gu, (_, before: string, letter: string) => before + letter.toLocaleUpperCase("fr"))
}

export const formulaFunctions: FormulaFunction[] = [
  // Logique ----------------------------------------------------------------
  {
    name: "SI", aliases: ["IF"], category: "Logique", signature: "SI(condition; si_vrai; si_faux)", min: 2, max: 3, lazy: true,
    description: "Donne « si_vrai » quand la condition est vraie, sinon « si_faux » (vide si on l’omet).",
    examples: [{ formula: "SI({Rang} >= 3; \"Élite\"; \"Commun\")", result: "Élite" }, { formula: "SI({Dressable}; \"🐎\")", result: "🐎" }],
    run: (_args, _context, { nodes, evaluate }) => toBoolean(evaluate(nodes[0])) ? evaluate(nodes[1]) : nodes[2] ? evaluate(nodes[2]) : null,
  },
  {
    name: "SI.VIDE", aliases: ["SIVIDE", "IFBLANK"], category: "Logique", signature: "SI.VIDE(valeur; remplacement)", min: 2, max: 2, lazy: true,
    description: "La valeur, ou le remplacement quand elle est vide.",
    examples: [{ formula: "SI.VIDE({Note}; \"Aucune note\")", result: "Aucune note" }],
    run: (_args, _context, { nodes, evaluate }) => { const value = evaluate(nodes[0]); return isEmpty(value) ? evaluate(nodes[1]) : value },
  },
  {
    name: "SI.ERREUR", aliases: ["SIERREUR", "IFERROR"], category: "Logique", signature: "SI.ERREUR(valeur; remplacement)", min: 2, max: 2, lazy: true,
    description: "La valeur, ou le remplacement si son calcul échoue (division par zéro, texte au lieu d’un nombre…).",
    examples: [{ formula: "SI.ERREUR({PV} / 0; \"—\")", result: "—" }],
    run: (_args, _context, { nodes, evaluate }) => { try { return evaluate(nodes[0]) } catch (error) { if (error instanceof FormulaError) return evaluate(nodes[1]); throw error } },
  },
  {
    name: "ET", aliases: ["AND"], category: "Logique", signature: "ET(condition1; condition2; …)", min: 1,
    description: "VRAI si toutes les conditions sont vraies.",
    examples: [{ formula: "ET({Rang} >= 3; {Dressable})", result: "VRAI" }],
    run: (args) => flatten(args).every(toBoolean),
  },
  {
    name: "OU", aliases: ["OR"], category: "Logique", signature: "OU(condition1; condition2; …)", min: 1,
    description: "VRAI si au moins une condition est vraie.",
    examples: [{ formula: "OU({Rang} > 4; {Dressable})", result: "VRAI" }],
    run: (args) => flatten(args).some(toBoolean),
  },
  {
    name: "OUX", aliases: ["XOR"], category: "Logique", signature: "OUX(condition1; condition2; …)", min: 1,
    description: "VRAI si un nombre impair de conditions sont vraies (« l’un ou l’autre, pas les deux »).",
    examples: [{ formula: "OUX(VRAI; FAUX)", result: "VRAI" }],
    run: (args) => flatten(args).filter(toBoolean).length % 2 === 1,
  },
  {
    name: "NON", aliases: ["NOT"], category: "Logique", signature: "NON(condition)", min: 1, max: 1,
    description: "L’inverse : VRAI devient FAUX et inversement.",
    examples: [{ formula: "NON({Dressable})", result: "FAUX" }],
    run: (args) => !toBoolean(args[0]),
  },
  {
    name: "SELON", aliases: ["SWITCH"], category: "Logique", signature: "SELON(valeur; cas1; résultat1; cas2; résultat2; …; défaut)", min: 3, lazy: true,
    description: "Compare la valeur à chaque cas et donne le résultat du premier qui correspond ; le dernier argument, s’il est seul, sert par défaut.",
    examples: [{ formula: "SELON({Rang}; 1; \"Faible\"; 3; \"Moyen\"; 5; \"Fort\"; \"?\")", result: "Moyen" }],
    run: (_args, _context, { nodes, evaluate }) => {
      const value = evaluate(nodes[0])
      let index = 1
      for (; index + 1 < nodes.length; index += 2) if (equals(value, evaluate(nodes[index]))) return evaluate(nodes[index + 1])
      return index < nodes.length ? evaluate(nodes[index]) : null
    },
  },
  {
    name: "CHOISIR", aliases: ["CHOOSE"], category: "Logique", signature: "CHOISIR(numéro; valeur1; valeur2; …)", min: 2, lazy: true,
    description: "La valeur à la position donnée (1 pour la première).",
    examples: [{ formula: "CHOISIR(2; \"Nord\"; \"Sud\"; \"Est\")", result: "Sud" }],
    run: (_args, _context, { nodes, evaluate }) => {
      const position = Math.trunc(toNumber(evaluate(nodes[0])))
      if (position < 1 || position >= nodes.length) throw new FormulaError(`CHOISIR : pas de valeur n° ${position}.`)
      return evaluate(nodes[position])
    },
  },
  {
    name: "EST.VIDE", aliases: ["ESTVIDE", "ISBLANK"], category: "Logique", signature: "EST.VIDE(valeur)", min: 1, max: 1,
    description: "VRAI si la valeur est vide.",
    examples: [{ formula: "EST.VIDE({Note})", result: "VRAI" }],
    run: (args) => isEmpty(args[0]),
  },
  {
    name: "EST.NOMBRE", aliases: ["ESTNUM", "ISNUMBER"], category: "Logique", signature: "EST.NOMBRE(valeur)", min: 1, max: 1,
    description: "VRAI si la valeur est un nombre (ou un texte qui en est un).",
    examples: [{ formula: "EST.NOMBRE({Rang})", result: "VRAI" }, { formula: "EST.NOMBRE({Nom})", result: "FAUX" }],
    run: (args) => typeof args[0] === "number" || (typeof args[0] === "string" && /^\s*-?\d+(?:[.,]\d+)?\s*$/.test(args[0])),
  },
  {
    name: "CONTIENT", aliases: ["CONTAINS"], category: "Logique", signature: "CONTIENT(texte_ou_liste; cherché)", min: 2, max: 2,
    description: "VRAI si le texte contient le mot cherché, ou si la liste contient la valeur (sans tenir compte des majuscules ni des accents).",
    examples: [{ formula: "CONTIENT({Peuples}; \"elfes\")", result: "VRAI" }, { formula: "CONTIENT({Nom}; \"gob\")", result: "VRAI" }],
    run: (args) => {
      const needle = foldName(toText(args[1]))
      if (isList(args[0])) return args[0].some((item) => foldName(toText(item)) === needle)
      return foldName(toText(args[0])).includes(needle)
    },
  },

  // Nombres ----------------------------------------------------------------
  {
    name: "SOMME", aliases: ["SUM"], category: "Nombres", signature: "SOMME(valeur1; valeur2; …)", min: 1,
    description: "L’addition de toutes les valeurs (les listes comprises).",
    examples: [{ formula: "SOMME({PV}; 5)", result: "17" }, { formula: "SOMME({Dégâts})", result: "9", note: "{Dégâts} est une liste « 4, 5 »." }],
    run: (args) => numbersOf(args).reduce((total, value) => total + value, 0),
  },
  {
    name: "MOYENNE", aliases: ["AVERAGE"], category: "Nombres", signature: "MOYENNE(valeur1; valeur2; …)", min: 1,
    description: "La moyenne des valeurs non vides.",
    examples: [{ formula: "MOYENNE({PV}; {PV max})", result: "16" }],
    run: (args) => { const numbers = numbersOf(args); return numbers.length ? numbers.reduce((total, value) => total + value, 0) / numbers.length : null },
  },
  {
    name: "MIN", category: "Nombres", signature: "MIN(valeur1; valeur2; …)", min: 1,
    description: "La plus petite valeur.",
    examples: [{ formula: "MIN({PV}; {PV max})", result: "12" }],
    run: (args) => { const numbers = numbersOf(args); return numbers.length ? Math.min(...numbers) : null },
  },
  {
    name: "MAX", category: "Nombres", signature: "MAX(valeur1; valeur2; …)", min: 1,
    description: "La plus grande valeur.",
    examples: [{ formula: "MAX({PV}; {PV max})", result: "20" }],
    run: (args) => { const numbers = numbersOf(args); return numbers.length ? Math.max(...numbers) : null },
  },
  {
    name: "PRODUIT", aliases: ["PRODUCT"], category: "Nombres", signature: "PRODUIT(valeur1; valeur2; …)", min: 1,
    description: "La multiplication de toutes les valeurs.",
    examples: [{ formula: "PRODUIT({Rang}; 2; 5)", result: "30" }],
    run: (args) => numbersOf(args).reduce((total, value) => total * value, 1),
  },
  {
    name: "ARRONDI", aliases: ["ROUND"], category: "Nombres", signature: "ARRONDI(nombre; décimales)", min: 1, max: 2,
    description: "Arrondi au plus proche, avec 0 décimale si on ne précise rien.",
    examples: [{ formula: "ARRONDI(2,567; 1)", result: "2,6" }, { formula: "ARRONDI({PV} / 5)", result: "2" }],
    run: (args) => roundTo(toNumber(args[0]), args[1] === undefined ? 0 : toNumber(args[1]), "round"),
  },
  {
    name: "ARRONDI.SUP", aliases: ["ARRONDISUP", "ROUNDUP"], category: "Nombres", signature: "ARRONDI.SUP(nombre; décimales)", min: 1, max: 2,
    description: "Arrondi vers le haut (en s’éloignant de zéro).",
    examples: [{ formula: "ARRONDI.SUP({PV} / 5)", result: "3" }],
    run: (args) => roundTo(toNumber(args[0]), args[1] === undefined ? 0 : toNumber(args[1]), "up"),
  },
  {
    name: "ARRONDI.INF", aliases: ["ARRONDIINF", "ROUNDDOWN"], category: "Nombres", signature: "ARRONDI.INF(nombre; décimales)", min: 1, max: 2,
    description: "Arrondi vers le bas (vers zéro).",
    examples: [{ formula: "ARRONDI.INF({PV} / 5)", result: "2" }],
    run: (args) => roundTo(toNumber(args[0]), args[1] === undefined ? 0 : toNumber(args[1]), "down"),
  },
  {
    name: "ENT", aliases: ["INT"], category: "Nombres", signature: "ENT(nombre)", min: 1, max: 1,
    description: "La partie entière, en arrondissant vers le bas (−2,5 donne −3).",
    examples: [{ formula: "ENT(7,9)", result: "7" }],
    run: (args) => Math.floor(toNumber(args[0])),
  },
  {
    name: "ABS", category: "Nombres", signature: "ABS(nombre)", min: 1, max: 1,
    description: "La valeur sans son signe.",
    examples: [{ formula: "ABS({PV} - {PV max})", result: "8" }],
    run: (args) => Math.abs(toNumber(args[0])),
  },
  {
    name: "RACINE", aliases: ["SQRT"], category: "Nombres", signature: "RACINE(nombre)", min: 1, max: 1,
    description: "La racine carrée.",
    examples: [{ formula: "RACINE(81)", result: "9" }],
    run: (args) => { const value = toNumber(args[0]); if (value < 0) throw new FormulaError("RACINE d’un nombre négatif."); return Math.sqrt(value) },
  },
  {
    name: "PUISSANCE", aliases: ["POWER"], category: "Nombres", signature: "PUISSANCE(nombre; exposant)", min: 2, max: 2,
    description: "Le nombre élevé à la puissance (comme nombre ^ exposant).",
    examples: [{ formula: "PUISSANCE(2; 5)", result: "32" }],
    run: (args) => toNumber(args[0]) ** toNumber(args[1]),
  },
  {
    name: "MOD", category: "Nombres", signature: "MOD(nombre; diviseur)", min: 2, max: 2,
    description: "Le reste de la division.",
    examples: [{ formula: "MOD(17; 5)", result: "2" }],
    run: (args) => { const divisor = toNumber(args[1]); if (divisor === 0) throw new FormulaError("MOD : division par zéro."); const value = toNumber(args[0]); return value - divisor * Math.floor(value / divisor) },
  },
  {
    name: "SIGNE", aliases: ["SIGN"], category: "Nombres", signature: "SIGNE(nombre)", min: 1, max: 1,
    description: "1 si positif, −1 si négatif, 0 pour zéro.",
    examples: [{ formula: "SIGNE({PV} - {PV max})", result: "-1" }],
    run: (args) => Math.sign(toNumber(args[0])),
  },
  {
    name: "BORNER", aliases: ["CLAMP"], category: "Nombres", signature: "BORNER(nombre; minimum; maximum)", min: 3, max: 3,
    description: "Le nombre ramené entre le minimum et le maximum.",
    examples: [{ formula: "BORNER({PV} + 15; 0; {PV max})", result: "20" }],
    run: (args) => Math.min(toNumber(args[2]), Math.max(toNumber(args[1]), toNumber(args[0]))),
  },
  {
    name: "POURCENTAGE", aliases: ["PERCENT"], category: "Nombres", signature: "POURCENTAGE(partie; total)", min: 2, max: 2,
    description: "La partie en pourcentage du total (12 sur 20 donne 60).",
    examples: [{ formula: "POURCENTAGE({PV}; {PV max})", result: "60" }],
    run: (args) => { const total = toNumber(args[1]); if (total === 0) throw new FormulaError("POURCENTAGE : le total vaut zéro."); return toNumber(args[0]) / total * 100 },
  },
  {
    name: "PI", category: "Nombres", signature: "PI()", min: 0, max: 0,
    description: "Le nombre π (3,14159…).",
    examples: [{ formula: "ARRONDI(PI(); 2)", result: "3,14" }],
    run: () => Math.PI,
  },

  // Texte ------------------------------------------------------------------
  {
    name: "CONCAT", aliases: ["CONCATENER", "CONCATENATE"], category: "Texte", signature: "CONCAT(texte1; texte2; …)", min: 1,
    description: "Les textes mis bout à bout (comme l’opérateur &).",
    examples: [{ formula: "CONCAT({Nom}; \" (rang \"; {Rang}; \")\")", result: "Gobelin (rang 3)" }],
    run: (args) => flatten(args).map(toText).join(""),
  },
  {
    name: "JOINDRE", aliases: ["TEXTJOIN", "JOIN"], category: "Texte", signature: "JOINDRE(séparateur; valeur1; valeur2; …)", min: 2,
    description: "Les valeurs non vides réunies avec le séparateur (les listes comprises).",
    examples: [{ formula: "JOINDRE(\" · \"; {Type}; {Sous-type})", result: "Humanoïde · Pillard" }, { formula: "JOINDRE(\" / \"; {Peuples})", result: "Elfes / Nains" }],
    run: (args) => flatten(args.slice(1)).filter((value) => !isEmpty(value)).map(toText).join(toText(args[0])),
  },
  {
    name: "MAJUSCULE", aliases: ["UPPER"], category: "Texte", signature: "MAJUSCULE(texte)", min: 1, max: 1,
    description: "Tout en majuscules.",
    examples: [{ formula: "MAJUSCULE({Nom})", result: "GOBELIN" }],
    run: (args) => toText(args[0]).toLocaleUpperCase("fr"),
  },
  {
    name: "MINUSCULE", aliases: ["LOWER"], category: "Texte", signature: "MINUSCULE(texte)", min: 1, max: 1,
    description: "Tout en minuscules.",
    examples: [{ formula: "MINUSCULE({Nom})", result: "gobelin" }],
    run: (args) => toText(args[0]).toLocaleLowerCase("fr"),
  },
  {
    name: "NOMPROPRE", aliases: ["PROPER"], category: "Texte", signature: "NOMPROPRE(texte)", min: 1, max: 1,
    description: "Une majuscule au début de chaque mot.",
    examples: [{ formula: "NOMPROPRE(\"forêt noire\")", result: "Forêt Noire" }],
    run: (args) => capitalize(toText(args[0])),
  },
  {
    name: "LONGUEUR", aliases: ["NBCAR", "LEN"], category: "Texte", signature: "LONGUEUR(texte)", min: 1, max: 1,
    description: "Le nombre de caractères.",
    examples: [{ formula: "LONGUEUR({Nom})", result: "7" }],
    run: (args) => [...toText(args[0])].length,
  },
  {
    name: "GAUCHE", aliases: ["LEFT"], category: "Texte", signature: "GAUCHE(texte; nombre)", min: 1, max: 2,
    description: "Les premiers caractères (1 si on ne précise rien).",
    examples: [{ formula: "GAUCHE({Nom}; 3)", result: "Gob" }],
    run: (args) => [...toText(args[0])].slice(0, Math.max(0, Math.trunc(args[1] === undefined ? 1 : toNumber(args[1])))).join(""),
  },
  {
    name: "DROITE", aliases: ["RIGHT"], category: "Texte", signature: "DROITE(texte; nombre)", min: 1, max: 2,
    description: "Les derniers caractères (1 si on ne précise rien).",
    examples: [{ formula: "DROITE({Nom}; 3)", result: "lin" }],
    run: (args) => { const chars = [...toText(args[0])]; const count = Math.max(0, Math.trunc(args[1] === undefined ? 1 : toNumber(args[1]))); return count ? chars.slice(-count).join("") : "" },
  },
  {
    name: "STXT", aliases: ["MID"], category: "Texte", signature: "STXT(texte; début; nombre)", min: 3, max: 3,
    description: "Un morceau du texte, à partir du caractère « début » (1 pour le premier).",
    examples: [{ formula: "STXT({Nom}; 2; 3)", result: "obe" }],
    run: (args) => [...toText(args[0])].slice(Math.max(0, Math.trunc(toNumber(args[1])) - 1), Math.max(0, Math.trunc(toNumber(args[1])) - 1) + Math.max(0, Math.trunc(toNumber(args[2])))).join(""),
  },
  {
    name: "CHERCHE", aliases: ["SEARCH", "TROUVE", "FIND"], category: "Texte", signature: "CHERCHE(cherché; texte)", min: 2, max: 2,
    description: "La position du mot cherché dans le texte (1 pour le début), ou 0 s’il n’y est pas. Majuscules et accents ignorés.",
    examples: [{ formula: "CHERCHE(\"lin\"; {Nom})", result: "5" }],
    run: (args) => foldName(toText(args[1])).indexOf(foldName(toText(args[0]))) + 1,
  },
  {
    name: "COMMENCE.PAR", aliases: ["COMMENCEPAR", "STARTSWITH"], category: "Texte", signature: "COMMENCE.PAR(texte; début)", min: 2, max: 2,
    description: "VRAI si le texte commence ainsi (majuscules et accents ignorés).",
    examples: [{ formula: "COMMENCE.PAR({Nom}; \"gob\")", result: "VRAI" }],
    run: (args) => foldName(toText(args[0])).startsWith(foldName(toText(args[1]))),
  },
  {
    name: "FINIT.PAR", aliases: ["FINITPAR", "ENDSWITH"], category: "Texte", signature: "FINIT.PAR(texte; fin)", min: 2, max: 2,
    description: "VRAI si le texte finit ainsi (majuscules et accents ignorés).",
    examples: [{ formula: "FINIT.PAR({Nom}; \"LIN\")", result: "VRAI" }],
    run: (args) => foldName(toText(args[0])).endsWith(foldName(toText(args[1]))),
  },
  {
    name: "REMPLACER", aliases: ["SUBSTITUE", "SUBSTITUTE", "REPLACE"], category: "Texte", signature: "REMPLACER(texte; ancien; nouveau)", min: 3, max: 3,
    description: "Remplace chaque « ancien » par « nouveau ».",
    examples: [{ formula: "REMPLACER({Nom}; \"G\"; \"H\")", result: "Hobelin" }],
    run: (args) => { const search = toText(args[1]); return search ? toText(args[0]).split(search).join(toText(args[2])) : toText(args[0]) },
  },
  {
    name: "SUPPRESPACE", aliases: ["TRIM"], category: "Texte", signature: "SUPPRESPACE(texte)", min: 1, max: 1,
    description: "Retire les espaces au début, à la fin et en double.",
    examples: [{ formula: "SUPPRESPACE(\"  Forêt   noire \")", result: "Forêt noire" }],
    run: (args) => toText(args[0]).replace(/\s+/g, " ").trim(),
  },
  {
    name: "REPETER", aliases: ["REPT"], category: "Texte", signature: "REPETER(texte; nombre)", min: 2, max: 2,
    description: "Le texte répété (100 fois au plus). Pratique pour dessiner une jauge : REPETER(\"★\"; {Rang}).",
    examples: [{ formula: "REPETER(\"★\"; {Rang})", result: "★★★" }],
    run: (args) => toText(args[0]).repeat(Math.max(0, Math.min(100, Math.trunc(toNumber(args[1]))))),
  },
  {
    name: "TEXTE", aliases: ["TEXT"], category: "Texte", signature: "TEXTE(nombre; décimales)", min: 1, max: 2,
    description: "Le nombre écrit à la française (« 1 234,5 »), avec le nombre de décimales voulu.",
    examples: [{ formula: "TEXTE(1234,5; 2)", result: "1 234,50" }],
    run: (args) => formatAmount(toNumber(args[0]), args[1] === undefined ? undefined : Math.max(0, Math.min(6, Math.trunc(toNumber(args[1]))))),
  },
  {
    name: "NOMBRE", aliases: ["CNUM", "VALUE", "VALEUR"], category: "Texte", signature: "NOMBRE(texte)", min: 1, max: 1,
    description: "Le nombre au début d’un texte (« 12 kg » donne 12).",
    examples: [{ formula: "NOMBRE(\"12 kg\") * 2", result: "24" }],
    run: (args) => toNumber(args[0]),
  },

  // Listes ------------------------------------------------------------------
  {
    name: "LISTE", aliases: ["LIST"], category: "Listes", signature: "LISTE(valeur1; valeur2; …)", min: 0,
    description: "Une liste faite des valeurs données (les listes sont mises à plat, les vides retirés).",
    examples: [{ formula: "JOINDRE(\", \"; LISTE(\"Or\"; {Peuples}))", result: "Or, Elfes, Nains" }],
    run: (args) => flatten(args).filter((value) => !isEmpty(value)),
  },
  {
    name: "NB", aliases: ["NBVAL", "COUNT", "COUNTA"], category: "Listes", signature: "NB(valeur1; valeur2; …)", min: 1,
    description: "Le nombre de valeurs non vides (les éléments d’une liste comptent un par un).",
    examples: [{ formula: "NB({Peuples})", result: "2" }],
    run: (args) => flatten(args).filter((value) => !isEmpty(value)).length,
  },
  {
    name: "ELEMENT", aliases: ["INDEX", "ITEM"], category: "Listes", signature: "ELEMENT(liste; numéro)", min: 2, max: 2,
    description: "L’élément à la position donnée (1 pour le premier, −1 pour le dernier).",
    examples: [{ formula: "ELEMENT({Peuples}; 2)", result: "Nains" }],
    run: (args) => { const list = listOf(args[0]); const position = Math.trunc(toNumber(args[1])); return (position < 0 ? list[list.length + position] : list[position - 1]) ?? null },
  },
  {
    name: "PREMIER", aliases: ["FIRST"], category: "Listes", signature: "PREMIER(liste)", min: 1, max: 1,
    description: "Le premier élément.",
    examples: [{ formula: "PREMIER({Peuples})", result: "Elfes" }],
    run: (args) => listOf(args[0])[0] ?? null,
  },
  {
    name: "DERNIER", aliases: ["LAST"], category: "Listes", signature: "DERNIER(liste)", min: 1, max: 1,
    description: "Le dernier élément.",
    examples: [{ formula: "DERNIER({Peuples})", result: "Nains" }],
    run: (args) => { const list = listOf(args[0]); return list[list.length - 1] ?? null },
  },
  {
    name: "UNIQUE", category: "Listes", signature: "UNIQUE(liste)", min: 1,
    description: "La liste sans doublons (majuscules et accents ignorés).",
    examples: [{ formula: "UNIQUE(LISTE(\"Elfes\"; {Peuples}))", result: "Elfes, Nains" }],
    run: (args) => { const seen = new Set<string>(); return flatten(args).filter((value) => { const key = choiceKey(toText(value)); if (!key || seen.has(key)) return false; seen.add(key); return true }) },
  },
  {
    name: "TRIER", aliases: ["SORT"], category: "Listes", signature: "TRIER(liste; ordre)", min: 1, max: 2,
    description: "La liste triée ; ordre « desc » pour décroissant.",
    examples: [{ formula: "TRIER(LISTE(\"Orcs\"; \"Elfes\"; \"Nains\"))", result: "Elfes, Nains, Orcs" }],
    run: (args) => { const list = [...listOf(args[0])].sort(compare); return /^desc/i.test(toText(args[1] ?? "")) ? list.reverse() : list },
  },
  {
    name: "INVERSER", aliases: ["REVERSE"], category: "Listes", signature: "INVERSER(liste)", min: 1, max: 1,
    description: "La liste à l’envers.",
    examples: [{ formula: "INVERSER({Peuples})", result: "Nains, Elfes" }],
    run: (args) => [...listOf(args[0])].reverse(),
  },
  {
    name: "DIVISER", aliases: ["SPLIT", "SEPARER"], category: "Listes", signature: "DIVISER(texte; séparateur)", min: 1, max: 2,
    description: "Coupe un texte en liste (à chaque virgule si on ne précise pas le séparateur).",
    examples: [{ formula: "NB(DIVISER(\"a/b/c\"; \"/\"))", result: "3" }],
    run: (args) => { const separator = args[1] === undefined ? "," : toText(args[1]); return toText(args[0]).split(separator || ",").map((item) => item.trim()).filter(Boolean) },
  },

  // Relations ---------------------------------------------------------------
  {
    name: "RECHERCHE", aliases: ["LOOKUP", "RELIES"], category: "Relations", signature: "RECHERCHE({Relation}; \"Colonne\")", min: 2, max: 2, columnArgs: [0],
    description: "Les valeurs de « Colonne » dans les lignes reliées par la colonne {Relation} (colonne liée ↔ ou liste liée) : une liste. Comme une colonne Recherche, mais dans une formule.",
    examples: [{ formula: "JOINDRE(\", \"; RECHERCHE({Peuples}; \"Région\"))", result: "Sylve, Montagnes", note: "Les Elfes vivent en Sylve, les Nains dans les Montagnes." }],
    run: (args, context) => {
      const values = context.related?.(toText(args[0]), toText(args[1]))
      if (values === undefined) throw new FormulaError(`RECHERCHE : {${toText(args[0])}} n’est pas une relation (colonne liée ou liste liée) de cette ligne.`)
      return values.flatMap((value) => splitNamesOf(plainText(value)).length > 1 ? splitNamesOf(plainText(value)) : [plainText(value)]).filter(Boolean)
    },
  },
  {
    name: "NB.RELIES", aliases: ["NBRELIES", "COUNTLINKED"], category: "Relations", signature: "NB.RELIES({Relation})", min: 1, max: 1, columnArgs: [0],
    description: "Le nombre de lignes reliées par la colonne {Relation} et trouvées dans l’autre index.",
    examples: [{ formula: "NB.RELIES({Peuples})", result: "2" }],
    run: (args, context) => {
      const count = context.relatedCount?.(toText(args[0]))
      if (count === undefined) throw new FormulaError(`NB.RELIES : {${toText(args[0])}} n’est pas une relation de cette ligne.`)
      return count
    },
  },

  // Unités ------------------------------------------------------------------
  {
    name: "CONVERTIR", aliases: ["CONVERT"], category: "Unités", signature: "CONVERTIR(valeur; \"unité\")", min: 2, max: 2, columnArgs: [0],
    description: "Une somme, une distance ou un poids dans l’unité voulue : PO, PC, PN ; cm, m, km ; g, kg, t. La valeur peut être une colonne Nombre ({Prix}) ou un texte (\"3 PO\").",
    examples: [{ formula: "CONVERTIR({Prix}; \"PC\")", result: "200" }, { formula: "CONVERTIR(\"3 PO\"; \"PN\")", result: "2" }, { formula: "CONVERTIR(\"1,5 km\"; \"m\")", result: "1 500" }],
    run: (args, context) => {
      const target = toText(args[1]).trim()
      const families = ["money", "distance", "weight"] as const
      const family = families.find((candidate) => findUnit(candidate, target))
      if (!family) throw new FormulaError(`CONVERTIR : unité « ${target} » inconnue (PO, PC, PN, cm, m, km, g, kg, t).`)
      const info = context.columnInfo?.(toText(args[0]))
      const raw = info ? plainText(info.raw) : toText(args[0])
      const spec = info?.spec ? normalizeSpec(info.spec) : undefined
      const format: NumberFormat = spec?.number?.unit === family ? spec.number : { unit: family }
      const parsed = parseIndexNumber(raw, format)
      if (!parsed) return null
      return parsed.base / (findUnit(family, target)?.factor ?? 1)
    },
  },

  // Hasard -------------------------------------------------------------------
  {
    name: "ALEA", aliases: ["RAND"], category: "Hasard", signature: "ALEA()", min: 0, max: 0, random: true,
    description: "Un nombre au hasard entre 0 (compris) et 1 (non compris).",
    examples: [{ formula: "ALEA() < 0,5", result: "VRAI ou FAUX, une fois sur deux" }],
    run: (_args, context) => randomOf(context)(),
  },
  {
    name: "ALEA.ENTRE", aliases: ["ALEAENTRE", "RANDBETWEEN"], category: "Hasard", signature: "ALEA.ENTRE(minimum; maximum)", min: 2, max: 2, random: true,
    description: "Un nombre entier au hasard, bornes comprises.",
    examples: [{ formula: "ALEA.ENTRE(1; 20)", result: "un nombre de 1 à 20" }],
    run: (args, context) => { const low = Math.ceil(toNumber(args[0])), high = Math.floor(toNumber(args[1])); if (high < low) throw new FormulaError("ALEA.ENTRE : le minimum dépasse le maximum."); return low + Math.floor(randomOf(context)() * (high - low + 1)) },
  },
  {
    name: "DES", aliases: ["DÉS", "DICE", "LANCER"], category: "Hasard", signature: "DES(\"2d6+1\")", min: 1, max: 1, random: true,
    description: "Le total d’un jet de dés : « 1d20 », « 2d6+1 », « 3d8 - 2 », « 1d100 / 2 »… (jusqu’à 100 dés de 10 000 faces).",
    examples: [{ formula: "DES(\"2d6\") + {Rang}", result: "de 5 à 15" }],
    run: (args, context) => {
      const expression = toText(args[0]).replace(/\s+/g, "")
      if (!/\d*d\d+/i.test(expression)) throw new FormulaError("DES : écris le jet comme « 2d6+1 ».")
      if (!context.random) { try { return rollDiceExpression(expression).total } catch { throw new FormulaError(`DES : « ${expression} » n’est pas un jet valable.`) } }
      const random = context.random
      const replaced = expression.replace(/(\d*)d(\d+)/gi, (_, countText: string, sidesText: string) => {
        const count = Math.max(1, Number(countText || "1")), sides = Number(sidesText)
        if (count > 100 || sides < 2 || sides > 10000) throw new FormulaError(`DES : « ${expression} » n’est pas un jet valable.`)
        let total = 0
        for (let index = 0; index < count; index += 1) total += 1 + Math.floor(random() * sides)
        return `(${total})`
      })
      return toNumber(evaluateNode(parseFormula(replaced), context))
    },
  },
  {
    name: "TIRER", aliases: ["CHOIX.HASARD", "PICK"], category: "Hasard", signature: "TIRER(valeur1; valeur2; …)", min: 1, random: true,
    description: "Une valeur au hasard parmi celles données (les listes comprises).",
    examples: [{ formula: "TIRER({Peuples})", result: "Elfes ou Nains" }, { formula: "TIRER(\"Pluie\"; \"Soleil\"; \"Brume\")", result: "l’une des trois" }],
    run: (args, context) => { const values = flatten(args).filter((value) => !isEmpty(value)); return values.length ? values[Math.floor(randomOf(context)() * values.length)] : null },
  },
  {
    name: "MELANGER", aliases: ["MÉLANGER", "SHUFFLE"], category: "Hasard", signature: "MELANGER(liste)", min: 1, random: true,
    description: "La liste dans un ordre au hasard.",
    examples: [{ formula: "PREMIER(MELANGER({Peuples}))", result: "Elfes ou Nains" }],
    run: (args, context) => {
      const values = flatten(args).filter((value) => !isEmpty(value))
      const random = randomOf(context)
      for (let index = values.length - 1; index > 0; index -= 1) { const other = Math.floor(random() * (index + 1)); [values[index], values[other]] = [values[other], values[index]] }
      return values
    },
  },

  // Ligne ---------------------------------------------------------------------
  {
    name: "LIGNE", aliases: ["ROW"], category: "Ligne", signature: "LIGNE()", min: 0, max: 0,
    description: "Le numéro de la ligne dans Google Sheets.",
    examples: [{ formula: "LIGNE()", result: "12" }],
    run: (_args, context) => context.rowNumber ?? null,
  },
  {
    name: "ONGLET", aliases: ["TAB"], category: "Ligne", signature: "ONGLET()", min: 0, max: 0,
    description: "Le nom de l’onglet de la ligne.",
    examples: [{ formula: "ONGLET()", result: "Créatures" }],
    run: (_args, context) => context.tabName ?? null,
  },
  {
    name: "AUJOURDHUI", aliases: ["TODAY"], category: "Ligne", signature: "AUJOURDHUI()", min: 0, max: 0,
    description: "La date du jour, écrite « 30/09/2026 ».",
    examples: [{ formula: "AUJOURDHUI()", result: "la date du jour" }],
    random: true,
    run: (_args, context) => (context.now ?? new Date()).toLocaleDateString("fr-FR"),
  },
]

const functionIndex = new Map<string, FormulaFunction>()
for (const definition of formulaFunctions) for (const name of [definition.name, ...(definition.aliases ?? [])]) functionIndex.set(foldName(name).toUpperCase(), definition)

export function findFunction(name: string) {
  return functionIndex.get(foldName(name).toUpperCase())
}

function distance(left: string, right: string) {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index)
  for (let i = 1; i <= left.length; i += 1) {
    let diagonal = previous[0]
    previous[0] = i
    for (let j = 1; j <= right.length; j += 1) {
      const saved = previous[j]
      previous[j] = Math.min(previous[j] + 1, previous[j - 1] + 1, diagonal + (left[i - 1] === right[j - 1] ? 0 : 1))
      diagonal = saved
    }
  }
  return previous[right.length]
}

function suggestion(name: string) {
  let best = ""
  let score = Infinity
  for (const key of functionIndex.keys()) {
    const value = distance(foldName(name).toUpperCase(), key)
    if (value < score) { score = value; best = functionIndex.get(key)!.name }
  }
  return score <= 3 ? ` Voulais-tu dire ${best} ?` : ""
}

// ---------------------------------------------------------------------------
// Opérateurs (pour le guide)
// ---------------------------------------------------------------------------

export const formulaOperators: Array<{ symbol: string; meaning: string; example: string; result: string }> = [
  { symbol: "+  -  *  /", meaning: "Addition, soustraction, multiplication, division.", example: "{PV max} - {PV}", result: "8" },
  { symbol: "^", meaning: "Puissance.", example: "2 ^ 3", result: "8" },
  { symbol: "%", meaning: "Pourcentage : 50 % vaut 0,5.", example: "{PV max} * 50 %", result: "10" },
  { symbol: "&", meaning: "Mettre des textes bout à bout.", example: "{Nom} & \" !\"", result: "Gobelin !" },
  { symbol: "=  <>", meaning: "Égal, différent (majuscules et accents ignorés ; une liste est « égale » si elle contient la valeur).", example: "{Comportement} = \"agressif\"", result: "VRAI" },
  { symbol: "<  >  <=  >=", meaning: "Plus petit, plus grand, ou égal.", example: "{Rang} >= 3", result: "VRAI" },
  { symbol: "( )", meaning: "Grouper pour calculer d’abord.", example: "({PV} + 8) / 2", result: "10" },
]

/**
 * La ligne d'exemple du guide. Chaque exemple de fonction est calculé sur elle ; un
 * test vérifie que le résultat affiché dans le guide est le vrai.
 */
export const formulaSampleRow: Array<{ header: string; value: string; spec?: IndexColumnSpec }> = [
  { header: "Nom", value: "Gobelin" },
  { header: "Type", value: "Humanoïde" },
  { header: "Sous-type", value: "Pillard" },
  { header: "Rang", value: "3", spec: { kind: "number" } },
  { header: "PV", value: "12", spec: { kind: "number" } },
  { header: "PV max", value: "20", spec: { kind: "number" } },
  { header: "Prix", value: "2 PO", spec: { kind: "number", number: { unit: "money", defaultUnit: "PO" } } },
  { header: "Dégâts", value: "4, 5", spec: { kind: "choice", multiple: true } },
  { header: "Dressable", value: "Oui", spec: { kind: "checkbox" } },
  { header: "Comportement", value: "Agressif", spec: { kind: "choice" } },
  { header: "Peuples", value: "Elfes, Nains", spec: { kind: "linked" } },
  { header: "Note", value: "" },
]

/** Les lignes reliées de l'exemple : « Peuples » mène aux Elfes et aux Nains. */
const sampleRelated: Record<string, Record<string, string>> = {
  elfes: { Région: "Sylve" },
  nains: { Région: "Montagnes" },
}

export function sampleFormulaContext(random?: () => number): FormulaContext {
  const byName = new Map(formulaSampleRow.map((column) => [foldName(column.header), column]))
  return {
    column: (name) => { const column = byName.get(foldName(name)); return column ? columnFormulaValue(column.value, column.spec) : undefined },
    columnInfo: (name) => { const column = byName.get(foldName(name)); return column ? { raw: column.value, spec: column.spec } : undefined },
    related: (via, field) => foldName(via) === "peuples" ? ["Elfes", "Nains"].map((name) => sampleRelated[foldName(name)]?.[field] ?? "") : undefined,
    relatedCount: (via) => foldName(via) === "peuples" ? 2 : undefined,
    rowNumber: 12,
    tabName: "Créatures",
    random,
  }
}

// ---------------------------------------------------------------------------
// Calcul
// ---------------------------------------------------------------------------

function evaluateNode(node: FormulaNode, context: FormulaContext, depth = 0): FormulaValue {
  if (depth > 200) throw new FormulaError("Formule trop imbriquée.")
  const evaluate = (child: FormulaNode) => evaluateNode(child, context, depth + 1)
  switch (node.type) {
    case "number": return node.value
    case "string": return node.value
    case "boolean": return node.value
    case "column": {
      const value = context.column(node.name)
      if (value === undefined) throw new FormulaError(`La colonne {${node.name}} n’existe pas dans cet onglet.`, node.position)
      return value
    }
    case "unary": {
      const value = toNumber(evaluate(node.operand), node.position)
      return node.operator === "-" ? -value : value
    }
    case "percent": return toNumber(evaluate(node.operand), node.position) / 100
    case "binary": {
      const left = evaluate(node.left)
      const right = evaluate(node.right)
      switch (node.operator) {
        case "&": return toText(left) + toText(right)
        case "=": return equals(left, right)
        case "<>": return !equals(left, right)
        case "<": return compare(left, right) < 0
        case ">": return compare(left, right) > 0
        case "<=": return compare(left, right) <= 0
        case ">=": return compare(left, right) >= 0
      }
      const a = toNumber(left, node.position), b = toNumber(right, node.position)
      switch (node.operator) {
        case "+": return a + b
        case "-": return a - b
        case "*": return a * b
        case "/": if (b === 0) throw new FormulaError("Division par zéro.", node.position); return a / b
        case "^": return a ** b
      }
      throw new FormulaError(`Opérateur « ${node.operator} » inconnu.`, node.position)
    }
    case "call": {
      const definition = findFunction(node.name)
      if (!definition) throw new FormulaError(`La fonction ${node.name} n’existe pas.${suggestion(node.name)}`, node.position)
      if (node.args.length < definition.min || (definition.max !== undefined && node.args.length > definition.max)) {
        const expected = definition.max === undefined ? `au moins ${definition.min}` : definition.min === definition.max ? `${definition.min}` : `de ${definition.min} à ${definition.max}`
        throw new FormulaError(`${definition.name} attend ${expected} argument${definition.max === 1 || definition.min === 1 && definition.max === undefined ? "" : "s"} : ${definition.signature}.`, node.position)
      }
      const columnArgs = new Set(definition.columnArgs ?? [])
      const args = definition.lazy ? [] : node.args.map((argument, index) => {
        if (columnArgs.has(index) && argument.type === "column") return argument.name
        return evaluate(argument)
      })
      if (definition.columnArgs?.some((index) => node.args[index] && node.args[index].type !== "column" && definition.name !== "CONVERTIR")) {
        throw new FormulaError(`${definition.name} : le premier argument doit être une colonne, entre accolades : ${definition.signature}.`, node.position)
      }
      return definition.run(args, context, { nodes: node.args, evaluate })
    }
  }
}

/** Calcule une formule sur une ligne. Lève une `FormulaError` en cas de problème. */
export function evaluateFormula(source: string, context: FormulaContext): FormulaValue {
  return evaluateNode(parseFormula(source), context)
}

/** Vérifie une formule sans la calculer : le message d'erreur, ou « » si elle est bien écrite. */
export function formulaProblem(source: string): string {
  try {
    const node = parseFormula(source)
    const check = (current: FormulaNode): string => {
      if (current.type === "call") {
        const definition = findFunction(current.name)
        if (!definition) return `La fonction ${current.name} n’existe pas.${suggestion(current.name)}`
        if (current.args.length < definition.min || (definition.max !== undefined && current.args.length > definition.max)) return `${definition.name} : nombre d’arguments incorrect. Forme attendue : ${definition.signature}.`
        for (const arg of current.args) { const problem = check(arg); if (problem) return problem }
      }
      if (current.type === "unary" || current.type === "percent") return check(current.operand)
      if (current.type === "binary") return check(current.left) || check(current.right)
      return ""
    }
    return check(node)
  } catch (error) {
    return error instanceof FormulaError ? error.message : "Formule illisible."
  }
}

// ---------------------------------------------------------------------------
// Affichage du résultat
// ---------------------------------------------------------------------------

export type FormulaDisplay =
  | { kind: "text"; text: string }
  | { kind: "number"; text: string; value: number }
  | { kind: "checkbox"; value: boolean }
  | { kind: "list"; items: string[] }
  | { kind: "color"; value: string }
  | { kind: "error"; message: string }

/**
 * Le résultat d'une formule tel que la case l'affiche, d'après le type choisi dans la
 * colonne. Un nombre prend le format de la colonne (unité par défaut comprise).
 */
export function displayFormulaValue(value: FormulaValue, result: FormulaResult = "auto", format?: NumberFormat): FormulaDisplay {
  const kind = result === "auto"
    ? typeof value === "boolean" ? "checkbox" : typeof value === "number" ? "number" : Array.isArray(value) ? "list" : "text"
    : result
  if (kind === "checkbox") return { kind: "checkbox", value: toBoolean(value) }
  if (kind === "list") return { kind: "list", items: listOf(value).map(toText).filter(Boolean) }
  if (kind === "color") return { kind: "color", value: toText(value).trim() }
  if (kind === "number") {
    if (value === null || (typeof value === "string" && !value.trim())) return { kind: "text", text: "" }
    const number = roundFloat(toNumber(value))
    if (!Number.isFinite(number)) return { kind: "error", message: "Le résultat n’est pas un nombre fini." }
    const text = format && ((format.unit && format.unit !== "none") || format.prefix || format.suffix || format.percent || format.decimals !== undefined)
      ? formatIndexNumber({ base: number * unitFactor(format) }, format)
      : formatAmount(number)
    return { kind: "number", text, value: number }
  }
  return { kind: "text", text: toText(value) }
}

/** Le texte d'un résultat (copier, trier, exporter). */
export function formulaDisplayText(display: FormulaDisplay) {
  switch (display.kind) {
    case "text": return display.text
    case "number": return display.text
    case "checkbox": return display.value ? "Oui" : "Non"
    case "list": return display.items.join(", ")
    case "color": return display.value
    case "error": return `#ERREUR : ${display.message}`
  }
}

/** Calcule et met en forme d'un coup, sans jamais lever d'erreur. */
export function computeFormulaDisplay(source: string, context: FormulaContext, result?: FormulaResult, format?: NumberFormat): FormulaDisplay {
  if (!source.trim()) return { kind: "text", text: "" }
  try {
    return displayFormulaValue(evaluateFormula(source, context), result, format)
  } catch (error) {
    return { kind: "error", message: error instanceof FormulaError ? error.message : "Calcul impossible." }
  }
}

/** Un hasard reproductible : le même germe donne toujours la même suite. */
export function seededRandom(seed: string) {
  let hash = 1779033703 ^ seed.length
  for (let index = 0; index < seed.length; index += 1) {
    hash = Math.imul(hash ^ seed.charCodeAt(index), 3432918353)
    hash = (hash << 13) | (hash >>> 19)
  }
  let state = hash >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Utilisé par la jauge « maximum lu dans une autre colonne » et les actions : la valeur numérique d'une case. */
export function numericCellValue(raw: string, spec?: IndexColumnSpec) {
  const value = columnFormulaValue(raw, spec)
  try { return value === null ? null : toNumber(value) } catch { return null }
}

