# Eraser 0.1.1-alpha.194 — Page Événements, page Document, types de magasin dans Lieux › Magasin

Cette version arrive par la mise à jour sans réinstallation. Rien n'est effacé ni déplacé dans
Google Sheets. Une nouvelle feuille « Événements de campagne » est créée au premier événement
sauvegardé (si elle n'existe pas déjà dans le Drive).

## Événements (menu › Créateur de session)

- La page **Événements** n'est plus vide. On y prépare :
  - des **créatures** (recherche dans l'Index des créatures) ;
  - des **PNJs génériques** ;
  - des événements **Autre** : nom, icône du moteur des index, étiquette colorée, description.
- Chaque événement se **sauvegarde**, se **renomme** et reçoit une **image**. Il **s'envoie dans
  une session**, comme les PNJs et les magasins.
- Les **marchés ambulants** se génèrent dans la même page, avec 4 à 8 items choisis ou tirés au
  hasard. Ils se gèrent comme les magasins : relancer, loupe, nom et token, lier à un PNJ. Ils
  s'envoient dans les événements d'une session.
- Le **Créateur de session** montre les événements envoyés. On les retire, on les envoie dans une
  autre session, ou on en ajoute parmi ceux préparés.
- Les événements écrits directement dans une session par l'alpha 193 restent visibles et
  retirables.

## Document

- **Document** est une page vide du menu, sous Créateur de session. L'onglet Document du
  créateur de session est retiré. Les lieux de la session restent dans le créateur.

## Lieux › Magasin : les types de magasin

- Chaque ligne de l'onglet **Magasin** de l'Index des lieux est un type de magasin. Ses colonnes :
  - icône et couleur ;
  - emplacements vendus ici ;
  - types et sous-types autorisés ;
  - **Trouvailles** : les index où l'on trouve ce qui se vend (Items, Créatures…) ;
  - nombre d'items : fixe, ou « 4-8 » ;
  - chance d'apparaître selon la taille de la ville ;
  - **Apparaît dans** : Magasins, Événements, Les deux ou Aucun.
- Un nouveau type se crée en ajoutant une ligne.
- **« Préparer l'onglet »** (admin, dans Magasin et fouille) ajoute les colonnes manquantes et une
  ligne par type d'origine. Une case déjà remplie n'est jamais touchée.
- Tant que l'onglet n'est pas rempli, les types d'origine continuent de fonctionner comme avant.
- Un emplacement va au type qui lui correspond le plus précisément : « Marché noir » ne va pas
  au Marché.
- La **loupe** des magasins propose aussi les trouvailles des autres index (créatures…), avec
  leur étiquette d'origine.
