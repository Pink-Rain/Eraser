# Eraser 0.1.1-alpha.37 — écritures des magasins sur des lignes déterminées

Cette préversion corrige l’écriture elle-même. Les préversions précédentes
fiabilisaient la relecture ; l’inspection de la feuille « Magasins » du Drive
partagé montre que le problème se situait en amont.

## Constat sur la feuille réelle

- la feuille ne contient aucune ligne `latest:` : les derniers tirages de
  campagne n’y sont jamais arrivés ;
- aucune ligne de magasin n’y a été écrite depuis le 20/09, alors que les
  feuilles PNJs, Campagnes et Relations ont bien été écrites depuis ;
- les lignes libérées par une suppression ou un remplacement sont blanchies et
  non retirées : la feuille est trouée (lignes vides au milieu des données).

## Cause corrigée

- les nouvelles lignes étaient confiées à `values.append`, qui doit deviner
  seul où s’arrête le « tableau » à l’intérieur de `A:L`. Sur une feuille
  trouée, cette détection n’est pas fiable, et le contrôle de cohérence
  d’Eraser rejetait alors l’écriture entière ;
- la relecture par `values:batchGetByDataFilter` renvoie la plage réellement
  lue, mais le numéro de ligne d’un magasin restait déduit d’une constante
  (`index + 2`). Une lecture décalée faisait écrire par-dessus la ligne
  voisine ;
- la vérification d’écriture relisait uniquement la plage renvoyée par Google,
  donc un autre chemin que celui de l’affichage : le serveur pouvait annoncer
  un succès pendant que la liste rechargée restait vide.

## Changements

- les nouvelles lignes réutilisent explicitement les lignes libres déjà
  repérées à la lecture ; `values.append` ne reçoit plus que le surplus ;
- le numéro de ligne est déduit de la plage que Google déclare avoir lue ;
- la vérification d’écriture emprunte la même plage `A2:L` que
  `listSavedShops` et `listLatestShops`, et transporte les plages écrites dans
  son code d’erreur ;
- le diagnostic d’écriture (Administration › Google Drive › « Tester aussi
  l’écriture ») contrôle désormais que la ligne témoin est visible dans la
  plage que l’application relit, et que les deux numéros de ligne concordent ;
- `deleteSavedShops` échappe le nom d’onglet et écrit en `RAW`, comme le reste
  du chemin magasins.

## Vérifications

- lint, build Vinext et suite de tests (dont un test sur la déduction du
  numéro de ligne à partir de la plage renvoyée par Google) ;
- build desktop et vérification du serveur embarqué.
