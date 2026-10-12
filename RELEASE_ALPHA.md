# Eraser 0.1.1-alpha.207 — Pages : choisir sa vue, sa carte, ses lignes

Cette version arrive par la mise à jour sans réinstallation. Rien n'est écrit dans Google
Sheets.

## Bloc « Vue d'index »

- **Chaque présentation se pose directement** depuis la palette : sous « Vue d'index »,
  Tableau, Cartes, Liste, Kanban, Maître-détail, Calendrier, Tableau de bord, Galerie,
  Chronologie, Arborescence, Codex. Choisir ensuite l'index ne la remet plus sur « Tableau ».
- **Choisir quelle carte** : « Carte » liste les cartes de l'onglet (Modifier › Cartes) ;
  par défaut, celle à l'étoile.
- **Choisir quel kanban, quelle liste…** : « Forme » propose celle de l'onglet, tes presets
  et ceux d'Eraser, ou une forme propre à la page. Pour avoir plusieurs kanbans, règle-les
  dans l'index et enregistre chacun en preset ; « Relire l'index » les fait apparaître.
- **« Seulement les lignes où… »** : des conditions sur les colonnes (est, n'est pas,
  contient, commence par, est vide, supérieur, inférieur…), toutes vraies ou une seule. Une
  colonne masquée peut servir de condition sans jamais être montrée. Sur une page de ligne,
  « {Colonne} » dans une valeur prend celle de la ligne affichée.
- **« Trier par »** une colonne, croissant ou décroissant, avant « Au plus » (les 5 plus
  hauts niveaux, les 3 derniers ajouts…).
- Le choix d'un onglet-fenêtre n'est plus proposé (les onglets-fenêtres restent dans les
  index). Un bloc qui en utilisait un continue de marcher ; « Copier ses conditions ici » le
  rend indépendant.

## Nouveaux blocs et réglages

- **Recherche** : un champ qui filtre en direct les lignes des vues de la page. Chaque vue
  peut ne pas la suivre (« Suivre la recherche de la page »).
- **Statistiques** : en plus d'une statistique, « Toutes les épinglées », disposées comme
  dans l'onglet stat de l'index.
- **Valeurs de la ligne › Comme la fiche** : sur une page de ligne, les valeurs disposées
  comme le formulaire de l'index (sections, colonne latérale, champs en grand).
- **Quand l'afficher** (pages de ligne) : un bloc peut ne s'afficher que pour certaines lignes
  (« Type est Boss »). Vérifié sur le serveur : un bloc écarté n'est pas envoyé.
