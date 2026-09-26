# Eraser 0.1.1-alpha.72 — Actualiser l’accès, critiques liés aux objets, nouveaux index

Cette version arrive par la mise à jour sans réinstallation. Rien à changer côté
Roll20.

## Compte en attente

- L’écran « Accès en attente » a un bouton **Actualiser**. Il redemande l’état du
  compte au serveur, sans attendre le cache : si un administrateur a attribué un
  rôle, l’application s’ouvre ; sinon un message indique que le compte attend
  toujours.

## Fiche de personnage

- Les fenêtres qui apparaissent au survol (compétences, caractéristiques, vie,
  dégâts, armure, critiques…) s’ouvrent **au-dessus** quand il n’y a pas la place
  en dessous.
- Inventaire : un objet peut maintenant être lié au **seuil de réussite critique**
  ou au **seuil d’échec critique** de chaque caractéristique principale et de chaque
  compétence. Dans « Lier un objet », choisis la caractéristique ou la compétence,
  puis « Valeur », « Réussite critique » ou « Échec critique ».
- Les colonnes RC et EC d’une compétence additionnent les objets liés au seuil
  global, à celui de sa caractéristique et au sien. Le survol les liste, étiquetés
  « Réussite crit. » ou « Échec crit. », et celui de la caractéristique montre ce
  que les objets ajoutent à chacun de ses seuils.
- Les liens déjà enregistrés sur les objets ne changent pas.

## Nouveaux index

Quatre index sont prêts : **États**, **Runes**, **Attributs** et **Matériaux**.
Ils apparaissent dans la page Index et fonctionnent comme Peuples ou Religions.
Leur feuille Google (« Index des états », « Index des runes », « Index des
attributs », « Index des matériaux ») est créée au premier usage seulement si
aucune feuille de ce nom n’existe déjà dans le Drive ; « Relier mes feuilles
existantes » les retrouve aussi.

- États : Nom, Type, Effet, Durée, Cumul, Fin de l’état, Description, Note.
- Runes : Nom, Type, Élément, Effet, Se pose sur, Rareté, Description, Note.
- Attributs : Nom, Type, Effet, Description, Note.
- Matériaux : Nom, Type, Rareté, Emplacement principal, Emplacement secondaire,
  Propriétés, Description, Note.

## Vérifications

- dans un vrai navigateur : compte en attente → « Toujours en attente » ; rôle
  attribué par l’administrateur → « Actualiser » ouvre l’application ;
- les 176 nouveaux seuils ciblés (10 caractéristiques, 78 compétences) pointent
  chacun sur sa propre case et survivent à l’enregistrement ;
- lint sans erreur, tests au vert, build et serveur desktop vérifiés en HTTP 200.
