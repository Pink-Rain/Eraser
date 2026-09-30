/**
 * La colonne Boutons : chaque case porte un ou plusieurs boutons, et chaque bouton
 * enchaîne des étapes (ouvrir, changer une valeur, +1/−1, dupliquer, créer ailleurs,
 * tirer au sort, envoyer dans le chat…). Les textes des étapes acceptent des colonnes
 * entre accolades (« Supprimer {Nom} ? ») ; un texte qui commence par « = » est une
 * formule (« ={PV} - 5 »). Les conditions d'affichage sont toujours des formules.
 *
 * Ce fichier décrit les étapes et les exécute ; la page fournit ce qu'elles touchent
 * (`ActionRuntime`) : un index du monde ne sait pas faire ce que sait l'index des objets.
 */
import {
  checkboxValue,
  isCheckedValue,
  joinListValue,
  normalizeSpec,
  type ActionButton,
  type ActionStep,
  type IndexColumnSpec,
} from "@/lib/index-columns"
import { evaluateFormula, FormulaError, numericCellValue, toBoolean, toNumber, toText, type FormulaContext, type FormulaValue } from "@/lib/index-formula"
import { findUnit, formatAmount, formatIndexNumber } from "@/lib/index-numbers"

export type ActionStepType = ActionStep["type"]

type StepField = { key: string; label: string; kind: "column" | "text" | "formula" | "number-formula" | "tab" | "index" | "mapping" | "audience" | "boolean"; hint?: string }

export type ActionStepInfo = {
  type: ActionStepType
  group: "Ouvrir" | "Modifier la ligne" | "Gérer la ligne" | "Créer ailleurs" | "Jeu" | "Copier" | "Afficher"
  label: string
  description: string
  fields: StepField[]
  /** Où l'étape existe : tous les index, ou seulement l'index des objets. */
  only?: "objects" | "world"
}

/** Toutes les étapes, pour l'éditeur et le guide. */
export const actionStepCatalog: ActionStepInfo[] = [
  { type: "open-sheet", group: "Ouvrir", label: "Ouvrir la fiche", description: "Ouvre la fiche complète de la ligne (tous ses champs, y compris ceux du formulaire seulement).", fields: [] },
  { type: "open-linked", group: "Ouvrir", label: "Ouvrir la ligne liée", description: "Ouvre l’index d’en face sur le premier nom d’une colonne liée ↔ ou d’une liste liée.", fields: [{ key: "column", label: "Relation", kind: "column" }], only: "world" },
  { type: "open-index", group: "Ouvrir", label: "Ouvrir un index", description: "Ouvre la page d’un autre index.", fields: [{ key: "index", label: "Index", kind: "index" }] },
  { type: "open-url", group: "Ouvrir", label: "Ouvrir une adresse", description: "Ouvre une adresse web, qui peut être calculée : https://www.aidedd.org/…/{Nom}.", fields: [{ key: "url", label: "Adresse", kind: "text", hint: "Colonnes entre accolades, ou formule commençant par =" }] },
  { type: "set", group: "Modifier la ligne", label: "Mettre une valeur", description: "Écrit une valeur dans une colonne de la ligne : un texte (« Mort »), une colonne ({Statut}) ou une formule (« ={PV max} »). Pour une case à cocher : Oui / Non, ou une condition.", fields: [{ key: "column", label: "Colonne", kind: "column" }, { key: "value", label: "Valeur", kind: "text", hint: "Texte, {Colonne} ou =formule" }] },
  { type: "increment", group: "Modifier la ligne", label: "Augmenter / diminuer", description: "Ajoute un nombre à une colonne (−1 pour retirer une charge), avec des bornes facultatives. Le nombre peut être une formule : {Bonus}, DES(\"1d6\")…", fields: [{ key: "column", label: "Colonne", kind: "column" }, { key: "amount", label: "De combien", kind: "number-formula", hint: "1, -1, {Bonus}…" }, { key: "min", label: "Minimum", kind: "number-formula" }, { key: "max", label: "Maximum", kind: "number-formula", hint: "{PV max}…" }] },
  { type: "toggle", group: "Modifier la ligne", label: "Cocher / décocher", description: "Inverse une case à cocher.", fields: [{ key: "column", label: "Case à cocher", kind: "column" }] },
  { type: "clear", group: "Modifier la ligne", label: "Vider une colonne", description: "Efface la valeur d’une colonne de la ligne.", fields: [{ key: "column", label: "Colonne", kind: "column" }] },
  { type: "roll", group: "Jeu", label: "Tirer au sort", description: "Relance le tirage d’une colonne Aléatoire de la ligne (même si elle est figée) et écrit le résultat.", fields: [{ key: "column", label: "Colonne Aléatoire", kind: "column" }] },
  { type: "duplicate", group: "Gérer la ligne", label: "Dupliquer la ligne", description: "Ajoute une copie de la ligne juste en dessous (nouvel identifiant).", fields: [] },
  { type: "delete", group: "Gérer la ligne", label: "Supprimer la ligne", description: "Supprime la ligne de la feuille. Pense à demander une confirmation.", fields: [] },
  { type: "move", group: "Gérer la ligne", label: "Déplacer vers un onglet", description: "Déplace la ligne dans un autre onglet aux mêmes colonnes.", fields: [{ key: "tab", label: "Onglet", kind: "tab" }], only: "world" },
  { type: "create", group: "Créer ailleurs", label: "Créer une ligne dans un index", description: "Ajoute une ligne pré-remplie dans un index (celui-ci ou un autre) : chaque colonne reçoit un texte, une {Colonne} de cette ligne ou une =formule. Sert aussi à copier une ligne vers un autre index.", fields: [{ key: "index", label: "Index", kind: "index" }, { key: "tab", label: "Onglet", kind: "tab" }, { key: "values", label: "Valeurs", kind: "mapping" }, { key: "open", label: "Ouvrir l’index ensuite", kind: "boolean" }], only: "world" },
  { type: "campaign-inventory", group: "Créer ailleurs", label: "Ajouter à l’inventaire d’une campagne", description: "Ajoute l’objet à l’inventaire commun d’une campagne (choisie au clic).", fields: [], only: "objects" },
  { type: "chat", group: "Jeu", label: "Envoyer dans le chat d’une campagne", description: "Envoie un message dans le chat d’une campagne (choisie au clic, la dernière est retenue), pour tous ou pour le MJ seulement.", fields: [{ key: "message", label: "Message", kind: "text", hint: "{Nom} attaque ! — ou =formule" }, { key: "audience", label: "Pour", kind: "audience" }] },
  { type: "copy", group: "Copier", label: "Copier une valeur", description: "Copie un texte dans le presse-papiers.", fields: [{ key: "value", label: "Texte", kind: "text", hint: "{Nom} — {Effet}, ou =formule" }] },
  { type: "copy-card", group: "Copier", label: "Copier la carte", description: "Copie toute la ligne mise en forme (nom en titre, puis chaque champ), à coller dans un document ou un message.", fields: [] },
  { type: "notify", group: "Afficher", label: "Afficher un message", description: "Affiche un message à l’écran : un résultat de dés, un rappel…", fields: [{ key: "message", label: "Message", kind: "text", hint: "Dégâts : =DES(\"2d6\") — ou {Colonne}" }] },
]

export function stepInfo(type: ActionStepType) {
  return actionStepCatalog.find((step) => step.type === type)!
}

/** Une étape neuve, avec ses champs vides. */
export function newStep(type: ActionStepType): ActionStep {
  switch (type) {
    case "open-url": return { type, url: "" }
    case "open-linked": return { type, column: "" }
    case "open-index": return { type, index: "" }
    case "set": return { type, column: "", value: "" }
    case "increment": return { type, column: "", amount: "1" }
    case "toggle":
    case "clear":
    case "roll": return { type, column: "" }
    case "move": return { type, tab: "" }
    case "create": return { type, index: "creatures", tab: "", values: {} }
    case "copy": return { type, value: "" }
    case "notify": return { type, message: "" }
    case "chat": return { type, message: "", audience: "public" }
    default: return { type } as ActionStep
  }
}

/** Ce que fait une étape, en une ligne (liste des étapes de l'éditeur). */
export function describeStep(step: ActionStep): string {
  switch (step.type) {
    case "open-sheet": return "Ouvrir la fiche"
    case "open-url": return `Ouvrir ${step.url || "une adresse"}`
    case "open-linked": return `Ouvrir la ligne liée par « ${step.column || "?"} »`
    case "open-index": return `Ouvrir l’index ${step.index || "?"}`
    case "set": return `« ${step.column || "?"} » ← ${step.value || "(vide)"}`
    case "increment": return `« ${step.column || "?"} » ${/^-/.test(step.amount.trim()) ? "" : "+"}${step.amount || "1"}${step.min ? `, min ${step.min}` : ""}${step.max ? `, max ${step.max}` : ""}`
    case "toggle": return `Cocher / décocher « ${step.column || "?"} »`
    case "clear": return `Vider « ${step.column || "?"} »`
    case "roll": return `Tirer « ${step.column || "?"} »`
    case "duplicate": return "Dupliquer la ligne"
    case "delete": return "Supprimer la ligne"
    case "move": return `Déplacer vers « ${step.tab || "?"} »`
    case "create": return `Créer une ligne dans ${step.index}${step.tab ? ` · ${step.tab}` : ""}`
    case "copy": return `Copier « ${step.value || "…"} »`
    case "copy-card": return "Copier la carte"
    case "notify": return `Message : ${step.message || "…"}`
    case "chat": return `Chat${step.audience === "gm" ? " (MJ)" : ""} : ${step.message || "…"}`
    case "campaign-inventory": return "Ajouter à l’inventaire d’une campagne"
  }
}

/**
 * Un texte d'étape : « = » au début, c'est une formule ; sinon un texte où chaque
 * {Colonne} est remplacée par sa valeur.
 */
export function resolveTemplate(template: string, context: FormulaContext): FormulaValue {
  const text = template ?? ""
  if (text.trim().startsWith("=")) return evaluateFormula(text.trim().slice(1), context)
  return text.replace(/\{([^{}]+)\}/g, (match, name: string) => {
    const value = context.column(name.trim())
    return value === undefined ? match : toText(value)
  })
}

export function resolveText(template: string, context: FormulaContext) {
  return toText(resolveTemplate(template, context))
}

function evaluateNumber(source: string | undefined, context: FormulaContext) {
  if (source === undefined || !source.trim()) return undefined
  const text = source.trim().replace(/^=/, "")
  return toNumber(evaluateFormula(text, context))
}

/**
 * Le texte à écrire dans une case pour une valeur calculée, selon le type de la colonne :
 * une case à cocher reçoit Oui/Non, un Nombre garde son unité, une liste ses virgules.
 */
export function cellTextFor(value: FormulaValue, input: IndexColumnSpec | undefined, current = ""): string {
  const spec = input ? normalizeSpec(input) : undefined
  if (spec?.kind === "checkbox") return checkboxValue(typeof value === "string" ? isCheckedValue(value) || /^vrai$/i.test(value.trim()) : toBoolean(value), current)
  if (Array.isArray(value)) return joinListValue(value.map(toText))
  if (typeof value === "number") {
    if (spec?.kind === "number" && spec.number?.unit && spec.number.unit !== "none") {
      const factor = findUnit(spec.number.unit, spec.number.defaultUnit ?? "")?.factor ?? 1
      return formatIndexNumber({ base: value * factor }, spec.number)
    }
    if (spec?.kind === "gauge") return String(Math.round(value))
    return formatAmount(Math.round(value * 1e10) / 1e10).replace(/\s/g, " ")
  }
  return toText(value)
}

/** Ce que la page met à disposition des boutons. */
export type ActionRuntime = {
  /** La ligne telle qu'elle est maintenant (relue après chaque étape). */
  row: () => FormulaContext
  cell: (header: string) => string
  specOf: (header: string) => IndexColumnSpec | undefined
  setCell: (header: string, value: string) => Promise<void>
  confirm: (message: string) => Promise<boolean>
  notify: (message: string, tone?: "info" | "error") => void
  openUrl: (url: string) => void
  navigate: (href: string) => void
  openSheet?: () => void
  linkedHref?: (header: string) => string | undefined
  indexHref?: (index: string) => string | undefined
  roll?: (header: string) => Promise<string | null>
  duplicate?: () => Promise<void>
  remove?: () => Promise<void>
  move?: (tab: string) => Promise<void>
  create?: (index: string, tab: string, values: Record<string, string>) => Promise<{ href?: string }>
  copy: (text: string, html?: string) => Promise<void>
  card?: () => { text: string; html: string }
  chat?: (message: string, audience: "public" | "gm") => Promise<void>
  campaignInventory?: () => Promise<void>
}

/** Le bouton s'affiche-t-il sur cette ligne ? (condition vide : toujours) */
export function buttonVisible(button: ActionButton, context: FormulaContext) {
  if (!button.condition?.trim()) return true
  try { return toBoolean(evaluateFormula(button.condition.trim().replace(/^=/, ""), context)) } catch { return false }
}

async function runStep(step: ActionStep, runtime: ActionRuntime) {
  const context = runtime.row()
  const unavailable = (label: string) => { throw new Error(`« ${label} » n’est pas possible dans cet index.`) }
  switch (step.type) {
    case "open-sheet": return runtime.openSheet ? runtime.openSheet() : unavailable("Ouvrir la fiche")
    case "open-url": {
      const url = resolveText(step.url, context).trim()
      if (!/^https?:\/\//i.test(url)) throw new Error(`« ${url || "(vide)"} » n’est pas une adresse web (http…).`)
      return runtime.openUrl(url)
    }
    case "open-linked": {
      const href = runtime.linkedHref?.(step.column)
      if (!href) throw new Error(`« ${step.column} » ne mène à aucune ligne.`)
      return runtime.navigate(href)
    }
    case "open-index": {
      const href = runtime.indexHref?.(step.index)
      if (!href) throw new Error("Cet index n’existe plus.")
      return runtime.navigate(href)
    }
    case "set": {
      const value = resolveTemplate(step.value, context)
      return runtime.setCell(step.column, cellTextFor(value, runtime.specOf(step.column), runtime.cell(step.column)))
    }
    case "increment": {
      const spec = runtime.specOf(step.column)
      const current = numericCellValue(runtime.cell(step.column), spec) ?? 0
      let next = current + (evaluateNumber(step.amount || "1", context) ?? 1)
      const min = evaluateNumber(step.min, context)
      const max = evaluateNumber(step.max, context)
      if (min !== undefined) next = Math.max(min, next)
      if (max !== undefined) next = Math.min(max, next)
      return runtime.setCell(step.column, cellTextFor(next, spec, runtime.cell(step.column)))
    }
    case "toggle": {
      const spec = runtime.specOf(step.column)
      const current = runtime.cell(step.column)
      return runtime.setCell(step.column, checkboxValue(!isCheckedValue(current, spec ? normalizeSpec(spec).emptyChecked : false), current))
    }
    case "clear": return runtime.setCell(step.column, "")
    case "roll": {
      if (!runtime.roll) return unavailable("Tirer au sort")
      const result = await runtime.roll(step.column)
      if (result !== null) runtime.notify(`${step.column} : ${result}`)
      return
    }
    case "duplicate": return runtime.duplicate ? runtime.duplicate() : unavailable("Dupliquer")
    case "delete": return runtime.remove ? runtime.remove() : unavailable("Supprimer")
    case "move": return runtime.move ? runtime.move(step.tab) : unavailable("Déplacer")
    case "create": {
      if (!runtime.create) return unavailable("Créer une ligne")
      const values = Object.fromEntries(Object.entries(step.values ?? {}).map(([header, template]) => [header, resolveText(template, context)]))
      const created = await runtime.create(step.index, step.tab, values)
      runtime.notify("Ligne créée.")
      if (step.open && created.href) runtime.navigate(created.href)
      return
    }
    case "copy": {
      await runtime.copy(resolveText(step.value, context))
      return runtime.notify("Copié.")
    }
    case "copy-card": {
      if (!runtime.card) return unavailable("Copier la carte")
      const card = runtime.card()
      await runtime.copy(card.text, card.html)
      return runtime.notify("Carte copiée.")
    }
    case "notify": return runtime.notify(resolveText(step.message, context))
    case "chat": {
      if (!runtime.chat) return unavailable("Envoyer dans le chat")
      const message = resolveText(step.message, context).trim()
      if (!message) throw new Error("Le message est vide.")
      await runtime.chat(message, step.audience === "gm" ? "gm" : "public")
      return runtime.notify("Message envoyé.")
    }
    case "campaign-inventory": {
      if (!runtime.campaignInventory) return unavailable("Ajouter à l’inventaire")
      await runtime.campaignInventory()
      return
    }
  }
}

/**
 * Exécute un bouton : sa confirmation, puis ses étapes dans l'ordre. Une étape qui
 * échoue arrête la suite et son message est affiché.
 */
export async function runActionButton(button: ActionButton, runtime: ActionRuntime) {
  try {
    if (button.confirm?.trim()) {
      const message = resolveText(button.confirm, runtime.row())
      if (!await runtime.confirm(message)) return false
    }
    for (const step of button.steps) await runStep(step, runtime)
    return true
  } catch (error) {
    runtime.notify(error instanceof FormulaError ? `Formule : ${error.message}` : error instanceof Error ? error.message : "L’action a échoué.", "error")
    return false
  }
}
