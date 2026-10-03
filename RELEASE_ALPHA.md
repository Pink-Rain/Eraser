# Eraser 0.1.1-alpha.122 — Citer une ligne d'index avec « { »

Cette version arrive par la mise à jour sans réinstallation.

## Le menu « { »

Dans n'importe quel texte de l'application (cases des index, fiches de ligne, descriptions
d'objets, notes…), tape « { » ou clique sur le nouveau bouton **{}** de la barre d'outils.
Un menu s'ouvre sous le curseur :

1. il propose les index : « État », « Lieu », « Ville », « Attribut », « Matériau »,
   « Objet »… et, dans un index, les colonnes de la ligne en cours ;
2. un index choisi, il propose ses lignes, avec une recherche au fil de la frappe ;
3. une ligne choisie, il propose son **nom** ou l'une de ses **cases**.

Tout se fait au clavier (flèches, Entrée, Échap) ou à la souris. On peut aussi taper la
référence en entier, comme `{État:Sérénité}` ou `{État:Sérénité:Type}`, puis la fermer
avec « } ».

## Ce que ça affiche hors du tableau

- **Le nom** (`{État:Sérénité}`) s'affiche avec sa mise en forme, et son détail au survol.
- **Une case** (`{État:Sérénité:Type}`, même `{État:Sérénité:Nom}`) affiche sa valeur
  dans le style de sa colonne, **sans** survol.
- **`{Prix}`**, sans index devant, affiche la case de la ligne même : un objet peut écrire
  `{Prix}`, `{Poids}` ou n'importe laquelle de ses colonnes dans sa description.

Dans l'éditeur, une référence forme une petite étiquette qu'un retour arrière efface d'un
coup.

## Renommer sans rien casser

Une référence retrouve sa ligne par son **identifiant**, pas par son nom. Renommer
« Sérénité » renomme donc toutes ses citations, partout dans l'application, sans réécrire
aucun texte. Une ligne supprimée s'affiche barrée.

L'ancienne écriture `{Sérénité}` (le nom seul entre accolades) n'est plus reconnue : les
textes qui l'utilisent l'affichent telle quelle, à refaire avec le menu.
