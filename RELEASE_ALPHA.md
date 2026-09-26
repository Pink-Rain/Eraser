# Eraser 0.1.1-alpha.74 — Personnages et campagnes : le circuit réparé

Cette version arrive par la mise à jour sans réinstallation. Rien à changer côté
Roll20.

## Ce qui n’allait pas

Chaque installation d’Eraser garde une copie locale de la liste des personnages,
des campagnes et des liens « personnage ↔ campagne ». Cette copie n’était relue
dans Google Sheets que lorsqu’elle était vide ou qu’un personnage y manquait :

- un MJ ne voyait pas les personnages créés par les joueurs après sa première
  synchronisation (un autre MJ, lui, pouvait les voir) ;
- un joueur ne voyait jamais sur sa fiche la campagne où un MJ l’avait ajouté,
  même après actualisation ;
- ajouter à une campagne un personnage déjà dans une autre campagne en créait
  une **copie** par défaut : la campagne recevait la copie, pas le personnage du
  joueur.

## Ce qui change

- Les listes de personnages et de campagnes se remettent à jour depuis Google
  Sheets au plus une fois par minute, et relisent la feuille directement (sans
  cache). Une page n’attend jamais plus de 2,5 secondes : au-delà, elle s’affiche
  et la mise à jour finit en arrière-plan.
- « Ajouter » un personnage à une campagne relit les feuilles à chaque
  ouverture : un personnage tout juste créé par un joueur y apparaît. Ceux déjà
  dans la campagne ne sont plus proposés.
- Un personnage peut être dans **plusieurs campagnes** : l’ajouter ne le copie
  plus. La case « Ajouter une copie séparée » reste disponible, décochée.
- Un personnage retiré d’une campagne disparaît aussi de cette campagne chez le
  joueur. La feuille « Personnages des campagnes » fait foi. Elle n’est prise en
  compte que si elle a bien été lue, pour qu’une panne réseau ne vide jamais la
  liste.
- Créer une campagne ou un personnage ne peut plus partir deux fois (double
  Entrée ou double clic).

## À savoir

- Les liens déjà enregistrés dans Google Sheets apparaîtront d’eux-mêmes après la
  mise à jour, chez le MJ comme chez les joueurs.
- Si un ajout précédent a créé une copie du personnage dans une campagne, la
  copie reste : tu peux la retirer de la campagne et ajouter le personnage
  d’origine.

## Vérifications

- la feuille « Personnages des campagnes » a été relue dans le Drive pour
  confirmer le diagnostic ;
- lint sans erreur, tests au vert, build et serveur desktop vérifiés en HTTP 200.
