# Eraser 0.1.1-alpha.100 — Effets : =, bornes, dés ; Coma et Mort automatiques

Cette version arrive par la mise à jour sans réinstallation.

## Index des états — comment écrire un effet (onglet Effets)

**Changement de valeur** (c'est maintenant du texte) :

| On écrit | Ce que ça fait, tant que l'état est posé |
|---|---|
| `+10` ou `10` | ajoute 10 |
| `-30` | retire 30 |
| `=100` | la valeur devient 100 (elle revient quand l'état part) |
| `≥1` ou `>=1` | plancher : jamais moins de 1 |
| `≤50` ou `<=50` | plafond : jamais plus de 50 |
| `-1d20-20`, `+2d6` | des dés : l'effet se lance depuis la fiche |

**Jet** (nouvelle colonne, ajoutée à droite) : `1d20 16-20`. Aussi `1d20 : 16 & 20`,
`1d10 ≤3`, `1d10 3 ou moins`, `1d10 >=8`, `1d6 6`. Le jet réussi applique le changement
de valeur ; sans plage, il réussit toujours.

**Cible** : en plus des caractéristiques et compétences, « Points de vie actuels » est
proposé (sans rien ajouter à l'index des caractéristiques).

Exemples de ton index :
- Malédiction : Cible « Points de vie actuels », Jet `1d20 16-20`, Changement `-60`.
- « Vous perdez 1d20+20 PV » : Cible « Points de vie actuels », Changement `-1d20-20`.
- « Vous passez votre tour » (sur 16-20) : Jet `1d20 16-20`, sans cible ni changement ;
  le résultat dit simplement « réussi » ou « raté ».
- « Vous ne subissez plus de dégâts létaux » : Cible « Points de vie actuels »,
  Changement `≥1`.

## Fiche de personnage

- **Bouton dé** sur un état qui a un effet à lancer : le résultat s'affiche sous l'état
  (« 1d20 → 17 (16-20) : réussi », « Points de vie actuels 80 → 20 ») et s'écrit dans la
  fiche. « Annuler » remet les valeurs d'avant.
- **Les `=`, planchers et plafonds** s'appliquent partout : Folie, Destin, carac,
  compétences, cartes calculées, points de vie. Le survol les montre (« =100 », « ≥1 »).
- **Plancher sur la vie actuelle** : avec `≥1`, la vie affichée et enregistrée ne descend
  pas sous 1, même en tapant des dégâts ou en lançant un dé.
- **Coma et Mort se posent tout seuls** : à 0 PV ou moins, l'état « Coma » ; à moins les
  PV max, l'état « Mort ». Ils s'enlèvent quand la vie remonte (marqués « Auto »).
- **Leur apparence vient de leurs effets** : deux nouveaux FX, « Coma » (gris) et
  « Mort » (rouge sang), à mettre en « FX appliqué à : Page entière ». Tant que l'état
  n'a aucun effet, l'ancien filtre gris ou rouge reste.
