/**
 * Les lignes d'« Armes - Modificateurs » telles que les objets et les textes qui les
 * citent les affichent : nom et sa mise en forme, type, description, chance, charges,
 * couleur, icône. Lecture seule, sans dépendance au serveur.
 */
import { foldName } from "@/lib/index-columns"
import { WEAPON_MODIFIER_CHARGES_HEADER, WEAPON_MODIFIER_COLOR_HEADER, WEAPON_MODIFIER_ICON_HEADER, WEAPON_MODIFIER_NUMBER_HEADER, WEAPON_MODIFIER_TYPE_HEADER } from "@/lib/world-index-definitions"

export type WeaponModifierRef = {
  /** L'identifiant de la ligne (colonne ID) : une référence la retrouve même renommée. */
  id: string
  name: string
  nameHtml: string
  type: string
  descriptionHtml: string
  number: string
  charges: string
  color: string
  /** Une icône d'Eraser (« flame ») ou un émoji, devant le nom. */
  icon: string
  /** Le sous-type (colonne « Sous-type », si l'index en a une) : « Feu » pour une rune de feu. */
  subtype: string
}

type Table = { headers: string[]; rows: Array<{ values: string[]; html: string[] }> }

/** Les modificateurs de tous les onglets, une fois chacun (le premier rencontré l'emporte). */
export function parseWeaponModifiers(tables: Table[]): WeaponModifierRef[] {
  const found = new Map<string, WeaponModifierRef>()
  for (const table of tables) {
    const at = (header: string) => table.headers.findIndex((candidate) => foldName(candidate) === foldName(header))
    const name = at("Nom")
    if (name < 0) continue
    const columns = { type: at(WEAPON_MODIFIER_TYPE_HEADER), description: at("Description"), number: at(WEAPON_MODIFIER_NUMBER_HEADER), charges: at(WEAPON_MODIFIER_CHARGES_HEADER), color: at(WEAPON_MODIFIER_COLOR_HEADER), icon: Math.max(at(WEAPON_MODIFIER_ICON_HEADER), at("Icone")), id: at("ID"), subtype: Math.max(at("Sous-type"), at("Sous type")) }
    for (const row of table.rows) {
      const text = (row.values[name] ?? "").trim()
      if (!text || found.has(foldName(text))) continue
      const value = (index: number) => index >= 0 ? (row.values[index] ?? "").trim() : ""
      const html = row.html[name] ?? ""
      found.set(foldName(text), {
        id: value(columns.id),
        name: text,
        nameHtml: /<[a-z]/i.test(html) ? html : "",
        type: value(columns.type),
        descriptionHtml: columns.description >= 0 ? (row.html[columns.description] || row.values[columns.description] || "").trim() : "",
        number: value(columns.number),
        charges: value(columns.charges),
        color: /^#[0-9a-f]{3,8}$/i.test(value(columns.color)) ? value(columns.color) : "",
        icon: value(columns.icon),
        subtype: value(columns.subtype),
      })
    }
  }
  return [...found.values()]
}

/** Le % de chance d'un attribut ou d'un matériau (colonne Nombre), ou null : chance normale. */
export function modifierChance(modifier: Pick<WeaponModifierRef, "number">) {
  const parsed = Number.parseFloat(String(modifier.number ?? "").replace(",", ".").replace(/[%\s]/g, ""))
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null
}

/**
 * Tire un modificateur au hasard parmi `candidates`. Un « Nombre » rempli est son % de
 * chance ; vide, il a la chance normale : la part qu'il aurait si tous étaient égaux
 * (100 / nombre de candidats). `random` : pour les tests.
 */
export function drawWeaponModifier<T extends Pick<WeaponModifierRef, "number">>(candidates: T[], random = Math.random): T | null {
  if (!candidates.length) return null
  const normal = 100 / candidates.length
  const weights = candidates.map((candidate) => modifierChance(candidate) ?? normal)
  const total = weights.reduce((sum, weight) => sum + weight, 0)
  if (total <= 0) return null
  let roll = random() * total
  for (const [index, weight] of weights.entries()) {
    roll -= weight
    if (roll < 0) return candidates[index]
  }
  return candidates[candidates.length - 1]
}
