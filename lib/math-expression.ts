type ParsedValue = { value: number; percent: boolean }

class ExpressionParser {
  private index = 0
  private readonly source: string
  constructor(source: string) { this.source = source }

  parse() {
    const value = this.additive()
    this.skip()
    if (this.index !== this.source.length || !Number.isFinite(value.value)) throw new Error("INVALID_EXPRESSION")
    return value.value
  }

  private additive(): ParsedValue {
    let left = this.multiplicative()
    while (true) {
      this.skip()
      const operator = this.source[this.index]
      if (operator !== "+" && operator !== "-") return left
      this.index += 1
      const right = this.multiplicative()
      const amount = right.percent ? left.value * right.value / 100 : right.value
      left = { value: operator === "+" ? left.value + amount : left.value - amount, percent: false }
    }
  }

  private multiplicative(): ParsedValue {
    let left = this.unary()
    while (true) {
      this.skip()
      const operator = this.source[this.index]
      if (operator !== "*" && operator !== "/") return left
      this.index += 1
      const right = this.unary()
      const amount = right.percent ? right.value / 100 : right.value
      if (operator === "/" && amount === 0) throw new Error("DIVISION_BY_ZERO")
      left = { value: operator === "*" ? left.value * amount : left.value / amount, percent: false }
    }
  }

  private unary(): ParsedValue {
    this.skip()
    if (this.source[this.index] === "+") { this.index += 1; return this.unary() }
    if (this.source[this.index] === "-") { this.index += 1; const value = this.unary(); return { ...value, value: -value.value } }
    return this.primary()
  }

  private primary(): ParsedValue {
    this.skip()
    let parsed: ParsedValue
    if (this.source[this.index] === "(") {
      this.index += 1
      parsed = this.additive()
      this.skip()
      if (this.source[this.index] !== ")") throw new Error("INVALID_EXPRESSION")
      this.index += 1
    } else {
      const match = this.source.slice(this.index).match(/^\d+(?:\.\d+)?/)
      if (!match) throw new Error("INVALID_EXPRESSION")
      this.index += match[0].length
      parsed = { value: Number(match[0]), percent: false }
    }
    this.skip()
    if (this.source[this.index] === "%") { this.index += 1; parsed.percent = true }
    return parsed
  }

  private skip() {
    while (/\s/.test(this.source[this.index] || "")) this.index += 1
  }
}

function normalize(expression: string) {
  return expression.replaceAll(",", ".").replaceAll("×", "*").replaceAll("÷", "/").trim()
}

export function evaluateMathExpression(expression: string) {
  const normalized = normalize(expression)
  if (!normalized || !/^[\d\s.,+\-*/()%×÷]+$/.test(expression)) throw new Error("INVALID_EXPRESSION")
  return new ExpressionParser(normalized).parse()
}

export function evaluateRelativeExpression(expression: string, base: number) {
  const normalized = normalize(expression)
  if (!normalized) return base
  const first = normalized[0]
  const source = first === "+" || first === "-" || first === "*" || first === "/" ? `${base}${normalized}` : normalized
  return evaluateMathExpression(source)
}

export function rollDiceExpression(expression: string) {
  const rolls: Array<{ notation: string; values: number[] }> = []
  const replaced = normalize(expression).replace(/(\d*)d(\d+)/gi, (notation, countText: string, sidesText: string) => {
    const count = Math.max(1, Number(countText || "1"))
    const sides = Number(sidesText)
    if (!Number.isInteger(count) || !Number.isInteger(sides) || count > 100 || sides < 2 || sides > 10000) throw new Error("INVALID_DICE")
    const values = Array.from({ length: count }, () => {
      const random = new Uint32Array(1)
      crypto.getRandomValues(random)
      return random[0] % sides + 1
    })
    rolls.push({ notation: notation.toLowerCase(), values })
    return `(${values.reduce((sum, value) => sum + value, 0)})`
  })
  if (!rolls.length) throw new Error("NO_DICE")
  const total = evaluateMathExpression(replaced)
  return { total, detail: rolls.map((roll) => `${roll.notation} [${roll.values.join(", ")}]`).join(" · ") }
}
