# Eraser 0.1.1-alpha.136 — Correctif urgent : lectures de la feuille, suppressions, index des personnages et campagnes

Cette version arrive par la mise à jour sans réinstallation. Installe-la tout de suite.

## Correctifs de sécurité des données

- **Colonnes mélangées à la lecture** : une lecture groupée de la feuille rattachait les
  réponses de Google à leur position, alors que Google ne les rend pas toujours dans
  l'ordre. L'« ID » d'un personnage pouvait être lu dans une autre colonne : c'est ce qui
  créait les personnages fantômes, vidait la colonne Propriétaire et faisait « Not
  found » sur une fiche. Chaque réponse est maintenant rattachée à sa propre colonne.
- **Suppression définitive** : la ligne à supprimer est relue dans la feuille juste avant,
  et sa case ID est vérifiée ; si ce n'est pas la bonne ligne, rien n'est supprimé. Toute
  ligne ajoutée, supprimée ou déplacée fait oublier les numéros de ligne retenus.
- **« Réécrire en texte lisible » est retiré** : il s'appuyait sur la lecture fautive et a
  écrit des valeurs dans les mauvaises colonnes. Les anciennes cases `["…"]` restent
  affichées en clair partout.
- Le tri « présent dans les feuilles » ne cache plus jamais une fiche ouverte, et ne cache
  rien du tout s'il écarterait la moitié d'une liste.

## Index des personnages et des campagnes

- Les deux fonctionnent pareil : toutes les colonnes se modifient, Portrait et Bannière
  sont des images.
- Bouton **Corbeille** sur chaque ligne (sous le propriétaire) ; un administrateur voit
  ensuite la ligne marquée « À la corbeille » avec Restaurer / Supprimer définitivement.
- Plus de texte blanc illisible : les couleurs posées dans Google Sheets sur ces cases
  sont ignorées à l'affichage (gras, italique… gardés).
