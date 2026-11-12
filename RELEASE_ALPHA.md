# Eraser 0.1.1-alpha.291 — Des documents de plusieurs pages, en vente chez les marchands, dans le journal

Cette version arrive **sans réinstallation** (même enveloppe que l’alpha 290) : Eraser la
télécharge, redémarre son serveur et recharge la page tout seul. Dans Google Sheets, la feuille
« Documents de campagne » gagne deux colonnes à droite, « Pages (JSON) » et « Journal », ajoutées
au premier document enregistré ; rien d'autre ne change.

- **« Donner à… » : les joueurs, puis les marchands, puis les PNJ.** Un joueur ou un PNJ reçoit le
  document d'un clic (un PNJ dans son Sac à dos). Un **marchand**, c'est un magasin sauvegardé :
  le document y est **mis en vente**, au prix et avec les exemplaires que le MJ choisit (sans prix,
  il se négocie). Il se change ensuite dans le magasin comme tout item, et un joueur qui l'achète
  le reçoit dans son inventaire, prêt à être lu. Vendu, il se remet en rayon. Une recherche apparaît
  quand la liste est longue. Dans l'éditeur des documents comme dans le Créateur de session.
- **Les documents dans le journal de la session.** Chaque document d'une session a son œil, dans
  le Créateur de session, dans le journal (MJ) et dans l'éditeur : révélé, il apparaît aux joueurs
  dans la catégorie **Objets** du journal, et s'y lit d'un clic. Un document ajouté à une session
  (ou rangé dans une autre) y est caché tant que le MJ ne l'a pas révélé ; les documents déjà
  rangés dans des sessions restent cachés.
- **Des documents de plusieurs pages.** Avec Eraser Doc 0.3.0, un document peut avoir jusqu'à
  30 pages, chacune sur le même fond ou sur un autre, et reste un seul document : un seul objet
  dans l'inventaire, une seule ligne en magasin, un seul handout dans Roll20.
- **Lire page par page.** Le lecteur (inventaire, journal, session, aperçu de l'éditeur) montre
  « Page 2 sur 5 » avec deux petites flèches sur les bords de la page, les touches ← et →, et des
  points pour sauter à une page. Le PDF (téléchargé ou envoyé dans le Journal de Roll20) contient
  toutes les pages, chacune à ses proportions ; le handout de Roll20 montre la première.
