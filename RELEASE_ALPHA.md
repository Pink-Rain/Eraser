# Eraser 0.1.1-alpha.13 — mémoire d'interface et Index des classes en tableau

Correctifs demandés après retour sur l'alpha.12 : la nouvelle icône remplace
aussi l'avatar « E » du menu latéral, les raccourcis de mise à jour sont
visibles quel que soit le rôle actif, l'application se souvient des tris et
onglets choisis d'une visite à l'autre, et l'Index des classes redevient un
vrai tableau comme l'Index des objets.

## Ajouté

- mémoire des préférences d'affichage (tri manuel, colonne de tri, onglet
  actif, tableau sélectionné…) : elles sont conservées d'une visite à l'autre
  au lieu d'être réinitialisées à chaque retour sur une page — par exemple le
  tri manuel des sorts dans la fiche personnage reste actif tant qu'on ne le
  change pas soi-même ; couvre la fiche personnage, l'Index des classes et
  l'Index des objets.

## Corrigé

- l'avatar « E » en haut du menu latéral (sélection de rôle) affiche
  maintenant le nouveau logo, comme l'icône de l'application ;
- « Actualiser » et « Chercher les mises à jour » sont désormais visibles en
  mode MJ et joueur, pas seulement en administration (seule « Corbeille »
  reste réservée à l'administration) ;
- l'Index des classes est reconstruit en véritable tableau (lignes/colonnes,
  colonnes « Ligne » et « Actions » figées) exactement comme l'Index des
  objets, à la place de l'ancien affichage en cartes qui ne convenait pas.

## Vérifications

- compilation complète de l'application réussie ;
- lint sans erreur ;
- vérification de fidélité avec la source du site réussie (aucun fichier CSS
  historique modifié, aucune suppression) ;
- serveur Windows autonome construit et vérifié en HTTP 200 sur
  « /connexion » et redirection d'authentification attendue (307) sur
  « /ressources/index-des-classes » et « /ressources/index-des-objets ».
