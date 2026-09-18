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

function similarity(left: string, right: string) {
  const a = tokenSet(left)
  const b = tokenSet(right)
  if (!a.size || !b.size) return 0
  const common = [...a].filter((token) => b.has(token)).length
  return common / (a.size + b.size - common)
}

export function findClassSpellSimilarities(spells: Array<Pick<ClassSpell, "id" | "name" | "effect" | "description">>): SpellSimilarity[] {
  const results: SpellSimilarity[] = []
  for (let leftIndex = 0; leftIndex < spells.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < spells.length; rightIndex += 1) {
      const left = spells[leftIndex]
      const right = spells[rightIndex]
      const sameName = normalizeClassSpellText(left.name) === normalizeClassSpellText(right.name)
      const leftText = `${left.effect} ${left.description}`.trim()
      const rightText = `${right.effect} ${right.description}`.trim()
      const sameText = Boolean(normalizeClassSpellText(leftText)) && normalizeClassSpellText(leftText) === normalizeClassSpellText(rightText)
      const score = Math.max(similarity(left.name, right.name), similarity(leftText, rightText), (similarity(left.name, right.name) + similarity(leftText, rightText)) / 2)
      const kind = sameName && sameText ? "Doublon exact" : sameText ? "Même description" : sameName ? "Même nom" : score >= 0.72 ? "Très proche" : null
      if (kind) results.push({ leftId: left.id, rightId: right.id, kind, score: sameName && sameText ? 1 : Math.max(score, 0.8) })
    }
  }
  return results.sort((left, right) => right.score - left.score || left.kind.localeCompare(right.kind, "fr"))
}
