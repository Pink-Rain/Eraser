# Eraser 0.1.1-alpha.260 — Des tokens pour toute la ménagerie

Cette version arrive **sans réinstallation** (enveloppe 10, comme l'alpha 238) : Eraser la
télécharge, redémarre son serveur et recharge la page tout seul. Rien n'est modifié dans Google
Sheets.

- **PNJ compagnon reconnu tout seul** : un PNJ pris comme compagnon par un personnage prend
  l'émail bleu clair n°3 par défaut, partout (page des PNJ, Index des PNJ, créateur de session)
  et dans les tokens que fait le compagnon Roll20. Eraser le sait en lisant les onglets
  Compagnon des fiches, en une lecture gardée en mémoire.
- **Tokens des compagnons dans la fiche** : sous l'image de chaque compagnon, un bouton Token.
  Une créature compagnon a son propre token (émail bleu clair n°3 par défaut), distinct de celui
  de l'Index des créatures ; un PNJ compagnon partage le sien avec le MJ. Le joueur prépare le
  token de ses compagnons, et seulement des siens.
- **Créateur de session** : les créatures et les PNJ génériques ont un bouton **Modifier** (nom,
  image, étiquette, description), qui ouvre la même fenêtre que la page Événements, avec le
  bouton **Token**. Le token d'une créature est celui de sa fiche dans l'index.
- **Page Événements** : le bouton Token est aussi dans la fenêtre de modification des créatures
  et des PNJ génériques.
