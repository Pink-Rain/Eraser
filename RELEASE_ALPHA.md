# Eraser 0.1.1-alpha.15 — icône plus grande, avatar sans cadre

Deux retouches visuelles demandées juste après l'alpha.14 : l'icône de
l'application remplissait mal son cadre comparée à d'autres applications
(Discord, Chrome…), et l'avatar en haut du menu latéral gardait un cercle
autour du logo au lieu de l'afficher en grand.

## Corrigé

- l'icône de l'application (fenêtre, barre des tâches, onglet navigateur,
  installateur) est régénérée avec une marge bien plus fine autour du logo,
  pour remplir son cadre comme les icônes des autres applications au lieu de
  paraître petite avec un grand espace vide autour ;
- l'avatar en haut du menu latéral (bouton d'accès aux personnages/
  campagnes) perd son cadre circulaire sombre : le logo lui-même est
  affiché en grand, sans cercle ni bordure autour.

## Vérifications

- compilation complète de l'application réussie ;
- lint sans erreur ;
- vérification de fidélité avec la source du site réussie (aucun fichier CSS
  historique modifié, aucune suppression) ;
- serveur Windows autonome construit et vérifié en HTTP 200 sur
  « /connexion ».
