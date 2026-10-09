/**
 * Spécificité « Formes » : un groupe de formes (« Forme », « Posture »…) propre à une
 * classe, dont une seule est active à la fois sur la fiche. Une forme a des effets
 * temporaires sur la fiche (« Force : +10 », « Armure physique : ≥5 ») qui ne valent que
 * pendant qu'elle est active : la valeur de base n'est jamais modifiée, comme pour un état.
 *
 * Feuille : onglet « Formes » du classeur « Sorts de classe », une ligne par forme ; les
 * formes d'un même groupe partagent sa colonne « Groupe ID ». Ce que le joueur choisit
 * (la forme active) est rangé dans sa fiche, sous `specifics[groupe]`.
 *
 * Sans dépendance au serveur.
 */
import { evaluateFormula, gaugePlacements, inlineRichText, plainTextOf, type FormulaValues, type GaugePlacement } from "@/lib/class-specifics"
import { operationLabel, parseValueChange, type ValueOperation } from "@/lib/state-change"

export const FORMS_TAB = "Formes"

export type FormEffect = { target: string; change: string }
/** Un état de l'Index des états posé par la forme tant qu'elle est active, à ce niveau. */
export type FormStateLink = { name: string; level: 1 | 2 }
export type ClassForm = { id: string; name: string; color: string; isDefault: boolean; effects: FormEffect[]; states: FormStateLink[]; description: string; order: number }
export type ClassFormGroup = { id: string; classId: string; className: string; name: string; placement: GaugePlacement; forms: ClassForm[]; order: number }

export const FORM_HEADERS = ["ID", "Groupe ID", "Groupe", "Classe", "Nom", "Couleur", "Par défaut", "Effets", "Description", "Emplacement", "Ordre", "Classe ID", "États"] as const
export type FormHeader = (typeof FORM_HEADERS)[number]
export const FORM_RICH_HEADERS = ["Description"] as const satisfies readonly FormHeader[]

export const formColors = ["#8f79b5", "#4f9a8a", "#b9504e", "#d29a4a", "#4f7fb0", "#a76f9d", "#6d8f6a", "#7d7f86"]

const fold = (value: string) => value.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim().toLocaleLowerCase("fr")
const yes = (raw: string) => ["oui", "vrai", "true", "x", "1", "yes"].includes(fold(raw))
const escapeHtml = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")

/** « Force : +10 », un par ligne (ou séparés par « ; »). */
export function parseFormEffects(raw: string): FormEffect[] {
  return raw.split(/\n|;/).flatMap((line) => {
    const match = line.match(/^\s*(.+?)\s*:\s*(.+?)\s*$/)
    return match && match[1].trim() && match[2].trim() ? [{ target: match[1].trim(), change: match[2].trim() }] : []
  }).slice(0, 30)
}
export const serializeFormEffects = (effects: FormEffect[]) => effects.filter((effect) => effect.target.trim() && effect.change.trim()).map((effect) => `${effect.target.trim()} : ${effect.change.trim()}`).join("\n")

/** « Effrayé », « Effrayé : niveau 2 », un par ligne (ou séparés par « ; »). */
export function parseFormStates(raw: string): FormStateLink[] {
  const seen = new Set<string>()
  return raw.split(/\n|;/).flatMap((line): FormStateLink[] => {
    const match = line.trim().match(/^(.+?)(?:\s*:\s*(?:niv(?:eau)?\.?\s*)?([12]))?\s*$/i)
    const name = match?.[1].trim() ?? ""
    if (!name || seen.has(fold(name))) return []
    seen.add(fold(name))
    return [{ name, level: match?.[2] === "2" ? 2 : 1 }]
  }).slice(0, 12)
}
export const serializeFormStates = (states: FormStateLink[]) => states.filter((state) => state.name.trim()).map((state) => state.level === 2 ? `${state.name.trim()} : niveau 2` : state.name.trim()).join("\n")

/** Un changement qui lit la fiche ou une jauge : « +{Folie temporaire} * 2 ». */
export const isFormulaChange = (change: string) => change.includes("{")

/**
 * Ce que fait le changement d'un effet : ajout, « = », plancher, plafond ; null s'il est
 * illisible (ou des dés). Une formule (« +{Folie temporaire} * 2 », « ≥{Niveau} ») est
 * calculée avec `values` (valeurs de la fiche et des jauges) ; sans elles, null.
 */
export function formEffectOperation(change: string, values?: FormulaValues): ValueOperation | null {
  if (!isFormulaChange(change)) {
    const operation = parseValueChange(change)
    return operation && operation.kind !== "roll" ? operation : null
  }
  const match = change.trim().match(/^(=|≥|>=|≤|<=|\+|-)?\s*(.+)$/)
  if (!match || !values) return null
  const result = evaluateFormula(match[2], values)
  if (!result.ok) return null
  const operator = match[1] ?? "+"
  if (operator === "=") return { kind: "set", value: result.value }
  if (operator === "≥" || operator === ">=") return { kind: "min", value: result.value }
  if (operator === "≤" || operator === "<=") return { kind: "max", value: result.value }
  return { kind: "add", amount: operator === "-" ? -result.value : result.value }
}

/** Le changement tel qu'on le lit : « +10 », ou la formule telle qu'écrite (« +{Folie temporaire} × 2 »). */
export function formEffectText(change: string, values?: FormulaValues) {
  const operation = formEffectOperation(change, values)
  if (!isFormulaChange(change)) return operation ? operationLabel(operation) : change
  const written = change.trim().replace(/\*/g, "×")
  return operation ? `${written} (${operationLabel(operation)})` : written
}

export function emptyFormGroup(classId: string, className: string, order = 0): ClassFormGroup {
  return { id: "", classId, className, name: "Forme", placement: "bandeau", order, forms: [] }
}

/** Les groupes de formes, à partir des lignes de l'onglet (cases par en-tête). */
export function formGroupsFromRows(rows: Array<{ cell: (header: FormHeader) => string; rich?: (header: (typeof FORM_RICH_HEADERS)[number]) => string }>): ClassFormGroup[] {
  const groups = new Map<string, ClassFormGroup>()
  for (const { cell, rich } of rows) {
    const id = cell("ID").trim()
    const groupId = cell("Groupe ID").trim()
    const name = cell("Nom").trim()
    if (!id || !groupId || !name) continue
    const order = Number.parseFloat(cell("Ordre").replace(",", "."))
    let group = groups.get(groupId)
    if (!group) {
      const placement = gaugePlacements.find((option) => fold(option.label) === fold(cell("Emplacement")) || option.value === fold(cell("Emplacement")))?.value ?? "bandeau"
      group = { id: groupId, classId: cell("Classe ID").trim(), className: cell("Classe").trim(), name: cell("Groupe").trim() || "Forme", placement, forms: [], order: Number.isFinite(order) ? order : 0 }
      groups.set(groupId, group)
    }
    const color = cell("Couleur").trim()
    const description = rich?.("Description") ?? escapeHtml(cell("Description")).replace(/\n/g, "<br>")
    group.forms.push({
      id, name,
      color: /^#[0-9a-f]{3,8}$/i.test(color) ? color : formColors[group.forms.length % formColors.length],
      isDefault: yes(cell("Par défaut")),
      effects: parseFormEffects(cell("Effets")),
      states: parseFormStates(cell("États")),
      description: plainTextOf(description) ? description : "",
      order: Number.isFinite(order) ? order : group.forms.length,
    })
  }
  for (const group of groups.values()) group.forms.sort((a, b) => a.order - b.order)
  return [...groups.values()]
}

/** Les cases de chaque forme d'un groupe, par en-tête (Description : contenu mis en forme). */
export function formGroupRows(group: ClassFormGroup): Array<Record<FormHeader, string>> {
  const placement = gaugePlacements.find((option) => option.value === group.placement)?.label ?? group.placement
  return group.forms.map((form, index) => ({
    "ID": form.id,
    "Groupe ID": group.id,
    "Groupe": group.name.trim() || "Forme",
    "Classe": group.className,
    "Nom": form.name.trim(),
    "Couleur": form.color,
    "Par défaut": form.isDefault ? "Oui" : "",
    "Effets": serializeFormEffects(form.effects),
    "Description": plainTextOf(form.description) ? form.description : "",
    "Emplacement": placement,
    "Ordre": String(index),
    "Classe ID": group.classId,
    "États": serializeFormStates(form.states),
  }))
}

/** Un groupe reçu de l'éditeur, ramené à des valeurs sûres ; null sans formes. */
export function sanitizeFormGroup(raw: unknown, newId: () => string): ClassFormGroup | null {
  if (!raw || typeof raw !== "object") return null
  const value = raw as Record<string, unknown>
  const text = (item: unknown, limit = 200) => typeof item === "string" ? item.slice(0, limit) : ""
  const classId = text(value.classId, 80).trim()
  const forms = Array.isArray(value.forms) ? value.forms.slice(0, 12).flatMap((item, index): ClassForm[] => {
    if (!item || typeof item !== "object") return []
    const form = item as Record<string, unknown>
    const name = text(form.name).trim()
    if (!name) return []
    const color = text(form.color, 16)
    const effects = Array.isArray(form.effects) ? form.effects.slice(0, 30).flatMap((effect) => effect && typeof effect === "object" ? [{ target: text((effect as FormEffect).target).trim(), change: text((effect as FormEffect).change, 200).trim() }] : []).filter((effect) => effect.target && effect.change) : []
    const id = text(form.id, 40)
    const states = parseFormStates(serializeFormStates(Array.isArray(form.states) ? form.states.slice(0, 12).flatMap((state) => state && typeof state === "object" ? [{ name: text((state as FormStateLink).name).replace(/[\n;:]/g, " ").replace(/\s+/g, " ").trim(), level: (state as FormStateLink).level === 2 ? 2 as const : 1 as const }] : []) : []))
    return [{ id: /^FOR-[A-Z0-9]{4,16}$/.test(id) ? id : `FOR-${newId()}`, name, color: /^#[0-9a-f]{3,8}$/i.test(color) ? color : formColors[index % formColors.length], isDefault: form.isDefault === true, effects, states, description: text(form.description, 20_000), order: index }]
  }) : []
  if (!classId || !forms.length) return null
  if (!forms.some((form) => form.isDefault)) forms[0].isDefault = true
  let seenDefault = false
  for (const form of forms) { if (form.isDefault && seenDefault) form.isDefault = false; if (form.isDefault) seenDefault = true }
  const id = text(value.id, 40)
  const placement = gaugePlacements.some((option) => option.value === value.placement) ? value.placement as GaugePlacement : "bandeau"
  return { id: /^FGR-[A-Z0-9]{4,16}$/.test(id) ? id : `FGR-${newId()}`, classId, className: text(value.className).trim(), name: inlineRichText(text(value.name)).replace(/<[^>]+>/g, "").trim() || "Forme", placement, forms, order: typeof value.order === "number" && Number.isFinite(value.order) ? value.order : 0 }
}

/** Les groupes de formes d'une classe ; retrouvés par l'identifiant, sinon par le nom de la classe. */
export function formGroupsOfClass(groups: ClassFormGroup[], classItem: { id: string; name: string }) {
  return groups.filter((group) => group.classId ? group.classId === classItem.id : fold(group.className) === fold(classItem.name)).sort((a, b) => a.order - b.order || a.name.localeCompare(b.name, "fr"))
}

/* ─────────────────────────────── Jeu ─────────────────────────────── */

/** La forme active d'un groupe : celle choisie par le joueur, sinon celle par défaut. */
export function activeForm(group: ClassFormGroup, chosen: string | undefined) {
  return group.forms.find((form) => form.id === chosen) ?? group.forms.find((form) => form.isDefault) ?? group.forms[0]
}

/**
 * Les états que posent les formes actives : chacun avec la forme qui le pose (pour la
 * fiche, « Posé par Forme : Possédée »). Un état cité deux fois garde son plus haut niveau.
 */
export function formStatesOf(groups: ClassFormGroup[], chosen: Record<string, string>) {
  const found = new Map<string, FormStateLink & { source: string }>()
  for (const group of groups) {
    const form = activeForm(group, chosen[group.id])
    for (const state of form?.states ?? []) {
      const previous = found.get(fold(state.name))
      if (!previous || previous.level < state.level) found.set(fold(state.name), { ...state, source: `${group.name} : ${form!.name}` })
    }
  }
  return [...found.values()]
}

/** La forme choisie, d'après la case des sorts choisis de la fiche. */
export function chosenFormsOf(choicesJson: string): Record<string, string> {
  try {
    const parsed = JSON.parse(choicesJson || "{}") as { specifics?: Record<string, unknown> }
    const specifics = parsed?.specifics && typeof parsed.specifics === "object" ? parsed.specifics : {}
    return Object.fromEntries(Object.entries(specifics).flatMap(([id, raw]) => raw && typeof raw === "object" && typeof (raw as { form?: unknown }).form === "string" ? [[id, (raw as { form: string }).form]] : []))
  } catch {
    return {}
  }
}

/**
 * La case des sorts choisis après un changement de forme. `resetGauges` : les jauges à
 * remettre à leur valeur de départ (liées à la forme quittée). Tout le reste est gardé.
 */
export function withChosenForm(choicesJson: string, groupId: string, formId: string, resetGauges: string[] = []) {
  let parsed: Record<string, unknown> = {}
  try {
    const value = JSON.parse(choicesJson || "{}") as unknown
    if (value && typeof value === "object" && !Array.isArray(value)) parsed = value as Record<string, unknown>
  } catch { /* case vide ou illisible : on part de rien */ }
  const specifics = parsed.specifics && typeof parsed.specifics === "object" && !Array.isArray(parsed.specifics) ? { ...(parsed.specifics as Record<string, unknown>) } : {}
  const previous = specifics[groupId] && typeof specifics[groupId] === "object" ? specifics[groupId] as Record<string, unknown> : {}
  specifics[groupId] = { ...previous, form: formId }
  for (const gaugeId of resetGauges) delete specifics[gaugeId]
  return JSON.stringify({ ...parsed, specifics })
}

/**
 * Ce que les formes actives changent sur la fiche, comme des états : un changement par
 * effet et par cible. `targetOf` traduit un nom (« Force ») en cible de la fiche.
 */
export function formContributions(groups: ClassFormGroup[], chosen: Record<string, string>, targetOf: (name: string) => string | null, values?: FormulaValues) {
  return groups.flatMap((group) => {
    const form = activeForm(group, chosen[group.id])
    if (!form) return []
    return form.effects.flatMap((effect) => {
      const operation = formEffectOperation(effect.change, values)
      const target = targetOf(effect.target)
      if (!operation || !target) return []
      return [{
        state: `${group.name} : ${form.name}`,
        level: 1 as const,
        effect: form.name,
        target,
        amount: operation.kind === "add" ? operation.amount : 0,
        operation: operation.kind === "add" ? undefined : operation,
        label: isFormulaChange(effect.change) ? formEffectText(effect.change, values) : operationLabel(operation),
        color: form.color,
        fx: [],
      }]
    })
  })
}
