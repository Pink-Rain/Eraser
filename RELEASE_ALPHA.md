# Eraser 0.1.1-alpha.188 — Le dossier de campagne et ses statistiques

Cette version arrive par la mise à jour sans réinstallation.

## Dossier de campagne

- **Bannière** plus basse et plus jolie : l'image de la campagne (ou sa couleur) sous un dégradé
  transparent qui porte le nom de la campagne et sa description.
- **Le groupe, personnage par personnage**, sur toute la largeur : PV (barre, « à terre »,
  « mort »), états posés, classe et rang, succès, chutes et retours, objets reçus (avec ceux rares
  ou mieux, détail au clic), or (PO), cuivre (PC) et or noir (PN). Chaque colonne se trie ; en bas,
  la **moyenne** et la **somme** du groupe pour chaque colonne.
- Dessous, côte à côte : **PNJs du groupe** et **PNJ rencontrés** (anneau amis / neutres /
  hostiles, d'après les relations des personnages ; filtre au clic), avec l'encart des pages de la
  campagne à droite et le compagnon Roll20 sous les PNJ.
- Les **chutes** (la vie tombe à 0 ou moins), les **retours** (elle repasse au-dessus) et les
  **objets reçus** (ajoutés, achetés ou créés ; pas les échanges entre personnages) n'étaient
  enregistrés nulle part : ils sont notés à partir de cette version, dans le serveur partagé
  (aucune lecture Google en plus).
- Tout le dossier se lit avec des lectures déjà gardées en mémoire ; une partie illisible (Google
  saturé) reste vide sans bloquer la page.

## Corrections

- Les petits menus déroulants (tri des relations, réglages de l'éditeur…) ne coupent plus leur
  texte en bas.
- Journal des erreurs : une synchronisation de routine remise faute de quota Google (elle est
  retentée seule 20 s plus tard) n'y entre plus ; un vrai échec de lecture, si.
- « Actualiser » relit aussi l'emplacement des sorts des créatures.

## Corrections de l'alpha 187 (relecture)

- **Sorts renommés** : un nom porté par deux sorts (deux « Soin », ou un sort de classe et un sort
  de créature, que les PNJ mêlent) n'est plus renommé chez les créatures et les PNJ : impossible de
  savoir lequel ils citent. Un renommage ne laisse plus de doublon dans une case.
- **Valeur d'une nouvelle ligne** : n'est plus écrite dans les cases vides d'une ligne
  **déplacée** vers un autre onglet, ni dans une ligne existante qui reçoit un nouvel identifiant.
  Une valeur d'office d'Eraser (« Non » des PNJ) peut maintenant être vidée pour de bon.
- **Carnet de notes** : deux pages ne peuvent plus porter le même nom (« Notes 2 »), et l'éditeur
  repart de zéro à chaque page ouverte : supprimer une page ne peut plus montrer son texte ni
  l'écrire dans la suivante. Une installation pas encore à jour (alpha 186 ou avant) qui modifie
  un carnet en pages le remet en une seule page (le texte reste, pas les noms des pages).
- Colonne « Onglet » : sa place suit le renommage de la colonne après laquelle elle est rangée ;
  des réglages mal formés sont ignorés au lieu de bloquer l'enregistrement.
- Journal des erreurs : seuls les messages de Node et du serveur web eux-mêmes sont écartés, plus
  une erreur d'Eraser qui citerait le même code.
- Corbeille : une colonne mise à la corbeille depuis une autre installation y apparaît en quelques
  minutes, sans « Actualiser ».
- Un renommage de sort qui échoue après l'enregistrement de la fiche ne la fait plus passer pour
  ratée.
