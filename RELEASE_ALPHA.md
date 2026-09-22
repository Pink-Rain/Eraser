# Eraser 0.1.1-alpha.48 — chaque index retrouve ses colonnes

## Corrigé

En passant d’un index à l’autre par le menu Ressources, l’Index des lieux, des
religions ou des peuples affichait les colonnes et le contenu du premier index
ouvert — souvent celui des créatures. Chaque index affiche désormais les siennes :

- **Index des lieux** — Nom, Type, Sous-type, Peuple, Description, Note ;
- **Index des religions** — onglet Religions (Nom, Divinités, Description,
  Note) et onglet Divinités (Nom, Religion, Histoire, Description, Autre) ;
- **Index des peuples** — Nom, Ancêtres, Descendant, Lieux, Description, Note.

Les feuilles Google étaient déjà correctes ; seul l’affichage se trompait, et
aucune donnée n’a été écrite au mauvais endroit.

## Rappel de l’alpha.47

- Règles → **Vocabulaire** : dictionnaire alphabétique, ajout et modification
  en MJ/Admin, lecture seule pour les joueurs.
- Ressources → **Index des créatures, des lieux, des religions et des
  peuples**, avec les colonnes liées (religions ↔ divinités, ancêtres ↔
  descendants, peuples ↔ lieux) qui se complètent d’elles-mêmes.
