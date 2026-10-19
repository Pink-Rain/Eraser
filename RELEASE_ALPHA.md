# Eraser 0.1.1-alpha.236 — Des index qui chargent vite

Cette version arrive **sans réinstallation** (même enveloppe que l'alpha 227) : Eraser la
télécharge, redémarre son serveur et recharge la page tout seul. Rien n'est effacé dans Google
Sheets, ni dans les réglages, ni dans les pages : aucune clé enregistrée ne change.

## L'Index des items (et tous les grands index) s'ouvre en quelques secondes

- Le tableau ne construit plus toutes ses lignes d'office : les 120 premières s'affichent tout
  de suite, la suite arrive en faisant défiler. Mesuré sur 1 800 items : la page était utilisable
  après **40 secondes** de gel, elle l'est maintenant après **2 secondes**.
- Les listes de choix (Type, Rareté…) ne relisent plus toutes leurs options pour chaque case :
  c'était le calcul le plus lourd du tableau.
- Chaque case retrouve sa ligne directement, sans parcourir tout l'onglet.
- La recherche reste fluide même après avoir fait défiler loin : une nouvelle recherche repart des
  premières lignes.

## Modifier un item ne fait plus relire tout le classeur

- Une case ou une fiche d'item enregistrée est recopiée dans la copie que gardent l'inventaire, les
  magasins et les fouilles. Avant, chaque case modifiée faisait relire tout l'Index des objets,
  mise en forme comprise (le quota Google partagé en souffrait aussi).
- « Actualiser » sur la page des items relit vraiment le classeur des items (il rendait la copie
  gardée cinq minutes).
- L'import d'une icône ne renvoie plus tout le catalogue à la page.

## Les vues (liste, kanban, calendrier…) restent fluides

- Le kanban et le maître-détail s'affichent par paquets, avec « Afficher la suite », comme la liste.
- Le kanban range ses cartes en un seul passage ; le calendrier, la chronologie, l'annuaire et les
  filtres de la barre d'outils ne relisent plus toutes les lignes pour chaque jour, groupe, lettre
  ou pastille.
- Le tri des vues lit chaque case une fois au lieu d'à chaque comparaison.
- Les vues ne se recalculent plus à chaque frappe dans la page.

## Corrections

- **Inventaire dans un formulaire** : dans une liste, un kanban ou un survol, il s'ouvre au clic
  (chaque ligne montrée chargeait le sien et préparait un contenant dans Google). Pour un PNJ, il
  montre bien le sac du PNJ.
- **Réglages d'un index illisibles** (vues, cartes, formulaires) : Eraser réessaie, puis le dit,
  au lieu d'un index qui reste vide sans raison. Les dialogues d'un même index partagent leur lecture.
- **Page des items en erreur** : le message dit la vraie cause (dossier « Objets » introuvable,
  items répartis dans plusieurs classeurs…).
- Un bloc de page sur l'index des pages ne propose plus de modifier une ligne qu'il ne peut pas
  enregistrer.
- Au démarrage, les pages n'attendent plus chacune jusqu'à 3 secondes le serveur partagé : une
  seule attente en tout.
- Blocs de page, réglages des index : les lectures du serveur partagé partent en même temps.
- Recensement des colonnes « Rareté et emplacements » : un index illisible un instant ne laisse
  plus des trouvailles manquantes pendant cinq minutes.
- Nettoyage : fonctions et exports que plus rien n'utilisait retirés.
