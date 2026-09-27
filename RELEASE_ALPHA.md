# Eraser 0.1.1-alpha.75 — Lier les sorts à toutes les classes, doublons un par un

Cette version arrive par la mise à jour sans réinstallation.

## Index des classes, onglet « Par classe »

- **Les sorts se lient enfin aux nouvelles classes.** La feuille « Sorts de classe »
  n’avait une colonne que pour 9 des 25 classes. Pour une classe sans colonne
  (Druide, Rôdeur·euse…), la recherche montrait bien les passifs, mais cliquer
  dessus échouait sans rien afficher près du clic : le lien n’avait nulle part où
  s’écrire. La colonne de la classe est maintenant ajoutée automatiquement à droite
  de la feuille (nom de la classe en en-tête, mise en forme reprise de la colonne
  de classe voisine) au premier sort lié. Aucune cellule existante n’est modifiée.
- Même correction pour les cartes de sort, le tableau et le formulaire de création :
  une classe ajoutée depuis la pastille « + Classe » est bien enregistrée.
- Une erreur pendant « Chercher un sort » s’affiche maintenant dans le panneau de
  recherche, et plus seulement en haut de la page.
- Avant d’écrire le lien, Eraser vérifie que la ligne du sort n’a pas bougé dans
  Sheets entre-temps.

## Onglet « Doublons »

- **Un sort peut être mis à part.** Dans un groupe de trois sorts ou plus, chaque
  sort a un bouton « Pas un doublon » : ses ressemblances avec les autres sont
  ignorées, et le groupe reste ouvert sur les sorts restants, prêts à être comparés
  ou fusionnés. Le bouton du haut devient « Aucun n’est un doublon » pour écarter
  tout le groupe d’un coup.
- **Les doublons ignorés ne glissent plus.** Un sort sans ID était désigné par sa
  ligne (« LIGNE-315 ») dans l’onglet « Doublons ignorés » : après une fusion ou une
  suppression plus haut dans la feuille, cette désignation pointait sur un autre
  sort. Désormais, un sort sans ID marqué « pas un doublon » reçoit un vrai ID
  (écrit dans sa cellule ID vide), et ses paires déjà ignorées le suivent.

## Vérifications

- dans un vrai navigateur : lien d’un passif, erreur affichée dans le panneau de
  recherche, groupe de quatre doublons réduit à trois par « Pas un doublon » ;
- sur une copie simulée de la feuille des sorts : colonne ajoutée une seule fois
  (grille agrandie si besoin), rang écrit, second lien sans nouvelle colonne,
  enregistrement et création de sort vers une nouvelle classe, ID attribué aux
  sorts sans ID et paires ignorées renommées, désignation périmée refusée ;
- lint sans erreur, tests d’interface au vert, serveur desktop vérifié.
