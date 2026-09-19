# Eraser 0.1.1-alpha.11 — instructions Roll20 corrigées

Vérification complète du compagnon Chrome et du script Mod Roll20 : le zip
distribué est bien identique aux sources, les numéros de version du
compagnon et du script correspondent (0.4.0) et le protocole d'échange entre
les deux est cohérent de bout en bout. Une instruction obsolète a été
corrigée au passage.

## Corrigé

- le panneau d'installation Roll20 d'une campagne indiquait d'attendre le
  message « Eraser Bridge 0.3.1 prêt » dans la console Mod, alors que le
  script actuel (v0.4.0) affiche « Eraser Bridge 0.4.0 prêt » — corrigé pour
  éviter toute confusion pendant l'installation.

## Vérifications

- compilation complète de l’application réussie ;
- lint sans erreur ;
- serveur Windows autonome construit et vérifié en HTTP 200 ;
- fichiers du compagnon Roll20 (`eraser-roll20-companion.zip`,
  `eraser-bridge.mod.js`) confirmés servis en HTTP 200 et identiques à leurs
  sources dans `integrations/roll20/`.
