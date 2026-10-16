# Eraser 0.1.1-alpha.226 — Les formulaires réparés

Cette version arrive **sans réinstallation** : Eraser la télécharge, redémarre son serveur et
recharge la page tout seul. Rien n'est effacé dans Google Sheets, ni dans les réglages, ni dans
les pages : les formulaires enregistrés gardent leurs clés et s'affichent comme avant.

## L'onglet ouvert d'abord

- « Onglet ouvert d'abord » propose **les valeurs de toutes les lignes du tableau**, plus seulement
  celles des trois lignes d'exemple. La liste de choix de la colonne reste en tête, dans son ordre.
- La colonne choisie peut être une colonne que la fiche ne montre pas (une colonne du tableau
  seulement) : l'onglet s'ouvre quand même selon sa valeur.
- L'onglet **ne saute plus** pendant qu'on modifie la ligne : il est choisi à l'ouverture de la
  fiche, d'après la ligne enregistrée. Une ligne neuve (« Ajouter ») s'ouvre sur le premier onglet.
- « Sections en onglets » et « Onglet ouvert d'abord » sont dans **Mise en page**, juste au-dessus
  des sections (« Les sections : l'une sous l'autre / en onglets »), et non plus dans Apparence.
- En onglets, « Repliable » n'est plus proposé (une section en onglet ne se replie pas) et le titre
  d'une section s'appelle son nom d'onglet.

## Ce qui s'affiche mieux

- En onglets, une section en **bandeau** garde sa couleur en cadre teinté, au lieu d'une bande vide ;
  l'onglet ouvert prend la couleur de sa section.
- Un champ **sans libellé** se pose à hauteur des autres saisies de sa ligne.
- Le **détail modifiable** d'une vue (panneau à côté, fenêtre) prend le fond réglé dans Apparence,
  comme la fiche.
- La **page d'une ligne** (bloc « Champs de la ligne » en forme de formulaire) suit la couleur
  d'accent, le fond et le style des libellés du formulaire.
- Dans le formulaire d'ajout, une case à cocher s'aligne comme dans la fiche.

## L'éditeur

- La largeur affichée d'un champ seul sur sa ligne dit « Plein » (c'est ce que montre la fiche), et
  plus « ½ ».
- La couleur d'accent peut revenir à **par défaut**.
- L'aperçu en grand passe d'une ligne à l'autre parmi une quarantaine de lignes de l'onglet, plus
  seulement les trois premières.
- « Forme de base » : une vignette dont l'aperçu a des onglets ou des boutons ne provoque plus
  d'erreur.
