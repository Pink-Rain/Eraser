# Eraser 0.1.1-alpha.53 — des index rapides et des mises à jour sans réinstallation

## Les index ne rament plus

Mesuré sur un Index des créatures de 300 lignes :

| | Avant | Maintenant |
|---|---|---|
| Afficher le tableau | 28 s | 1,5 s |
| Choisir un rang | 16 s | moins d’une seconde |
| Écrire dans une cellule | 24 s | 0,3 s |
| Cocher « Dressable » | 13 s | 0,2 s |

Ce qui a changé :

- **Chaque ligne du tableau se redessine seule.** Enregistrer une cellule ne
  redessine plus les centaines d’autres lignes. Tous les index en profitent :
  objets, classes, créatures, lieux, religions, peuples, langues.
- **Les listes déroulantes du tableau ne sont montées qu’au clic.** Avant, il y
  en avait environ 2 400 d’avance sur l’Index des créatures.
- **Eraser garde les index du monde en mémoire.** Une cellule enregistrée ne
  relit plus tout le classeur. Le classeur n’est relu qu’à l’ouverture, après
  un ajout, une suppression ou un déplacement, sur « Actualiser », ou passé cinq
  minutes, pour voir ce qui a été modifié directement dans Sheets.
- **Google envoie moins de données.** Eraser ne demande plus que le texte et
  sa mise en forme (gras, italique, souligné, barré, liens, couleur), sans la
  police ni le fond de chaque cellule.

## La fiche des créatures

- Les emplacements et les raretés passent dans la colonne de droite, sous le
  reste.
- L’extension quitte la fiche et le formulaire d’ajout. Elle se règle
  directement dans le tableau.

## Les mises à jour sans réinstallation

Presque chaque version ne change que le cœur d’Eraser, pas sa fenêtre. Eraser
télécharge donc désormais **seulement ce qui a changé** (environ 9 Mo),
vérifie que le fichier est intact, puis propose **« Appliquer maintenant »** :
la page se recharge en quelques secondes. Pas d’installateur, pas d’assistant,
pas de redémarrage. « Plus tard » l’applique à la prochaine ouverture.

- Le bouton **« Chercher les mises à jour »** suit la même procédure.
- Si une version téléchargée refuse de démarrer, Eraser revient tout seul à la
  version installée.
- Quand une version touche la fenêtre elle-même (c’est rare), l’installateur
  prend le relais, mais **en silence** : Eraser se ferme, s’installe et se
  rouvre, sans assistant.

**Une dernière fois :** cette version-ci arrive encore par l’ancien chemin,
avec l’assistant d’installation, parce que c’est ton Eraser actuel qui
l’installe. Les suivantes arriveront sans lui.

## Vérifications

- dans un vrai navigateur : mesures avant et après sur 300 créatures ;
  sélection de lignes, menu contextuel, duplication, poignée de recopie,
  listes, case à cocher, fiche et vue « Tout » des lieux inchangés ;
- dans Electron, face à un faux GitHub : téléchargement et vérification de
  l’empreinte, fichier abîmé refusé, enveloppe trop ancienne renvoyée vers
  l’installateur, serveur téléchargé qui démarre avec ses propres migrations ;
- sur une copie installée d’Eraser : version téléchargée utilisée au
  démarrage, version cassée écartée au profit de la version installée, et
  mise à jour appliquée en pleine session (bouton « Appliquer maintenant »)
  en moins d’une seconde ;
- lint sans erreur, build complet, 20 tests d’interface au vert, serveur
  desktop vérifié en HTTP 200.
