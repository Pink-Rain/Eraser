# Eraser 0.1.1-alpha.59 — Tokens et Roll20 0.7.0

Cette version arrive par la mise à jour sans réinstallation. Le compagnon Roll20
et le script Mod passent en 0.7.0 : mets à jour les deux depuis la page Roll20
de la campagne.

## Tokens

- Un bouton discret **« Token »** apparaît sous l’avatar : fiche de personnage,
  fiche d’un PNJ (partout où on la modifie), fiche d’une créature et fenêtre
  « Modifier le magasin ». Ouvert depuis une fenêtre, il s’affiche par-dessus
  sans la fermer.
- La fenêtre montre l’avatar dans un cercle au cadre ancien : **doré** pour les
  joueurs, **cuivré** pour les PNJs, **argenté** pour les créatures. On glisse
  l’image pour la recentrer, on tire un coin (ou la molette) pour la
  redimensionner sans la déformer, puis « Enregistrer le token ».
- **Magasins** : le cadre est une devanture d’échoppe, avec un auvent rayé et une
  enseigne propres à chaque type (marché, librairie, antiquaire, armurerie,
  marché noir, alchimiste, taverne). Avec un vendeur, son portrait est dans la
  devanture ; sans vendeur, le fond prend les couleurs du magasin.
- Le token est enregistré dans le Drive partagé (image ronde avec sa bordure).
  Le bouton en affiche l’aperçu.
- Une créature a besoin d’une image importée (pas seulement une URL collée) pour
  avoir un token.

## Roll20 0.7.0

- Chaque fiche reçoit **l’avatar en portrait** et **le token rond comme jeton
  par défaut**.
- **Personnages joueurs** : « Tout synchroniser » et « Synchroniser une session »
  créent aussi leurs fiches (nom, PV, portrait, token). Le MJ les attribue à la
  main : aux synchronisations suivantes, le contrôle, les journaux et l’endroit où
  la fiche est rangée ne sont jamais modifiés.
- **Synchroniser une session** range ses PNJs et magasins dans un **dossier du
  Journal au nom de la session**, en y déplaçant ceux qui existaient déjà. Les
  fiches des joueurs restent là où elles sont.
- Le menu déroulant des sessions du compagnon est de nouveau lisible.

## Créateur de session

- Les cartes des joueurs affichent le titre, la classe et le peuple choisis
  (plus le texte brut enregistré dans la feuille).
- Les magasins sont fermés par défaut. Ouvrir ou fermer un magasin fait de même
  avec celui qui est sur la même ligne.

## Vérifications

- lint sans erreur, build de production et build desktop réussis, serveur desktop
  vérifié en HTTP 200 ;
- 22 tests d’interface et 4 tests du pont Roll20 au vert (dont le dossier de
  session, et une fiche joueur qui garde son contrôle et ses journaux) ;
- cadres dorés, cuivrés, argentés et devantures dessinés et vérifiés à l’écran.
