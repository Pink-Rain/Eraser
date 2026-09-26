# Eraser 0.1.1-alpha.71 — Accueil par rôle, Sorts des créatures, sorts des PNJ

Cette version arrive par la mise à jour sans réinstallation. Rien à changer côté
Roll20.

## Accueil

La page d’accueil change selon la vue :

- **MJ** : à gauche, « Nouvelle campagne » et la liste de tes campagnes (recherche,
  tri par date ou par nom, grille ou liste). Un clic ouvre le tableau de bord et
  sélectionne la campagne. À droite, les Règles et les Index.
- **Administrateur** : à gauche, « Nouvelle to-do » et la liste des to-do
  (recherche, à faire / terminées, étiquette, tri par date ou par priorité ; cocher,
  modifier, supprimer). À droite, les Règles, les Index et les outils MJ et
  d’administration.
- **Joueur** : à gauche, « Nouveau personnage » et tes personnages (recherche,
  filtre par campagne, tri, grille ou liste). Un clic ouvre la fiche et sélectionne
  le personnage. À droite, les Règles.

## Sélection automatique

- Une campagne créée devient la campagne sélectionnée, puis son tableau de bord
  s’ouvre.
- Un personnage créé devient le personnage sélectionné, puis sa fiche s’ouvre.
- Ouvrir la fiche d’un de tes personnages ou le tableau de bord d’une de tes
  campagnes, depuis n’importe où, les sélectionne aussi.

## Sorts

- L’index « Classes » s’appelle maintenant **Sorts des classes**.
- Nouvel index **Sorts des créatures**, qui fonctionne comme Sorts des classes :
  tableaux Actifs et Passifs, doublons, création, modification, fusion. Il n’a ni
  onglet « Par classe » ni « Bonus », ni classes et rangs. Ses sorts vivent dans un
  nouvel onglet « Sorts des créatures » de ta feuille « Index des créatures » :
  aucun nouveau fichier n’est créé.
- La fiche d’une créature ne propose plus que les **Sorts des créatures**. Un sort
  de classe déjà inscrit sur une créature reste affiché avec sa carte.
- Les **PNJ ont des sorts** : actifs et passifs, comme les créatures, avec les
  sorts des classes et ceux des créatures. Ils s’enregistrent dans deux nouvelles
  colonnes, « Sorts actifs » et « Sorts passifs », ajoutées à la fin de la feuille
  des PNJ. Aucune colonne existante ne bouge.

## Vérifications

- accueil rendu dans un vrai navigateur dans les trois vues, avec des campagnes,
  des personnages et des to-do d’exemple ;
- un personnage annoncé comme créé rejoint le menu et devient la sélection ;
- lint sans erreur, tests au vert, build et serveur desktop vérifiés en HTTP 200.
