# Eraser 0.1.1-alpha.241 — Des clics qui répondent tout de suite

Cette version arrive **sans réinstallation** (enveloppe 10, comme l'alpha 238) : Eraser la
télécharge, redémarre son serveur et recharge la page tout seul. Rien n'est modifié dans Google
Sheets.

## Changer de page : tout de suite

- **Chaque page n'a plus qu'une copie.** Le routeur rangeait une page visitée sous la page d'où
  l'on venait : vue en venant de l'accueil, elle n'était jamais resservie en venant d'ailleurs.
  Presque chaque clic repartait donc au serveur. Une page revue s'affiche maintenant aussitôt.
- **Les copies durent 30 minutes** (au lieu de 5). Une copie d'avant une modification, ou de plus
  d'une minute, s'affiche quand même tout de suite, puis la page se relit en arrière-plan et se
  met à jour seule, sans squelette.
- **Écrire n'oublie plus toutes les pages** : seule celle où l'on vient d'écrire est relue.
- **Un lien visé se prépare** : dans la barre latérale, un lien survolé un instant précharge sa
  page ; le clic, qui suit, la trouve prête. Mesuré processeur bridé comme un petit portable :
  700 à 1 060 ms → 335 à 470 ms. Un clic pendant le préchargement reprend sa réponse au lieu
  d'en redemander une.

## Des boutons qui ne font plus attendre

- **Inventaire** : +, − et « Retirer » s'affichent aussitôt ; plusieurs clics rapides partent en
  une seule écriture, et les autres boutons restent cliquables.
- **Journal** : cocher une quête, supprimer une note.
- **Créateur de session** : ajouter ou retirer un joueur, un PNJ, un magasin, sans bloquer la
  page.
- **Relations** : niveau, note, suppression.
- **PNJ** : entrer dans le groupe, en sortir, supprimer.
- **Tableau de bord de campagne** : cacher un personnage, titre et description.
- Si Google refuse, la chose revient comme elle était et le message dit pourquoi.

## Les gros index ne figent plus

Mesuré sur un banc qui reproduit Eraser avec de vraies quantités (1 800 items, 200 PNJ,
40 personnages…) et un processeur bridé comme un petit portable.

- **Index des PNJ** : chaque case de sorts redemandait la liste des sorts au serveur, qui relisait
  Google et recherchait les doublons à chaque fois — 240 demandes identiques à l'ouverture. Une
  seule maintenant, servie depuis la mémoire.
- **Cases à cocher** : la coche de chaque case relisait les styles de la page en apparaissant. Un
  index à cases cochées les recalculait des milliers de fois ; la coche est désormais dessinée
  sans ce détour.
- **Nombres et prix** : mis en forme sans recréer leur format ni relire les unités à chaque case.
- **Tableau ↔ Cartes** : le bouton change tout de suite, la nouvelle forme se prépare sans geler
  l'écran.
- **Tableaux** : 40 lignes d'emblée (un écran et demi), les suivantes par petites tranches en
  arrière-plan, à mesure qu'on fait défiler.
- **Onglet Inventaire** : chaque contenant triait tout le catalogue des items à l'ouverture, même
  recherche fermée ; il ne le fait plus qu'en cherchant.
- **Tris** : les tris alphabétiques des index, des formules et des statistiques ne recréent plus
  leur règle de comparaison à chaque paire.

Sur ce banc : Fiche → Items 8,6 s → 2,3 s ; Items → PNJ 7,6 s → 2,0 s ; Tableau ↔ Cartes
7,8 s → 0,3 s ; ouverture complète de l'index des items 15 s → 6,4 s, des créatures 6,5 s → 0,9 s.

## Un écran plus léger

- **React Compiler** : chaque composant ne se redessine plus que si ce qu'il montre a changé.
- **Mode « Allégés » réparé** : une règle de l'alpha 238 rendait chaque calcul des styles un
  tiers plus lent, justement sur les petits portables.
- Les infobulles de la barre latérale ne se calculent plus quand elle est dépliée.
- Les longues pages ne dessinent leurs sections du bas qu'en s'en approchant.

## Données prêtes

- Peu après l'ouverture d'Eraser par un MJ ou un administrateur, les index se lisent en
  arrière-plan : leur première ouverture est immédiate.
- Une page revue au cours d'une longue séance (jusqu'à six heures) s'affiche tout de suite et se
  relit derrière, au lieu d'attendre Google. Aucune lecture Google de plus. « Actualiser » (F5)
  relit toujours tout de suite.

## Mesurer chez soi

- Administration › Google Drive et Sheets › **Fluidité de cet ordinateur** : les clics lents, les
  gels de l'écran, le temps de chaque page et les attentes du serveur, gardés sur cet ordinateur.
  « Copier le relevé » permet de l'envoyer pour viser la prochaine lenteur.
