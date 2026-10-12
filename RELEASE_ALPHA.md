# Eraser 0.1.1-alpha.210 — Les onglets-fenêtres redeviennent des tableaux filtrés

Cette version arrive par la mise à jour sans réinstallation. Rien n'est effacé dans Google
Sheets.

## Onglets-fenêtres

- **Un onglet-fenêtre est le tableau de l'index, avec seulement les lignes qui remplissent
  ses conditions.** Ou un onglet stats. Rien d'autre : on n'y choisit plus de kanban, de
  liste, de galerie…
- Un onglet-fenêtre réglé autrement par une version précédente s'affiche maintenant en
  tableau. Son ancien réglage reste dans la feuille, et part quand tu enregistres l'onglet.
- Les kanbans, listes, galeries, calendriers… se posent dans une page (bloc Vue d'index),
  avec leurs propres conditions.

## Bloc « Vue d'index »

- **Il ne lit plus jamais les onglets-fenêtres** (ni Google). Il lit l'index, ses formes et
  ses cartes (copies en mémoire), et un preset s'il en a choisi un.
- Un bloc qui portait sur un onglet-fenêtre (réglage de l'alpha 206) l'ignore : ses propres
  conditions font le filtre. L'atelier le signale, avec « Retirer l'ancien réglage ».
- L'atelier ne lit plus la feuille des onglets-fenêtres pour régler un bloc : une lecture
  Google de moins.
