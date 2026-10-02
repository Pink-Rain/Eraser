/**
 * Les onglets-fenêtres d'un index : des onglets sans données propres, qui réaffichent
 * les lignes existantes répondant à des conditions (Type est « Rune », Nom contient
 * « épée »…). Les lignes restent celles de leur onglet d'origine : rien n'est copié,
 * une modification faite dans la fenêtre est écrite à la source.
 *
 * Ce fichier ne dépend de rien : la page, le serveur et les tests s'en servent.
 */

export type ViewOperator = "est" | "n-est-pas" | "contient" | "ne-contient-pas" | "commence" | "vide" | "non-vide" | "superieur" | "inferieur"

export type ViewCondition = { column: string; operator: ViewOperator; value: string }

export type IndexView = {
  id: string
  /** L'index : une clé d'index du monde (« places », « perso-… ») ou « objects ». */
  index: string
  name: string
  /** « * » : tous les onglets (tous les index d'objets) ; sinon l'onglet (ou le tableau d'objets) choisi. */
  source: string
  /** « toutes » : chaque condition doit être vraie ; « une » : il suffit d'une. */
  match: "toutes" | "une"
  conditions: ViewCondition[]
  position: number
}

export const ALL_SOURCES = "*"

export const viewOperators: Array<{ value: ViewOperator; label: string; needsValue: boolean }> = [
  { value: "est", label: "est", needsValue: true },
  { value: "n-est-pas", label: "n’est pas", needsValue: true },
  { value: "contient", label: "contient", needsValue: true },
  { value: "ne-contient-pas", label: "ne contient pas", needsValue: true },
  { value: "commence", label: "commence par", needsValue: true },
  { value: "vide", label: "est vide", needsValue: false },
  { value: "non-vide", label: "n’est pas vide", needsValue: false },
  { value: "superieur", label: "est supérieur à", needsValue: true },
  { value: "inferieur", label: "est inférieur à", needsValue: true },
]

export function isViewOperator(value: unknown): value is ViewOperator {
  return typeof value === "string" && viewOperators.some((operator) => operator.value === value)
}

function fold(value: string) {
  return value.replace(/<[^>]+>/g, " ").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim().toLocaleLowerCase("fr")
}

function numberOf(value: string) {
  const match = fold(value).replace(/\s/g, "").replace(",", ".").match(/-?\d+(?:\.\d+)?/)
  return match ? Number(match[0]) : null
}

/** Une case peut tenir plusieurs valeurs (« Feu, Glace ») : « est » vaut pour l'une d'elles. */
function parts(value: string) {
  return fold(value).split(/\s*[,;]\s*/).filter(Boolean)
}

export function matchesCondition(condition: ViewCondition, cell: string) {
  const value = fold(cell)
  const wanted = fold(condition.value)
  switch (condition.operator) {
    case "est": return value === wanted || parts(cell).includes(wanted)
    case "n-est-pas": return value !== wanted && !parts(cell).includes(wanted)
    case "contient": return value.includes(wanted)
    case "ne-contient-pas": return !value.includes(wanted)
    case "commence": return value.startsWith(wanted)
    case "vide": return !value
    case "non-vide": return Boolean(value)
    case "superieur": { const left = numberOf(cell); const right = numberOf(condition.value); return left !== null && right !== null && left > right }
    case "inferieur": { const left = numberOf(cell); const right = numberOf(condition.value); return left !== null && right !== null && left < right }
  }
}

/**
 * Une ligne entre-t-elle dans la fenêtre ? `cell` donne la valeur d'une colonne de la
 * ligne (vide si la colonne n'existe pas dans son onglet). Sans condition : toutes.
 */
export function matchesView(view: Pick<IndexView, "match" | "conditions">, cell: (column: string) => string) {
  const conditions = view.conditions.filter((condition) => condition.column.trim())
  if (!conditions.length) return true
  const results = conditions.map((condition) => matchesCondition(condition, cell(condition.column)))
  return view.match === "une" ? results.some(Boolean) : results.every(Boolean)
}

export function describeCondition(condition: ViewCondition) {
  const operator = viewOperators.find((candidate) => candidate.value === condition.operator)
  return `${condition.column} ${operator?.label ?? condition.operator}${operator?.needsValue ? ` « ${condition.value} »` : ""}`
}

/** Les conditions lues dans la feuille (JSON) : une entrée abîmée est ignorée, jamais bloquante. */
export function parseViewConditions(raw: string): ViewCondition[] {
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.flatMap((entry) => {
      if (!entry || typeof entry !== "object") return []
      const { column, operator, value } = entry as Record<string, unknown>
      return typeof column === "string" && column.trim() && isViewOperator(operator) ? [{ column: column.trim().slice(0, 120), operator, value: typeof value === "string" ? value.slice(0, 300) : "" }] : []
    }).slice(0, 20)
  } catch {
    return []
  }
}

/** La clé d'un onglet-fenêtre dans le choix d'onglet d'un index. */
export const viewSelectKey = (id: string) => `fenetre:${id}`
export const viewIdOfSelectKey = (key: string) => key.startsWith("fenetre:") ? key.slice("fenetre:".length) : null
