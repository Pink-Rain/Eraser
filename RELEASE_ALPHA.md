# Eraser 0.1.1-alpha.46 — les index comme une vraie feuille de calcul

## Les tableaux

La colonne « Ligne » et la colonne « Actions » ont disparu. À leur place, une
**poignée** à l’extrême gauche de chaque ligne :

- un clic la sélectionne, **Maj+clic** étend la plage, **Ctrl+clic** ajoute ou
  retire une ligne ;
- un clic droit ouvre le menu : copier, couper, coller ici, vider le contenu,
  insérer une ligne au-dessus ou en dessous, dupliquer, supprimer ;
- au clavier sur une sélection : **Ctrl+C**, **Ctrl+X**, **Ctrl+V**, **Ctrl+D**
  pour dupliquer, **Suppr** pour vider, **Ctrl+Suppr** pour supprimer.

Le copier-coller passe par le presse-papiers du système : on peut donc coller
des lignes venues de Google Sheets, et inversement. Entre deux lignes d’Eraser,
la mise en forme est conservée.

La cellule active porte une **poignée de recopie** en bas à droite : on la tire
vers le haut ou vers le bas et son contenu, mise en forme comprise, est recopié
dans toutes les cellules survolées.

Une **ligne fantôme** ferme le tableau : un clic ajoute une ligne sur place, sans
remonter à l’en-tête.

La colonne **Nom reste visible** pendant le défilement horizontal — sa largeur
reste réglable. La colonne Actions, elle, ne collait plus à rien : elle est
partie.

Une suppression demande confirmation : Google Sheets a son historique, Eraser
non.

## Les en-têtes

Réduits au nécessaire. « Piles », « Compléter », « Google Sheets » et « Voir les
doublons » ne sont plus dans la barre du haut. Les doublons restent dans leur
onglet et dans le menu d’une ligne.

Dans l’Index des objets, « Ajouter une ligne » devient **« Ajouter un objet »**,
avec un formulaire construit à partir des colonnes du tableau choisi — chaque
index a les siennes.

## Les onglets

Un clic droit sur un lien de l’application propose **« Ouvrir dans un nouvel
onglet »**. Les onglets s’affichent dans la barre de titre, à côté de l’icône, et
se ferment d’un clic. Comme dans un navigateur, le nouvel onglet s’ouvre en
arrière-plan : la page en cours n’est jamais interrompue. Dans une zone de
texte, le menu du système reste, avec ses corrections orthographiques.

## Corrigé

- une cellule figée laissait voir la colonne qui défilait derrière elle ;
- dans un texte seulement affiché, les cases à cocher réagissaient au clic sans
  rien enregistrer. Elles sont désormais inertes hors d’un éditeur ;
- coller une ligne entière dans l’Index des classes lançait un enregistrement par
  colonne, chacun construit sur l’état précédent : seule la dernière colonne
  survivait. Les colonnes modifiées partent maintenant ensemble.

## Vérifications

- comportement vérifié dans un vrai navigateur : 22 contrôles sur la grille
  (sélection, plage, copier-couper-coller, vidage, duplication, confirmation de
  suppression, menu contextuel, ligne fantôme, poignée de recopie, opacité des
  colonnes figées, frappe intacte dans une cellule) et 11 sur les onglets ;
- lint sans erreur, build Vinext complet, 20 tests d’interface au vert ;
- serveur desktop construit et vérifié en HTTP 200.
