# Eraser 0.1.1-alpha.281 — Les extensions sortent de leur page

Cette version arrive **sans réinstallation** (même enveloppe que l'alpha 280) : Eraser la
télécharge, redémarre son serveur et recharge la page tout seul. Rien ne change dans Google Sheets.

- **Une extension n'est plus seulement une page** : elle peut agir sur toute l'application.
  Elle a un module de démarrage, lancé une fois sur chaque ordinateur au premier moment libre
  après l'ouverture, et ses propres styles, posés sur toutes les pages avant l'affichage
  (couleurs, polices, tout ce qui se fait en CSS).
- **Des emplacements partout** : au-dessus et en dessous de chaque page, dans l'en-tête de chaque
  page, dans la barre latérale et à son pied, au-dessus de tout, et dans la fiche d'une ligne de
  tous les index (sous ses champs et dans son pied). Une extension y pose ses boutons et ses
  bidules ; un emplacement vide ne coûte rien.
- **Fenêtres, messages, confirmations** : une extension ouvre une fenêtre, affiche un petit message
  en bas de l'écran ou demande une confirmation, avec les composants d'Eraser. Elle sait sur quelle
  page on est et réagit quand on en change.
- **Rien ne casse à cause d'une extension** : si l'une plante, ce qu'elle a posé disparaît et la
  page reste. Quand elle se met à jour, tout ce qu'elle avait posé est retiré avant que la nouvelle
  version prenne la place. Son démarrage apparaît dans « Fluidité de cet ordinateur ».
- **Un contrat stable** : ce qu'Eraser offre aux extensions est écrit à part et vérifié à chaque
  construction ; une mise à jour d'Eraser ne peut plus en retirer un morceau sans que ça se voie.
- Les extensions existantes (Eraser Doc, Eraser Page, Eraser Map) fonctionnent comme avant.
