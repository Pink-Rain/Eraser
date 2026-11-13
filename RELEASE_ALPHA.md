# Eraser 0.1.1-alpha.297 — Le clic droit s'ouvre aux extensions

Cette version arrive **sans réinstallation** (même enveloppe que l'alpha 296) : Eraser la
télécharge, redémarre son serveur et recharge la page tout seul. Rien ne change dans Google Sheets.

Cette version prépare **Eraser Note MJ**, le carnet du MJ de chaque campagne (nouvelle extension,
liée dès maintenant). Elle n'ajoute encore rien de visible : ce sont les briques dont l'extension a
besoin, ouvertes à toutes les extensions.

- **Le clic droit** : une extension peut proposer ses entrées au clic droit, sur une ligne d'index
  (créature, item, lieu…), une citation dans un texte, un PNJ, un magasin, un document, un
  personnage, une session, un événement, une image, un lien ou du texte sélectionné. Elles
  s'ajoutent aux menus qui existent déjà ; ailleurs, un menu s'ouvre au pointeur, seulement s'il a
  quelque chose à proposer. Le menu habituel reste dans les zones de saisie et avec **Maj + clic
  droit**.
- **Deux emplacements** pour les extensions : l'en-tête du tableau de bord d'une campagne, et la fin
  de la session choisie dans le Créateur de session.
- Une extension sait sur quelle campagne et quelle session on se trouve, quelles campagnes le compte
  mène, et peut ranger ses données dans une campagne plutôt que dans un compte (elles suivent la
  campagne si elle change de MJ).
- Pour les extensions : API 6 (`eraser.menu.add`, `extensionThingKinds`, `page().search` et
  `campaignId`, emplacements `campagne.en-tete` et `session.preparation`, `campaigns` et
  `richText.sanitize` côté serveur).
