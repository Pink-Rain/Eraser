# Eraser 0.1.1-alpha.82 — Des onglets comme dans un navigateur

Cette version change l’enveloppe de l’application (fenêtres multiples) : elle arrive
par l’**installateur, en silence**, puis Eraser se relance tout seul. Aucune donnée
n’est touchée.

## La barre du haut devient une barre de navigateur

- **Précédent / Suivant / Actualiser** en haut à gauche. Chaque onglet garde son
  propre historique. Le bouton « Actualiser » a quitté le menu de gauche.
- Raccourcis : Alt+← / Alt+→, les boutons latéraux de la souris, F5, Ctrl+T
  (nouvel onglet), Ctrl+W (fermer), Ctrl+Tab (onglet suivant).
- **Tous les onglets ont la même largeur**, même avec un seul onglet ouvert, et
  rétrécissent ensemble quand il y en a beaucoup.
- **Les onglets ne bougent plus tout seuls.** Cliquer sur un onglet ne le déplace
  pas ; un nouvel onglet s’ouvre juste à droite de celui où tu es.
- **Glisser-déposer** : on réordonne les onglets en les faisant glisser.
- **Sortir un onglet** : lâché hors de la fenêtre, il ouvre une nouvelle fenêtre
  à cet endroit.
- **Le remettre** : glisse-le sur la barre d’une autre fenêtre d’Eraser et il la
  rejoint. Une fenêtre vidée de son dernier onglet se ferme.
- Clic du milieu sur un onglet : il se ferme.

## « Ouvrir dans un nouvel onglet » partout

- Clic droit sur tout ce qui s’ouvre : **Ouvrir dans un nouvel onglet**, **Ouvrir
  dans une nouvelle fenêtre**, **Ouvrir ici**.
- Clic du milieu ou Ctrl+clic : nouvel onglet directement.
- Nouveaux endroits où ça marche :
  - **Accueil** : cartes des personnages et des campagnes.
  - **Menu de gauche** : « Mes campagnes » / « Mes personnages » et le bouton « + ».
  - **Tabletop** : cartes de la fenêtre « Ranger ».
- **Création de classe** :
  - Le menu déroulant des classes et la liste « État des classes » s’ouvrent
    aussi dans un autre onglet.
  - Chaque classe a sa propre adresse, et l’onglet porte son nom
    (« Classe · Druide »…).
- La session choisie (Lieux et rencontres) et la carte choisie (Tabletop) restent
  dans l’onglet quand on passe d’un onglet à l’autre.

## Vérifications

- Onglets testés dans un navigateur :
  - largeurs égales ;
  - ordre inchangé au clic ;
  - glisser-déposer ;
  - précédent / suivant ;
  - clic droit, clic du milieu et Ctrl+clic ;
  - classe ouverte dans son propre onglet sans rechargement.
- Lint sans erreur, 29 tests au vert, build et serveur desktop vérifiés.
