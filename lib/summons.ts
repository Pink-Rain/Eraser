/**
 * Invocations de la fiche : des templates (moules nommés, champs pré-remplis) et les
 * invocations posées à partir d'eux. Une invocation copie le template au moment où elle
 * est créée puis vit sa vie : modifier le template ne la change plus.
 *
 * Le tout est rangé dans l'onglet Invocation lui-même, dans la case JSON « Onglets
 * personnalisés » de la feuille : aucune colonne nouvelle, aucune migration.
 */

/** Une caractéristique d'invocation : un nom (de l'index ou libre) et une valeur. */
export type SummonStat = { id: string; name: string; value: string }

export type SummonField =
  | { id: string; kind: "life"; label: string; current: string; max: string }
  /** `group` : hérité des premiers templates (principales / secondaires séparées) ; un seul bloc désormais. */
  | { id: string; kind: "stats"; label: string; group: "principale" | "secondaire"; stats: SummonStat[] }
  /** Un sort écrit à la main ; chaque option absente est un champ que le joueur n'a pas voulu. */
  | { id: string; kind: "spell"; label: string; description: string; action?: string; distance?: string; skill?: string; charges?: number; chargesLeft?: number }
  | { id: string; kind: "text"; label: string; value: string; long?: boolean }

export type SummonFieldKind = SummonField["kind"]
export type SummonTemplate = { id: string; name: string; color: string; fields: SummonField[] }
/** `type` et `color` : ceux du template au moment de l'invocation, pour la ranger même s'il disparaît. */
export type Summon = { id: string; templateId: string; type: string; color: string; name: string; fields: SummonField[] }
export type SummonsData = { templates: SummonTemplate[]; summons: Summon[] }

export const summonColors = ["#8a6fb0", "#4f9a8a", "#b9504e", "#d29a4a", "#4f7fb0", "#a76f9d", "#6d8f6a", "#7d7f86"]
/** Les étoiles de charge de la fiche s'arrêtent à cinq. */
export const SUMMON_MAX_CHARGES = 5

export const emptySummonsData = (): SummonsData => ({ templates: [], summons: [] })

export function newSummonId() {
  const random = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`
  return random.replace(/-/g, "").slice(0, 10)
}

const text = (value: unknown, fallback = "") => typeof value === "string" ? value : typeof value === "number" && Number.isFinite(value) ? String(value) : fallback
const id = (value: unknown) => typeof value === "string" && value ? value : newSummonId()
const color = (value: unknown) => typeof value === "string" && /^#[0-9a-f]{3,8}$/i.test(value) ? value : summonColors[0]
const optional = (value: unknown) => typeof value === "string" ? value : undefined

function chargeCount(value: unknown) {
  const number = Math.trunc(Number(value))
  return Number.isFinite(number) && number > 0 ? Math.min(SUMMON_MAX_CHARGES, number) : undefined
}

function parseField(raw: unknown): SummonField[] {
  if (!raw || typeof raw !== "object") return []
  const field = raw as Record<string, unknown>
  const base = { id: id(field.id), label: text(field.label) }
  if (field.kind === "life") return [{ ...base, kind: "life", current: text(field.current), max: text(field.max) }]
  if (field.kind === "stats") {
    const stats = Array.isArray(field.stats) ? field.stats.flatMap((stat) => stat && typeof stat === "object" ? [{ id: id((stat as SummonStat).id), name: text((stat as SummonStat).name), value: text((stat as SummonStat).value) }] : []) : []
    return [{ ...base, kind: "stats", group: field.group === "secondaire" ? "secondaire" : "principale", stats }]
  }
  if (field.kind === "spell") {
    const charges = chargeCount(field.charges)
    const spell: SummonField = { ...base, kind: "spell", description: text(field.description) }
    for (const key of ["action", "distance", "skill"] as const) { const value = optional(field[key]); if (value !== undefined) spell[key] = value }
    if (charges) { spell.charges = charges; spell.chargesLeft = Math.max(0, Math.min(charges, Math.trunc(Number(field.chargesLeft ?? charges)) || 0)) }
    return [spell]
  }
  if (field.kind === "text") return [{ ...base, kind: "text", value: text(field.value), ...(field.long ? { long: true } : {}) }]
  return []
}

const parseFields = (raw: unknown) => Array.isArray(raw) ? raw.flatMap(parseField) : []

/** Relit ce que l'onglet a enregistré ; ce qui est abîmé est ignoré, jamais une erreur. */
export function parseSummonsData(raw: unknown): SummonsData {
  if (!raw || typeof raw !== "object") return emptySummonsData()
  const data = raw as Record<string, unknown>
  const templates = Array.isArray(data.templates) ? data.templates.flatMap((template) => template && typeof template === "object"
    ? [{ id: id(template.id), name: text(template.name).trim() || "Invocation", color: color(template.color), fields: parseFields(template.fields) }]
    : []) : []
  const summons = Array.isArray(data.summons) ? data.summons.flatMap((summon) => summon && typeof summon === "object"
    ? [{ id: id(summon.id), templateId: text(summon.templateId), type: text(summon.type).trim() || "Invocation", color: color(summon.color), name: text(summon.name).trim() || text(summon.type).trim() || "Invocation", fields: parseFields(summon.fields) }]
    : []) : []
  return { templates, summons }
}

export const summonFieldKinds: Array<{ kind: SummonFieldKind; long?: boolean; label: string; hint: string }> = [
  { kind: "life", label: "Points de vie", hint: "Actuels et maximum, avec une jauge" },
  { kind: "stats", label: "Caractéristiques", hint: "Principales pré-remplies ; secondaires ou libres à ajouter" },
  { kind: "spell", label: "Sort", hint: "Écrit à la main : action, distance, charges, compétence" },
  { kind: "text", label: "Champ libre", hint: "Une valeur courte" },
  { kind: "text", long: true, label: "Texte long", hint: "Description, comportement, notes" },
]

/** Un champ neuf pour l'éditeur ; le bloc de caractéristiques arrive avec les principales de l'index. */
export function newSummonField(kind: SummonFieldKind, options: { long?: boolean; principals?: string[] } = {}): SummonField {
  const fieldId = newSummonId()
  if (kind === "life") return { id: fieldId, kind, label: "Points de vie", current: "10", max: "10" }
  if (kind === "stats") {
    return { id: fieldId, kind, group: "principale", label: "Caractéristiques", stats: (options.principals ?? []).map((name) => ({ id: newSummonId(), name, value: "0" })) }
  }
  if (kind === "spell") return { id: fieldId, kind, label: "Nouveau sort", description: "", action: "", distance: "" }
  return { id: fieldId, kind: "text", label: options.long ? "Description" : "Champ libre", value: "", ...(options.long ? { long: true } : {}) }
}

/** Une copie aux identifiants neufs : deux invocations du même template ne partagent rien. */
export function cloneSummonFields(fields: SummonField[]): SummonField[] {
  return fields.map((field) => field.kind === "stats"
    ? { ...field, id: newSummonId(), stats: field.stats.map((stat) => ({ ...stat, id: newSummonId() })) }
    : field.kind === "spell" && field.charges
      ? { ...field, id: newSummonId(), chargesLeft: field.charges }
      : { ...field, id: newSummonId() })
}

/** « Loup », puis « Loup 2 », « Loup 3 »… sans reprendre un nom déjà porté. */
export function nextSummonName(base: string, taken: string[]) {
  const name = base.trim() || "Invocation"
  const used = new Set(taken.map((value) => value.trim().toLocaleLowerCase("fr")))
  if (!used.has(name.toLocaleLowerCase("fr"))) return name
  for (let number = 2; ; number += 1) if (!used.has(`${name} ${number}`.toLocaleLowerCase("fr"))) return `${name} ${number}`
}

/** Invoque : le template est copié tel qu'il est maintenant (vie pleine, charges pleines). */
export function summonFromTemplate(template: SummonTemplate, existing: Summon[]): Summon {
  const fields = cloneSummonFields(template.fields).map((field) => field.kind === "life" ? { ...field, current: field.max || field.current } : field)
  return { id: newSummonId(), templateId: template.id, type: template.name, color: template.color, name: nextSummonName(template.name, existing.map((summon) => summon.name)), fields }
}

/** Le même être, une seconde fois : son état actuel est gardé, seul le nom change. */
export function duplicateSummon(summon: Summon, existing: Summon[]): Summon {
  const base = summon.name.replace(/\s+\d+$/, "")
  return { ...summon, id: newSummonId(), name: nextSummonName(base, existing.map((item) => item.name)), fields: cloneSummonFields(summon.fields).map((field, index) => field.kind === "spell" && summon.fields[index]?.kind === "spell" ? { ...field, chargesLeft: (summon.fields[index] as typeof field).chargesLeft } : field) }
}

export type SummonGroup = { key: string; type: string; color: string; template?: SummonTemplate; summons: Summon[] }

/**
 * Les invocations rangées par type : d'abord dans l'ordre des templates, puis les types
 * dont le template a été supprimé, par ordre alphabétique.
 */
export function groupSummons(data: SummonsData): SummonGroup[] {
  const groups = new Map<string, SummonGroup>()
  for (const template of data.templates) groups.set(`t:${template.id}`, { key: `t:${template.id}`, type: template.name, color: template.color, template, summons: [] })
  const orphans = new Map<string, SummonGroup>()
  for (const summon of data.summons) {
    const owned = groups.get(`t:${summon.templateId}`)
    if (owned) { owned.summons.push(summon); continue }
    const key = `o:${summon.type.toLocaleLowerCase("fr")}`
    if (!orphans.has(key)) orphans.set(key, { key, type: summon.type, color: summon.color, summons: [] })
    orphans.get(key)!.summons.push(summon)
  }
  return [
    ...[...groups.values()].filter((group) => group.summons.length),
    ...[...orphans.values()].sort((a, b) => a.type.localeCompare(b.type, "fr")),
  ]
}

/** La jauge de vie : 0 à 100, et « vaincue » dès que la vie actuelle tombe à 0 avec un maximum posé. */
export function summonLife(field: Extract<SummonField, { kind: "life" }>) {
  const current = Number.parseFloat(field.current.replace(",", "."))
  const max = Number.parseFloat(field.max.replace(",", "."))
  const ratio = Number.isFinite(current) && Number.isFinite(max) && max > 0 ? Math.max(0, Math.min(100, (current / max) * 100)) : 0
  return { ratio, down: Number.isFinite(current) && Number.isFinite(max) && max > 0 && current <= 0 }
}

export const isSummonDown = (summon: Summon) => summon.fields.some((field) => field.kind === "life" && summonLife(field).down)
