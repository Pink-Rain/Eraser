# Eraser 0.1.1-alpha.123 — La forge de l'inventaire

Cette version arrive par la mise à jour sans réinstallation.

## L'enclume remplace le bouton « Lier »

Sur chaque objet de l'inventaire, le bouton **enclume** ouvre un seul formulaire, sans
onglets, pour **cet exemplaire seulement** (l'Index des objets ne change pas) :

- **Utilisation** : compétence (une ou plusieurs), valeur, distance, action et action de
  rechargement ;
- **Attributs, matériaux et runes** : en ajouter, en changer, en retirer ;
- **Compétences liées** : les modificateurs, comme avant.

Un champ changé est entouré, et « Comme l'index » le remet à la valeur de l'Index des
objets. Seul ce qui diffère de l'index est enregistré : le reste suit l'index s'il change.
Les runes, attributs et matériaux déjà ajoutés à un objet sont repris tels quels.

## La fiche montre les objets qui utilisent une compétence

Au survol d'une compétence (ou d'une caractéristique), en plus des objets liés, une
partie **« Objets qui l'utilisent »** liste les objets dont la Compétence la nomme, avec
leur case pour les équiper ou les déséquiper d'ici.

## Affichage

- L'action de rechargement s'affiche précédée de **« Rechargement : »**.
- Les icônes des attributs, matériaux, runes et objets prennent, dans les effets, la
  couleur de la colonne de leur mot, et au survol celle de leur colonne Couleur.
- Un nom cité avec « { » (`{État:Immobilisé}`) prend le **style imposé à la colonne Nom**
  de son index, comme dans le tableau.
