# Eraser 0.1.1-alpha.268 — Modifier sans attendre

Cette version arrive **sans réinstallation** (enveloppe 10, comme l'alpha 267) : Eraser la
télécharge, redémarre son serveur et recharge la page tout seul. Rien ne change dans Google Sheets.

- **« Modifier » enregistre deux fois plus vite** : changer le réglage d'une colonne (type,
  remplissage automatique, description…) demandait 14 allers-retours à Google, dont deux
  relectures complètes de l'onglet ; il en faut maintenant 7, et aucune relecture de tout l'onglet.
  Sur l'Index des items, l'enregistrement mesuré à 29 s tombe bien en dessous.
- Après un simple réglage, l'index n'est plus relu en entier : ses lignes, déjà là, reçoivent les
  nouvelles colonnes aussitôt. Ajouter, renommer ou déplacer une colonne relit l'index comme avant.
- Plusieurs colonnes modifiées dans le même onglet ne relisent sa ligne d'en-têtes qu'une fois.
- Au lancement, la préparation du salon en direct est découpée en deux temps morts au lieu d'un
  seul gel d'environ une seconde.
