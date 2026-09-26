# Eraser 0.1.1-alpha.67 — Icônes d’objets sur le Drive et dans les index

Cette version arrive par la mise à jour sans réinstallation. Rien à changer côté
Roll20.

- Les icônes d’objets vivent désormais sur le Drive, dans le dossier
  « icone objet » (créé seulement s’il n’existe pas déjà).
- La colonne « Icône » des index d’objets reçoit l’image elle-même : elle
  s’affiche aussi dans Google Sheets. Eraser remplit tout seul les cases vides
  ou qui tenaient une ancienne icône générée ; une icône choisie à la main
  n’est jamais remplacée.
- Les objets affichent ce que contient leur case « Icône » : une image du Drive,
  une adresse d’image, une formule =IMAGE(…) ou un émoji. Une case vide prend
  l’icône d’Eraser correspondante.
- Index des objets : chaque case « Icône » montre l’image et un bouton pour en
  importer une autre ; l’image importée va dans le dossier « icone objet » et
  s’affiche partout (inventaires, fouilles, magasins).
- Les images du dossier « icone objet » sont lisibles par lien : c’est ce qui
  permet à Google Sheets de les afficher.

## Vérifications

- lint sans erreur, build de production et build desktop réussis, serveur desktop
  vérifié en HTTP 200 ;
- tests d’interface et tests des icônes au vert (choix d’icône, lecture de la
  case, images présentes dans l’archive du serveur).
