# Eraser 0.1.1-alpha.294 — Les effets restent derrière l'œil

Cette version arrive **sans réinstallation** (même enveloppe que l'alpha 293) : Eraser la
télécharge, redémarre son serveur et recharge la page tout seul. Rien ne change dans Google Sheets.

- **Plus de page « Effets cachés »** ni de cadenas « Effet verrouillé » : l'alpha 290 les avait
  ajoutés par erreur, en double de l'œil qui existait déjà. L'effet d'un item est caché d'office
  derrière l'œil de l'inventaire, comme avant.
- Les **ateliers d'Eraser Craft** (Cuisine, Alchimie) utilisent ce même œil : clic droit sur un
  ingrédient, « Voir l'effet ». Un effet montré dans l'atelier l'est aussi dans l'inventaire, et
  l'inverse.
- Un plat ou une potion fabriqué garde l'effet de chacun de ses ingrédients, derrière l'œil comme
  le reste de son effet.
- Pour les extensions : API 5 (`eraser.inventory.effectShown`, `showEffects`).
