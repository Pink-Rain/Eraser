import type { ClassSpell, ClassSpellCategory, SpellSimilarity } from "@/lib/class-content"

export const MAX_CLASS_SPELLS_PER_RANK = 3

export const classSpellTypeSuggestions = [
  "Bonus",
  "Passif",
  "Actif -Action mineur",
  "Actif -Action majeur",
  "Actif -Action instantanée",
  "Actif -Action gratuite",
  "Actif -Action de déplacement",
]

export const classSpellCategoryTones = {
  actif: { background: "#7f1d1d", foreground: "#fff7ed" },
  passif: { background: "#315b55", foreground: "#f0fdfa" },
  bonus: { background: "#795a12", foreground: "#fffbeb" },
} satisfies Record<ClassSpellCategory, { background: string; foreground: string }>

export function normalizeClassSpellText(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/gi, " ").trim().toLocaleLowerCase("fr")
}

export function classSpellCategory(value: string): ClassSpellCategory {
  const label = normalizeClassSpellText(value)
  if (label.startsWith("actif")) return "actif"
  if (label.startsWith("passif")) return "passif"
  if (label.startsWith("bonus")) return "bonus"
  if (label.includes("bonus")) return "bonus"
  if (label.includes("passif")) return "passif"
  return "actif"
}

export function classSpellActionKind(value: string) {
  const label = normalizeClassSpellText(value)
  if (label.includes("mineur")) return "Action mineure"
  if (label.includes("majeur")) return "Action majeure"
  if (label.includes("instant")) return "Action instantanée"
  if (label.includes("gratuit")) return "Action gratuite"
  if (label.includes("deplacement")) return "Action de déplacement"
  return classSpellCategory(value) === "actif" ? "Action" : ""
}

export function splitClassSpellSkills(value: string) {
  const clean = value.trim()
  if (!clean) return []
  const separator = /[\n;|•]/.test(clean) ? /\s*(?:\n|;|\||•)\s*/ : /\s*,\s*/
  return clean.split(separator).map((item) => item.replace(/^[-–—]\s*/, "").trim()).filter(Boolean)
}

function tokenSet(value: string) {
  return new Set(normalizeClassSpellText(value).split(" ").filter((token) => token.length > 2))
}

function jaccardSimilarity(a: Set<string>, b: Set<string>) {
  if (!a.size || !b.size) return 0
  let common = 0
  for (const token of a) if (b.has(token)) common += 1
  return common / (a.size + b.size - common)
}

/** Nom affiché d'un sort dont la cellule « Nom » est vide. */
export const UNNAMED_CLASS_SPELL = "Sort sans nom"

export function findClassSpellSimilarities(spells: Array<Pick<ClassSpell, "id" | "name" | "effect" | "description">>): SpellSimilarity[] {
  // Precompute normalization/tokenization once per spell instead of once per pair:
  // this loop is O(n²) by nature, and redoing string work inside it made large
  // spell tables (500+ rows) noticeably slow to load.
  const prepared = spells.map((spell) => {
    const text = `${spell.effect} ${spell.description}`.trim()
    // Deux sorts sans titre ne se ressemblent pas pour autant : seul leur texte compte.
    const name = spell.name === UNNAMED_CLASS_SPELL ? "" : spell.name
    return {
      id: spell.id,
      normalizedName: normalizeClassSpellText(name),
      normalizedText: normalizeClassSpellText(text),
      nameTokens: tokenSet(name),
      textTokens: tokenSet(text),
    }
  })
  const results: SpellSimilarity[] = []
  for (let leftIndex = 0; leftIndex < prepared.length; leftIndex += 1) {
    const left = prepared[leftIndex]
    for (let rightIndex = leftIndex + 1; rightIndex < prepared.length; rightIndex += 1) {
      const right = prepared[rightIndex]
      const sameName = Boolean(left.normalizedName) && left.normalizedName === right.normalizedName
      const sameText = Boolean(left.normalizedText) && left.normalizedText === right.normalizedText
      const nameScore = jaccardSimilarity(left.nameTokens, right.nameTokens)
      const textScore = jaccardSimilarity(left.textTokens, right.textTokens)
      const score = Math.max(nameScore, textScore, (nameScore + textScore) / 2)
      const kind = sameName && sameText ? "Doublon exact" : sameText ? "Même description" : sameName ? "Même nom" : score >= 0.72 ? "Très proche" : null
      if (kind) results.push({ leftId: left.id, rightId: right.id, kind, score: sameName && sameText ? 1 : Math.max(score, 0.8) })
    }
  }
  return results.sort((left, right) => right.score - left.score || left.kind.localeCompare(right.kind, "fr"))
}

/** Rangs d'une classe : le rang commun (0) puis les rangs 1 à 20. */
export const CLASS_RANKS = Array.from({ length: 21 }, (_, rank) => rank)

/** Ce qui manque à un sort pour être considéré comme terminé. */
export function classSpellGaps(spell: Pick<ClassSpell, "name" | "effect" | "description" | "type">) {
  const gaps: Array<"nom" | "effet" | "type"> = []
  if (!spell.name.trim() || spell.name === UNNAMED_CLASS_SPELL) gaps.push("nom")
  if (!spell.effect.trim() && !spell.description.trim()) gaps.push("effet")
  if (!spell.type.trim()) gaps.push("type")
  return gaps
}

export type ClassRankState = {
  rank: number
  spells: ClassSpell[]
  /** Sorts auxquels il manque un nom, un effet ou un type. */
  unfinished: ClassSpell[]
  status: "vide" | "incomplet" | "complet" | "en trop"
}

export type ClassSpellState = {
  ranks: ClassRankState[]
  /** Finition en % : 3 sorts terminés sur chacun des 21 rangs. */
  completion: number
  missingSpells: number
  emptyRanks: number[]
  partialRanks: number[]
  overfullRanks: number[]
  completeRanks: number
  unfinishedSpells: ClassSpell[]
}

/**
 * État d'une classe : chaque rang doit avoir exactement trois sorts. La finition
 * compte 63 places (21 rangs × 3) ; un sort terminé remplit sa place, un sort sans
 * nom, sans effet ou sans type n'en remplit que la moitié, et un 4e sort ne compte
 * pas (il est signalé comme dépassement).
 */
export function classSpellState(spells: ClassSpell[], classId: string): ClassSpellState {
  const ranks = CLASS_RANKS.map((rank): ClassRankState => {
    const atRank = spells.filter((spell) => spell.classRanks[classId] === rank)
    const unfinished = atRank.filter((spell) => classSpellGaps(spell).length > 0)
    const status = atRank.length === 0 ? "vide" : atRank.length < MAX_CLASS_SPELLS_PER_RANK ? "incomplet" : atRank.length > MAX_CLASS_SPELLS_PER_RANK ? "en trop" : "complet"
    return { rank, spells: atRank, unfinished, status }
  })
  const filled = ranks.reduce((total, rank) => {
    const finished = rank.spells.length - rank.unfinished.length
    const best = Math.min(MAX_CLASS_SPELLS_PER_RANK, finished) + Math.min(MAX_CLASS_SPELLS_PER_RANK - Math.min(MAX_CLASS_SPELLS_PER_RANK, finished), rank.unfinished.length) / 2
    return total + best
  }, 0)
  const slots = CLASS_RANKS.length * MAX_CLASS_SPELLS_PER_RANK
  return {
    ranks,
    completion: Math.round((filled / slots) * 100),
    missingSpells: ranks.reduce((total, rank) => total + Math.max(0, MAX_CLASS_SPELLS_PER_RANK - rank.spells.length), 0),
    emptyRanks: ranks.filter((rank) => rank.status === "vide").map((rank) => rank.rank),
    partialRanks: ranks.filter((rank) => rank.status === "incomplet").map((rank) => rank.rank),
    overfullRanks: ranks.filter((rank) => rank.status === "en trop").map((rank) => rank.rank),
    completeRanks: ranks.filter((rank) => rank.status === "complet" && !rank.unfinished.length).length,
    unfinishedSpells: ranks.flatMap((rank) => rank.unfinished),
  }
}
