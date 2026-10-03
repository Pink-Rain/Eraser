# Eraser 0.1.1-alpha.130 — PNJs, campagnes, personnages, classes et sorts sur le moteur des index

Cette version arrive par la mise à jour sans réinstallation.

## Six index de plus sur le moteur

Les index des **PNJs**, **Campagnes**, **Personnages**, **Classes**, **Sorts des classes**
et **Sorts des créatures** passent sur le même moteur que les lieux, les créatures ou les
états. On y retrouve tout ce que ce moteur sait faire : le tableau, la fiche d'une ligne,
« Modifier » (colonnes, types, verrous, corbeille), les onglets-fenêtres, les presets, les
formules, Recherche et Agrégat, l'aléatoire, « Tirer », les boutons et les relations.

Chaque index lit la feuille que le reste d'Eraser utilise déjà, colonne par colonne et par
leur nom. Rien n'est copié, et aucune ligne existante n'est réécrite.

Ce qui change d'un index à l'autre :

- **PNJs** : tous les PNJ de la feuille sont dans le tableau. Un PNJ ajouté depuis l'index
  rejoint la bibliothèque. Deux PNJ peuvent porter le même nom.
- **Personnages**, **Campagnes**, **Classes** : leur nom ouvre leur page. « Ajouter » mène à
  leur page de création. Le tableau n'en supprime aucun : ils partent à la corbeille comme
  avant.
- **Classes** et **Sorts des classes** ont désormais leur page dans les index.

Les colonnes qu'Eraser lit lui-même sont verrouillées dans « Modifier ». On peut les
déverrouiller, avec un avertissement. Les colonnes techniques (page d'un PNJ, compte d'un
joueur, dates) sont masquées dans la grille et s'affichent d'un clic.

## Ce qui reste à portée de main

Les anciennes vues sont gardées, chacune via un lien sous le titre de l'index :

- pour les personnages et les campagnes, l'attribution à un compte et la corbeille ;
- pour les PNJs, la récupération depuis une campagne ;
- pour les sorts des créatures, les doublons et la fusion.

## Sous le capot

- Une modification faite ailleurs dans Eraser est vue par l'index sans « Actualiser ». Par
  exemple un PNJ enregistré dans sa campagne, ou une classe créée.
- Les colonnes au-delà de AZ sont lues.
