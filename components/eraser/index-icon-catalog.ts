/**
 * Toutes les icônes Lucide (plus de 1 700), chargées seulement quand on en a besoin :
 * ouvrir le sélecteur, ou afficher une icône qui n'est pas dans la liste d'Eraser.
 *
 * Les icônes de la liste d'Eraser gardent leur nom (déjà écrit dans les feuilles) et leur
 * libellé français. Les autres prennent leur nom Lucide (« eye-closed ») ; si ce nom est
 * déjà pris par une icône d'Eraser différente, il devient « lucide-… ».
 */
import { icons, type LucideIcon } from "lucide-react"
import tags from "@/lib/icon-tags.json"
import { iconHaystack, iconSearchScore, type IconSearchEntry } from "@/lib/icon-search-fr"
import { indexIcons, type IconEntry } from "@/components/eraser/index-gauge"

const tagsByName = tags as Record<string, string[]>

/** « EyeClosed » → « eye-closed », comparé sans tirets (les noms Lucide ont des chiffres). */
const squash = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, "")

const lucideNameOf = new Map(Object.keys(tagsByName).map((name) => [squash(name), name]))

function humanize(name: string) {
  const text = name.replace(/-/g, " ")
  return text.charAt(0).toUpperCase() + text.slice(1)
}

export type CatalogEntry = IconEntry & { lucide: string; curated: boolean; search: IconSearchEntry; haystack: string[] }

function entryOf(base: IconEntry, lucide: string, curated: boolean): CatalogEntry {
  const search: IconSearchEntry = { name: base.name, lucide, label: base.label, french: curated ? `${base.label} ${base.keywords ?? ""}` : undefined, tags: tagsByName[lucide] }
  return { ...base, lucide, curated, search, haystack: iconHaystack(search) }
}

const componentNames = new Map<LucideIcon, string>(Object.entries(icons).map(([pascal, Icon]) => [Icon as LucideIcon, pascal]))
const curatedNames = new Set(indexIcons.map((entry) => entry.name))
const curatedComponents = new Set(indexIcons.map((entry) => entry.Icon))

/** La liste complète : celles d'Eraser d'abord (dans leur ordre), puis toutes les autres. */
export const iconCatalog: CatalogEntry[] = [
  ...indexIcons.map((entry) => {
    const pascal = componentNames.get(entry.Icon as LucideIcon) ?? ""
    return entryOf(entry, lucideNameOf.get(squash(pascal)) ?? entry.name, true)
  }),
  ...Object.entries(icons)
    .filter(([, Icon]) => !curatedComponents.has(Icon))
    .map(([pascal, Icon]) => {
      const lucide = lucideNameOf.get(squash(pascal)) ?? pascal.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase()
      const name = curatedNames.has(lucide) ? `lucide-${lucide}` : lucide
      return entryOf({ name, label: humanize(lucide), Icon }, lucide, false)
    })
    .sort((left, right) => left.name.localeCompare(right.name)),
]

/** Une icône par son nom gardé dans la feuille (ou son nom Lucide). */
export const catalogByName = new Map<string, CatalogEntry>()
for (const entry of iconCatalog) {
  catalogByName.set(entry.name, entry)
  if (!catalogByName.has(entry.lucide)) catalogByName.set(entry.lucide, entry)
}

/** Les icônes qui correspondent à une recherche (français ou anglais), les plus proches d'abord. */
export function searchIconCatalog(query: string) {
  if (!query.trim()) return iconCatalog
  return iconCatalog
    .map((entry, order) => ({ entry, order, score: iconSearchScore(query, entry.search, entry.haystack) }))
    .filter((result) => result.score > 0)
    .sort((left, right) => right.score - left.score || Number(right.entry.curated) - Number(left.entry.curated) || left.order - right.order)
    .map((result) => result.entry)
}
