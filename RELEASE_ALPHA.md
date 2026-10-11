# Eraser 0.1.1-alpha.193 — Créateur de session, Marché ambulant, Index des items

Cette version arrive par la mise à jour sans réinstallation. Rien n'est supprimé ni déplacé dans
Google Sheets : la feuille « Sessions » reçoit seulement trois colonnes à droite (« Lieux de la
session », « Document », « Événements (JSON) ») au premier enregistrement qui en a besoin.

## Créateur de session

- **Document** : une page vide par session, à côté de « Préparation », pour écrire librement
  (texte lu aux joueurs, déroulé…). Enregistrée en quittant le champ.
- **Lieux de la session** : un petit encart en haut de la préparation pour noter les lieux.
- **Événements** : une nouvelle section. « Ajouter un événement » propose
  - une **créature** (recherche dans l'Index des créatures),
  - un **PNJ** de la campagne ou un **PNJ générique**,
  - un **Marché ambulant** sauvegardé, ou en générer un sur place,
  - **Autre** : nom, icône au choix, étiquette avec sa couleur et description.
  Chaque carte s'ouvre sur sa fiche, se modifie (étiquette, couleur, description) et se retire.
- **Envoyer dans une autre session** sur les PNJs, les magasins et les événements : ils restent
  dans la session ouverte et rejoignent celle choisie.

## PNJs

- « Générer un PNJ » disparaît : **tout nouveau PNJ** naît avec ses PV et caractéristiques tirés.
- **Lier un magasin depuis un PNJ** (icône boutique sur sa carte) : cocher un magasin fait du PNJ
  son vendeur, décocher retire le lien. La carte du PNJ affiche les magasins qu'il tient.

## Magasins

- **Marché ambulant** : un nouveau magasin, avec les mêmes règles que les autres, généré à part
  (dans Magasin et fouille ou dans les événements) avec **4 à 8 items**, choisis ou tirés au
  hasard. Il se sauvegarde, se relance et se lie à un PNJ comme les autres. Ses items sont ceux
  dont un emplacement est « Marché ambulant ».
- Une case d'emplacement qui liste plusieurs lieux (« Marché ordinaire - Marché ambulant -
  Bateau ») est lue lieu par lieu : l'item se vend au Marché **et** au Marché ambulant. Avant,
  un item « Marché ordinaire - Marché noir » n'arrivait jamais au Marché.
- **Loupe** sur chaque ligne, à côté de « Relancer » : chercher un item dans l'index et le mettre
  à la place, par défaut parmi ceux que vend ce magasin (une case ouvre tout l'index).
- **« Lier à un PNJ » peut créer le PNJ** : « Créer un PNJ », un nom, et le vendeur naît lié.

## Index des items

- L'Index des objets s'appelle maintenant **Index des items** partout à l'écran. « Objets » reste
  le nom de l'onglet, du type et des colonnes de la feuille.
- **Bouton tout fait « Envoyer dans un autre onglet »** dans le type de colonne Boutons de
  l'éditeur d'index, utilisable dans tous les index ; la colonne Actions des items l'utilise.
- La colonne **« Onglet »** de la vue Tout (Lieux…) est retirée : le bouton ci-dessus la remplace.
