# Eraser 0.1.1-alpha.77 — État des classes, bonus de rang, suppression depuis les index

Cette version arrive par la mise à jour sans réinstallation.

## Index des personnages et des campagnes

- Chaque ligne a un bouton **Supprimer** (administrateur : tout ; MJ : ses propres
  campagnes et personnages). L’élément part à la corbeille, avec confirmation.
- La corbeille est désormais **partagée** : un personnage ou une campagne mis à la
  corbeille disparaît sur toutes les installations, pas seulement sur la tienne. La
  restauration et la suppression définitive (Administration → Corbeille) suivent
  aussi partout.
- Rien n’est effacé de Google Sheets avant la suppression définitive.

## Règles › Classes : finition calculée

- Le pourcentage de finition est calculé à partir des sorts réellement liés : 3 sorts
  sur chacun des 21 rangs (rang commun et rangs 1 à 20). Un sort sans nom, sans
  effet ou sans type compte pour moitié ; un 4ᵉ sort sur un rang ne compte pas.
- La colonne « Finition » de la feuille « Classes » ne sert plus (seulement en
  secours si les sorts sont momentanément illisibles).

## Index › Sorts des classes

- **Nouvel onglet « État des classes »**, en premier et ouvert par défaut :
  - toutes les classes d’un coup d’œil : les 21 rangs en couleur (3 sorts, incomplet,
    vide, plus de 3 sorts), la finition, ce qui reste à faire ;
  - les classes sans aucun sort sont regroupées à part ;
  - un menu déroulant pour voir une classe en détail : rangs vides, rangs
    incomplets, rangs à 4 sorts ou plus (avec leurs noms), sorts à terminer (sans
    nom, sans effet ou sans type). Un clic ouvre la classe au bon rang dans « Par
    classe ».
- **Nouvel onglet « Bonus Rang »**, en dernier : les bonus gagnés à chaque rang, les
  mêmes pour toutes les classes. Ils se remplissent dans Google Sheets, dans le
  nouvel onglet « Bonus de rang » du classeur « Sorts de classe » (une ligne par
  rang, créé à la première ouverture, jamais réécrit ensuite). Chaque colonne ajoutée
  devient un bonus.
- Les bonus s’affichent sous le titre de chaque rang, au-dessus du choix des sorts,
  dans Règles › Classe et sur la fiche de personnage (onglet des sorts de classe).

## Vérifications

- dans un vrai navigateur, sur les vrais sorts : état de toutes les classes, détail
  d’une classe, ouverture au bon rang, onglet Bonus Rang, bonus affichés sur la
  progression de la fiche ;
- sur une copie simulée du classeur : onglet « Bonus de rang » créé une seule fois,
  jamais réécrit, colonnes ajoutées relues comme bonus ;
- lint sans erreur, 29 tests au vert, build et serveur desktop vérifiés.
