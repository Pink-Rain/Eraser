# Eraser 0.1.1-alpha.79 — Un seul onglet « Classes » : état, statistiques et rangs

Cette version arrive par la mise à jour sans réinstallation.

## Index › Sorts des classes

« État des classes », « Par classe » et « Statistiques » deviennent un seul onglet,
**Classes**, ouvert par défaut. Les onglets sont maintenant : Classes, Actifs,
Passifs, Bonus, Doublons, Bonus Rang.

- **Toutes les classes** (à l’ouverture) : d’abord l’état (classes terminées, sorts
  manquants, rangs en trop, les 21 rangs de chaque classe, classes pas commencées,
  compétences à harmoniser), puis les statistiques d’ensemble et ce que disent les
  fiches toutes classes confondues (classes jouées, rangs des personnages, charges
  dépensées). Un clic sur une classe l’ouvre.
- **Une classe** (menu déroulant) : son état, puis ses statistiques comparées aux
  autres classes et les sorts choisis à chaque rang par les joueurs, puis ses rangs
  et ses sorts, modifiables comme avant. Un clic sur un rang dans l’état descend
  jusqu’à ce rang.
- Le menu à droite commence par **État** et **Stat**, puis les rangs C à 20.
- Les statistiques prennent moins de place : cartes plus serrées, trois colonnes
  sur grand écran, graphiques plus compacts.

## Vérifications

- dans un vrai navigateur, sur les vrais sorts : vue de toutes les classes, choix
  d’une classe, menu de droite (État, Stat, rangs) ;
- lint sans erreur, 29 tests au vert, build et serveur desktop vérifiés.
