/**
 * Les cadenas des colonnes, tels qu'on les règle dans « Modifier » › Colonnes : un cadenas
 * posé ou retiré à la main, les usages qu'on ajoute (« Le tabletop lit cette colonne »), et
 * les usages d'Eraser qu'on écarte. Nom et ID restent toujours verrouillés : chaque ligne est
 * retrouvée par eux.
 *
 * Un cadenas vaut pour tout le monde : gardé sur le serveur partagé d'Eraser
 * (lib/index-locks-store.ts), jamais dans Google Sheets. Sans dépendance : l'éditeur, le
 * serveur (qui refuse une opération verrouillée) et les tests s'en servent.
 */
import { foldName } from "@/lib/index-columns"
import { freePolicy, type ColumnPolicy } from "@/lib/index-schema-shared"

/** Le réglage d'une colonne : verrouillée à la main, ses usages ajoutés, les usages d'Eraser écartés. */
export type ColumnLockOverride = {
  /** `true` : cadenas posé à la main (même sans usage écrit) ; `false` : cadenas d'Eraser retiré. */
  locked?: boolean
  /** Les usages écrits à la main (« Le tabletop lit cette colonne »). */
  uses?: string[]
  /** Les usages d'Eraser écartés de la liste (par leur texte). */
  hidden?: string[]
}

/** Les réglages d'un onglet, par colonne (nom sans accents ni casse). */
export type TabLocks = Record<string, ColumnLockOverride>

const MAX_USES = 20
const MAX_TEXT = 200

function cleanList(value: unknown) {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  return value.flatMap((item) => {
    const text = typeof item === "string" ? item.replace(/\s+/g, " ").trim().slice(0, MAX_TEXT) : ""
    if (!text || seen.has(text)) return []
    seen.add(text)
    return [text]
  }).slice(0, MAX_USES)
}

/** Un réglage lu (JSON de l'enregistrement ou envoyé par l'éditeur), borné ; `null` s'il ne dit rien. */
export function cleanLockOverride(input: unknown): ColumnLockOverride | null {
  if (!input || typeof input !== "object") return null
  const raw = input as Record<string, unknown>
  const override: ColumnLockOverride = {}
  if (raw.locked === true || raw.locked === false) override.locked = raw.locked
  const uses = cleanList(raw.uses)
  const hidden = cleanList(raw.hidden)
  if (uses.length) override.uses = uses
  if (hidden.length) override.hidden = hidden
  return Object.keys(override).length ? override : null
}

/** Les réglages d'un onglet, nettoyés ; `null` s'il n'en reste aucun. */
export function cleanTabLocks(input: unknown): TabLocks | null {
  let value = input
  if (typeof value === "string") {
    if (!value.trim()) return null
    try { value = JSON.parse(value) } catch { return null }
  }
  if (!value || typeof value !== "object") return null
  const result: TabLocks = {}
  for (const [column, raw] of Object.entries(value as Record<string, unknown>).slice(0, 200)) {
    const key = foldName(column)
    const override = cleanLockOverride(raw)
    if (key && override) result[key] = override
  }
  return Object.keys(result).length ? result : null
}

/** Le réglage d'une colonne parmi ceux d'un onglet. */
export function lockOverrideOf(locks: TabLocks | null | undefined, column: string): ColumnLockOverride | undefined {
  return locks?.[foldName(column)]
}

/**
 * La politique d'une colonne une fois le réglage appliqué : les usages d'Eraser écartés
 * disparaissent, les usages ajoutés s'ajoutent, et la colonne est verrouillée s'il reste au
 * moins un usage ou si le cadenas est posé à la main. Une colonne permanente (Nom, ID) reste
 * verrouillée quoi qu'on règle ; un cadenas retiré rend la colonne libre, avec les usages
 * d'Eraser gardés en mémoire (`builtin`) pour les remontrer.
 */
export function applyLockOverride(policy: ColumnPolicy, override: ColumnLockOverride | undefined): ColumnPolicy {
  const builtin = policy.builtin ?? policy.reasons
  if (policy.permanent) return { ...policy, builtin, manual: [] }
  if (!override) return { ...policy, builtin, manual: [] }
  const hidden = new Set(override.hidden ?? [])
  const kept = builtin.filter((reason) => !hidden.has(reason))
  const manual = override.uses ?? []
  const reasons = [...kept, ...manual]
  const locked = override.locked === true || (override.locked !== false && reasons.length > 0)
  if (!locked) return { ...freePolicy, reasons: [], builtin, manual, hidden: [...hidden], unlocked: builtin.length > 0 }
  // Un cadenas d'Eraser gardé garde ses droits (un type qu'on peut changer malgré lui) ; un cadenas posé ferme tout.
  const fromEraser = kept.length > 0 && policy.reasons.length > 0
  return {
    rename: fromEraser ? policy.rename : false,
    type: fromEraser ? policy.type : false,
    remove: fromEraser ? policy.remove : false,
    reasons,
    allowed: fromEraser ? policy.allowed : "L’affichage : description, « Masquée », style imposé, couleurs et ordre des options.",
    builtin,
    manual,
    hidden: [...hidden],
  }
}

/** Le réglage à enregistrer pour obtenir `policy` à partir des usages d'Eraser ; `null` : rien à garder. */
export function lockOverrideFor(policy: ColumnPolicy): ColumnLockOverride | null {
  if (policy.permanent) return null
  const builtin = policy.builtin ?? []
  const manual = policy.manual ?? []
  const hidden = (policy.hidden ?? []).filter((reason) => builtin.includes(reason))
  const locked = policy.reasons.length > 0 || (!policy.rename && !policy.type && !policy.remove)
  const kept = builtin.filter((reason) => !hidden.includes(reason))
  const override: ColumnLockOverride = {}
  if (manual.length) override.uses = manual
  if (hidden.length) override.hidden = hidden
  // Verrouillée sans aucun usage : le cadenas est posé à la main. Libre alors qu'Eraser la lit : retiré à la main.
  if (locked && !kept.length && !manual.length) override.locked = true
  if (!locked && builtin.length > 0 && kept.length > 0) override.locked = false
  return Object.keys(override).length ? override : null
}

/** Deux réglages d'onglet identiques. */
export function sameTabLocks(left: TabLocks | null, right: TabLocks | null) {
  const normalize = (locks: TabLocks | null) => JSON.stringify(Object.fromEntries(Object.entries(locks ?? {}).sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => [key, { locked: value.locked, uses: value.uses ?? [], hidden: value.hidden ?? [] }])))
  return normalize(left) === normalize(right)
}

/** Les cadenas d'un onglet parmi ceux d'un index (nom d'onglet sans accents ni casse). */
export function tabLocksOf(locks: Record<string, TabLocks> | null | undefined, tab: string): TabLocks | null {
  if (!locks) return null
  const wanted = tab.replace(/\s+/g, " ").trim().normalize("NFD").replace(/[̀-ͯ]/g, "").toLocaleLowerCase("fr")
  const found = Object.entries(locks).find(([name]) => name.replace(/\s+/g, " ").trim().normalize("NFD").replace(/[̀-ͯ]/g, "").toLocaleLowerCase("fr") === wanted)
  return found?.[1] ?? null
}
