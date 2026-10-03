# Eraser 0.1.1-alpha.115 — Colonnes de combat des objets

Cette version arrive par la mise à jour sans réinstallation.

## Les bons types de colonnes dans l'Index des objets

- **Compétence** propose toutes les caractéristiques et compétences de la fiche de
  personnage, lues dans l'index « Caractéristiques et compétences » (ses deux onglets).
- **Distance** est un nombre en mètres : « 60 » s'écrit « 60 m ».
- **Action** propose les mêmes types que les sorts (Bonus, Passif, Actif -Action
  mineur, majeur, instantanée, gratuite, de déplacement), avec les mêmes couleurs. Une
  autre valeur peut toujours être tapée.
- **Attributs** est une nouvelle colonne, ajoutée à droite : elle propose tous les
  attributs d'« Armes - Modificateurs » (les lignes dont le Type est Attribut), et en
  accepte plusieurs. Les attributs s'affichent avec l'effet de l'objet.
- **Dégâts** s'appelle maintenant **Valeur**.

## « Prix » partout

Les onglets Parchemins, Consommables et Livres appelaient leur prix « Valeur ». Leur
en-tête devient « Prix », comme dans les autres onglets, pour ne pas être confondu avec
la nouvelle colonne Valeur. Seuls les en-têtes changent : aucun prix n'est modifié et
les boutiques les lisent comme avant. « Coût » reste reconnu comme un prix.

## {Valeur} dans la description ou l'effet

Écris par exemple « Inflige {Valeur} à {Distance} » dans l'effet d'un objet : dans les
inventaires, les magasins, la fouille et la table, la phrase devient « Inflige 40 +
Carreaux à 60 m ». Dans le tableau de l'index, le texte reste tel que tu l'as écrit.
{Compétence}, {Action} et {Attributs} marchent aussi. Une accolade dont la case est
vide reste écrite telle quelle, pour voir tout de suite ce qui manque.

## Petits plus

- Une liste à choix multiple sans couleurs (comme Attributs) affiche chaque valeur dans
  sa propre pastille, pour bien les séparer.
