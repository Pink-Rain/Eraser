# Eraser 0.1.1-alpha.203 — L'atelier s'ouvre, « Pages » dans le menu

Cette version arrive par la mise à jour sans réinstallation. Rien n'est écrit dans Google
Sheets.

## Créateur de pages

- **L'atelier s'ouvre vraiment.** Créer une page, ou cliquer sur une page dans l'Index des
  pages, renvoyait vers l'Index au lieu d'ouvrir l'atelier (le routeur rendait l'atelier une
  première fois sans son « ?id= »). L'atelier vit maintenant à `/pages/atelier/<id>` ; les
  anciens liens y mènent.
- **« Pages » dans la barre latérale** (admin et MJ), entre « Bac à sable » et
  « Administration » : l'Index des pages, et un **+** qui ouvre directement « Nouvelle page ».
  La carte « Créateur de pages » du Bac à sable est retirée.
