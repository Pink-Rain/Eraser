# Eraser 0.1.1-alpha.117 — Style imposé réparé

Cette version arrive par la mise à jour sans réinstallation.

## Le style imposé s'enregistre à nouveau

Dans « Modifier », le bouton « Enregistrer » restait grisé dès qu'un onglet contenait
deux colonnes du même nom, même si on ne touchait qu'au style d'une autre colonne.
C'est le cas de la plupart des onglets de l'Index des objets, qui ont deux colonnes
« Rareté ». Seuls les noms ajoutés ou modifiés sont maintenant vérifiés : les doublons
déjà présents dans la feuille n'empêchent plus d'enregistrer.

## Le style imposé s'affiche sur tous les types de colonnes

Le style (gras, italique, souligné, barré, taille, police, casse, couleur) ne s'appliquait
vraiment qu'aux colonnes Texte. Il s'applique maintenant aussi au Nom, aux listes, aux
rangements en onglets, aux nombres, aux identifiants et aux autres types de colonnes.
Un Nom avec un style imposé suit ce style (il n'est plus forcé en gras). Les bordures du
tableau gardent leur couleur : un style imposé ne colore que le texte.

## Index des objets

- La colonne **Compétence** accepte plusieurs compétences ou caractéristiques.

## Survol des attributs et matériaux

- La ligne « Chance » n'apparaît plus dans le détail au survol. Les charges restent
  affichées quand elles sont remplies.
