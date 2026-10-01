# Eraser 0.1.1-alpha.89 — La page Caractéristiques et compétences s'ouvre

Cette version arrive par la mise à jour sans réinstallation.

## Correction

- **Index › Caractéristiques et compétences** affichait « Impossible d’afficher cette
  page ». La définition de l'index contenait la fonction qui le remplit la première
  fois, et une fonction ne peut pas être envoyée du serveur à la page. Elle est
  maintenant rangée à part : la page s'ouvre normalement. Aucune donnée n'était en
  cause.
- Un test vérifie désormais que la définition de chaque index prévu par Eraser peut
  être envoyée à la page.

## Rappel : ce que contient l'index (alpha.88)

- **Caractéristiques** : Nom, Type (Principale ou Secondaire), Valeur par défaut.
  24 lignes au départ : 10 principales et 14 secondaires.
- **Compétences** : Nom, Caractéristique, Valeur par défaut. 78 lignes au départ.
- La fiche de personnage lit cet index : une compétence ou une caractéristique
  ajoutée apparaît sur toutes les fiches, avec sa valeur de départ. Les colonnes
  d'origine de la feuille « Personnages » ne bougent jamais.
