# Eraser 0.1.1-alpha.10 — cause réelle des pages Drive corrigée

Cette version corrige la vraie cause des erreurs sur « Toutes les campagnes »,
« Tous les personnages », « Magasins » et « PNJs » : un nom d’onglet Google
Sheets contenant des espaces (« Personnages par campagne ») n’était pas mis
entre quotes dans les requêtes envoyées à l’API Sheets, ce qui faisait
échouer toute lecture ou écriture de liaison campagne / personnage — et donc
plantait ces quatre pages pour les comptes administrateur.

## Corrigé

- la feuille qui relie les personnages à leurs campagnes est de nouveau
  lisible et inscriptible : les quatre pages concernées se chargent
  normalement ;
- lier un personnage à une campagne écrit désormais réellement la liaison
  dans Google Sheets, au lieu d’échouer silencieusement ;
- une feuille reliée mais restée vide (ses en-têtes n’ayant jamais pu être
  écrites à cause du même bug) se répare automatiquement, sans jamais
  toucher une feuille contenant déjà des données ;
- la synchronisation des index de propriété (campagnes, personnages,
  liaisons) tolère désormais l’échec de lecture d’une feuille isolée au lieu
  de faire planter toute la page.

## Vérifications

- compilation complète de l’application réussie ;
- lint sans erreur ;
- serveur Windows autonome construit et vérifié en HTTP 200 ;
- formulaires de compte, session administrateur et flux OAuth vérifiés par le
  test du paquet Windows ;
- pages « Toutes les campagnes », « Tous les personnages » et « Index des
  classes » revérifiées en HTTP 200 sur le serveur autonome.
