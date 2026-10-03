/**
 * Les pages de la section « Index » (anciennement « Ressources »). Les adresses
 * restent sous /ressources pour que les liens existants continuent de fonctionner.
 */
export type IndexPageKey = "campagnes" | "classes" | "creatures" | "langues" | "lieux" | "objets" | "peuples" | "personnages" | "pnjs" | "religions" | "sorts-classes" | "sorts-creatures" | "etats" | "armes-modificateurs" | "caracteristiques" | "succes"

export type IndexPage = { key: IndexPageKey; href: string; label: string; description: string }

export const indexHomeHref = "/ressources"

export const indexPages: IndexPage[] = ([
  { key: "campagnes", href: "/ressources/index-des-campagnes", label: "Campagnes", description: "Toutes les campagnes, leurs MJ et leurs joueurs." },
  { key: "etats", href: "/ressources/index-des-etats", label: "États", description: "Les états et altérations, leurs effets et leur durée." },
  { key: "armes-modificateurs", href: "/ressources/armes-modificateurs", label: "Armes - Modificateurs", description: "Runes, matériaux et attributs des armes, rangés par type." },
  { key: "succes", href: "/ressources/index-des-succes", label: "Succès", description: "Les succès des joueurs et des MJ, et qui les a obtenus." },
  { key: "caracteristiques", href: "/ressources/index-des-caracteristiques", label: "Caractéristiques et compétences", description: "Ce que la fiche de personnage contient, et ses valeurs de départ." },
  { key: "classes", href: "/ressources/index-des-classes", label: "Classes", description: "Les classes jouables, leur type, leur difficulté et leurs couleurs." },
  { key: "sorts-classes", href: "/ressources/sorts-des-classes", label: "Sorts des classes", description: "Les sorts des classes et leur rang dans chacune." },
  { key: "sorts-creatures", href: "/ressources/sorts-des-creatures", label: "Sorts des créatures", description: "Les sorts actifs et passifs des créatures." },
  { key: "creatures", href: "/ressources/index-des-creatures", label: "Créatures", description: "Le bestiaire, ses caractéristiques et ses sorts." },
  { key: "langues", href: "/ressources/index-des-langues", label: "Langues", description: "Les langues parlées dans le monde." },
  { key: "lieux", href: "/ressources/index-des-lieux", label: "Lieux", description: "Des continents aux lieux-dits." },
  { key: "objets", href: "/ressources/index-des-objets", label: "Objets", description: "Armes, équipement, consommables et ressources." },
  { key: "peuples", href: "/ressources/index-des-peuples", label: "Peuples", description: "Peuples, ancêtres et descendants." },
  { key: "personnages", href: "/ressources/index-des-personnages", label: "Personnages", description: "Toutes les fiches de personnages joueurs." },
  { key: "pnjs", href: "/ressources/index-des-pnjs", label: "PNJs", description: "Tous les PNJ, ceux de la bibliothèque et ceux des campagnes." },
  { key: "religions", href: "/ressources/index-des-religions", label: "Religions", description: "Cultes, divinités et croyances." },
] satisfies IndexPage[]).sort((left, right) => left.label.localeCompare(right.label, "fr", { sensitivity: "base" }))
