# Eraser 0.1.1-alpha.197 — Vues dans « Modifier » avec presets, onglets stat

Cette version arrive par la mise à jour sans réinstallation. Rien n'est écrit dans Google
Sheets à l'installation.

- **Vues et presets** : enregistrés sur le serveur partagé d'Eraser, comme les cartes.
- **Onglets stat** : rangés comme les autres onglets-fenêtres, dans la colonne « Présentation
  (JSON) » déjà là.

## Vues des index (Modifier › Vues)

- Dans **Modifier**, un nouvel onglet **Vues**, à côté de **Cartes**. Pour chaque onglet de
  l'index, il règle cinq vues : **Liste**, **Kanban**, **Maître-détail**, **Calendrier** et
  **Tableau de bord**.
- **Un aperçu en direct** montre chaque vue sur les vraies lignes de l'onglet.
- **Presets** :
  - neuf sont fournis par Eraser : liste compacte, liste à lignes dépliables, liste sur deux
    colonnes, sections repliées, kanban serré, kanban large, maître-détail en sections,
    calendrier réel et tableau de bord simple ;
  - tu peux enregistrer les tiens, qui servent ensuite dans tous les index ;
  - appliqué à un autre index, un preset garde ce qui s'applique et laisse de côté les
    colonnes absentes.
- **Réglages possibles** :
  - le tri (croissant ou décroissant) ;
  - la couleur des lignes selon une colonne ;
  - une image à côté du nom ;
  - les sections : repliables, repliées à l'ouverture, sans « Sans valeur », sans compteur ;
  - la liste sur 1, 2 ou 3 colonnes ;
  - la largeur des colonnes du kanban ;
  - les colonnes montrées dans le détail ;
  - la liste des lignes sans date sous le calendrier ;
  - de nouvelles tuiles : plus petite valeur, plus grande valeur, lignes remplies, et le
    nombre de tuiles par rangée.
- **Dans l'index** : un onglet-fenêtre qui choisit une de ces vues la montre avec ces
  réglages. La bascule **Tableau / Cartes** ne change pas.
- Renommer un onglet ou une colonne dans Modifier : les vues suivent.

## Onglets stat

- Le bouton qui crée un onglet propose deux choix : **Onglet fenêtre** (comme avant) ou
  **Onglet stat**.
- **Construire une statistique** :
  - une phrase à trous : « Compter / Additionner / Moyenne / Maximum / Minimum de … les lignes
    de … où … réparties par … » ;
  - le résultat se met à jour en direct ;
  - les formes : chiffre, barres, classement, anneau, tableau croisé à niveaux ;
  - cliquer une barre, une part ou une case liste les lignes concernées.
- **Les stats enregistrées** : on peut les modifier, les renommer, les dupliquer, les épingler
  en tête, et les supprimer (avec « Annuler »).
- Tout se calcule sur les lignes déjà chargées : aucune lecture Google de plus.
