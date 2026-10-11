# Eraser 0.1.1-alpha.192 — Sorts des classes et bonus de rang dans le moteur des index

Cette version arrive par la mise à jour sans réinstallation. Aucune donnée n'est déplacée ni
réécrite : la feuille « Sorts de classe » garde exactement ses colonnes et ses valeurs.

## Sorts des classes

- **« Classes et rangs »** est maintenant une colonne du moteur des index : elle apparaît aussi
  dans l'**Index des sorts des classes** (plus seulement dans Création de classe), dans le tableau
  comme dans la fiche d'un sort. Une pastille par classe, aux couleurs de la classe, avec son
  rang (C, R1…R20) ; « + Classe » en ajoute une.
- Chaque changement est vérifié avant d'être écrit : **trois sorts par rang au plus**, et si la
  feuille a changé entre-temps (une autre installation), rien n'est écrasé. La pastille change
  tout de suite et revient comme avant en cas de refus, avec la raison.
- Les colonnes de rang de la feuille (une par classe) restent dans Google Sheets mais sortent du
  tableau et de la fiche : on ne peut plus y taper un rang à la main (ce qui contournait la limite
  de trois sorts). Elles se règlent seulement par « Classes et rangs ».
- **Onglets-fenêtres prévus d'office** dans l'Index des sorts des classes : **Actifs**, **Passifs**
  et **Bonus** (Actifs et Passifs dans les sorts des créatures), rangés exactement comme dans
  Création de classe. Ils ne s'écrivent nulle part et ne se suppriment pas ; tes propres
  onglets-fenêtres restent à côté.
- Copier un sort donne toujours une copie sans rang (un rang n'admet que trois sorts, et un sort
  de rang commun serait donné à tous les personnages de la classe).

## Bonus de rang

- **« Ajouter un rang »** passe par le moteur : il écrit le rang suivant (« Rang 21 »), une seule
  fois par clic, même si deux personnes cliquent en même temps.
- La fiche de personnage voit tout de suite un bonus modifié dans le tableau, sans attendre trois
  minutes ni « Actualiser ».
