# Eraser 0.1.1-alpha.147 — Étiquettes : un clic pour les modifier

Cette version arrive par la mise à jour sans réinstallation.

## Étiquettes « { » dans un texte qu'on écrit

- **Clic gauche sur une étiquette** (`{Objet:Arc long}`) : son texte se modifie
  directement (« Arcs longs », « Arc très long oui »…). Le lien ne s'ouvre plus au
  clic, ce qui empêchait le double-clic de la 146 de fonctionner.
  - **Entrée** ou un clic ailleurs valide, **Échap** annule, **vider le texte** efface
    l'étiquette ; réécrire le nom exact de la ligne lui rend son texte automatique.
  - Une case citée (`{Objet:Arc long:Prix}`) affiche sa valeur : un clic ne fait rien.
- **Clic droit sur une étiquette** : « Ouvrir dans un nouvel onglet », « Ouvrir dans une
  nouvelle fenêtre » ou « Ouvrir ici ». Le clic du milieu et Ctrl+clic ouvrent toujours
  un nouvel onglet.
- Hors édition (fiches en lecture, survols, pages), un clic sur une étiquette ouvre sa
  ligne, comme avant.

## Phrases modèles

- Une colonne de phrase qui contient des `{Nom}`, `{Type}` et des étiquettes s'affiche
  correctement quand on la cite (`{Objet:Arc long:Phrase}`) : les accolades sont lues
  sur la ligne citée, les étiquettes gardent leur texte choisi et leur survol.

## Version affichée

- Sous « Chercher les mises à jour », en tout petit : la version qui tourne
  (mise à jour sans réinstallation comprise).
