# Eraser 0.1.1-alpha.83 — Un seul moteur pour tous les index

Cette version arrive par la mise à jour sans réinstallation.

## Tous les index partagent le même moteur

Créatures, lieux, religions, peuples, langues, états, runes, attributs, matériaux,
objets, sorts des classes et des créatures, PNJ, campagnes et personnages passent
maintenant par le même moteur de colonnes. Chaque
colonne a un **type**. Survole son en-tête pour le lire (par exemple « Type : Liste
déroulante · Formulaire »). Un même type se comporte partout de la même façon.

Les types :

- **Texte enrichi** : c'est la norme. Gras, couleurs, listes et liens sont
  enregistrés dans Sheets.
- **Affichage fixe** : l'apparence est imposée par Eraser (nom en gras, compétences
  en rouge…) et la mise en forme est retirée.
- **Nom** : obligatoire, enregistré à la sortie de la cellule, renommé partout où
  il est cité.
- **Nom formulaire** : le nom ouvre la fiche (créatures, PNJ) ou la page
  (campagnes, personnages).
- **Identifiant** : présent dans tous les index, généré par Eraser, non modifiable.
- **Colonne liée ↔** : du texte enrichi, recopié dans la colonne qui lui répond.
- **Liste déroulante** : avec recherche. Une valeur hors liste reste en italique.
- **Liste déroulante liée** : les noms viennent d'un autre index, et un nom absent
  y est créé. C'est le cas du Peuple des PNJ.
- **Case à cocher**.
- **Liens automatiques** : Eraser trouve lui-même où l'élément existe et en fait
  des liens (campagnes d'un PNJ, personnages d'une campagne, campagnes d'un
  personnage).
- **Liens classés** : des pastilles avec un rang (« Classes et rangs » des sorts).
- **Onglet** : l'onglet d'un lieu dans la vue « Tout ».
- **Image** : importer une image ou coller une adresse, dans le tableau comme dans
  les fiches.
- **Sélecteur de sorts** : « Sorts des classes », « Sorts des créatures » ou les deux.
  Un sort déjà inscrit qui vient de l'autre index garde sa carte.
- **Jauge** : un nombre affiché en icônes à cliquer, en barre ou en anneau.
- **Nombre**.
- **Formulaire** s'ajoute au type d'une colonne qui ne vit que dans la fiche.
- **Archivée** : une ancienne colonne gardée dans Sheets, jamais affichée.

## Ce qui change dans les index

- **Colonnes courtes en texte enrichi** : Type, Sous-type, Peuple, Langues… des
  index du monde, Distance des sorts, Titre et Fonction des PNJ. Un texte sans mise
  en forme reste du texte simple dans Sheets.
- **Fautes des listes des créatures** : un bouton « Corriger N fautes » apparaît
  quand des cellules sont mal orthographiées (« Aggressif » → « Agressif »,
  « Forêt noir » → « Forêt noire »). Il ne réécrit que ces cellules. Les valeurs
  hors liste ne sont pas touchées.
- **Identifiants** : chaque index du monde reçoit une colonne « ID », ajoutée à
  droite dans Sheets sans rien déplacer. Les lignes existantes reçoivent leur
  identifiant au premier affichage (CRE-…, LIE-…, REL-…, DIV-…, PEU-…, LAN-…,
  ETA-…, RUN-…, ATT-…, MAT-…).
  Une ligne copiée reçoit le sien. Les objets sans colonne ID montrent
  l'identifiant calculé, sans rien écrire.
- **Charges des sorts** : des étincelles à cliquer.
- **Type des sorts** : une liste avec recherche, dans la couleur de sa catégorie ;
  un type libre reste possible.
- **Icône et Image des objets** : des colonnes Image. L'icône garde son affichage
  (icône d'Eraser, image du Drive, émoji) et son import dans le dossier « icone
  objet ». On peut aussi y coller une adresse.
- **Case « Actif » des objets** : une case à cocher. Une vraie case Google Sheets
  reste une case.
- **Portraits des créatures et des PNJ** : le même champ Image, avec le bouton
  Token juste en dessous.
- **Formulaire d'ajout** : il est construit à partir des types. Les objets ajoutés
  gardent enfin leur mise en forme au lieu d'écrire leurs balises dans Sheets.
- **Index des campagnes et des personnages** : même grille que les autres, en
  lecture seule (tri, filtres, recherche, largeurs), avec liens automatiques, ID,
  classe et rang des personnages, et la mise à la corbeille.

## Vérifications

- dans un vrai navigateur : liste corrigée à l'affichage (« Aggressif » affiché
  « Agressif »), choix enregistré, case à cocher, liste liée qui crée « Orques »
  dans l'Index des peuples, jauges en icônes, en barre et en anneau, image par
  adresse, import propre à la colonne Icône, sélecteur qui ne propose que les sorts
  des créatures, formulaire d'ajout ;
- lint sans erreur, 31 tests d'interface au vert (dont le registre des types et la
  construction des colonnes), build et serveur desktop vérifiés en HTTP 200.
