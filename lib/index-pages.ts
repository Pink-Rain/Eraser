/**
 * Les pages de la section « Index » (anciennement « Ressources »). Les adresses
 * restent sous /ressources pour que les liens existants continuent de fonctionner.
 */
export type IndexPageKey = "campagnes" | "classes" | "creatures" | "langues" | "lieux" | "objets" | "peuples" | "personnages" | "pnjs" | "religions"

export type IndexPage = { key: IndexPageKey; href: string; label: string; description: string }

export const indexHomeHref = "/ressources"

export const indexPages: IndexPage[] = ([
  { key: "campagnes", href: "/ressources/index-des-campagnes", label: "Campagnes", description: "Toutes les campagnes, leurs MJ et leurs joueurs." },
  { key: "classes", href: "/ressources/index-des-classes", label: "Classes", description: "Classes, sorts et progression." },
  { key: "creatures", href: "/ressources/index-des-creatures", label: "Créatures", description: "Le bestiaire, ses caractéristiques et ses sorts." },
  { key: "langues", href: "/ressources/index-des-langues", label: "Langues", description: "Les langues parlées dans le monde." },
  { key: "lieux", href: "/ressources/index-des-lieux", label: "Lieux", description: "Des continents aux lieux-dits." },
  { key: "objets", href: "/ressources/index-des-objets", label: "Objets", description: "Armes, équipement, consommables et ressources." },
  { key: "peuples", href: "/ressources/index-des-peuples", label: "Peuples", description: "Peuples, ancêtres et descendants." },
  { key: "personnages", href: "/ressources/index-des-personnages", label: "Personnages", description: "Toutes les fiches de personnages joueurs." },
  { key: "pnjs", href: "/ressources/index-des-pnjs", label: "PNJs", description: "Les bibliothèques de PNJ hors campagne." },
  { key: "religions", href: "/ressources/index-des-religions", label: "Religions", description: "Cultes, divinités et croyances." },
] satisfies IndexPage[]).sort((left, right) => left.label.localeCompare(right.label, "fr", { sensitivity: "base" }))
