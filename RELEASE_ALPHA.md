# Eraser 0.1.1-alpha.182 — Cinq joueurs sur la même page en même temps

Cette version arrive par la mise à jour sans réinstallation.

## Le problème

Toutes les installations lisent Google Sheets avec le même compte : un seul quota de
requêtes par minute pour toute la table. Quand les cinq joueurs ouvraient la campagne au même
moment, chaque installation relisait les mêmes feuilles (index, personnages, PNJ, objets…).
Le quota s'épuisait dès la première page : un joueur voyait la campagne, les quatre autres
n'arrivaient pas à lire le sheet et devaient attendre leur tour, une minute chacun.

## Les installations se partagent leurs lectures

Quand plusieurs joueurs ouvrent la même page, une seule installation lit Google ; les autres
reprennent sa copie par le serveur partagé d'Eraser au lieu de relire la même chose.

- Une copie sert au plus 45 secondes.
- Une modification faite dans Eraser, depuis n'importe quel PC, rend aussitôt les copies de
  ce classeur inutilisables pour tout le monde.
- Les lectures qui précèdent une écriture (trouver la bonne ligne, la bonne colonne) sont
  toujours faites directement dans Google.
- Si le serveur partagé ne répond pas, chaque installation lit Google comme avant.

Google Sheets reste la source : le serveur partagé ne garde qu'une copie de passage.

## « Actualiser » (F5) ne relit que la page affichée

Actualiser relit dans Google ce que la page affiche, et rien d'autre : les autres pages
restent en mémoire. Les joueurs gardent aussi les règles (classes, sorts, index) ;
l'administrateur et le MJ, eux, relisent toujours tout, puisque ce sont eux qui les modifient.

Après Actualiser, la page montre Google tel qu'il était au moment du clic : une copie d'avant
le clic n'est jamais reprise. Une case modifiée directement dans Google Sheets apparaît donc
aussitôt.

## Mesures

Testé avec cinq installations séparées, une par joueur, qui partagent un seul quota Google :

| Situation | alpha.181 | alpha.182 |
|---|---|---|
| Début de séance : les cinq ouvrent la campagne en même temps | 60 requêtes, 4 refus de Google, un joueur sans campagne, les autres après 75 à 85 s | **10 requêtes, aucun refus, les cinq pages ensemble** |
| Puis les cinq ouvrent leur fiche | 55 requêtes de plus, 16 refus | **34 requêtes, aucun refus** |
| Les cinq actualisent la campagne au même instant | 50 requêtes | **8 requêtes**, environ 2 s |
| Les cinq actualisent la campagne à quelques instants d'écart (sur 2 s) | — | **25 requêtes**, aucun refus |
| Les cinq actualisent leur fiche | 49 requêtes | **17 requêtes**, environ 2 s |
| Les cinq passent de leur fiche à la campagne | 20 requêtes | **5 requêtes**, moins d'une seconde |

## Aussi

- Les en-têtes des index ne sont plus revérifiés toutes les 12 heures mais une fois par
  semaine : chaque séance ne commence plus par cette vérification sur les cinq PC à la fois.
- Un refus de Google pendant une lecture partagée n'envoie plus une seconde requête.
