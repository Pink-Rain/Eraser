# Eraser 0.1.1-alpha.108 — États lisibles, colonnes expliquées

Cette version arrive par la mise à jour sans réinstallation.

## Fiche de personnage

- **États sous le portrait** : ils ne débordent plus sur le reste de la fiche. Un nom
  long passe à la ligne entre les mots, et s'il manque encore de place, les boutons
  (dé, niveaux) descendent sous le nom. La ligne grandit en hauteur, jamais en largeur.
- **Bouton dé qui ne change rien** : Eraser explique maintenant pourquoi au lieu de ne
  rien faire en silence. Si les dés sont dans « Jet » et que « Changement de valeur » est
  vide, il indique quoi écrire (par exemple -2d20-20 dans « Changement de valeur »). Si
  la cible n'est pas une valeur que la fiche peut écrire, il le dit aussi.

## Index des états, onglet Effets

- **Description des colonnes « Changement de valeur » et « Jet »** : la façon de les
  écrire s'affiche au survol de l'en-tête, dans la fiche de la ligne et dans « Modifier »
  (champ Description, que tu peux changer).
  - Changement de valeur : +10 ou 10, -30, =100, ≥1, ≤50 tant que l'état est posé ;
    des dés (-1d20-20, +2d6) se lancent depuis la fiche et s'écrivent dedans.
  - Jet : la condition, les dés puis la plage qui réussit (1d20 16-20, 1d10 ≤3,
    1d10 8 ou plus, 1d6 6). Sans plage, il réussit toujours.
