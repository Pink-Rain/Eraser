# Eraser 0.1.1-alpha.290 — Les ateliers : Cuisine et Alchimie

Cette version arrive **sans réinstallation** (même enveloppe que l'alpha 289) : Eraser la
télécharge, redémarre son serveur et recharge la page tout seul. Rien ne change dans Google Sheets.

- **Le coin Craft devient l'extension Eraser Craft.** Installe-la dans Administration ›
  Extensions : la Cuisine et l'Alchimie s'ouvrent depuis le coin, à côté de la bourse.
- **Réglages d'une extension** : une roue crantée sur sa ligne, dans Administration ›
  Extensions. Pour Craft : l'index, les colonnes (Nutrition crue et cuite, portions, famille
  d'une base, doses d'un récipient) et les types d'items de chaque atelier. Les colonnes se
  créent dans Sheets sous le nom que tu veux, puis se choisissent là.
- **Portions et doses dans l'inventaire** : un plat ou une potion créé montre ses portions
  (ou ses doses), à consommer une à une d'un clic. Une portion mangée remplit la barre de
  rassasiement de sa Nutrition. La dernière vide la case.
- **Recyclage** : un plat se recycle aussi en son contenant (le bol, le bocal…), une potion en
  son récipient.
- **Effets cachés** (Administration › Effets cachés) : choisis les types d'items dont l'effet
  est caché. Dans l'inventaire, leur effet s'affiche « Effet verrouillé » ; clic droit sur
  l'item pour le débloquer quand le MJ le dit (ou le reverrouiller). Un plat garde chaque effet
  de ses ingrédients, « Effet inconnu » tant qu'il n'est pas débloqué. Le même réglage vaut
  dans les ateliers.
- Pour les extensions : API 4 (emplacements `inventaire.bourse` et `administration.extension`,
  `eraser.inventory.changed`, lecture des index par leur partie serveur).
