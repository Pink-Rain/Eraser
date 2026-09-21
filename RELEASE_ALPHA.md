# Eraser 0.1.1-alpha.35 — magasins relus sans cache

Cette préversion corrige la cause commune qui empêchait de retrouver les
derniers tirages, les magasins sauvegardés et les magasins du Créateur de
session après une écriture pourtant acceptée par Google Sheets.

## Cause corrigée

- vinext dédupliquait les lectures Google Sheets identiques dans une même
  requête ; après une écriture, la vérification pouvait donc recevoir la copie
  de la feuille lue avant l’écriture ;
- le cache de lecture serveur et le cache de navigation pouvaient ensuite
  continuer à afficher une liste vide ;
- alpha.34 pouvait afficher un succès à partir des valeurs retournées par le
  POST Google sans avoir réussi une vraie relecture indépendante.

## Changements

- toutes les lectures de la feuille Magasins contournent désormais les caches
  serveur et interrogent directement Google Sheets ;
- la vérification relit strictement chaque plage `updates.updatedRange` et
  conserve `SHOPS_WRITE_NOT_PERSISTED` si la ligne reste introuvable ;
- la réponse d’écriture ne peut plus servir de preuve de persistance à elle
  seule ;
- chaque mutation de magasin invalide le cache de navigation de l’application ;
- la page des magasins sauvegardés n’est plus préchargée avant l’écriture ;
- les erreurs de lecture du dernier tirage et du bac à sable ne sont plus
  transformées silencieusement en listes vides ;
- le diagnostic Magasins utilise lui aussi une vraie relecture non mise en
  cache.

## Vérifications

- dernier tirage et magasins du bac à sable relus par le chemin sans cache ;
- sauvegarde et ajout au Créateur de session vérifiés sur la plage réellement
  écrite ;
- tests CI, lint et build Vinext ;
- build et vérification du serveur desktop ;
- installation Windows vérifiée par le workflow de publication.
