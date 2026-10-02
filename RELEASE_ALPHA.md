# Eraser 0.1.1-alpha.110 — Les index restent à jour, et là où tu les as laissés

Cette version arrive par la mise à jour sans réinstallation.

## Index : fini les modifications qui semblent perdues

- **Revenir sur un index montre tes dernières modifications.** Le routeur gardait une
  copie de chaque page visitée (5 minutes, 30 avec Précédent / Suivant) et la
  réaffichait telle quelle : l'index revenait à son état d'avant, alors que tout était
  bien enregistré. Il fallait actualiser pour le voir.
- Maintenant, chaque modification enregistrée (cellule, ligne, colonne, profil…) oublie
  ces copies. La page suivante est relue sur le serveur, qui est à jour. Une
  modification faite dans une autre fenêtre d'Eraser fait la même chose.

## Index : ta place et ta recherche sont gardées

- **La recherche** de chaque page d'index est retrouvée quand tu reviens : index du
  monde, objets, PNJ, personnages, campagnes, sorts. Elle est gardée le temps de la
  fenêtre, et l'effacer l'oublie.
- **La position dans le tableau** (vertical et horizontal) est retrouvée, pour chaque
  onglet de l'index.
- **La position de la page** est retrouvée aussi, partout dans Eraser. Une page encore
  jamais défilée s'ouvre en haut.

## Fiche de personnage

- Le survol d'un état ne montre plus les lignes de l'onglet Effets, seulement la
  description de ses niveaux et ses règles liées.
