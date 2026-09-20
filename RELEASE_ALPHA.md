# Eraser 0.1.1-alpha.31 — revue point par point

Version de vérification : chaque demande faite depuis le début de cette
session a été recontrôlée dans le code, et non de mémoire.

## Corrigé dans cette version

- **Ressources › Index des classes** donnait un message générique quand la
  feuille « Classes » n'était pas reliée, alors que Règles › Classes
  expliquait quoi faire. Les deux pages disent maintenant la même chose.
- **Nettoyage** : deux fonctions du magasin partagé n'étaient appelées
  nulle part, elles sont supprimées.

## Vérifié, présent dans le code

Mini-barre disponible sans épingler au préalable et épinglage
automatique. Chat de table sur toutes les pages avec `/rjoueur`. Pages
d'administration des campagnes et des personnages. Redirection après
création. Réattribution d'un personnage ou d'une campagne. Suppression
d'un compte, et plus aucune trace de changement de mot de passe. Visuels
et liens d'identité sur le partagé, plus aucun accès direct au stockage
local de fichiers. Retrait d'un personnage d'une campagne.

## État de la suite de tests

Deux tests échouaient déjà avant cette session : `renders development
preview metadata` et `Roll20 bridge creates and updates one Eraser NPC`.
Vérifié en recompilant la version d'avant et en relançant la suite
dessus : mêmes deux échecs. Ils ne viennent pas des changements récents
et ne sont pas corrigés ici.

## Vérifications

- `npm run build` réussi ;
- lint sans erreur ;
- `npm run desktop:parity` : 0 fichier manquant, 0 style modifié.
