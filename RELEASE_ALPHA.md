# Eraser 0.1.1-alpha.54 — l’Index des PNJ, et des caractéristiques en couleur

Première version livrée **sans réinstallation** : Eraser la télécharge, puis
propose « Appliquer maintenant ».

## Ressources

- **Index des personnages** et **Index des campagnes** : les anciennes pages
  « Tous les personnages » et « Toutes les campagnes » quittent
  l’Administration pour Ressources, et les MJ y ont accès. Seul un
  administrateur voit l’adresse e-mail des propriétaires et peut les changer
  (« Attribuer à »). Les anciens liens mènent aux nouvelles pages.
- Les rubriques « Personnages » et « Campagnes » disparaissent du menu.
- **Index des PNJ** : nouveau tableau avec Nom, Titre, Peuple et
  Fonction / classe / métier. Un clic sur le nom ouvre la fiche complète. Le
  peuple se choisit dans l’Index des peuples. L’index est une bibliothèque de
  PNJ hors campagne : une campagne ou le bac à sable peut y **récupérer** un PNJ
  (copie ou déplacement), et l’index peut récupérer ceux d’une campagne.

## La fiche des PNJ, partout

- Nouveaux champs : **Titre**, **Fonction / classe / métier**, **Peuple**.
- Les caractéristiques sont celles des créatures : Force, Dextérité,
  Intelligence, Sagesse, Charisme, **Vitesse** et **Vitalité**. La Vitalité
  est la vie totale du PNJ, la Vitesse sa rapidité. La Constitution quitte la
  fiche, mais sa valeur reste dans Sheets.
- **Vie actuelle et Sac à dos n’existent que pour un PNJ de campagne.** Dans
  le bac à sable et l’Index des PNJ, la fiche ne les montre plus, et un PNJ
  arrive en campagne avec toute sa vie.
- Le tabletop affiche les mêmes sept caractéristiques, dans les mêmes couleurs.

## Couleurs des caractéristiques

Comme dans la fiche de personnage : Force, Dextérité, Intelligence, Sagesse et
Charisme en **bleu**, Vitesse et Vitalité en **orange**. Créatures, PNJ et
tabletop partagent le même bloc.

## Fiche des créatures

- « Description, Histoire, Lore, Autre » passe dans la colonne de droite, sous
  les emplacements.

## Dans Google Sheets

- La feuille « PNJs » reçoit une colonne **« Titre »**, ajoutée à la fin.
  Aucune colonne existante ne bouge. Fonction, Peuple et Vitesse réutilisent
  les colonnes « Classe / métier », « Peuple » et « Rapidité », déjà remplies
  pour plusieurs PNJ.
- L’annuaire de comptes partagé laisse désormais les MJ lire la liste des
  comptes, pour afficher les propriétaires dans les deux nouveaux index.

## Vérifications

- dans un vrai navigateur : note de la créature à droite ; bleu et orange des
  caractéristiques ; fiche PNJ du bac à sable sans vie actuelle ni sac à dos,
  fiche de campagne avec ; Vitalité enregistrée comme vie totale ; Index des
  PNJ à quatre colonnes, peuple choisi dans l’Index des peuples et enregistré,
  fiche ouverte depuis le nom ;
- lint sans erreur, 20 tests d’interface au vert, serveur desktop vérifié en
  HTTP 200.
