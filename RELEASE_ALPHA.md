# Eraser 0.1.1-alpha.27 — fin de l'audit « qu'est-ce qui reste local ? »

L'alpha.26 a déplacé les visuels et les liens d'identité sur le partagé.
Cette version termine l'inventaire, en repartant cette fois de **toutes**
les formes de stockage et non des seules tables : bases locales, stockage
de fichiers, écritures disque directes, mémoire du navigateur.

## Corrigé

- **Le script Google des images de classes** : l'app notait dans sa base
  locale qu'un script était déjà installé sur la feuille partagée. Chaque
  autre installation, ne le sachant pas, en créait un second sur la même
  feuille. Cette information vit maintenant sur le serveur partagé.

## Inventaire complet

Stockage de fichiers (portraits, bannières, fonds de carte) : partagé
depuis l'alpha.26. Écritures disque hors de ce stockage : aucune.
Mémoire du navigateur : uniquement des préférences d'affichage (onglet
ouvert, dernier personnage sélectionné) — rien qui concerne les autres.

Tables : comptes, sessions, connexion Google, liens d'identité et script
Google sont partagés. Les index (personnages, campagnes, classes,
liaison des feuilles) sont des caches dont la source de vérité est
Google Sheets, et ils se resynchronisent seuls depuis l'alpha.24/25.
Tables inutilisées : to-do administration, connexions Drive.

## Reste local, volontairement, avec sa conséquence

- **L'état temporaire de connexion Google** (quelques minutes) : il est
  lié au navigateur qui ouvre la fenêtre d'autorisation, sur cette
  machine. Le partager serait un risque inutile.
- **Le lien Roll20 d'une campagne** : le compagnon Chrome parle au
  serveur local de l'ordinateur où tournent Eraser et Roll20, et cette
  route n'accepte volontairement aucune authentification par compte.
  Conséquence assumée : un lien créé sur un ordinateur n'apparaît pas
  depuis un autre, et en recréer un ailleurs invalide le premier.

## Vérifications

- compilation complète de l'application (Sites et desktop) réussie ;
- lint et vérification des types sans nouvelle erreur ;
- build production (`npm run build`) réussi.
