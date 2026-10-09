/**
 * Les états d'un personnage (Effrayé, Brûlure…) : ce que l'Index des états en dit, et
 * ce qu'ils changent sur la fiche. Un état a un ou deux niveaux ; chaque niveau lie, dans
 * la colonne « Niveau 1 » ou « Niveau 2 », un ou plusieurs effets de l'onglet « Effets ».
 * Un effet vise des caractéristiques ou des compétences (« Cible ») et change leur valeur
 * (« Changement de valeur ») ; sa couleur et son image teintent le portrait.
 *
 * Le niveau 2 remplace le niveau 1 (ses descriptions le redisent en entier) : ce sont les
 * effets du niveau atteint, et eux seuls, qui s'appliquent.
 *
 * Ce fichier ne dépend que de règles partagées : la page et le serveur s'en servent.
 */
import { foldName, isCheckedValue, parseGaugeCell } from "@/lib/index-columns"
import { parseStateFx, type StateFx } from "@/lib/state-fx"
import { operationLabel, parseRoll, parseValueChange, type RollSpec, type ValueOperation } from "@/lib/state-change"
import type { GaugeSettings, IndexColumnSpec } from "@/lib/index-columns"
import {
  EFFECT_CHANGE_HEADER,
  EFFECT_COLOR_HEADER,
  EFFECT_IMAGE_HEADER,
  EFFECT_FX_APPLY_HEADER,
  EFFECT_FX_HEADER,
  EFFECT_TARGET_HEADER,
  EFFECT_APPLY_OPTIONS,
  EFFECT_PAGE_HEADER,
  EFFECT_PAGE_LEGACY_HEADERS,
  EFFECT_RESET_HEADER,
  EFFECT_RETRIGGER_HEADER,
  EFFECT_ROLL_HEADER,
  EFFECTS_TAB,
  STATE_LEVEL_HEADERS,
  STATES_TAB,
  splitNames,
} from "@/lib/world-index-definitions"

export type StateEffect = {
  name: string
  /** Les noms visés, tels qu'écrits dans l'Index des caractéristiques et compétences. */
  targets: string[]
  color: string
  /** L'ajout chiffré (« -10 », « +20 ») ; null pour un « = », une borne, des dés ou rien. */
  change: number | null
  changeText: string
  /** Ce que l'effet fait à ses cibles : ajout, « = », plancher, plafond ou dés. */
  operation: ValueOperation | null
  /** Le jet qui le déclenche depuis la fiche (colonne « Jet ») ; null sans jet. */
  roll: RollSpec | null
  /**
   * « Redéclencher l'effet » coché : il n'est jamais temporaire, il s'écrit dans la fiche
   * quand l'état est posé ou monte à ce niveau, et à chaque reclic sur le niveau en cours.
   */
  retrigger: boolean
  /**
   * « Retiré en sortant de l'état » (cochée ou vide) : ce que l'effet a écrit dans la fiche
   * (dés, effet redéclenché) est retiré quand l'état part. Décochée : ça reste (dégâts).
   */
  resetOnExit: boolean
  image: string
  /** Où sa couleur s'applique (colonne « Couleur appliquée à ») ; nulle part si rien n'est choisi. */
  apply: EffectTargets
  /** Où ses FX se dessinent (colonne « FX appliqué à ») ; nulle part si rien n'est choisi. */
  fxApply: EffectTargets
  fx: StateFx[]
}

export type EffectTargets = { page: boolean; skills: boolean; portrait: boolean }

export type StateDefinition = {
  id: string
  name: string
  /** Le nom avec sa mise en forme de l'index (couleur, gras…), s'il en a une. */
  nameHtml?: string
  type: string
  /** 1 quand le niveau 2 n'existe pas (description vide ou « / »). */
  levels: 1 | 2
  descriptionHtml: [string, string]
  rulesHtml: string
  /** Les effets liés à chaque niveau (noms de l'onglet « Effets »). */
  effects: [string[], string[]]
  /** L'icône de la jauge des niveaux (réglages de la colonne Jauge de l'index). */
  gauge: Pick<GaugeSettings, "icon" | "emoji" | "color" | "strokeColor">
  /** L'image de la colonne Icône (Fichier image), si elle est remplie. */
  image: string
}

export type StatesCatalog = { states: StateDefinition[]; effects: StateEffect[] }

/**
 * Ce qu'un effet de l'état a écrit dans la fiche (un dé lancé, un effet redéclenché) : la
 * case et l'écart, pour le retirer quand l'état part. `id` : un lancer (son « Annuler »).
 */
export type StateWrite = { id: string; effect: string; cell: number; delta: number }

/** Un état posé sur un personnage : son nom (et son identifiant), le niveau atteint, et ce qu'il a écrit. */
export type CharacterState = { id: string; name: string; level: 1 | 2; written?: StateWrite[] }

type Table = { tabName: string; headers: string[]; rows: Array<{ values: string[]; html: string[] }> }
type Columns = Record<string, Array<{ header: string; spec: IndexColumnSpec }>>

function reader(headers: string[]) {
  const positions = new Map(headers.map((header, index) => [foldName(header), index] as const))
  return (row: { values: string[]; html: string[] }, names: string[], html = false) => {
    for (const name of names) {
      const index = positions.get(foldName(name))
      if (index !== undefined) return ((html ? row.html[index] : row.values[index]) ?? "").trim()
    }
    return ""
  }
}

function isEmptyLevel(text: string) {
  return !text.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").trim() || /^\/+$/.test(text.replace(/<[^>]+>/g, "").trim())
}

/** Le premier nombre d'un texte (« -10 », « +20 % », « − 15 ») ; null s'il n'y en a pas. */
export function changeAmount(text: string) {
  const match = text.replace(/\s+/g, "").replace("−", "-").replace(",", ".").match(/[+-]?\d+(?:\.\d+)?/)
  return match ? Number(match[0]) : null
}

/**
 * Les choix d'une colonne « … appliqué(e) à » (« Page entière, Portrait »). Une ancienne
 * case cochée (« TRUE », « Oui ») vaut « Page entière ».
 */
export function effectApply(value: string): EffectTargets {
  const chosen = new Set(value.split(/[,;\n]+/).map((part) => foldName(part)).filter(Boolean))
  const has = (option: (typeof EFFECT_APPLY_OPTIONS)[number]) => chosen.has(foldName(option))
  const legacyChecked = /^(oui|vrai|true|x|1|yes|✓|☑)$/i.test(value.trim())
  return { page: has("Page entière") || legacyChecked, skills: has("Compétence liée"), portrait: has("Portrait") }
}

/** L'Index des états lu tel qu'il est : onglets « États » et « Effets ». */
export function parseStatesCatalog(tables: Table[], columns: Columns): StatesCatalog {
  const statesTable = tables.find((table) => foldName(table.tabName) === foldName(STATES_TAB))
  const effectsTable = tables.find((table) => foldName(table.tabName) === foldName(EFFECTS_TAB))
  const effects: StateEffect[] = effectsTable ? effectsTable.rows.flatMap((row) => {
    const read = reader(effectsTable.headers)
    const name = read(row, ["Nom"])
    if (!name) return []
    const changeText = read(row, [EFFECT_CHANGE_HEADER])
    const operation = parseValueChange(changeText)
    return [{ name, targets: splitNames(read(row, [EFFECT_TARGET_HEADER])), color: read(row, [EFFECT_COLOR_HEADER]), change: operation?.kind === "add" ? operation.amount : null, changeText, operation, roll: parseRoll(read(row, [EFFECT_ROLL_HEADER])), retrigger: isCheckedValue(read(row, [EFFECT_RETRIGGER_HEADER, "Redéclencher", "Redéclancher l'effet"])), resetOnExit: isCheckedValue(read(row, [EFFECT_RESET_HEADER]), true), image: read(row, [EFFECT_IMAGE_HEADER]), apply: effectApply(read(row, [EFFECT_PAGE_HEADER, ...EFFECT_PAGE_LEGACY_HEADERS])), fxApply: effectApply(read(row, [EFFECT_FX_APPLY_HEADER])), fx: parseStateFx(read(row, [EFFECT_FX_HEADER])) }]
  }) : []
  // La colonne Jauge de l'onglet États donne l'icône (et sa couleur) des niveaux.
  const gaugeColumn = (columns[statesTable?.tabName ?? ""] ?? []).find((column) => column.spec.kind === "gauge")
  const iconColumn = (columns[statesTable?.tabName ?? ""] ?? []).find((column) => column.spec.kind === "file" && foldName(column.header).startsWith("icon"))
  const gauge = { icon: gaugeColumn?.spec.gauge?.icon, emoji: gaugeColumn?.spec.gauge?.emoji, color: gaugeColumn?.spec.gauge?.color, strokeColor: gaugeColumn?.spec.gauge?.strokeColor }
  const states: StateDefinition[] = statesTable ? statesTable.rows.flatMap((row) => {
    const read = reader(statesTable.headers)
    const name = read(row, ["Nom", "Nom de l'état"])
    if (!name) return []
    const first = read(row, ["Description niveau 1", "Niveau 1 description", "Description"], true)
    const second = read(row, ["Description niveau 2", "Niveau 2 description"], true)
    // Jauge « par ligne » : l'état a sa propre icône et sa couleur (« 2|skull|#b9504e »).
    const cell = gaugeColumn ? parseGaugeCell(read(row, [gaugeColumn.header])) : null
    const own = gaugeColumn?.spec.gauge?.perRow && cell ? cell.style : {}
    const declared = cell ? changeAmount(cell.count) : null
    const levels: 1 | 2 = declared === 1 ? 1 : declared === 2 ? 2 : isEmptyLevel(second) ? 1 : 2
    return [{
      id: read(row, ["ID"]) || `etat:${foldName(name)}`,
      name,
      nameHtml: /<[a-z]/i.test(read(row, ["Nom", "Nom de l'état"], true)) ? read(row, ["Nom", "Nom de l'état"], true) : "",
      type: read(row, ["Type de l'état", "Type"]),
      levels,
      descriptionHtml: [first, isEmptyLevel(second) ? "" : second],
      rulesHtml: isEmptyLevel(read(row, ["Règles liées aux états", "Règles"], true)) ? "" : read(row, ["Règles liées aux états", "Règles"], true),
      effects: [splitNames(read(row, [STATE_LEVEL_HEADERS[0]])), splitNames(read(row, [STATE_LEVEL_HEADERS[1]]))],
      gauge: { ...gauge, ...(own.emoji ? { icon: undefined, emoji: own.emoji } : own.icon ? { icon: own.icon, emoji: undefined } : {}), ...(own.color ? { color: own.color } : {}) },
      image: iconColumn ? read(row, [iconColumn.header]) : "",
    }]
  }) : []
  return { states, effects }
}

/** Les états posés sur la fiche, lus dans le JSON des choix (entrée « states »). */
export function parseCharacterStates(value: unknown): CharacterState[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return []
    const source = entry as Record<string, unknown>
    const name = typeof source.name === "string" ? source.name.trim().slice(0, 120) : ""
    const id = typeof source.id === "string" ? source.id.trim().slice(0, 80) : ""
    if (!name || seen.has(foldName(name))) return []
    seen.add(foldName(name))
    const written = parseStateWrites(source.written)
    return [{ id: id || `etat:${foldName(name)}`, name, level: source.level === 2 ? 2 as const : 1 as const, ...(written.length ? { written } : {}) }]
  }).slice(0, 40)
}

function parseStateWrites(value: unknown): StateWrite[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return []
    const source = entry as Record<string, unknown>
    const cell = typeof source.cell === "number" && Number.isInteger(source.cell) && source.cell >= 0 ? source.cell : -1
    const delta = typeof source.delta === "number" && Number.isFinite(source.delta) ? source.delta : 0
    if (cell < 0 || !delta) return []
    return [{ id: typeof source.id === "string" ? source.id.slice(0, 40) : "", effect: typeof source.effect === "string" ? source.effect.slice(0, 120) : "", cell, delta }]
  }).slice(-80)
}

/** Les états avec ce qu'un lancer vient d'écrire pour l'un d'eux (retrouvé par son nom). */
export function withStateWrites(states: CharacterState[], stateName: string, writes: StateWrite[]): CharacterState[] {
  if (!writes.length) return states
  return states.map((state) => foldName(state.name) === foldName(stateName) ? { ...state, written: [...(state.written ?? []), ...writes].slice(-80) } : state)
}

/** Les états sans les écritures d'un lancer annulé (« Annuler »). */
export function withoutStateWrites(states: CharacterState[], writeId: string): CharacterState[] {
  return states.map((state) => {
    if (!state.written?.some((write) => write.id === writeId)) return state
    const written = state.written.filter((write) => write.id !== writeId)
    return written.length ? { ...state, written } : { id: state.id, name: state.name, level: state.level }
  })
}

/**
 * Ce qu'il faut retirer de la fiche quand ces états partent : l'écart total par case, pour
 * les effets dont « Retiré en sortant de l'état » est coché (ou vide). Un effet qui n'est
 * plus dans l'index ne retire rien : on ne touche pas à ce qu'on ne sait plus lire.
 */
export function writesToRevert(catalog: StatesCatalog, removed: CharacterState[]) {
  const totals = new Map<number, number>()
  for (const state of removed) {
    for (const write of state.written ?? []) {
      const effect = catalog.effects.find((candidate) => foldName(candidate.name) === foldName(write.effect))
      if (!effect?.resetOnExit) continue
      totals.set(write.cell, (totals.get(write.cell) ?? 0) + write.delta)
    }
  }
  return [...totals.entries()].filter(([, delta]) => Math.abs(delta) > 1e-9).map(([cell, delta]) => ({ cell, delta: Math.round(delta * 100) / 100 }))
}

/** La définition d'un état posé (par identifiant, puis par nom). */
export function stateDefinitionOf(catalog: StatesCatalog, state: Pick<CharacterState, "id" | "name">) {
  return catalog.states.find((candidate) => candidate.id === state.id) ?? catalog.states.find((candidate) => foldName(candidate.name) === foldName(state.name))
}

/** Les effets en vigueur d'un état posé : ceux de son niveau atteint. */
export function activeEffectsOf(catalog: StatesCatalog, state: CharacterState) {
  const definition = stateDefinitionOf(catalog, state)
  if (!definition) return []
  const names = definition.effects[Math.min(state.level, definition.levels) - 1] ?? []
  return names.flatMap((name) => catalog.effects.filter((effect) => foldName(effect.name) === foldName(name)))
}

export type StateContribution = {
  state: string
  level: 1 | 2
  effect: string
  target: string
  /** L'ajout (0 pour un « = », une borne ou un effet seulement décoratif). */
  amount: number
  /** Un « = », un plancher ou un plafond, tant que l'état est posé. */
  operation?: ValueOperation
  /** L'opération en clair pour le survol (« +10 », « =100 », « ≥1 »). */
  label: string
  color: string
  fx: Array<{ name: StateFx; color: string }>
}

/** Les effets d'un niveau qui se déclenchent (« Redéclencher l'effet » coché). */
export function triggeredEffectsOf(catalog: StatesCatalog, state: CharacterState) {
  return activeEffectsOf(catalog, state).filter((effect) => effect.retrigger)
}

/** Un effet qui se lance depuis la fiche : un jet, ou des dés dans son changement de valeur. */
export function isRolledEffect(effect: StateEffect) {
  return Boolean(effect.roll) || effect.operation?.kind === "roll"
}

/**
 * Ce que les états posés changent : un changement par effet et par cible visée. `targetOf`
 * traduit le nom d'une caractéristique ou d'une compétence en cible de la fiche.
 */
export function stateContributions(catalog: StatesCatalog, states: CharacterState[], targetOf: (name: string) => string | null): StateContribution[] {
  return states.flatMap((state) => activeEffectsOf(catalog, state).flatMap((effect) => {
    // Un effet lancé (jet, dés) ne change rien tant qu'on ne le lance pas depuis la fiche ;
    // un effet à redéclencher s'écrit dans la fiche quand il se déclenche, jamais en plus.
    const lasting = isRolledEffect(effect) || effect.retrigger ? null : effect.operation
    const changes = Boolean(lasting && (lasting.kind !== "add" || lasting.amount))
    // Une cible sans changement de valeur peut tout de même recevoir la couleur ou des FX.
    const decorates = (effect.apply.skills && isColor(effect.color)) || (effect.fxApply.skills && effect.fx.length > 0)
    if (!changes && !decorates) return []
    return effect.targets.flatMap((name) => {
      const target = targetOf(name)
      if (!target) return []
      // La couleur et les FX ne vont sur la case visée que si « Compétence liée » est choisi.
      return [{
        state: state.name,
        level: state.level,
        effect: effect.name,
        target,
        amount: changes && lasting?.kind === "add" ? lasting.amount : 0,
        operation: changes && lasting && lasting.kind !== "add" ? lasting : undefined,
        label: changes && lasting ? operationLabel(lasting) : "",
        color: effect.apply.skills ? effect.color : "",
        fx: effect.fxApply.skills ? effect.fx.map((fx) => ({ name: fx, color: isColor(effect.color) ? effect.color : "" })) : [],
      }]
    })
  }))
}

const isColor = (color: string) => /^#[0-9a-f]{3,8}$/i.test(color)

/** Les couleurs, images et FX des effets en vigueur, pour le portrait et la page. */
export function portraitLayers(catalog: StatesCatalog, states: CharacterState[]) {
  const effects = states.flatMap((state) => activeEffectsOf(catalog, state))
  // La couleur ne s'applique qu'où c'est choisi : la page entière, le portrait.
  const colors = [...new Set(effects.filter((effect) => effect.apply.portrait).map((effect) => effect.color).filter(isColor))]
  const sheetColors = [...new Set(effects.filter((effect) => effect.apply.page).map((effect) => effect.color).filter(isColor))]
  const images = [...new Set(effects.map((effect) => effect.image).filter(Boolean))]
  // Les FX ne se dessinent qu'où « FX appliqué à » le dit, teintés de la couleur de l'effet.
  const fxOf = (where: (effect: StateEffect) => boolean) => {
    const fx = effects.filter(where).flatMap((effect) => effect.fx.map((name) => ({ name, color: isColor(effect.color) ? effect.color : "" })))
    return [...new Map(fx.map((item) => [item.name, item])).values()]
  }
  return { colors, sheetColors, images, fx: fxOf((effect) => effect.fxApply.portrait), sheetFx: fxOf((effect) => effect.fxApply.page) }
}
