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
import categories from "@/lib/icon-categories.json"
import { iconHaystack, iconSearchScore, type IconSearchEntry } from "@/lib/icon-search-fr"
import { indexIcons, type IconEntry } from "@/components/eraser/index-gauge"

const tagsByName = tags as Record<string, string[]>
const categoriesByName = categories as Record<string, string[]>

/**
 * Les catégories de Lucide, en français, dans l'ordre du sélecteur : celles qui servent le
 * plus en jeu de rôle d'abord.
 */
const categoryLabels: Array<[string, string]> = [
  ["gaming", "Jeux"], ["emoji", "Émotions"], ["people", "Personnes"], ["account", "Profils"], ["animals", "Animaux"],
  ["nature", "Nature"], ["weather", "Météo"], ["seasons", "Saisons"], ["sustainability", "Écologie"], ["food-beverage", "Nourriture"],
  ["medical", "Santé"], ["science", "Sciences"], ["security", "Protection"], ["tools", "Outils"], ["buildings", "Bâtiments"],
  ["home", "Maison"], ["travel", "Voyage"], ["transportation", "Transports"], ["navigation", "Cartes"], ["time", "Temps"],
  ["finance", "Argent"], ["shopping", "Commerce"], ["sports", "Sports"], ["shapes", "Formes"], ["arrows", "Flèches"],
  ["math", "Maths"], ["communication", "Communication"], ["social", "Social"], ["mail", "Courrier"], ["notifications", "Alertes"],
  ["multimedia", "Multimédia"], ["photography", "Photo"], ["devices", "Appareils"], ["connectivity", "Connexion"], ["files", "Fichiers"],
  ["text", "Texte"], ["layout", "Mise en page"], ["design", "Dessin"], ["charts", "Graphiques"], ["cursors", "Curseurs"],
  ["accessibility", "Accessibilité"], ["development", "Informatique"],
]

/** Les onglets du sélecteur : la sélection d'Eraser, tout, puis chaque catégorie. */
export const ERASER_CATEGORY = "eraser"
export const ALL_CATEGORY = "all"
export const iconCategoryTabs: Array<{ key: string; label: string }> = [
  { key: ERASER_CATEGORY, label: "Sélection Eraser" },
  { key: ALL_CATEGORY, label: "Toutes" },
  ...categoryLabels.map(([key, label]) => ({ key, label })),
]

/** « EyeClosed » → « eye-closed », comparé sans tirets (les noms Lucide ont des chiffres). */
const squash = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, "")

const lucideNameOf = new Map(Object.keys(tagsByName).map((name) => [squash(name), name]))

function humanize(name: string) {
  const text = name.replace(/-/g, " ")
  return text.charAt(0).toUpperCase() + text.slice(1)
}

export type CatalogEntry = IconEntry & { lucide: string; curated: boolean; categories: string[]; search: IconSearchEntry; haystack: string[] }

function entryOf(base: IconEntry, lucide: string, curated: boolean): CatalogEntry {
  const search: IconSearchEntry = { name: base.name, lucide, label: base.label, french: curated ? `${base.label} ${base.keywords ?? ""}` : undefined, tags: tagsByName[lucide] }
  return { ...base, lucide, curated, categories: categoriesByName[lucide] ?? [], search, haystack: iconHaystack(search) }
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

/** Une icône est-elle dans cet onglet du sélecteur ? */
export function inIconCategory(entry: CatalogEntry, category: string) {
  return category === ALL_CATEGORY || (category === ERASER_CATEGORY ? entry.curated : entry.categories.includes(category))
}

/** Combien d'icônes (parmi celles données, par exemple une recherche) dans chaque onglet. */
export function countByIconCategory(entries: CatalogEntry[]) {
  const counts = new Map<string, number>([[ALL_CATEGORY, entries.length], [ERASER_CATEGORY, 0]])
  for (const entry of entries) {
    if (entry.curated) counts.set(ERASER_CATEGORY, (counts.get(ERASER_CATEGORY) ?? 0) + 1)
    for (const category of entry.categories) counts.set(category, (counts.get(category) ?? 0) + 1)
  }
  return counts
}

