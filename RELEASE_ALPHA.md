# Eraser 0.1.1-alpha.178 — Toute la table sur la même page

Cette version arrive par la mise à jour sans réinstallation.

## Chaque joueur compte à part pour Google

Toutes les installations utilisent le même compte Google. Google comptait donc toutes leurs
lectures ensemble : environ 60 par minute pour toute la table. Quand cinq joueurs ouvraient
la même campagne au même moment, un seul passait.

Chaque installation se présente maintenant à Google avec son propre identifiant de quota.
C'est un identifiant au hasard, sans rien de personnel, gardé d'un démarrage à l'autre.
D'après la documentation de Google, chacune devrait ainsi avoir sa propre part : environ
60 lectures par minute par joueur au lieu de 60 pour tous. Si Google ne l'appliquait pas,
rien ne changerait par rapport à avant.

Quand plusieurs installations sont refusées au même moment, elles ne réessaient plus toutes
à la même seconde : leurs pauses sont décalées au hasard.

## Une page ne s'effondre plus pour une seule lecture refusée

- **Page de campagne** : si les PNJ du groupe ne peuvent pas être lus, seule leur carte le
  dit (« arrivent dans un instant ») et la page les relit d'elle-même 15 secondes plus tard.
  Les personnages, l'inventaire et le reste s'affichent normalement.
- **« Impossible d'afficher cette page »** (et la même chose pour une fiche) :
  - la page réessaie d'elle-même une fois, au bout de 10 secondes, avec un compte à rebours ;
  - **Réessayer** relit vraiment les données. Avant, il réaffichait la même erreur.
