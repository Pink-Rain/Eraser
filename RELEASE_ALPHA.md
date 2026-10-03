# Eraser 0.1.1-alpha.116 — États, attributs et matériaux cités entre accolades

Cette version arrive par la mise à jour sans réinstallation.

## {Empoisonnement}, {Lourde}, {Acier trempé}

Dans la description ou l'effet d'un index (objets, sorts, succès, et même les états et
les modificateurs d'armes entre eux), écris le nom d'un état, d'un attribut ou d'un
matériau entre accolades : « Applique {Empoisonnement} ». Hors des tableaux, le nom
s'affiche avec sa propre mise en forme (celle de sa case Nom, sinon sa couleur ; un état
garde aussi son icône), souligné en pointillés.

Au survol :

- un **état** montre le même résumé que sur la fiche d'un personnage : son icône, son
  type, la description du niveau 1 et du niveau 2, et ses règles liées ;
- un **attribut** ou un **matériau** montre son type, sa description, sa chance et ses
  charges.

Dans le tableau de l'index, le texte reste tel que tu l'as écrit. Une accolade qui ne
nomme rien de connu reste écrite telle quelle. Les noms sont reconnus sans tenir compte
des majuscules ni des accents. Pour un objet, {Valeur}, {Distance} et les autres
colonnes de la ligne passent en premier.

Cela marche dans les inventaires, les magasins, la fouille, la fenêtre de magasin sur la
table, les sorts (fiche, cartes de choix, liste des sorts, détail de classe) et les
succès.

## Attributs : la colonne Nombre est un % de chance

Comme pour les matériaux, Nombre donne le pourcentage de chance d'un attribut. Une case
vide veut dire chance normale (« Chance : normale » au survol).

## Petits plus

- La ligne « Attributs : » d'un objet montre chaque attribut connu avec son détail au
  survol.
