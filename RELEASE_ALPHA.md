# Eraser 0.1.1-alpha.36 — persistance des magasins de bout en bout

Cette préversion remplace le chemin de relecture encore défaillant qui
empêchait de retrouver les magasins après leur écriture dans Google Sheets.

## Cause corrigée

- la relecture sans cache d’alpha.35 utilisait encore le même GET Google
  Sheets ; dans le serveur desktop, ce GET pouvait toujours recevoir le
  résultat antérieur à l’écriture ;
- la ligne était alors introuvable pour le dernier tirage, les magasins
  sauvegardés et le Créateur de session, car les trois vues passent par cette
  même lecture.

## Changements

- les relectures Magasins utilisent désormais le POST officiel Google Sheets
  `values:batchGetByDataFilter`, qui n’est pas cacheable comme l’ancien GET ;
- la vérification continue de relire strictement la plage
  `updates.updatedRange` et conserve `SHOPS_WRITE_NOT_PERSISTED` ;
- après une sauvegarde, Eraser relit la collection des magasins sauvegardés et
  exige d’y retrouver chaque ID ;
- après un ajout au Créateur de session, Eraser exige de retrouver chaque ID
  avec `inCampaign=true` et le bon PNJ lorsqu’il est renseigné ;
- le dernier tirage est relu via une vue API dédiée qui conserve la séparation
  des identifiants `latest:` ;
- les listes affichées sont remplacées par les données réellement relues dans
  Google Sheets, et non par un état local optimiste.

## Vérifications

- format de `batchGetByDataFilter` vérifié contre la documentation Google ;
- test CI couvrant le chemin POST de relecture, la vue `latest` et les
  confirmations distinctes sauvegardé / Créateur de session ;
- lint, build Vinext, build desktop et vérification du serveur embarqué.
