# Eraser 0.1.1-alpha.259 — Parchemins et grimoires

Cette version arrive **sans réinstallation** (enveloppe 10, comme l'alpha 238) : Eraser la
télécharge, redémarre son serveur et recharge la page tout seul. Dans Google Sheets, une
feuille « Documents de campagne » est créée au premier document enregistré (jamais en double :
une feuille de ce nom déjà présente dans le Drive est reprise).

## Les documents

La page **Document** (menu › Créateur de session) n'est plus vide.

- **Un fond** : trois fournis (parchemin brûlé, rouleau, livre ouvert), qui arrivent avec des
  zones de texte prêtes à remplir, ou une image de l'ordinateur, ou une adresse d'image.
- **Autant de zones de texte que tu veux** : clique pour écrire, trace un rectangle sur le fond
  pour en créer une, glisse son cadre pour la déplacer, un coin pour la redimensionner, la
  poignée ronde pour **écrire en biais** (Maj : par pas de 15°). Le centre s'aimante au milieu
  du document.
- **L'éditeur de texte** : dix polices (vieux livre, inscription, plume élégante, écriture
  pressée, onciale, médiéval, gothique… embarquées dans Eraser), taille, gras, italique,
  souligné, barré, couleurs d'encre (sur le texte choisi ou toute la zone), alignement
  (justifié compris), position dans la zone, interligne, espacement des lettres, opacité, et
  l'encre qui se mêle au grain du papier. Annuler / refaire (Ctrl+Z, Ctrl+Y), dupliquer
  (Ctrl+D), Ctrl+S pour enregistrer. Un brouillon non enregistré est gardé et proposé à la
  réouverture.
- **En session** : le Créateur de session a une partie Documents. « Donner à… » met le document
  dans l'inventaire du joueur (au sol si son sac est plein, il est prévenu comme pour un item
  reçu) ; il l'ouvre d'un clic (« Lire »), en grand, et peut télécharger son PDF.

## Roll20 (compagnon et script Mod 0.8.0 — à mettre à jour tous les deux)

- **« Mettre à jour les personnages joueurs »** : un bouton du compagnon (et du menu `!eraser`)
  qui ne relit que les joueurs : nom, PV, rapidité, profil, portrait et token. Une image effacée
  dans Roll20 est renvoyée.
- **Des tokens fidèles à Eraser** : sans token préparé, le compagnon fait celui de l'éditeur de
  token, avec le **cadre choisi** (ou celui par défaut du joueur, du PNJ, la porte du magasin et
  son intérieur sans vendeur) et l'avatar **recentré comme enregistré**. Un token préparé part
  tel quel. Les **jetons déjà posés sur les cartes** prennent la nouvelle image et leur barre de
  PV liée.
- **Les documents** : chacun devient un handout (son image, caché aux joueurs jusqu'à ce que tu
  le partages) et un **PDF déposé dans le Journal**. Si Roll20 change sa fenêtre d'envoi, le PDF
  est téléchargé pour que tu le glisses dans Journal › + Ajouter › PDF. Une session synchronisée
  range ses documents dans son dossier ; « Synchroniser les documents » les envoie seuls.
