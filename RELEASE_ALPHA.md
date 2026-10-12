# Eraser 0.1.1-alpha.209 — La page d'une classe et l'accueil en vues d'index

Cette version arrive par la mise à jour sans réinstallation. Rien n'est écrit dans Google
Sheets, et rien ne change pour les lecteurs tant que tu ne publies pas une page reprise.

## La page d'une classe (Règles › Classes › une classe)

- **« Modifier » la reprend comme la page de chaque classe** : une seule page dans
  l'atelier, remplie avec la classe affichée (« {Nom de la classe} », « {Image} »…).
- **Ses sorts sont une vue de l'index des sorts**, rangée « Rang commun, Rang 1… » par la
  colonne de la classe, avec la carte « Sort » de l'index. Les **bonus de rang** sont une vue
  de leur index, avec une nouvelle carte « Bonus d'un rang ».
- La présentation (caractéristiques, spécialités) et les spécificités (cartes du
  Cartomancien…), qui ne viennent pas d'un index, sont des modules d'Eraser.
- Une classe introuvable affiche toujours la page d'origine.

## L'accueil

- **« Mes campagnes » (MJ) et « Mes personnages » (joueurs) sont des vues de leur index**,
  avec les cartes de campagne et de personnage, filtrées sur le lecteur. Les choses à faire
  (admins), la colonne de côté et les succès restent des modules.

## Bloc « Vue d'index »

- **« {Moi} » dans une condition** : le lecteur. « Joueur est {Moi} » : ses personnages ;
  « MJ est {Moi} » : ses campagnes.
- **« Au clic sur une ligne »** : sa fiche (d'office), une adresse choisie
  (« /campagne/{ID} »), ou rien.
- Sur la page d'une ligne, « {Colonne} » marche aussi dans un nom de colonne (regrouper,
  trier, condition), et dans l'adresse d'un bloc Lien.
- Nouvelle visibilité de bloc **« MJ seulement »** (ni les joueurs ni l'admin, sauf en vue MJ).
