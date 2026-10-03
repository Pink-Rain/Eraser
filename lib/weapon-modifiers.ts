/**
 * Les lignes d'« Armes - Modificateurs » telles que les textes des autres index les
 * citent (« {Lourde} ») : nom et sa mise en forme, type, description, chance, charges,
 * couleur. Lecture seule, sans dépendance au serveur.
 */
import { foldName } from "@/lib/index-columns"
import { WEAPON_MODIFIER_CHARGES_HEADER, WEAPON_MODIFIER_COLOR_HEADER, WEAPON_MODIFIER_ICON_HEADER, WEAPON_MODIFIER_NUMBER_HEADER, WEAPON_MODIFIER_TYPE_HEADER } from "@/lib/world-index-definitions"

export type WeaponModifierRef = {
  name: string
  nameHtml: string
  type: string
  descriptionHtml: string
  number: string
  charges: string
  color: string
  /** Une icône d'Eraser (« flame ») ou un émoji, devant le nom. */
  icon: string
}

type Table = { headers: string[]; rows: Array<{ values: string[]; html: string[] }> }

/** Les types qu'un texte peut citer entre accolades (« Attribut », « Matériaux »… reconnus par leur début). */
export const citableModifierTypes = ["Attribut", "Matériau"]

export function isCitableModifier(type: string) {
  return citableModifierTypes.some((candidate) => foldName(type).startsWith(foldName(candidate)))
}

/** Les modificateurs de tous les onglets, une fois chacun (le premier rencontré l'emporte). */
export function parseWeaponModifiers(tables: Table[]): WeaponModifierRef[] {
  const found = new Map<string, WeaponModifierRef>()
  for (const table of tables) {
    const at = (header: string) => table.headers.findIndex((candidate) => foldName(candidate) === foldName(header))
    const name = at("Nom")
    if (name < 0) continue
    const columns = { type: at(WEAPON_MODIFIER_TYPE_HEADER), description: at("Description"), number: at(WEAPON_MODIFIER_NUMBER_HEADER), charges: at(WEAPON_MODIFIER_CHARGES_HEADER), color: at(WEAPON_MODIFIER_COLOR_HEADER), icon: Math.max(at(WEAPON_MODIFIER_ICON_HEADER), at("Icone")) }
    for (const row of table.rows) {
      const text = (row.values[name] ?? "").trim()
      if (!text || found.has(foldName(text))) continue
      const value = (index: number) => index >= 0 ? (row.values[index] ?? "").trim() : ""
      const html = row.html[name] ?? ""
      found.set(foldName(text), {
        name: text,
        nameHtml: /<[a-z]/i.test(html) ? html : "",
        type: value(columns.type),
        descriptionHtml: columns.description >= 0 ? (row.html[columns.description] || row.values[columns.description] || "").trim() : "",
        number: value(columns.number),
        charges: value(columns.charges),
        color: /^#[0-9a-f]{3,8}$/i.test(value(columns.color)) ? value(columns.color) : "",
        icon: value(columns.icon),
      })
    }
  }
  return [...found.values()]
}
