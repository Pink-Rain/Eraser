# Eraser 0.1.1-alpha.134 — Correctif des listes de la fiche

Cette version arrive par la mise à jour sans réinstallation. Elle corrige la 133.

- **Une classe comme « Sorcier·ère » ou « Guerrier·e » reste entière** : seul un « · »
  entouré d'espaces sépare deux valeurs. La 133 la coupait en deux sur la fiche.
- Une case de liste vide écrite à l'ancienne (`[]`) ne s'affiche plus.
- Le sous-titre d'un personnage (sous son nom dans les listes, le journal de relations, la
  campagne…) n'est plus jamais recopié en JSON : il est écrit en clair à chaque
  enregistrement de la fiche et à chaque relecture de la feuille.
