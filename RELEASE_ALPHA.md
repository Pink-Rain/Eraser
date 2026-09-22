# Eraser 0.1.1-alpha.40 — objets liés aux compétences et barre toujours visible

Cette préversion relie les objets d’inventaire aux caractéristiques et aux
compétences de la fiche : un objet coché ajoute enfin ses modificateurs aux
totaux.

## Ajouté

- chaque objet, dans tous les rangements d’une fiche, possède un bouton « lier »
  qui ouvre une fenêtre où l’on écrit un modificateur positif ou négatif et où
  l’on choisit sa cible dans une liste cherchable ;
- les cibles proposées couvrent la vie, la rapidité, l’échec et la réussite
  critiques, la folie, le destin, la moralité, la notoriété, les bonus de dégâts
  et d’armure, les dix caractéristiques principales et toutes leurs compétences ;
- un même objet peut porter plusieurs liens ;
- les liens enregistrés s’affichent sous l’effet de l’objet, en pastilles
  compactes, estompées tant que l’objet n’est pas équipé ;
- la colonne « Mod. » de l’onglet Compétences additionne les liens des objets
  cochés et les totaux en tiennent compte, plafonnement entre 10 et 90 compris ;
- le survol d’une compétence, d’une caractéristique, de la vie, de la rapidité,
  des critiques, des dégâts, des armures, de la folie, du destin, de la moralité
  et de la notoriété liste les objets concernés avec une case pour les équiper ou
  les déséquiper sans quitter l’onglet.

## Modifié

- la barre supérieure — menu, fil d’Ariane et vue en cours — reste visible en
  permanence, quel que soit le défilement de la page ;
- les cases à cocher d’équipement, réservées jusqu’ici aux armes, existent
  désormais dans tous les rangements d’une fiche sauf la bourse ;
- le rangement « purement esthétique » permet de chercher dans tout le catalogue
  d’objets, comme le sac à dos, tout en restant exclu du placement automatique ;
- un objet déplacé ou transféré conserve son équipement et ses liens ;
- les charges de sort se comportent comme une barre : cliquer une étincelle
  pleine vide les charges jusqu’à elle comprise, cliquer une étincelle vide les
  remplit jusqu’à elle comprise ;
- les charges disponibles s’affichent en pleine opacité et les charges dépensées
  en opacité réduite, y compris dans le raccourci de l’onglet Compétences ;
- la feuille « Contenu inventaire » reçoit une colonne « Modificateurs » ; les
  feuilles existantes sont complétées automatiquement, sans perte de données.

## Vérifications

- lint sans erreur ;
- build Vinext complet ;
- suite de tests d’interface au vert, avec deux nouveaux tests couvrant le calcul
  des modificateurs et leur report dans les totaux de la fiche ;
- serveur desktop construit et vérifié en HTTP 200.
