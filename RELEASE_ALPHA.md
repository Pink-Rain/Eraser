# Eraser 0.1.1-alpha.109 — Dés : le signe vaut pour le total

Cette version arrive par la mise à jour sans réinstallation.

## Changement de valeur avec des dés

- **Le signe écrit tout devant s'applique au total des dés.** `-1d20+20` lance 1d20,
  ajoute 20, puis retire le tout : un 14 retire 34 points. Avant, le moins ne portait que
  sur le dé, et le +20 s'ajoutait à part.
- Sans signe devant, le total s'ajoute tel quel : `1d20-20` avec un 14 donne -6.
- `+2d6` et `2d6` ajoutent le résultat des dés.
- Le résultat affiché sous l'état détaille le lancer, par exemple
  « -1d20+20 : 1d20 [14] → 1d20+20 = 34 → -34 ».
- Un effet qui retire (`-…`) s'affiche en rouge au survol de l'état.
- Les descriptions des colonnes « Changement de valeur » et « Jet » donnent maintenant
  cette écriture, tout comme le conseil affiché quand des dés sont dans « Jet » avec un
  « Changement de valeur » vide.
