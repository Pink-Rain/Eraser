# Eraser 0.1.1-alpha.41 — les index se comportent enfin comme un tableur

Les deux index de ressources partagent désormais le même tableau : mêmes cellules,
même mise en forme, même comportement. Seul l’onglet « Par classe » garde sa
présentation en fiches, puisqu’il ne montre pas la même chose.

## Index des objets et Index des classes

- la barre d’outils de mise en forme et la ligne des colonnes restent collées en
  haut de l’écran pendant tout le défilement ;
- la barre de défilement horizontale reste en bas de l’écran, comme dans un
  tableur, au lieu de suivre le bas du tableau ;
- les cellules sont modifiables en permanence : plus aucune zone de saisie
  n’apparaît au clic, et chaque cellule s’enregistre seule peu après la frappe
  sans figer le tableau ;
- le texte revient toujours à la ligne et c’est lui qui donne sa hauteur à la
  ligne ; la jauge globale de hauteur a disparu. Une poignée sous le numéro de
  ligne permet de fixer une hauteur à la main, et un double-clic revient à
  l’ajustement automatique ;
- l’Index des objets conserve et affiche enfin les couleurs, le gras, l’italique,
  le souligné et les liens, comme l’Index des classes ; chaque cellule est
  enregistrée individuellement, sans écraser ses voisines ;
- « Classes et rangs » tient maintenant dans une cellule : chaque lien est une
  pastille aux couleurs de la classe, avec son rang modifiable sur place, et un
  seul bouton ouvre une liste de classes cherchable ;
- les colonnes se redimensionnent toujours, et un bouton remet largeurs et
  hauteurs à zéro ;
- le clic droit sur un mot souligné en rouge propose enfin les corrections
  orthographiques, avec « Ajouter au dictionnaire », couper, copier et coller.

## Corrections

- « 0 » est accepté comme modificateur d’objet à part entière : le lien est
  conservé et reste visible, il n’ajoute simplement rien au total ;
- la seconde barre de défilement verticale apparue avec l’alpha.40 a disparu :
  seule celle du contenu subsiste.

## Vérifications

- lint sans erreur ;
- build Vinext complet ;
- suite de tests d’interface au vert, avec trois nouveaux tests couvrant le
  modificateur nul, la conversion texte enrichi / texte brut et le rendu de la
  grille partagée ;
- serveur desktop construit et vérifié en HTTP 200.
