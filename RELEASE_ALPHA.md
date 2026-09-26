# Eraser 0.1.1-alpha.69 — Création de personnage : cartes de classe et arrivée sur la fiche

Cette version arrive par la mise à jour sans réinstallation. Rien à changer côté
Roll20.

## Création de personnage

- **Toutes les classes s’affichent en petites cartes illustrées**, de la même taille :
  icône, nom complet (sur deux lignes au besoin) et famille. Avant, seule la première
  ligne gardait son illustration, les suivantes étaient écrasées et les noms longs
  coupés (« Serviteuse de K… »).
- **Après l’enregistrement, la fiche du personnage s’ouvre.** Un compte MJ n’avait
  accès qu’aux personnages de ses campagnes : celui qu’il venait de créer répondait
  « introuvable ». Un MJ voit désormais aussi ses propres personnages (fiche,
  portrait, inventaire, relations).

## Vérifications

- formulaire rendu dans un vrai navigateur avec 25 classes : cartes régulières,
  noms complets, sélection visible ;
- lint sans erreur, tests au vert, build et serveur desktop vérifiés en HTTP 200.
