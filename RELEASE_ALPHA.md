# Eraser 0.1.1-alpha.181 — Tout le monde actualise en même temps

Cette version arrive par la mise à jour sans réinstallation.

## Cinq joueurs sur la même page au même moment

Testé avec cinq installations séparées, une par joueur, qui partagent un seul quota Google
(le cas le plus défavorable) :

| Situation | Avant | Maintenant |
|---|---|---|
| Les cinq passent de leur fiche à la campagne en même temps | 20 requêtes, aucun refus | inchangé |
| Les cinq actualisent la campagne (F5) en même temps | 50 requêtes, aucun refus | inchangé |
| Les cinq actualisent leur fiche (F5) en même temps | 65 requêtes, 5 refus de Google | **49 requêtes, aucun refus** |

Dans tous les cas, la page s'affiche en environ une seconde.

## « Actualiser » d'un joueur relit ce qui change pendant la partie

Quand un joueur actualise (bouton ou F5), Eraser relit tout ce qui bouge pendant une partie :
fiches, inventaires, campagne, personnages, PNJ.

Les règles (classes, sorts, spécificités de classe, bonus de rang, index et leurs réglages)
restent en mémoire et se mettent à jour d'elles-mêmes au bout de quelques minutes. Cinq
joueurs qui actualisent ensemble, pour voir ce que le MJ vient d'ajouter, ne relisent donc
plus toutes les règles en même temps.

L'administrateur et le MJ, eux, relisent toujours tout en actualisant : ce sont eux qui
modifient les règles, parfois directement dans Google Sheets.
