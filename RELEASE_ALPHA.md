# Eraser 0.1.1-alpha.237 — Un seul onglet d'items, et des sessions qui se dévoilent

Cette version arrive **sans réinstallation** (même enveloppe que l'alpha 227) : Eraser la
télécharge, redémarre son serveur et recharge la page tout seul. Rien n'est effacé dans Google
Sheets : les anciennes colonnes et les anciens onglets restent lus comme avant.

## Tous les items dans un seul onglet

- L'inventaire lit la colonne **« Genre »** pour ranger un item : *Arme* va dans les armes,
  *Équipement* dans l'équipement, tout le reste dans l'inventaire classique (qui peut aussi aller
  au sol ou dans l'esthétique). Plus besoin d'un onglet par famille.
- Sans genre, le type décide comme avant, mais sans se tromper de mot : un *Parchemin* (« arc »),
  un *Charme* ou une *Marchandise* ne sont plus pris pour des armes.
- Les magasins, les fouilles et les événements lisent la colonne « Rareté et emplacements » de
  l'onglet unique. Un type de magasin réglé sur l'ancien onglet « Armes » vend toujours les armes,
  reconnues à leur genre.
- La colonne « Rareté et emplacements » de l'Index des objets a été remplie depuis les raretés et
  emplacements principaux et secondaires (les anciennes colonnes sont gardées).

**En déplaçant des lignes vers l'onglet unique, gardez leur ID** : c'est par lui que les
inventaires, les magasins et les fouilles retrouvent leurs items.

## Créateur de session : chaque chose a son œil

- Joueurs, PNJs, magasins, événements : chacun a un œil. Barré, la chose n'apparaît pas dans le
  journal de la session ; un clic la révèle aux joueurs.
- **« Tout révéler » / « Tout cacher »** en haut du Créateur, avec le compte de ce qui est caché.
- Tout ce qu'on ajoute arrive **caché** par défaut. Les sessions déjà préparées restent telles
  qu'elles étaient (rien n'y est caché).
- Le MJ voit dans le journal ce qui est encore « caché aux joueurs ».

## Tableau de bord : cacher un personnage joueur

- Le MJ peut, exceptionnellement, cacher un personnage aux autres joueurs : il disparaît de leur
  tableau de bord, de leur journal, de leurs relations et des transferts d'objets. Son joueur, le
  MJ et les administrateurs le voient toujours. Le choix est partagé entre toutes les installations.

## Pages : le créateur réservé aux administrateurs

- Créer et modifier des pages, l'atelier, les brouillons et l'éditeur du menu : en mode admin
  seulement. Les MJ lisent les pages, y révèlent les secrets et écrivent dans leurs carnets.

## Les index restent fluides

- La chronologie et l'arborescence s'affichent par paquets, comme la liste et le kanban.
