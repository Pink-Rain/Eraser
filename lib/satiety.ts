/**
 * La barre de rassasiement d'un personnage : cinq charges (des cuisses de poulet) et, par
 * campagne, le nombre de jours passés. Une nuit sans repas coûte une charge, une ellipse en
 * coûte une par jour ; un repas offert en rend à la place (petit 1, moyen 3, grand 5). La
 * barre ne descend jamais sous zéro ni ne dépasse cinq.
 *
 * Gardé dans le serveur partagé (lib/character-satiety), un enregistrement par personnage :
 * rien n'est lu ni écrit dans Google Sheets. Ce module est commun à la page et au serveur.
 */
export const SATIETY_MAX = 5

/** Un personnage jamais réglé est rassasié. */
export const SATIETY_DEFAULT = SATIETY_MAX

/** Une ellipse compte au plus ce nombre de jours (une saisie de trop ne fait pas de dégâts). */
export const MAX_ELLIPSE_DAYS = 9999

export type SatietyState = {
  charges: number
  /** Les jours passés, par campagne (identifiant). */
  days: Record<string, number>
  updatedAt?: string
}

export type SatietyMeal = "petit" | "moyen" | "grand"

export const satietyMeals: ReadonlyArray<{ key: SatietyMeal; label: string; charges: number }> = [
  { key: "petit", label: "Petit repas", charges: 1 },
  { key: "moyen", label: "Moyen repas", charges: 3 },
  { key: "grand", label: "Grand repas", charges: 5 },
]

/** Passer une nuit, ou une ellipse de `days` jours ; avec ou sans repas offert. */
export type SatietyRest = { mode: "night" | "ellipse"; days?: number; meal?: SatietyMeal | null; campaignId?: string | null }

export type SatietyAction = ({ kind: "rest" } & SatietyRest) | { kind: "set"; charges: number }

export function emptySatiety(): SatietyState {
  return { charges: SATIETY_DEFAULT, days: {} }
}

export function boundedCharges(value: number) {
  return Number.isFinite(value) ? Math.max(0, Math.min(SATIETY_MAX, Math.trunc(value))) : SATIETY_DEFAULT
}

/** Le nombre de jours d'une ellipse, ramené entre 1 et le plafond. */
export function ellipseDays(value: unknown) {
  const number = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10)
  return Number.isFinite(number) ? Math.max(1, Math.min(MAX_ELLIPSE_DAYS, Math.trunc(number))) : 1
}

export function isSatietyMeal(value: unknown): value is SatietyMeal {
  return value === "petit" || value === "moyen" || value === "grand"
}

/** L'enregistrement lu tel quel ; illisible : `null` (on n'écrase pas ce qui est gardé). */
export function parseSatiety(value: string): SatietyState | null {
  try {
    const parsed = JSON.parse(value) as Partial<SatietyState>
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null
    const days: Record<string, number> = {}
    if (parsed.days && typeof parsed.days === "object" && !Array.isArray(parsed.days)) {
      for (const [campaignId, count] of Object.entries(parsed.days)) {
        if (typeof count === "number" && Number.isFinite(count) && count > 0) days[campaignId] = Math.trunc(count)
      }
    }
    return {
      charges: typeof parsed.charges === "number" ? boundedCharges(parsed.charges) : SATIETY_DEFAULT,
      days,
      ...(typeof parsed.updatedAt === "string" ? { updatedAt: parsed.updatedAt } : {}),
    }
  } catch {
    return null
  }
}

/** Le nombre de jours que compte un repos : une nuit, ou ceux de l'ellipse. */
export function restDays(rest: SatietyRest) {
  return rest.mode === "ellipse" ? ellipseDays(rest.days) : 1
}

/**
 * Les charges après un repos. Sans repas, une charge par jour s'en va (jamais sous zéro) ;
 * avec un repas offert, le repas en rend (jamais au-delà de cinq), quelle que soit la durée.
 */
export function chargesAfterRest(charges: number, rest: SatietyRest) {
  const current = boundedCharges(charges)
  const meal = rest.meal ? satietyMeals.find((entry) => entry.key === rest.meal) : undefined
  return meal ? boundedCharges(current + meal.charges) : boundedCharges(current - restDays(rest))
}

export function applySatietyAction(state: SatietyState, action: SatietyAction, now = new Date().toISOString()): SatietyState {
  if (action.kind === "set") return { ...state, charges: boundedCharges(action.charges), updatedAt: now }
  const days = { ...state.days }
  if (action.campaignId) days[action.campaignId] = (days[action.campaignId] ?? 0) + restDays(action)
  return { charges: chargesAfterRest(state.charges, action), days, updatedAt: now }
}

/** Une action envoyée par la page, vérifiée ; `null` : illisible. */
export function parseSatietyAction(raw: unknown): SatietyAction | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null
  const source = raw as Record<string, unknown>
  if (source.kind === "set") return typeof source.charges === "number" && Number.isFinite(source.charges) ? { kind: "set", charges: boundedCharges(source.charges) } : null
  if (source.kind !== "rest" || (source.mode !== "night" && source.mode !== "ellipse")) return null
  if (source.meal !== undefined && source.meal !== null && !isSatietyMeal(source.meal)) return null
  if (source.campaignId !== undefined && source.campaignId !== null && (typeof source.campaignId !== "string" || source.campaignId.length > 120)) return null
  return {
    kind: "rest",
    mode: source.mode,
    ...(source.mode === "ellipse" ? { days: ellipseDays(source.days) } : {}),
    meal: isSatietyMeal(source.meal) ? source.meal : null,
    campaignId: typeof source.campaignId === "string" && source.campaignId ? source.campaignId : null,
  }
}

/** La teinte de la barre, peu saturée : rouge terre cuite vide, vert sauge pleine, par l'ocre et l'olive. */
const satietyColors = ["#b4635c", "#bf7f5c", "#c49a5c", "#b3a861", "#8fa86a", "#6c9a76"] as const

export function satietyColor(charges: number) {
  return satietyColors[boundedCharges(charges)]
}

const satietyLabels = ["Affamé", "Très faim", "Faim", "Petit creux", "Repu", "Rassasié"] as const

/** Le mot de la barre (« Faim », « Rassasié »), pour son survol. */
export function satietyLabel(charges: number) {
  return satietyLabels[boundedCharges(charges)]
}

export function daysLabel(days: number) {
  return `${days} jour${days > 1 ? "s" : ""}`
}

/** Ce qu'un repos va faire, en une ligne (« Nuit sans repas : −1 charge · +1 jour »). */
export function describeRest(rest: SatietyRest) {
  const meal = rest.meal ? satietyMeals.find((entry) => entry.key === rest.meal) : undefined
  const days = restDays(rest)
  const what = rest.mode === "ellipse" ? `Ellipse de ${daysLabel(days)}` : "Nuit"
  const effect = meal ? `+${meal.charges} charge${meal.charges > 1 ? "s" : ""}` : `−${days} charge${days > 1 ? "s" : ""}`
  return `${what}${meal ? ` · ${meal.label.toLocaleLowerCase("fr")}` : " sans repas"} : ${effect}`
}
