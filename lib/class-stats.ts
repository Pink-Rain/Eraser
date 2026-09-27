import type { ClassSpell } from "@/lib/class-content"
import { characterCharacteristics, characterSkills } from "@/lib/character-sheet-schema"
import { splitClassSpellSkills, UNNAMED_CLASS_SPELL } from "@/lib/class-spell-utils"

/** Types d'actifs comparés dans les statistiques (passifs et bonus exclus). */
export const ACTIVE_KINDS = ["Instantané", "Majeure", "Mineure", "Autre"] as const
export type ActiveKind = typeof ACTIVE_KINDS[number]

export const ACTIVE_KIND_COLORS: Record<ActiveKind, string> = {
  Instantané: "#d07a1f",
  Majeure: "#7446a8",
  Mineure: "#c83a2a",
  Autre: "#8a8177",
}

export const ACTIVE_KIND_LABELS: Record<ActiveKind, string> = {
  Instantané: "Instantané",
  Majeure: "Action majeure",
  Mineure: "Action mineure",
  Autre: "Autre actif",
}

function fold(value: string) {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLocaleLowerCase("fr")
}

export function activeKind(spell: Pick<ClassSpell, "category" | "type">): ActiveKind | null {
  if (spell.category !== "actif") return null
  const type = fold(spell.type)
  if (type.includes("instant")) return "Instantané"
  if (type.includes("majeur")) return "Majeure"
  if (type.includes("mineur")) return "Mineure"
  return "Autre"
}

// ---------- compétences ----------

const STOPWORDS = new Set(["de", "des", "du", "la", "le", "les", "l", "d", "aux", "au", "a", "face", "et", "ou"])

/** « / », « . », « - » : une cellule remplie pour dire « aucune compétence ». */
export function isPlaceholderSkill(value: string) {
  return /^[\s./\\\-–—_?x]*$/i.test(value)
}

/**
 * Clé d'une compétence, insensible aux majuscules, accents, séparateurs, pluriels et
 * ordre des mots : « Bluff/mensonge », « Bluff, Mensonge » et « Bluff / Mensonge »
 * donnent la même clé, comme « Volonté mental » et « Volonté mentale ».
 */
export function skillKey(value: string) {
  const tokens = fold(value)
    .replace(/[’']/g, " ")
    .split(/[^a-z0-9]+/)
    .filter((token) => token && !STOPWORDS.has(token))
    .map((token) => token === "res" ? "resistance" : token)
    .map((token) => token.replace(/(.)\1+/g, "$1").replace(/(es|e|s)$/, ""))
  return [...new Set(tokens)].sort().join(" ")
}

/**
 * Compétences d'un sort. La virgule sépare deux compétences, sauf quand les deux
 * morceaux forment une compétence de la fiche : « Bluff, mensonge » est « Bluff / Mensonge ».
 */
export function spellSkills(spell: Pick<ClassSpell, "skillsRaw">) {
  const parts = splitClassSpellSkills(spell.skillsRaw).filter((skill) => !isPlaceholderSkill(skill))
  const merged: string[] = []
  for (let index = 0; index < parts.length; index += 1) {
    const next = parts[index + 1]
    if (next && !isOfficialSkill(skillKey(parts[index])) && isOfficialSkill(skillKey(`${parts[index]} ${next}`))) {
      merged.push(`${parts[index]} / ${next}`)
      index += 1
    } else merged.push(parts[index])
  }
  return merged
}

export type SkillTally = { key: string; label: string; count: number; forms: Array<[string, number]> }

/** Compétences citées par ces sorts, regroupées par clé ; le libellé est la forme la plus fréquente. */
export function tallySkills(spells: ClassSpell[]): SkillTally[] {
  const groups = new Map<string, Map<string, number>>()
  for (const spell of spells) for (const skill of spellSkills(spell)) {
    const key = skillKey(skill)
    if (!key) continue
    const forms = groups.get(key) ?? new Map<string, number>()
    forms.set(skill, (forms.get(skill) ?? 0) + 1)
    groups.set(key, forms)
  }
  return [...groups.entries()].map(([key, forms]) => {
    const sorted = [...forms.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0], "fr"))
    return { key, label: sorted[0][0], count: sorted.reduce((total, [, count]) => total + count, 0), forms: sorted }
  }).sort((left, right) => right.count - left.count || left.label.localeCompare(right.label, "fr"))
}

/** Compétences et caractéristiques de la fiche de personnage : la liste de référence. */
const officialSkillKeys = new Set([...characterSkills.map((skill) => skill.name), ...characterCharacteristics.map((item) => item.characteristic)].map(skillKey))

const officialCompactKeys = new Set([...officialSkillKeys].map((key) => key.replace(/ /g, "")))

/** « Forgemagie » et « Forge magie » sont la même compétence de la fiche. */
export function isOfficialSkill(key: string) {
  return officialSkillKeys.has(key) || officialCompactKeys.has(key.replace(/ /g, ""))
}

// ---------- charges et portée ----------

export const CHARGE_BUCKETS = ["1", "2", "3", "4", "5", "✦", "—"] as const
export const CHARGE_LABELS: Record<typeof CHARGE_BUCKETS[number], string> = { "1": "1", "2": "2", "3": "3", "4": "4", "5": "5", "✦": "✦ illimité", "—": "Non notée" }

export function chargeBucket(spell: Pick<ClassSpell, "charges" | "chargesLabel">): typeof CHARGE_BUCKETS[number] {
  const label = spell.chargesLabel ?? (spell.charges === null ? "" : String(spell.charges))
  if (label.includes("✦")) return "✦"
  const value = spell.charges ?? Number.parseInt(label, 10)
  return Number.isInteger(value) && value >= 1 && value <= 5 ? String(value) as typeof CHARGE_BUCKETS[number] : "—"
}

export const RANGE_BUCKETS = ["0 m", "1–10 m", "11–20 m", "21–30 m", "31–50 m", "Plus de 50 m", "Non notée"] as const

export function rangeBucket(spell: Pick<ClassSpell, "distance">): typeof RANGE_BUCKETS[number] {
  const match = spell.distance.match(/\d+/)
  if (!match) return "Non notée"
  const value = Number(match[0])
  if (value === 0) return "0 m"
  if (value <= 10) return "1–10 m"
  if (value <= 20) return "11–20 m"
  if (value <= 30) return "21–30 m"
  if (value <= 50) return "31–50 m"
  return "Plus de 50 m"
}

// ---------- par classe ----------

export function spellsOfClass(spells: ClassSpell[], classId: string) {
  return spells.filter((spell) => classId in spell.classRanks)
}

export function countBy<T extends string>(items: ClassSpell[], keys: readonly T[], bucket: (spell: ClassSpell) => T | null) {
  const counts = Object.fromEntries(keys.map((key) => [key, 0])) as Record<T, number>
  for (const item of items) {
    const key = bucket(item)
    if (key !== null) counts[key] += 1
  }
  return counts
}

export function average(values: number[]) {
  return values.length ? values.reduce((total, value) => total + value, 0) / values.length : 0
}

/** Nombre de sorts que deux classes ont en commun. */
export function sharedSpellCount(spells: ClassSpell[], left: string, right: string) {
  return spells.filter((spell) => left in spell.classRanks && right in spell.classRanks).length
}

// ---------- qualité ----------

export type SkillQuality = {
  variants: SkillTally[]
  unknown: SkillTally[]
  placeholders: { active: ClassSpell[]; other: ClassSpell[] }
  empty: { active: ClassSpell[]; other: ClassSpell[] }
  unnamed: ClassSpell[]
}

/** Ce qui fausse les statistiques de compétences, sur les sorts liés à une classe. */
export function skillQuality(spells: ClassSpell[]): SkillQuality {
  const linked = spells.filter((spell) => Object.keys(spell.classRanks).length > 0)
  const tallies = tallySkills(linked)
  const split = (items: ClassSpell[]) => ({ active: items.filter((spell) => spell.category === "actif"), other: items.filter((spell) => spell.category !== "actif") })
  const raw = (spell: ClassSpell) => splitClassSpellSkills(spell.skillsRaw)
  return {
    variants: tallies.filter((tally) => tally.forms.length > 1),
    unknown: tallies.filter((tally) => !isOfficialSkill(tally.key)),
    placeholders: split(linked.filter((spell) => raw(spell).length > 0 && raw(spell).every(isPlaceholderSkill))),
    empty: split(linked.filter((spell) => !spell.skillsRaw.trim())),
    unnamed: linked.filter((spell) => !spell.name.trim() || spell.name === UNNAMED_CLASS_SPELL),
  }
}
