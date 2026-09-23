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
