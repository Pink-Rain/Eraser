# Eraser 0.1.1-alpha.132 — Tri fiable, mises en page sans code, cartes de personnages, fluidité

Cette version arrive par la mise à jour sans réinstallation.

## Index

- **Tri de A à Z fiable** : le tri lit ce que la case affiche, plus le texte brut de Sheets.
  Une formule se trie sur son résultat, une liste sur son choix bien écrit, une référence
  « { » sur le nom actuel de sa ligne, un nombre ou une jauge sur sa valeur, une case à
  cocher sur son état. Guillemets, émojis et mise en forme ne comptent plus. Les cases
  vides restent en bas dans les deux sens.
- **Mise en page de la fiche** (Modifier › « Mise en page de la fiche ») : une colonne
  latérale (portrait, image), des sections avec titre (encadrées ou non), plusieurs champs
  par ligne, chacun de sa largeur (¼, ⅓, ½, ⅔, ¾ ou plein), en grand ou sans son nom.
  Glisser-déposer ou flèches, aperçu en direct. Elle vaut pour la fiche et pour le
  formulaire « Ajouter », dans tous les index, existants comme nouveaux. Une colonne
  ajoutée plus tard s'affiche à la suite (ou reste masquée, au choix). Sans mise en page,
  rien ne change.
- **Survol d'une ligne citée avec « { »** (Modifier › « Survol ») : l'image et le
  sous-titre en tête, puis les colonnes choisies, rangées de la même façon. Pour les
  joueurs, les colonnes privées restent cachées.
- **Style imposé** : la couleur du texte et du fond peuvent venir, ligne par ligne, d'une
  colonne Couleur de l'onglet (dans le tableau et dans les références).
- Les mises en page sont gardées dans « Eraser · Réglages des index », nouvel onglet
  « Mises en page », créé au premier enregistrement.

## Personnages

- **Fini les `["…"]`** : peuple et titre sont lus correctement partout (journal de
  relations, accueil, profil, tabletop, références).
- **Titre honorifique** à la place du peuple sur les cartes de l'accueil et du profil.
- **Journal de relations** : un personnage joueur s'affiche « Nom », « Joueur • Campagne »,
  « Titre honorifique » (au survol, dans la colonne et dans la recherche).
- **Fiche** : au survol d'une caractéristique ou d'une compétence, un petit « ? » montre sa
  description, lue dans la colonne « Description » de l'index des caractéristiques et
  compétences (mise en forme comprise).
- **Campagne** : le nom du joueur apparaît à côté de chaque personnage, dans la liste
  d'ajout (« Nom • Joueur ») et sur les cartes du groupe.

## Fluidité

- Les clics n'attendent plus le serveur de comptes : liens d'identité, session et liste
  des comptes sont servis tout de suite et revérifiés en arrière-plan. Un serveur partagé
  qui ne répond plus ne fige plus l'application (15 s au plus).
- Les pages des administrateurs n'attendent plus une relecture complète des feuilles.
- Le catalogue des objets, les icônes, les classeurs de réglages et des classes ne font
  plus attendre leur relecture ; le cache de Google Sheets garde les plages les plus
  utilisées et n'est plus vidé sans raison.
- Revenir sur une page déjà vue est immédiat : afficher des références ou écrire dans le
  chat ne vide plus la mémoire des pages.
- Les grands tableaux s'affichent par tranches, la recherche suit la frappe sans ralentir,
  les fenêtres « Modifier » et le guide se chargent à leur ouverture.
- Le chat rejoint son salon en direct une fois l'application au repos (ou à son
  ouverture), et plus sur le tabletop qui a le sien.
- L'enveloppe de l'application ne se redessine plus entière à chaque page ; les effets
  animés des états ne font repeindre qu'eux-mêmes.
