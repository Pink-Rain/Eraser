# Eraser 0.1.1-alpha.9 — pages qui plantent, fiche personnage plus fiable

Cette version corrige des pages qui affichaient une erreur brute ou un écran
vide, accélère l’Index des classes et rend la fiche personnage plus robuste
face aux clics rapides et répétés.

## Corrigé

- une page dont le chargement échoue (par exemple une réponse Google Sheets
  ou Google Drive momentanément indisponible) affiche désormais un message
  clair avec un bouton « Réessayer » au lieu d’une erreur brute ou d’un
  écran vide ;
- l’Index des classes se charge beaucoup plus vite : la détection des sorts
  en double ne refait plus le même travail de comparaison pour chaque paire
  de sorts ;
- les boutons +/- de la fiche personnage (Notoriété, Moralité, Folie,
  Destin, Niveau…) n’affichent plus de valeur qui « recule » toute seule
  après des clics rapprochés : les écritures sont désormais mises en file
  et seule la plus récente est appliquée à l’écran.

## Vérifications

- compilation complète de l’application réussie ;
- lint sans erreur ;
- serveur Windows autonome construit et vérifié en HTTP 200 ;
- formulaires de compte, session administrateur et flux OAuth vérifiés par le
  test du paquet Windows.
