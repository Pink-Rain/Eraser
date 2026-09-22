# Eraser 0.1.1-alpha.47 — le Vocabulaire et les index du monde

## Règles → Vocabulaire

La page Vocabulaire devient un vrai **dictionnaire** des mots qu’on utilise
autour de la table.

- Les mots sont rangés par **ordre alphabétique**, sous une grande lettre dans
  une colonne à gauche (les accents ne comptent pas : « Échec critique » va sous
  E). Un sommaire des lettres permet de sauter directement à une section.
- En MJ ou Admin, le bouton **« + Ajouter du vocabulaire »** en haut à droite
  ouvre un petit formulaire : un titre, et un contenu dans l’éditeur de texte
  habituel (gras, listes, couleurs, liens…).
- **Double-clic sur un titre** pour le modifier ou le supprimer.
- En joueur, la page se lit seulement : ni bouton, ni modification.

Tout est enregistré dans la feuille Google **« Vocabulaire »** (colonnes Titre
et Contenu), reliée si elle existe déjà, créée sinon.

## Ressources → quatre nouveaux index

Réservés aux MJ et administrateurs, ils fonctionnent comme l’Index des objets
(édition dans les cellules, tri, recherche, copier-coller, duplication,
suppression) et chacun a son classeur dans Drive :

- **Index des créatures** — Nom, Type, Sous-type, Rang, Dressable,
  Emplacement principal, Rareté, Emplacement secondaire, Rareté secondaire,
  Agressivité, Extension. Cliquer sur le nom ouvre la fiche de la créature
  (encore vide, elle sera remplie plus tard).
- **Index des lieux** — Nom, Type, Sous-type, Peuple, Description, Note.
- **Index des religions**, en deux onglets : **Religions** (Nom, Divinités,
  Description, Note) et **Divinités** (Nom, Religion, Histoire, Description,
  Autre).
- **Index des peuples** — Nom, Ancêtres, Descendant, Lieux, Description, Note.

## Les colonnes liées

Les colonnes marquées **↔** se complètent d’elles-mêmes (noms séparés par des
virgules, accents et majuscules ignorés) :

- une divinité inscrite dans une religion reçoit cette religion, et
  inversement ; si elle n’existe pas encore, elle est créée ;
- « x » en descendant de « y » ajoute « y » aux ancêtres de « x », et
  inversement ;
- un lieu inscrit dans un peuple reçoit ce peuple — et le lieu est créé dans
  l’Index des lieux s’il n’existe pas.

Les liens ajoutent sans jamais retirer : effacer un nom d’un côté laisse
l’autre intact.
