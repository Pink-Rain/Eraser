# Eraser 0.1.1-alpha.164 — Les decks et les formes proportionnelles

Cette version arrive par la mise à jour sans réinstallation.

## Nouvel outil de spécificité : le Deck

Dans **Création des classes → Spécificités → Ajouter une spécificité → Deck** :

- Nom, couleur, emplacement sur la fiche (sous la vie, bandeau ou onglet Sorts), taille
  maximale de la main, et tirage **au hasard** ou **au choix** du joueur.
- Les cartes sont celles de l'onglet « Cartes » du classeur « Sorts de classe » : les
  cartes déjà écrites pour la classe sont reprises telles quelles. On peut en ajouter, les
  modifier (nom, icône, effet en texte riche avec `{index:ligne}`) ou en retirer.
- Un aperçu à droite permet d'essayer le deck pendant qu'on le règle.

Sur la fiche, le joueur pioche, défausse, retire une carte du jeu, la remet dans la
pioche, tire au hasard dans la défausse ou remet tout dans la pioche. L'effet d'une carte
s'affiche au survol. Seules la main, la défausse et les cartes retirées sont gardées dans
la fiche : une carte ajoutée plus tard arrive d'elle-même dans la pioche.

## Effets de forme proportionnels à une jauge

Un effet de forme accepte maintenant une formule : `+{Folie temporaire} * 2` donne +2 par
point de folie. Dans l'éditeur, taper le nombre puis cliquer sur la puce
« Proportionnel à : … » de la jauge l'écrit pour vous. La fiche affiche le calcul
(« +{Folie temporaire} × 2 (+6) »).

Rien n'est créé ni recréé dans le Drive : l’onglet « Decks » n’est ajouté que s'il
manque, et l'onglet « Cartes » existant est gardé tel quel.
