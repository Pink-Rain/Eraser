# Eraser 0.1.1-alpha.133 — Mises en page dans Eraser, vraie colonne Image des classes, listes lisibles

Cette version arrive par la mise à jour sans réinstallation.

## Index

- **Les mises en page (fiche et survol) sont enregistrées dans Eraser**, sur son serveur
  partagé, comme les comptes : les mêmes pour tout le monde, sur toutes les installations,
  et plus rien n'est écrit dans Google Sheets quand on déplace un champ. Le bas de
  « Modifier » distingue ce qui part dans Google Sheets (colonnes, données) de ce qui est
  enregistré dans Eraser (mises en page).
- **Index des classes** : la colonne Image est une vraie colonne image. La case montre
  l'image actuelle de chaque classe (même gardée en formule, en image dans la cellule ou
  sur le Drive) ; importer une image ou coller une adresse la remplace.

## Personnages

- **La cause des `["…"]` est corrigée** : la fiche écrit désormais peuples, classes,
  langues, titres et religions en texte lisible dans Google Sheets (« Orc des Terres
  Libres », plusieurs valeurs séparées par « · », le titre choisi en premier) au lieu de
  JSON.
- Les fiches écrites avant restent lues partout. Dans l'Index des personnages, leurs
  cases s'affichent déjà en clair, et passent au nouveau format dès qu'on les modifie
  (dans la fiche ou dans l'index). Rien n'est réécrit dans la feuille sans modification.
