/**
 * Les colonnes prévues par Eraser dans les feuilles des PNJs, des campagnes et des
 * classes. Le code les retrouve par leur nom (jamais par leur place) ; le moteur des
 * index les verrouille dans « Modifier ». Sans dépendance au serveur.
 */

export const npcSheetHeaders = [
  "ID", "Page lié", "Nom du PNJ", "Classe / métier", "Vie actuelle", "Vie totale", "Rapidité",
  "Force", "Dextérité", "Intelligence", "Sagesse", "Charisme", "Capacité de combat",
  "Capacité de tir", "Capacité magique", "Force mentale", "Constitution", "Peuple", "Genre", "Âge",
  "Poids", "Taille", "Notes MJ", "Portrait", "Notes joueurs", "Inventaire JSON (archive)",
  "Ajouté au créateur de session", "Créé le", "Modifié le", "Dossier", "Dans le groupe joueur", "PNJ important", "Créé par",
  // Ajoutées à la fin : aucune colonne existante ne bouge.
  "Titre", "Histoire / Lore",
  // Sorts du PNJ, noms séparés par des virgules comme pour les créatures.
  "Sorts actifs", "Sorts passifs",
]

/** Les colonnes de la feuille Campagnes. */
export const campaignSheetHeaders = ["ID", "MJ", "Nom de la campagne", "Description", "Bannière", "Couleur d’accent"]

/** Les colonnes de la feuille Classes. */
export const classSheetHeaders = ["ID", "Type", "Nom de la classe", "Image", "Mots-clés 1", "Mots-clés 2", "Mots-clés 3", "Difficulté", "Finition", "Couleur d’accent sombre", "Couleur d’accent clair"]

/** Les colonnes que les sorts (des classes ou des créatures) ont toujours. */
export const spellSheetHeaders = ["ID", "Nom", "Effet", "Description", "Type", "Compétences", "Distance", "Charges"]

/** Ce qu'un PNJ ne montre que dans sa campagne : jamais dans l'Index des PNJs. */
export const npcCampaignOnlyHeaders = ["Notes MJ", "Vie actuelle", "Inventaire JSON (archive)"]

/** Les types et difficultés d'une classe (listes de la feuille Classes). */
export const classTypeValues = ["Solide", "Protectrice", "Brutale", "Fourbe", "Éclectique"] as const
export const classDifficultyValues = ["Facile", "Intermédiaire", "Difficile", "Expert", "X"] as const
