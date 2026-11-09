# Eraser 0.1.1-alpha.280 — Rien ne se perd

Cette version arrive **sans réinstallation** (même enveloppe que l'alpha 279) : Eraser la
télécharge, redémarre son serveur et recharge la page tout seul. Rien ne change dans Google Sheets
tant que tu ne recycles rien.

- **Recycler un item** : dans l'inventaire (personnages, compagnons, PNJ, inventaire de la
  campagne), un bouton ♻️ apparaît juste avant la corbeille quand la colonne « Se recycle en » de
  l'Index des items nomme au moins un item. Les items sans recyclage n'ont pas de bouton.
- **C'est le MJ qui décide** : la fenêtre de confirmation demande combien d'exemplaires recycler
  quand l'item est en pile (avec « Tout »), propose de cocher un ou plusieurs des items de
  « Se recycle en », et règle combien on en obtient de chacun avec − et +. Un résumé dit ce qui va
  se passer (« 2 × Épée rouillée → 2 × Ferraille, 1 × Cuir ») avant de valider.
- **Sans rien perdre en route** : les exemplaires recyclés quittent l'inventaire et les items
  obtenus arrivent comme un item ajouté à la main (au sol s'il n'y a plus de place). Si rien ne
  trouve de place, l'item recyclé revient tel qu'il était. Ce qui était propre à l'exemplaire
  (runes, matériaux…) disparaît avec lui, et la fenêtre le rappelle.
