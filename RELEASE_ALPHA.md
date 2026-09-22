# Eraser 0.1.1-alpha.43 — curseur stable et mise en forme des objets partout

## Corrigé

- le curseur ne saute plus au début d’une cellule au moment de l’enregistrement.
  La cause est trouvée : la valeur enregistrée remontait jusqu’à la grille, la
  cellule recevait alors une nouvelle valeur et son contenu était réécrit en
  pleine frappe. Le contenu est désormais figé au montage de la cellule ; il
  n’est repris que lors d’une actualisation, d’un ajout ou d’une suppression de
  ligne. On peut donc écrire longuement, sélectionner et mettre en forme sans
  être interrompu, et l’enregistrement automatique reste en place ;
- la mise en forme des objets (gras, couleurs, liens) s’affiche enfin partout.
  Le résumé d’inventaire chargé à l’ouverture d’une fiche ne lisait pas le
  catalogue Drive et ne connaissait donc que le texte brut. L’inventaire conserve
  maintenant la mise en forme à côté du texte, dans trois nouvelles colonnes de
  la feuille « Contenu inventaire » ajoutées automatiquement.

## Où la mise en forme est respectée

- inventaires de personnages, de PNJ et de campagne, y compris en lecture seule ;
- recherche d’objets à ajouter dans un inventaire ;
- magasins et fouilles, y compris ceux enregistrés avant ce changement : leur
  mise en forme est retrouvée dans le catalogue tant que le texte n’a pas été
  réécrit ;
- fenêtres de détail du plateau de jeu.

Un texte réécrit à la main dans un inventaire redevient du texte brut, comme
attendu ; les autres champs du même objet gardent la leur.

## Vérifications

- lint sans erreur ;
- build Vinext complet ;
- suite de tests d’interface au vert ;
- serveur desktop construit et vérifié en HTTP 200.
