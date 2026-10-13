# Eraser 0.1.1-alpha.217 — Lot C : 7 Calendrier, 8 Tableau de bord

Cette version arrive par la mise à jour sans réinstallation. Rien n'est effacé dans Google
Sheets ; les réglages enregistrés par l'alpha 216 se relisent tels quels (un calendrier en
« Agenda » reste un agenda, un tableau de bord garde ses tuiles).

## 7 Calendrier : six échelles qui s'emboîtent

- **Échelle** : Année, Mois, Semaine, Jour, Agenda ou Saisons, chacune avec **sa forme** :
  - Année : douze mini-grilles, bande par saison, ou un mois par ligne (compte et formule).
  - Mois : grille (pastilles, points ou barres, N par jour puis « +n »), ou un jour par ligne
    (les jours vides masqués si tu veux).
  - Semaine : sept colonnes, une ligne par jour, ou un tableau (jour, nom, colonnes choisies).
  - Jour : une page avec ses lignes en fiches (élément au choix), ou en paragraphes (titre +
    texte long).
  - Agenda : par date, en fil (comme une chronologie), ou groupé par semaine.
  - Saisons : l'année en bande de saisons, ou un panneau à la couleur de chaque saison.
- **Les échelles s'emboîtent** : un mois de l'année ouvre le mois, un jour du mois (ou de
  l'agenda, de la semaine) ouvre le jour ; précédent / suivant à chaque échelle ; une **barre
  des échelles** au-dessus si tu l'actives ; « Revenir » ramène à l'échelle réglée.
- **Bannière** au-dessus du calendrier : l'image du mois ou de la saison (nouvelle colonne
  « Image » des onglets Mois et Saisons de l'Index des calendriers), ou une image fixe ; sa
  hauteur.
- Les briques communes y sont : **élément** (vue, carte, formulaire en lecture), **au clic**
  (fiche, page, à côté, dessous, rien), **formule dans l'en-tête** du mois, de la semaine ou
  de la saison (contre une cible), **jauge ou charges** sous chaque ligne datée, couleur des
  lignes selon une colonne, icône, image, pastille.
- Dix-huit formes de base, dessinées sur tes lignes : Année (3), Mois (3 dont bannière),
  Semaine (3), Agenda (3 dont élément = carte), Jour (3 dont liste + détail), Saisons (2),
  Jauge et charges : mois + jour.

## 8 Tableau de bord : des tuiles mixtes

- Aux tuiles chiffres (nombre, somme, moyenne, min, max, remplies, répartition) s'ajoutent :
  - **Jauge ou charges** : une formule sur les lignes, ou la case d'une ligne précise (« Vie »
    d'Aldric sur « Vie max »), contre une cible ; anneau, barre ou charges, rouge au-delà.
  - **Statistique de l'index** : une stat de « Modifier › Stats » posée en tuile (barres,
    anneaux, histogrammes…), calculée sur les lignes de la vue.
  - **Une autre vue de l'onglet** : liste, galerie, chronologie… avec ses propres réglages,
    limitée à N lignes (triée : un top N).
  - **Une ligne** : nommée, dessinée avec une carte ou un formulaire en lecture.
  - **Texte à formules** : « Le groupe compte {nombre} membres et porte {somme Or} po » ; les
    formules se recalculent et se surlignent. Aussi {moyenne X}, {min X}, {max X},
    {remplies X}, {Or de Aldric} (la case d'une ligne), {Or} (sa somme).
  - **Une tuile par ligne d'un onglet lié** : une colonne liée (personnage, lieu…) donne une
    tuile par valeur, avec ses formules sur les lignes qui la citent.
- **Sections** : chaque tuile nomme sa section ; les tuiles d'une même section vont ensemble,
  repliables (repliées à l'ouverture si tu veux), avec une icône. Largeur d'une tuile : une
  place, deux, ou toute la rangée.
- Huit formes de base : Tuiles chiffres, Tuiles mixtes, Tuiles jauges, Une tuile par ligne
  d'un onglet lié, Tuile texte, Tuile vue : top N, Tuiles en sections repliables, Texte avec
  formules incrustées.
- Dans les pages : un bloc Vue en tableau de bord reçoit les vues et les statistiques que ses
  tuiles lisent.
