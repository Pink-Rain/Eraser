# Eraser 0.1.1-alpha.16 — icône encore agrandie

L'icône restait plus petite que celle des autres applications (Discord,
Chrome, Krita…) même après le premier ajustement de l'alpha.15. En creusant,
la marge ajoutée systématiquement autour du logo (y compris là où l'image
touchait déjà le bord) le rétrécissait inutilement.

## Corrigé

- l'icône de l'application (fenêtre, barre des tâches, onglet navigateur,
  installateur) n'a plus aucune marge artificielle : seul l'espace
  strictement nécessaire pour caler le logo dans un cadre carré est
  conservé, le reste du dessin va jusqu'au bord comme sur les autres
  applications.

## Vérifications

- lint et vérification de fidélité avec la source du site réussies (aucun
  fichier CSS historique modifié, aucune suppression) ;
- seuls des fichiers d'icône binaires ont changé, aucun code applicatif.
