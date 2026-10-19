# Eraser 0.1.1-alpha.232 — Versions brouillon, index des pages, colonne « Rareté et emplacements »

Cette version arrive **sans réinstallation** (même enveloppe que l'alpha 227) : Eraser la
télécharge, redémarre son serveur et recharge la page tout seul. Rien n'est effacé dans Google
Sheets, ni dans les réglages, ni dans les pages : aucune clé enregistrée ne change.

## Créateur de pages

- **Au lancement, plus d'ancienne page ni de menu incomplet** : l'accueil modifié s'affiche
  directement (au lieu de l'accueil d'origine, puis du bon après rechargement), et « Armes —
  modificateurs » est dans le menu dès l'ouverture. La première page attend, au plus 3 secondes,
  les copies des pages et du menu.
- **« Voir la page d'origine » est remplacé par des versions brouillon** : bouton « Versions
  brouillon » (icône d'historique) dans l'atelier. On enregistre la page telle quelle sous un nom,
  on y revient (annulable avec Ctrl+Z) ou on la supprime. Jusqu'à 20 versions par page ; elles
  disparaissent avec la page.
- **Index des pages en cartes, liste, galerie…** : les pages créées et les pages d'Eraser y sont
  au même rang, avec le moteur des index (cartes, survols, vues). « Modifier l'affichage » règle
  leurs cartes et leur survol. Un bloc Vue d'index peut montrer l'index « Pages » : un menu de
  pages, une galerie de règles… Chaque ligne ouvre sa page.

## « Modifier » des index

- **Annuler ferme sans demander** « Quitter sans enregistrer ? » (la croix et Échap demandent
  toujours). Les boutons de cette question tiennent sur une seule ligne.
- **La molette reste dans la fenêtre** : le tableau dessous ne défile plus.
- **Cartes** : options « Même hauteur » (toutes les cartes d'une rangée alignées) et « Remplir la
  largeur » (les cartes s'étirent sur toute la page).

## Nouvelles colonnes

- **« Rareté et emplacements »** : une rareté par ligne, avec un ou plusieurs lieux
  (environnements et magasins de l'Index des lieux), autant de fois qu'on veut :
  `Commun : Armurerie - Marché noir`. Les raretés sont celles des magasins et des fouilles
  (Très commun, Commun, Rare, Très rare, Ultime) ; « Peu commun » compte comme Commun.
  - Les **magasins, fouilles et événements lisent d'office** tout index qui a cette colonne,
    sans rien régler dans Lieux › Magasin. Un onglet qui ne l'a pas encore garde ses anciennes
    colonnes (rareté et emplacement principaux, secondaires), qui ne sont jamais effacées.
  - **Statistiques** : par rareté seule, par lieu seul, les deux séparément, ou les deux
    ensemble (« Rare · Forêt », ou par paire).
- **Lieux › Environnement : colonnes « Fouille » et « Événement »**, à ajouter dans « Modifier »
  (ou à la main, sous ces noms). Elles proposent les index qui ont une colonne « Rareté et
  emplacements ». Fouille vide : les items. Événement : la page Événements propose un tirage dans
  l'environnement choisi.
- **« Liste d'index »** : une liste qui propose automatiquement les index ayant une colonne d'un
  type choisi.
- **« Sections »** : des paragraphes avec un titre chacun (parties d'un wiki, tomes d'un livre).

## À faire une fois (admin)

La reprise des anciennes raretés et anciens emplacements dans la nouvelle colonne n'est **pas**
faite automatiquement. Tant qu'un onglet n'a pas la colonne « Rareté et emplacements », rien ne
change pour lui.
