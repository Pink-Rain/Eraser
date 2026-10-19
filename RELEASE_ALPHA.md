# Eraser 0.1.1-alpha.244 — Fenêtres, menus et fiches sans recalculer toute la page

Cette version arrive **sans réinstallation** (enveloppe 10, comme l'alpha 238) : Eraser la
télécharge, redémarre son serveur et recharge la page tout seul. Rien n'est modifié dans Google
Sheets.

Trouvé grâce au profil des gels de l'alpha 243 : sur l'index des items, ouvrir une fenêtre ou un
menu faisait recalculer le style de **toute la page**, jusqu'à quatre fois de suite. Mesuré sur
un banc avec un processeur bridé comme un petit portable :

| Geste (index des items) | Avant | Maintenant |
| --- | --- | --- |
| Ouvrir la fiche d'un item | 1,8 s | 0,9 s |
| « Suivante » dans la fiche | 0,5 à 0,65 s | 0,3 s |
| Fermer la fiche (Échap) | 0,5 à 0,95 s | 0,2 s |
| Ouvrir le menu du logo (to-do, personnages, campagnes) | 1,35 s | 0,4 s |
| Le refermer | 0,9 s | 0,15 s |

## Ce qui a changé

- **Fenêtres et menus** : pour rendre la page inerte derrière eux, ils changeaient le style de
  la page entière, à l'ouverture comme à la fermeture. Un calque invisible posé juste sous la
  fenêtre fait le même travail sans rien recalculer : un clic à côté ferme toujours la fenêtre
  sans rien déclencher derrière.
- **Barre de défilement** : chaque fenêtre mesurait puis modifiait la page pour masquer une barre
  de défilement qu'Eraser n'a pas (seul le contenu défile). Retiré.
- **Trois règles de style** (`:has()`) obligeaient le navigateur à revérifier toute la page à
  chaque élément ajouté ou retiré : fenêtres du tabletop, barre latérale, cartes « même
  hauteur ». Remplacées par des équivalents ciblés, sans rien changer à l'affichage.
- **« Suivante » / « Précédente »** : la fiche retirait le focus du bouton cliqué avant de
  changer de ligne, ce qui forçait un recalcul complet ; seul un champ en cours de saisie le perd
  maintenant (pour enregistrer ce qui vient d'être tapé). Le bouton garde le focus : Entrée
  enchaîne les lignes.
- Le bouton du logo dit ce qu'il ouvre : « Ouvrir mes to-do », « mes campagnes » ou
  « mes personnages » selon le rôle (et le relevé de fluidité aussi).
