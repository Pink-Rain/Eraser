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
import { foldName, parseGaugeCell } from "@/lib/index-columns"
import { parseStateFx, type StateFx } from "@/lib/state-fx"
import type { GaugeSettings, IndexColumnSpec } from "@/lib/index-columns"
import {
  EFFECT_CHANGE_HEADER,
  EFFECT_COLOR_HEADER,
  EFFECT_IMAGE_HEADER,
  EFFECT_FX_HEADER,
  EFFECT_TARGET_HEADER,
  EFFECT_APPLY_OPTIONS,
  EFFECT_PAGE_HEADER,
  EFFECT_PAGE_LEGACY_HEADERS,
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
  /** Le changement chiffré (« -10 », « +20 ») ; null s'il n'est pas lisible. */
  change: number | null
  changeText: string
  image: string
  /** Où sa couleur s'applique (colonne « Appliqué à la page ») ; nulle part si rien n'est choisi. */
  apply: { page: boolean; skills: boolean; portrait: boolean }
  fx: StateFx[]
}

export type StateDefinition = {
  id: string
  name: string
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

/** Un état posé sur un personnage : son nom (et son identifiant) et le niveau atteint. */
export type CharacterState = { id: string; name: string; level: 1 | 2 }

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
 * Les choix de la colonne « Appliqué à la page » (« Page entière, Portrait »). Une ancienne
 * case cochée (« TRUE », « Oui ») vaut « Page entière ».
 */
export function effectApply(value: string) {
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
    return [{ name, targets: splitNames(read(row, [EFFECT_TARGET_HEADER])), color: read(row, [EFFECT_COLOR_HEADER]), change: changeAmount(changeText), changeText, image: read(row, [EFFECT_IMAGE_HEADER]), apply: effectApply(read(row, [EFFECT_PAGE_HEADER, ...EFFECT_PAGE_LEGACY_HEADERS])), fx: parseStateFx(read(row, [EFFECT_FX_HEADER])) }]
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
    return [{ id: id || `etat:${foldName(name)}`, name, level: source.level === 2 ? 2 as const : 1 as const }]
  }).slice(0, 40)
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

export type StateContribution = { state: string; level: 1 | 2; effect: string; target: string; amount: number; color: string }

/**
 * Ce que les états posés changent : un changement par effet et par cible visée. `targetOf`
 * traduit le nom d'une caractéristique ou d'une compétence en cible de la fiche.
 */
export function stateContributions(catalog: StatesCatalog, states: CharacterState[], targetOf: (name: string) => string | null): StateContribution[] {
  return states.flatMap((state) => activeEffectsOf(catalog, state).flatMap((effect) => {
    if (effect.change === null || !effect.change) return []
    return effect.targets.flatMap((name) => {
      const target = targetOf(name)
      // La couleur ne teinte la case visée que si « Compétence liée » est choisi.
      return target ? [{ state: state.name, level: state.level, effect: effect.name, target, amount: effect.change as number, color: effect.apply.skills ? effect.color : "" }] : []
    })
  }))
}

/** Les couleurs et images des effets en vigueur, pour le portrait. */
export function portraitLayers(catalog: StatesCatalog, states: CharacterState[]) {
  const effects = states.flatMap((state) => activeEffectsOf(catalog, state))
  const isColor = (color: string) => /^#[0-9a-f]{3,8}$/i.test(color)
  // La couleur ne s'applique qu'où c'est choisi : la page entière, le portrait.
  const colors = [...new Set(effects.filter((effect) => effect.apply.portrait).map((effect) => effect.color).filter(isColor))]
  const sheetColors = [...new Set(effects.filter((effect) => effect.apply.page).map((effect) => effect.color).filter(isColor))]
  const images = [...new Set(effects.map((effect) => effect.image).filter(Boolean))]
  const fx = effects.flatMap((effect) => effect.fx.map((name) => ({ name, color: isColor(effect.color) ? effect.color : "" })))
  return { colors, sheetColors, images, fx: [...new Map(fx.map((item) => [item.name, item])).values()] }
}
