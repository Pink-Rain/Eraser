# Eraser 0.1.1-alpha.22 — comptes et propriétaires réparés

L'alpha.21 (annuaire de comptes partagé) laissait plusieurs écrans
d'administration comparer les comptes réels — qui vivent désormais sur le
Worker de comptes partagé — à la table locale `users`, restée vide. Cette
version corrige les conséquences les plus gênantes.

## Corrigé

- **Réattribuer un personnage ou une campagne échouait toujours**, y
  compris en choisissant son propre compte, avec le message « Ce compte
  n'existe plus » : la vérification comparait le compte choisi à la table
  locale vide au lieu de l'annuaire de comptes réel.
- **« Toutes les campagnes » et « Tous les personnages » affichaient les
  vrais comptes comme des « Identifiant historique »** (avec un
  identifiant technique à la place du nom) pour la même raison.

## Ajouté

- **Suppression de compte** : un administrateur peut maintenant supprimer
  un compte utilisateur (sauf le sien, et sauf un compte qui a connecté
  Google Drive ou configuré la connexion Google — il faut d'abord relier
  un autre compte). Les personnages et campagnes de ce compte ne sont pas
  supprimés ; réattribue-les si besoin.
- Retiré la fonctionnalité « changer le mot de passe d'un compte » côté
  administration (bouton, route et Worker de comptes).

## Non résolu, en attente d'informations

- Un administrateur ne voit toujours pas l'index des classes le temps que
  la mise à jour se propage à son installation — sera revisité si le
  problème persiste après cette version.
- L'ajout d'un personnage joueur à une campagne pouvait échouer quand la
  campagne appartenait à un identifiant historique non réattribué : à
  revérifier maintenant que la réattribution fonctionne.

## Vérifications

- compilation complète de l'application (Sites et desktop) réussie ;
- lint et vérification des types sans nouvelle erreur ;
- build production (`npm run build`) réussi.
