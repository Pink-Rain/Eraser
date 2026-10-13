# Eraser 0.1.1-alpha.212 — Couleurs qui agissent, images libres, médaillon, éditeurs resserrés

Cette version arrive par la mise à jour sans réinstallation. Rien n'est effacé dans Google
Sheets ; les réglages enregistrés par l'alpha 211 se relisent tels quels.

## Vues : les couleurs font ce qu'elles disent

- **La couleur d'accent de la vue marque chaque élément** (liseré, teinte, point, nom
  coloré) quand la ligne n'a pas de couleur à elle : plus de réglage sans effet dans une
  liste, un kanban, une galerie, un arbre ou un codex sans colonne couleur. Une colonne
  « Couleur des lignes selon » garde la priorité.
- Les colonnes d'image et d'icône ne sont plus distinguées : une case qui contient une
  adresse donne une image, un nom d'icône ou un émoji donne une icône, partout (vues,
  cartes, survols).

## Images : largeur, hauteur, lié, bords collés

- **Un seul modèle d'image, le même partout.** Deux curseurs (largeur, hauteur), un bouton
  lier / délier, et les bords auxquels l'image est collée (haut, bas, gauche, droite,
  aucun). Collée à un bord, elle le touche et suit la taille de l'élément ; sans bord, elle
  flotte avec une marge. Le bout du curseur de hauteur donne « auto » : la hauteur de
  l'image.
- Cartes : l'image principale (en haut, en bas, à gauche, à droite, en fond) et le bloc
  image se règlent ainsi, en % de la carte. Les anciens réglages (taille, format, accroche,
  marge) se lisent dans ce modèle sans rien changer à l'affichage.
- Galerie : largeur et hauteur des vignettes en rem, liées ou non ; les trois formes de
  départ règlent les deux curseurs.
- Vues : l'image ou l'icône à côté du nom se règle en pixels (largeur, hauteur, lié).

## Survol : « Ajouter un médaillon »

- Plus de médaillon automatique impossible à retirer. Un bouton **« Ajouter un médaillon »**
  le pose ; il a sa colonne (image ou icône ; sinon l'image ou l'icône de la ligne), sa
  taille, rond ou carré, un fond à la couleur de l'accent ; une croix le retire. L'icône
  devant le nom reste un réglage à part.
- Le survol des états garde son médaillon teinté ; celui des modificateurs son icône devant
  le nom. L'affichage automatique pose un médaillon quand l'onglet a une image ou une icône.

## Éditeurs resserrés

- Cartes : plus de phrase d'introduction ; **Carte, Image, Blocs, Composition en vrais
  onglets** ; emplacement en menu déroulant, colonne et bords collés sur la même ligne ;
  lié, largeur, hauteur, arrondi sur la même ligne ; taille et forme de la carte en deux
  lignes ; bordure et fond côte à côte.
- Vues : onglets en haut, libellés et choix sur une même ligne, groupes plus serrés, plus de
  phrase d'introduction.
- Survols : sous-titre, icône, largeur et nom coloré sur une ligne, le médaillon dessous.

## Cartes : les treize formes de départ reviennent

- Galerie illustrée, Portrait, Fiche horizontale, Ligne de liste, Médaillon, Insigne centré,
  Texte seul, Carte à jouer, Fiche de combat, Dossier, Bannière, Vignette ronde, Image de
  fond : toutes à nouveau dans « Nouvelle carte », en plus des cartes d'Eraser de l'index.
