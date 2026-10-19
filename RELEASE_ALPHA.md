# Eraser 0.1.1-alpha.240 — Les items entièrement sur le moteur des index

Cette version arrive **sans réinstallation** pour les installations à l'enveloppe 10 (alpha 238
et suivantes) : Eraser la télécharge, redémarre son serveur et recharge la page tout seul. Rien
n'est modifié dans Google Sheets.

## Un seul lecteur des items : le moteur des index

- L'Index des items est lu par le moteur des index, comme tous les autres index : ses onglets,
  ses colonnes, ses icônes. L'ancien « lecteur des items » et sa copie en mémoire, qui
  doublaient le moteur (et laissaient la page vide quand les onglets changeaient), sont retirés.
- **L'inventaire, les magasins, les fouilles, les événements, les références et les dons lisent
  maintenant le moteur.** Une case modifiée dans l'index est aussitôt vue partout, sans relire
  tout le classeur, et Google n'est plus interrogé deux fois pour les mêmes items.
- Rien ne change à l'usage :
  - un item sans ID reçoit toujours le sien avant d'être servi ;
  - les icônes choisies à la main ne sont jamais écrasées ;
  - un objet ajouté à un inventaire reprend le texte à jour de l'index.
- Le classeur des items peut porter le nom qu'on veut dans le Drive (« Index des items ») : la
  page affiche ce nom.
