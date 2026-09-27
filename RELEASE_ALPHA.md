# Eraser 0.1.1-alpha.81 — Sorts de classe protégés, portraits retrouvés, « Création de classe »

Cette version arrive par la mise à jour sans réinstallation. **Chacun doit relancer
Eraser (ou accepter la mise à jour) avant de reprendre le travail sur les classes.**

## Sorts de classe : plus aucune modification perdue en silence

- Avant l’alpha.75, lier un sort à une classe sans colonne dans « Sorts de classe »
  (Druide, Rôdeur·euse…) affichait « Enregistré » alors que rien n’était écrit.
  Depuis l’alpha.75, la colonne est créée. Désormais, en plus, si un lien ne peut
  pas être écrit, rien n’est marqué enregistré : un message d’erreur s’affiche.
- « Création de classe » et les pages de classe (pour les MJ) relisent toujours la
  feuille : elles ne montrent plus une copie gardée en mémoire, qui pouvait faire
  réécrire une valeur dépassée par-dessus le travail d’une autre personne.
- Toute écriture refusée est notée dans le journal d’Eraser.

## « Création de classe » dans le menu

- L’ancien index « Sorts des classes » quitte l’Index : il devient **Création de
  classe**, juste au-dessus d’Index dans le menu. L’ancienne adresse y mène toujours.

## Classes des personnages

- **Index des personnages** : nouvelle colonne « Classe » (et rang).
- **Accueil** : les cartes de tes personnages affichent leur classe et leur rang.

## Portraits dans le tableau de bord de campagne

- Des portraits envoyés avant le passage au Drive n’existaient que sur l’ordinateur
  de la personne qui les avait envoyés. Au prochain lancement d’Eraser, chaque
  installation envoie dans le Drive partagé les images qui n’y sont pas encore :
  dès que le joueur concerné relance Eraser, son portrait apparaît pour tous.
- Un portrait donné par lien (image en ligne, fichier Google Drive) s’affiche
  maintenant aussi dans le tableau de bord, l’accueil et les sessions, comme sur la
  fiche.

## Vérifications

- feuille « Sorts de classe » relue dans le Drive pour le diagnostic ;
- envoi des anciennes images testé sur un stockage simulé : seule l’image absente
  du Drive est envoyée, une seule fois, sans rien supprimer ;
- lint sans erreur, 29 tests au vert, build et serveur desktop vérifiés.
