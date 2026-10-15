# Eraser 0.1.1-alpha.224 — Les vues des index

Cette version arrive **sans réinstallation** : Eraser la télécharge, redémarre son serveur et
recharge la page tout seul. Rien n'est effacé dans Google Sheets, ni dans les réglages, ni dans
les pages.

## Les vues

- Une **vue** réunit un filtre (quelles lignes), un tri (dans quel ordre) et une présentation
  (liste, kanban, calendrier…) sous un nom. On les choisit dans le groupe « Vues » du choix
  d'onglet, sur l'index des mondes comme sur celui des objets.
- « Nouvelle vue » règle tout au même endroit : nom, présentation, forme, carte, filtre, tri.
- « Enregistrer comme vue » garde les filtres et le tri du tableau qu'on vient de faire.
- Les vues sont partagées : créées sur une installation, elles apparaissent sur les autres. Les
  anciens onglets-fenêtres de la feuille sont toujours là ; les modifier ne change plus la
  feuille.
- Un onglet de statistiques peut montrer seulement certaines statistiques.

## Dans les pages

- Un bloc Vue peut montrer une vue de l'index : il suit ce qu'on y change.
- « Détacher pour cette page » en fait une copie propre à la page ; « Enregistrer comme vue de
  l'index » fait l'inverse.
- Avant de modifier ou supprimer une vue montrée par des pages, Eraser nomme ces pages.
- Les blocs existants n'ont pas changé.

## Les présentations

- Survoler un élément, dans n'importe quelle présentation, montre le survol de la ligne. Chaque
  présentation choisit sa version de survol (l'étoilée par défaut), ou aucune.
- Kanban : couloirs (les mêmes colonnes répétées par groupe, repliables).
- Calendrier et chronologie : ordre des éléments d'un même jour.
- Maître-détail : annuaire par première lettre.
- Galerie et codex : un élément peut être dessiné avec une carte.
- Arborescence : cadre, espacement, coins, ombre. Codex : coins et ombre.

## Formulaires et cartes

- Les versions de formulaires et de survols se réordonnent ; un bloc de formulaire se duplique.
- Un champ peut être petit, normal ou grand, aligné à gauche, au centre ou à droite ; une image
  peut être moins large. Nouvelle couleur « discrète ».
- Cartes : une icône devant un texte ou un champ, une couleur prise dans une colonne.
- « Nouvelle carte » propose les cartes des autres pages d'Eraser.
- « Copier vers d'autres onglets » marche pareil partout, avec le choix d'en faire la version
  principale (l'ancienne reste, renommée).
- Un formulaire, un survol ou une carte qu'on vide reste là, vide, avec son nom : on le supprime
  avec le bouton Supprimer.

## Ce qui peut changer d'aspect

- Le kanban de départ « Colonnes × couloirs » affiche maintenant vraiment ses couloirs.
- Des réglages qui ne faisaient rien marchent désormais : kanban « Séparées d'un trait »,
  maître-détail « Encadrées », « Noms abrégés » décoché, galerie sans fond, titre de carte
  « Tout », couleur « {Colonne} » dans un survol.
- Un survol apparaît maintenant quand on passe la souris sur les éléments des présentations.

## Corrections

- Une colonne de kanban ajoutée à la main n'est plus perdue.
- Le bouton vers un formulaire dans une fiche ouvre bien ce formulaire.
- La recherche marche dans un onglet de statistiques.
