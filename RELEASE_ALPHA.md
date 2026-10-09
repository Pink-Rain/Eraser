# Eraser 0.1.1-alpha.160 — Spécificités de classe : les jauges

Cette version arrive par la mise à jour sans réinstallation.

## Un outil pour créer les règles propres à chaque classe

Dans **Création des classes**, une classe choisie a maintenant une section **Spécificités**
(entre Présentation et Statistiques). « Ajouter une spécificité » propose les outils :
**Jauge** dès maintenant ; **Formes** et **Deck** sont annoncés et arriveront ensuite.

## La Jauge

Une barre de rage, de mana, de concentration… réglée sans code :

- **Maximum** : fixe, **relié à la fiche** par une formule, ou **choisi par le joueur**.
- **Valeur actuelle** : **tenue par le joueur** (− / +, ou une valeur tapée : « +5 », « -3 »),
  avec une valeur de départ et un bouton de remise à zéro, ou **reliée à la fiche** (calculée,
  le joueur ne la touche pas).
- Les formules lisent la fiche entre accolades, insérées depuis « Valeur de la fiche » :
  niveau, points de vie actuels et max, chaque caractéristique, secondaire et compétence de
  l'index, telles qu'elles s'affichent (objets et états compris). Exemple, la rage d'un
  berserker : maximum `{Points de vie max}`, valeur `{Points de vie max} - {Points de vie actuels}`.
- **Emplacement** : sous la barre de vie, en bandeau sous les caractéristiques, ou en haut
  de l'onglet Sorts. **Affichage** : barre, pastilles cliquables ou nombre.
- **Seuils** nommés (« {Maximum} / 2 : Frénésie ») : un repère sur la barre, et leur nom
  s'affiche quand il est atteint.
- Un aperçu en direct, avec une fiche d'exemple, montre le résultat et signale une formule
  à revoir.

Les jauges s'enregistrent dans un nouvel onglet **« Jauges »** du classeur « Sorts de
classe » (créé seulement s'il manque), une ligne par jauge, lisible dans Sheets. Ce que le
joueur change est gardé dans sa fiche.

## Sécurité des données

La case « Sorts de classe choisis JSON » d'une fiche garde désormais tout ce qu'elle
contient à chaque réécriture, y compris ce qu'une version plus récente y aurait ajouté :
rien ne peut plus y être effacé en passant.
