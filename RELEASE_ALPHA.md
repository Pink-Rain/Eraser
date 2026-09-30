# Eraser 0.1.1-alpha.84 — Modifier les index, Nouvel index, nouveaux types

Cette version arrive par la mise à jour sans réinstallation.

## « Modifier » sur tous les index

Un bouton **Modifier** apparaît à côté de « Actualiser » sur chaque index. Il ouvre
l'éditeur des colonnes et des onglets :

- renommer une colonne, changer son type et ses réglages, la masquer ;
- créer ou supprimer une colonne ;
- créer ou supprimer un onglet.

Rien n'est écrit dans Google Sheets avant « Enregistrer ». Le bas de la fenêtre
liste les changements qui vont être faits.

Une colonne ou un onglet supprimé part dans la **corbeille** (Administration →
Corbeille), avec les autres éléments supprimés. On peut l'y restaurer. « Supprimer
définitivement » l'efface alors de la feuille.

Les réglages sont rangés dans un onglet discret, « Eraser · colonnes », de chaque
classeur. Ils sont donc partagés par toutes les installations. Supprimer cet onglet
ramène simplement les colonnes à leur type par défaut.

### Les cadenas

Un cadenas marque ce qu'il vaut mieux ne pas toucher pour ne rien casser. Son
survol dit ce qui lit la colonne et ce qu'on peut quand même changer. Par exemple,
pour « Prix » dans les objets : « L'inventaire des personnages, les boutiques et la
table lisent le prix dans la colonne « Prix » par son nom : la renommer ou la
supprimer la rendrait introuvable. » On peut encore changer son type d'affichage.

Les sorts, les PNJ, les campagnes et les personnages ont aussi un « Modifier ».
Il est en lecture seule pour l'instant : leurs colonnes sont lues une par une par
Eraser, et chaque cadenas explique pourquoi.

## « Nouvel index »

Le bouton **Nouvel index**, en haut à droite de la page Index, crée un index
complet : un titre, une description, des onglets et leurs colonnes.

- Le classeur « Index · titre » est créé dans le Drive d'Eraser. S'il existe déjà
  une feuille de ce nom, elle est reliée et jamais recréée.
- Chaque onglet reçoit d'office une colonne « Nom » et une colonne « ID ».
- Les index créés apparaissent dans la section « Index créés ».

## Nouveaux types de colonnes

- **Nombre**, avec ou sans format :
  - unité et décimales, texte avant/après, pourcentage ;
  - **plage** (« 2–5 m ») ;
  - familles convertibles :
    - distance : cm, m, km ;
    - poids ;
    - **monnaie** : PO, PC, PN, avec 1 PO = 100 PC et 1 PN = 1,5 PO.
- **Prix en PO / PC / PN**, choisis cellule par cellule :
  - un clic sur l'unité pour convertir, ou écrire directement « 10 PC » ;
  - le survol montre les trois monnaies ;
  - les **PA** et **PB** n'existent pas et sont lues comme des PC. Un bouton
    « Corriger N prix » les réécrit dans l'Index des objets ;
  - les prix se trient par leur valeur : 50 PC passe avant 2 PO.
- **Couleur** : une pastille et un sélecteur.
- **Fichier** remplace Image, avec :
  - le type accepté par colonne : images, sons, vidéos, PDF ou tous ;
  - un seul fichier ou plusieurs. Une galerie est un Fichier (images, plusieurs).
  - Les icônes des objets sont des Fichiers (image, un seul) et gardent leur import
    dans « icone objet ».
- **Recherche** : elle montre, en face, une colonne des lignes reliées. Par exemple,
  la région des peuples d'un lieu.
- **Agrégat** : il calcule sur les lignes reliées :
  - nombre, remplies, vides ;
  - somme, moyenne, minimum, maximum (une somme de prix reste en PO/PC/PN) ;
  - valeurs uniques ;
  - pourcentage coché.
- **Masquée** : la colonne est cachée du tableau. Les identifiants le sont d'office.
  Le bouton « Colonnes masquées (N) » de la barre du tableau les montre d'un clic.

## Boutiques des campagnes

Pour le MJ, un clic sur un prix ouvre les trois monnaies. Choisir l'une d'elles
convertit le prix, et c'est celle que voient les joueurs. « Modifier le prix… »
(ou un double-clic) permet d'écrire le prix directement. Le survol des trois
conversions est réservé au MJ.
