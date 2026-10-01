/**
 * Valeurs de départ et formules d'une ligne de la feuille de personnage, colonne par
 * colonne, d'après le catalogue des caractéristiques et compétences. Sans dépendance
 * serveur : les tests le vérifient directement.
 */
import {
  builtinCharacterCatalog,
  CRITICAL_FAILURE_METRIC,
  CRITICAL_SUCCESS_METRIC,
  skillMetrics,
  type CharacterCatalog,
  type CharacterLayout,
} from "@/lib/character-catalog"

/** « A », « Z », « AA »… pour une colonne numérotée à partir de 1. */
export function columnLetter(position: number) {
  let name = ""
  let rest = position
  while (rest > 0) {
    const remainder = (rest - 1) % 26
    name = String.fromCharCode(65 + remainder) + name
    rest = Math.floor((rest - 1) / 26)
  }
  return name
}

/** La cellule A1 d'une valeur de la fiche : les valeurs commencent en colonne C. */
export function characterValueCell(valueIndex: number, rowNumber: number) {
  return `${columnLetter(valueIndex + 3)}${rowNumber}`
}

/** Le total d'une compétence reste borné entre 10 et 90, comme dans la feuille d'origine. */
export function cappedStatFormula(expression: string) {
  const minimum = `((${expression})+10+ABS((${expression})-10))/2`
  return `=(${minimum}+90-ABS(${minimum}-90))/2`
}

/**
 * Les compétences dont la fiche porte des colonnes : celles du catalogue, puis celles
 * d'origine retirées de l'index, qui gardent leurs formules (leurs valeurs ne sont ni
 * effacées ni figées, seulement plus affichées).
 */
function skillsWithColumns(catalog: CharacterCatalog, layout: CharacterLayout) {
  const known = new Set(catalog.skills.map((skill) => skill.key))
  const legacy = builtinCharacterCatalog.skills.filter((skill) => !known.has(skill.key) && layout.index(skill.key, skillMetrics[0]) >= 0)
  return [...catalog.skills, ...legacy]
}

/**
 * Écrit dans `values` les valeurs par défaut manquantes et les formules des
 * compétences. `only` limite le travail à certaines clés (colonnes qu'on vient
 * d'ajouter à des fiches existantes).
 */
export function applySkillCells(values: string[], rowNumber: number, layout: CharacterLayout, catalog: CharacterCatalog, only?: Set<string>) {
  const globalSuccess = layout.index(CRITICAL_SUCCESS_METRIC)
  const globalFailure = layout.index(CRITICAL_FAILURE_METRIC)
  for (const skill of skillsWithColumns(catalog, layout)) {
    if (only && !only.has(skill.key)) continue
    const cells = skillMetrics.map((metric) => layout.index(skill.key, metric))
    if (cells.some((cell) => cell < 0)) continue
    const [bonusStat, modifierStat, totalStat, bonusSuccess, modifierSuccess, totalSuccess, bonusFailure, modifierFailure, totalFailure] = cells
    const characteristic = skill.characteristicKey
    const characteristicValue = characteristic ? layout.index(characteristic) : -1
    const characteristicSuccess = characteristic ? layout.index(characteristic, CRITICAL_SUCCESS_METRIC) : -1
    const characteristicFailure = characteristic ? layout.index(characteristic, CRITICAL_FAILURE_METRIC) : -1
    if (values[bonusStat] === "") values[bonusStat] = skill.defaultValue.trim() || "0"
    if (values[bonusSuccess] === "") values[bonusSuccess] = "0"
    if (values[bonusFailure] === "") values[bonusFailure] = "0"
    values[modifierStat] = "=0"
    values[modifierSuccess] = "=0"
    values[modifierFailure] = "=0"
    const sum = (indexes: number[]) => indexes.filter((index) => index >= 0).map((index) => characterValueCell(index, rowNumber)).join("+")
    values[totalStat] = cappedStatFormula(sum([characteristicValue, bonusStat, modifierStat]))
    values[totalSuccess] = `=${sum([globalSuccess, characteristicSuccess, bonusSuccess, modifierSuccess])}`
    values[totalFailure] = `=${sum([globalFailure, characteristicFailure, bonusFailure, modifierFailure])}`
  }
  return values
}

/**
 * Les valeurs par défaut des caractéristiques, écrites dans les cases vides : à la
 * création d'une fiche, ou dans les fiches existantes quand une caractéristique est
 * ajoutée à l'index (`only`). Les points de vie actuels partent des points de vie totaux.
 */
export function applyCharacteristicDefaults(values: string[], layout: CharacterLayout, catalog: CharacterCatalog, only?: Set<string>) {
  for (const item of catalog.characteristics) {
    if (only && !only.has(item.key)) continue
    const cell = layout.index(item.key)
    const value = item.defaultValue.trim()
    if (cell < 0 || !value || values[cell]?.trim()) continue
    values[cell] = value
    if (item.key === "Vie totale") {
      const current = layout.index("Vie actuelle")
      if (current >= 0 && !values[current]?.trim()) values[current] = value
    }
  }
  return values
}
