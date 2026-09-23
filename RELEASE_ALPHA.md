# Eraser 0.1.1-alpha.58 — Sessions de campagne

Cette version arrive par la mise à jour sans réinstallation.

## Créateur de session

- **Plusieurs sessions par campagne.** En haut de la page, un menu déroulant liste
  les sessions dans l’ordre de création, à côté du bouton « + Créer une nouvelle
  session ». Un titre, « Créer », et la page de la nouvelle session s’ouvre.
- **Bannière** : chaque session peut avoir son image (enregistrée dans le Drive
  partagé, comme les bannières de campagne).
- **Joueurs** : les personnages joueurs de la campagne sont ajoutés
  automatiquement. Le MJ peut en retirer ou en rajouter.
- **PNJs** : « Ajouter un PNJ » propose les PNJs de la campagne (avec recherche)
  ou d’en créer un nouveau. On peut les modifier ou les retirer de la session.
- **Magasins** : « Ajouter un marché » propose les magasins sauvegardés de la
  campagne (avec recherche). Relance, prix, nom et vendeur se modifient sur place ;
  un magasin peut être retiré de la session.
- La session peut aussi être renommée ou supprimée. Supprimer une session ne
  supprime ni ses PNJs ni ses magasins.
- **Rien de ce qui était préparé n’est perdu** : la première session créée dans
  une campagne reprend les PNJs et magasins qui étaient dans l’ancien Créateur de
  session.
- Les sessions sont enregistrées dans une nouvelle feuille Google
  « Sessions de campagne » (créée seulement si elle n’existe pas déjà dans le Drive).

## « Ajouter à la session »

- Sur les pages PNJs, Magasin et fouille et Magasins sauvegardés, « Ajouter à la
  campagne » devient **« Ajouter à la session »**. Une petite fenêtre liste les
  sessions de la plus récente à la plus ancienne (la dernière créée est choisie
  d’office), avec une recherche par nom et un bouton « Créer une session ».

## Roll20 — compagnon et script Mod 0.6.0

- Nouveau choix **« Synchroniser une session »** dans le compagnon navigateur et
  dans le menu du script Mod (`!eraser`). Il ouvre un menu déroulant des sessions,
  de la plus récente à la plus ancienne, avec recherche par nom, puis synchronise
  seulement les PNJs et magasins de cette session.
- « Tout synchroniser » reprend tout ce qui est dans au moins une session.
- **Mettre à jour les deux** depuis la page Roll20 de la campagne : le compagnon
  et le script Mod doivent être en 0.6.0.

## Chat

- Le chat en bas à droite affiche désormais **le nom du compte** de la personne
  qui écrit, sur toutes les pages (plus « MJ » ni le nom d’un personnage).
- **/joueur** et **/rjoueur** proposent les noms des comptes de la campagne (son
  MJ et les propriétaires de ses personnages, plus les comptes connectés).
- Nouveau **/rprivé** (ou /rprive) : un jet de dés visible uniquement par soi.

## Vérifications

- lint sans erreur, build de production et build desktop réussis, serveur desktop
  vérifié en HTTP 200 ;
- 21 tests d’interface (dont le rendu du Créateur de session) et 3 tests du pont
  Roll20 au vert (dont le nouveau choix « Synchroniser une session » du Mod).
