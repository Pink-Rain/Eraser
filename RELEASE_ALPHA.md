# Eraser 0.1.1-alpha.61 — Tokens par défaut dans Roll20

Cette version arrive par la mise à jour sans réinstallation. Le compagnon Roll20
et le script Mod passent en **0.7.2** : mets à jour les deux depuis la page
Roll20 de la campagne (pour le compagnon, remplace le contenu du dossier puis
clique sur « Actualiser » dans chrome://extensions).

## Tokens automatiques

- Plus besoin de passer par le bouton « Token » pour chaque fiche : un joueur,
  un PNJ ou un magasin **sans token préparé dans Eraser** reçoit dans Roll20 un
  **token par défaut**, avec l’avatar centré dans son cadre (doré, cuivré ou
  devanture du magasin). Un magasin sans vendeur reçoit sa devanture seule.
- Un token réglé à la main dans Eraser reste toujours prioritaire.
- Le token par défaut est refait automatiquement quand l’avatar change dans
  Eraser.
- Le dessin des cadres a une seule source, partagée par l’éditeur de token de
  l’application et par le compagnon : les tokens automatiques sont identiques à
  ceux de l’éditeur.
- Le résumé de fin compte les « token(s) par défaut » à part.

## Vérifications

- lint sans erreur, build de production et build desktop réussis, serveur desktop
  vérifié en HTTP 200 ;
- 22 tests d’interface et 6 tests du pont Roll20 au vert (dont le dessin des
  quatre cadres par le fichier partagé) ;
- tokens par défaut dessinés et vérifiés à l’écran.
