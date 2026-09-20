# Eraser 0.1.1-alpha.25 — audit complet de ce qui restait local

L'alpha.24 corrigeait la liaison des feuilles Google. Cette version
termine le travail : l'audit table par table de tout ce qui reste stocké
localement a révélé deux autres endroits où une installation « neuve »
se comportait comme si les données partagées n'existaient pas.

## Corrigé

- **Les index locaux (personnages, campagnes) ne sont plus crus sur
  parole quand ils sont vides.** Les lectures qui conditionnent l'accès
  relancent une synchronisation avant de conclure « introuvable ». Cela
  débloque, sur une installation jamais synchronisée : l'ouverture d'une
  campagne, l'ajout d'un personnage joueur à une campagne, la liste des
  personnages proposés, les membres d'une campagne, l'ouverture d'une
  fiche de personnage, et l'enregistrement des magasins d'une campagne
  (qui répondait « Accès refusé » parce que la campagne semblait
  inexistante).
- **La table virtuelle restait bloquée sur « préparation »** sur
  l'installation d'un joueur : la préparation était réservée aux MJ et
  administrateurs, alors qu'il s'agit d'une mise en route de
  l'installation, pas d'une action de jeu. Elle relie le classeur
  existant au lieu d'en créer un second.

## Audit

Tables vérifiées une à une : comptes, sessions, liaison des feuilles,
index personnages/campagnes/classes, liens d'identité, to-do
administration, magasins, PNJ, relations, table virtuelle, Roll20,
intégration Apps Script, connexion Google Drive. Restent volontairement
locales : l'état temporaire de connexion Google (sécurité), les
marqueurs de synchronisation, et le pont Roll20 (le compagnon parle au
serveur local de la machine connectée à Roll20).

## Vérifications

- compilation complète de l'application (Sites et desktop) réussie ;
- lint et vérification des types sans nouvelle erreur ;
- build production (`npm run build`) réussi.
