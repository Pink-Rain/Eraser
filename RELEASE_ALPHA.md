# Eraser 0.1.1-alpha.42 — fenêtre à la bonne taille et cellules réparées

Cette préversion corrige la hauteur de la fenêtre, rend les cellules des index
réellement modifiables et fait respecter la mise en forme des objets partout.

## Corrigé

- la seconde barre de défilement disparaît vraiment : la coque de l’application
  ne tenait pas compte de la barre de titre (icône, épingler, réduire, fermer) et
  dépassait donc de sa hauteur. Le bas des pages et la barre de défilement
  horizontale des tableaux étaient coupés pour la même raison ;
- les cellules des index se modifient de nouveau : le curseur ne revient plus au
  début, la sélection tient, et le texte saisi ne s’efface plus. Le contenu d’une
  cellule appartient désormais entièrement au navigateur pendant la frappe ; il
  n’est repris du serveur que lors d’une actualisation, d’un ajout ou d’une
  suppression de ligne ;
- les fautes sont de nouveau soulignées en rouge : la préversion précédente
  imposait le français alors que son dictionnaire n’était pas encore téléchargé,
  ce qui désactivait le correcteur. La langue du système est conservée, le
  français n’est ajouté que s’il manque, et l’ajout est annulé si le
  dictionnaire ne peut pas être récupéré. Le clic droit propose les corrections ;
- « 0 » reste un modificateur d’objet valable.

## Modifié

- dans les index, la page défile normalement : le titre, la recherche et les
  onglets s’effacent vers le haut, puis le tableau se fige sous l’en-tête et
  occupe tout l’écran, barre d’outils et noms de colonnes compris. Le tableau
  gagne ainsi toute la hauteur de la fenêtre ;
- la mise en forme des objets (gras, couleurs, liens) est respectée partout où
  ils apparaissent : inventaires de personnages, de PNJ et de campagne, résultats
  de recherche d’objets et magasins. Réécrire un texte dans un inventaire y
  remplace la mise en forme par du texte brut, comme attendu ;
- l’Index des classes n’affiche plus les colonnes « Distance » et « Charges »
  dans les onglets Passifs et Bonus, où elles ne servent pas.

## Vérifications

- lint sans erreur ;
- build Vinext complet ;
- suite de tests d’interface au vert ;
- serveur desktop construit et vérifié en HTTP 200.
