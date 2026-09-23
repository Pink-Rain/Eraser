# Eraser 0.1.1-alpha.60 — Corrections Roll20 (0.7.1)

Cette version arrive par la mise à jour sans réinstallation. Le compagnon Roll20
et le script Mod passent en **0.7.1** : mets à jour les deux depuis la page
Roll20 de la campagne (pour le compagnon, remplace le contenu du dossier puis
clique sur « Actualiser » dans chrome://extensions).

## Roll20

- **« Synchroniser une session » ne relance plus tout.** Le compagnon relisait
  tout le chat et retombait sur une ancienne demande « Tout synchroniser » à la
  fin de la synchro de la session. Chaque demande porte maintenant un numéro
  unique et horodaté : une demande déjà vue, ou plus ancienne que l’ouverture de
  la page, n’est jamais rejouée.
- **Dossiers de session.** Le script Mod ne peut pas modifier les dossiers du
  Journal (Roll20 ne le permet pas). C’est désormais le compagnon qui, dans la
  page Roll20, range les PNJs et magasins de la session dans un dossier à son nom
  et y déplace ceux qui existaient déjà. Les fiches des joueurs ne bougent pas.
- **Tokens.** Un token enregistré juste avant la synchro (ou depuis un autre
  ordinateur) pouvait être ignoré : Eraser le cherche maintenant directement dans
  Drive. Le résumé de fin indique « N token(s) Eraser importé(s) sur M
  préparé(s) » pour voir tout de suite ce qui est passé.
- Plus d’avertissement « bar1_num_permission » dans la console Mod.

## Vérifications

- lint sans erreur, build de production et build desktop réussis, serveur desktop
  vérifié en HTTP 200 ;
- 22 tests d’interface et 5 tests du pont Roll20 au vert (demandes horodatées,
  dossier créé dans la page Roll20 sans toucher aux joueurs).
