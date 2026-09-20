# Eraser 0.1.1-alpha.30 — les magasins

## L'app ne peut plus annoncer un enregistrement qu'elle n'a pas vérifié

Jusqu'ici, enregistrer un magasin voulait dire : envoyer les lignes à
Google, et si Google ne renvoie pas d'erreur, afficher « Magasin(s)
sauvegardé(s) ». Une écriture acceptée mais sans effet — dans un onglet
que l'app ne relit pas, hors de la grille — était donc indiscernable d'un
vrai succès. C'est exactement ce qui se passait : message vert, aucun
magasin dans la liste.

Maintenant, après chaque écriture, l'app relit la feuille et vérifie que
les magasins y sont. S'ils n'y sont pas, elle le dit clairement au lieu
de féliciter dans le vide. Cela vaut pour le tirage, la sauvegarde d'un
magasin et l'ajout à la campagne.

## Test d'écriture dans le diagnostic

Administration › Google Drive et Sheets a un lien « Tester aussi
l'écriture ». Pour chaque feuille, l'app y ajoute une ligne témoin, la
relit, puis l'efface — et rapporte lequel des trois a échoué, avec
l'erreur brute de Google. C'est ce qui permet de distinguer « Google
refuse » de « Google accepte mais la ligne n'arrive pas où l'app
regarde ».

## Ordre d'authentification

La route d'enregistrement des magasins était la seule route d'écriture de
l'application à lire le corps de la requête avant de résoudre le compte.
Elle suit maintenant l'ordre de toutes les autres.

## Vérifications

- `npm run build` réussi ;
- lint sans erreur ;
- `npm run desktop:parity` : 0 fichier manquant, 0 style modifié.
