# Eraser 0.1.1-alpha.114 — Armes - Modificateurs

Cette version arrive par la mise à jour sans réinstallation.

## Un seul index : « Armes - Modificateurs »

Les index des runes, des matériaux et des attributs laissent la place à un seul
tableau, **Armes - Modificateurs** (dans Ressources). Ses colonnes : Nom, **Type**,
Description, **Nombre**, **Charges** et **Couleur**.

La colonne **Type** est une colonne « Rangement en onglets » : chaque valeur écrite
(Rune, Matériau, Attribut, ou tout autre mot) a son onglet. **Nombre** sert au % d'un
matériau, au nombre de runes ou au dé d'un attribut. **Charges** donne le nombre de
charges ajoutées à l'arme ; vide, pas de charge.

Les anciennes feuilles des runes, matériaux et attributs ne sont ni modifiées ni
supprimées dans le Drive : elles ne sont simplement plus affichées. Les anciennes
adresses mènent au nouvel index. La feuille « Armes - Modificateurs » est créée au
premier passage si elle n'existe pas encore, et reprise telle quelle si elle existe.

La pop-up « lié » de l'inventaire lit maintenant ce tableau : pour une rune, elle
propose les lignes dont le Type est Rune (et de même pour Matériau et Attribut). Un nom
tapé qui n'existe pas encore y est ajouté avec le bon Type.

## Rangement en onglets : les lignes restent dans leur onglet

Une colonne « Rangement en onglets » ne déplace plus aucune ligne. Toutes les lignes
restent dans leur onglet d'origine (par exemple « Tout »), et chaque valeur de la
colonne crée en plus un onglet du même nom qui les affiche aussi. Changer la valeur
d'une case met l'onglet à jour aussitôt. Un ancien onglet du même nom, créé par un
rangement d'avant, est réuni à ce nouvel onglet sans que rien ne soit effacé.

## Objets : Compétence, Distance, Action, Dégâts

Les tableaux d'objets reçoivent quatre colonnes, ajoutées à droite : **Compétence**,
**Distance**, **Action** et **Dégâts**. Aucune colonne existante ne bouge et aucune
valeur n'est touchée. Une colonne déjà présente sous ce nom n'est pas doublée.

Quand elles sont remplies, elles s'affichent sous la description de l'objet dans les
inventaires, les magasins (détails d'un objet), la fouille et la fenêtre d'un magasin
sur la table.

## Index : tout revient à la ligne

Dans tous les index, chaque type de case revient à la ligne quand la place manque, au
lieu d'être coupé par « … » : le Nom, les listes et les rangements en onglets, les
nombres, les identifiants, les liens, les jauges, les formules, les boutons, les
résultats calculés… La ligne s'agrandit en hauteur.
