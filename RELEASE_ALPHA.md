# Eraser 0.1.1-alpha.66 — Icônes d’objets au croquis

Cette version arrive par la mise à jour sans réinstallation. Rien à changer côté
Roll20.

- Les objets ont de nouvelles icônes dessinées à l’encre, dans l’esprit dark
  fantasy : 82 armes et 49 catégories d’objets (écrits, équipement,
  ingrédients, alchimie, divers). Elles remplacent les émojis dans les
  inventaires, la recherche d’objets, les fouilles et les magasins, y compris
  les magasins déjà enregistrés.
- Choix de l’icône : une arme est reconnue à son nom ; un autre objet à son
  sous-type, ou à son nom quand le sous-type est vide, « Autre » ou « / ».
  Faute d’équivalent, Eraser prend l’icône la plus proche.
- Une icône choisie à la main (un autre émoji, une image) est toujours
  respectée.
- Index des objets : le bouton « Mettre à jour les icônes » écrit les nouvelles
  icônes dans la colonne « Icône » des Google Sheets. Seules les icônes posées
  par Eraser changent.
- Les icônes sont un peu plus grandes dans les inventaires, les fouilles et les
  magasins.

## Vérifications

- lint sans erreur, build de production et build desktop réussis, serveur desktop
  vérifié en HTTP 200 ;
- tests d’interface et 3 nouveaux tests des icônes (choix sur des lignes réelles
  des index, remplacement des anciennes icônes, présence des 131 images) au vert.
