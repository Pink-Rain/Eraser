# Eraser 0.1.1-alpha.293 — Des documents de plusieurs pages, reliés, en vente, dans le journal

Cette version arrive **sans réinstallation** (même enveloppe que l’alpha 292) : Eraser la
télécharge, redémarre son serveur et recharge la page tout seul. Dans Google Sheets, la feuille
« Documents de campagne » gagne deux colonnes à droite, « Pages (JSON) » et « Journal », ajoutées
au premier document enregistré ; rien d'autre ne change.

- **Des documents de plusieurs pages.** Avec Eraser Doc 0.3.0, un document peut avoir jusqu'à
  30 pages, chacune sur le même fond ou sur un autre, avec une **couverture** et une **image de
  fin** si on veut (on y écrit comme sur une page). Ça reste un seul document : un seul objet dans
  l'inventaire, une seule ligne en magasin, un seul handout dans Roll20.
- **Lire page par page.** Le lecteur (inventaire, journal, session, aperçu de l'éditeur) montre
  « Couverture », « Page 2 sur 5 », « Image de fin », avec deux petites flèches sur les bords, les
  touches ← et →, et des points pour sauter à une page. Le PDF contient toutes les pages, chacune à
  ses proportions ; le handout de Roll20 montre la première.
- **Des fonds à soi, rangés par mots-clés.** Dans Administration › Extensions, la roue d'Eraser Doc
  (administrateurs) ouvre la bibliothèque des fonds : on y ajoute une image, on lui donne un nom
  et des mots-clés. Partout où on choisit un fond, ils sont rangés par mot-clé ; ceux marqués
  « Couverture » ou « Fin » sont proposés d'abord pour la couverture et l'image de fin. Partagée
  par toutes les campagnes et toutes les installations.
- **Des titres en relief, en or.** Une zone de texte peut sortir du papier ou y être gravée (d'où
  vient la lumière, profondeur, douceur, contraste) et être en or, argent, bronze ou cuivre. Les
  joueurs et Roll20 reçoivent exactement ce que le MJ voit.
- **« Donner à… » : les joueurs, puis les marchands, puis les PNJ.** Un joueur ou un PNJ reçoit le
  document d'un clic (un PNJ dans son Sac à dos). Un **marchand**, c'est un magasin sauvegardé : le
  document y est **mis en vente**, au prix et avec les exemplaires que le MJ choisit (sans prix, il
  se négocie). Il se change ensuite dans le magasin comme tout item, et un joueur qui l'achète le
  reçoit dans son inventaire, prêt à être lu. Vendu, il se remet en rayon.
- **Les documents dans le journal de la session.** Chaque document d'une session a son œil, dans
  le Créateur de session, dans le journal (MJ) et dans l'éditeur : révélé, il apparaît aux joueurs
  dans la catégorie **Objets** du journal, et s'y lit d'un clic. Un document ajouté à une session
  (ou rangé dans une autre) y est caché tant que le MJ ne l'a pas révélé ; les documents déjà
  rangés dans des sessions restent cachés.
