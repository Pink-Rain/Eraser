# Eraser 0.1.1-alpha.155 — Fiche de personnage : check-up, bonus de rang pour tous, plus rapide

Cette version arrive par la mise à jour sans réinstallation.

## Bonus de rang

- Les bonus de **chaque rang atteint** et pas encore obtenu sont proposés, sur **tous les
  personnages**, y compris ceux créés avant les bonus de rang (ils ne recevaient jusqu'ici
  que les rangs gagnés après coup).
- Déjà reportés à la main ? **« Déjà ajoutés à la main »** note le rang comme obtenu sans
  rien ajouter une seconde fois.
- Les bonus d'un rang et le rang noté comme obtenu s'enregistrent **ensemble ou pas du
  tout** : si la fiche a changé ailleurs au même moment (le MJ pose un état), rien n'est
  ajouté en double. Même chose pour une descente de niveau.
- La fenêtre de choix ne reste plus figée si le même rang revient.

## Fiche de personnage

- **Son** `desequiperitem` quand on décoche (déséquipe) un objet.
- **Classe** : après avoir retiré la dernière classe, on peut de nouveau en ajouter une.
- **Onglet Sorts** : le bloc « Progression de classe », devenu inutile, est retiré.
- **Fiche introuvable** : Eraser relit Google Sheets avant de conclure ; sinon, une page
  avec le menu, « Revenir à l'accueil » et « Réessayer ». Plus de page blanche « not
  found » sans retour (et « Revenir en arrière » sur toute page introuvable).
- **Nom vide** : refusé tout de suite. Il bloquait auparavant tous les enregistrements
  suivants de la fiche.
- Un refus du serveur (nom, image de plus de 10 Mo) est **dit clairement** et n'empêche
  plus le reste de s'enregistrer ; « Réessayer » renvoie bien un portrait pas encore parti,
  et le même portrait peut être choisi deux fois de suite.
- **Nombres à virgule** (« 12,5 ») : la vie, les compteurs et les boutons +/− les lisent
  correctement (« 12,5 » était lu 0 dans la vie).
- **Niveau** : toujours un entier positif (« -1 » devient 0, « 3,5 » devient 3).
- Les langues, religions et titres tapés pendant un enregistrement ne sont plus effacés.
- Un double clic sur « Ajouter l'onglet » n'ajoute plus deux onglets.
- Cliquer sur une case ouverte au survol (compétence, carte, déplacement) ne la referme
  plus aussitôt.

## Plus rapide

- Ouvrir et enregistrer une fiche demande **un appel Google de moins** (sa ligne est
  retrouvée directement, toujours vérifiée par son ID).
- La fiche et l'Index des caractéristiques sont lus **en même temps**.
- Les classes et sorts restent en mémoire d'une fiche à l'autre : ouvrir un deuxième
  personnage est immédiat.
- Les champs se referment **sans attendre Google** : la valeur est affichée tout de suite,
  l'enregistrement continue derrière (« Enregistrement… »).
- Les sorts liés à chaque compétence ne sont plus recalculés à chaque modification.
