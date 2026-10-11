# Eraser 0.1.1-alpha.196 — Journal de session, notes privées dans la fiche, onglet Magasin rempli, 9 corrections

Cette version arrive par la mise à jour sans réinstallation. Rien n'est effacé dans Google
Sheets. Deux écritures nouvelles, seulement des ajouts :

- **Lieux › Magasin** se complète tout seul la première fois qu'un admin ouvre Index des lieux
  ou une page de magasins. Les colonnes manquantes s'ajoutent à droite, une ligne par type de
  magasin en bas. Une ligne qui existe déjà sous le même nom est seulement complétée.
- Le classeur **« Notes de session »** est créé à la première note écrite (pas avant). Il n'est
  pas recréé s'il existe déjà dans le Drive.

## Journal de la campagne (Campagne › Journal)

- Une page par session. On passe de l'une à l'autre avec les flèches (ou ← →), ou on clique sur
  le nom pour voir toute la liste.
- **Bilan** : le résumé de la session et une tuile par section. Un clic sur une tuile mène à la
  section.
- Les sections, dans cet ordre : **Groupe**, **Lieux**, **PNJs**, **Créatures**, **Objets**,
  **Magasins**, **Quêtes**, **Événements** (avec la frise).
- **Notes de session**, à droite :
  - elles sont publiques : toute la table les lit ;
  - elles sont rangées par type (résumé, événement, citation, quête, indice, butin…) et repliées
    à l'ouverture ;
  - le filtre **Campagne / Mon perso** n'affiche que tes notes et celles liées à ton personnage ;
  - une note peut être liée au groupe, aux PNJs, aux lieux et créatures des index, aux objets,
    aux magasins, aux événements et aux autres notes.
- **Qui peut modifier quoi** :
  - chacun modifie et supprime ses propres notes ;
  - le MJ et l'admin peuvent aussi modifier les notes publiques des autres ;
  - l'auteur d'une note ne change jamais.
- **Quêtes** :
  - une note « Quête » peut être la suite d'une autre, ce qui forme une chaîne d'étapes ;
  - on coche une étape quand elle est accomplie, et la session où elle l'a été est gardée.
- **Ce que voit un joueur** : seulement les PNJs, magasins et événements entrés dans une
  session. Les lieux notés par le MJ dans le Créateur de session et les descriptions des
  événements restent réservés au MJ.

## Fiche du personnage › Journal

- À droite du journal de relation et du carnet : **Mes notes**, des notes privées que toi seul
  lis.
  - Elles fonctionnent comme les notes de session : par type, repliées, avec des liens et des
    quêtes.
  - Elles sont rangées par session. On passe de l'une à l'autre avec les flèches, et une
    nouvelle note va par défaut dans la dernière session.
- **Mes quêtes** : les chaînes de quêtes du personnage.
- Le bouton **« Notes de session de la campagne »** ouvre le journal de la campagne sur la même
  session, filtré sur « Mon perso ».
- Si le personnage joue dans plusieurs campagnes, une liste permet de choisir la campagne.

## Corrections (relecture des alphas 193 à 195)

- **Emplacements de magasin et de fouille** :
  - deux lieux sans rapport dans une même case comptent tous les deux (« Marché/Taverne »,
    « Forêt noire / Plaine ») ;
  - les noms reconnus avant reviennent (Antiquités, Libraire, Alchimie, Tavernier, Armurerie).
- **Emplacements des items** :
  - plus de bouton « Créer » à côté d'un nom en rouge, qui l'ajoutait par erreur à
    Lieux › Environnement ;
  - cocher un choix ne réécrit plus les autres noms de la case : « Marché ordinaire » reste
    « Marché ordinaire ».
- **Page Événements** : l'afficher ne crée plus le classeur et ne relit plus Google à chaque
  fois.
- **« Envoyer dans un autre onglet »** : un ancien réglage de la colonne « Onglet » (retirée) ne
  bloque plus le déplacement.
- **Kanban** : on ne peut glisser une carte que si sa case ne contient qu'une seule valeur, sans
  mise en forme. Rien ne peut donc être perdu.
- **Créateur de session** :
  - une case « Événements (JSON) » modifiée à la main ne bloque plus l'ajout de joueurs, de
    PNJs ou de magasins ;
  - le compteur d'événements ne compte que les événements affichés.
- **Marchés ambulants** envoyés depuis Événements :
  - ils ne sont plus marqués « dans la campagne », donc le pont Roll20 ne les exporte plus ;
  - la marque posée par les alphas 194 et 195 s'enlève quand on les retire de la session ou
    qu'on supprime la session.
