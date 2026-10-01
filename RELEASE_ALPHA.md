# Eraser 0.1.1-alpha.88 — Index des caractéristiques et compétences

Cette version arrive par la mise à jour sans réinstallation.

## Nouvel index : Caractéristiques et compétences

Dans Index, une nouvelle page **Caractéristiques et compétences**, avec deux onglets.

- **Caractéristiques** : Nom, Type (Principale ou Secondaire), Valeur par défaut.
- **Compétences** : Nom, Caractéristique (liste des caractéristiques), Valeur par défaut.

À sa première ouverture, l'index se remplit avec ce que contient déjà la fiche de
personnage : 10 caractéristiques principales, 14 secondaires (points de vie, classe
sociale, notoriété… seuils critiques 96 et 5) et 88 compétences (0 ou −20).
Il n'est rempli qu'une fois, et seulement si son classeur est vide.

## La fiche de personnage lit cet index

- Une **compétence ajoutée** apparaît sur toutes les fiches, sous sa caractéristique,
  avec sa valeur de départ et son calcul (stat, réussite et échec critiques).
- Une **caractéristique principale ajoutée** devient une nouvelle carte de l'onglet
  Compétences ; une **secondaire ajoutée**, une case en haut de la fiche.
- Les **valeurs par défaut** s'écrivent à la création d'un personnage, et dans les
  fiches existantes quand la ligne est ajoutée à l'index.
- **Renommer** une ligne renomme la case sur la fiche, sans rien perdre. Renommer une
  caractéristique met à jour la colonne Caractéristique de ses compétences.
- Les objets peuvent viser une compétence ou une caractéristique ajoutée
  (« +5 en Pêche »).
- Les compétences reconnues par « Création de classe » (compétences des sorts) sont
  celles de l'index.

Rien n'est déplacé dans la feuille « Personnages » : les colonnes d'origine restent à
leur place. Celles d'une ligne ajoutée viennent à la fin, nommées d'après elle.
Une ligne retirée de l'index disparaît de la fiche, mais ses valeurs restent dans
Google Sheets.

## Trois tableaux passent sur le moteur des index

- **Bonus de rang** (Création de classe) : tri, filtres, et modification des cases
  directement dans Eraser. « Colonne » ajoute une sorte de bonus.
- **Diagnostic des feuilles** (Administration › Google Drive) : en lecture seule ;
  le nom ouvre la feuille dans le navigateur.
- **Campagnes et rang moyen** (statistiques de Création de classe) : la campagne se
  présente comme dans l'Index des campagnes et ouvre sa page.
