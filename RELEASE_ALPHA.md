# Eraser 0.1.1-alpha.139 — Feuille par feuille : chaque écriture à la bonne place

Cette version arrive par la mise à jour sans réinstallation. Elle corrige les causes des
dégâts constatés dans les feuilles : lignes écrites dans la mauvaise colonne, lignes
voisines modifiées ou supprimées, cases vidées par une copie dépassée. Elle ne modifie
aucune donnée existante : ce qui est déjà abîmé se répare à la main, une fois cette
version installée sur tous les PC.

## Partout

- **Les lignes ajoutées tombent toujours en colonne A**, sous la dernière ligne remplie.
  Google devinait lui-même où commençait le « tableau » : 18 pions et 183 magasins ont été
  écrits en colonne J ou K, invisibles pour Eraser.
- Un ajout ou une suppression de ligne n'est plus rejoué après une erreur de Google
  (ligne ajoutée deux fois, ligne suivante supprimée).
- Le texte saisi reste du texte : « - se méfie de lui » ou « =A1 » ne deviennent plus des
  formules (« #ERROR! »).
- Les nombres d'une feuille réglée en français (« 1,25 ») sont lus correctement.
- Les colonnes lues ensemble restent alignées : la vie, le joueur ou la classe d'un
  personnage ne sont plus attribués à son voisin.
- Une colonne « ID », « Joueur », « Nom personnage », « MJ » ou « Nom de la campagne »
  renommée dans Sheets n'est plus recréée vide à droite.
- Un onglet renommé à la main n'est plus remplacé par un onglet vide, et une feuille déjà
  présente dans le Drive n'est jamais recréée sous le même nom.

## Campagnes, PNJ, magasins, sessions, tabletop

- Modifier une campagne n'écrit que ce qui change : un MJ ajouté ailleurs n'est plus
  effacé. Créer deux fois avec le même formulaire ne fait qu'une campagne.
- Seule une ligne entièrement vide est réutilisée dans « Magasins » ; ajouter à la session
  ne réécrit plus tout le magasin, et un magasin renommé depuis cette fenêtre garde son
  nouveau nom.
- Déplacer un PNJ ne perd plus 10 colonnes ; copier reprend toute la ligne (décimales et
  cases à cocher comprises) ; la vie, le portrait ou l'ajout à la session n'écrivent que
  leur case. Un PNJ supprimé ailleurs n'est plus recréé.
- Sessions : deux ajouts simultanés restent ; une liste illisible n'est plus remplacée par
  une liste vide.
- Tabletop : seule la case qui change est écrite (pion, carte, vie d'un personnage ou d'un
  PNJ).
- To-do et vocabulaire : la bonne ligne, relue juste avant d'écrire ou de supprimer.
- Fouilles : une lecture ratée n'efface plus les tirages enregistrés.

## Fiches et index des personnages

- La fiche est relue et son ID vérifié avant chaque écriture ; une colonne déplacée ou
  insérée ailleurs fait refuser l'enregistrement au lieu d'écrire dans la voisine.
- Les cases « Sorts de classe choisis » et « Onglets personnalisés » modifiées ailleurs ne
  sont plus écrasées. Un tel conflit n'abandonne plus que ces cases : les autres
  modifications en cours sont enregistrées, et l'avertissement nomme ce qui manque.
- « Ajouter une copie séparée » copie la fiche avec ses formules, et seulement si demandé ;
  une copie qui échoue en route ne laisse plus de fiche vide.
- Index des personnages : importer un portrait marche de nouveau, depuis la colonne comme
  depuis la fiche de ligne.

## Classes et sorts, objets et inventaires, index

- Sorts : chaque modification, liaison, suppression ou fusion retrouve le sort par son ID
  et n'écrit que ce qui a changé ; plus jamais d'ID « LIGNE-… » écrit dans la feuille. Les
  ID automatiques ne sont donnés que dans une vraie colonne « ID ».
- Inventaires : une modification à la fois, relue juste avant ; plus de contenants en
  double ; un déplacement est écrit d'un seul coup.
- Index des objets : chaque ligne par son ID, chaque colonne par son en-tête. Une ligne
  sans ID ni nom se remplit et se supprime de nouveau ; « Modifier » peut nommer une
  colonne sans en-tête.
- Index du monde et index personnalisés : chaque écriture vise la ligne et la case vues,
  relues juste avant. Mettre un index à la corbeille n'écrit plus que « Supprimé le ».
- Le script Google des images de classes n'est plus recréé (57 projets en double).

## Visuels

- Portraits, bannières, cartes et icônes restent où ils sont (« Images classes ») : Eraser
  les cherche aussi dans leur ancien dossier. Rien à déplacer.

## Nettoyage

- Retirés : routes et fonctions sans appelant (réinitialisation des classes à des lignes
  fixes, synchronisation manuelle des images, réécriture d'une ligne d'objet entière,
  ligne témoin laissée par le diagnostic d'écriture, une trentaine de fonctions et
  constantes que rien n'utilisait).
