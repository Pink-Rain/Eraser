# Eraser 0.1.1-alpha.248 — On fait ses courses

Cette version arrive **sans réinstallation** (enveloppe 10, comme l'alpha 238) : Eraser la
télécharge, redémarre son serveur et recharge la page tout seul. Dans Google Sheets, la feuille
« Magasins » gagne une colonne « Ventes JSON » à son premier achat ; rien d'autre ne change.

- **Journal : des boutons discrets.** Sur les cartes des PNJ et des magasins, une simple icône en
  haut à droite (sans cadre) ouvre leurs notes ou leur vitrine. Celle de la fiche d'un
  personnage prend le même style.
- **La vitrine s'ouvre en fenêtre** par-dessus le journal. Le MJ y a les mêmes choix que dans le
  Créateur de session : relancer une ligne ou tout le magasin, choisir un item, changer un prix,
  les exemplaires, le nom, le vendeur, l'œil des joueurs, retirer de la session.
- **Les joueurs ne voient plus l'effet des items**, seulement leur description, partout : journal,
  magasins sauvegardés, tabletop et fiche Roll20. Le MJ voit tout, partout.
- **Exemplaires.** Chaque ligne a son nombre d'exemplaires (« ×20 ») : au tirage, le « Nombre
  max » de l'item ; le MJ clique dessus pour le changer, dans le générateur comme dans les
  magasins sauvegardés. Les magasins enregistrés avant gardent un exemplaire par ligne.
- **Acheter.** Chaque item a un bouton Acheter : pour quel personnage (celui présent à la
  session ; s'il y en a plusieurs, on choisit), combien, et avec quelles pièces (le prix est
  converti au taux habituel : 1 PO = 100 PC, 1 PN = 1,5 PO). La fenêtre montre la bourse, ce
  qui sera donné et la monnaie rendue : sans cuivre, une pièce d'or est cassée et le reste
  rendu en PC. « Acheter » retire l'argent, met l'objet dans l'inventaire et le retire du
  magasin (la ligne disparaît quand il n'en reste plus). Si quoi que ce soit refuse, rien n'est
  pris.
- **Négocier.** Le prix se décide à l'oral avec le MJ : le joueur note le montant et les pièces
  avec lesquelles il paie, puis Acheter ou Annuler.
- **Ventes.** Sous chaque magasin, ce qui est parti : quoi, combien, à quel prix (avec
  « négocié »), et par qui.
- **Le MJ peut faire acheter un joueur** (choix du personnage), dans le journal, le Créateur de
  session, les magasins sauvegardés et la page Événements : son joueur est prévenu.
