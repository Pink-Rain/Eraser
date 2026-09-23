# Eraser 0.1.1-alpha.55 — trier et filtrer comme dans Sheets

## Tous les index

- **Clic droit sur le nom d’une colonne** : un menu comme celui de Google
  Sheets, sans les couleurs.
  - « Trier de A à Z », « Trier de Z à A », et « Retirer le tri ».
  - **Filtrer par condition** : cellule vide ou non vide, le texte contient, ne
    contient pas, commence par, se termine par, est exactement, et
    supérieur / inférieur / égal à (en nombres quand c’est possible).
  - **Filtrer par valeurs** : la liste des valeurs de la colonne à cocher, avec
    recherche, « Sélectionner les N – Effacer » et « Affichage de N ».
  - Une colonne filtrée porte un petit entonnoir. La barre d’outils indique
    « N lignes sur M » avec « Retirer les filtres ». Les filtres restent en
    place d’une visite à l’autre.
- **Clic droit sur la poignée d’une ligne** : « Ajouter une ligne » et
  « Ajouter plusieurs lignes… » (on choisit combien). Les lignes vides arrivent
  juste sous la ligne choisie. Dans l’Index des classes, ce sont des sorts
  « Nouveau sort » à renommer ; dans l’Index des PNJs, des « Nouveau PNJ ».
- **Une ligne sur deux est à peine teintée**, pour suivre une ligne d’un coup
  d’œil.
- Une ligne vide entre deux lignes remplies reste affichée, comme dans Sheets.

## Index des PNJs

- Le nom prend son **s** : « Index des PNJs ».
- Deux onglets : **PNJs** et **PNJs Génériques**.
- Colonne **Campagnes**, remplie toute seule : les campagnes où figure un PNJ du
  même nom. Un clic ouvre la campagne. En vue administrateur, ou pour le MJ de
  la campagne, elle s’ouvre en mode MJ. Pour un autre MJ, elle s’ouvre en mode
  joueur : sans outils de MJ ni notes privées.
- Colonne **Important**, une case à cocher. Elle correspond à la colonne
  « PNJ important » déjà présente dans la feuille « PNJs ».

## Vérifications

- dans un vrai navigateur : tri A→Z et Z→A depuis l’en-tête, filtre par
  valeurs, filtre par condition (« Rang supérieur à 3 »), entonnoir et
  compteur, lignes alternées, ajout de trois lignes sous la ligne choisie ;
  Index des PNJs avec ses deux onglets, liens de campagne en mode MJ et
  joueur, case « Important » enregistrée, « Nouveau PNJ » ajouté dans l’onglet
  des génériques ;
- lint sans erreur, 20 tests d’interface au vert, serveur desktop vérifié en
  HTTP 200.
