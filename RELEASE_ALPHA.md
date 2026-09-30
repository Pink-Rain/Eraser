# Eraser 0.1.1-alpha.86 — « Modifier » refait, formules, boutons, aléatoire

Cette version arrive par la mise à jour sans réinstallation.

## « Modifier », refait de zéro

La fenêtre a trois volets : les **onglets** à gauche, les **colonnes** au milieu, et les
**réglages de la colonne choisie** à droite. Tous les réglages sont visibles : rien n'est
caché derrière une flèche.

- **Type** : choisi dans des cartes rangées par famille, chacune avec son explication.
  Un cadenas dit pourquoi un type n'est pas proposé.
- **Déplacer** colonnes et onglets en les faisant glisser par leur poignée (⠿), ou
  avec les flèches. Les colonnes bougent aussi dans Google Sheets.
- **Renommer un onglet** d'un double-clic. Un onglet prévu par Eraser est verrouillé,
  avec la raison.
- **Où s'affiche la colonne** : « Tableau et formulaire », « Tableau seulement » ou
  « Formulaire seulement ».
- **Masquée** et **description** au survol de l'en-tête.
- **Résumé des changements** en bas, toujours lisible, avec « Voir le détail ».
- **Guide « ? »** : dans la fenêtre et dans la barre de chaque index (voir plus bas).
- Une colonne verrouillée garde son **affichage** modifiable : style imposé,
  emplacement, masquée, description, place, et passage de Nom à Nom formulaire.

## Des noms plus clairs

- « Texte enrichi » s'appelle maintenant **Texte**.
- « Affichage fixe » devient le **Style imposé**, un réglage possible sur **tous** les
  types :
  - gras, italique, souligné, barré ;
  - couleur du texte, couleur de fond ;
  - taille, police, casse, alignement.

  Sur une colonne Texte, il retire la mise en forme propre à chaque case (le Nom en
  gras, les Compétences en rouge restent tels quels).
- **Nom** et **Nom formulaire** sont deux types au choix. Un Nom formulaire ouvre la
  **fiche** de la ligne : tous ses champs, y compris ceux « Formulaire seulement ».
  La fiche existe maintenant dans tous les index, et aussi par clic droit sur une
  ligne › « Ouvrir la fiche ».
- Le survol d'un en-tête montre les types doubles : « Nom · Style imposé »,
  « Jauge (icônes, propre à chaque case) · Nombre », « Liste · Formulaire ».

## Liste

- Un seul type **Liste**, qui remplace les étiquettes et les statuts.
- **Choix multiple** (plusieurs valeurs par case) et **ajout libre** (une valeur hors
  liste est acceptée).
- Une **couleur par option**.
- Des **groupes** dans l'ordre (« À faire », « En cours », « Fini »).
- La **Liste liée** (noms d'un autre index) accepte aussi le choix multiple.

## Jauge

Pour chaque colonne, on choisit jusqu'où va la jauge :

- **même maximum pour toute la colonne** : une note sur 5 ;
- **chaque case a sa propre jauge** : le nombre tapé est le nombre d'icônes, comme
  les charges des sorts ;
- **maximum lu dans une autre colonne** : « PV » sur « PV max ».

On règle aussi :

- l'**icône** : plus de 140 au choix (étoile, cœur, drapeau, tête de mort, croix,
  graine, goutte, flamme…) ou n'importe quel émoji ;
- la **couleur**, ou une couleur selon le niveau (rouge quand c'est bas) ;
- la **saisie directe** de la valeur.

## Nouveaux types

- **Formule** : `{Prix} / 2`, `SI({Rang} >= 3; "Élite"; "Commun")`,
  `JOINDRE(" · "; {Type}; {Sous-type})`…
  - 66 fonctions en français : logique, nombres, texte, listes, relations
    (`RECHERCHE`), unités (`CONVERTIR` en PO/PC/PN, m, kg), hasard (`DES("2d6")`).
  - Vérification pendant la frappe et aperçu sur les premières lignes.
- **Aléatoire** : tire au sort et garde le résultat dans la case.
  - Ce qu'on tire : un nombre, des dés, une option d'une liste pondérée, une ligne
    d'un index (avec une condition et une pondération), une valeur d'une autre
    colonne, ou une formule.
  - Plusieurs tirages, sans doublon ou non.
  - **Figé** ou **relançable**.
- **Boutons** : plusieurs boutons par case, chacun avec libellé, icône, couleur,
  confirmation et condition d'affichage (une formule). Chaque bouton enchaîne des
  étapes :
  - ouvrir la fiche, la ligne liée, un index ou une adresse ;
  - mettre une valeur, augmenter ou diminuer (« −1 charge », avec des bornes),
    cocher, vider, tirer au sort ;
  - dupliquer, supprimer, déplacer vers un onglet ;
  - créer une ligne pré-remplie dans un index ;
  - pour un objet : l'ajouter à l'inventaire d'une campagne, d'un personnage ou d'un
    PNJ ;
  - envoyer dans le chat d'une campagne, copier une valeur ou la carte de la ligne,
    afficher un message.

  Les textes acceptent `{Colonne}` et, précédés de `=`, une formule.

## « Tirer »

Le bouton **Tirer** de chaque index tire une ligne au hasard parmi celles affichées,
avec une pondération par colonne si on veut. Le bestiaire devient une table de
rencontres.

## Le guide « ? »

Tout ce que savent faire les colonnes, pour s'en servir sans aide :

- tous les types et leurs réglages ;
- les réglages communs, les cadenas et la corbeille ;
- **toutes les formules**, avec leurs exemples calculés en direct ;
- toutes les étapes des boutons ;
- l'aléatoire.

## Charges des sorts

- On peut maintenant choisir « ✦ » (charges illimitées) dans l'index.
- « ✦ » ne disparaît plus quand on modifie une autre case du sort.
