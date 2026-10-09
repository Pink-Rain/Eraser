# Eraser 0.1.1-alpha.177 — Des sorts et des bonus de rang, même sans classe

Cette version arrive par la mise à jour sans réinstallation.

## Un personnage sans classe garde ses capacités

- L'onglet **Sorts** ne se bloque plus sur « Choisis une classe… ». Sans classe, on ajoute
  ses capacités avec **+** : tout l'index des sorts est proposé, avec la recherche par nom,
  type ou compétence.
- Un petit mot rappelle qu'une classe se choisit dans l'identité du personnage, et qu'en
  attendant chaque niveau gagné apporte quand même ses bonus de rang.

## Les bonus de rang, même sans classe et même quand Google est saturé

- Monter de niveau sans classe ouvre la fenêtre **Bonus de rang**, rang par rang, comme
  pour un personnage avec classe. L'emplacement brillant de l'onglet Sorts la rouvre si
  elle a été fermée avec « Plus tard ».
- Les bonus de rang sont désormais gardés aussi sur le serveur partagé d'Eraser, comme les
  classes : quand Google refuse de les lire, la fiche prend cette copie au lieu de ne rien
  proposer. Cette copie ne sert jamais à modifier le tableau des bonus.
- S'ils n'ont pas pu être lus du tout, la fiche les redemande d'elle-même, trois fois,
  espacées.

## Un démarrage plus léger

- Le chat « Général » lisait tout son historique dans Google Sheets dès l'ouverture
  d'Eraser, en même temps que la première page. Il attend désormais que la page soit
  chargée, ou qu'on ouvre le chat : la page affichée passe en premier.
