# Eraser 0.1.1-alpha.12 — confort d'utilisation

Une série de retouches d'ergonomie et de confort demandées après usage :
fenêtre plus propre, nouvelle icône, édition plus fluide dans l'Index des
classes, tri par glisser-déposer, texte des menus déroulants qui ne se coupe
plus, et un léger gain de vitesse de navigation.

## Ajouté

- deux liens sous « Corbeille » (admin) : « Actualiser » et « Chercher les
  mises à jour » (déclenche une vérification immédiate, sans attendre le
  cycle automatique de 6h) ;
- tri manuel des sorts par glisser-déposer (poignée dédiée) à la place des
  flèches monter/descendre, dans l'onglet « Sorts » de la fiche personnage.

## Corrigé

- la barre de menu Windows (Fichier, Édition…) est retirée de la fenêtre,
  elle ne servait à rien dans cette application ;
- l'icône de l'application (fenêtre, barre des tâches, onglet navigateur)
  est remplacée par le nouveau logo ;
- l'onglet « Classe » de la fiche personnage est renommé « Sorts » ;
- dans l'Index des classes, modifier un sort ne fait plus basculer toute la
  ligne dans un mode d'édition séparé (source des sauts d'affichage) :
  chaque champ est directement modifiable, comme dans l'Index des objets,
  avec un bouton Enregistrer qui ne s'active que si quelque chose a changé ;
- le texte sélectionné dans les menus déroulants ne se coupe plus
  brutalement (troncature propre avec points de suspension) ;
- la barre de défilement du menu latéral est maintenant assortie au thème
  sombre au lieu d'afficher la barre blanche par défaut du système ;
- la fenêtre de cache des lectures Google Sheets est allongée (60 s → 3 min)
  pour réduire les allers-retours réseau répétés en navigant d'une page à
  l'autre — toute modification faite dans l'application continue d'invalider
  le cache immédiatement.

## Vérifications

- compilation complète de l’application réussie ;
- lint sans erreur ;
- vérification de fidélité avec la source du site réussie (aucun fichier CSS
  historique modifié, aucune suppression) ;
- serveur Windows autonome construit et vérifié en HTTP 200 ;
- pages « Toutes les campagnes », « Index des classes » et « Index des
  objets » revérifiées en HTTP 200 sur le serveur autonome.
