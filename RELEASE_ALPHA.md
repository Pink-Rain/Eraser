# Eraser 0.1.1-alpha.8 — récupération des campagnes et personnages

Cette version permet à l’administration de retrouver toutes les campagnes et
tous les personnages présents dans les feuilles Google, y compris ceux qui
n’ont plus de propriétaire reconnu par l’application Windows.

## Ajouté

- les pages « Toutes les campagnes » et « Tous les personnages » relisent les
  feuilles Google avant d’afficher leur contenu ;
- les lignes sans propriétaire sont désormais importées et visibles ;
- les anciens identifiants de propriétaire sont signalés clairement ;
- un administrateur peut attribuer une campagne ou un personnage à n’importe
  quel compte local, changer son propriétaire ou le retirer ;
- chaque changement de propriétaire est enregistré dans Google Sheets et dans
  l’index local de l’application ;
- la synchronisation administrative respecte les éléments déjà placés dans la
  corbeille.

## Vérifications

- compilation complète de l’application réussie ;
- lint sans erreur ;
- serveur Windows autonome construit et vérifié en HTTP 200 ;
- formulaires de compte, session administrateur et flux OAuth vérifiés par le
  test du paquet Windows.
