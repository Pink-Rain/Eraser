# Eraser 0.1.1-alpha.18 — corrections de la barre du haut

L'alpha.17 (bouton épingle, barre sans cadre natif) a introduit plusieurs
régressions visuelles remontées immédiatement après coup : la barre du haut
poussait mal le reste de l'interface, l'icône du menu se coupait une fois
réduit, et le repli en mini-barre ne fonctionnait qu'à moitié.

## Corrigé

- **la barre du haut ne casse plus le menu ni le reste de l'interface** :
  elle poussait mal le panneau latéral et le contenu, qui se retrouvaient
  partiellement cachés derrière elle. Le menu et la barre du haut restent
  maintenant fixes, sans se chevaucher ;
- **l'icône du menu latéral ne se coupe plus** quand le menu est réduit en
  mode icônes seules : elle réduit sa propre taille pour tenir dans
  l'espace disponible au lieu d'être rognée ;
- **double-cliquer n'importe où sur la barre du haut réduit désormais la
  fenêtre** (pas seulement sur l'icône) — le survol/clic sur une zone de
  déplacement de fenêtre ne recevait pas toujours l'évènement de
  double-clic ; il est désormais détecté de façon fiable sur toute la
  barre ;
- **la réduction se fait aussi en largeur, pas seulement en hauteur** :
  la mini-barre ne garde que la place pour l'icône et le titre de
  l'application, rien de plus ;
- **plus de barre de défilement visible pendant la réduction** ;
- **la barre de défilement générale de la fenêtre est maintenant assortie
  au thème sombre** au lieu d'afficher le style clair par défaut du
  système, cohérent avec le reste de l'interface.

## Notes techniques

- la barre du haut est maintenant un survol (`position: fixed`) plutôt
  qu'un élément normal du flux de page ; elle compense en ajustant par CSS
  la hauteur/le remplissage réservés par le panneau latéral et le contenu
  au lieu de dépendre d'une technique de bloc de confinement qui ne
  fonctionnait pas de façon fiable avec le panneau latéral existant ;
- toujours vérifié uniquement via compilation, typage, lint et démarrage
  du serveur (pages non connectées et connectées) depuis cet environnement
  Linux — le rendu réel de la fenêtre (chevauchements, glisser-déposer,
  redimensionnement) nécessite un test sur la version installée.

## Vérifications

- compilation complète de l'application réussie ;
- lint sans erreur ;
- vérification de fidélité avec la source du site réussie (aucun fichier CSS
  historique modifié, aucune suppression) ;
- serveur Windows autonome construit et vérifié en HTTP 200 sur
  « /connexion » et sur une page connectée (création de compte + tableau de
  bord) sans erreur serveur.
