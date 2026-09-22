# Eraser 0.1.1-alpha.44 — le curseur des cellules tient enfin

## Corrigé

- le curseur ne saute plus au début d’une cellule et le texte tapé ne disparaît
  plus au moment de l’enregistrement.

La cause exacte a été trouvée en reproduisant le problème dans un vrai
navigateur, au lieu de la déduire : React réécrit le contenu d’un élément
modifiable à chaque rendu, **même lorsque la valeur n’a pas changé**. Dès que
l’enregistrement faisait remonter la cellule au tableau, celui-ci se redessinait
et le contenu de la cellule était remis à son état de départ — d’où le curseur
au début et la frappe perdue. Les préversions précédentes avaient supprimé
d’autres chemins de réécriture, mais pas celui-là.

La cellule pose désormais son contenu elle-même, une seule fois, et React n’en a
plus connaissance du tout. Le contenu n’est remplacé que lors d’une
actualisation, d’un ajout ou d’une suppression de ligne.

Vérifié au navigateur sur les cas qui échouaient :

- écriture longue traversant plusieurs enregistrements ;
- frappe au milieu d’un texte déjà écrit ;
- sélection maintenue, puis mise en gras et changement de couleur ;
- correcteur orthographique toujours actif sur la cellule ;
- actualisation qui remplace bien le contenu.

Un test empêche désormais ce retour en arrière.

## Vérifications

- lint sans erreur ;
- build Vinext complet ;
- suite de tests d’interface au vert ;
- serveur desktop construit et vérifié en HTTP 200.
