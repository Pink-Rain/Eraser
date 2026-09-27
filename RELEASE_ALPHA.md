# Eraser 0.1.1-alpha.76 — Plus de comptes « Test interface installée »

Cette version passe par l’installateur, en mode silencieux : l’enveloppe Windows
d’Eraser change (`eraserShell` 3). Rien à faire de ton côté.

## Ce qui n’allait pas

À chaque construction de l’application, GitHub installe Eraser sur une machine
Windows et vérifie qu’on peut créer un compte et ouvrir une session. Ce test
créait un vrai compte « Test interface installée » dans l’annuaire partagé, et ne
le supprimait jamais : un compte de plus dans l’administration à chaque version
publiée.

## Ce qui change

- Le test d’installation supprime son compte dès la vérification faite.
- Filet de sécurité : si un test s’interrompt avant, le serveur de comptes efface
  de lui-même les comptes de test restés plus d’une heure. Seuls sont concernés
  les comptes `interface-installee-…@eraser.local` encore en attente et sans rôle.
- Un compte peut se supprimer lui-même seulement tant qu’il est **en attente** et
  sans rôle. Un compte actif ne se supprime toujours que depuis l’administration.

## Rappel de l’alpha.75

- Les sorts se lient aux classes qui n’avaient pas encore de colonne dans
  « Sorts de classe » (Druide, Rôdeur·euse…) : la colonne est ajoutée
  automatiquement.
- Onglet « Doublons » : bouton « Pas un doublon » par sort dans les groupes de
  trois ou plus.

## Vérifications

- purge testée sur une copie SQLite de l’annuaire : seul le compte de test ancien
  et en attente disparaît (compte de test récent, compte validé et vrai compte
  en attente conservés) ;
- serveur desktop : un compte en attente se supprime et ne peut plus se
  connecter ; un compte administrateur ne peut pas se supprimer lui-même ;
- lint sans erreur, 29 tests au vert, build et serveur desktop vérifiés.
