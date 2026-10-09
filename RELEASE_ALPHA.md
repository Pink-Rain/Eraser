# Eraser 0.1.1-alpha.175 — Plus rapide, et les classes tout de suite

Cette version arrive par la mise à jour sans réinstallation.

## L'application était ralentie à chaque page

Le fil d'Ariane, en haut de chaque page, chargeait la liste des pages accessibles. Pour un
administrateur, cela relisait toutes les fiches de personnages avec leurs classes, y compris
la colonne JSON des sorts choisis, la plus lourde de la feuille. Pour un joueur dont
l'installation ne connaissait encore aucune classe, cela lançait une lecture complète des
classes dans Google Sheets.

- Cette liste ne lit plus que ce que l'installation a déjà en mémoire : plus aucune lecture
  Google ni des fiches à chaque page.
- Elle se charge après le contenu de la page, et ne passe plus jamais devant.

## Les classes pour les joueurs qui n'en voyaient aucune

- **Une seule lecture suffit** : une installation qui ne connaît encore aucune classe
  n'attend plus la lecture complète (vérification des colonnes, notes et images posées dans
  les cases). Une lecture simple de la feuille affiche la liste, et le reste suit en
  arrière-plan.
- **Sur la fiche, le choix de classe n'attend plus les sorts** : la liste des classes arrive
  d'abord, les sorts ensuite.
