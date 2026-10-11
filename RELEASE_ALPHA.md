# Eraser 0.1.1-alpha.201 — Liens à ouvrir dans l'app, raretés en liste, stats épinglées vivantes

Cette version passe une fois par l'installateur, en silence : Eraser apprend à Windows
à ouvrir les liens « eraser:// ». Rien n'est écrit dans Google Sheets à l'installation.

## Liens « à la Discord »

- **Copier le lien** d'une page donne maintenant un lien qui, ouvert par quelqu'un d'autre,
  propose d'**ouvrir la page dans l'application** (et l'essaie tout seul), avec « Continuer
  dans le navigateur » en secours.
- Si Eraser est déjà ouvert, le lien arrive dans la fenêtre existante, sur la bonne page.
- Eraser ouvert dans un navigateur : une petite bulle propose de passer dans l'application.
  « Rester ici » la fait taire jusqu'à la fermeture de l'onglet.
- Seules les adresses de pages d'Eraser sont acceptées ; la page d'ouverture n'affiche
  aucune donnée.

## Index des items : raretés

- **Rareté principale** et **Rareté secondaire** sont des listes à pastilles colorées :
  Très commun, Commun, Rare, Très rare, Ultime (couleurs de la fouille et des magasins).
- Une autre rareté se tape dans la case : elle rejoint la liste.
- Rien n'est réécrit dans la feuille. Une colonne déjà réglée dans « Modifier » garde son type.

## Onglet stat : les stats épinglées

- Chaque stat montre ses **lignes concernées**. Un clic sur une part du graphique les
  restreint ; un clic sur une ligne **ouvre sa fiche**, qui passe ensuite d'une ligne
  concernée à l'autre (Index des items compris).
- **Organiser** : la largeur de chaque stat (auto, ⅓, ½, ⅔, pleine ligne), son ordre, ses
  lignes affichées, repliées ou masquées. Tout s'enregistre aussitôt.
- Les blocs gardent leur propre hauteur ; l'anneau range sa légende dessous quand la place
  manque.
