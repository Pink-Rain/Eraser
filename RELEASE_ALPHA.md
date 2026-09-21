# Eraser 0.1.1-alpha.34 — persistance des magasins corrigée

Cette préversion corrige le blocage d’écriture encore visible dans la feuille
Magasins, sans modifier l’architecture Google Sheets/Drive ni les données
existantes.

## Changements principaux

- les IDs, l’association à la page et les objets JSON des magasins sont écrits
  en valeurs brutes pour empêcher toute interprétation par Google Sheets ;
- la vérification relit désormais les lignes exactes indiquées par
  `updates.updatedRange`, avec de courtes nouvelles tentatives si la relecture
  Google est momentanément en retard ;
- la réponse d’écriture avec les valeurs réellement acceptées reste une preuve
  de secours, sans supprimer `SHOPS_WRITE_NOT_PERSISTED` ;
- le diagnostic d’écriture efface précisément sa ligne témoin ;
- le dernier tirage, les magasins sauvegardés, l’ajout au Créateur de session
  et les transferts du bac à sable utilisent tous ce chemin corrigé ;
- les lignes existantes de l’Index des classes se sauvegardent automatiquement
  après une courte pause de saisie.

## Vérifications

- installation propre des dépendances ;
- lint, build Vinext et tests CI ;
- tests fonctionnels de l’application, dont Roll20 ;
- build et vérification du serveur desktop ;
- paquet compagnon reconstruit avec le manifest à la racine.
