# Eraser 0.1.1-alpha.45 — un seul éditeur de texte pour toute l’application

## Un moteur unique

Tout ce qui se saisit en texte enrichi passe désormais par le même éditeur :
cellules des index, carnet de notes et récits d’une fiche (but, personnalité,
histoire), descriptions et effets d’objets dans les inventaires, fiches de PNJ,
relations, descriptions de campagne, to-dos d’administration et sorts de classe.

Ses possibilités, identiques partout :

- gras, italique, souligné, barré — tous en **bascule** ;
- titres, listes à puces, listes numérotées ;
- cases à cocher cliquables, dont l’état est conservé ;
- lignes de séparation ;
- liens ;
- sept couleurs et un sélecteur libre ;
- effacement de toute la mise en forme.

## Corrigé

- il est enfin possible de **retirer** une mise en forme. Les commandes
  empilaient les balises sans jamais pouvoir les enlever : un mot mis deux fois
  en gras devenait doublement gras. Les commandes passent maintenant par l’API
  d’édition du navigateur, qui gère correctement la bascule, les sélections
  partielles et les imbrications ;
- l’en-tête des magasins n’est plus déformé par sa colonne de boutons empilés :
  les icônes sont rangées en grille compacte et la hauteur reste constante.

## Modifié

- les descriptions et effets d’objets se saisissent en texte enrichi et leur
  mise en forme est enregistrée avec eux ;
- les notes de PNJ, les relations, les descriptions de campagne et les to-dos
  affichent leur mise en forme là où ils apparaissent.

## Vérifications

- comportement de l’éditeur vérifié dans un vrai navigateur : bascules du gras,
  de l’italique, du souligné et du barré, pose et retrait des titres et des
  listes, cases à cocher qui se cochent et se décochent, ligne de séparation,
  effacement de la mise en forme, et frappe qui reste stable pendant
  l’enregistrement ;
- lint sans erreur, build Vinext complet, tests d’interface au vert ;
- serveur desktop construit et vérifié en HTTP 200.
