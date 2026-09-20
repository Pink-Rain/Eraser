# Eraser 0.1.1-alpha.24 — les feuilles Google se relient toutes seules

## La cause des bugs « ça marche chez moi mais pas chez lui »

Chaque installation d'Eraser possède sa propre base locale. Les feuilles
Google, elles, sont partagées. Le lien entre les deux — quelle feuille
Google correspond aux personnages, aux campagnes, aux classes — était
enregistré **uniquement dans la base locale de l'ordinateur sur lequel un
administrateur avait cliqué « Relier mes feuilles existantes »**.

Sur une autre installation, ce lien n'existait pas. Les écritures ne s'en
apercevaient pas (elles retrouvent la feuille dans le Drive toutes
seules — c'est pour ça qu'un compte se mettait à voir les personnages
juste après en avoir créé un). Mais toutes les **lectures** renvoyaient
simplement « aucune donnée », sans erreur :

- **les classes apparaissaient vides** (« aucune classe », sans message
  d'erreur) ;
- **les campagnes n'étaient jamais synchronisées** localement, donc
  considérées comme introuvables — ce qui bloquait l'ajout d'un
  personnage joueur à une campagne et faisait répondre « Accès refusé »
  à l'enregistrement des magasins de cette campagne.

## Corrigé

- Les lectures relient désormais automatiquement la feuille Google
  existante à l'installation qui ne la connaissait pas encore. Aucune
  feuille n'est jamais recréée : seule une feuille déjà présente dans le
  Drive connecté est reliée.
- Si une feuille est réellement introuvable, l'index des classes le dit
  explicitement (avec la marche à suivre) au lieu d'afficher « aucune
  classe ».

## Vérifications

- compilation complète de l'application (Sites et desktop) réussie ;
- lint et vérification des types sans nouvelle erreur ;
- build production (`npm run build`) réussi.
