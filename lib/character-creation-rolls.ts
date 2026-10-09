/**
 * La deuxième étape de la création d'un personnage : les dés fixent les statistiques de
 * départ, puis le joueur rééquilibre jusqu'à 25 points (il en retire où il veut pour les
 * remettre ailleurs).
 *
 * Sans dépendance au serveur : le formulaire et les tests s'en servent.
 */
import { characterValueHeaders } from "@/lib/character-sheet-schema"
import { rollDiceExpression } from "@/lib/math-expression"

export type CreationStat = { key: string; label: string; dice: string; /** Les cases de la fiche qui reçoivent la valeur. */ headers: string[] }

export const CREATION_STATS: CreationStat[] = [
  { key: "combat", label: "Cap de combat", dice: "2d10+20", headers: ["Capacité de combat"] },
  { key: "tir", label: "Cap de tir", dice: "2d10+20", headers: ["Capacité de tir"] },
  { key: "magie", label: "Cap magique", dice: "2d10+20", headers: ["Capacité magique"] },
  { key: "constitution", label: "Constitution", dice: "2d10+20", headers: ["Constitution"] },
  { key: "mental", label: "Force mentale", dice: "2d10+20", headers: ["Force mentale"] },
  { key: "force", label: "Force", dice: "2d10+20", headers: ["Force"] },
  { key: "dexterite", label: "Dextérité", dice: "2d10+20", headers: ["Dextérité"] },
  { key: "intelligence", label: "Intelligence", dice: "2d10+20", headers: ["Intelligence"] },
  { key: "sagesse", label: "Sagesse", dice: "2d10+20", headers: ["Sagesse"] },
  { key: "charisme", label: "Charisme", dice: "2d10+20", headers: ["Charisme"] },
  // La vie tirée est la vie totale, et le personnage commence en pleine forme.
  { key: "vie", label: "Vie", dice: "2d20+70", headers: ["Vie totale", "Vie actuelle"] },
  { key: "rapidite", label: "Rapidité", dice: "1d40-20", headers: ["Rapidité"] },
]

/** Les points qu'on peut déplacer d'une statistique à l'autre après les dés. */
export const REBALANCE_POINTS = 25

export type CreationRoll = { value: number; detail: string }
export type CreationRolls = Record<string, CreationRoll>
/** L'écart choisi par le joueur sur chaque statistique, par rapport aux dés. */
export type CreationAdjustments = Record<string, number>

/** Un lancer pour chaque statistique (ou seulement celles de `keys`). `roll` : pour les tests. */
export function rollCreationStats(roll: (dice: string) => { total: number; detail: string } = rollDiceExpression, keys?: string[]): CreationRolls {
  return Object.fromEntries(CREATION_STATS.filter((stat) => !keys || keys.includes(stat.key)).map((stat) => {
    const result = roll(stat.dice)
    return [stat.key, { value: Math.round(result.total), detail: result.detail }]
  }))
}

/**
 * Le rééquilibrage : les points retirés (au plus 25), ceux remis ailleurs, ce qui reste à
 * retirer (négatif : trop retiré, à remettre) et à placer (négatif : trop ajouté).
 */
export function rebalanceSummary(adjustments: CreationAdjustments) {
  let removed = 0
  let added = 0
  for (const stat of CREATION_STATS) {
    const delta = Math.trunc(adjustments[stat.key] ?? 0)
    if (delta < 0) removed -= delta
    else added += delta
  }
  const left = REBALANCE_POINTS - removed
  const toPlace = removed - added
  const problem = left < 0
    ? `${-left} point${-left > 1 ? "s" : ""} retiré${-left > 1 ? "s" : ""} en trop : remets-${-left > 1 ? "les" : "le"}.`
    : toPlace > 0
      ? `Il reste ${toPlace} point${toPlace > 1 ? "s" : ""} à placer.`
      : toPlace < 0
        ? `${-toPlace} point${-toPlace > 1 ? "s" : ""} ajouté${-toPlace > 1 ? "s" : ""} sans en avoir retiré autant.`
        : ""
  return { removed, added, left, toPlace, valid: !problem, problem }
}

/** Toutes les statistiques ont-elles leur lancer ? */
export const allRolled = (rolls: CreationRolls) => CREATION_STATS.every((stat) => rolls[stat.key])

/** La valeur finale d'une statistique : les dés, plus l'écart choisi. */
export const finalStat = (rolls: CreationRolls, adjustments: CreationAdjustments, key: string) => (rolls[key]?.value ?? 0) + Math.trunc(adjustments[key] ?? 0)

/** Les cases de la fiche à remplir (position dans les valeurs, texte), d'après les dés et le rééquilibrage. */
export function creationStatCells(rolls: CreationRolls, adjustments: CreationAdjustments): Array<[number, string]> {
  return CREATION_STATS.flatMap((stat) => rolls[stat.key]
    ? stat.headers.flatMap((header) => {
      const index = (characterValueHeaders as readonly string[]).indexOf(header)
      return index >= 0 ? [[index, String(finalStat(rolls, adjustments, stat.key))] as [number, string]] : []
    })
    : [])
}
