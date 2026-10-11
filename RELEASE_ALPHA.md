# Eraser 0.1.1-alpha.195 — Vues du moteur des index, Index des calendriers, emplacements reliés aux lieux

Cette version arrive par la mise à jour sans réinstallation. Rien n'est effacé ni réécrit dans
Google Sheets. Le classeur « Eraser · Réglages des index » reçoit une colonne « Présentation
(JSON) » à droite au premier enregistrement d'une vue. Le classeur « Index des calendriers » est
créé à la première ouverture de sa page (s'il n'existe pas déjà dans le Drive).

## Vues des index (Modifier › onglet-fenêtre)

- Une vue (onglet-fenêtre) choisit maintenant sa **présentation** :
  - **Tableau** ;
  - **Cartes**, rangées en sections si tu veux ;
  - **Liste** : compacte (une ligne par élément) ou à lignes repliables, rangée en sections
    repliables ou non ;
  - **Kanban** : une colonne par valeur. Glisser une carte change sa case, avec les vérifications
    habituelles ;
  - **Maître-détail** : la liste à gauche, la ligne choisie à droite ;
  - **Calendrier** : les lignes placées à leur date, dans le calendrier réel ou un calendrier du
    monde ;
  - **Tableau de bord** : nombre de lignes, somme, moyenne, répartition par valeur.
- La présentation s'enregistre avec la vue, dans l'index. Le créateur de pages s'en servira tel
  quel.

## Index des calendriers (Index › Calendriers)

- Quatre onglets reliés :
  - **Calendriers** : nom, ère, description ;
  - **Mois** : calendrier, ordre, nombre de jours, saison ;
  - **Saisons** : calendrier, ordre, couleur ;
  - **Jours de la semaine** : calendrier, ordre.
- Le nombre de mois par saison, de jours par semaine et de mois par an se déduit des lignes.
- Une date s'écrit « 12 Brumaire 1023 » ou « 1023-3-12 ».

## Emplacements des items reliés aux lieux

- **Emplacement principal** et **Emplacement secondaire** des items sont des listes reliées à
  **Lieux › Environnement** et **Lieux › Magasin**, à plusieurs choix.
  - Un nom exact est reconnu tout seul.
  - Un nom écrit dans la colonne « Emplacements » d'un magasin aussi : « Marché ordinaire » est le
    Marché.
  - Un nom introuvable s'affiche **en rouge** pour être corrigé à la main. Rien n'est effacé, et le
    « - » entre les noms est gardé.
- Le moteur des index permet maintenant à une liste reliée de lire **plusieurs onglets ou index**
  (« Ajouter une source »). Elle peut aussi signaler les noms introuvables et séparer par un tiret.

## Fouilles

- Les lieux de fouille sont ceux de **Lieux › Environnement**. Ajouter, renommer ou supprimer un
  lieu là change la liste des fouilles.
- La reconnaissance reste tolérante : « Forêt noir » → Forêt noire, « grotte » → Caverne,
  « ruines » → Donjon.
