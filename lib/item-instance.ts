import { documentItemEntries } from "@/lib/document-model"

/**
 * Ce qu'un exemplaire de l'inventaire porte en propre, au-delà de ses liens chiffrés : sa
 * réserve (les portions d'un plat, les doses d'une potion), les items qu'il donne en plus quand
 * on le recycle, et les lignes de son effet avec ce qui les apporte (un plat cuisiné : l'effet de
 * chaque ingrédient). Rangés dans le JSON de l'exemplaire (colonne « Modificateurs ») comme la
 * marque d'un document donné (lib/document-model.ts) : une entrée par chose, avec une cible que
 * les autres lectures ignorent (« reserve », « recyclage », « effet »). Les versions d'Eraser qui
 * ne les connaissent pas les ignorent aussi.
 *
 * Chaque réécriture du JSON (enclume, charges, déplacement…) les garde : `withKeptItemEntries`.
 * Module commun à la page et au serveur.
 */

export const ITEM_RESERVE_TARGET = "reserve"
export const ITEM_RECYCLE_TARGET = "recyclage"
export const ITEM_EFFECT_TARGET = "effet"

/** Les plus grands nombres d'une réserve (restant, total, Nutrition par portion). */
export const ITEM_RESERVE_MAX = 99
/** Combien de noms « se recycle en » un exemplaire peut porter. */
export const ITEM_RECYCLE_NAMES_MAX = 10
/** Combien de lignes d'effet un exemplaire peut porter, et la longueur de chacune. */
export const ITEM_EFFECT_SOURCES_MAX = 30
export const ITEM_EFFECT_TEXT_MAX = 300
/** La longueur d'un nom d'item (celle de l'inventaire). */
const ITEM_NAME_MAX = 160

export type ItemReserveUnit = "portion" | "dose"
export const itemReserveUnits: ItemReserveUnit[] = ["portion", "dose"]

/** `count` : ce qui reste ; `total` : ce que l'exemplaire avait ; `nutrition` : ce qu'une portion rend à la barre de rassasiement. */
export type ItemReserve = { count: number; total: number; unit: ItemReserveUnit; nutrition?: number }

/**
 * Une ligne de l'effet d'un exemplaire et l'item qui l'apporte (`source`, son nom). `type` : le
 * type de cet item dans l'Index des items, retrouvé par le serveur à la création (un effet d'un
 * type caché reste « Effet inconnu » tant que le personnage ne l'a pas débloqué).
 */
export type ItemEffectSource = { source: string; text: string; type?: string }

type Entry = Record<string, unknown> & { target?: unknown }

function entriesOf(raw: string): Entry[] {
  if (!raw.trim()) return []
  try {
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? parsed.filter((entry): entry is Entry => Boolean(entry) && typeof entry === "object" && !Array.isArray(entry)) : []
  } catch { return [] }
}

const isWhole = (value: unknown, min: number, max: number): value is number => typeof value === "number" && Number.isInteger(value) && value >= min && value <= max

/* ---------- la réserve ---------- */

export function parseItemReserve(raw: string): ItemReserve | null {
  for (const entry of entriesOf(raw)) {
    if (entry.target !== ITEM_RESERVE_TARGET) continue
    const match = /^(\d{1,2})\/(\d{1,2})$/.exec(String(entry.value ?? "").trim())
    const unit = entry.unit
    if (!match || (unit !== "portion" && unit !== "dose")) return null
    const total = Number(match[2])
    const count = Math.min(Number(match[1]), total)
    if (total < 1 || total > ITEM_RESERVE_MAX) return null
    const nutrition = isWhole(entry.nutrition, 0, ITEM_RESERVE_MAX) && entry.nutrition > 0 ? entry.nutrition : undefined
    return { count, total, unit, ...(nutrition ? { nutrition } : {}) }
  }
  return null
}

function reserveEntry(reserve: ItemReserve) {
  return { target: ITEM_RESERVE_TARGET, value: `${reserve.count}/${reserve.total}`, unit: reserve.unit, ...(reserve.nutrition ? { nutrition: reserve.nutrition } : {}) }
}

/**
 * La réserve envoyée par une requête (`create-item`), vérifiée strictement : `undefined` si elle
 * n'est pas donnée, `null` si elle est mal formée (la requête est refusée).
 */
export function itemReserveInput(value: unknown): ItemReserve | null | undefined {
  if (value === undefined || value === null) return undefined
  if (typeof value !== "object" || Array.isArray(value)) return null
  const source = value as Record<string, unknown>
  if (!isWhole(source.count, 1, ITEM_RESERVE_MAX) || !isWhole(source.total, 1, ITEM_RESERVE_MAX) || source.count > source.total) return null
  if (source.unit !== "portion" && source.unit !== "dose") return null
  if (source.nutrition !== undefined && !isWhole(source.nutrition, 0, ITEM_RESERVE_MAX)) return null
  const nutrition = typeof source.nutrition === "number" && source.nutrition > 0 ? source.nutrition : undefined
  return { count: source.count, total: source.total, unit: source.unit, ...(nutrition ? { nutrition } : {}) }
}

/** Le même exemplaire, avec cette réserve (`null` : sans réserve). */
export function withItemReserve(raw: string, reserve: ItemReserve | null) {
  const others = entriesOf(raw).filter((entry) => entry.target !== ITEM_RESERVE_TARGET)
  const all = reserve ? [...others, reserveEntry(reserve)] : others
  return all.length ? JSON.stringify(all) : ""
}

/**
 * Une unité de la réserve consommée. `emptied` : c'était la dernière, l'exemplaire est consommé
 * (le JSON rendu a alors sa réserve pleine, pour l'exemplaire suivant d'une pile). `null` : rien
 * à consommer.
 */
export function consumeItemReserve(raw: string): { modifiers: string; reserve: ItemReserve; emptied: boolean } | null {
  const reserve = parseItemReserve(raw)
  if (!reserve || reserve.count < 1) return null
  const left = reserve.count - 1
  const next = { ...reserve, count: left > 0 ? left : reserve.total }
  return { modifiers: withItemReserve(raw, next), reserve: { ...reserve, count: left }, emptied: left === 0 }
}

/** L'exemplaire tel que la page le montre avec `used` unités déjà consommées (pas encore confirmées). */
export function itemReserveAfter(reserve: ItemReserve, used: number): ItemReserve {
  return { ...reserve, count: Math.max(0, reserve.count - Math.max(0, Math.trunc(used))) }
}

/** « 2 / 3 portions », « 1 / 1 dose ». */
export function itemReserveLabel(reserve: ItemReserve) {
  return `${reserve.count} / ${reserve.total} ${reserve.unit}${reserve.total > 1 ? "s" : ""}`
}

/* ---------- ce que l'exemplaire donne en plus au recyclage ---------- */

export function parseItemRecycleNames(raw: string): string[] {
  const names: string[] = []
  for (const entry of entriesOf(raw)) {
    if (entry.target !== ITEM_RECYCLE_TARGET || typeof entry.value !== "string") continue
    const name = entry.value.trim().slice(0, ITEM_NAME_MAX)
    if (name && !names.some((known) => foldText(known) === foldText(name))) names.push(name)
  }
  return names.slice(0, ITEM_RECYCLE_NAMES_MAX)
}

/** Les noms envoyés par une requête : 1 à 10 noms non vides. `undefined` : absents ; `null` : mal formés. */
export function itemRecycleInput(value: unknown): string[] | null | undefined {
  if (value === undefined || value === null) return undefined
  if (!Array.isArray(value) || value.length < 1 || value.length > ITEM_RECYCLE_NAMES_MAX) return null
  const names: string[] = []
  for (const name of value) {
    if (typeof name !== "string" || !name.trim() || name.trim().length > ITEM_NAME_MAX) return null
    if (!names.some((known) => foldText(known) === foldText(name))) names.push(name.trim())
  }
  return names
}

/* ---------- les lignes de l'effet et ce qui les apporte ---------- */

export function parseItemEffectSources(raw: string): ItemEffectSource[] {
  return entriesOf(raw).flatMap((entry) => {
    if (entry.target !== ITEM_EFFECT_TARGET || typeof entry.value !== "string" || typeof entry.source !== "string") return []
    const text = entry.value.trim().slice(0, ITEM_EFFECT_TEXT_MAX)
    const source = entry.source.trim().slice(0, ITEM_NAME_MAX)
    const type = typeof entry.type === "string" ? entry.type.trim().slice(0, ITEM_NAME_MAX) : ""
    return text && source ? [{ source, text, ...(type ? { type } : {}) }] : []
  }).slice(0, ITEM_EFFECT_SOURCES_MAX)
}

/**
 * Les lignes envoyées par une requête : 0 à 30 lignes `{ source, text }`, textes de 300
 * caractères au plus. Le type n'est jamais pris de la requête : le serveur le retrouve.
 */
export function itemEffectSourcesInput(value: unknown): ItemEffectSource[] | null | undefined {
  if (value === undefined || value === null) return undefined
  if (!Array.isArray(value) || value.length > ITEM_EFFECT_SOURCES_MAX) return null
  const lines: ItemEffectSource[] = []
  for (const line of value) {
    if (!line || typeof line !== "object" || Array.isArray(line)) return null
    const { source, text } = line as Record<string, unknown>
    if (typeof source !== "string" || typeof text !== "string") return null
    if (!source.trim() || source.trim().length > ITEM_NAME_MAX || !text.trim() || text.trim().length > ITEM_EFFECT_TEXT_MAX) return null
    lines.push({ source: source.trim(), text: text.trim() })
  }
  return lines
}

/* ---------- ensemble ---------- */

export type ItemInstanceInput = { reserve?: ItemReserve; recycle?: string[]; effectSources?: ItemEffectSource[] }

/** Ce qu'une requête `create-item` ajoute à l'exemplaire, vérifié ; `null` : quelque chose est mal formé. */
export function itemInstanceInput(body: Record<string, unknown>): ItemInstanceInput | null {
  const reserve = itemReserveInput(body.reserve)
  const recycle = itemRecycleInput(body.recycle)
  const effectSources = itemEffectSourcesInput(body.effectSources)
  if (reserve === null || recycle === null || effectSources === null) return null
  return { ...(reserve ? { reserve } : {}), ...(recycle?.length ? { recycle } : {}), ...(effectSources?.length ? { effectSources } : {}) }
}

/**
 * Ce qu'une requête `create-item` ajoute à l'exemplaire (`reserve`, `recycle`, `effectSources`,
 * tous facultatifs) : `undefined` s'il n'y a rien. Mal formé : refusé (`INVALID_INVENTORY_INSTANCE`).
 */
export function requestedItemInstance(body: Record<string, unknown>): ItemInstanceInput | undefined {
  const input = itemInstanceInput(body)
  if (!input) throw new Error("INVALID_INVENTORY_INSTANCE")
  return Object.keys(input).length ? input : undefined
}

/** Le JSON d'un exemplaire neuf qui porte tout cela (`""` : rien). */
export function serializeItemInstance(input: ItemInstanceInput) {
  const entries = [
    ...(input.reserve ? [reserveEntry(input.reserve)] : []),
    ...(input.recycle ?? []).slice(0, ITEM_RECYCLE_NAMES_MAX).map((name) => ({ target: ITEM_RECYCLE_TARGET, value: name })),
    ...(input.effectSources ?? []).slice(0, ITEM_EFFECT_SOURCES_MAX).map((line) => ({ target: ITEM_EFFECT_TARGET, source: line.source, value: line.text, ...(line.type ? { type: line.type } : {}) })),
  ]
  return entries.length ? JSON.stringify(entries) : ""
}

const keptTargets = [ITEM_RESERVE_TARGET, ITEM_RECYCLE_TARGET, ITEM_EFFECT_TARGET] as const

/**
 * Les liens réécrits d'un exemplaire (`links`, du JSON qui n'a que des liens : enclume, charges),
 * avec ce que l'exemplaire portait déjà en propre (`previous`) : la marque d'un document, la
 * réserve, le recyclage et les lignes d'effet. Une sorte déjà présente dans `links` l'emporte.
 */
export function withKeptItemEntries(links: string, previous: string) {
  const current = entriesOf(links)
  const has = (target: string) => current.some((entry) => entry.target === target)
  const before = entriesOf(previous)
  const kept = [
    ...(has("document") ? [] : documentItemEntries(previous)),
    ...keptTargets.flatMap((target) => has(target) ? [] : before.filter((entry) => entry.target === target)),
  ]
  return kept.length ? JSON.stringify([...current, ...kept]) : links
}

function foldText(value: string) {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[’']/g, "'").replace(/\s+/g, " ").trim().toLocaleLowerCase("fr")
}
