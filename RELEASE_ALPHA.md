# Eraser 0.1.1-alpha.78 — Statistiques des classes, pages de classe rapides

Cette version arrive par la mise à jour sans réinstallation.

## Index › Sorts des classes : onglet « Statistiques »

Un menu déroulant choisit la classe comparée à la moyenne des autres classes qui ont
des sorts. Survoler une barre affiche le détail.

- **La classe face aux autres** : compétences utilisées, types d’actifs (instantané,
  action majeure, action mineure), charges des actifs, portée des actifs, sorts en
  commun avec les autres classes.
- **Vue d’ensemble** : compétences les plus utilisées, types d’actifs classe par
  classe, carte des sorts partagés entre chaque paire de classes.
- **Ce que disent les fiches** (lues dans Google Sheets, corbeille exclue) : sorts
  choisis à chaque rang pour la classe comparée (un sort jamais choisi apparaît en
  rouge), classes jouées, rangs des personnages et rang moyen par campagne, charges
  dépensées en ce moment sur les fiches.
- Les compétences écrites de plusieurs façons sont regroupées (« Volonté mental » et
  « Volonté mentale », « Bluff, mensonge » et « Bluff / Mensonge »…).

## État des classes : qualité des données

- Nouveau panneau « Compétences à harmoniser » : compétences écrites de plusieurs
  façons, compétences absentes de la liste de la fiche de personnage, sorts avec
  « / » ou « . » comme compétence, actifs sans compétence, sorts sans nom.

## Règles › Classe : pages rapides

- Ouvrir une classe relisait à chaque fois les deux classeurs entiers dans Google
  Sheets : plusieurs secondes d’écran vide. La page s’affiche maintenant tout de
  suite (nom de la classe et « Chargement… »), puis le contenu arrive.
- Les classeurs lus sont gardés en mémoire et relus en arrière-plan ; toute
  modification faite dans Eraser (sort, lien, présentation) les fait relire.
- Ouvrir la liste des classes prépare déjà les présentations et les bonus de rang :
  le premier clic sur une classe est immédiat.

## Tableau de bord de campagne : portraits

- Les portraits des PNJ du groupe étaient refusés aux joueurs quand le PNJ n’était
  pas marqué « dans la campagne ». Ils s’affichent maintenant pour tous.
- Un portrait ajouté depuis un autre ordinateur apparaît en une minute au plus
  (au lieu de cinq).

## Chercher les mises à jour

- Message court : « Aucune mise à jour » ou « Eraser 0.1.1-alpha.XX en cours de
  téléchargement ».

## Vérifications

- dans un vrai navigateur, sur les vrais sorts : onglet Statistiques complet (avec
  des fiches d’exemple pour la partie joueurs), panneau de qualité des données ;
- regroupement des compétences testé sur les variantes réelles de la feuille ;
- cache des classeurs testé (valeur fraîche, valeur périmée servie pendant la
  relecture, oubli après modification) ;
- lint sans erreur, 29 tests au vert, build et serveur desktop vérifiés.
