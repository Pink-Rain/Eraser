# Eraser 0.1.1-alpha.92 — Pages instantanées, onglets-fenêtres, presets, runes sur les objets

Cette version arrive par la mise à jour sans réinstallation.

## Corrections de l'alpha.91

- **Changer de page** : au clic, la nouvelle page s'affiche tout de suite avec sa
  structure (titre, barre d'outils, tableau ou cartes vides), puis ses données se
  remplissent. Plus d'attente sur l'ancienne page, plus d'écran « Ouverture de la page… ».
- **Nouveau sort** : les cartes reprennent les couleurs des sorts de ton index (celles
  de la case Type), au lieu de couleurs inventées.
- **Succès** : plus d'attribution à la main ; elle sera automatique, une fois définie
  la façon de remplir l'index. L'accueil et « Mon profil » affichent les succès.
  La colonne Icône de l'Index des succès est une colonne Fichier (image), comme ailleurs.
- **Type de colonne « Icône » retiré** : une colonne enregistrée avec ce type redevient
  une colonne Fichier image.

## Index

- **Onglets-fenêtres** (bouton « Onglet-fenêtre ») : un onglet qui ne contient aucune
  donnée et réaffiche les lignes existantes qui remplissent des conditions (Nom, Type,
  Sous-type… est / contient / est vide / supérieur à…), prises dans tout l'index ou dans
  un seul onglet. Rien n'est copié : une case modifiée dans la fenêtre l'est dans son
  onglet d'origine. Dans l'index des objets, la source peut être tous les index d'objets
  ou un seul tableau.
- **Presets d'onglets** : dans « Modifier », enregistrer les colonnes d'un onglet sous
  un nom, puis les réutiliser pour un nouvel onglet ou en ajouter les colonnes à un
  onglet existant. Renommer, remplacer, supprimer depuis « Gérer ».
- Onglets-fenêtres et presets sont gardés dans le classeur « Eraser · Réglages des
  index » du Drive, créé au premier enregistrement (relié s'il existe déjà).
- **Nouveau type de colonne « Rangement en onglets »** : la valeur de la case est le nom
  d'un onglet ; la ligne y est rangée, et une valeur nouvelle crée l'onglet avec les
  mêmes colonnes.
- **Choix du type de colonne plus clair** : une liste compacte, une ligne par type avec
  ce qui le distingue (Liste / Liste liée / Colonne liée…), le détail au survol.
- « Nom formulaire » n'est plus proposé : chaque index a déjà le sien.

## Index des objets

- Le classeur « Index Objet » n'avait pas d'en-têtes sur sa première ligne : Eraser les
  y écrit (seulement dans les cases vides). La deuxième colonne « Description », vide,
  qu'une ancienne version avait ajoutée en fin de tableau, est supprimée (une colonne
  qui contient quoi que ce soit n'est jamais touchée).

## Inventaire

- Le bouton de liaison d'un objet ouvre une fenêtre à onglets : caractéristiques et
  compétences (comme avant), **runes**, **attributs** et **matériaux**, choisis dans
  leurs index. Ils s'affichent sur l'objet ; leurs effets seront définis plus tard.
