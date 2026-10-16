# Eraser 0.1.1-alpha.225 — La Liste réunie, les cartes à boutons

Cette version arrive **sans réinstallation** : Eraser la télécharge, redémarre son serveur et
recharge la page tout seul. Rien n'est effacé dans Google Sheets, ni dans les réglages, ni dans
les pages : les vues enregistrées gardent leurs clés et s'affichent comme avant.

## La Liste

- Dans « Modifier », **Liste** réunit Liste, Kanban et Maître-détail. Ses versions des trois
  formes sont dans le même panneau ; « + » demande la forme de départ.
- Quatre pages : **Général** (en-tête, barre d'outils, pied, texte quand rien ne correspond),
  **Rangement** (le groupe et les lignes), **Éléments et clic** (l'élément, puis au clic le
  détail), **Apparences**.
- **En-tête** : un titre, un texte, une icône, le nombre de lignes ; au-dessus de la vue ou dans
  le détail (maître-détail, panneau à côté).
- **Barre d'outils** : recherche, filtres épinglés, tri au choix, regroupement au choix, nombre de
  lignes, bouton « Ajouter » réservé aux rôles choisis. Ce que le lecteur y change ne touche que
  son écran.
- **Pied** : le nombre de lignes, des totaux qui suivent la recherche, « Charger plus ».
- **Couleurs selon une règle** : une teinte, un signe (🩸, ☠) ou une ligne grisée quand une
  condition est vraie (« PV inférieur à 15 »).
- **Groupes en onglets** : en haut, sur le côté (noms écrits à la verticale, comme des
  intercalaires) ou en bas ; soulignés, en pastilles, en classeur ou en signets.
- **Glisser** une ligne d'une section à l'autre change sa case, comme le kanban (à cocher). Une
  ligne à plusieurs valeurs : dans chaque groupe, ou seulement dans celui de sa première valeur.
- **Au clic** : la fiche, le panneau à côté toujours ouvert, une **fenêtre au centre**, dessous,
  la page, rien, ou « comme la carte ». Un **clic différent selon le rôle** est possible.
- **Le détail** peut être un formulaire **modifiable directement** ou avec un bouton
  « Modifier », par les rôles choisis, certains champs restant en lecture.
- L'élément simple peut devenir une carte (« En faire une carte ») ; ses anciens réglages restent
  gardés.

## Les cartes

- **Survol et clic** passe sous « Couleur et cadre » : le survol, et ce que fait un clic (la fiche,
  un formulaire choisi ici, la page, rien). Une vue qui règle les siens l'emporte.
- Nouveau bloc **Boutons** : ouvrir un formulaire ici, la page de la ligne, une ligne d'un autre
  index, une page d'Eraser, une page web, montrer une autre carte, une ligne au hasard, lancer
  des dés, +1 / −1, mettre une valeur, dupliquer, supprimer (avec confirmation), envoyer dans le
  chat… Chaque bouton peut enchaîner plusieurs actions et être réservé à certains rôles.
- « Voir comme », dans l'aperçu, montre les boutons que voit chaque rôle.
- Les colonnes Boutons des index gagnent les mêmes nouvelles actions.

## Les formulaires

- Avec des sections en onglets, **l'onglet ouvert d'abord** peut dépendre d'une colonne de la
  ligne : par exemple « Type » : un Mage ouvre l'onglet « Magie ».

## Les rôles

- Six rôles pour les boutons, le clic et le détail modifiable : Joueur, **Joueur de la
  campagne**, Joueur propriétaire (celui dont le personnage est la ligne), MJ, MJ de la campagne,
  Admin.

## Ce qui peut changer d'aspect

- Les onglets Kanban et Maître-détail de « Modifier » sont dans « Liste ».
- Une vue dont l'élément est une carte prend le survol choisi par cette carte, si la vue n'en
  choisit pas.
- Dans une carte d'élément, les liens, les boutons et les replis gardent leur propre clic.
- « Afficher à côté » s'appelle « Panneau à côté, toujours ouvert » ; la ligne ouverte est marquée
  dans la liste, et un formulaire dans ce panneau étroit met sa colonne de côté au-dessus.
