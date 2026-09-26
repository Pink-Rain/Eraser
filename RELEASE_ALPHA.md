# Eraser 0.1.1-alpha.68 — Objets retrouvés, nouvelle création de personnage, section Index

Cette version arrive par la mise à jour sans réinstallation. Rien à changer côté
Roll20.

## Inventaires : les objets manquants sont de retour

- **Corde, Tableau, Bougie, Torche, Lanterne… sont de nouveau disponibles** dans les
  inventaires des personnages, des campagnes et des PNJ, ainsi que dans les magasins.
  La feuille « Index Objet » du dossier Objets a une ligne d’en-têtes vide sur ses
  dix premières colonnes : Eraser n’y trouvait pas de colonne « Nom » et ignorait
  tout le fichier (185 objets). Les en-têtes manquants sont maintenant repris des
  autres index d’objets, qui ont la même disposition (Nom, Description, Type…).
  La ligne d’en-têtes n’est pas modifiée : tu peux la remplir quand tu veux. Comme
  pour les autres index, sa colonne « Icône » vide reçoit ensuite les icônes d’Eraser.
- Une case « Icône » en erreur (« #REF! », formule cassée dans Sheets) affiche
  l’icône d’Eraser au lieu du texte « #REF! ».
- La liste d’ajout d’un objet est triée par ordre alphabétique et montre jusqu’à
  80 objets au lieu de 20, avec le nombre d’objets restants à affiner par la recherche.

## Création de personnage

- Nouveau formulaire, réduit à l’essentiel : **portrait** (image importée, glissée
  ou lien), **nom**, **peuple** (proposés depuis l’index des peuples, ou saisie libre)
  et **classe**, choisie parmi de petites cartes illustrées aux couleurs de chaque
  classe. Le reste de la fiche se remplit ensuite depuis la fiche du personnage.
- Un nouveau personnage démarre avec **réussite critique à 5** et **échec critique
  à 96**. Le joueur peut les modifier ensuite sur sa fiche.

## Index (anciennement Ressources)

- La section « Ressources » du menu s’appelle maintenant **Index**, et ses pages
  perdent le préfixe : « Index des objets » devient « Objets », « Index des
  créatures » devient « Créatures », etc. Les noms des feuilles Google ne changent pas.
- **Index est aussi une page** : clique sur son titre dans le menu (la flèche
  ouvre toujours la liste). Elle présente chaque index sous forme de carte avec
  son icône, dans l’esprit de la page Classe des règles, par ordre alphabétique.
- Chaque carte a une **étoile** : étoilée, elle est dans « Index » et dans le menu ;
  sans étoile, elle passe dans « Index secondaire » et quitte le menu (elle reste
  accessible depuis la page Index). Tout est étoilé au départ.

## Vérifications

- en-têtes déduits testés sur les vraies en-têtes des cinq index d’objets : la
  colonne « Nom » de « Index Objet » est retrouvée, Corde et Tableaux compris ;
- page Index et formulaire de création rendus dans un vrai navigateur ; retirer
  une étoile range la carte dans « Index secondaire » et la retire du menu ;
- lint sans erreur, tests au vert, build et serveur desktop vérifiés en HTTP 200.
