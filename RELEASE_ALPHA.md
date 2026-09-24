# Eraser 0.1.1-alpha.65 — Éditeurs de texte réparés, fiche grise dès 0 PV

Cette version arrive par la mise à jour sans réinstallation.

## Fiche de personnage

- **La fiche passe en gris dès 0 PV**, plus seulement en dessous. Le rouge ne
  change pas : à moins la vie totale ou en dessous.
- Une fiche dont la vie totale n’est pas encore renseignée (« 0 / 0 ») reste
  normale.

## Éditeurs de texte : double-clic et curseur

Dans plusieurs formulaires, l’éditeur de texte était posé dans une étiquette
de champ (`<label>`). Le navigateur renvoyait alors chaque clic dans le texte
au premier bouton de la barre, **« Gras »**. Résultat : le curseur sautait au
début ou restait ailleurs, le **double-clic ne sélectionnait pas le mot**, et
des mises en forme « non gras » invisibles se glissaient dans le texte.

C’est corrigé partout où c’était le cas :

- fiche de **PNJ** : Notes, Notes MJ, Description / Histoire / Lore ;
- **création d’objet** dans un inventaire : Description et Effet ;
- **relations** d’un personnage : Description et Notes personnelles ;
- **fiche de classe** et **Index des classes** (création de sort) : Effet et
  Description ;
- **Index des objets** et index du monde (lieux, peuples, langues, religions,
  créatures) : champs longs du formulaire d’ajout ;
- **fiche de créature** : Description, Histoire, Lore, Autre.

Et en prévention, l’éditeur se protège lui-même s’il se retrouve un jour dans
une étiquette.

Autre défaut trouvé en vérifiant : sous un titre en demi-gras, le texte des
notes héritait de ce demi-gras, et le bouton « Gras » **retirait** le gras au
lieu de l’ajouter. Les éditeurs sont maintenant en graisse normale : « Gras »
fait ce qu’il annonce.

## Vérifications

- dans un vrai navigateur, sur chaque type d’éditeur (fiche PNJ ×3, cellule
  d’index, éditeur des classes au double-clic, description d’objet
  d’inventaire, et un éditeur volontairement placé dans une étiquette) :
  double-clic qui sélectionne le mot, clic qui place le curseur au bon endroit,
  aucune mise en forme parasite ; gras, couleur, case à cocher et lien vers une
  page toujours fonctionnels ;
- nouveaux tests : règle gris / rouge de la fiche, aucun éditeur dans une
  étiquette (vérifié sur tout le code), nom accessible des éditeurs ;
- lint sans erreur, 25 tests d’interface et 6 tests du pont Roll20 au vert,
  build de production et build desktop réussis, serveur desktop vérifié en
  HTTP 200.
