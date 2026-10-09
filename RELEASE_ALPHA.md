# Eraser 0.1.1-alpha.169 — Les états des formes se jouent

Cette version arrive par la mise à jour sans réinstallation.

## États posés par une forme : niveaux et redéclenchement

Un état posé par une forme (mention **Auto**) se joue maintenant comme un état posé à la
main :

- Ses boutons de niveau restent : passer au niveau 2 déclenche les effets de ce niveau,
  recliquer le niveau en cours les redéclenche.
- Les boutons de dés de ses effets restent aussi.
- Seul « retirer » est absent : c'est la forme qui le pose et l'enlève.
- Le niveau choisi et ce que ses effets écrivent dans la fiche sont rangés avec la forme.
  En changeant de forme, ces écritures sont défaites (sauf les effets dont « Retiré en
  sortant de l'état » est décoché, comme les dégâts sur les points de vie actuels). Si la
  nouvelle forme pose le même état, il garde son niveau et ses écritures.

Coma et Mort, posés d'après la vie, n'ont qu'un niveau et rien à redéclencher : ils restent
sans boutons.
