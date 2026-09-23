# Eraser 0.1.1-alpha.49 — des colonnes liées fiables

Les colonnes liées des index (religions ↔ divinités, ancêtres ↔ descendants,
peuples ↔ lieux) se comportaient parfois mal. Corrigé :

- **Plus d’entités créées en double.** Les enregistrements liés passent un par
  un, et chacun relit le classeur à jour — y compris ce qui vient d’être
  ajouté à la main dans Google Sheets.
- **Plus d’entités à moitié tapées.** Dans une colonne liée et dans la colonne
  Nom, rien n’est enregistré avant d’avoir quitté la cellule : taper « Yflör »
  ne crée plus « Yfl » en chemin.
- **Chaque valeur dans sa colonne.** Les nouvelles lignes sont écrites
  exactement sous la dernière, à partir de la colonne A. Dans l’Index des
  créatures, le Nom redevient une cellule normale — le copier-coller d’une
  ligne ne décale plus les colonnes ; la fiche s’ouvre avec le petit bouton
  dans la cellule.
- **Les liens suivent dans tous les sens.** Effacer un nom le retire aussi de
  l’autre côté ; renommer une entité met à jour toutes les lignes qui la
  citent ; supprimer une ligne la retire des colonnes liées. Seuls les liens
  bougent : aucune entité n’est jamais supprimée automatiquement.
- **Apostrophes.** « Huvry’Or » et « Huvry'Or » désignent la même entité.
- **Ajouter une entité qui existe déjà** (créée par un lien, par exemple) la
  complète au lieu d’en créer une seconde.

Les liens déjà incohérents dans les feuilles ne sont pas modifiés d’office : ils
se réparent dès que la cellule concernée est de nouveau enregistrée.
