# Eraser 0.1.1-alpha.119 — Armes à plusieurs modes, rendu des colonnes

Cette version arrive par la mise à jour sans réinstallation.

## Plusieurs valeurs dans une case, séparées par « | »

Pour une arme à plusieurs modes, écris une valeur par mode dans la même case, séparées
par « | » : Valeur « 20+ Flèche | 1d30+20 », Distance « 60 | 1 », Action « Actif -Action
mineur | Actif -Action majeur ».

Dans la description ou l'effet, **{Valeur}** donne la première valeur, **{Valeur 2}** la
deuxième, **{Valeur 3}** la troisième… Pareil pour {Distance 2}, {Action 2}, etc. Sans
« | », {Valeur} est toute la case. Un mode qui n'existe pas reste écrit tel quel.

Dans le tableau, la colonne Distance écrit « 60 m | 1 m », et une liste comme Action
montre une pastille par mode. Sous l'effet d'un objet, chaque mode a sa propre valeur.

## Sous l'effet : le rendu des colonnes

Les **attributs**, l'**action**, la **distance** et la **compétence** s'affichent comme
dans leurs colonnes de l'Index des objets, avec le style imposé choisi dans « Modifier »
(couleur, gras, italique…), les couleurs des options et la pastille d'unité de la
distance. Plusieurs valeurs dans une liste s'affichent en pastilles, comme dans le
tableau. Les **matériaux** et les **runes** gardent la couleur de leur ligne
d'« Armes - Modificateurs ». Pour un attribut, sa couleur sert à son survol.
